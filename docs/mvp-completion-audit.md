# MVP Completion Audit — What's Between Today's Codebase and a Complete AI English Coach

Status: **audit only — no code changed as part of this document.** Per
instruction: the AI architecture (Real Content Layer, Memory Layer,
Learning Signals, Learning Engine, Coach Planner, Learning Session Engine,
Turn Classifier, Learning Orchestrator) is frozen unless a correctness bug
is found. Nothing below proposes redesigning any of those modules or
adding a new abstraction layer — every item reuses something already
built.

## Method

Three parallel research passes (AI grounding/memory/orchestrator wiring;
Learning Brain/chat-bridge/proactivity/screen inventory; a fresh recheck
of every finding in `docs/beta-launch-audit.md`), each grounded in direct
file/line reading against the current repo — not against the older
`docs/ai-coach-audit.md`, which predates the Phase 2–8 AI work and is
materially stale in several places (noted below where it matters). Written
from the perspective of a first-time learner going signup → onboarding →
dashboard → a real lesson → a return visit.

**The single biggest finding, up front:** the AI architecture work
(Phases 2–8) is real, not vaporware — tool grounding against real Supabase
content, real persisted signals, a real Learning Engine/Coach
Planner/Session Engine/Turn Classifier/Orchestrator pipeline all
genuinely run on every chat turn. But two things sit right next to that
good work and undercut it: (1) it's invisible — nothing in the UI shows a
learner that any of this structured coaching is happening, so it reads as
"a chatbot with a good prompt," not a coach; and (2) it's disconnected
from the deterministic Dashboard/Learning Brain recommendation system —
two systems that both claim to know what the learner needs, that never
talk to each other. Neither requires new architecture to fix — both are
about finishing the wiring between systems that already exist.

---

## P0 — Required before launch

### P0.1 — Tuto can fabricate the learner's own stats when asked directly

**Why it matters:** "How am I doing?" / "How many lessons have I
finished?" / "What's my longest streak?" are exactly the questions a
first-time learner asks their coach in the first week. Real progress data
already exists and is already shown correctly on the Dashboard/Progress
pages. If Tuto answers the same question with fabricated numbers, that's
not a rough edge — it's the coach lying about the one thing it should
never get wrong: the learner's own history.

**Current gap:** `getLearningProgress` (`src/ai/tools/definitions/get-learning-progress.ts:33-36`)
returns `totalLessonsCompleted`/`weeklyGoalMinutes`/`weeklyMinutesSoFar`/
`longestStreak` from `MOCK_PROGRESS` in `src/ai/tools/mock-data.ts` —
hardcoded fiction. (`streak`/`xp`/`level` in the same tool *are* real,
sourced from `context.learningContext` — only the four fields above are
fake.) Real data for all four already exists: `dashboard/page.tsx:31-34`
and `progress/page.tsx:31-34` query the real `profiles`/`progress` tables
for exactly this.

**Smallest implementation:** Swap the four mocked fields in
`getLearningProgress`'s `execute()` for a real query — the same pattern
already used to fix `getCurrentArticle`/`getCurrentPodcast` (a repository
call, not a new repository). `LearnerRepository`/`ContentRepository`
(`src/ai/data/`) already have Supabase access; add the two missing
aggregates (total completed content items, weekly minutes so far) as a
query against the existing `progress` table, mirroring what
`progress/page.tsx` already computes.

**Estimated effort:** Small (0.5–1 day).

**Dependencies:** None beyond existing `src/ai/data` repositories
(frozen, reuse only — no new repository needed, just a new method or an
extended existing one).

---

### P0.2 — Chat state is incoherent: visible history vanishes on refresh, invisible memory bleeds across surfaces

**Why it matters:** "Remember the learner" is a stated project principle.
Today the product does the opposite of both halves of that promise in a
way a learner can actually notice: refresh the page mid-conversation and
Tuto visibly forgets everything; meanwhile, server-side, all three chat
surfaces (global floating chat, the Reading-step chat, the Dictionary
overlay) are silently reading and writing the *same* underlying
conversation memory (because the client never sends a `conversationId`
and the server always defaults to the learner's own user id), so Tuto can
reference something from a different tab's conversation that the learner
never saw asked or answered. Both halves — "forgets what just happened"
and "remembers something the learner can't see" — actively erode trust.

**Current gap:** `useTutoChat` keeps messages in a plain `useState` with
no persistence (`src/hooks/useTutoChat.ts:31`); confirmed no
`sessionStorage`/`localStorage` anywhere in the chat path. The client
never passes a `conversationId` (zero matches for it in `src/hooks`/
`src/components`); `src/app/api/ai/chat/route.ts:59` silently falls back
to `requestedConversationId ?? user?.id ?? null` — meaning every
authenticated learner has exactly one server-side conversation thread for
life, shared across all three surfaces, capped at 12 recent messages
(`MAX_REMEMBERED_MESSAGES`, `conversation-repository.ts:5`), while none of
the three UI surfaces shows that shared history.

**Smallest implementation:** On mount, have `useTutoChat` hydrate its
initial `messages` state from the already-persisted `ConversationMemory`
(the same `recentMessages` the server already reads every turn) instead
of starting from an empty array — a thin "get my conversation" read using
the existing `ConversationRepository.get()`, exposed via a small addition
to the existing chat route or a one-line new GET handler. This doesn't
require solving "should each surface have its own thread" (a real product
decision, out of scope for this audit) — it just makes what's visible
match what's already true server-side, which is the actual bug a learner
experiences.

**Estimated effort:** Small–Medium (1–2 days).

**Dependencies:** `ConversationRepository` (frozen, reuse only).

---

### P0.3 — The Dashboard's recommendation engine and Tuto's conversational AI never talk to each other

**Why it matters:** This is the product-level version of "does this feel
like one coach or five disconnected systems." A learner who tells Tuto in
chat "I keep messing up past tense" (already captured as a real,
persisted signal — see below) will have that completely ignored by
tomorrow's Today's Mission. A learner who does badly on three quizzes in
a row (also already tracked) gets no different Explore ranking. This is
precisely the gap between "reinforcement" and "a formality" the domain
model itself warns against, now confirmed still open.

**Current gap:** `src/lib/learning-brain/*` (scoring, rule engine,
strategies) has zero imports from `@/ai` — confirmed by directory-wide
grep; its only Supabase touch is the `daily_missions` table plus
`profiles`/`progress`, never `learning_signals`. Meanwhile, inside
`src/ai/`, quiz mistakes genuinely are captured and used —
`QuizStep.tsx:38-45` → `record-quiz-answer.ts:58-67` writes a real
`quiz_answer_recorded` signal → `learning-engine/engine.ts:148-171`
(`computeQuizAnswerMastery`) derives per-topic mastery → `coach-planner/
planner.ts:105-123` uses it to steer *what Tuto says in chat*. That whole
chain never reaches `src/lib/learning-brain`, and `src/lib/learning-brain`
never reaches it back.

**Smallest implementation:** Not a new system — feed one more input into
`src/lib/learning-brain/scoring.ts`'s existing candidate-scoring function
(documented in `docs/dashboard-architecture.md` §8 as
`score = level_match + goal_alignment_match + topic_overlap + freshness +
variety_bonus`): add a `weak_topic_boost` term computed from the
already-real `LearnerState.weakGrammarTopics`/`weakVocabularyTopics`
(`src/ai/learning-engine`, frozen, reuse only) by having the
Dashboard/Explore server component call the existing
`LearnerRepository.getLearnerState()` (or the equivalent
`computeLearnerState()`) alongside the queries it already makes, and pass
the result into `getRecommendations(...)` as one more parameter. Purely
additive to an existing scoring function signature — no new repository,
no new signal type, no new AI layer.

**Estimated effort:** Medium (2–4 days) — the wiring is small; the
scoring-weight tuning (how much a weak topic should boost a candidate)
needs a little product judgment, not new engineering.

**Dependencies:** `src/ai/learning-engine`'s `LearnerState` (frozen,
reuse only), `src/ai/data`'s repositories (frozen, reuse only).

---

### P0.4 — The Learning Session Engine / Turn Classifier / Orchestrator pipeline is real but has zero UI surface — a learner can never perceive it

**Why it matters:** Phases 4–8 exist specifically so Tuto behaves like a
structured tutor — a session with a shape (warm-up → review → guided
practice → celebration), hint escalation, mastery recognition — rather
than a generically-prompted chatbot. Today, all of that machinery only
ever adjusts *wording* inside anonymous chat bubbles. A learner has no way
to perceive "Tuto is walking me through something with a plan" versus "an
LLM replied to my message" — which is exactly the "still feels like
ChatGPT" failure mode this whole rebuild exists to fix. Confirmed this
pipeline runs correctly (`orchestrateSession`/`planLearningSession` are
invoked from `ai-service.ts` on every real chat turn with dependencies
present) — the problem isn't correctness, it's that the product never
shows its work.

**Current gap:** `OrchestratorDecision` (`action`, `reason`, session
step) is computed every turn but only consumed inside
`buildTutoSystemPrompt()` (`teaching-plan-block.ts` and sibling prompt
sections) — never returned in the `/api/ai/chat` response payload, never
read by any component. Separately, and worth being precise about: the
*deterministic* lesson flow a learner actually steps through
(`LearningSessionView` → `PlayerStep`/`ReadingStep`/`QuizStep`/...) is a
completely different, older, fixed-step system that never calls
`learning-session-engine`/`learning-orchestrator` at all — these are two
different concepts that happen to share the word "session": one is "the
AI's pacing model for a Tuto conversation," the other is "the fixed steps
of consuming one article/podcast." That's a legitimate, deliberate
separation, not a bug — but it means the orchestrator's effect is
entirely confined to conversational replies, with literally no visible
trace of it anywhere.

**Smallest implementation:** Reuse what's already built, don't build a
progress UI: (1) include `orchestratorDecision.action` in the existing
`/api/ai/chat` response payload (it's already computed server-side,
simply not returned); (2) map `action === "celebrate"` to the mascot's
existing celebratory pose (Tuto's pose-file system is already built per
`CLAUDE.md`'s mascot mapping) for that turn's avatar instead of the
default static pose, and map `action === "give-hint"` to a small existing
visual affordance if the design system has one (e.g. a distinct bubble
tint), otherwise skip that part — celebration is the highest-value,
lowest-effort win here since the asset already exists. This makes the
plan *felt* without inventing a session-progress screen.

**Estimated effort:** Medium (2–3 days), almost entirely on the "wire the
already-computed value through one more layer" side, not new logic.

**Dependencies:** `src/ai/learning-orchestrator`'s `OrchestratorDecision`
type (frozen, reuse only), the existing Tuto mascot pose system.

---

## P1 — Strongly recommended

### P1.1 — Explore's empty-state copy is still wrong for a genuinely-empty category

**Why it matters:** A first-time learner browsing a content type with
zero published items yet sees "No {type} match those filters" even
though they applied no filter — reads as the app malfunctioning rather
than "this is still early." `docs/dashboard-architecture.md` §9 already
states empty/no-result states should be Tuto-voiced and honest about why.

**Current gap:** Confirmed still present. `ExploreView.tsx:311-316`'s
ternary only branches on whether a search `query` is active; it never
checks `hasActiveFilter` (`ExploreView.tsx:105`), so "no filters, no
query, catalog is just empty" and "filters excluded everything" render
identical copy.

**Smallest implementation:** Extend the existing ternary to a 3-way
branch: query set → "No {type} found for '{query}'"; filters active, no
query → "No {type} match those filters"; neither → a Tuto-voiced "Tuto
hasn't added any {type} here yet — check back soon."

**Estimated effort:** Trivial (<1 hour).

**Dependencies:** None.

---

### P1.2 — No first-time product tour — Tuto's floating badge and the 4-tab nav are unexplained on first arrival

**Why it matters:** The signup/onboarding wizard is thorough and already
sets real expectations, but the moment a first-time learner lands on
Dashboard, nothing tells them what Tuto's floating badge does, or that
tapping it opens a coach, not decoration. Confirmed no tour/walkthrough/
coach-mark system exists anywhere in the codebase today (broad search for
`tour`, `walkthrough`, `spotlight`, `coach-mark`, first-visit flags — zero
real hits).

**Current gap:** No first-session UI guidance beyond the wizard itself.

**Smallest implementation:** A single dismissible tooltip anchored to
`FloatingTuto`'s badge, shown once (gated by a `localStorage` flag or a
new boolean on the existing `profiles` row, mirroring how
`onboarding_completed` already works), reading something like "Tap me
anytime you have a question!" — no new screen, no multi-step tour system.

**Estimated effort:** Small (1 day).

**Dependencies:** None beyond `FloatingTuto` (already built).

---

### P1.3 — Tuto's dashboard note is static text — it can never become a conversation

**Why it matters:** `buildTutoNote()` is genuinely well-designed
(streak/re-engagement framing, real data) but today it's inert — a
learner reading "Two more days to a 7-day streak" has no way to tap into
that thought and talk to Tuto about it. This caps how personal/proactive
the coaching can ever feel, independent of how good the underlying
model is.

**Current gap:** `TutoNoteCard.tsx:16-23` is a plain `<div>` with no
`onClick`; `buildTutoNote`'s output never opens a chat turn.

**Smallest implementation:** Make the card tappable, opening the existing
`FloatingTuto`/`useTutoChat` sheet pre-seeded with the note's text as the
opening line — reuses the existing chat sheet and hook, no new
conversation-initiation system. (Full "Tuto proactively messages you
based on a missed-question pattern" is a larger, separate idea gated on
P0.3's wiring landing first — this item is just "make the thing already
on screen clickable.")

**Estimated effort:** Small (1 day).

**Dependencies:** `FloatingTuto`/`useTutoChat` (already built).

---

### P1.4 — Zero re-engagement channel exists — streaks have no way to pull a learner back

**Why it matters:** The product's core mechanic (daily streak, daily
mission) depends entirely on the learner remembering to open the app.
There is currently no push notification, email reminder, or any
"come back tomorrow" mechanism, even as a stub — confirmed by `SettingsView.tsx:16-27`'s
own doc comment explicitly stating this was a deliberate choice ("faking
a working-looking toggle... would be worse than not having the row") and
by a broad search finding no push/email/cron re-engagement code anywhere.
For a habit-based coaching product, this is a real retention risk worth
flagging even though it's legitimately a larger feature than everything
else on this list.

**Current gap:** No notification infrastructure of any kind.

**Smallest implementation:** The smallest real version is a single daily
email (not push — no service worker/subscription infra needed) sent to
learners who haven't opened the app by a fixed local time, reusing
`buildTutoNote()`'s existing streak/re-engagement copy logic verbatim as
the email body, triggered by one scheduled job hitting one existing
Supabase query. Deliberately not scoped as push notifications, which
would need new client-side subscription infrastructure this audit isn't
recommending yet.

**Estimated effort:** Medium (3–5 days) — the only item on this list that
requires genuinely new (if small) infrastructure: an email-sending
integration and a scheduled trigger.

**Dependencies:** An email provider/credential (new integration, product
decision on which), `buildTutoNote` (already built, reuse the copy logic).

---

### P1.5 — `getSelectedVocabulary` still returns fabricated data

**Why it matters:** Same category of issue as P0.1, lower traffic: if
Tuto's tool loop is ever exercised for "the word I just selected" outside
the Dictionary overlay's own (real, working) lookup path, it returns one
of two hardcoded fake entries.

**Current gap:** `get-selected-vocabulary.ts:29` reads
`MOCK_VOCABULARY[word]`, a 2-entry hardcoded dictionary.

**Smallest implementation:** Either point it at the same real vocabulary
path the Dictionary overlay already uses successfully
(`src/lib/vocabulary/lookup.ts`), or — since that overlay's real lookup
already handles this need end-to-end without ever calling this tool —
remove the tool entirely if it's confirmed unreachable in practice. Either
resolution is small; removal is the more honest fix if the working path
already covers the need (see P2.1's related note on not keeping unused
code around).

**Estimated effort:** Small (0.5–1 day either direction).

**Dependencies:** `src/lib/vocabulary/lookup.ts` (already built, reuse
only).

---

### P1.6 — Onboarding-completion gating is duplicated five times instead of centralized

**Why it matters:** Not a user-facing bug — confirmed the fix landed
correctly on all five `(app)` pages (`dashboard`, `explore`, `profile`,
`progress`, `settings` each independently check `onboarding_completed`
and redirect to `/welcome`). But it's the same guard clause copy-pasted
five times rather than one shared layout/check, which is exactly the kind
of duplication that silently regresses the next time a sixth `(app)` page
is added and someone forgets the check.

**Current gap:** No `(app)/layout.tsx`-level (or middleware-level) single
source of truth for this gate — five independent per-page copies.

**Smallest implementation:** Move the existing check (verbatim logic,
already correct) into a shared `(app)/layout.tsx` Server Component that
every one of the five pages already sits under, deleting the five
duplicated copies.

**Estimated effort:** Small (0.5 day).

**Dependencies:** None.

---

## P2 — Nice-to-have

### P2.1 — Delete the dead `src/ai/memory` scaffolding

**Why it matters:** `src/ai/memory`'s `MemoryStore` (a 12-line interface,
zero implementation) was superseded by the real, working
`src/ai/data`/`ConversationRepository` system built later. It's not
"frozen architecture" in the sense of being load-bearing — it's genuinely
unused dead code sitting next to the system that replaced it, which risks
confusing the next person (or agent) who reads it as current design.

**Smallest implementation:** Confirm zero remaining imports, then delete
the package outright — matches the project's own stated convention ("if
you are certain something is unused, delete it completely").

**Estimated effort:** Trivial (<1 hour, mostly verification).

**Dependencies:** None.

---

### P2.2 — Several in-code doc comments describe a data gap that's already closed

**Why it matters:** `signal-repository.ts:27-31`, `learner-repository.ts:53-56`,
and `learning-engine/engine.ts:232` all still assert that no
`quiz_answer_recorded` evidence exists yet / QuizStep only reports an
aggregate score — no longer true since `QuizStep.tsx` was wired to emit
per-question evidence. The runtime logic itself is fine (it dynamically
checks for evidence rather than assuming its absence), but the comments
would mislead the next reader (human or AI) into re-diagnosing an
already-solved problem.

**Smallest implementation:** Update the three comments to reflect current
reality.

**Estimated effort:** Trivial (<1 hour).

**Dependencies:** None.

---

### P2.3 — Standalone Podcast Detail/Player, Vocabulary Deck, Daily Challenge, Weekly Report, dedicated Tuto Chat screen

**Why it matters:** All confirmed either "Coming Soon" (correctly framed,
no dead links) or simply not linked to from anywhere in the current UI —
per `docs/dashboard-architecture.md`'s own "Coming Soon is a strategy, not
a placeholder apology" design, this is intentional roadmap transparency,
not a launch gap.

**Current gap:** No code exists for any of these (confirmed by search);
`FloatingTuto.tsx:101`'s reference to a `/tuto-chat` route is dead/
aspirational — no such route file exists.

**Smallest implementation:** None needed for launch — build each when its
underlying content/feature work is actually prioritized, following the
existing "additive checklist" pattern `dashboard-architecture.md` §10
already documents for adding a new content type.

**Estimated effort:** N/A (deferred by design).

**Dependencies:** N/A.

---

## Verify before launch (not implementation items — zero code risk, but unconfirmed)

- **Real signup → email confirmation → login round-trip**, and **real
  password-reset email round-trip across two devices**, against the
  actual production Supabase project — this sandbox has no network
  egress to it, so the fixes confirmed in code (see below) have never
  been exercised against real infrastructure.
- A visual pass on a real phone/tablet/desktop for the full core journey
  (signup → onboarding → dashboard → a real lesson → chat with Tuto) —
  everything in this audit is grounded in code reading, not a rendered
  visual check.

## Confirmed already fixed since the last audit (no action needed)

Re-verified fresh against current code, not assumed from the older doc:
onboarding answers are no longer silently wiped on a failed save
(`ai-plan/page.tsx`), all five `(app)` pages now correctly gate on
`onboarding_completed` (see P1.6 for the remaining DRY-ness nit, not a
functional bug), password reset now explicitly detects an
invalid/expired/wrong-device link before showing the form, signup's
"check your email" screen now has a "Back to Sign In" link, and both
Learning Session routes now have their own on-brand `error.tsx` instead
of falling through to the bare `global-error.tsx`.
