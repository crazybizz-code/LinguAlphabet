# LinguAlphabet — Sprint 2 Final Report

## Onboarding & Learning Brain Initialization

**Status:** Complete — all five phases (A–E) implemented, integrated, and verified in a running browser.
**Date:** 2026-07-02

---

## 1. Architecture Summary

Sprint 2 replaced Sprint 1's single-purpose 10-question adaptive-assessment onboarding with a modular, stage-registry-driven onboarding engine ("v2"), built incrementally across five phases and now fully wired into the live app alongside — not instead of — the original ("legacy") engine.

### The five-layer architecture

```
main.js (integration seam)
  └─ onboarding/index.js (public API: isOnboardingComplete, startOnboarding)
       └─ onboarding/machine.js (OnboardingController)
            ├─ stages/index.js → STAGE_REGISTRY
            │     welcome → goal → level → commitment → motivation
            │     (each: {id, mount, validate, collect, unmount})
            ├─ onboarding/store.js (OnboardingStore — versioned, autosaved draft)
            ├─ onboarding/progressView.js → onboarding/initialization.js (Initialization Runner)
            │     ├─ onboarding/answersAdapter.js   (Builder Integration)
            │     ├─ onboarding/gamificationSeed.js
            │     ├─ onboarding/firstSession.js
            │     └─ profile/profileBuilder.js → profile/learningBrainProfile.js (schema + validator)
            └─ onboarding/completionCard.js (mandatory terminal stage — sole Dashboard handoff)
       └─ services/guestMigration.js (auth-time completion-state reconciliation)
  └─ db.js (UserState — durable local store; CONFIG.onboardingEngine switch)
```

### Key architectural decisions, sprint-wide

1. **Stage registry over hardcoded flow.** Every answer-collecting screen is a `{mount, validate, collect, unmount}` descriptor built by `createStage()` and ordered in `STAGE_REGISTRY`. The machine is generic over this registry — reordering or adding stages is a registry edit, not a machine rewrite.
2. **Atomic commit, in-memory build.** The Initialization Runner (Phase C) builds the entire `LearningBrainProfile` in memory across four steps and performs exactly one `UserState.update()` at the fifth. A failure at any point leaves durable storage completely untouched, which is also what makes resume and retry safe with zero dedicated "resume state" logic — resuming is just calling the runner again.
3. **No CEFR from self-selection.** `level.cefrLevel` stays `null` for every self-reported or unknown level; only a reserved, unused-this-sprint `'ai-estimated'` source may ever set it. Enforced as a schema validation invariant, not just a convention, and covered by a dedicated regression test asserting no CEFR string ever appears in the Level stage's rendered DOM.
4. **Legacy engine preserved, not deleted.** Per the approved product decision, Sprint 1's assessment-based flow remains fully intact and reachable via `CONFIG.onboardingEngine = 'legacy'`. The two engines share the screen shell (`#onboarding-screen`) but never share DOM, CSS classes (`.ob-*` vs `.ob2-*`), or JS modules. Verified live in this phase's browser walkthrough.
5. **Completion Card as the sole Dashboard gate.** No code path in `machine.js`, `progressView.js`, or `initialization.js` calls into the dashboard — the only exit is the Completion Card's Start Learning click handler, which the machine wires to `showMainApp()` re-entry (see §2 below).
6. **Guest data is never destructively migrated.** `UserState.syncToRemote()`/`syncFromRemote()` use the same OR-fallback merge pattern already established for every other profile field, extended to `learning_brain`: a signed-in account's remote brain wins if present, otherwise the local (possibly guest-completed) brain is left untouched. `reconcileOnboardingCompletionState()` is the one piece of new logic needed on top — re-deriving `hasCompletedAssessment` from whichever brain ends up authoritative, since the existing sync code's own field-by-field handling could otherwise silently stomp that flag back to `false`.

---

## 2. Phase E: What Actually Changed to Go Live

Phases A–D built and unit-tested every piece in isolation, deliberately unwired from the running app. Phase E is the integration:

1. **`onboarding/machine.js` (new)** — the OnboardingController. Owns the answering-phase chrome (progress label + Back/Continue buttons, reusing the existing generic `.btn-primary`/`.btn-ghost` classes, not new ones), sequences stage mount/unmount, collects each stage's answers into the `OnboardingStore` on every transition, hands off to `progressView` then `completionCard`, and renders a minimal retry banner (also reusing `.btn-primary`) if initialization fails.
2. **`onboarding/index.js` (new)** — the only onboarding module `main.js` imports directly: `isOnboardingComplete(userState)` and `startOnboarding(container, options)`.
3. **`main.js`** — `showMainApp()` now branches on `CONFIG.onboardingEngine`. The v2 branch's entire "show the Dashboard" logic is: re-call `showMainApp()` from the Completion Card's `onExit`. By then `UserState.hasCompletedAssessment`/`learningBrain` reflect the just-committed profile, so the same function's existing dashboard tail fires naturally — no second "enter dashboard" code path was written. Sign-up and sign-in handlers gained one call each to `reconcileOnboardingCompletionState()`.
4. **`index.html`** — one new sibling `<div id="onboarding-v2-container">` inside `#onboarding-screen`, next to (not nested in, not replacing) the legacy `#onboarding-container`.
5. **`db.js`** — `CONFIG.onboardingEngine` (defaults to `'v2'`, overridable via `localStorage.setItem('linguAlphabet_onboarding_engine', 'legacy')`), `learningBrain: null` added to `UserState.defaults()`, and `learning_brain` added to both sync methods.
6. **`src/style.css`** — one further additive block: the machine's chrome layout (`.ob2-machine*`) and the v2 container's positioning (`.onboarding-container-v2`), plus the small header-comment update noting Phase E's wiring. Zero existing rules touched.
7. **`services/guestMigration.js` (new)** — `reconcileOnboardingCompletionState(userState)`, the one piece of new migration logic (see §1.6).
8. **`supabase/migrations/002_sprint2_learning_brain.sql` (new)** — additive `learning_brain jsonb` column, plus reconciliation of several Sprint-1-era columns `syncToRemote()` has been sending since Sprint 1 without ever being added to `supabase-schema.sql` (see §6, "Pre-existing issue discovered and fixed").

**Explicitly not touched:** `SupabaseClient`'s sign-in/up/out methods, session handling, or any other authentication code — Guest Migration is entirely a `UserState`/sync-layer concern, not an auth-layer one.

---

## 3. Files Changed (Full Sprint)

**44 files, ~5,900 insertions, 48 deletions, across Phases A–E** (Phase E's not-yet-committed additions bring the final total slightly higher — see the commit for the authoritative diff).

| Area | Files | Notes |
|---|---|---|
| Engineering plan | `docs/sprint-2-engineering-plan.md` | Two revisions incorporating approved product decisions |
| Schema & builder | `src/profile/learningBrainProfile.js`, `profileBuilder.js` | Phase A |
| Stage infrastructure | `src/onboarding/stages/{stageDescriptor,registry,index}.js`, `store.js` | Phase A |
| Stage UI | `src/onboarding/stages/{welcome,goal,level,commitment,motivation}.js`, `stages/shared/chipGroup.js` | Phase B |
| Initialization | `src/onboarding/{answersAdapter,gamificationSeed,firstSession,initialization}.js` | Phase C |
| Completion Experience | `src/onboarding/{mascot,progressView,completionCard}.js` | Phase D |
| **Integration (new this phase)** | `src/onboarding/{machine,index}.js`, `src/services/guestMigration.js` | Phase E |
| **App wiring (modified this phase)** | `index.html`, `src/main.js`, `src/db.js`, `src/style.css` | Phase E — first phase to touch these |
| **Database** | `supabase/migrations/002_sprint2_learning_brain.sql` | Phase E |
| Test infra | `vitest.config.js`, `test/setup.js` | Phase A |
| Tests | 22 `*.test.js` files, one per source module | All phases |

No Sprint 1 file was deleted. `src/counter.js` (dead Vite scaffold, unrelated to onboarding) was removed in Phase A.

---

## 4. Test Summary

```
npx vitest run
 Test Files  22 passed (22)
      Tests  245 passed (245)
```

Breakdown by concern: schema/validator (28), builder (15+13 incl. adapter integration), stage registry infrastructure (25), 5 stage UIs (≈65 incl. factory-isolation tests), shared chip helper (12), onboarding store (17), Initialization Runner incl. error-recovery/resume/idempotence (20+1 real-singleton integration test), mascot/progressView/completionCard (28), **machine.js (15, new this phase)**, **guestMigration.js (6, new this phase)**, **onboarding/index.js (5, new this phase)**.

A genuine test-isolation bug was caught and fixed during this phase: `machine.test.js`'s `createOnboardingStore()` instances share the same underlying `localStorage` draft key across tests (by design — matching production, where the store is a singleton), so a resumed draft from one test was silently leaking into the next until `localStorage.clear()` was added to `beforeEach`, matching the convention already established in Phase A's `store.test.js`.

### Browser-level verification (this phase)

Vitest/jsdom cannot exercise the actual wired app (real navigation, real timers, real CSS transitions). A Playwright script drove a real headless Chromium instance against the Vite dev server and exercised every scenario the phase instructions named:

| Scenario | Result |
|---|---|
| Fresh user: full 5-stage walkthrough → Initialization → Completion Card | ✅ |
| Completion Card content (badge, personalized welcome, mission, podcast) | ✅ |
| Dashboard Transition (Start Learning → `#main-app` visible, onboarding hidden) | ✅ |
| LearningBrainProfile persisted with `onboardingCompleted: true`, `cefrLevel: null` | ✅ |
| Returning user (reload after completion) → straight to Dashboard, no onboarding shown | ✅ |
| Interrupted onboarding (reload mid-flow) → resumes at the same stage, not restarted | ✅ |
| Retry initialization (injected transient storage failure) → error banner + Try Again → succeeds on retry | ✅ |
| Legacy engine coexistence (`ONBOARDING_ENGINE=legacy`) → Sprint 1 flow still renders | ✅ |

**19/19 browser-level checks passed.** Screenshots of the live flow (Welcome, Goal Selection, Progress Experience, Completion Card) were captured and sent alongside this report.

**Known gap, stated honestly:** guest→account migration (sign-up/sign-in triggering `reconcileOnboardingCompletionState`) is covered by unit tests only. This environment has no Supabase credentials configured (`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are empty in `.env.example`, no `.env` present), so the actual network-backed sign-up/sign-in flow could not be exercised in a real browser this phase. The migration *logic* (which value wins, when the completion flag gets corrected) is fully unit-tested against fake `UserState` objects; the *plumbing* (does the real Supabase call actually carry `learning_brain` correctly) is unverified beyond code review and the new migration file being additive-safe.

---

## 5. Build Summary

```
npm run build
✓ 34 modules transformed   (was 12 through Phase D — confirms onboarding v2 is now
                             genuinely reachable from the app's real entry point)
dist/index.html                  64.50 kB │ gzip:  12.28 kB
dist/assets/index-*.css          65.58 kB │ gzip:  11.88 kB
dist/assets/index-*.js          591.11 kB │ gzip: 152.22 kB
✓ built in 152ms
```

One build failure was hit and fixed during this phase: an apostrophe inside a CSS comment (`"the legacy engine's .ob-* classes"`) combined with a wildcard-suffix pattern (`.ob-*`) confused `lightningcss`'s minifier into treating it as an unterminated string/token. Fixed by rewriting the comment in plain prose (no `.prefix-*` shorthand inside CSS comments) — a note worth keeping in mind for any future CSS comments in this codebase.

---

## 6. Regression Review

**Legacy engine:** unmodified in substance — `startOnboardingFlow()` and every function it calls are untouched. `showMainApp()`'s legacy branch is a straight line-for-line move of the original logic into an `if` block, verified both by the full Vitest suite passing and by the live browser check confirming the legacy flow still renders end-to-end under `ONBOARDING_ENGINE=legacy`.

**Auth screens (welcome/login/signup/forgot):** the only changes are two additive lines (`reconcileOnboardingCompletionState()` calls) inside the existing try blocks of the sign-in and sign-up handlers, plus removing one hardcoded field (`hasCompletedAssessment: false`) from the sign-up `UserState.update()` call in favor of the new reconciliation function computing the correct value. Sign-in/sign-up UI, validation, and error handling are unchanged.

**Existing UserState consumers:** `learningBrain` defaults to `null`, so any code reading other `UserState` fields is unaffected. `learning_brain` in `syncToRemote()`/`syncFromRemote()` follows the exact same pattern as every other field in those functions — no new merge strategy was invented.

**Pre-existing issue discovered and fixed:** while adding the `learning_brain` sync column, it became apparent that `syncToRemote()` has been sending `motivation`, `cefr_level`, `target_goal`, `daily_time_goal`, `study_hours_goal`, `learning_score`, `learning_memory`, `assessment_history`, and `has_completed_assessment` to Supabase since Sprint 1 — none of which exist in the committed `supabase-schema.sql`. Against a real Supabase project provisioned from that file, PostgREST would reject the entire upsert for containing unknown columns, meaning **profile sync has likely been silently failing in its entirety on any real deployment since Sprint 1** (the error is caught and only logged). The new migration file reconciles all of these alongside `learning_brain`, since leaving them broken would have made this phase's "never lose user data" guarantee for Guest Migration nominally true in code but false in practice against a real database.

**CSS:** purely additive across every phase (Phase D: 179 insertions/0 deletions; Phase E: further additive block, 0 deletions). No legacy `.ob-*` or general-purpose rule was modified.

**No file outside the table in §3 was touched.** Confirmed via `git diff --stat` against every other `src/` file before staging.

---

## 7. Remaining Technical Debt

1. **`profile/leagues.js` and `profile/recommendation.js` don't exist yet.** `gamificationSeed.js` uses a `DEFAULT_LEAGUE` placeholder (`'Bronze'`) instead of a real ladder; `firstSession.js` uses a minimal difficulty-tier catalog match instead of the full recommendation engine originally planned. Both were explicitly out of scope for every phase they were deferred from.
2. **AI level estimation is unbuilt.** `needsLevelAssessment: true` is captured and persisted correctly, but nothing yet acts on it — a "I don't know my level" user's `cefrLevel` stays `null` indefinitely until that future feature ships.
3. **Guest→account migration is unverified against a real Supabase backend**, for the environmental reason stated in §4. The first real deployment with credentials configured should include a manual pass through: guest completes onboarding → signs up → confirms `profiles.learning_brain` populated in the Supabase dashboard → confirms a second device signing into that account receives the brain via `syncFromRemote()`.
4. **A mid-onboarding guest cannot currently reach the sign-up/sign-in forms** (no such navigation path is exposed in the UI during the answering phase), so the "draft scoped to the wrong userId after a mid-flow identity change" edge case is architecturally possible in `OnboardingStore` but not reachable through the current UI. Worth a deliberate look if a "create an account" affordance is ever added to the in-progress onboarding chrome.
5. **The legacy engine's own latent bug is unfixed:** the leftover `>>>>`/`<task_progress>` artifact in `index.html`'s welcome panel (flagged in the very first engineering-plan review) and the missing Supabase access-token refresh in `db.js` were both identified in the original planning phase as Sprint 1 issues, and neither was in scope for any Sprint 2 phase's explicit instructions. They remain open.
6. **No automated visual regression testing.** The Playwright walkthrough this phase verifies structure and behavior, not pixel-level appearance; screenshots were captured and reviewed manually.
7. **Legacy engine removal** is explicitly a separate, future, approval-gated step per the approved product decision — not attempted here.

---

## 8. Sprint 2 Release Notes

**LinguAlphabet — Onboarding & Learning Brain Initialization**

- Replaced the old 10-question level assessment with a simple, honest English Level Selection (Beginner through Advanced, plus "I don't know my level") — no level is ever silently guessed or mapped to a CEFR score from a self-report.
- Onboarding now asks four focused questions — your goal, your level, your daily time commitment, and what's motivating you (tags or your own words, or both) — then builds your personal Learning Brain in front of you, with real progress messages and a live percentage tied to genuine work, not a fake loading bar.
- Every onboarding session ends the same way: a Learning Brain Ready card showing today's first mission and a recommended first podcast, with one clear "Start Learning" button into the app.
- If onboarding is interrupted — closing the app, a network hiccup — nothing is lost. Reopening the app picks up exactly where you left off, and if something fails during setup, you can retry without re-entering anything.
- Guests who complete onboarding and later create an account keep everything they've already set up — no redoing it.
- The previous onboarding experience is still available (`ONBOARDING_ENGINE=legacy` for internal testing) and will be removed in a future, separately-approved release.

---

*Prepared as the closing deliverable of Sprint 2, Phase E. See `docs/sprint-2-engineering-plan.md` for the original architecture plan and its two revisions.*
