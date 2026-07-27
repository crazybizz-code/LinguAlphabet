# AI Reliability Report — Sprint 1

Scope: exactly the three items below. No other issue from any prior audit
was touched. No new features, no unrelated refactors.

---

## 1. Chat History Management

**Problem:** `useTutoChat` (`src/hooks/useTutoChat.ts`) resends the entire,
ever-growing message array on every turn, with no client-side cap. The AI
Service's `toProviderMessages()` (`src/ai/services/ai-service.ts`) forwarded
that array to the model verbatim, with no windowing of any kind. The only
existing cap was `ChatRequestSchema`'s `.max(50)` in
`src/app/api/ai/chat/route.ts` — a hard 400 rejection once a real
conversation grew past 50 messages, not graceful degradation.

**Fix:**
- New module `src/ai/services/conversation-window.ts`:
  - `CONTEXT_WINDOW_MESSAGES = 20` — a fixed ceiling on how many of the most
    recent user/assistant turns are ever sent verbatim.
  - `splitConversationWindow()` — pure function splitting a message array
    into `{ overflow, recent }` at that boundary.
  - `summarizeOverflow()` — a best-effort AI call that condenses `overflow`
    into 2-4 sentences. Returns `null` on any failure (bad JSON, provider
    error, empty content) rather than guessing or throwing — same
    convention as `classifyTurn()` (`src/ai/turn-classifier`): a missing
    summary degrades context, it never breaks the turn.
- `ai-service.ts`: `resolveConversationWindow()` runs this in parallel with
  the existing memory/teaching/turn-signal resolution (same `Promise.all`
  pattern already used in `generateResponse()`/`streamResponse()`).
  `toProviderMessages()` now sends the system prompt, then (if a summary
  exists) a synthetic system message carrying it, then only the most recent
  `CONTEXT_WINDOW_MESSAGES` turns — never the full raw history.
- `generateStructuredResponse()` (vocabulary/article one-shot calls) was
  **not** touched — those callers always send exactly one message
  (`src/ai/features/{article,vocabulary}/service.ts`), so windowing doesn't
  apply and adding it would be scope creep.
- `ChatRequestSchema`'s cap raised from `.max(50)` to `.max(500)`: the
  windowing above now makes an arbitrarily long real conversation safe to
  accept, so the low cap was only ever hurting legitimate long sessions.
  500 remains as a sanity ceiling against an abusive payload, not a
  conversation-length limit.

**Guarantee:** regardless of how long a client's conversation grows, the
model only ever receives the system prompt + an optional short summary +
the most recent 20 turns — a fixed, bounded payload.

**Verified:** `src/ai/services/conversation-window.test.ts` (new) — pure
split behavior at boundary sizes, and `summarizeOverflow()`'s null-on-empty/
null-on-failure/trims-and-returns behavior via a fake provider. `tsc`,
`eslint`, `vitest` all pass (see Verification below).

---

## 2. Turn Classifier Confidence

**Problem:** `TurnSignal { outcome; confidence }` already existed
(`src/ai/turn-classifier`), but the Learning Orchestrator's
`applyTurnSignal()`/`orchestrateSession()` (`src/ai/learning-orchestrator/orchestrator.ts`)
switched purely on `outcome` and never read `confidence` — a signal at
confidence 0.05 was acted on exactly like one at 0.95, driving a real
pedagogical action (repeat/simplify/hint/escalate/celebrate) off a
classification the classifier itself wasn't sure about.

**Fix:**
- Added `MIN_TURN_SIGNAL_CONFIDENCE = 0.5` in `orchestrator.ts`.
- `orchestrateSession()` now only treats `lastTurnSignal` as actionable
  when `confidence >= MIN_TURN_SIGNAL_CONFIDENCE`. Below that threshold, it
  falls through to the **existing** honest "open questions" mechanism
  (previously reserved for "no TurnSignal supplied at all") — the same
  gap-reporting path, now also covering "a TurnSignal exists but isn't
  trustworthy enough to act on." The `openQuestions` reason text
  distinguishes the two cases (absent vs. present-but-low-confidence, with
  the actual outcome/confidence value included) so the distinction is still
  visible to anything inspecting `OrchestratorDecision`.
- No change to the classifier itself (`src/ai/turn-classifier`) — it was
  already correct; only how its output is *used* needed to change.

**Guarantee:** a low-confidence classification can never drive a strong
orchestrator action by itself — it degrades to the same "I don't know,
here's what I'd otherwise consider" signal as having no classification at
all.

**Verified:** new test in `src/ai/learning-orchestrator/orchestrator.test.ts`
— a `{ outcome: "mastered", confidence: 0.3 }` signal (an outcome that,
above threshold, would immediately celebrate and advance the step) instead
falls through to `"continue"` with all five judgment-gated actions raised
as open questions, and the reason text names the actual confidence value.
All pre-existing tests at 0.7-0.95 confidence continue to pass unchanged.

---

## 3. Design System Fix — tailwind-merge class conflict

**Problem:** `cn()` (`src/lib/utils.ts`) used `twMerge()` with the stock
config, which has no knowledge of this project's custom `--text-*`
font-size scale (`hero`/`heading`/`display`/`h1`/`h2`/`h3`/`body`/`small`/
`caption`/`badge`, defined in `globals.css`'s `@theme`). Verified live via
direct `clsx`+`twMerge` reproduction of the exact class arguments used at
each call site:
- `Button.tsx`: `text-body` was silently dropped entirely from every
  variant — every button in the app rendered with no explicit font-size
  utility.
- `Checkbox.tsx`: `text-caption` was dropped, keeping only the color class.
- `Input.tsx` (fixed in an earlier sprint by reordering color-before-size
  at that one call site) was a symptom patch, not the root cause — the
  same conflict was still latent in `src/lib/utils.ts` for any future
  call site.

**Fix (root cause, one place):** `src/lib/utils.ts` now builds `twMerge`
via `extendTailwindMerge()`, registering the custom `text-*` size scale
under the built-in `"font-size"` class group (separate from Tailwind's own
`"text-color"` group). This is the one config change that fixes every
current and future call site — no more careful class-ordering required
per component.

**Verified live** (`node -e` reproduction of the real class arguments,
before/after):

| Call site | Before | After |
|---|---|---|
| `Input.tsx` | `text-text-primary` dropped, `text-body` kept | both kept |
| `Button.tsx` (primary) | `text-body` dropped | both `text-body` and `text-text-on-primary` kept |
| `Checkbox.tsx` | `text-caption` dropped | both `text-caption` and `text-text-primary` kept |

Same-group overrides (a caller passing a different explicit size, or a
different explicit color) still correctly dedupe — confirmed with
`twMerge(["text-body", "text-h1"])` → `text-h1`, and
`twMerge(["text-text-primary", "text-text-secondary"])` → `text-text-secondary`.

**Playwright, live dev server** (`/login`, `/signup`):
- `Button` ("Sign In", "Create Account") — computed `font-size: 16px`
  (`--text-body`), correct on both routes. (The one other 14px button on
  `/login` is the password-visibility toggle, a plain unstyled `<button>`,
  not this component — unaffected, not a regression.)
- `Input` (email/password fields) — computed `font-size: 16px` on both
  routes, unchanged/still correct.
- `Checkbox` is not yet wired into any screen in the app, so it has no live
  route to screenshot; its fix is confirmed by the direct `cn()`
  reproduction above, which uses its exact real class list.

---

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ no errors |
| `npx eslint .` | ✅ no errors |
| `npx vitest run` | ✅ 7 test files, 64 tests, all passing (includes 2 new tests: `conversation-window.test.ts`, and one added case in `orchestrator.test.ts`) |
| Playwright (`/login`, `/signup`, live dev server) | ✅ Button/Input font-size confirmed correct |

No new feature was added beyond the three items above. No file outside
`src/ai/services/{ai-service,conversation-window}.ts`,
`src/ai/services/conversation-window.test.ts`,
`src/ai/learning-orchestrator/orchestrator.ts`,
`src/ai/learning-orchestrator/orchestrator.test.ts`,
`src/lib/utils.ts`, and `src/app/api/ai/chat/route.ts` (the `.max()` cap
only) was touched.
