import { describe, expect, test } from "bun:test";
import { runCommand } from "../skills/last30days/src/core/command";
import { publicHttpUrl } from "../skills/last30days/src/core/network";
import { SummarizeReader } from "../skills/last30days/src/readers/summarize";
import { runResearch } from "../skills/last30days/src/core/pipeline";
import { createDateWindow } from "../skills/last30days/src/core/window";
import { parseArgs } from "../skills/last30days/src/cli/parse";
import type { Source } from "../skills/last30days/src/core/types";

const isRunning = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    const status = Bun.spawnSync(["ps", "-o", "stat=", "-p", String(pid)], { stdout: "pipe", stderr: "ignore" }).stdout.toString().trim();
    return Boolean(status) && !status.startsWith("Z");
  } catch { return false; }
};

describe("safety and data integrity", () => {
  test("subprocess timeout kills descendants and reports timeout", async () => {
    const started = performance.now();
    const result = await runCommand(["bash", "-c", "sleep 5 & child=$!; echo $child; wait"], { timeoutMs: 100 });
    const elapsed = performance.now() - started;
    const childPid = Number(result.stdout.trim());
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBe(124);
    expect(elapsed).toBeLessThan(1_000);
    await Bun.sleep(50);
    expect(isRunning(childPid)).toBe(false);
  });

  test("rejects local and private extraction targets", () => {
    for (const raw of ["file:///etc/passwd", "http://localhost:3000", "http://127.0.0.1", "http://10.0.0.1", "http://192.168.1.2", "http://[::1]", "http://[::ffff:127.0.0.1]", "http://[::ffff:7f00:1]", "http://[::ffff:169.254.169.254]"]) {
      expect(publicHttpUrl(raw)).toBeUndefined();
    }
    expect(publicHttpUrl("https://example.com/article")?.hostname).toBe("example.com");
  });

  test("keeps summarize URL fetching disabled until redirects are enforceable", async () => {
    const reader = new SummarizeReader(async () => ({
      command: ["summarize"],
      exitCode: 0,
      stdout: JSON.stringify({ extracted: { url: "http://127.0.0.1/admin", title: "redirect", content: "private" } }),
      stderr: "",
      timedOut: false,
    }));
    const page = await reader.read("https://example.com/article");
    expect(page.ok).toBe(false);
    expect(page.error).toContain("not on PATH");
  });

  test("rejects unsupported source names", () => {
    expect(() => parseArgs(["Bun", "--search", "web,unknown"])).toThrow("Unsupported source: unknown");
  });

  test("centrally removes out-of-window source items", async () => {
    const source: Source = {
      name: "fixture",
      async availability() { return { available: true, backend: "fixture" }; },
      async search() {
        return {
          source: "fixture",
          backend: "fixture",
          status: "ok" as const,
          items: [{ id: "old", source: "fixture", title: "old", url: "https://example.com/old", publishedAt: "2026-01-01", engagement: {} }],
        };
      },
    };
    const report = await runResearch({
      mode: "research",
      topics: ["old"],
      window: createDateWindow(7, "2026-08-12"),
      depth: "quick",
      emit: "json",
      sources: ["fixture"],
      limit: 5,
    }, [source]);
    expect(report.items).toEqual([]);
    expect(report.sources[0]?.status).toBe("no-results");
  });

  test("historical windows reject undated evidence", async () => {
    const source: Source = {
      name: "fixture",
      async availability() { return { available: true, backend: "fixture" }; },
      async search() {
        return {
          source: "fixture",
          backend: "fixture",
          status: "ok" as const,
          items: [{ id: "undated", source: "fixture", title: "Bun history", url: "https://example.com/undated", engagement: {} }],
        };
      },
    };
    const report = await runResearch({
      mode: "research",
      topics: ["Bun"],
      window: createDateWindow(30, "2025-12-31"),
      depth: "quick",
      emit: "json",
      sources: ["fixture"],
      limit: 5,
    }, [source]);
    expect(report.items).toEqual([]);
  });
});
