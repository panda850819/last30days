import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const cli = join(root, "skills", "last30days", "src", "cli.ts");
const paths: string[] = [];

afterEach(async () => {
  await Promise.all(paths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("CLI end to end", () => {
  test("setup records explicit consent without installing or reading cookies", async () => {
    const directory = await mkdtemp(join(tmpdir(), "last30days-e2e-"));
    paths.push(directory);
    const config = join(directory, "config.json");
    const processHandle = Bun.spawn(["bun", cli, "setup", "--allow-browser-cookies"], {
      env: { ...process.env, LAST30DAYS_CONFIG_PATH: config },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, exitCode] = await Promise.all([new Response(processHandle.stdout).text(), processHandle.exited]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("No tools were installed and no browser cookies were read");
    expect(JSON.parse(await Bun.file(config).text()).allowBrowserCookies).toBe(true);
  });

  test("lists and installs the bundled Skill links", async () => {
    const directory = await mkdtemp(join(tmpdir(), "last30days-e2e-"));
    paths.push(directory);
    const env = { ...process.env, HOME: directory };
    const listed = Bun.spawn(["bun", cli, "skill", "list"], { env, stdout: "pipe", stderr: "pipe" });
    expect(await new Response(listed.stdout).text()).toContain("agents missing");
    expect(await listed.exited).toBe(0);
    const installed = Bun.spawn(["bun", cli, "skill", "install", "--pi"], { env, stdout: "pipe", stderr: "pipe" });
    expect(await new Response(installed.stdout).text()).toContain("pi     linked");
    expect(await installed.exited).toBe(0);
  });

  test("emits stable JSON and unavailable source states", async () => {
    const processHandle = Bun.spawn(["bun", cli, "Bun", "--search", "arxiv,techmeme", "--json"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, exitCode] = await Promise.all([new Response(processHandle.stdout).text(), processHandle.exited]);
    const report = JSON.parse(stdout);
    expect(exitCode).toBe(4);
    expect(report.schemaVersion).toBe(1);
    expect(report.sources.map((source: { status: string }) => source.status)).toEqual(["unavailable", "unavailable"]);
  });
});
