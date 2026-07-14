# Beta Launch Audit — Preparing for the First 100 Users

Status: **audit only — no code changed as part of this document.** Per
instruction: architecture work and Content Engine work are both frozen.
This document does not propose a redesign or new features — every item
below is either a launch-blocking fix, a launch-readiness task, or a
"know about this before real users hit it" note.

## Method

Three parallel research passes (navigation/dead-links, empty/loading
states, auth+onboarding edge cases) plus direct code reading and live
HTTP checks against a local dev server for every finding reported below.
Every claim is grounded in a specific file/line, not speculation. One
category of live test — anything that calls the real Supabase project
from this sandbox — is unreliable here (this environment has no network
egress to the configured Supabase URL, confirmed by every server-rendered
protected page returning an error-boundary response instead of real
data). Where a live test was confounded this way, the finding below is
based on reading the actual code path instead, and that's stated
explicitly.

---

## Findings, grouped by what a real user would experience

### 1. Confirmed launch blocker: onboarding answers can be silently lost

**`src/app/(onboarding)/ai-plan/page.tsx:54-84`.** The wizard's final step
tries to save the user's level/goal/daily-time/interests to their
`profiles` row, then **unconditionally** wipes the local backup
(`clearOnboardingData()`, line 77) whether that save succeeded, failed,
or never ran at all (the save is skipped entirely if there's no active
session — see finding #2). Any failure is swallowed by an empty `catch`
block with only a code comment ("Non-fatal") — nothing is shown to the
user, and nothing retries.

**Real-world consequence:** a save failure (network hiccup, RLS issue, no
session) means the user's onboarding answers are gone — not saved to
their account, and no longer recoverable from local storage either. They
see the celebratory plan reveal, tap "Done," and land on a dashboard with
none of what they just told the app.

### 2. Confirmed launch blocker: onboarding has no login requirement

None of `welcome`, `name`, `level`, `goal`, `daily-time`, `interests`,
`ready`, or `ai-plan` check for an authenticated session (confirmed by
reading all 8 files — every one is a client component with no auth
guard, and there's no `(onboarding)/layout.tsx` to gate the group either).
A signed-out visitor can complete the entire wizard. Only at the very
last step (`ai-plan`) does the app try to save anything, silently
skipping the save if there's no session (see finding #1). The user
discovers something is wrong only when tapping "Done" bounces them to
`/login` (`dashboard/page.tsx:18`'s own `if (!user) redirect("/login")`),
by which point their answers are already gone.

**This also means onboarding is fully skippable for a logged-in user**:
`dashboard`/`explore`/`profile`/`progress`/`settings` all check "is this
user logged in" but never "has this user finished onboarding" — a user
can type `/dashboard` directly into the URL bar right after confirming
their email and never see the wizard at all. (The app does partially
compensate for this: `login/page.tsx:39-45` explicitly checks
`profile?.onboarding_completed` and routes an incomplete profile back to
`/welcome` on *next sign-in* — this only helps for users who log out and
back in, not for the same still-logged-in session.)

### 3. Confirmed: password reset breaks on the single most common real-world pattern — opening the email on a different device

**`src/app/(auth)/reset-password/page.tsx`** (full file read) has no code
that checks for a valid session or reads Supabase's own error parameters
on page load — it goes straight to rendering the "set new password" form.
Confirmed from the installed `@supabase/ssr`/`@supabase/auth-js` packages:
this app uses the PKCE auth flow, whose "code verifier" is stored only in
the browser that originally requested the reset — **not** transmitted via
the email link. Request a reset on a laptop, open the email on a phone
(an extremely common pattern), and the automatic code exchange fails
silently. The user still sees a normal-looking form, fills it in, submits,
and only then gets a generic error ("Auth session missing!"-style message)
with no indication the real problem was "wrong device" or "expired link."
The same generic-failure path applies to an actually-expired or
already-used reset link.

### 4. Confirmed, lower severity: retrying signup on an existing account looks identical to a real signup

**`src/app/(auth)/signup/page.tsx:50-54`.** Supabase's own anti-enumeration
behavior means signing up again with an already-registered, confirmed
email returns `error: null, session: null` — indistinguishable in this
code from a genuine new signup pending confirmation. A user who forgot
they already have an account sees "Check your email," waits for a
confirmation email that will never come, with no nudge toward "Sign in
instead" or "Forgot password?" This is inherent to how Supabase's API is
designed to work (not a bug in this file), but it's a real point of
confusion worth having a plan for.

### 5. Minor: Explore's empty-state copy is misleading when a category is just genuinely empty

**`src/components/explore/ExploreView.tsx:303`.** With no search query
active, the empty state always reads *"No {category} match those
filters"* — even when zero filters are applied and the category (e.g. a
future content type with nothing published yet) is simply empty. Small
copy fix, not a functional bug.

### 6. Minor: the Learning Session has no dedicated error page

`src/app/podcast/[id]/learn/` and `src/app/article/[id]/learn/` each have
their own `loading.tsx` (good), and a real `notFound()` call for a
nonexistent id that correctly reaches the app's root `not-found.tsx`
(verified in `podcast/[id]/learn/page.tsx:26` — `if (!podcast)
notFound();`). But neither route has its own `error.tsx`, and both live
**outside** the `(app)` route group (deliberately, per the code comment —
full-bleed, no nav chrome) — so they don't inherit `(app)/error.tsx`'s
polished, on-brand error page either. A real error here (e.g. a Supabase
hiccup mid-session) falls through to the bare-bones `global-error.tsx`,
the one screen in the product not styled to match everything else,
appearing during the single highest-stakes moment in the whole app: an
active learning session.

### 7. Everything else checked came back clean

- **No dead navigation links anywhere in the app.** Every `<Link>`/
  `router.push` target resolves to a real page. Every not-yet-built
  feature (Podcast Detail, Podcast Player, Vocabulary Deck, Tuto Chat,
  the 5 "Coming Soon" Explore tabs) is either a disabled/labeled
  "Coming Soon" element with no href, or simply has no entry point in the
  UI at all — none of them are linked-to-but-missing. Confirmed live:
  `/vocabulary`, `/podcast/[id]` (detail), and `/podcast/[id]/play` all
  return a clean 404, not a crash.
- **Empty states are handled well across Dashboard, Explore, Progress,
  Profile, and Settings** — a brand-new user with zero history sees real
  designed empty states (a "Tuto is preparing your next mission" card,
  hidden sections rather than blank ones, `"Not set"` copy for unset
  profile fields), not blank flashes or crashes. A DB trigger creates the
  `profiles` row at signup, so none of the `.single()` profile queries
  these pages depend on will throw for a fresh account.
- **Every `(app)` route has its own `loading.tsx`** (5/5), and a single
  shared `(app)/error.tsx` is a real, on-brand, working error page (not a
  stub) covering dashboard/explore/profile/progress/settings.
- **Login and forgot-password are both solid.** Login's error banner has
  `role="alert"`, "Forgot password?" is visible inline (no digging),
  network/Supabase-down failures resolve to a visible error rather than
  an infinite spinner (verified against the installed auth-js library's
  own error handling), and a missing `profiles` row can't crash the
  post-login redirect. Forgot-password deliberately never reveals whether
  an email has an account — good practice, already correct.
- **Onboarding back-navigation and browser refresh both work correctly**
  — every step's answer is written independently to `localStorage`
  (`src/lib/onboarding/storage.ts`), so going back and changing an
  earlier answer never clears later ones, and refreshing mid-wizard
  reloads the current step with everything already filled in, rather than
  bouncing back to `/welcome`.
- **The session-refresh middleware (`proxy.ts`) has no redirect logic of
  its own and doesn't need any** — it silently refreshes valid sessions;
  every protected page does its own `if (!user) redirect("/login")`; and
  because `/login` itself never redirects based on auth state, there's no
  infinite-redirect risk.

---

## Launch checklist

Ordered by what actually blocks or meaningfully risks the first 100 real
users leaving. Nothing here proposes new features or an architecture
change — every item is a targeted fix to something already built.

### Must fix before beta
- [ ] **Stop wiping onboarding answers on save failure.** In
  `ai-plan/page.tsx`, only clear local onboarding data after a confirmed
  successful save (or explicitly keep it and show a retry/error state on
  failure) — don't clear it inside a swallowed catch or when there was no
  session to save against in the first place.
- [ ] **Gate `/dashboard` (and the other four `(app)` pages) on
  `onboarding_completed`, not just on being logged in** — redirect an
  authenticated-but-not-onboarded user to `/welcome` the same way `login/
  page.tsx` already does after sign-in, so direct URL navigation can't
  skip the wizard mid-session.
- [ ] **Handle an invalid/expired/wrong-device password reset link
  explicitly** on `reset-password/page.tsx` — check for a session (or
  read Supabase's own `error`/`error_code` redirect params) before
  showing the form, and show a clear "this link is invalid or expired,
  request a new one" state instead of a generic failure after the user
  has already filled in a new password.

### Should fix before beta
- [ ] Add a short "Already have an account? Sign in instead" nudge to
  signup's "Check your email" screen, since a retried signup on an
  existing account is indistinguishable from a real one at the API level.
- [ ] Add a dedicated `error.tsx` for `podcast/[id]/learn` and
  `article/[id]/learn` so a mid-session failure shows the same on-brand
  error page as the rest of the app instead of the bare-bones
  `global-error.tsx`.
- [ ] Fix Explore's empty-state copy so a genuinely-empty category
  doesn't say "match those filters" when no filter is active.

### Worth a look, lower urgency
- [ ] Disabled onboarding "Continue" buttons have no tooltip/helper text
  explaining why they're inert — minor polish, not a stuck-state, since
  the needed action is visually obvious.
- [ ] `login/page.tsx`'s `handleSubmit` has no surrounding try/catch —
  if Supabase's client ever throws something outside its own recognized
  error types, the Sign In button could get stuck in its loading state
  with no visible error. No confirmed real-world trigger found; flagging
  as a low-probability code-structural gap.

### Known gaps to be aware of (not fixes — nothing to build here)
- Podcast Detail, Podcast Player, and Vocabulary Deck are not built yet;
  nothing in the current UI links to them, so this isn't a launch risk,
  just a reminder that some paths (e.g. a shared/bookmarked
  `/podcast/[id]` URL) will 404 cleanly rather than show content.
- Daily Challenge, Weekly Report, Tuto Chat, Tuto Coaching, and Tuto
  Insights are all correctly presented as disabled "Coming Soon" states
  with no dead links — confirm this is still the desired beta framing
  (rather than hiding them entirely) before launch.

### Verify manually before launch (can't be confirmed from this sandbox)
- [ ] Real signup → email confirmation → login round-trip against the
  actual production Supabase project (this sandbox has no network access
  to it).
- [ ] Real password-reset email round-trip, specifically opening the
  link on a different device than the one that requested it, to see the
  exact failure experienced today (per finding #3) before deciding how
  urgently to fix it.
- [ ] A visual pass on a real phone/tablet/desktop for the core journey
  (signup → onboarding → dashboard → explore → complete a Learning
  Session) — this audit is grounded in code and live HTTP status checks,
  not a rendered visual/mobile-responsiveness review.
