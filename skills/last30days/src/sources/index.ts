import type { Last30DaysConfig } from "../config";
import type { Source } from "../core/types";
import { GitHubSource } from "./github";
import { HackerNewsSource } from "./hackernews";
import { PolymarketSource } from "./polymarket";
import { ArxivSource, TechmemeSource } from "./printing-press";
import { RedditSource } from "./reddit";
import { StocktwitsSource } from "./stocktwits";
import { WebSource } from "./web";
import { XbirdSource } from "./xbird";
import { YoutubeSource } from "./youtube";

export function defaultSources(config: Last30DaysConfig): Source[] {
  return [
    new XbirdSource(undefined, config.allowBrowserCookies),
    new RedditSource(),
    new YoutubeSource(),
    new HackerNewsSource(),
    new GitHubSource(),
    new PolymarketSource(),
    new WebSource(),
    new ArxivSource(),
    new TechmemeSource(),
    new StocktwitsSource(),
  ];
}
