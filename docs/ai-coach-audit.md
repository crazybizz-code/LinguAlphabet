# Tuto AI Coach — Structural Audit

Status: **audit only — no code changed.** Written under the Tuto Taste
Skill as project law (Teaching > Answering, Guidance > Conversation,
Simplicity > Features, Emotion > Information, "remember the learner").
Every claim below is grounded in a specific file/line, verified by direct
reading of the current repo — not the architecture docs, which turned out
to be materially stale in places (noted explicitly where that matters).

This is the blueprint for rebuilding Tuto phase by phase. Nothing here
implies the team did bad work — the AI foundation (`src/ai/`) is
genuinely well-built, disciplined engineering. The problem is that four or
five *independently excellent* systems were built in isolation and never
wired to each other or to reality. That's the whole story of this audit.

---

## Executive Summary — the one fix that collapses ten problems

**Tuto's tool layer is not connected to the app's real content.** Every
tool that's supposed to let Tuto read the learner's actual article,
podcast, transcript, or quiz (`getCurrentArticle`, `getArticleParagraphs`,
`getCurrentPodcast`, `getPodcastTranscript`, `getCurrentQuiz`) is
hardcoded against `src/ai/tools/mock-data.ts` — a small, fictional dataset
with its own made-up ids. There is **zero Supabase import anywhere under
`src/ai/`** (confirmed by direct search). The real content a learner is
actually looking at lives in Supabase's `content_items`/`podcast_details`/
`article_details`, with real UUIDs. Those ids never match the mock ids.

Concretely, `getCurrentArticle` (`src/ai/tools/definitions/get-current-article.ts:30`):

```ts
const article = MOCK_ARTICLES[ref.id];
if (!article) return { found: false, reason: `No article data found for id "${ref.id}".` };
```

`ref.id` is a real Supabase content id, sent correctly through
`LearningContext.currentArticle`. `MOCK_ARTICLES` has never heard of it.
**This tool call fails 100% of the time, for every real learner, on every
real piece of content.** Same for `getArticleParagraphs`,
`getCurrentPodcast`, `getPodcastTranscript`, `getCurrentQuiz`. This isn't
an edge case to patch later — it's the guaranteed outcome of the only
mechanism Tuto has for reading what a learner is actually studying.

This single gap is the direct, mechanical cause of at least four of the
six "special focus" questions below (Article/Podcast understanding
failing, Tuto not feeling like it lives in the product, guidance feeling
generic, context feeling thin) — see Special Focus section for the
detailed chain. Fixing it — pointing these tools at
`src/lib/content/queries.ts`, the same functions the real UI already uses
— is a small, mechanical, low-risk change (the architecture already
anticipated this exact swap, see `docs/ai-architecture.md`'s "Future
database integration" note) with outsized product impact. This is
Priority 0, ahead of everything else in this document.

The second-largest structural gap, of comparable severity: **Tuto has no
memory, and worse, no single identity.** There are three independent,
non-communicating `useTutoChat` instances in the product (global floating
button, the Reading step, the Dictionary overlay), none persisted past a
page refresh, and a fully-designed `LearnerProfile` system
(`src/ai/learner/`) that has never been wired to anything. Fixing tool
grounding without also fixing memory still leaves a coach that reads the
right book but forgets who it's talking to every five minutes.

---

## 1. AI Architecture

**What exists today:** A genuinely well-designed layered system —
providers (`src/ai/providers/`, OpenRouter today, swappable), a context
engine (`src/ai/context/`), Zod-validated schemas, an AI service
(`src/ai/services/ai-service.ts`) as the single entry point, a real tool
system with a bounded tool loop (`src/ai/services/tool-loop.ts`,
`MAX_TOOL_ITERATIONS = 4`), a knowledge base (`src/ai/knowledge/`), and a
learner-profile design (`src/ai/learner/`). Three live API routes:
`/api/ai/chat`, `/api/ai/vocabulary`; `/api/ai/article` is defined but has
no caller anywhere in the UI (confirmed by search — genuinely dead code
today, not stale documentation this time).

**What is good:** The seam discipline is real — one place builds the
system prompt, one place calls the provider, tools are auto-discovered
never hardcoded, adding a provider or a tool is additive. This is the kind
of foundation that *should* make a rebuild cheap rather than a rewrite.

**What is fundamentally wrong:** The architecture optimized for
*extensibility of the AI layer in isolation* and never validated
*end-to-end truth* — a tool can be "correctly" registered, schema-valid,
and discoverable, and still return fiction, because nothing in this layer
was ever pointed at the real database. The layer was built, sprint by
sprint, entirely against mock data, and "wire it to Supabase later" was
explicitly deferred every single sprint (`docs/ai-architecture.md`'s
"Explicitly out of scope" section, every sprint). Later never came.

**Why it breaks the learning experience:** A learner cannot trust Tuto to
know what they're looking at. That's not a rough edge on a coaching
product — it's disqualifying. A human tutor who can't see the book you're
holding isn't a tutor.

**What a world-class AI Coach would do instead:** Treat "does Tuto
actually know what the learner is looking at, verified against the real
database, on every single request" as the one non-negotiable acceptance
test for this entire layer — above tool count, above prompt quality, above
everything in this document.

**Priority: Critical.**

---

## 2. AI Context

**What exists today:** `LearningContext` (`src/ai/context/types.ts`) is a
thoughtful, fully-optional, nullable field set — screen, activity, current
lesson/podcast/article/quiz, selections, level, goal, streak, xp,
transcript position. `buildContextBlock()` renders only populated fields,
never fabricates. This part is well-built.

**What is good:** The schema is exactly as rich as the product needs.
Nothing structural is missing from the *shape*.

**What is fundamentally wrong:** The shape is rich; what actually gets
filled in, in practice, is thin and inconsistent across the three real
call sites. `FloatingTuto.tsx:98` — the single most-used entry point,
mounted globally on every screen — sends only `{ currentScreen }`. No
`userLevel`, no `streak`, no `goal`, despite all of it sitting one query
away in the learner's `profiles` row. `ReadingStep.tsx` and
`DictionaryOverlay.tsx` do better (article/podcast id, `userLevel`,
selection) but still never send `streak`/`xp`/`goal` — data the dashboard
already has on hand every time it renders.

**Why it breaks the learning experience:** `CEFR_AWARENESS` in the prompt
is one of the best-designed pieces of this whole system — genuinely
different registers per level, not just shorter sentences. It only fires
correctly on 2 of 3 entry points, and even there, level is the only signal
that reliably arrives. The learner's goal (IELTS prep vs. casual
conversation vs. business English) — which should reframe *everything*
Tuto says — almost never reaches the model.

**What a world-class AI Coach would do instead:** One shared
`useTutoLearnerContext()` (or equivalent) that every `useTutoChat` call
site pulls from, sourced once from the authenticated profile, so "does
Tuto know the learner's level and goal" is a property of the platform, not
a per-call-site opt-in that gets forgotten.

**Priority: High.**

---

## 3. AI Memory

**What exists today:** `MemoryStore` (`src/ai/memory/types.ts`) is a
12-line interface with **zero implementation**, by explicit sprint-1 rule,
never revisited. `LearnerProfile` (`src/ai/learner/`) is a fully-designed
schema with six example profiles — also never wired to anything real.
Client-side, `useTutoChat` (`src/hooks/useTutoChat.ts:22-28`) keeps
conversation state in a plain `useState` array and resends the full
history on every turn, by its own doc comment: *"there's no server-side
memory... every turn resends the full message history."*

**What is good:** Nothing hides this. The code is honest about being
scaffolding. That honesty makes this audit possible.

**What is fundamentally wrong:** Memory doesn't just mean "remember
yesterday's conversation." Given three separate `useTutoChat` instances
(§ AI Agent Behavior below), Tuto doesn't even reliably remember *five
minutes ago in the same session*. Open the floating chat on Home, ask
something, then tap into an article and open "Ask about this article" —
that's a different hook instance with an empty `messages` array. The
learner just watched their coach forget them mid-session.

**Why it breaks the learning experience:** Every principle in the Tuto
Taste Skill — "remember the learner," "every interaction should move
learning forward" — requires continuity across more than one browser tab
lifetime. Sprint 10 already designed exactly the right long-term
structure (`LearnerProfile.recentMistakes`,
`strongGrammarTopics`/`weakGrammarTopics`) and it sits completely unused.
The docs' own illustrative examples (Karim's repeated present-perfect
mistake, Aziz's beginner calibration) describe a coach this product does
not currently have.

**What a world-class AI Coach would do instead:** Two tiers, exactly as
`docs/ai-architecture.md`'s own "How memory will work" section already
proposes: (1) a short rolling conversation summary per learner, persisted
server-side, resolved at the top of every `generateResponse()`/
`streamResponse()` call via a `conversationId`; (2) `LearnerProfile`
actually populated from real `progress`/quiz-answer data and folded into
the system prompt. Neither requires new infrastructure — `AIService`'s
public signature already anticipates an additive `conversationId`
parameter.

**Priority: Critical.**

---

## 4. Prompt System

**What exists today:** `src/ai/prompts/tuto/sections.ts` — thirteen
independent, named sections (personality, teaching philosophy, active
learning, CEFR awareness, teaching modes, knowledge-base usage, grammar
correction style, encouragement style, follow-up learning, educational
priorities, refusal policy, formatting rules, reading assistance), joined
by `buildTutoSystemPrompt()`.

**What is good:** This is the strongest part of the entire system, and it
should be protected, not rebuilt. `ACTIVE_LEARNING`'s guided-question
default, calibrated off at A1-A2; `TEACHING_MODES`'s eight implicit
personas inferred from context rather than a menu; `CEFR_AWARENESS`'s
worked three-register example — this is what "teacher, not chatbot" is
supposed to look like, written by someone who actually thought about how
teaching works, not generic AI-safety prose. `REFUSAL_POLICY` correctly
frames refusal as a teacher's redirect, not a filter.

**What is fundamentally wrong:** Excellent instructions, starved of real
input. `KNOWLEDGE_BASE_USAGE` tells the model to call `getGrammarUnit`
before explaining from general knowledge — that tool *is* wired to real
(if small) curated content and works. But `READING_ASSISTANCE` tells the
model to explain/simplify/translate selected text using `currentArticle`
context, and the tool that would ground a *summary* or *comprehension
question* in the actual article body (`getArticleParagraphs`) is the mock
tool from § Executive Summary. The prompt promises grounded teaching; the
data layer can't deliver it for anything except grammar/vocabulary
lookups.

**Why it breaks the learning experience:** A beautifully calibrated
teaching voice that's sometimes talking about a real quiz question and
sometimes silently making one up (because `getCurrentQuiz` also 404s
against real ids) is worse than a flatter voice that's honest about its
limits — the learner has no way to tell which mode they're in.

**What a world-class AI Coach would do instead:** Once tool grounding is
fixed (§1), do nothing else to this layer — it's already at the quality
bar the rest of the product needs to catch up to.

**Priority: Low** (the prompt layer itself), but its real-world quality is
gated entirely by Priority 0/Critical items above it.

---

## 5. Tool Calling

**What exists today:** Eleven tools, auto-discovered via
`src/ai/tools/registry.ts`, executed through `executeToolCall()`
(`src/ai/tools/execute.ts`) which guarantees a structured result even on
an unknown tool name or thrown error. `MAX_TOOL_ITERATIONS = 4` with a
safety-valve final call that drops `tools` entirely.

**What is good:** The execution layer's error handling is genuinely
solid — "never plain text, never an unhandled exception" is actually true
by inspection. The four knowledge-base tools
(`getGrammarUnit`/`getVocabularyEntry`/`getTeachingAssets`/`getRelatedGrammar`)
work correctly against real (if small and hand-curated) content — they're
the one part of the tool system that isn't lying to the model.

**What is fundamentally wrong:** Seven of eleven tools
(`getCurrentPodcast`, `getPodcastTranscript`, `getCurrentArticle`,
`getArticleParagraphs`, `getCurrentQuiz`, `getSelectedVocabulary`,
`getLearningProgress`) read exclusively from `src/ai/tools/mock-data.ts`.
`getSelectedVocabulary` and `getLearningProgress` are lower-severity
(there's a separate, working real vocabulary path via
`src/lib/vocabulary/lookup.ts`'s Gemini call, and progress data is at
least partially real elsewhere) but the five content-reading tools are a
complete dead end against real data.

**Why it breaks the learning experience:** The tool loop's entire value
proposition is "ground the model in truth instead of letting it guess."
For the majority of registered tools, calling them is *worse* than not
having them, because a `{found: false}` result plus a capable model
often produces a fluent, confident, entirely fabricated answer anyway —
the tool failure is invisible to the learner.

**What a world-class AI Coach would do instead:** Each mock-backed tool's
`execute()` swaps one line for a real query against
`src/lib/content/queries.ts` (which already has `getArticleById`,
`getPodcastById`, and the transcript/quiz data attached) — exactly the
migration `docs/ai-architecture.md` itself already scoped out and never
executed. No interface change, no new architecture.

**Priority: Critical** (this is the same fix as §1, listed here for
completeness against the audit's own checklist).

---

## 6. Dashboard Experience

**What exists today:** Fully built and live — `src/app/(app)/dashboard/page.tsx`
is a real Server Component pulling Supabase profile, published podcasts/
articles, progress rows, and a real `learningBrain.getHomeRecommendations()`
call. Note: `docs/dashboard-architecture.md` is labeled "architecture
only — no screens approved yet" — **that label is stale.** The dashboard,
explore, profile, progress, and settings screens all exist and function.
Worth flagging as its own finding: several architecture docs carry status
labels that no longer match reality, which risks misleading whoever (human
or AI) reads them next as ground truth without checking the code.

**What is good:** The Learning Brain (`src/lib/learning-brain/`) is real,
deterministic, and matches the documented design closely — real scoring
(`scoring.ts`), a real rule engine, real strategies for Today's Mission /
Tuto Recommends / Continue Learning. `buildTutoNote()`
(`src/lib/tuto/messages.ts`) genuinely implements streak/weekly-goal/
re-engagement framing as described.

**What is fundamentally wrong:** The Learning Brain and Tuto AI are two
completely separate systems that never call each other. The Learning
Brain decides *what* to recommend (deterministic, real, good) but has no
channel to inform *what Tuto says about it* in conversation, and
conversational Tuto has no channel to influence *what gets recommended
next* based on what it just discussed with the learner. A learner could
tell Tuto in chat "I'm struggling with past tense" and the Learning
Brain's next-day mission selection would never know that happened.

**Why it breaks the learning experience:** This is the dashboard-level
version of the same fragmentation theme running through this whole
audit — good systems, no nervous system connecting them.

**What a world-class AI Coach would do instead:** Not a rebuild — a
narrow bridge: chat-derived signals (a topic struggled with, a mistake
pattern) write into the same `LearnerProfile`/mistake-record shape Sprint
10 already designed, and the Learning Brain's scoring function reads it
as one more input, exactly as `docs/content-lifecycle.md`'s own Layer 2
scoring already anticipates extensibility for.

**Priority: Medium** (real value, but correctly sequenced after Tuto
actually being grounded and continuous).

---

## 7. Article Experience

**What exists today:** Real pipeline — RSS/API ingestion
(`src/lib/content-engine/`), Gemini-based enrichment at ingest time
(summary, vocabulary, quiz, key takeaways, reflection —
`src/lib/content-engine/ai-processing.ts`), a fixed 6-8 step learning
session (Reading → Dictionary → Summary → Vocabulary → Flashcards → Quiz →
Complete; `ARTICLE_FLOW` in `src/lib/learning-session/types.ts`), real
paragraph content, real selection-based "Ask Tuto" via `ReadingStep.tsx`.

**What is good:** The enrichment-at-ingest model is sound — precomputing a
summary/quiz/vocabulary set once per article rather than regenerating it
per learner is the right cost/consistency tradeoff, and it's genuinely
built, not aspirational.

**What is fundamentally wrong:** Two separate things labeled "article
intelligence" exist and don't share a technique: the ingest-time Gemini
enrichment (works, real data) and the runtime `/api/ai/article` +
`getArticleParagraphs` capability the AI architecture docs describe in
detail (Sprint 5) — which has no UI caller and, even if wired up, reads
from the mock tool. A learner asking Tuto mid-session "summarize this for
me" and a learner reading the precomputed summary card get two
*differently sourced* answers that could disagree, with no reconciliation
between them.

**Why it breaks the learning experience:** Inconsistency between "the
summary LinguABC shows you" and "the summary Tuto tells you" directly
undermines the Knowledge Base's own stated goal (§ AI Architecture docs):
*consistent, LinguABC-taught answers, not independently regenerated ones
that might subtly disagree.*

**What a world-class AI Coach would do instead:** One summary,
discoverable both ways — Tuto's chat-triggered summary tool should surface
the *same* precomputed `article_details` summary the SummaryStep already
shows, not regenerate an independent one live. Cheaper, faster, and
provably consistent.

**Priority: High.**

---

## 8. Podcast Experience

**What exists today:** The deepest content type — real WhisperX-aligned
transcripts, a real `<audio>` player with a 95%-real-listen-time gate
before "Continue" (`PlayerStep.tsx`), Media Session API integration for
lock-screen controls (per `docs/production-blockers-sprint-report.md`
Priority 4, verified with Playwright).

**What is good:** This is the most production-solid content experience in
the app. The listen-time gate and transcript alignment are real
engineering, not a shortcut.

**What is fundamentally wrong:** Same disconnect as Article: `PlayerStep`
embeds `DictionaryOverlay` (real, works) but any deeper "ask Tuto about
this episode" conversation runs into the same `getCurrentPodcast`/
`getPodcastTranscript` mock-data wall. A learner mid-podcast asking "what
did the speaker mean by X" gets a Tuto that cannot actually retrieve the
transcript it's sitting on top of.

**Why it breaks the learning experience:** The single most content-rich,
best-instrumented surface in the product is exactly where Tuto's
grounding failure is most visible and most damaging — the learner can see
the transcript on screen while Tuto fails to reference it.

**What a world-class AI Coach would do instead:** Same fix as §1/§5,
applied here first — this is the highest-leverage single surface to fix
given how much real, high-quality data (aligned transcript) is already
sitting right there unused by the tool layer.

**Priority: Critical** (as a consequence of §1).

---

## 9. Dictionary Experience

**What exists today:** The best-integrated AI feature in the product.
Tap a word → curated lookup if it exists in `content.vocabulary` (instant,
real, DB-backed) → else a live Gemini call (`src/lib/vocabulary/lookup.ts`)
for a genuinely generated definition/POS/Uzbek translation/example → an
"Ask Tuto" escalation into a full chat turn via `/api/ai/vocabulary`.

**What is good:** This is a legitimately well-designed three-tier
fallback, and — unlike Article/Podcast tools — the underlying data (the
word itself, plus curated vocabulary) doesn't depend on the broken mock
tool layer at all, so it actually works end to end. Worth holding up as
the internal reference pattern for how the other content types should
work.

**What is fundamentally wrong:** It's an island. Its own `useTutoChat`
instance shares nothing with the Reading-step chat or the global chat —
ask a follow-up in the dictionary overlay, then open "Ask Tuto" globally,
and the second conversation has no idea the first one happened, even
though it happened sixty seconds ago on the same page.

**Why it breaks the learning experience:** A learner experiences this as
"three different assistants," not one coach — directly the "does the AI
feel like it lives inside the product" question from Special Focus.

**What a world-class AI Coach would do instead:** Nothing about the
lookup logic — keep it. Unify only the conversation layer underneath it
(§3 fix) so a follow-up question anywhere carries forward.

**Priority: Medium** (the feature works; the isolation is a memory-layer
problem, already Critical elsewhere).

---

## 10. Quiz Experience

**What exists today:** 3-4 AI-generated (Gemini, at ingest time)
multiple-choice questions per content item, instant feedback + explanation
per answer, no timer, no retake gating, a simple count shown once
(`QuizStep.tsx`).

**What is good:** This correctly implements the domain model's explicit
philosophy — "reinforcement, not evaluation," never gating completion,
never scored like an exam (`docs/domain-model.md` §Podcast Model). No
percentages, no pressure. Genuinely matches the product's stated values.

**What is fundamentally wrong:** Nothing about the quiz's *design* is
wrong. What's wrong is everything around it: the quiz result never feeds
`LearnerProfile.recentMistakes` or the Learning Brain's scoring (there's
no wiring for either, per §3/§6), so a learner who gets the same grammar
point wrong three quizzes in a row gets treated as a stranger each time —
exactly the "repeated mistakes" scenario `docs/ai-architecture.md`'s own
Sprint 10 illustrative example (Karim) describes Tuto handling gracefully.
Today, nothing captures that pattern at all.

**Why it breaks the learning experience:** A quiz that doesn't inform
what happens next isn't reinforcement, it's a formality. The docs' own
definition of reinforcement implies a feedback loop; only half of that
loop (give feedback in the moment) is built.

**What a world-class AI Coach would do instead:** Write each wrong answer
into a `GrammarMistakeRecord`/`VocabularyMistakeRecord`
(`src/ai/learner/performance.ts` — schema already exists, unused), and
have both the Learning Brain and Tuto's system prompt read from it.

**Priority: Medium.**

---

## 11. Conversation Flow

**What exists today:** Three independent chat surfaces, each backed by
its own `useTutoChat()` call: the global floating "Ask Tuto"
(`FloatingTuto.tsx`), the Reading-step contextual chat
(`ReadingStep.tsx`), and the Dictionary-overlay "Ask Tuto" escalation
(`DictionaryOverlay.tsx`). Streaming works correctly (`streamChatCompletion`,
real SSE parsing). Retry-on-error, hidden context injection, and
fresh-conversation-on-new-selection are all thoughtfully handled *within*
a single instance.

**What is good:** The single-conversation mechanics (streaming, retry,
abort, hidden-context stitching) are well-engineered — this isn't a naive
chat widget.

**What is fundamentally wrong:** "Conversation flow" implies one
conversation. This product has three, permanently walled off from each
other, none surviving a page refresh, none persisted anywhere. A learner
cannot have a single continuous relationship with Tuto across a session,
let alone across days.

**Why it breaks the learning experience:** This is the most literal,
mechanical explanation for "the learner still has to drive every
conversation" — there's no shared state for Tuto to have been driving
*toward* in the first place. Every entry point starts at zero.

**What a world-class AI Coach would do instead:** One conversation
resource (server-persisted, keyed by `conversationId` per learner —
possibly one live thread, possibly scoped-but-linked threads per content
item, a real product decision, not a technical one), all three entry
points read/write the same thread, `useTutoChat` becomes a thin client
over that rather than the owner of the state.

**Priority: Critical** (same root cause as §3).

---

## 12. Learning Psychology

**What exists today:** No percentage bars, no leaderboards, no exam-style
scoring anywhere post-onboarding (verified against
`docs/dashboard-architecture.md` §12's explicit rules — the built product
matches this). Streak-loss handling is designed to be non-punitive
(`buildTutoNote`/`dashboard-user-flows.md` §C14). XP exists but is framed
as growth, not a grade.

**What is good:** The product's psychological stance is coherent and
actually reflected in what's built, which is rarer than it sounds — most
products drift from their stated philosophy under deadline pressure; this
one mostly hasn't.

**What is fundamentally wrong:** Psychology-by-design (deterministic
messages, careful framing) covers the moments the team explicitly
designed for. It has no coverage for the moments that happen *inside* a
conversation with Tuto — a learner expressing frustration, embarrassment,
or discouragement mid-chat gets whatever the general prompt sections
produce, which is good but generic, not tied to the same "never punitive,
always forward-looking" design language that governs the rest of the
product. There's no bridge between the Tuto Taste Skill's psychological
principles and a runtime signal like "this learner just failed the same
quiz question twice."

**Why it breaks the learning experience:** The moments most likely to
determine whether a learner comes back tomorrow are exactly the ones
happening in an unstructured chat, currently governed only by general
prompt guidance, not by the same deliberate design rigor applied to
streak loss.

**What a world-class AI Coach would do instead:** Extend
`EDUCATIONAL_PRIORITIES`/`ENCOURAGEMENT_STYLE` with the same signals
`buildTutoNote` already computes (streak state, recent struggle pattern)
once §3/§10's memory work lands — this is a prompt-context addition, not
new psychology.

**Priority: Medium** (real, but downstream of memory being fixed).

---

## 13. Teaching Quality

**What exists today:** Covered in depth in §4. Also: the Knowledge Base
(`src/ai/knowledge/`, six grammar units, five vocabulary entries, fifteen
teaching assets) is real, curated, cross-referenced, and — unlike the
content tools — actually wired via `KNOWLEDGE_BASE_USAGE` and genuinely
consultable by the model.

**What is good:** For grammar/vocabulary questions not tied to a specific
piece of content, teaching quality is already close to the product's
stated ambition — active learning, level-calibrated register, teaching
modes, consistent curated answers.

**What is fundamentally wrong:** Teaching quality craters the moment the
question is about the specific article/podcast/quiz the learner is
looking at — precisely because of §1. A prompt this well-designed
deserves a data layer that doesn't undercut it.

**Why it breaks the learning experience:** Learners don't experience
"the prompt layer" and "the tool layer" as separate systems — they
experience one coach who's brilliant about grammar in the abstract and
unreliable the moment it's about *their* lesson.

**What a world-class AI Coach would do instead:** Same fix as §1. Nothing
new needed in the prompt layer.

**Priority: Critical** (via §1) for content-grounded teaching; **Low**
for the prompt layer itself.

---

## 14. Product UX

**What exists today:** Desktop/tablet/mobile-considered layouts throughout,
a real design system (`docs/design-system.md`), thoughtful details (the
`FloatingTuto` safe-area math, drag-to-expand bottom sheets, Media Session
integration). Known, already-documented gaps: onboarding answers can be
silently lost on save failure, `/dashboard` isn't gated on
`onboarding_completed` for a same-session logged-in user, password reset
breaks across devices (all three from `docs/beta-launch-audit.md`, still
apparently unfixed as of this audit — worth re-verifying before beta,
they weren't in scope to re-check here).

**What is good:** The team already produced a rigorous, honest UX audit
of its own (`beta-launch-audit.md`) with the same "brutal honesty, no
compliments" standard this document is trying to meet — that audit is
worth executing on directly, not repeating here.

**What is fundamentally wrong, specific to the AI Coach:** The "Ask Tuto"
entry point is discoverable but not integrated into the learning
loop — it's a FAB, not a felt presence. `docs/dashboard-architecture.md`
§3 states "Tuto's presence is felt on every screen" as a requirement; in
practice Tuto is felt as *a button*, with the actual coaching happening
in a bottom sheet that's structurally identical regardless of whether
you opened it from Home, an article, or a podcast (same `TutoChatSheet`,
different `emptyState` copy). The docs' promise is closer to Tuto being
ambient; the reality is Tuto being summonable.

**Why it breaks the learning experience:** A summonable assistant caps
how proactive and habitual coaching can ever feel, independent of how
good the model's answers are once summoned.

**What a world-class AI Coach would do instead:** Not a redesign — the
same three current entry points, but Tuto occasionally *initiating*
(surfaced via the existing note-on-Home mechanism extended into an
invitation to actually talk, e.g. "Tuto noticed you missed the same
question twice — want to go over it?") once the mistake-tracking in
§10/§3 exists to trigger it honestly, never fabricated.

**Priority: Medium** (a real UX ambition gap, but it's gated on the data
existing to make proactivity honest, not performative).

---

## 15. AI Agent Behavior

**What exists today:** Bounded tool loop (4 iterations + forced final
answer), graceful degradation on every tool failure
(`{found: false, reason}`, never a thrown error into the loop), no
narration of tool use to the learner (`KNOWLEDGE_BASE_USAGE`'s explicit
"never mention 'let me check the database'" rule) — genuinely disciplined
agent design.

**What is good:** The loop will never hang, never crash the conversation,
never leak its internals. This is exactly the invisible, dependable
infrastructure an agent layer should be.

**What is fundamentally wrong:** A well-behaved agent loop wrapped around
mostly-fictional tools produces confident, well-formed, structurally
correct *wrong* answers — which is worse than an agent that visibly
struggles, because nothing about the interaction signals unreliability to
the learner. The agent's discipline is currently spent making failure
invisible rather than making success real.

**Why it breaks the learning experience:** Trust, once a learner notices
Tuto was confidently wrong about their own article, is expensive to win
back — more expensive than the cost of the fix in §1.

**What a world-class AI Coach would do instead:** Same fix as §1 — once
tools return real data, this layer's existing discipline becomes an
asset instead of a liability.

**Priority: Critical**, entirely inherited from §1/§5.

---

## Special Focus — direct answers

**Why does Tuto still feel like ChatGPT?**
No persisted memory (§3) — every conversation restarts from nothing, in
up to three fragmented instances (§11) — and no `LearnerProfile`
integration (§3/§10) despite it being fully designed. The most-used entry
point (`FloatingTuto`) sends the thinnest context of the three (§2). A
generic assistant with a good system prompt and no memory of you *is*
what "feels like ChatGPT" means.

**Why does the learner still need to drive every conversation?**
Tuto never initiates from inside a conversation, and the one place it
does proactively speak — `buildTutoNote()` on the dashboard — is a
deterministic, separate code path (`src/lib/tuto/messages.ts`) that
never triggers or feeds into an actual Tuto Chat turn. Two different
Tutos: a scripted note-writer and a reactive chatbot that have never met.

**Why doesn't Tuto naturally guide learning?**
The prompt-level guidance instincts (`ACTIVE_LEARNING`, `TEACHING_MODES`)
are genuinely well-built (§4/§13) but entirely reactive — they only
activate once summoned, and the Learning Brain that actually decides
what a learner should study next never talks to the conversational layer
at all (§6). Two independent "guidance" systems, disconnected.

**Why can context still be lost?**
Three independent, unpersisted `useTutoChat` instances (§11) that share
nothing — not across entry points in the same session, and nothing
survives a refresh, since state lives only in React `useState`.

**Why can Article or Podcast understanding ever fail?**
Because it always will — `getCurrentArticle`, `getArticleParagraphs`,
`getCurrentPodcast`, `getPodcastTranscript`, and `getCurrentQuiz` are
hardcoded against fictional mock ids that never match a real Supabase
content id (§1/§5/§7/§8, verified directly in
`get-current-article.ts`/`get-article-paragraphs.ts`). Not a flaky
dependency — a guaranteed miss, every time, for every real learner.

**Why doesn't the AI feel like it lives inside the product?**
Because it's actually five separate systems wearing one mascot: the
decorative pose-renderer, the deterministic dashboard-note writer, the
real conversational AI, the deterministic Learning Brain, and an unused
`LearnerProfile` design — built in different sprints, each internally
solid, never given a nervous system connecting them. "Living inside the
product" requires one continuous thing; this is five.

---

## The Architecture Change Worth Proposing

Per this document's mandate to challenge architecture, not just list bugs:
the fix is **not** a new AI system, a different model provider, or a
rewrite of the prompt/tool/service layers — all of that is sound and
should be kept. The actual architectural change is **collapsing five
disconnected Tuto subsystems into one, around two new, small, real
seams**:

1. **A grounding seam**: swap every content-reading tool's mock lookup for
   the same `src/lib/content/queries.ts` functions the real UI already
   calls. Mechanical, low-risk, exactly what the AI architecture docs
   already anticipated and never executed.
2. **A memory seam**: a `conversationId` per learner (or per
   learner+content-thread — a product decision, not a technical one),
   persisted server-side, resolved at the top of every AI service call,
   feeding a real `LearnerProfile` that both the prompt and the Learning
   Brain read from.

Everything else in this audit — proactive guidance, cross-surface
continuity, the dashboard/chat bridge, mistake tracking informing
recommendations — is a *consequence* of those two seams existing, not a
separate rebuild. This is deliberately the smallest change that converts
five well-built, isolated systems into one coach.

---

## Priority Roadmap

**Critical (do first, in this order):**
1. Ground the five content-reading tools in real Supabase data (§1/§5/§7/§8/§13/§15).
2. Give Tuto persistent, server-side conversation memory + wire `LearnerProfile` (§3/§11).

**High:**
3. Broaden `LearningContext` sent from every chat entry point — especially
   `FloatingTuto` — to include level/goal/streak, not just screen (§2).
4. Reconcile ingest-time article/podcast summaries with runtime
   Tuto-generated ones so they can't disagree (§7).

**Medium:**
5. Bridge Learning Brain scoring with chat-derived mistake/struggle signals (§6/§10).
6. Extend psychological framing (non-punitive, forward-looking) into
   in-chat moments using the same signals as `buildTutoNote` (§12).
7. Let Tuto initiate — genuinely, only once mistake-tracking makes it
   honest, not performative (§14).

**Low:**
8. Nothing further needed in the prompt layer itself (§4) — protect it,
   don't touch it, until the above land.

**Also worth a pass, lower urgency, adjacent to this audit:**
- Reconcile stale "architecture only" status labels on
  `dashboard-architecture.md`/`dashboard-user-flows.md`/
  `content-lifecycle.md`/`ai-architecture.md` against what's actually
  built, so future audits (human or AI) start from ground truth instead
  of re-discovering the gap (§6).
- `ReflectionStep.tsx` exists but is dead code, unreachable from either
  flow — decide to wire it in or remove it.
- `/api/ai/article` has no caller anywhere in the UI — decide to wire it
  or fold its capability into the tool-grounded chat path instead of
  maintaining a second, unused code path.
