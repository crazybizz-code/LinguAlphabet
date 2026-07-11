import { registerProvider, getProvider } from "./providers/registry";
import { generateEnrichment, estimateReadingTimeMinutes } from "./ai-processing";
import { runQualityGate, publishContentItem } from "./publishing";
import { upsertContentItem, upsertContentDetails } from "./storage";
import { runIngestionPipeline } from "./pipeline";

/**
 * The Content Engine's one import point (docs/content-engine.md) — mirrors
 * learningBrain (src/lib/learning-brain/index.ts) and searchService
 * (src/lib/content/search/index.ts): callers never import an
 * implementation file directly, and never know which subsystem produced a
 * result. Swapping any one subsystem's internals — a different AI
 * provider, a real search-index service, a smarter quality gate — means
 * editing that subsystem's file, never this one, and never a caller.
 */
export const contentEngine = {
  registerProvider,
  getProvider,
  generateEnrichment,
  estimateReadingTimeMinutes,
  runQualityGate,
  publishContentItem,
  upsertContentItem,
  upsertContentDetails,
  runIngestionPipeline,
};

export type {
  ContentProvider,
  RawContentItem,
  ContentItemDraft,
  ProviderDraft,
  ContentType,
  EnrichmentResult,
  QualityGateResult,
  IngestionRunResult,
} from "./types";
export type { RunIngestionPipelineOptions } from "./pipeline";
