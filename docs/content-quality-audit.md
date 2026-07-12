# Content Engine Quality Audit

Status: **audit only — no code changed as part of this document.** Scope:
`src/lib/content-engine/ai-processing.ts`, `pipeline.ts`, `publishing.ts`,
`src/lib/content-engine/providers/rss-provider.ts`,
`src/lib/learning-session/adapters/article.ts`,
`src/app/api/content-engine/ingest/route.ts`, `src/lib/gemini/client.ts` —
every file actually involved in turning a raw RSS item into a published,
enriched, learnable article. Every finding below is grounded in the
current code, not speculation; line-level references are given where a
finding is concrete enough to point at.

## Executive summary

| Component | Score (1–10) |
|---|---|
| AI Summary quality | 6 |
| Vocabulary quality | 6 |
| Quiz quality | 5 |
| Reflection quality | 7 |
| CEFR accuracy | 5 |
| Reading time estimation | 8 (function itself is excellent — deployment context (raw HTML) undermines it, see below) |
| Duplicate detection | 7 |
| Article extraction quality | 6 |

**Overall: the architecture is sound and the individual pieces mostly do
what they claim, but almost every component validates the *shape* of
Gemini's output (is it a string, is it an array) and almost never
validates its *quality* (is it non-empty, is it internally consistent, is
it actually grounded in the source).** That single pattern — schema
validation without content validation — is the throughline behind most
findings below, not a set of unrelated bugs.

**Two concrete, high-confidence findings worth acting on before adding
more sources:**
1. Quiz questions' `type` field is hardcoded to `"mc"` in the output
   regardless of what Gemini returns — the type system supports `"mc" |
   "tf" | "fill"`, but the pipeline can never produce anything but
   multiple-choice.
2. Reading time is computed from the raw (often still HTML-laden) body
   text, not the cleaned plain text a learner actually reads — the
   estimate itself is a well-designed, deterministic formula, but it's
   being fed markup noise.

---

## 1. AI Summary quality — 6/10

**How it works:** `ai-processing.ts`'s prompt asks for "a 2-3 sentence
plain-English recap"; validated only as `typeof result.summary ===
"string"`. A fallback placeholder exists in both adapters
(`article.ts`/`podcast.ts`) if the summary is empty/whitespace after
trimming.

**Strengths:**
- Clear, scoped prompt instruction.
- Graceful fallback if Gemini returns nothing — the session never breaks,
  just shows a generic placeholder.

**Weaknesses:**
- `typeof "" === "string"` is `true` — an empty string passes validation.
  The only thing catching a truly blank summary is the adapter's
  `.trim() ||` fallback, which happens well after ingestion; nothing at
  the quality-gate level flags "Gemini returned an empty summary" as a
  distinct, traceable rejection reason.
- No length floor/ceiling enforced — a one-word or a 500-word "summary"
  both pass.
- No factual-grounding check — nothing verifies the summary's content
  actually reflects the source body (a classic hallucination surface).
- Not CEFR-aware — the prompt never asks Gemini to write the summary
  itself at roughly the article's own assigned reading level, so a
  summary attached to an A2 article can still use B2-complexity sentence
  structure.

**Recommendations:**
- Add a minimum non-whitespace length check (e.g. reject under ~20
  characters) as an explicit quality-gate reason, not a silent fallback.
- Consider instructing Gemini to write the summary at the same CEFR level
  as `cefrLevelMin`.

---

## 2. Vocabulary quality — 6/10

**How it works:** Prompt asks for 5–8 entries with word/pos/definition/
example/translation/phonetic; `isVocabularyEntry()` validates word/pos/
definition/example are strings (translation/phonetic optional, blank
string fallback). Feeds three separate UX surfaces: `VocabularyStep`,
`FlashcardsStep`, and `DictionaryOverlay`'s curated-match lookup.

**Strengths:**
- Good structural shape, and reused consistently across all three
  consumers rather than each inventing its own format.
- Prompt explicitly asks for examples "different from the source" —
  addresses the most obvious low-effort failure mode (copy-pasting a
  sentence verbatim), even though nothing verifies compliance.

**Weaknesses:**
- Same empty-string-passes-validation gap as Summary — `word`, `pos`,
  `definition`, `example` can each individually be `""` and still satisfy
  `isVocabularyEntry`.
- No de-duplication — Gemini could return the same word twice in one
  article's list; nothing catches it.
- No verification that `word` actually appears in the source body — a
  vocabulary entry could be entirely hallucinated and nothing would flag
  it.
- The prompt's "5-8 entries" target isn't enforced anywhere — the
  response schema has no `minItems`/`maxItems`, and no post-parse count
  check exists. An article could ship with 1 vocabulary entry or 15.
- No cross-check between chosen vocabulary difficulty and the article's
  own assigned `cefrLevelMin`/`cefrLevelMax` — two independently
  AI-generated fields that could disagree with each other and nothing
  would notice.

**Recommendations:**
- Filter out entries with any blank required field after parsing, then
  re-check the resulting count against a minimum (e.g. 3) as a real
  quality-gate reason, not silent acceptance of a thin list.
- De-duplicate by lowercased `word` before storage.

---

## 3. Quiz quality — 5/10 (lowest score — one concrete bug found)

**How it works:** Prompt asks for 3–4 multiple-choice questions;
`isQuizQuestion()` validates question/options(string array)/correct
(number)/explanation.

**The concrete bug:** in `generateEnrichment()`'s return statement, every
quiz question is mapped with **`type: "mc"` hardcoded**, not
`question.type` from Gemini's actual response. `QuizQuestion.type` (
`src/types/content.ts`) supports `"mc" | "tf" | "fill"`, and the type
system, the UI, and the domain model all imply format variety — but the
prompt only ever asks for `"mc"`, and even if it asked for more, the
hardcoded literal would discard the answer. **Quiz format variety is
completely dead — every quiz question in the system, and every quiz
question that will ever be generated without a code change, is
multiple-choice.**

**Other weaknesses:**
- No validation that `correct` is actually a valid index into `options`
  (e.g. `correct: 5` with 4 options passes validation and would silently
  misbehave in `QuizStep`).
- No validation that `options.length === 4` as the prompt requests, or
  even that it's `>= 2` — a nonsensical single-option question would pass.
- No duplicate-option check within a question.
- No answer-correctness check against the source — if the "correct"
  index itself is wrong (a real hallucination risk, not just in the
  distractor text), a learner grading their own comprehension would be
  actively misled, and nothing here would ever detect it.

**Recommendations:**
- **Decide deliberately**: either wire through `question.type` (validated
  against the enum) so the existing type variety becomes real, or
  formally scope the product to multiple-choice-only and remove the dead
  `"tf" | "fill"` variants so the type system stops implying support that
  doesn't exist. Either is defensible; the current silent middle ground
  isn't.
- Validate `correct` is within `[0, options.length)` before accepting an
  entry; reject the question otherwise.
- Enforce `options.length === 4` (or at minimum `>= 2`).

---

## 4. Reflection quality — 7/10 (strongest of the four AI-generated creative fields)

**How it works:** Prompt asks for "one open-ended, low-pressure reflection
prompt... never a test question." Validated as a string; fallback exists
in both adapters.

**Strengths:**
- The most specific, well-constrained prompt instruction of the four
  creative fields — "never a test question" heads off an obvious failure
  mode directly.
- Lowest hallucination risk of the four: there's no verifiable "fact" in
  an open-ended question, so a wrong-but-plausible reflection prompt is
  far less consequential than a wrong quiz answer or an ungrounded
  summary.
- Fallback text is genuinely usable, not just a placeholder-looking
  string.

**Weaknesses:**
- Same empty-string gap as Summary (mitigated the same way, via the
  adapter fallback).
- Not CEFR-aware, same as Summary.
- No check that the reflection is actually topically related to the
  specific article vs. generic filler that could apply to any article on
  the same broad topic.

**Recommendations:** Lowest priority of the four AI fields given the
above — worth a CEFR-phrasing pass eventually, not urgent.

---

## 5. CEFR accuracy — 5/10

**How it works:** Prompt asks for `cefrLevelMin`/`cefrLevelMax` from the
six-value enum; `isCefrLevel()` validates each is one of the six strings.

**Strengths:**
- Real enum validation blocks any hallucinated CEFR string outright —
  Gemini can't return `"B1.5"` or similar and have it slip through.
- The min/max range design (rather than a single forced level) is a
  thoughtful fit for content that doesn't cleanly sit at one level.

**Weaknesses — the most structurally significant gap found in this audit:**
- **`isCefrLevel` validates each value independently against the enum;
  nothing validates that `cefrLevelMin` actually precedes
  `cefrLevelMax` in real CEFR order** (A1 < A2 < B1 < B2 < C1 < C2). If
  Gemini ever returns a reversed pair (e.g. `cefrLevelMin: "C1",
  cefrLevelMax: "A1"`), it passes validation silently and reaches
  production as a backwards range. I did not trace every downstream
  consumer of this range (Explore's level filter, Learning Brain's
  distance scoring) to confirm how each behaves against an inverted
  range — that's worth a separate, targeted check — but the root cause is
  here, at the point nothing rejects it.
- No calibration mechanism exists at all — CEFR labeling is entirely a
  single Gemini call's judgment, with no ground truth, no sampling/spot-
  check process, and no way to detect systematic bias (e.g., if Gemini
  consistently over-rates a particular source's writing style).
- No independent, deterministic cross-check (e.g. a lightweight
  readability-formula heuristic on sentence/word length) exists to catch
  an egregiously wrong AI judgment — everything downstream trusts a
  single unverified model call.
- One CEFR range covers the entire article uniformly, even though a
  full-length Readability-extracted article can have real difficulty
  variance paragraph-to-paragraph (a simple lede followed by dense
  technical language, for instance).

**Recommendations:**
- **Add an explicit ordering check and reject (or auto-swap) when
  `cefrLevelMin` is ranked harder than `cefrLevelMax`** — this is a small,
  concrete, high-value fix relative to its effort.
- Consider a lightweight deterministic readability-formula sanity check
  as a secondary signal, not a replacement for the AI judgment.

---

## 6. Reading time estimation — 8/10 (best-designed component; context undermines it)

**How it works:** `estimateReadingTimeMinutes()` is a pure, deterministic
word-count ÷ 200wpm formula with a 2-minute floor — explicitly never
asked of Gemini, on the well-reasoned basis that LLMs are unreliable at
precise counting.

**Strengths:**
- Fully deterministic — same input always produces the same output, no
  model-call variance or cost.
- The 2-minute floor is a sensible, deliberate product guard.
- The design reasoning (why not ask Gemini) is sound and already
  documented in the code.

**Weaknesses — a real, previously unnoticed inaccuracy in how it's called:**
- **`pipeline.ts` calls `estimateReadingTimeMinutes(raw.body)` directly on
  the raw body** — for RSS-sourced articles, `raw.body` is frequently HTML
  (either the feed's own `content:encoded`, or Readability's extracted
  `.content`, which is itself HTML). The word-count `split(/\s+/)` runs
  against that HTML, meaning tag names, attribute values, and URL text
  inside `href="..."` all count toward "words" — inflating (or in some
  cases distorting) the estimate relative to what a learner actually
  reads. The plain-text conversion (`extractParagraphs` in the article
  adapter) only happens later, at Learning Session render time, well
  after this calculation already ran.
- The single fixed 200wpm rate doesn't account for CEFR level — a true
  beginner (A1/A2) reads meaningfully slower than 200wpm in a second
  language; the current formula likely underestimates time for lower
  levels and overestimates for advanced ones.

**Recommendations:**
- **Compute reading time from the same cleaned plain-text representation
  used for display, not the raw HTML-laden body** — the formula itself
  doesn't need to change, just what it's fed.
- Consider a CEFR-adjusted words-per-minute rate as a secondary
  improvement.

---

## 7. Duplicate detection — 7/10

**How it works:** Three layers — (1) same-source `(source_id,
external_id)` + `processed_at`, (2) cross-source exact-match
`content_hash` (SHA-256 of normalized body text), (3) cross-source
`canonical_url` (protocol/www/trailing-slash/case-normalized). Verified
working end-to-end via a dev-preview harness in a prior round of this
project.

**Strengths:**
- Genuine defense in depth across three independent mechanisms, not one.
- Content-hash and canonical-URL checks are complementary: one catches
  identical text at different URLs, the other catches the same URL with
  differently-formatted markup.
- Deterministic `content_items.id` (a hash of `external_id`) provides a
  backstop against race conditions even without the above.

**Weaknesses:**
- **Content-hash dedup is exact-match only.** It will not catch the more
  realistic real-world duplicate case: two genuinely independent sources
  covering the same event with different wording (e.g., NASA's own
  release vs. a differently-phrased pickup of it elsewhere) produces two
  different hashes and both publish. Exact-text hashing only helps
  against verbatim syndication, which is the narrower case.
- No semantic/fuzzy similarity detection exists (embedding-based
  near-duplicate detection would be the natural next step, but is a real
  architecture addition, correctly out of scope for this audit).
- No retroactive backfill/audit exists to check whether content published
  *before* this dedup mechanism was built already contains accidental
  near-duplicates.

**Recommendations:**
- Document explicitly, in the code, that this is exact-match-only
  protection, so it isn't over-trusted as broader than it is.
- If near-duplicate publishing becomes an observed problem in production
  data, semantic similarity detection is the natural (larger) next step —
  named here, not proposed for immediate action.

---

## 8. Article extraction quality — 6/10

**How it works:** `rss-provider.ts` fetches the article's own page and
runs Mozilla Readability (via jsdom) to strip navigation/ads/boilerplate,
falling back to the RSS feed's own text fields if the fetch fails, times
out (10s), or the extracted text is under 200 characters. Verified
working against a realistic fake page (nav/ad/sidebar/footer correctly
stripped) via a prior dev-preview harness.

**Strengths:**
- Real extraction engine (the same one behind Firefox Reader View), not a
  bespoke heuristic.
- Sensible layered fallback with a length-based failure signal.
- Considerate operational choices: a timeout, and sequential (not
  parallel) per-item fetching to avoid hammering source sites.

**Weaknesses:**
- **The 200-character minimum is a weak quality bar on its own** — a
  200+ character extraction could still be a Readability misfire (a long
  image caption, a "related articles" teaser list) rather than genuine
  article prose; nothing checks for actual sentence/paragraph structure.
- No language-detection guard — if a source ever serves non-English or
  mixed-language content (a real risk given Global Voices explicitly
  translates from other languages, per `docs/content-source-policy.md`),
  nothing catches it before Gemini receives it for CEFR/vocabulary
  generation, where behavior against non-English input is unverified.
- No check that extracted content is even topically related to the RSS
  item's own title — a Readability misfire on an unusual page layout
  could in principle grab unrelated content and nothing would flag the
  mismatch.
- `extractParagraphs`' block-tag handling (`</p|div|h[1-6]>` and `<br>`)
  doesn't explicitly handle `<li>`, `<blockquote>`, or `<figcaption>`
  boundaries — articles with list- or blockquote-heavy structure could
  produce run-on paragraphs after conversion.
- No per-source extraction-success-rate tracking exists — if a
  particular source's site redesign silently degrades Readability's
  success rate over time, there's no signal that would surface it beyond
  noticing shorter articles in the published catalog.

**Recommendations:**
- Supplement the character-count threshold with a lightweight structural
  check (e.g. minimum sentence or paragraph count post-conversion).
- Consider a basic language-detection heuristic before the Gemini call,
  given the newly-approved source set's international content (Global
  Voices in particular).
- Widen `extractParagraphs` to treat `<li>`/`<blockquote>` as paragraph
  boundaries.

---

## Cross-cutting theme (applies to every AI-generated field)

Every validation function in `ai-processing.ts` (`isCefrLevel`,
`isVocabularyEntry`, `isQuizQuestion`, and the inline checks in
`generateEnrichment`) checks **type**, never **content quality**. `typeof
"" === "string"` is `true` everywhere a string is expected, so Gemini
returning technically-well-typed-but-empty or garbage content passes
every check that exists today. This isn't four separate bugs — it's one
validation philosophy applied consistently, and it's the single highest-
leverage place to invest before adding more sources, since it affects
every field this audit covers.

## Priority ranking (highest-value fixes first, not yet implemented)

1. Quiz `type` hardcoding (§3) — a real, currently-dead capability with a
   one-line root cause.
2. Reading time computed on raw HTML (§6) — a concrete accuracy bug in an
   otherwise well-designed function.
3. CEFR min/max ordering validation (§5) — cheap to add, prevents a
   nonsensical range from ever reaching production.
4. The empty-string validation gap, addressed once, generically, rather
   than field-by-field (cross-cutting theme above) — likely the highest
   overall leverage per unit of effort.
5. Vocabulary/quiz count and correctness enforcement (§2, §3).
6. Article extraction structural quality bar beyond character count (§8).
7. Cross-source semantic duplicate detection (§7) — correctly the lowest
   priority; a real architecture addition, not a quick fix, and only
   worth pursuing if production data shows it's an actual problem.
