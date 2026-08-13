import { commandExists, runCommand, type CommandRunner } from "./command";

export interface EntityResolution {
  kind: "person" | "company" | "topic";
  githubAccountType?: "user" | "organization";
  githubLogin?: string;
  xHandle?: string;
  confidence: number;
}

export async function resolveEntity(topic: string, runner: CommandRunner = runCommand): Promise<EntityResolution> {
  const explicitX = topic.match(/@([A-Za-z0-9_]{1,15})\b/)?.[1];
  const explicitGithub = topic.match(/github\.com\/([A-Za-z0-9-]+)/i)?.[1];
  if (explicitX && !explicitGithub) return { kind: "person", xHandle: explicitX, confidence: 1 };
  if (!commandExists("gh") || topic.split(/\s+/).length > 5) {
    return explicitGithub ? { kind: "person", githubAccountType: "user", githubLogin: explicitGithub, confidence: 0.6 } : { kind: "topic", confidence: 0 };
  }
  const query = `query($q:String!){search(query:$q,type:USER,first:5){nodes{__typename ... on User{login name bio url}... on Organization{login name description url}}}}`;
  const result = await runner(["gh", "api", "graphql", "-f", `query=${query}`, "-f", `q=${explicitGithub || topic}`], { timeoutMs: 15_000 });
  if (result.exitCode !== 0) return { kind: "topic", confidence: 0 };
  try {
    const payload = JSON.parse(result.stdout) as { data?: { search?: { nodes?: Array<{ __typename?: string; login?: string; name?: string; bio?: string; description?: string }> } } };
    const normalizedTopic = topic.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const nodes = payload.data?.search?.nodes ?? [];
    const match = nodes.find((node) => {
      const login = (node.login ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
      const name = (node.name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
      return login === normalizedTopic || name === normalizedTopic;
    });
    if (!match?.login) return { kind: "topic", confidence: 0 };
    let xHandle: string | undefined;
    const accountType = match.__typename === "Organization" ? "organization" : "user";
    const profile = await runner(["gh", "api", `${accountType === "organization" ? "orgs" : "users"}/${match.login}`], { timeoutMs: 10_000 });
    if (profile.exitCode === 0) {
      try {
        const details = JSON.parse(profile.stdout) as { twitter_username?: unknown };
        const candidate = String(details.twitter_username ?? "").replace(/^@/, "").trim();
        if (/^[A-Za-z0-9_]{1,15}$/.test(candidate)) xHandle = candidate;
      } catch { /* GitHub identity remains useful without an X handle */ }
    }
    return {
      kind: accountType === "organization" ? "company" : "person",
      githubAccountType: accountType,
      githubLogin: match.login,
      ...(xHandle ? { xHandle } : {}),
      confidence: 0.8,
    };
  } catch {
    return { kind: "topic", confidence: 0 };
  }
}
