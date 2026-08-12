import { describe, expect, test } from "bun:test";
import { parseArgs } from "../skills/last30days/src/cli/parse";

const research = (argv: string[]) => {
  const command = parseArgs(argv);
  if (command.kind !== "research") throw new Error(`Expected research, got ${command.kind}`);
  return command.options;
};

describe("CLI parsing", () => {
  test("parses a topic and defaults", () => {
    const options = research(["AI agents"]);
    expect(options.topics).toEqual(["AI agents"]);
    expect(options.mode).toBe("research");
    expect(options.depth).toBe("default");
    expect(options.emit).toBe("md");
    expect(options.window.days).toBe(30);
  });

  test("parses comparisons", () => {
    const options = research(["Codex", "vs", "Claude Code", "--json"]);
    expect(options.mode).toBe("comparison");
    expect(options.topics).toEqual(["Codex", "Claude Code"]);
    expect(options.emit).toBe("json");
  });

  test("parses discovery and source selection", () => {
    const options = research(["--discover", "AI agents", "--search", "x,reddit", "--quick"]);
    expect(options.mode).toBe("discover");
    expect(options.sources).toEqual(["x", "reddit"]);
    expect(options.depth).toBe("quick");
    expect(research(["--discover", "Bun vs Node"]).mode).toBe("discover");
  });

  test("parses explicit setup consent", () => {
    expect(parseArgs(["setup", "--allow-browser-cookies", "--allow-paid-x-fallback"])).toEqual({
      kind: "setup",
      allowBrowserCookies: true,
      allowPaidXFallback: true,
    });
  });

  test("parses Skill link commands", () => {
    expect(parseArgs(["skill", "list"])).toEqual({ kind: "skill-list", hosts: ["agents", "pi"] });
    expect(parseArgs(["skill", "install", "--pi"])).toEqual({ kind: "skill-install", hosts: ["pi"] });
  });

  test("rejects unsupported flags", () => {
    expect(() => parseArgs(["AI", "--legacy"])).toThrow("Unsupported option");
    expect(() => parseArgs(["setup", "--install-everything"])).toThrow("Unsupported setup option");
    expect(() => parseArgs(["skill", "remove"])).toThrow("skill requires list or install");
  });
});
