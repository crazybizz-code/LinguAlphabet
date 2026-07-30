/**
 * Server-side token budget for tool results.
 *
 * The problem this solves (docs/ai-architecture.md's tool loop): a tool
 * result is appended to `messages` and then RE-SENT on every subsequent
 * tool-loop iteration, up to MAX_TOOL_ITERATIONS. `getArticleParagraphs`
 * and `getPodcastTranscript` take optional `maxParagraphs`/`maxSegments`
 * that only the MODEL decides to pass — when it omits them, the entire
 * article body or full transcript enters the conversation and is billed
 * again on each following iteration. A 45-minute transcript (~9k tokens)
 * re-sent three times is ~36k tokens for one turn.
 *
 * The fix is deliberately NOT a hardcoded paragraph/segment count. A
 * fixed "first 20 paragraphs" is wrong in both directions — it truncates
 * short articles needlessly and still lets long ones through. This caps
 * the one thing that actually costs money (serialized tokens) and lets
 * the document's own shape decide how many items that buys.
 *
 * Truncation is SHAPE-AWARE, not a blind string cut: results carrying an
 * array of items (paragraphs, transcript segments) drop whole items from
 * the end, so the model never receives half a sentence or malformed JSON.
 *
 * Truncation is always DISCLOSED in the payload. A silently shortened
 * transcript would let Tuto summarize half an episode while implying it
 * read all of it — a correctness and honesty problem, not just a cost
 * one. The marker tells the model exactly what it did and did not get.
 */

/**
 * ~4 characters per token. Deliberately a heuristic, not a real
 * tokenizer: adding a tokenizer dependency to save a few percent of
 * accuracy on a *budget ceiling* is not worth the bundle and CPU cost,
 * and the budget is enforced conservatively enough that the error margin
 * is absorbed. The same ratio is used by the telemetry layer's fallback.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Per-result ceiling. Sized so a typical full article (~1,000-1,500
 * tokens) passes through UNTOUCHED — the budget exists to stop outliers,
 * not to degrade the common case, which is what protects learning
 * quality. Overridable per deployment without a code change.
 */
export const DEFAULT_TOOL_RESULT_TOKEN_BUDGET = 2000;

/**
 * Ceiling on the SUM of all tool results in a single tool loop. Without
 * this, three separate in-budget results still compound across
 * iterations. Once spent, later results in the same turn get a smaller
 * share rather than being dropped outright.
 */
export const DEFAULT_TOOL_LOOP_TOKEN_BUDGET = 4000;

function readEnvBudget(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function getToolResultTokenBudget(): number {
  return readEnvBudget("AI_TOOL_RESULT_TOKEN_BUDGET", DEFAULT_TOOL_RESULT_TOKEN_BUDGET);
}

export function getToolLoopTokenBudget(): number {
  return readEnvBudget("AI_TOOL_LOOP_TOKEN_BUDGET", DEFAULT_TOOL_LOOP_TOKEN_BUDGET);
}

export interface BudgetedResult {
  /** JSON string to place in the tool message. */
  content: string;
  truncated: boolean;
  /** Tokens the serialized content is estimated to consume. */
  estimatedTokens: number;
  /** How many array items were dropped, when truncation was shape-aware. */
  omittedItems: number;
}

/** Array-valued fields the built-in content tools return. Order matters only for determinism. */
const TRUNCATABLE_ARRAY_KEYS = ["paragraphs", "segments", "assets", "examples"] as const;

function findTruncatableArray(value: unknown): { key: string; items: unknown[] } | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of TRUNCATABLE_ARRAY_KEYS) {
    const candidate = record[key];
    if (Array.isArray(candidate) && candidate.length > 0) return { key, items: candidate };
  }
  return null;
}

/**
 * Largest prefix of `items` whose serialized form fits `budgetTokens`.
 * Binary search rather than a linear walk: a 900-segment transcript would
 * otherwise re-serialize the whole array up to 900 times per tool call.
 */
function fitPrefix(base: Record<string, unknown>, key: string, items: unknown[], budgetTokens: number): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = JSON.stringify({ ...base, [key]: items.slice(0, mid) });
    if (estimateTokens(candidate) <= budgetTokens) low = mid;
    else high = mid - 1;
  }
  return low;
}

/**
 * Fits one tool result inside `budgetTokens`.
 *
 * Under budget: returned byte-identical, so the overwhelming majority of
 * tool calls are completely unaffected by this layer.
 *
 * Over budget, with a recognised array field: keeps the largest whole
 * number of leading items that fit, and replaces the rest with an
 * explicit `_truncation` notice stating what was omitted.
 *
 * Over budget with no array to trim (a single huge string field): falls
 * back to cutting the serialized JSON and returning it wrapped in a
 * notice object, so the tool message is still valid JSON rather than a
 * broken fragment.
 */
export function fitToolResultToBudget(result: unknown, budgetTokens: number): BudgetedResult {
  const serialized = JSON.stringify(result);
  const originalTokens = estimateTokens(serialized);

  if (originalTokens <= budgetTokens) {
    return { content: serialized, truncated: false, estimatedTokens: originalTokens, omittedItems: 0 };
  }

  const truncatable = findTruncatableArray(result);
  if (truncatable) {
    const base = { ...(result as Record<string, unknown>) };
    delete base[truncatable.key];

    // Reserve room for the notice itself so adding it can't push the
    // payload back over the budget it was just trimmed to fit.
    const noticeReserve = 120;
    const kept = fitPrefix(base, truncatable.key, truncatable.items, Math.max(budgetTokens - noticeReserve, 0));
    const omitted = truncatable.items.length - kept;

    const payload = {
      ...base,
      [truncatable.key]: truncatable.items.slice(0, kept),
      _truncation: {
        reason: "This document is too large to include in full.",
        returned: kept,
        omitted,
        total: truncatable.items.length,
        guidance: `You received the first ${kept} of ${truncatable.items.length} items. Base your answer only on what is shown, and if the learner needs later parts, say so plainly rather than guessing at content you were not given.`,
      },
    };

    const content = JSON.stringify(payload);
    return { content, truncated: true, estimatedTokens: estimateTokens(content), omittedItems: omitted };
  }

  // No recognised array — cut the serialized text and keep it valid JSON.
  const charBudget = Math.max(budgetTokens * 4 - 200, 200);
  const payload = {
    _truncation: {
      reason: "This tool result is too large to include in full and had no list structure to trim.",
      guidance: "Base your answer only on the partial content below, and say plainly that you only received part of it.",
    },
    partialContent: serialized.slice(0, charBudget),
  };
  const content = JSON.stringify(payload);
  return { content, truncated: true, estimatedTokens: estimateTokens(content), omittedItems: 0 };
}
