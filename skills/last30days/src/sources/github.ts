import { commandExists, runCommand, type CommandRunner } from "../core/command";
import type { Source, SourceAvailability, SourceItem, SourceRequest, SourceResult } from "../core/types";
import { numberValue, statusFromExit, unavailable } from "./helpers";

interface GhIssue {
  id?: unknown;
  title?: unknown;
  url?: unknown;
  body?: unknown;
  author?: { login?: unknown };
  repository?: { nameWithOwner?: unknown };
  createdAt?: unknown;
  updatedAt?: unknown;
  commentsCount?: unknown;
  isPullRequest?: unknown;
}

interface GhEvent {
  id?: unknown;
  type?: unknown;
  created_at?: unknown;
  actor?: { login?: unknown };
  repo?: { name?: unknown };
  payload?: { action?: unknown; ref?: unknown; ref_type?: unknown };
}

interface GhRepo {
  id?: unknown;
  fullName?: unknown;
  description?: unknown;
  url?: unknown;
  owner?: { login?: unknown };
  updatedAt?: unknown;
  pushedAt?: unknown;
  stargazersCount?: unknown;
  forksCount?: unknown;
  openIssuesCount?: unknown;
}

export function parseGitHubResults(issues: GhIssue[], repos: GhRepo[]): SourceItem[] {
  const issueItems = issues.flatMap((issue): SourceItem[] => {
    const id = String(issue.id ?? "").trim();
    const title = String(issue.title ?? "").trim();
    const url = String(issue.url ?? "").trim();
    if (!id || !title || !url) return [];
    return [{
      id,
      source: "github",
      title,
      url,
      publishedAt: String(issue.updatedAt || issue.createdAt || "").slice(0, 10),
      author: String(issue.author?.login ?? ""),
      snippet: String(issue.body ?? "").replace(/\s+/g, " ").slice(0, 500),
      engagement: { comments: numberValue(issue.commentsCount) },
      metadata: { repository: issue.repository?.nameWithOwner, kind: issue.isPullRequest ? "pull-request" : "issue" },
    }];
  });
  const repoItems = repos.flatMap((repo): SourceItem[] => {
    const id = String(repo.id ?? "").trim();
    const title = String(repo.fullName ?? "").trim();
    const url = String(repo.url ?? "").trim();
    if (!id || !title || !url) return [];
    return [{
      id,
      source: "github",
      title,
      url,
      publishedAt: String(repo.pushedAt || repo.updatedAt || "").slice(0, 10),
      author: String(repo.owner?.login ?? ""),
      snippet: String(repo.description ?? "").slice(0, 500),
      engagement: {
        stars: numberValue(repo.stargazersCount),
        forks: numberValue(repo.forksCount),
        openIssues: numberValue(repo.openIssuesCount),
      },
      metadata: { kind: "repository" },
    }];
  });
  return [...issueItems, ...repoItems];
}

export function parseGitHubEvents(events: GhEvent[], login: string, accountType: "user" | "organization" = "user"): SourceItem[] {
  return events.flatMap((event): SourceItem[] => {
    const id = String(event.id ?? "").trim();
    const repo = String(event.repo?.name ?? "").trim();
    const type = String(event.type ?? "").trim();
    if (!id || !repo || !type) return [];
    const action = String(event.payload?.action || event.payload?.ref_type || "activity");
    const actor = String(event.actor?.login ?? login).trim() || login;
    const organizationActivity = accountType === "organization";
    return [{
      id,
      source: "github",
      title: `${type.replace(/Event$/, "")} ${action} in ${repo}`,
      url: `https://github.com/${repo}`,
      publishedAt: String(event.created_at ?? "").slice(0, 10),
      author: actor,
      snippet: `${actor} ${action} ${String(event.payload?.ref ?? "")} in ${repo}`.replace(/\s+/g, " ").trim(),
      engagement: {},
      metadata: organizationActivity
        ? { kind: "organization-repository-activity", lane: "organization-activity", organization: login, repository: repo }
        : { kind: "first-party-event", lane: "first-party", repository: repo },
    }];
  });
}

export class GitHubSource implements Source {
  readonly name = "github";
  constructor(private readonly runner: CommandRunner = runCommand) {}
  async availability(): Promise<SourceAvailability> {
    if (!commandExists("gh")) return { available: false, backend: "gh", detail: "gh is not on PATH" };
    const result = await this.runner(["gh", "auth", "status"], { timeoutMs: 5_000 });
    return { available: result.exitCode === 0, authenticated: result.exitCode === 0, backend: "gh", ...(result.exitCode === 0 ? {} : { detail: result.stderr || "gh is not authenticated" }) };
  }
  async search(request: SourceRequest): Promise<SourceResult> {
    if (!commandExists("gh")) return unavailable(this.name, "gh", "gh is not on PATH");
    const count = Math.max(1, Math.floor(request.limit / 2));
    const [issueResult, repoResult, eventResult] = await Promise.all([
      this.runner(["gh", "search", "issues", request.topic, "--include-prs", "--updated", `${request.window.from}..${request.window.to}`, "--visibility", "public", "--sort", "updated", "--limit", String(count), "--json", "id,title,url,body,author,repository,createdAt,updatedAt,commentsCount,isPullRequest"], { timeoutMs: 30_000, signal: request.signal }),
      this.runner(["gh", "search", "repos", request.topic, "--updated", `${request.window.from}..${request.window.to}`, "--visibility", "public", "--sort", "updated", "--limit", String(count), "--json", "id,fullName,description,url,owner,updatedAt,pushedAt,stargazersCount,forksCount,openIssuesCount"], { timeoutMs: 30_000, signal: request.signal }),
      request.entity?.githubLogin
        ? this.runner(["gh", "api", request.entity.githubAccountType === "organization"
          ? `orgs/${request.entity.githubLogin}/events?per_page=${Math.min(100, request.limit)}`
          : `users/${request.entity.githubLogin}/events/public?per_page=${Math.min(100, request.limit)}`], { timeoutMs: 30_000, signal: request.signal })
        : Promise.resolve({ command: [], exitCode: 0, stdout: "[]", stderr: "", timedOut: false }),
    ]);
    const failed = [issueResult, repoResult, ...(request.entity?.githubLogin ? [eventResult] : [])].filter((result) => result.exitCode !== 0);
    let issues: GhIssue[] = [];
    let repos: GhRepo[] = [];
    let events: GhEvent[] = [];
    let parseFailures = 0;
    try { if (issueResult.stdout) issues = JSON.parse(issueResult.stdout) as GhIssue[]; } catch { parseFailures += 1; }
    try { if (repoResult.stdout) repos = JSON.parse(repoResult.stdout) as GhRepo[]; } catch { parseFailures += 1; }
    try { if (eventResult.stdout) events = JSON.parse(eventResult.stdout) as GhEvent[]; } catch { parseFailures += 1; }
    const firstParty = request.entity?.githubLogin
      ? parseGitHubEvents(events, request.entity.githubLogin, request.entity.githubAccountType).filter((item) => !item.publishedAt || (item.publishedAt >= request.window.from && item.publishedAt <= request.window.to))
      : [];
    const items = [...firstParty, ...parseGitHubResults(issues, repos)].slice(0, request.limit);
    const expectedCalls = request.entity?.githubLogin ? 3 : 2;
    if (failed.length === expectedCalls) {
      const error = failed.map((result) => result.stderr).filter(Boolean).join("; ") || "gh search failed";
      return { source: this.name, backend: "gh", status: statusFromExit(failed[0]!.exitCode, error), items: [], error };
    }
    return {
      source: this.name,
      backend: "gh",
      status: failed.length || parseFailures ? "partial" : items.length ? "ok" : "no-results",
      items,
      ...(failed.length || parseFailures ? { error: [...failed.map((result) => result.stderr).filter(Boolean), ...(parseFailures ? [`${parseFailures} gh lane(s) returned invalid JSON`] : [])].join("; ") } : {}),
    };
  }
}
