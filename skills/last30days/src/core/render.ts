import type { ResearchReport } from "./types";

function inline(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/<[^>]*>/g, "").replace(/([\\`*_[\]{}()#+.!|>-])/g, "\\$1").replace(/\s+/g, " ").trim();
}

function publicUrl(raw: string): string | undefined {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function renderJson(report: ResearchReport): string {
  return JSON.stringify(report, null, 2);
}

export function renderMarkdown(report: ResearchReport): string {
  const sourceSummary = report.sources
    .map((source) => `${source.source}: ${source.status} (${source.items.length})`)
    .join(" · ");
  const lines = [
    `🌐 last30days · ${report.window.from} to ${report.window.to}`,
    "",
    `What I learned about ${report.topics.join(" vs ")}:`,
    "",
  ];
  if (report.items.length === 0) {
    lines.push("Nothing solid was found in this window.");
  } else {
    let activeTopic: string | undefined;
    for (const item of report.items) {
      const topic = typeof item.metadata?.researchTopic === "string" ? item.metadata.researchTopic : undefined;
      if (report.mode === "comparison" && topic !== activeTopic) {
        activeTopic = topic;
        lines.push(`### ${inline(topic || "Unattributed")}`, "");
      }
      const metric = Object.entries(item.engagement)
        .filter((entry): entry is [string, number] => typeof entry[1] === "number")
        .map(([key, value]) => `${value.toLocaleString()} ${key}`)
        .join(", ");
      lines.push(`- **${inline(item.title)}** - ${inline(item.source)}${metric ? ` · ${metric}` : ""}`);
      if (item.snippet || item.body) lines.push(`  ${inline((item.snippet || item.body || "").slice(0, 500))}`);
      const url = publicUrl(item.url);
      if (url) lines.push(`  ${url}`);
    }
  }
  lines.push("", `Sources: ${sourceSummary || "none"}`);
  if (report.mode === "comparison") {
    for (const source of report.sources) {
      if (!source.topicStatuses) continue;
      lines.push(`${source.source} by topic: ${Object.entries(source.topicStatuses).map(([topic, status]) => `${topic}=${status}`).join(", ")}`);
    }
  }
  return lines.join("\n");
}
