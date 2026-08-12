import { createDateWindow } from "../core/window";
import type { Depth, OutputFormat, ResearchMode, ResearchOptions } from "../core/types";
import type { SkillHost } from "../skill-links";

const SOURCE_ALIASES: Record<string, string> = {
  hn: "hackernews",
  twitter: "x",
};
const SUPPORTED_SOURCES = new Set([
  "x", "reddit", "youtube", "hackernews", "github", "polymarket", "web", "arxiv", "techmeme", "stocktwits",
]);

export type Command =
  | { kind: "help" }
  | { kind: "doctor"; json: boolean }
  | { kind: "setup"; allowBrowserCookies: boolean; allowPaidXFallback: boolean }
  | { kind: "skill-list"; hosts: SkillHost[] }
  | { kind: "skill-install"; hosts: SkillHost[] }
  | { kind: "research"; options: ResearchOptions };

function valueAfter(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArgs(argv: string[]): Command {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) return { kind: "help" };

  const first = argv[0];
  if (first === "doctor") return { kind: "doctor", json: argv.includes("--json") };
  if (first === "setup") {
    const supported = new Set(["setup", "--allow-browser-cookies", "--allow-paid-x-fallback"]);
    const unsupported = argv.find((arg) => !supported.has(arg));
    if (unsupported) throw new Error(`Unsupported setup option: ${unsupported}`);
    return {
      kind: "setup",
      allowBrowserCookies: argv.includes("--allow-browser-cookies"),
      allowPaidXFallback: argv.includes("--allow-paid-x-fallback"),
    };
  }
  if (first === "skill") {
    const action = argv[1];
    if (action !== "list" && action !== "install") throw new Error("skill requires list or install");
    const supported = new Set(["skill", action, "--agents", "--pi"]);
    const unsupported = argv.find((arg) => !supported.has(arg));
    if (unsupported) throw new Error(`Unsupported skill option: ${unsupported}`);
    const hosts: SkillHost[] = [
      ...(argv.includes("--agents") ? ["agents" as const] : []),
      ...(argv.includes("--pi") ? ["pi" as const] : []),
    ];
    return {
      kind: action === "list" ? "skill-list" : "skill-install",
      hosts: hosts.length > 0 ? hosts : ["agents", "pi"],
    };
  }

  let mode: ResearchMode = "research";
  let depth: Depth = "default";
  let emit: OutputFormat = "md";
  let days = 30;
  let asOf: string | undefined;
  let limit = 50;
  let sources: string[] | undefined;
  const topicParts: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--discover") {
      mode = "discover";
      continue;
    }
    if (arg === "--quick") {
      depth = "quick";
      continue;
    }
    if (arg === "--deep") {
      depth = "deep";
      continue;
    }
    if (arg === "--json") {
      emit = "json";
      continue;
    }
    if (arg === "--emit") {
      const value = valueAfter(argv, i, arg);
      if (value !== "json" && value !== "md") throw new Error("--emit must be json or md");
      emit = value;
      i += 1;
      continue;
    }
    if (arg === "--days") {
      days = Number(valueAfter(argv, i, arg));
      i += 1;
      continue;
    }
    if (arg === "--as-of") {
      asOf = valueAfter(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === "--limit") {
      limit = Number(valueAfter(argv, i, arg));
      if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
        throw new Error("--limit must be an integer between 1 and 500");
      }
      i += 1;
      continue;
    }
    if (arg === "--search") {
      sources = valueAfter(argv, i, arg).split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
        .map((value) => SOURCE_ALIASES[value] ?? value);
      const unsupported = sources.find((source) => !SUPPORTED_SOURCES.has(source));
      if (unsupported) throw new Error(`Unsupported source: ${unsupported}`);
      i += 1;
      continue;
    }
    if (arg.startsWith("--")) throw new Error(`Unsupported option: ${arg}`);
    topicParts.push(arg);
  }

  const topic = topicParts.join(" ").trim();
  if (mode !== "discover" && !topic) throw new Error("A research topic is required");
  if (/\b(?:vs\.?|versus)\b/i.test(topic) && mode !== "discover") mode = "comparison";

  const topics = mode === "comparison"
    ? topic.split(/\s+(?:vs\.?|versus)\s+/i).map((value) => value.trim()).filter(Boolean)
    : [topic || "trending"];

  return {
    kind: "research",
    options: {
      mode,
      topics,
      window: createDateWindow(days, asOf),
      depth,
      emit,
      ...(sources ? { sources } : {}),
      limit,
    },
  };
}
