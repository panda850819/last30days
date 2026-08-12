import { lstat, mkdir, readlink, realpath, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

export type SkillHost = "agents" | "pi";

export interface SkillLink {
  host: SkillHost;
  path: string;
  status: "linked" | "missing" | "occupied";
  target?: string;
}

const HOST_DIRS: Record<SkillHost, string[]> = {
  agents: [".agents", "skills"],
  pi: [".pi", "agent", "skills"],
};

export const SKILL_HOSTS: SkillHost[] = ["agents", "pi"];

export function bundledSkillDir(): string {
  return resolve(import.meta.dir, "..");
}

export function skillLinkPath(host: SkillHost, home = homedir()): string {
  return join(home, ...HOST_DIRS[host], "last30days");
}

async function inspectLink(host: SkillHost, source: string, home?: string): Promise<SkillLink> {
  const path = skillLinkPath(host, home);
  try {
    const stat = await lstat(path);
    if (!stat.isSymbolicLink()) return { host, path, status: "occupied" };
    const rawTarget = await readlink(path);
    const target = resolve(dirname(path), rawTarget);
    let matches = target === source;
    try { matches = await realpath(target) === await realpath(source); } catch { /* broken or unavailable target */ }
    return { host, path, status: matches ? "linked" : "occupied", target };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { host, path, status: "missing" };
    throw error;
  }
}

export async function listSkillLinks(hosts = SKILL_HOSTS, home?: string): Promise<SkillLink[]> {
  const source = bundledSkillDir();
  return Promise.all(hosts.map((host) => inspectLink(host, source, home)));
}

export async function installSkillLinks(hosts = SKILL_HOSTS, home?: string): Promise<SkillLink[]> {
  const source = bundledSkillDir();
  const current = await Promise.all(hosts.map((host) => inspectLink(host, source, home)));
  const occupied = current.find((link) => link.status === "occupied");
  if (occupied) throw new Error(`${occupied.path} already exists and is not a link to this package`);
  await Promise.all(current.filter((link) => link.status === "missing").map(async (link) => {
    await mkdir(dirname(link.path), { recursive: true });
    await symlink(relative(dirname(link.path), source), link.path, "dir");
  }));
  return listSkillLinks(hosts, home);
}

export function renderSkillLinks(links: SkillLink[]): string {
  return links.map((link) => `${link.host.padEnd(6)} ${link.status.padEnd(8)} ${link.path}${link.target ? ` -> ${link.target}` : ""}`).join("\n");
}
