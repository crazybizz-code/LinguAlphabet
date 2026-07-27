# PRODUCTION RELEASE REPORT

**Mode:** Release Mode — stability only. No new features, no architecture
changes were introduced this pass. The one code change beyond
verification/cleanup (raising `.max(50)` → `.max(500)` on the chat message
array, from Sprint 1) predates this pass and is a payload-cap adjustment,
not a feature.

---

## 1. Deployment Configuration Review

### Environment variables — ✅ verified

| Variable | Required | Where read | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | `src/lib/env.ts` (`requireEnv`) | Throws a clear error at import time if missing — client and server both. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | `src/lib/env.ts` | Same as above. |
| `NEXT_PUBLIC_SITE_URL` | Yes (prod) | `src/app/layout.tsx`, `robots.ts`, `sitemap.ts` | Falls back to `http://localhost:3000` if unset — **must be set to the real production domain in Vercel before going live**, or metadata/robots/sitemap will silently point at localhost. |
| `NEXT_PUBLIC_CLARITY_PROJECT_ID` | No | `src/app/layout.tsx` | Only loaded when `NODE_ENV=production`; optional. |
| `GEMINI_API_KEY` | Yes | `src/lib/gemini/client.ts` (lazy, function-scoped) | Server-only, never reaches the client bundle. Missing → clean `Error`, not a crash, and only on the specific request path that needs it. |
| `OPENROUTER_API_KEY` | Yes | `src/ai/providers/openrouter/client.ts` (lazy) | Same posture as above — Tuto's chat provider. |
| `OPENROUTER_MODEL` | Yes | same file | Read fresh per request, never hardcoded. |
| `AI_PROVIDER` | No | `src/ai/providers/registry.ts` | Defaults to `"openrouter"`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (Content Engine only) | `src/lib/supabase/service-client.ts` | Deliberately **not** routed through `lib/env.ts` (which gets inlined into the client bundle) — read directly, server-only. Confirmed never imported from a Client Component. |
| `CRON_SECRET` | Recommended | `src/app/api/content-engine/ingest/route.ts` | Optional locally; Vercel auto-injects it as `Authorization: Bearer $CRON_SECRET` for the configured cron. Route checks it when present — **set this in Vercel** or the ingest endpoint is unauthenticated if hit directly (still requires knowing the URL, but should be set). |

None of the above are read at module top-level in a way that could break
the production build if unset (verified: `npm run build` was also run
successfully with placeholder values for all of them — see §4). A real
deploy still needs the **real** values set in Vercel's project settings,
which this sandbox cannot verify directly (no live Vercel project attached
to this session).

### Production Supabase configuration — ⚠️ needs a live check outside this sandbox

Everything at the code level is correct: the browser/server clients
(`src/lib/supabase/{client,server}.ts`) always use the anon key and go
through `@supabase/ssr`, which respects RLS; the service-role client
(`service-client.ts`) is scoped to ops/ingestion only and never imported
client-side. **What this sandbox cannot verify** (no live Supabase project
attached): that the real production project's RLS policies match
`supabase-schema.sql`, that the Auth provider settings (Site URL, Redirect
URLs, email templates) are configured, and that `supabase/remote-lessons.sql`
has actually been applied. Confirm these against the real project before
flipping traffic to it.

### Auth callbacks — ⚠️ known gap, not a blocker

No `/auth/callback`-style route exists, and `signUp()` is called with no
`emailRedirectTo` (`src/app/(auth)/signup/page.tsx`). This means a
learner who clicks their confirmation email link is **not** automatically
signed in afterward — they land wherever the Supabase project's Site URL
points (this app's `/` immediately redirects to `/login`), and have to log
in manually. The signup page's own "Check your email" copy already sets
this expectation correctly ("Click it to activate your account, **then
sign in** to get started") — this is a real, working, if slightly less
seamless, flow, not a broken one. Confirmed unchanged from the prior
Final Pre-Launch Production Review's P1 finding. Not a blocker; documented
as P1 debt below.

### Domain configuration — ⚠️ action required in Vercel

`NEXT_PUBLIC_SITE_URL` must be set to the real production domain in
Vercel's environment variables before deploy (see table above) — nothing
in code needs to change, this is purely a dashboard step.

### Email verification — ✅ handled gracefully in code

`signUp()`'s `session: null` response (the "confirmation required" case)
is explicitly detected and shown its own "Check your email" screen
(`signup/page.tsx`) instead of silently walking into onboarding with no
session (which would previously have made every onboarding write a no-op).
Whether confirmation is actually *required* is a Supabase project setting,
not code — verify it's enabled on the real project.

### API keys — ✅ verified secure

No hardcoded secrets found anywhere in `src/` (checked for common key
patterns). All server-only secrets are read lazily at request time inside
function bodies, never at module scope, and never through `lib/env.ts`
(which is client-bundle-safe by design and only carries the two
`NEXT_PUBLIC_*` values). `.env` and `.env*.local` are gitignored.

### Build configuration — ✅ verified

`next.config.ts` sets baseline security headers (`X-Content-Type-Options`,
`X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`) on every
route, and a `remotePatterns` allowlist for `next/image` sourced from the
same list the content cards check at runtime (so the two can't drift
apart again — a past incident). `vercel.json` configures the one cron
(`/api/content-engine/ingest`, daily). Production build (`next build`)
completes cleanly — see §4.

---

## 2. End-to-End User Journey Verification

**What this sandbox can and cannot verify:** there is no live Supabase
project or deployed Vercel environment attached to this session, so a
real signup → email → login → full journey with persisted data cannot be
executed end-to-end here. What follows is what *was* actually verified
(live dev server + Playwright, real route behavior) versus what is
confirmed by code review only.

### Verified live (Playwright, dev server, placeholder Supabase project)

| Route | Expected | Result |
|---|---|---|
| `/` | redirects to `/login` | ✅ |
| `/login`, `/signup`, `/forgot-password` | render 200, no redirect | ✅ all three |
| `/welcome`, `/name`, `/level`, `/goal`, `/daily-time`, `/interests`, `/ready`, `/ai-plan` | render 200 (no auth guard by design — documented P2, not a bug) | ✅ all eight |
| `/dashboard`, `/explore`, `/progress`, `/profile`, `/settings` | unauthenticated → redirect to `/login` | ✅ all five; `/explore`/`/progress`/`/profile`/`/settings` also confirmed their internal API calls correctly return 401 without a session |
| `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest` | 200, valid content | ✅ all three |
| `/api/ai/chat`, `/api/ai/vocabulary`, `/api/ai/article` | 401 without a session | ✅ (confirmed both this pass and in the prior security sprint) |

No console errors beyond the sandbox's own network proxy rejecting calls
to the placeholder Supabase URL (expected — there is no real backend to
reach here; the app correctly treats the failed auth check as "not
authenticated" and redirects, which is the safe behavior either way).

### Confirmed by code review (cannot be exercised without a live backend + real auth)

- **Sign Up → Email Verification → Login → Onboarding:** signup correctly
  branches on `session === null` (needs confirmation) vs. immediate
  session (walks into `/welcome`); onboarding screens persist state via
  Supabase writes gated on a real user id.
- **AI Learning Plan, Dashboard, Explore, Article/Podcast, Quiz, Progress,
  Profile:** all read/write through the unified `LearnerRepository`/
  `ContentRepository`/`SignalRepository` path established in the
  Dashboard↔Learning Brain Bridge work — no duplicate learner-state logic
  found in this pass (none was introduced this sprint).
- **AI Coach Chat — conversation persistence, memory, XP/streak,
  responses:** `ConversationRepository` persists `recentMessages`
  (capped at `MAX_REMEMBERED_MESSAGES = 12`) and `orchestratorState` after
  every turn (`persistConversationMemory` in `ai-service.ts`); XP/streak
  updates go through the Learning Engine/Signal Repository path unchanged
  this pass. The sliding-window + summarization fix from Sprint 1 only
  changes what's sent *to the model*, never what's persisted — verified
  by re-reading `persistConversationMemory()`, which still writes
  `input.messages` (the full turn), not the windowed subset.
- **Logout → Login again:** `signOutAction()` calls `supabase.auth.signOut()`
  then redirects to `/login`; session/cookie handling goes through
  `@supabase/ssr`'s `getUser()` on every request (`src/proxy.ts`), which is
  the pattern required to actually refresh the session cookie.

**Recommendation:** run one real click-through (signup → confirm email →
login → onboarding → dashboard → a lesson → chat → logout → login) against
the actual Vercel + Supabase production project once both are live, before
opening access beyond the team. Nothing found in this pass suggests it
will fail, but a sandboxed code/route review is not a substitute for one
real pass against real infrastructure.

---

## 3. Repository Cleanup — TODO / FIXME / debug code

Searched all of `src/` for `TODO`, `FIXME`, `HACK`, `XXX`, `console.log`,
`console.debug`, `debugger`, `.only(` (stray focused tests), `@ts-ignore`/
`@ts-expect-error`, and mock/stub/dummy markers.

**Removed** (temporary, self-labeled "Remove once fixed" debug
instrumentation from a past thumbnail-extraction incident, gated on one
hardcoded article title, no longer needed in production):
- `src/lib/content-engine/providers/the-conversation-provider.ts` — all
  `[thumbnail-trace]` tracing (`isTraceTarget`, `trace()`,
  `traceImageInventory()`, the `writeFileSync` debug dump to `/tmp`, and
  every `traceTarget` parameter threaded through the real extraction
  functions). The real extraction logic itself is byte-for-byte unchanged.
- `src/lib/content-engine/storage.ts` — the matching `isThumbnailTraceTarget`
  gate and its two `console.log` calls; `upsertContentItem` now does a
  single unconditional upsert again (previously branched into a
  `.select().single()` read-back only for the traced article).
- `src/app/api/content-engine/ingest/route.ts` — the matching trace
  `console.log` inside `normalize()`.

**Deliberately not removed** (real production functionality, not debug
scaffolding, despite an unrelated stale "TEMP DEMO" comment header):
- `src/lib/content/thumbnailFallback.ts` — a genuine 3-tier image fallback
  shown whenever a content item's real `thumbnail_url` is missing, so
  learners never see a broken image. Its header comment is stale (it
  references the now-removed trace instrumentation and calls itself
  "TEMP DEMO FALLBACK"), but the mechanism itself is real, exercised code
  with no debug behavior — removing it would regress real UX, so it was
  left as-is per "do not refactor."
- `src/ai/tools/mock-data.ts` and its two consumers
  (`getSelectedVocabulary`) — a known, already-triaged P1 (limited
  built-in vocabulary coverage: 2 hardcoded entries), not leftover debug
  scaffolding. Already tracked in a prior audit as roadmap debt, not a
  correctness bug; left untouched and re-listed below.

No stray `.only()` tests, no `@ts-ignore`/`@ts-expect-error` suppressions,
and no hardcoded API-key-shaped strings were found anywhere in `src/`.

---

## 4. Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ no errors |
| `npx eslint .` | ✅ no errors |
| `npx vitest run` | ✅ 7 test files, 64 tests, all passing |
| `next build` (production build, placeholder env) | ✅ compiles cleanly, 28 routes generated (static + dynamic split as expected), no build-time errors or warnings |

Re-ran the full suite again after the debug-instrumentation removal in
§3 — still 100% clean, confirming the removal changed no real behavior.

---

## ✅ Build Status

Clean. `next build` completes successfully; static and dynamic routes
split as expected (marketing/auth/onboarding pages static, dashboard/
explore/progress/profile/settings/API routes dynamic per-request as they
must be for an authenticated, personalized product).

## ✅ Test Status

100% passing — 64 tests across 7 files (AI service confidence gating,
turn classifier, conversation window, rate limiting, and others).
TypeScript and ESLint both clean with zero errors or warnings.

## ✅ Security Status

- All three AI endpoints (`/api/ai/chat`, `/api/ai/vocabulary`,
  `/api/ai/article`) require auth (401 without a session) and are rate
  limited per-user (confirmed unchanged from the prior security sprint).
- Prompt construction treats tool/retrieved content as explicitly
  untrusted (`<untrusted_tool_data>` wrapping + system-prompt policy),
  unchanged this pass.
- No hardcoded secrets in the repo; all server secrets read lazily,
  server-only, never inlined into the client bundle.
- Baseline security headers on every route. No CSP yet (explicitly
  deferred pending live-browser testing — documented in `next.config.ts`,
  not silently missing).
- Rate limiting is in-memory and single-instance by explicit, documented
  design (`src/lib/rate-limit.ts`) — a real, disclosed limitation under
  horizontal scaling, not a hidden gap.

## ✅ AI Status

- Chat history is bounded: a fixed sliding window (20 turns) plus
  best-effort summarization of anything older, so the model can never be
  sent an unbounded conversation regardless of client-side growth
  (Sprint 1).
- Turn Classifier confidence is now enforced: a low-confidence
  classification can never drive a strong Orchestrator action by itself —
  it degrades to the same honest "open questions" gap as no classification
  at all (Sprint 1).
- Conversation persistence, memory recap, and the Orchestrator's
  turn-by-turn decisions are all unchanged and verified still wired
  correctly this pass.
- Known, already-tracked AI debt: `getSelectedVocabulary`'s built-in
  dictionary only covers 2 hardcoded words (P1, unchanged, see below).

## ✅ Deployment Readiness

Code and configuration are ready for a Vercel deploy pending two
operational steps that live outside this repository and this sandbox:
1. Set the real `NEXT_PUBLIC_SITE_URL`, Supabase, Gemini, OpenRouter, and
   `CRON_SECRET` values in Vercel's project environment variables.
2. Confirm the real Supabase project's RLS policies, Auth URL
   configuration, and schema match what's in this repo
   (`supabase-schema.sql`, `supabase/remote-lessons.sql`).

Neither is a code change — both are the kind of one-time configuration
step every Vercel+Supabase deploy requires, not a defect found in this
review.

## ✅ Remaining Technical Debt (P1 / P2 only — no P0s)

**P1**
- Email confirmation has no `/auth/callback` route or `emailRedirectTo` —
  functional but not auto-signed-in after confirming (see §1). Est. 0.5
  day if a callback route is added; 15 min if only manual Supabase
  dashboard verification is wanted instead.
- `getSelectedVocabulary`'s built-in dictionary covers only 2 hardcoded
  words; a real vocabulary lookup path (`getVocabularyEntry`, curated
  knowledge base) already exists as the primary path. Est. effort depends
  on how much of the mock dictionary needs replacing with real data.
- In-memory, single-instance rate limiting — real protection today, but
  not shared across concurrent serverless instances under scale. Consider
  a distributed limiter (e.g., Upstash Redis) if traffic grows past what
  a single instance's memory meaningfully protects.

**P2**
- Onboarding screens have no auth/completion guard (harmless today per
  earlier audit — the only write is itself gated on a real user id — but
  inconsistent with every other route group's discipline).
- `README.md`'s "Current Development Phase"/roadmap section is stale
  (marks several already-built phases as ⏳ pending) — documentation only,
  no functional impact.

---

# 🟢 READY FOR PRODUCTION BETA

Every P0 from every prior audit this session is fixed and re-verified;
this pass found zero new P0s. TypeScript, ESLint, the full test suite,
and a real production build are all clean. Every AI endpoint is
authenticated and rate-limited. The three Sprint 1 reliability fixes
(bounded chat context, confidence-gated Orchestrator actions, and the
tailwind-merge typography fix) are in place and verified. Leftover debug
instrumentation has been removed without touching real behavior. The only
open items are P1/P2 debt that was already known, already assessed as
non-blocking, and does not put a real learner journey at risk — plus two
external configuration steps (Vercel env vars, live Supabase project
settings) that no code change can substitute for and that this sandbox
has no live infrastructure to verify directly. Recommend one real
click-through against the live Vercel + Supabase project immediately
after deploy, before opening access beyond the team.
