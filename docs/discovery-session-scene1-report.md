# Discovery Session — Implementation Report

## Milestone: Scene 1 — Meet Tuto

**Status:** Implemented, tested, built. Awaiting approval before Scene 2.

---

## What was built

A new, self-contained experience-layer module, `src/discovery/`, implementing the first scene of the Discovery Session (externally-facing name for the adaptive assessment). This scene is the greeting beat that runs before any adaptive question is asked — it exists purely to make the learner feel like they've started a conversation with Tuto.

```
src/discovery/
├── index.js                          public entry point (re-exports the scene + scene contract)
└── scenes/
    ├── sceneDescriptor.js             minimal scene contract: { id, mount(ctx), unmount() }
    ├── meetTuto.js                    Scene 1 implementation
    └── meetTuto.test.js               11 tests (Vitest, jsdom, fake timers)
```

Plus one additive change: `src/style.css` gained a new `.ds-` prefixed block (`/* ===== DISCOVERY SESSION: SCENE 1 — MEET TUTO ===== */`) at the end of the file. No existing rule was touched.

## What the scene does

1. Tuto's avatar renders immediately and stays on screen for the whole scene (persistent presence).
2. Three lines land one at a time, each preceded by a silent pause and a typing-dots beat, with deliberately uneven gaps (300/500/900ms silences; 700/650/700ms typing beats) so it doesn't read as a metronome:
   - "Hey — I'm Tuto."
   - "I'm going to get to know you a little before we start."
   - "There's no wrong answer here — I just want to see how you think."
3. Every line stays visible as the next one arrives — a running transcript, not a screen that resets (bubble history / conversation continuity).
4. After a final silent beat, a single "I'm ready" button appears. Nothing auto-advances into the session itself — this is a deliberate, explicit confirmation, not a timer-driven skip.
5. Tapping the button calls `ctx.onReady()` once. The scene has no opinion about what happens after that — it hands control back to its caller.

## How it maps to the three governing documents

- **Conversation Experience Specification** — this scene *is* that spec's "Meet Tuto"-equivalent beat: conversational pacing (silence → typing → reveal), Tuto always present, bubble history retained, dynamic-but-warm tone, no auto-advance out of the scene.
- **Creative Experience Blueprint** — rather than invent new motion values, the scene reuses the app's already-established production motion language: the `tuto-entrance`/`tuto-breath` keyframes, the `scale-up` bubble entrance, and the typing-dots animation, all of which already exist in `src/style.css` and are used by the Sprint 1 welcome screen (`src/main.js: initWelcomeScreen`, ~800ms typing-to-reveal). This keeps Scene 1 visually consistent with the rest of the app without me guessing at values a blueprint I haven't seen might specify.
- **Engineering Specification** — untouched. This scene does not implement, call, or reference the adaptive algorithm, checkpoint staircase, confidence model, stopping criteria, state machine, or Learning Brain integration. Its only seam is `ctx.onReady()`, a plain callback the (unmodified) engineering layer will invoke this scene with and receive control back from — it carries no assumptions about what that layer looks like internally.

## Founder Decisions — compliance check

| Decision | How Scene 1 satisfies it |
|---|---|
| Never expose test/exam/score/grade/difficulty/algorithm/confidence | Verified by an automated test (`meetTuto.test.js`) that asserts none of those words appear anywhere in the rendered scene text |
| Continuous conversation, not independent screens | Single persistent container; no screen reset between lines |
| Tuto always present | Avatar mounted once, never removed/re-rendered during the scene |
| Bubble history stays visible | Each new line appends to the transcript; prior bubbles are never cleared |
| Selections auto-advance / typing requires confirmation | N/A yet (no input in Scene 1) — but the scene's own exit is an explicit tap, not a timer, since it's the threshold into the session |
| Silence is part of the experience | Deliberate, uneven pauses before each line and before the CTA |
| Result reveal earned via anticipation | N/A — that's Scene N (the reveal scene), out of scope here |
| Learning Brain transition feels like continuation | N/A — Scene 1 has no Learning Brain contact |
| Compatible with existing architecture, no changes to frozen modules | No file under `onboarding/`, `profile/`, `services/`, or any auth module was modified. Only `src/style.css` (additive) and the new `src/discovery/` tree |

## What was intentionally left undone (scoping decision — flagging for your review)

Scene 1 is **not wired into `main.js`'s boot flow.** I did not add a call site that mounts `meetTutoScene` from anywhere in the running app yet. Reasoning: wiring it in requires deciding *where* the Discovery Session sits in the boot decision tree relative to onboarding/auth/dashboard — that's an Engineering Specification / state-machine decision, and I don't have that document's content in front of me (flagged in earlier turns). Rather than guess at an integration point that the frozen state machine may already define differently, I kept Scene 1 a standalone, fully-tested unit with a clean `mount(ctx)/unmount()` contract, ready to be dropped into whatever entry point the Engineering Specification specifies.

If this scoping is wrong and you'd like me to also wire Scene 1 into a specific boot path now, tell me where and I'll do it in the same milestone.

## Verification performed

- **Tests:** `npm test` → 255/255 passing (23 files), including 11 new tests for `meetTuto.js` covering: scene id, initial render, CTA hidden until the sequence finishes, typing-beat-before-line pacing, bubble-history accumulation, CTA reveal timing, `onReady` firing on tap, forbidden-vocabulary absence, timer cleanup on `unmount()`, and factory-instance isolation.
- **Build:** `npm run build` → succeeds (pre-existing chunk-size warning, unrelated to this change, was already present before Scene 1).
- **Visual QA:** ran the scene in a real browser (temporary preview harness, Vite dev server + Playwright screenshots, both removed afterward — not part of the diff) and confirmed: avatar renders, typing dots animate, bubbles land and accumulate correctly, CTA reveals only at the end. Screenshots matched the intended pacing described above.

---

**Waiting for approval before starting Scene 2.**
