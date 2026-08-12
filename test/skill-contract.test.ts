import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const skillPath = join(root, "skills", "last30days", "SKILL.md");
const cliPath = join(root, "skills", "last30days", "src", "cli.ts");
const readmePath = join(root, "README.md");

describe("Skill contract", () => {
  test("ships the Bun entrypoint inside the installable Skill", async () => {
    expect(await Bun.file(cliPath).exists()).toBe(true);
    const skill = await Bun.file(skillPath).text();
    expect(skill).toContain('bun "$SKILL_DIR/src/cli.ts"');
    expect(skill).not.toContain("LAST30DAYS_MEMORY_DIR");
  });

  test("documents package-managed Skill links", async () => {
    const skill = await Bun.file(skillPath).text();
    expect(skill).toContain("last30days skill list");
    expect(skill).toContain("last30days skill install");
    expect(skill).toContain("never replaces an existing");
  });

  test("documents supported workflows and source policy", async () => {
    const skill = await Bun.file(skillPath).text();
    for (const term of ["Comparison", "Discovery", "Historical window", "doctor", "setup", "xbird", "summarize", "Polymarket"]) {
      expect(skill).toContain(term);
    }
    expect(skill).toContain("Browser-cookie access requires recorded consent");
    expect(skill).toContain("The engine only reads public market data");
  });

  test("documents focused Bun configuration", async () => {
    const configuration = await Bun.file(join(root, "CONFIGURATION.md")).text();
    for (const term of ["LAST30DAYS_CONFIG_PATH", "allowBrowserCookies", "last30days doctor", "last30days skill install", "Historical limits"]) {
      expect(configuration).toContain(term);
    }
    for (const legacy of ["SCRAPECREATORS_API_KEY", "OPENAI_API_KEY", "WATCHLIST_", "--publish", "LAST30DAYS_MEMORY_DIR"] ) {
      expect(configuration).not.toContain(legacy);
    }
  });

  test("README describes only the focused Bun product", async () => {
    const readme = await Bun.file(readmePath).text();
    for (const term of ["last30days skill install", "skills/last30days/src/cli.ts", "xbird", "yt-dlp", "summarize", "Gamma API", "LAST30DAYS_CONFIG_PATH"]) {
      expect(readme).toContain(term);
    }
    expect(readme).toContain("## Future work");
    for (const future of ["TikTok", "Instagram", "LinkedIn", "Xiaohongshu", "Perplexity", "watchlists", "Publishing workflows"]) {
      expect(readme).toContain(future);
    }
    expect(readme).toContain("not current capabilities");
    for (const legacy of ["TikTok engagement", "Instagram Reels", "watchlist commands", "SCRAPECREATORS_API_KEY"]) {
      expect(readme).not.toContain(legacy);
    }
  });
});
