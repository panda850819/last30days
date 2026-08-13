export const SOURCE_STATUSES = [
  "ok",
  "partial",
  "no-results",
  "auth-failed",
  "rate-limited",
  "timeout",
  "unavailable",
  "error",
] as const;

export type SourceStatus = (typeof SOURCE_STATUSES)[number];
export type Depth = "quick" | "default" | "deep";
export type OutputFormat = "json" | "md";
export type ResearchMode = "research" | "comparison" | "discover";

export interface DateWindow {
  from: string;
  to: string;
  days: number;
}

export interface SourceRequest {
  topic: string;
  mode: ResearchMode;
  window: DateWindow;
  depth: Depth;
  limit: number;
  entity?: {
    kind: "person" | "company" | "topic";
    githubAccountType?: "user" | "organization";
    githubLogin?: string;
    xHandle?: string;
    confidence: number;
  };
  signal?: AbortSignal;
}

export interface Engagement {
  likes?: number;
  reposts?: number;
  replies?: number;
  comments?: number;
  views?: number;
  points?: number;
  volume?: number;
  liquidity?: number;
  probability?: number;
  [key: string]: number | undefined;
}

export interface SourceItem {
  id: string;
  source: string;
  title: string;
  url: string;
  publishedAt?: string;
  author?: string;
  body?: string;
  snippet?: string;
  engagement: Engagement;
  metadata?: Record<string, unknown>;
  relevance?: number;
  score?: number;
}

export interface SourceResult {
  source: string;
  backend: string;
  status: SourceStatus;
  items: SourceItem[];
  error?: string;
  durationMs?: number;
  researchTopic?: string;
  topicStatuses?: Record<string, SourceStatus>;
}

export interface SourceAvailability {
  available: boolean;
  backend: string;
  authenticated?: boolean;
  detail?: string;
}

export interface Source {
  readonly name: string;
  availability(): Promise<SourceAvailability>;
  search(request: SourceRequest): Promise<SourceResult>;
}

export interface ResearchOptions {
  mode: ResearchMode;
  topics: string[];
  window: DateWindow;
  depth: Depth;
  emit: OutputFormat;
  sources?: string[];
  limit: number;
}

export interface ResearchReport {
  schemaVersion: 1;
  mode: ResearchMode;
  topics: string[];
  window: DateWindow;
  generatedAt: string;
  items: SourceItem[];
  sources: SourceResult[];
}
