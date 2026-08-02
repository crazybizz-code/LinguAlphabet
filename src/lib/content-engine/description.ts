/**
 * Card descriptions when the publisher supplies none.
 *
 * WHY THIS EXISTS. VOA's podcast feeds carry audio and metadata and
 * nothing else — no script, and no blurb in `<description>`,
 * `<itunes:summary>` or `<itunes:subtitle>`. The quality gate rejected
 * all three proof episodes with "Missing description", and it was right
 * to: a lesson card with no description is a broken card.
 *
 * The gate is not the thing to change. What was missing is a legitimate
 * description, and by the time the gate runs there IS one available —
 * enrichment has already read the episode's verified transcript and
 * written a summary of it. Using that is not manufacturing a description
 * to make a test green; it is describing the episode from the episode.
 *
 * TWO THINGS KEEP THAT HONEST.
 *
 * First, provenance is recorded rather than implied: a generated
 * description is stored as `generated`, never as publisher copy.
 *
 * Second, generation is gated on there being real content to generate
 * FROM. The "Missing description" check exists partly to catch an item
 * whose body failed to extract — an article with no body produced an
 * empty description, and the gate caught it. If a description could be
 * conjured for any item at all, that diagnostic would be destroyed. So
 * the fallback only applies when the body is substantial, which for a
 * podcast means a transcript that already passed verification.
 */

/**
 * Below this, "generate a description from the body" is not a meaningful
 * operation and the empty description is a real signal about a broken
 * item. Deliberately the same order of magnitude as the transcript
 * minimum in the VOA provider — an item with less text than that has
 * nothing to summarise.
 */
export const MIN_BODY_CHARS_FOR_GENERATED_DESCRIPTION = 400;

const MAX_DESCRIPTION_CHARS = 320;

/**
 * Trims an enrichment summary to something card-shaped.
 *
 * Prefers whole sentences: a description that stops mid-clause reads
 * like a bug even when the underlying text is fine. Only falls back to
 * cutting mid-sentence when the very first sentence is already too long,
 * and marks that case so it does not masquerade as a complete thought.
 */
export function toCardDescription(summary: string, maxChars = MAX_DESCRIPTION_CHARS): string {
  const flat = summary.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  if (flat.length <= maxChars) return flat;

  const sentences = flat.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [];
  let kept = "";
  for (const sentence of sentences) {
    if ((kept + sentence).trim().length > maxChars) break;
    kept += sentence;
  }
  kept = kept.trim();
  if (kept) return kept;

  // One very long opening sentence: cut on a word boundary rather than
  // mid-word, and say that it was cut.
  const clipped = flat.slice(0, maxChars - 1);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${(lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`;
}

export interface ResolvedDescription {
  description: string;
  provenance?: "publisher" | "generated";
}

/**
 * The publisher's words when they exist, ours when they do not, and
 * nothing at all when there is no honest way to produce either — in
 * which case the quality gate rejects the item, exactly as it should.
 */
export function resolveDescription(
  publisherDescription: string,
  enrichmentSummary: string,
  bodyLength: number,
): ResolvedDescription {
  const publisher = publisherDescription.trim();
  if (publisher) return { description: publisher, provenance: "publisher" };

  if (bodyLength < MIN_BODY_CHARS_FOR_GENERATED_DESCRIPTION) return { description: "" };

  const generated = toCardDescription(enrichmentSummary);
  if (!generated) return { description: "" };

  return { description: generated, provenance: "generated" };
}
