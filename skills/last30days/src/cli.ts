#!/usr/bin/env bun

import { HELP } from "./cli/help";
import { parseArgs } from "./cli/parse";
import { configPath, loadConfig, saveConfig } from "./config";
import { runResearch } from "./core/pipeline";
import { renderJson, renderMarkdown } from "./core/render";
import { renderDoctor, runDoctor } from "./doctor";
import { installSkillLinks, listSkillLinks, renderSkillLinks } from "./skill-links";
import { defaultSources } from "./sources";

async function main(): Promise<number> {
  const command = parseArgs(Bun.argv.slice(2));
  if (command.kind === "help") {
    process.stdout.write(HELP);
    return 0;
  }
  if (command.kind === "skill-list") {
    process.stdout.write(`${renderSkillLinks(await listSkillLinks(command.hosts))}\n`);
    return 0;
  }
  if (command.kind === "skill-install") {
    process.stdout.write(`${renderSkillLinks(await installSkillLinks(command.hosts))}\n`);
    return 0;
  }
  const config = await loadConfig();
  if (command.kind === "doctor") {
    const report = await runDoctor(config);
    process.stdout.write(command.json ? `${JSON.stringify(report, null, 2)}\n` : `${renderDoctor(report)}\n`);
    return 0;
  }
  if (command.kind === "setup") {
    const next = {
      ...config,
      allowBrowserCookies: command.allowBrowserCookies,
      allowPaidXFallback: command.allowPaidXFallback,
    };
    await saveConfig(next);
    process.stdout.write([
      `Saved ${configPath()}`,
      `Browser-cookie access: ${next.allowBrowserCookies ? "approved" : "disabled"}`,
      `Paid X fallback: ${next.allowPaidXFallback ? "approved" : "disabled"}`,
      "No tools were installed and no browser cookies were read.",
    ].join("\n") + "\n");
    return 0;
  }

  const report = await runResearch(command.options, defaultSources(config));
  const output = command.options.emit === "json" ? renderJson(report) : renderMarkdown(report);
  process.stdout.write(`${output}\n`);
  return report.items.length > 0 || report.sources.some((source) => source.status === "ok" || source.status === "partial") ? 0 : 4;
}

try {
  process.exitCode = await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`last30days: ${message}\n`);
  process.exitCode = 2;
}
