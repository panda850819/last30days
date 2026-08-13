import { chmod, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export interface Last30DaysConfig {
  schemaVersion: 1;
  allowBrowserCookies: boolean;
  allowPaidXFallback: boolean;
}

export const DEFAULT_CONFIG: Last30DaysConfig = {
  schemaVersion: 1,
  allowBrowserCookies: false,
  allowPaidXFallback: false,
};

export function configPath(): string {
  return process.env.LAST30DAYS_CONFIG_PATH || join(homedir(), ".config", "last30days", "bun.json");
}

export async function loadConfig(path = configPath()): Promise<Last30DaysConfig> {
  try {
    const parsed = JSON.parse(await Bun.file(path).text()) as Partial<Last30DaysConfig>;
    return {
      schemaVersion: 1,
      allowBrowserCookies: parsed.allowBrowserCookies === true,
      allowPaidXFallback: parsed.allowPaidXFallback === true,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(config: Last30DaysConfig, path = configPath()): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, `${JSON.stringify(config, null, 2)}\n`);
  await chmod(path, 0o600);
}
