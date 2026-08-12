import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, saveConfig } from "../skills/last30days/src/config";
import { runDoctor } from "../skills/last30days/src/doctor";

const paths: string[] = [];
afterEach(async () => {
  await Promise.all(paths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("setup config and doctor", () => {
  test("persists only consent policy with private permissions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "last30days-test-"));
    paths.push(directory);
    const path = join(directory, "bun.json");
    await saveConfig({ schemaVersion: 1, allowBrowserCookies: true, allowPaidXFallback: false }, path);
    expect(await loadConfig(path)).toEqual({ schemaVersion: 1, allowBrowserCookies: true, allowPaidXFallback: false });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  test("doctor reports policy without reading browser cookies", async () => {
    const report = await runDoctor({ schemaVersion: 1, allowBrowserCookies: false, allowPaidXFallback: false });
    expect(report.policy.browserCookiesApproved).toBe(false);
    expect(report.sources.find((source) => source.source === "x")?.state).toBe("unavailable");
    expect(report.sources.find((source) => source.backend === "summarize")?.state).toBe("unavailable");
  });
});
