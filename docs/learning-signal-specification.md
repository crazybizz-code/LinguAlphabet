# Learning Signal Specification

Status: **specification only — no code changed.** This is the contract
the entire Learning Engine is built against, per your instruction.
Nothing here is implemented yet beyond what Phase 3 (Tier A) already
shipped (`docs/ai-coach-audit.md`, `src/ai/data/signal-repository.ts`).

---

## One reclassification, flagged before anything else

Your Phase 3 kickoff message called `grammar_mistake`, `grammar_mastered`,
`vocabulary_mastered`, and `vocabulary_struggled` "judgment-based" —
Tier 3 by your own framing then. Having now designed the full three-tier
model, I think three of those four belong in **Tier 2, not Tier 3**, and
I want to say why explicitly rather than silently reclassify them.

Your own sequencing principle was: *"wire the Quiz scoring into the
pipeline, because quiz results are ground truth."* Once a quiz question
is tagged with the grammar unit or vocabulary word it tests (a small,
already-planned extension to `QuizStep` — see `quiz_answer_recorded`
below), "the learner got present-perfect questions wrong three times" is
not a judgment. It's arithmetic over ground truth — the same status as
`quiz_completed` already has. Nothing about it requires Tuto to
understand language or infer anything. Making it Tier 3 would mean
generating three of your four example judgment-based signals from a
non-judgment, and would blur exactly the line this whole spec exists to
keep sharp.

`confidence_drop`/`confidence_gain` are different in kind: there is no
quiz for confidence. Detecting it requires reading tone, hesitation, or
frustration in a learner's own words — genuine language understanding,
genuine judgment, no structured ground truth to fall back on. Those stay
Tier 3, and are the only two signals in this spec that do.

**Recommendation:** classify `grammar_mistake`, `grammar_mastered`,
`vocabulary_mastered`, `vocabulary_struggled` as Tier 2 (derived from
quiz/repetition evidence); reserve Tier 3 strictly for
`confidence_drop`/`confidence_gain`, with a documented extension point
for a future chat-observed grammar signal if you ever want Tuto to
notice a mistake mid-conversation, not just from a quiz — given a
**different name** than the Tier 2 one, so a derived fact and an AI
hypothesis are never filed under the same signal name. I've specced the
tables below on this recommendation; say so if you'd rather keep the
original Tier 3 assignment and I'll re-spec.

---

## The trust hierarchy this implies

```
Tier 1 (fact)  →  Tier 2 (derived fact)  →  Tier 3 (hypothesis)  →  Learning Engine's synthesis
```

Each tier is only as trustworthy as what it's built from. A single Tier 3
signal is never treated as equivalent to a Tier 1 fact — the Learning
Engine (Phase 4, not this document) is responsible for weighting Tier 3
signals by their `confidence` and looking for corroboration (repeated
similar signals, or agreement with Tier 2 evidence) before a hypothesis
influences what Tuto actually does. Nothing downstream — not
`LearnerRepository`, not a future recommendation bridge — is allowed to
treat a Tier 3 signal as ground truth on its own.

---

## Storage and lifetime, by tier (stated once, applies to every signal below)

| | Storage | Lifetime |
|---|---|---|
| **Tier 1** | A row in `learning_signals` (`src/ai/data/signal-repository.ts`), written via `SignalRepository.record()`. | Permanent, append-only. Never updated or deleted — the ground-truth record, forever. |
| **Tier 2** | **Nothing new.** Computed at read-time by a derivation function over Tier 1 rows (`SignalRepository.listRecent()`) — never persisted as its own row. This is the literal meaning of "never store a conclusion you can derive": a Tier 2 signal is, by definition, always re-derivable, so storing it would be exactly the redundant-conclusion problem this model exists to prevent. | Not applicable in the storage sense — nothing to expire. Its freshness is entirely a function of the derivation's own lookback window (e.g. "last 10 quiz answers on this topic"), which the derivation logic controls explicitly, not an expiry timestamp. |
| **Tier 3** | A row in `learning_signals`, same table and schema as Tier 1 — `evidence` (jsonb) carries the extra traceability fields no Tier 1 signal needs (see below). No new table required. | Permanent, append-only, same as Tier 1 — but **advisory, not authoritative** (see trust hierarchy above). Storing it forever is fine precisely because nothing downstream is required to believe it uncorroborated. |

---

## Every signal: full specification

### Tier 1 — Objective (always true)

| Name | Source | Evidence | Confidence | Producer | Consumer | Status |
|---|---|---|---|---|---|---|
| `article_completed` | `content_session` | `{ contentId, estimatedMinutes }` | `null` | `completeMission()` (`src/lib/learning-session/complete-mission.ts`) | `LearnerRepository` (future: recency/skill-coverage derivations), Learning Engine | **Built** |
| `podcast_completed` | `content_session` | `{ contentId, estimatedMinutes }` | `null` | `completeMission()` | Same as above | **Built** |
| `quiz_completed` | `content_session` | `{ contentId, correctAnswers, quizTotal }` | `null` | `completeMission()` | `LearnerRepository`, Learning Engine, Tier 2 derivations (aggregate score only — see `quiz_answer_recorded` for per-question) | **Built** |
| `vocabulary_viewed` | `vocabulary_lookup` | `{ word, sourceContentId }` | `null` | `recordVocabularyViewed()` (`src/lib/vocabulary/actions.ts`), called from `DictionaryOverlay` | `LearnerRepository.recentlyStudiedTopics`, Tier 2 vocabulary derivations | **Built** |
| `vocabulary_saved` | `vocabulary_lookup` | `{ word, sourceContentId }` | `null` | `saveVocabularyWord()` | Same as above | **Built** |
| `explanation_requested` | `chat` | `{ responseFormatName }` | `null` | `generateStructuredResponse()` (`src/ai/services/ai-service.ts`) | `LearnerRepository.recentlyStudiedTopics` | **Built** |
| `quiz_answer_recorded` *(proposed)* | `content_session` | `{ contentId, questionIndex, topic, skill, correct: boolean }` — `topic` is a grammar-unit id or vocabulary word once quiz questions carry that tag | `null` | A new `recordQuizAnswer()` write inside `QuizStep`'s `handleSelect()` (or an equivalent server action called per-answer, not just at session end) | Tier 2's `grammar_mastered`/`grammar_mistake`/vocabulary derivations depend entirely on this existing | **Not built** — this is the "wire Quiz scoring into the pipeline" step from your last message. `quiz_completed` already captures the aggregate; this is the missing per-question detail. Requires touching `QuizStep.tsx`, flagged per our existing UI-change convention. |
| `hint_requested` | — | `{ word or topic, contentId }` | `null` | Would need a real "hint" UI affordance — none exists today | — | **Reserved, unemitted.** No fabricated proxy. |
| `reading_time` | — | `{ contentId, seconds }` | `null` | Would need a real elapsed-time timer reaching the server — `completeMission()` only ever receives the content's static estimated duration | — | **Reserved, unemitted.** |
| `listening_time` | — | `{ contentId, seconds }` | `null` | Same gap as `reading_time` | — | **Reserved, unemitted.** |

### Tier 2 — Derived (calculated from Tier 1 signals, deterministic, no model call)

| Name | Derived from | Rule (illustrative — exact thresholds are a Learning Engine implementation detail, not fixed here) | Confidence | Producer | Consumer |
|---|---|---|---|---|---|
| `grammar_mistake` | `quiz_answer_recorded` (`correct: false`), grouped by `topic` | 2+ incorrect answers on the same grammar-unit topic within a lookback window, with no later correct answer on that topic | `null` — this is arithmetic, not a probability | A new `DerivedSignalEngine` (`src/ai/data/` or `src/ai/learning-engine/`, not built) reading `SignalRepository.listRecent({types: ["quiz_answer_recorded"]})` | `LearnerRepository.weakGrammarTopics`, Learning Engine |
| `grammar_mastered` | `quiz_answer_recorded` (`correct: true`), grouped by `topic` | N consecutive correct answers on the same topic, with no incorrect answer on it in the same window | `null` | Same `DerivedSignalEngine` | `LearnerRepository.strongGrammarTopics`, Learning Engine |
| `vocabulary_struggled` | `vocabulary_viewed` grouped by `word` | Same word viewed 3+ times within a short window (repeated lookups are real evidence the word hasn't stuck) | `null` | Same `DerivedSignalEngine` | `LearnerRepository.weakVocabularyAreas`, Learning Engine |
| `vocabulary_mastered` | `vocabulary_saved` + subsequent `quiz_answer_recorded`/absence of repeat `vocabulary_viewed` | A saved word not re-looked-up despite repeated exposure to content containing it, or answered correctly in a quiz | `null` | Same `DerivedSignalEngine` | `LearnerRepository.strongVocabularyAreas`, Learning Engine |

**Not built.** All four depend on `quiz_answer_recorded`, which doesn't
exist yet (`vocabulary_struggled`/`vocabulary_mastered` partially don't —
they could derive from `vocabulary_viewed`/`vocabulary_saved` alone
today, but pairing them with quiz evidence once available makes them far
more reliable, so I'd sequence all four together rather than half-build
now and revisit).

### Tier 3 — AI Judgment (generated by Tuto, requires confidence + evidence + traceability)

| Name | Source | Evidence (required shape) | Confidence | Producer | Consumer |
|---|---|---|---|---|---|
| `confidence_drop` | `chat` | `{ excerpt: string, reasoning: string }` — `excerpt` must be a real, verbatim quote from the learner's own message; `reasoning` is Tuto's stated basis, never omitted | `number` (0–1), **required**, never `null` | A new Action (not a Tool — see below), `recordLearningSignal`, reusing the existing `src/ai/actions/` scaffolding (`ActionDefinition`, currently empty — Sprint 1 designed it, nothing has used it since) | Learning Engine only, at reduced trust weight until corroborated by a pattern of similar signals |
| `confidence_gain` | `chat` | Same shape as above | `number` (0–1), **required** | Same | Same |

**Not built.** This is the one tier your message explicitly said to defer
past this spec ("only after those two are working should Tuto begin
generating judgment-based signals").

**Traceability, concretely:** every Tier 3 signal's `evidence` must
include `conversationId` (from `src/ai/data`'s `ConversationRepository` —
already exists) and the verbatim excerpt it's grounded in. This is what
makes "no AI-generated signal may exist without confidence, evidence,
traceability" enforceable rather than aspirational: a future `record()`
call on a Tier 3 signal with a missing `conversationId`, empty `excerpt`,
or `confidence: null` should be a validation error, not a silently
accepted row. `SignalRepository.record()` doesn't enforce this
distinction today (Tier 1's `confidence: null` is valid; Tier 3's isn't)
— when Tier 3 is actually implemented, `record()` needs a
tier-aware guard, not just a shared interface. Noting this now so it
isn't discovered as a bug later.

**Why an Action, not a Tool:** `src/ai/tools` is for the model *reading*
information (`getCurrentArticle`, `getGrammarUnit`, ...) — every existing
tool is side-effect-free. Recording a signal is a write. Sprint 1
already drew this exact line and built `src/ai/actions/`
(`ActionDefinition`, "something Tuto could *do*, distinct from a Tool")
for precisely this case, then never used it. Reusing it here is the
smallest possible addition, not new architecture.

---

## What this spec deliberately does not do

- It doesn't implement `quiz_answer_recorded`, the `DerivedSignalEngine`,
  or the `recordLearningSignal` Action — each is a real, separate build
  step, and per your instruction this document is the design to review
  before any of them get built.
- It doesn't touch `QuizStep.tsx` — wiring `quiz_answer_recorded` still
  needs your sign-off to modify that screen, same as flagged last turn.
- It doesn't invent thresholds (how many repeats count as "struggled,"
  how many correct answers count as "mastered"). Those are Learning
  Engine tuning parameters, not signal-taxonomy decisions, and are best
  set once there's real signal volume to tune against.
