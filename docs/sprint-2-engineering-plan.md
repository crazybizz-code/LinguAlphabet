# LinguAlphabet — Sprint 2 Engineering Plan

## Onboarding & Learning Brain Initialization

**Role:** Technical Lead / Engineering Orchestrator
**Status:** Approved plan for implementation — no production code in this document
**Date:** 2026-07-02

> **Source-of-truth note:** The Product Blueprint document referenced in the task was not found in the repository, its branches, or GitHub issues/PRs. This plan reconstructs the stage model from (a) the five explicit product decisions supplied with the task, (b) the existing Sprint 1 onboarding implementation, and (c) the LearningBrainProfile field list. Every assumption is marked **[ASSUMPTION — confirm against Blueprint]**. The proposed architecture is stage-registry-driven, so correcting stage content after confirmation is a content change, not an architectural change.

---

## 1. Repository Analysis

**Stack reality (differs from what a casual reading of the README implies):**

| Aspect | Finding |
|---|---|
| Framework | None. Vanilla JavaScript ES modules + Vite 8. No React/Vue. No TypeScript. No test runner. No linter. |
| Entry | `index.html` (1,252 lines — all screens pre-rendered as hidden `<div>`s) + `src/main.js` (3,942 lines — the entire app orchestrator) |
| Styling | Single `src/style.css` (4,195 lines), CSS custom properties, hand-written animations |
| Backend | Supabase via a **hand-rolled REST client** in `src/db.js` (raw `fetch` against `/auth/v1/*` and `/rest/v1/*`) — `@supabase/supabase-js` is NOT a dependency |
| Local persistence | `UserState` (localStorage, key `linguAlphabet_user`) is the real store; an IndexedDB wrapper (`LocalDB`, 8 object stores) exists but is essentially unused by the app flow |
| AI | `src/ai.js` — Gemini 1.5 Flash client with graceful fallbacks when no key configured |
| Mobile | Capacitor 8 Android shell (`android/`, `capacitor.config.json`) |
| Content | Static seed data in `src/data.js` + generated BBC lessons (`src/generated/`) + remote published lessons pulled from Supabase (`published_lessons` / `published_transcripts`) with a localStorage cache |
| Mascot | Two systems: (1) inline `getTutoSVG()` in `main.js:3136` used by the live app; (2) a richer standalone system in `public/` (`linguAlphabet-mascot.svg`, `mascot-interaction.js` with a state machine — idle/listening/celebrating/thinking/sleeping, `mascot-animations.css`) that is **only wired to `public/mascot-demo.html`, not the app** |
| Scripts | Content-pipeline tooling under `scripts/` (BBC import, transcript alignment, lesson publishing) — out of scope for Sprint 2 |

**Defects found during review (must be addressed in Sprint 2 Phase 0):**

1. `index.html:256–260` — a leftover AI-editing artifact (`>>>>` followed by a literal `<task_progress>` checklist) is embedded inside `#welcome-panel`. Browsers render it as stray text nodes inside the welcome screen. This shipped in Sprint 1.
2. `src/db.js` session handling — `sb_session` is restored from localStorage but the **access token is never refreshed** (`refresh_token` is stored but unused). After ~1 hour, authenticated REST calls silently fail; sync functions swallow errors, so users lose cloud sync without noticing. Onboarding writes will hit this.
3. Dead files: `src/counter.js` (Vite scaffold leftover), commented-out RSS sync in `boot()`.
4. `main.js` is a 3,942-line monolith. Sprint 2 must not add ~1,500 more lines to it (see New Architecture).

---

## 2. Current Architecture Summary

### Screen/flow model (Sprint 1)

Three top-level screen containers toggled by `classList` (no router, no hash/history integration — the browser back button does nothing):

```
#auth-screen            #onboarding-screen           #main-app
├─ #welcome-panel       ├─ #ob-step-welcome          ├─ 5 tab views (home/explore/
├─ #login-panel         │    (motivation <select>)   │   library/inbox/profile)
├─ #signup-panel        ├─ #ob-step-qa (10 adaptive  ├─ bottom nav
└─ #forgot-panel        │    assessment questions)   ├─ workspace/player bottom sheet
                        ├─ #ob-step-report (CEFR)    └─ modals
                        └─ #ob-step-plan (goal +
                             daily time)
```

### Boot decision tree (`main.js: boot()` → `showMainApp()`)

```
boot()
 ├─ UserState.load()  (localStorage)
 ├─ supabase.init()   (restore sb_session)
 └─ hasSession = user.email || user.isGuest
      ├─ false → showAuth() → welcome panel (Tuto asks name → guest session)
      └─ true  → showMainApp()
                   ├─ !hasCompletedAssessment → onboarding flow
                   └─ else → dashboard (last active tab)
```

### Auth module (Sprint 1)

- Guest path: name entry on welcome panel → `UserState.update({isGuest:true, username, hasCompletedAssessment:false})` → onboarding.
- Sign-up: `supabase.signUp()` → forces `hasCompletedAssessment: false` → onboarding.
- Sign-in: `supabase.signIn()` → `syncFromRemote()` → dashboard if remote profile says assessment done.
- Onboarding draft resume: `linguAlphabet_onboarding_draft` (localStorage) stores userId + assessment index/answers; cleared on user switch.

### State management

- `state` — module-level mutable singleton in `main.js`; ephemeral UI state; imperative re-render calls (`renderHome()` etc.).
- `UserState` — localStorage-backed object with `load/save/get/set/update` + domain methods (`addXP`, `recordStudy`, `saveAssessment`, `updateLearningMemory`…). `save()` triggers fire-and-forget `syncToRemote()`.
- Sync: field-by-field push/pull to Supabase `profiles`, `progress`, `vocabulary`, `notes`, `bookmarks`, `achievements`. Guests (`userId` prefix `guest_`) never sync.

### Supabase schema (Sprint 1, `supabase-schema.sql`)

`profiles` (user_id unique, username, xp, level, streak, tuto_name…), `progress`, `notes`, `bookmarks`, `vocabulary`, `achievements`, RLS per-user policies, `handle_new_user()` trigger auto-creates a profile row on signup, `leaderboard` view. **Note:** `syncToRemote()` already pushes columns (`motivation`, `cefr_level`, `learning_memory`, `has_completed_assessment`, …) that do **not exist** in the committed schema file — the live DB and the SQL file have drifted. Sprint 2 must reconcile.

### Mascot & animation systems

- App uses `getTutoSVG(size)` (static SVG string) in welcome, onboarding, coach card, level-up modal; blink is driven by ad-hoc timers in `initWelcomeScreen()`.
- `public/mascot-interaction.js` exposes a proper `MascotInteractionManager` (states: idle, listening, celebrating, thinking, sleeping; particles; thought bubble) but is not imported by the app. Sprint 2's Stage 9 "thinking" and Completion Card "celebrating" moments are the natural adoption point.
- Screen transitions: CSS classes (`auth-screen--exit`, keyframes in `style.css`), 400ms exit animation pattern already established.

---

## 3. New Architecture

### Principles

1. **Stay vanilla JS.** No framework migration inside a feature sprint. Match existing idioms (template strings, `classList` toggling, module singletons).
2. **Stop the monolith.** All Sprint 2 logic lives in new modules under `src/onboarding/` and `src/profile/`; `main.js` only gains a thin integration seam (~40 lines). The Sprint 1 onboarding engine inside `main.js` is removed, not extended.
3. **Stage registry, not hardcoded flow.** Onboarding is a declarative array of stage descriptors consumed by a small runner (state machine). Adding/reordering/correcting stages after Blueprint confirmation = editing the registry.
4. **One canonical profile artifact.** Onboarding's output is a `LearningBrainProfile` object built by a pure function from collected answers — testable in isolation, versioned, persisted locally and remotely through one service.
5. **Local-first, sync-behind.** Onboarding must complete fully offline (guests exist by design). Supabase writes are best-effort with retry; completion is never blocked on network.

### Target flow (implements the five product decisions)

**[ASSUMPTION — confirm against Blueprint]** Exact content of stages 2, 5, 6, 8. Stages 1, 3–4, 7, 9, and the Completion Card are anchored by the product decisions and existing code.

| Stage | Name | Content | Source |
|---|---|---|---|
| 1 | Welcome / Meet Tuto | Name capture, Tuto greeting (exists in auth welcome panel; onboarding re-greets by name) | Existing |
| 2 | Learning Reason | "Why are you learning English?" (career/school/university/travel/growth) | Existing `#ob-step-welcome` select → upgraded to card grid |
| 3 | Level Assessment | Adaptive 10-question engine (5 skills × medium, then easy/hard) | Existing, ported to stage module |
| 4 | Assessment Report | CEFR + 5-skill breakdown + strongest/weakest | Existing, ported |
| 5 | Target Goal | General/IELTS/Business/Speaking/Travel/Academic | Existing `#ob-step-plan`, split out |
| 6 | Daily Commitment | 10/20/30/45/60 min | Existing, split out |
| 7 | **Motivation** | **Quick Motivation Tags AND Free Text** (both supported, both optional-or-required per Blueprint copy; tags multi-select + textarea) | Product decision #2 |
| 8 | Confirmation / Review | Summary of choices before brain build **[ASSUMPTION]** | Reconstructed |
| 9 | **Learning Brain Initialization** | **Real progress messages tied to real async tasks** (see §7): "Saving your preferences…", "Creating your learning profile…", "Preparing your first lesson…", "Building your personalized roadmap…", "Finalizing your AI Coach…" | Product decision #3 |
| — | **Completion Card** | "Learning Brain Ready" + Today's First Mission + Recommended First Podcast → CTA "Enter Dashboard" | Product decision #4 |

**Product decision #1 (no skip):** There is no "Skip to default profile" affordance anywhere in the new flow, and the gate in `showMainApp()` becomes unconditional: no user — guest or registered — reaches `#main-app` unless `learningBrain.onboardingCompleted === true`. The Sprint 1 legacy flag `hasCompletedAssessment` is kept in sync for backward compatibility (see §10).

### Component model

```
OnboardingController (machine.js)
  ├─ reads   STAGE_REGISTRY (stages/index.js)
  ├─ owns    OnboardingStore (answers + cursor + draft persistence)
  ├─ renders one stage at a time into #onboarding-container
  │            each stage module: { id, mount(ctx), collect(), validate(), unmount() }
  ├─ drives  transitions (reuses existing 400ms exit-animation pattern)
  └─ on finish:
       profileBuilder.build(answers, assessmentResult, contentCatalog)
         → LearningBrainProfile
       initializationRunner.run(profile)      ← Stage 9 real tasks
         → per-task progress events → UI messages
       completionCard.show(profile)
         → "Enter Dashboard" → main.js showMainApp()
```

---

## 4. Folder Structure

```
src/
├── main.js                      (MODIFY — integration seam only)
├── db.js                        (MODIFY — UserState extension, token refresh, new endpoints)
├── data.js                      (MODIFY — motivation tags catalog, mission templates)
├── ai.js                        (unchanged)
├── onboarding/                  (NEW)
│   ├── index.js                 public API: startOnboarding(), resumeOnboarding(), isOnboardingComplete()
│   ├── machine.js               OnboardingController: cursor, transitions, draft resume
│   ├── store.js                 OnboardingStore: answers, draft persistence (versioned key)
│   ├── initialization.js        Stage 9 task runner: ordered real tasks + progress events
│   ├── stages/
│   │   ├── index.js             STAGE_REGISTRY (ordered descriptors)
│   │   ├── welcome.js           Stage 1
│   │   ├── reason.js            Stage 2
│   │   ├── assessment.js        Stage 3 (ports adaptive QA engine out of main.js)
│   │   ├── report.js            Stage 4
│   │   ├── goal.js              Stage 5
│   │   ├── commitment.js        Stage 6
│   │   ├── motivation.js        Stage 7 (tags + free text)
│   │   ├── review.js            Stage 8
│   │   └── initializing.js      Stage 9 (renders progress messages from initialization.js events)
│   └── completionCard.js        Completion Card (pre-dashboard)
├── profile/                     (NEW)
│   ├── learningBrainProfile.js  schema constant, defaults, validate(), migrate(vN→vN+1)
│   ├── profileBuilder.js        pure: (answers, assessmentResult, catalog) → LearningBrainProfile
│   ├── recommendation.js        recommendedFirstLesson / firstPodcastId / first mission selection
│   └── leagues.js               league tier table + resolveLeague(xp)
└── services/                    (NEW)
    ├── profileService.js        Supabase persistence for the Learning Brain (single API boundary)
    └── migrationService.js      guest → account migration
supabase/
└── migrations/
    └── 002_sprint2_learning_brain.sql   (NEW — schema delta, additive only)
```

CSS: new rules appended to `style.css` under a clearly delimited `/* ===== SPRINT 2: ONBOARDING v2 ===== */` block (keeps single-file convention; ~600 lines budget). Mascot: import `MascotInteractionManager` patterns rather than the demo file itself — extract the state-machine core into `src/onboarding/` usage via a thin adapter if the public/ file proves too demo-coupled (decide in Phase 2; do not block on it).

---

## 5. New Files

| File | Responsibility | Size est. |
|---|---|---|
| `src/onboarding/index.js` | Entry points consumed by `main.js`; hides everything else | ~40 lines |
| `src/onboarding/machine.js` | Stage cursor, next/back, draft save on every transition, resume, finish handoff | ~150 |
| `src/onboarding/store.js` | `answers` map, `get/set/patch`, versioned draft key `linguAlphabet_onboarding_draft_v2`, user-scoped invalidation | ~100 |
| `src/onboarding/stages/index.js` | `STAGE_REGISTRY` ordered array | ~30 |
| `src/onboarding/stages/*.js` (9 files) | One module per stage; each owns its DOM template, listeners, validation | ~60–250 each (assessment.js largest — ported engine) |
| `src/onboarding/initialization.js` | Ordered async tasks with human message per task; emits `{taskIndex, message, status}`; min-display-time per message so UI never flashes; all tasks are REAL (see §7) | ~120 |
| `src/onboarding/completionCard.js` | Renders Learning Brain Ready card (streak/XP/league seeds, first mission, first podcast), celebrate mascot state, CTA | ~120 |
| `src/profile/learningBrainProfile.js` | `LEARNING_BRAIN_VERSION`, `defaultLearningBrain()`, `validateLearningBrain()`, `migrateLearningBrain()` | ~120 |
| `src/profile/profileBuilder.js` | Pure builder: answers + assessment scores + podcast catalog → complete profile incl. `recommendedFirstLesson`, `firstPodcastId` | ~120 |
| `src/profile/recommendation.js` | Reuses the scoring logic of `getRecommendedPodcasts()` (extracted, not duplicated) to pick first podcast + derive "Today's First Mission" | ~100 |
| `src/profile/leagues.js` | League ladder (e.g., Bronze → Silver → Gold → Sapphire → Ruby **[ASSUMPTION — league names need Blueprint/product confirmation]**), `resolveLeague(xp)` | ~40 |
| `src/services/profileService.js` | `saveLearningBrain(profile)`, `loadLearningBrain(userId)`, retry-with-backoff, offline queue flag | ~120 |
| `src/services/migrationService.js` | `migrateGuestToAccount(guestData, userId)` per §11 | ~100 |
| `supabase/migrations/002_sprint2_learning_brain.sql` | Additive schema delta per §12 | ~60 |

Total new code budget: **~1,600 lines** across 16 focused files instead of growing `main.js`.

## 6. Files To Modify

| File | Change | Risk |
|---|---|---|
| `src/main.js` | (a) Delete Sprint 1 onboarding engine (`startOnboardingFlow`, `showOnboardingStep`, `getCurrentAdaptiveQuestion`, `renderAssessmentQuestion`, `gradeAssessment`, `generateLearningPlan`, draft helpers — ~280 lines); (b) `showMainApp()` gates on `isOnboardingComplete()` and delegates to `startOnboarding()`; (c) extract podcast-scoring core of `getRecommendedPodcasts()` into `src/profile/recommendation.js` and re-import; (d) remove `#ob-*` event listeners from `setupEventListeners()` | Medium — touching boot path |
| `index.html` | (a) **Fix the `>>>>`/`<task_progress>` artifact at lines 256–260**; (b) replace the four static `#ob-step-*` blocks with a single empty `#onboarding-container` mount point (stages render themselves); (c) keep `#onboarding-screen` shell + background blobs | Low–Medium |
| `src/style.css` | Append Sprint 2 block: stage transitions, tag chips, textarea, progress-message list, completion card, league badge | Low (additive) |
| `src/db.js` | (a) Extend `UserState.defaults()` with `learningBrain: null` + legacy-flag bridge; (b) `syncToRemote`/`syncFromRemote` add `learning_brain` field; (c) **add token refresh** (`/auth/v1/token?grant_type=refresh_token` on 401, once) — prerequisite for reliable Stage 9 writes; (d) mark `hasCompletedAssessment` as derived | Medium |
| `src/data.js` | Add `motivationTags` catalog, first-mission templates | Low |
| `supabase-schema.sql` | Reconcile drift: add the columns `syncToRemote` already assumes + Sprint 2 columns (documented; the runnable delta lives in `supabase/migrations/002_…`) | Low (docs-level) |

Deletions: `src/counter.js` (dead scaffold).

---

## 7. State Management Strategy

Three layers, single-writer each:

1. **OnboardingStore (ephemeral + draft)** — owns everything the user enters during onboarding. Never writes to `UserState` mid-flow. Draft persisted to localStorage on every stage transition (key `linguAlphabet_onboarding_draft_v2`, scoped by `userId`, invalidated on user switch — same rule Sprint 1 used). Abandoning mid-flow and returning resumes at the saved stage.
2. **UserState (runtime authority)** — unchanged role. Gains one new field: `learningBrain` (the full `LearningBrainProfile`). Written exactly once, atomically, at Stage 9 task "Creating your learning profile…". Legacy fields (`cefrLevel`, `targetGoal`, `dailyTimeGoal`, `hasCompletedAssessment`, `learningScore`) are still written at the same moment so all existing dashboard/recommendation/profile code keeps working untouched.
3. **Supabase (durable, best-effort)** — written by `profileService` during Stage 9 for registered users; skipped for guests (their durable copy is localStorage until account creation, per §11).

**Stage 9 real tasks (product decision #3)** — each message maps to actual work, executed sequentially by `initialization.js`:

| Message | Real task |
|---|---|
| "Saving your preferences…" | Commit answers → `UserState.update()` (legacy fields) + draft cleanup |
| "Creating your learning profile…" | `profileBuilder.build()` → validate → `UserState.set('learningBrain', …)` |
| "Preparing your first lesson…" | Resolve `recommendedFirstLesson`/`firstPodcastId` against loaded catalog (incl. cached remote lessons); prefetch cover image; warm transcript if local |
| "Building your personalized roadmap…" | Run `recalculateInsights()`, seed daily quests for the goal, write inbox welcome item |
| "Finalizing your AI Coach…" | Registered: `profileService.saveLearningBrain()` + `syncToRemote()` (with refresh-token retry). Guest: mark local durable. Failure ⇒ set `learningBrain.syncPending = true`, continue — never block completion |

Each task has a minimum display duration (~700ms) so the sequence reads naturally even when tasks are instant, but the messages are never fake: if a task fails, the UI reflects retry/degraded state instead of pretending.

## 8. LearningBrainProfile Architecture

Versioned, validated, single-definition schema (`learningBrainProfile.js`):

```
LearningBrainProfile v1
├── version: 1
├── onboardingCompleted: boolean
├── onboardingCompletedAt: ISO string
├── identity:      { displayName, learningReason }            (stages 1–2)
├── assessment:    { cefrLevel, friendlyLevel, scores{listening, vocabulary,
│                    grammar, comprehension, retention}, strongestSkill,
│                    weakestSkill, completedAt }               (stages 3–4)
├── plan:          { targetGoal, dailyTimeGoalMinutes }        (stages 5–6)
├── motivation:    { tags: string[], freeText: string }        (stage 7 — BOTH, per decision #2)
├── gamification:  ← NEW REQUIRED FIELDS (decision #5)
│   ├── learningStreak: number        (seeded 0; mirrors UserState.streak)
│   ├── currentXP: number             (seeded from UserState.xp incl. onboarding bonus)
│   └── currentLeague: string         (resolveLeague(currentXP), default lowest tier)
├── firstSession:  ← NEW REQUIRED FIELDS (decision #5)
│   ├── recommendedFirstLesson: { podcastId, title, reason }
│   ├── firstPodcastId: string
│   └── firstMission: { title, description, xpReward }         (Completion Card)
└── sync:          { syncPending: boolean, lastSyncedAt }
```

**Ownership rules (avoids the classic dual-source-of-truth bug):**

- `learningStreak` / `currentXP` / `currentLeague` are **initialization snapshots + mirrors**. Runtime authority for XP/streak remains `UserState.xp` / `UserState.streak` (all existing `addXP`/`recordStudy` code paths untouched). `UserState.save()` refreshes the mirror fields in `learningBrain.gamification` so the persisted brain is always consistent. Dashboard reads runtime fields; Completion Card reads the brain.
- `recommendedFirstLesson`/`firstPodcastId` are immutable after onboarding (historical record of what the brain chose); the live recommendation engine keeps evolving independently.
- `validateLearningBrain()` runs on load; `migrateLearningBrain()` handles future `version` bumps; corrupt/invalid brain ⇒ treated as onboarding-incomplete (re-onboard) rather than crashing.

## 9. Navigation Flow

```
boot()
 └─ hasSession?
     ├─ NO  → #auth-screen (welcome / login / signup / forgot)   [Sprint 1, unchanged]
     └─ YES → isOnboardingComplete(UserState)?
               │     (learningBrain.onboardingCompleted === true
               │      OR legacy hasCompletedAssessment === true → §10 backfill)
               ├─ NO  → #onboarding-screen
               │         Stage 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9
               │         (back allowed 1–8; back disabled during 9;
               │          draft resume re-enters at saved stage;
               │          NO skip path exists — decision #1)
               │         Stage 9 done → Completion Card (same screen container)
               │         "Enter Dashboard" CTA → showMainApp()
               └─ YES → #main-app (last active tab)
```

- Completion Card is a terminal onboarding stage, not a `#main-app` view — the dashboard is never partially visible behind it.
- Sign-out during onboarding (possible via kill/relaunch only; no sign-out control is shown in the flow) → draft invalidation rules in §10.
- Browser back button: unchanged from Sprint 1 (no history integration). **[Recommendation §20: add `history.pushState` guards in a later sprint, not this one.]**

## 10. Local Persistence Strategy

| Key | Content | Lifecycle |
|---|---|---|
| `linguAlphabet_user` | `UserState` incl. `learningBrain` | Existing; grows by one nested object |
| `linguAlphabet_onboarding_draft_v2` | `{ userId, stageId, answers, savedAt }` | Written on every stage transition; cleared on completion, on user switch, and when `savedAt` > 14 days old **[ASSUMPTION on TTL]** |
| `linguAlphabet_onboarding_draft` (v1) | Sprint 1 draft | Read-once migration: if present and holds ≥1 assessment answer for same user, offer resume by mapping into v2; else delete |
| `sb_session` | Supabase session | Existing; gains refresh handling (§6) |
| `linguAlphabet_remote_lessons_v1` | Lesson cache | Unchanged; Stage 9 "Preparing your first lesson" reads it |

**Backward compatibility:** existing users with `hasCompletedAssessment === true` but no `learningBrain` must NOT be re-onboarded. On load, a one-time backfill constructs `learningBrain` from existing fields (`cefrLevel`, `learningScore`, `targetGoal`, `dailyTimeGoal`, `motivation`, xp/streak) with `recommendedFirstLesson`/`firstPodcastId` resolved lazily and `firstMission` set to a generic mission. Flag: `learningBrain.backfilled = true`.

IndexedDB: not adopted for onboarding (localStorage payload is small); revisit only if profile size grows.

## 11. Guest Migration Strategy

Guests exist by design (name-only welcome path) and must complete onboarding like everyone else. The migration moment is **account creation or sign-in by a user who has local guest data**.

**Case A — Guest completes onboarding, later signs UP (new account):**
1. Snapshot guest `UserState` (incl. `learningBrain`) before `signUp()`.
2. After signup succeeds: rewrite `userId` from `guest_*` to auth UID; keep everything else.
3. `migrationService.migrateGuestToAccount()`: push profile + learningBrain + vocabulary/progress/notes/bookmarks/achievements via existing upserts; set `syncPending=false` on success.
4. **Do not re-run onboarding** — brain is complete. (Sprint 1's `signUp` handler currently forces `hasCompletedAssessment:false`; change to: force re-onboarding only when no completed local brain exists.)

**Case B — Guest (with local brain) signs IN to an existing account:**
Conflict policy — **"completed brain wins; remote wins ties":**
- Remote profile has a completed brain → remote wins wholesale; guest local data is discarded after confirmation prompt ("Continue as <remote username>? Your guest progress on this device will be replaced."). **[ASSUMPTION — confirm UX copy]**
- Remote has NO completed brain, local guest brain is complete → migrate local up (Case A steps 2–3).
- Neither complete → remote identity + fresh onboarding.

**Case C — Guest abandons mid-onboarding, then signs up/in:** draft is user-scoped; on user switch the draft is cleared (existing Sprint 1 rule, retained). New identity starts onboarding at Stage 1 unless remote brain exists.

Edge rule: a `guest_*` userId must never reach Supabase writes (existing guard in `syncToRemote()` retained and extended to `profileService`).

## 12. Supabase Integration

**Migration `002_sprint2_learning_brain.sql` — additive only, no destructive changes:**

1. `profiles` — add columns (several are drift-reconciliation for what `syncToRemote()` already sends):
   - Drift: `motivation text`, `cefr_level text`, `target_goal text`, `daily_time_goal int`, `study_hours_goal int`, `learning_score jsonb`, `learning_memory jsonb`, `assessment_history jsonb`, `has_completed_assessment boolean default false`.
   - Sprint 2: `learning_brain jsonb` (whole versioned profile — the JSON document is the contract, mirroring local), `current_league text default '<lowest tier>'`, `onboarding_completed_at timestamptz`.
2. Rationale for `jsonb` over normalized columns: the brain is a versioned document owned by the client, read/written whole, evolving per sprint; `xp`/`streak`/`current_league` remain first-class columns because the leaderboard view queries them.
3. RLS: existing per-user policies on `profiles` cover the new columns — no policy changes.
4. `leaderboard` view: optionally add `current_league` (non-breaking).
5. `handle_new_user()` trigger: unchanged (profile row exists before first brain write; `upsertProfile` merge-duplicates already handles ordering).

**Client:** all Learning Brain persistence goes through `profileService` (below); `UserState.syncToRemote/FromRemote` add only the `learning_brain` passthrough. Token refresh (§6) lands before Stage 9 work so authenticated writes are reliable.

## 13. API Boundaries

| Module | Public surface | Consumers |
|---|---|---|
| `onboarding/index.js` | `startOnboarding()`, `resumeOnboarding()`, `isOnboardingComplete(userState)` | `main.js` only |
| `onboarding/store.js` | `get/set/patch/answers()`, `saveDraft/loadDraft/clearDraft` | machine + stages |
| `onboarding/initialization.js` | `runInitialization(profileDraft, {onProgress})` | initializing stage |
| `profile/learningBrainProfile.js` | `defaultLearningBrain()`, `validateLearningBrain()`, `migrateLearningBrain()`, `LEARNING_BRAIN_VERSION` | builder, db.js backfill, profileService |
| `profile/profileBuilder.js` | `buildLearningBrain(answers, assessment, catalog)` (pure) | initialization |
| `profile/recommendation.js` | `scorePodcasts(user, catalog)`, `pickFirstLesson(brainDraft, catalog)`, `buildFirstMission(brainDraft)` | initialization, main.js (re-import for existing recs) |
| `profile/leagues.js` | `LEAGUES`, `resolveLeague(xp)` | builder, completion card, profile view (later) |
| `services/profileService.js` | `saveLearningBrain(userId, brain)`, `loadLearningBrain(userId)` | initialization, db.js sync |
| `services/migrationService.js` | `migrateGuestToAccount(localState, session)` | main.js auth handlers |

Hard rules: stages never touch `UserState` or Supabase directly; `main.js` never touches `OnboardingStore`; only `profileService` speaks to Supabase about the brain.

## 14. Dependency Graph

```
main.js ──► onboarding/index.js ──► machine.js ──► stages/* ──► store.js
   │                                    │
   │                                    └─► initialization.js
   │                                          ├─► profile/profileBuilder.js ─► learningBrainProfile.js
   │                                          │            └─► recommendation.js ─► leagues.js
   │                                          ├─► services/profileService.js ─► db.js (supabase client)
   │                                          └─► db.js (UserState)
   │
   ├─► completionCard.js ─► (reads learningBrain via UserState)
   ├─► services/migrationService.js ─► profileService.js + db.js
   └─► profile/recommendation.js   (replaces inline getRecommendedPodcasts core)

db.js ─► learningBrainProfile.js (validate/migrate/backfill on load)
No cycles: profile/* and services/* never import onboarding/*; onboarding/* never imports main.js.
```

## 15. Safe Implementation Order

1. **Foundations (no user-visible change):** fix `index.html` artifact; delete `counter.js`; add token refresh in `db.js`; `leagues.js`; `learningBrainProfile.js` (+ validate/migrate/backfill); extend `UserState.defaults()`; write Supabase migration and reconcile `supabase-schema.sql`. App behaves identically. ✅ safe checkpoint
2. **Profile pipeline (still dark):** `recommendation.js` extraction (re-import from `main.js`, verify recs unchanged); `profileBuilder.js`; `profileService.js`. ✅ safe checkpoint
3. **Onboarding engine behind the same gate:** `store.js`, `machine.js`, stage registry, port stages 2–6 (reason/assessment/report/goal/commitment) from Sprint 1 markup+logic; replace `#ob-step-*` HTML with mount point; delete old engine from `main.js`; wire `showMainApp()` to new gate. Functional parity milestone: old flow fully replicated by new architecture. ✅ regression-test checkpoint
4. **New stages:** welcome (1), motivation (7), review (8), initializing (9) + `initialization.js` real tasks.
5. **Completion Card** + celebrate mascot moment + dashboard handoff.
6. **Migration & backfill paths:** `migrationService.js`, signup/signin handler changes, v1-draft migration, legacy-user backfill.
7. **Hardening:** offline Stage 9, `syncPending` retry on next `save()`, draft TTL, QA pass.

Each step leaves `main` shippable; steps 3 is the only one where old code is deleted, and it lands only after parity verification.

## 16. Sprint Breakdown

| Phase | Scope (from §15) | Est. | Exit criteria |
|---|---|---|---|
| **Phase 0 — Repo hygiene & foundations** | Steps 1 | 1–1.5 d | Artifact fixed; token refresh proven against a real Supabase project; migration applied to staging; zero visual diff |
| **Phase 1 — Profile pipeline** | Step 2 | 1–1.5 d | `buildLearningBrain()` produces valid v1 profile from fixture answers; recommendations byte-identical pre/post extraction |
| **Phase 2 — Engine parity** | Step 3 | 2–3 d | New engine reproduces Sprint 1 flow end-to-end incl. draft resume; old engine deleted; `main.js` net-negative lines |
| **Phase 3 — New stages 1/7/8/9** | Step 4 | 2 d | Motivation tags+free text captured into brain; Stage 9 messages each bound to a real task; offline completion works |
| **Phase 4 — Completion Card** | Step 5 | 1 d | Card shows Learning Brain Ready, first mission, first podcast; CTA lands on dashboard with brain persisted |
| **Phase 5 — Migration & compat** | Step 6 | 1.5 d | All three guest cases (§11) verified; legacy user with `hasCompletedAssessment` is not re-onboarded |
| **Phase 6 — Hardening & QA** | Step 7 + §18 matrix | 1.5 d | QA matrix green on desktop Chrome + Android WebView (Capacitor) |

Total: **~10–12 working days.** Phases 0–2 are sequential; Phase 3 stages can be parallelized across contributors once Phase 2 lands; Phase 5 can start in parallel with Phase 4.

## 17. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | **Blueprint not in repo** — stage content for 2/5/6/8, league names, copy are reconstructed | High | Medium | Registry-driven stages make content swaps cheap; get Blueprint confirmation before Phase 3 |
| 2 | Boot-path regression while replacing the onboarding gate | Medium | High | Phase 2 parity checkpoint; legacy flag kept in sync; backfill for existing users |
| 3 | Supabase schema drift (live DB vs `supabase-schema.sql`) — unknown live state | Medium | High | Migration is additive `if not exists`; verify against staging before Phase 3; Stage 9 tolerates missing columns via `syncPending` |
| 4 | Token expiry during Stage 9 writes | High (pre-fix) | Medium | Token refresh in Phase 0 is a hard prerequisite |
| 5 | Guest→account migration data loss | Medium | High | Snapshot-before-auth pattern; confirmation prompt on destructive path (Case B); never delete local until remote write confirmed |
| 6 | `main.js` merge conflicts if other work lands mid-sprint | Medium | Medium | Phase 2 deletes code in one focused PR; freeze other `main.js` edits during it |
| 7 | Mascot `public/` system too demo-coupled to reuse | Medium | Low | Fallback: keep `getTutoSVG` + CSS classes for thinking/celebrating; adoption is a nice-to-have, not a dependency |
| 8 | Stage 9 perceived as fake if tasks complete instantly | Low | Medium | Min-display-time per message + tasks genuinely ordered; failure states surface honestly |
| 9 | No automated tests exist | High | Medium | Pure modules (builder, leagues, recommendation, validate) designed test-ready; recommend adding Vitest in Phase 0 (small, no app refactor needed) |

## 18. Manual QA Strategy

Environments: desktop Chrome (dev + `vite preview`), Android WebView via Capacitor debug build, one small-viewport device (≤360px — welcome screen has explicit small-screen handling).

**Core matrix (each on fresh profile unless noted):**

1. **New guest, happy path:** name → stages 1–9 → Completion Card → dashboard. Verify brain in localStorage (all §8 fields incl. the five new ones), XP bonus applied, first mission matches card.
2. **No-skip enforcement:** attempt to reach dashboard with incomplete brain (edit localStorage `onboardingCompleted:false`, reload) → must land in onboarding. No skip control visible at any stage.
3. **Stage 7 both inputs:** tags only / text only / both / neither (verify required-ness per Blueprint) persist into `motivation.{tags,freeText}`.
4. **Stage 9 honesty:** throttle network (DevTools offline) as a registered user → messages progress, completion still reached, `syncPending:true`; go online, trigger a save → sync flushes.
5. **Draft resume:** quit at stages 2, 3(q6), 7; relaunch → resume at same stage with answers intact. Quit, switch user → draft cleared, Stage 1.
6. **Assessment parity:** answer patterns (all-correct, all-wrong, mixed) produce identical CEFR/scores as Sprint 1 (fixtures recorded during Phase 2).
7. **Legacy user:** localStorage with Sprint 1 shape (`hasCompletedAssessment:true`, no brain) → straight to dashboard, backfilled brain present.
8. **Guest→signup migration:** complete brain as guest → sign up → no re-onboarding; Supabase `profiles.learning_brain` populated; XP/streak preserved.
9. **Guest→signin conflict:** local guest brain + remote account with brain → prompt → remote wins; remote without brain → local migrates up.
10. **Registered signup path:** fresh signup → onboarding forced → Stage 9 writes reach Supabase (check table).
11. **Token expiry:** age the session (tamper `expires_at`) → Stage 9 write refreshes and succeeds.
12. **Completion Card content:** recommended podcast exists in catalog, is level-appropriate (CEFR match), opens correctly from dashboard afterwards.
13. **Visual/UX:** transitions at 400ms pattern, no layout jump on keyboard (Android), mascot states (thinking during 9, celebrating on card), small-viewport rendering.
14. **Regression sweep:** §19 checklist.

## 19. Regression Risks

Areas Sprint 2 touches that already work — explicit re-verification list:

1. **Auth panels** (`index.html` welcome-panel edit for the artifact fix sits inside Sprint 1's most polished screen): welcome typing/blink/keyboard-offset behavior, login, signup, forgot flows.
2. **Boot gating**: existing signed-in users and existing guests must not be re-onboarded or logged out (legacy-flag bridge + backfill).
3. **Recommendation engine**: extraction to `recommendation.js` must not change home-screen "Recommended for you" ordering (fixture comparison).
4. **`UserState.save()` path**: brain mirroring added to a hot path called on every XP/progress event — verify no perf/sync regressions and no infinite save loops.
5. **`syncToRemote`/`syncFromRemote`**: new `learning_brain` field must not break against a DB where the migration hasn't run yet (older prod) — writes must degrade gracefully.
6. **Onboarding CSS**: old `#ob-*` selectors removed with their markup; verify no other view reused those classes (`ob-badge` etc. — grep before delete).
7. **Daily quests / inbox / XP toast**: `generateLearningPlan()`'s side effects (inbox item, +50 XP, quest seed) move into Stage 9 tasks — ensure they fire exactly once.
8. **Capacitor Android build**: `npm run cap:sync` after HTML/CSS restructure; WebView localStorage behavior unchanged.
9. **Remote lesson cache**: Stage 9 reads it; ensure cold-start (empty cache, no network) still yields a valid `recommendedFirstLesson` from bundled seed data.

## 20. Final Engineering Recommendations

1. **Confirm the Blueprint before Phase 3.** The architecture absorbs content corrections cheaply, but copy, stage 2/5/6/8 content, league names, and motivation-tag lists should not be invented twice. Commit the Blueprint into `docs/` as the canonical reference.
2. **Treat Phase 0 as non-negotiable.** The shipped HTML artifact and the missing token refresh are Sprint 1 escapes that Sprint 2 would otherwise build on top of.
3. **Enforce the module boundary in review.** The single most valuable structural outcome of this sprint is that `main.js` shrinks. Reject any PR that adds onboarding logic to `main.js` beyond the integration seam.
4. **Add Vitest for the pure core only** (builder, leagues, recommendation scoring, brain validation/migration, assessment grading fixtures). ~1 setup hour, no app refactor, converts the QA fixtures from §18.6 into permanent regression tests.
5. **Keep the brain as a versioned JSON document** everywhere (localStorage, Supabase jsonb, in-memory). One schema module, one validator, one migrator — this is what makes Sprint 3+ (real AI Coach personalization) cheap.
6. **Adopt the mascot state machine opportunistically, not structurally.** Stage 9 (thinking) and Completion Card (celebrating) are the pilot; full app adoption is a later sprint.
7. **Defer, explicitly:** URL/hash routing and browser-back support; supabase-js adoption; IndexedDB usage; i18n of onboarding copy. Each is worthwhile and each would destabilize this sprint if bundled in.
8. **Sequence the Supabase migration operationally:** apply to staging in Phase 0, to production before Phase 3 merges, because Stage 9 writes `learning_brain` — client tolerates absence (`syncPending`) but shouldn't rely on it.
