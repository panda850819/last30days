import { afterEach, describe, expect, test } from "bun:test";
import { lstat, mkdtemp, mkdir, readlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installSkillLinks, listSkillLinks, skillLinkPath } from "../skills/last30days/src/skill-links";

const paths: string[] = [];

afterEach(async () => {
  await Promise.all(paths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("Skill links", () => {
  test("lists missing hosts without writing", async () => {
    const home = await mkdtemp(join(tmpdir(), "last30days-links-"));
    paths.push(home);
    expect(await listSkillLinks(["agents", "pi"], home)).toEqual([
      { host: "agents", path: skillLinkPath("agents", home), status: "missing" },
      { host: "pi", path: skillLinkPath("pi", home), status: "missing" },
    ]);
  });

  test("installs idempotent relative links for selected hosts", async () => {
    const home = await mkdtemp(join(tmpdir(), "last30days-links-"));
    paths.push(home);
    const installed = await installSkillLinks(["agents"], home);
    expect(installed[0]?.status).toBe("linked");
    expect((await lstat(skillLinkPath("agents", home))).isSymbolicLink()).toBe(true);
    expect(await readlink(skillLinkPath("agents", home))).not.toStartWith("/");
    expect((await installSkillLinks(["agents"], home))[0]?.status).toBe("linked");
  });

  test("does not replace an occupied path", async () => {
    const home = await mkdtemp(join(tmpdir(), "last30days-links-"));
    paths.push(home);
    const path = skillLinkPath("pi", home);
    await mkdir(path, { recursive: true });
    await writeFile(join(path, "keep.txt"), "keep");
    await expect(installSkillLinks(["pi"], home)).rejects.toThrow("already exists");
    expect(await Bun.file(join(path, "keep.txt")).text()).toBe("keep");
  });

  test("preflights all hosts before creating any link", async () => {
    const home = await mkdtemp(join(tmpdir(), "last30days-links-"));
    paths.push(home);
    const occupied = skillLinkPath("pi", home);
    await mkdir(occupied, { recursive: true });
    await expect(installSkillLinks(["agents", "pi"], home)).rejects.toThrow("already exists");
    expect((await listSkillLinks(["agents"], home))[0]?.status).toBe("missing");
  });
});
