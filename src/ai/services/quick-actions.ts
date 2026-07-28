/**
 * Contextual quick actions (Tuto Workspace): the model itself suggests 2-4
 * short next actions tailored to the reply it just gave — never a fixed,
 * hardcoded menu (that's the older src/lib/tuto-chat/suggestions.ts
 * heuristic bank, kept as-is for the legacy sheet/compat layer, not reused
 * here). Implemented as a single trailing, machine-readable line the model
 * appends to its own answer (QUICK_ACTIONS_FORMAT, src/ai/prompts/tuto/sections.ts),
 * stripped out here before the reply ever reaches a learner or gets
 * persisted to Conversation Memory — it's an implementation detail, not
 * something a learner should ever see or the model should see echoed back
 * to it.
 *
 * Safe to parse as one complete string, not a streaming-chunk problem:
 * per docs/ai-architecture.md's "Streaming + tools" note, every real
 * request goes through the tool loop, whose final answer already arrives
 * as one complete string before this ever runs.
 */

const ACTIONS_LINE = /\n*<!--ACTIONS:(\[[\s\S]*?\])-->\s*$/;
const MAX_ACTIONS = 4;
const MAX_ACTION_LENGTH = 40;

export interface ExtractedQuickActions {
  /** The reply with the trailing actions line removed and trailing whitespace trimmed — this is what a learner ever sees or what gets persisted to Conversation Memory. */
  content: string;
  /** Empty when the model omitted the line or produced something unparseable — never an error, quick actions are a presentation nicety, not a contract the model must satisfy. */
  quickActions: string[];
}

/**
 * Tolerant on purpose: a missing, malformed, or oversized actions line
 * degrades to zero quick actions rather than ever surfacing raw
 * `<!--ACTIONS:...-->` text to a learner or throwing and losing the whole
 * reply over a formatting slip.
 */
export function extractQuickActions(rawContent: string): ExtractedQuickActions {
  const match = rawContent.match(ACTIONS_LINE);
  if (!match) return { content: rawContent, quickActions: [] };

  const content = rawContent.slice(0, match.index).trimEnd();

  let quickActions: string[] = [];
  try {
    const parsed: unknown = JSON.parse(match[1]);
    if (Array.isArray(parsed)) {
      quickActions = parsed
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim().slice(0, MAX_ACTION_LENGTH))
        .slice(0, MAX_ACTIONS);
    }
  } catch {
    // Malformed JSON on that line — fall through with zero quick actions.
  }

  return { content, quickActions };
}
