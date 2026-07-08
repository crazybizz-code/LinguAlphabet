import { ruleBasedSearchRanker } from "./rule-ranker";
import type { SearchRanker } from "./types";

/**
 * Universal Search's one import point (docs/dashboard-architecture.md
 * §9) — Explore never imports the ranker or the field-extraction dispatch
 * directly, and never knows whether a result came from substring
 * matching or a future AI-powered ranker.
 */
export const searchService: SearchRanker = ruleBasedSearchRanker;

export type { SearchableField, SearchRanker } from "./types";
