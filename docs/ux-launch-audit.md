# UX Launch Audit — First-Time User, Pre-Submission Review

Status: **audit only — no code changed.** Architecture and AI are explicitly
out of scope per instruction; this is a visual/interaction review only,
written from the perspective of an Apple product designer doing a final
pass before App Store submission.

## Method

The dev server was run locally with placeholder Supabase credentials
(never committed, never real) purely so unauthenticated pages could
render for live inspection — this sandbox has no real Supabase project,
same constraint as every prior audit in this repo. Playwright drove real
Chromium at three breakpoints (**small phone** 375×667, **large phone**
430×932, **tablet** 820×1180 — matching `coding-standards.md`'s own
`max-md`/`max-lg` breakpoint definitions), captured full-page screenshots,
and measured every interactive element's tap-target size, every input's
computed font-size, and horizontal-overflow state, cross-checked against
`docs/design-system.md`'s explicit numeric spec (16–17px body text, 8pt
spacing grid, "no ugly outlines").

**What this could verify live:** every unauthenticated screen — both
`(auth)` screens (login, signup, forgot-password, reset-password) and
the full `(onboarding)` wizard (welcome → name → level → goal →
daily-time → interests → ready → ai-plan), plus the 404 page — in light
mode and with `prefers-color-scheme: dark` emulated.

**What this could not verify live** (same sandbox limitation as every
prior audit here: no real Supabase project, no real session): Dashboard,
Explore, Progress, Profile, the bottom nav and FloatingTuto in their real
authenticated context, and the article/podcast learning session (Reading/
Player/Dictionary/Quiz steps). These are assessed by direct source/CSS
reading below and clearly marked as code-review, not a rendered
screenshot.

**One artifact to ignore:** every screenshot below shows a small black
circular "N" badge in the bottom-left corner — that is Next.js's own
development-mode indicator. It is never present in a production build
and is not a product defect; noted here so it isn't mistaken for one.

---

## P0 — Would fail an App Store-quality bar; fix before shipping

### 1. The AI-plan reveal screen renders Tuto inside a visibly broken image frame

The single most emotionally important moment in onboarding — "Creating
your plan / Analyzing your profile..." — is the one screen where Tuto's
mascot renders inside a small rectangular box with a visible
checkerboard/transparency-grid background, instead of the soft circular
glow frame used on every other screen (login, welcome, name, level,
goal, ready, 404 all get the polished treatment). Reproduced identically
at small-phone and tablet breakpoints, so it isn't a one-off rendering
glitch — it's this screen's actual current state. This is exactly the
kind of thing that reads as "unfinished" to a first-time user and to an
App Store reviewer, on the screen the whole onboarding flow is building
toward.

### 2. Real Apple HIG touch-target violations on every `(auth)` screen

Measured, not eyeballed, at all three breakpoints: "Forgot password?"
(105×17px), the password show/hide eye toggle (16×16px), "Sign Up"/
"Sign In" text links (~60×16px), "Back to Sign In" (121×22px) — every one
of these sits far under Apple's 44×44pt minimum tappable-area guideline.
This is on login, signup, and forgot-password — literally the first three
screens a prospective user ever touches, before they've formed any
opinion about the product yet. By contrast, **zero** small-touch-target
issues were found anywhere in the onboarding wizard (name, level, goal,
daily-time, interests) — the wizard's own Button/Input components are
sized correctly. The `(auth)` screens are the exception, not the norm.

### 3. Auth screen inputs render at 14px, below the iOS zoom-safe threshold

`docs/design-system.md` specifies Body text at 16–17px. Every text input
on login, signup, and forgot-password measures 14px in the browser's
computed styles. On a real iPhone, any input under 16px triggers Safari's
automatic pinch-zoom on focus — the page visibly jumps/zooms the instant
a user taps the email field. This is a well-known, distinctly
"not-premium" mobile-web paper cut, and it's also a direct violation of
the product's own stated type spec. Same pattern as #2: present on every
`(auth)` screen, absent everywhere in `(onboarding)`.

---

## P1 — Meaningfully undermines "this feels expensive," not launch-blocking

### 4. No dark mode exists, despite unfinished scaffolding for one

`globals.css` defines `--color-bg-dark`/`--color-text-on-dark` tokens,
but they're referenced nowhere else in the codebase — no `dark:`
Tailwind variant, no `prefers-color-scheme` media query, no theme
toggle. Confirmed empirically too: emulating a dark OS preference
produces a byte-identical light-themed page. Shipping light-only is a
legitimate product choice, but right now it reads as an abandoned
half-start rather than a decision — worth either finishing or removing
the dead tokens so a future reader doesn't mistake them for wired-up
design intent.

### 5. Auto-focused inputs show a native rectangular outline artifact

The first input on a single-input onboarding step (Name, Forgot Password)
auto-focuses on load. The custom soft focus ring renders correctly, but a
visible rectangular native browser outline peeks out at the ends of the
otherwise-rounded input — a small but real violation of the design
system's explicit "no ugly outlines — soft focus ring instead" rule,
visible on the very first field a learner ever interacts with.

### 6. `(auth)` screens don't adapt to tablet width; `(onboarding)` does

At the 820px tablet breakpoint, login/signup/forgot-password just center
the same narrow mobile-width card with large dead margins on both sides
— no tablet-specific treatment. The onboarding wizard, by contrast,
correctly reflows its grids (Interests goes 2-column → 3-column, Level/
Goal get wider, more legible cards) at the same breakpoint. Given
`coding-standards.md` states the product is explicitly "desktop-first,"
the `(auth)` group reads like it was never revisited for anything wider
than a phone.

### 7. First impression is backwards: the least-polished screens come first

Combining #2/#3/#6: a new user's very first interactions (signup, login)
are measurably less refined than the onboarding wizard they see
immediately after. The polish gradient should run the other way — or at
minimum be flat.

### 8. Minor tone inconsistency between error states

The 404 page includes Tuto and warm, on-brand copy ("Tuto looked
everywhere but couldn't find this page"). The "link expired or invalid"
password-reset error state — otherwise clean and well-written — omits
Tuto entirely, reading slightly more clinical/systemic. Not wrong (a
security-adjacent error may deliberately want a more neutral tone), but
worth an explicit decision rather than an incidental gap.

---

## P2 — Nice-to-have polish

### 9. Learning Goal screen's odd item count leaves a lopsided last row

7 goal options in a 2-column grid leave "Exam Preparation" alone on a
third row, left-aligned with a large empty gap beside it. Centering the
lone trailing card (or accepting the asymmetry deliberately) would read
more intentional.

### 10. Two animation durations sit slightly outside the stated range

`docs/design-system.md` specifies 250–350ms; `lib/motion/variants.ts`'s
`DURATION.fast` (150ms, small micro-interactions) and `DURATION.push`
(450ms, full-screen navigation) sit just outside that band. Very likely
deliberate and reasonable given what each is used for, but worth
confirming that's an intentional, documented exception rather than
drift — everything else in the file (200/250/400ms range, all-natural
cubic-bezier easing, no linear/bounce) matches the spec closely and is
genuinely well-organized.

### 11. Disabled "Continue" buttons still have no explanatory affordance

Carried over from `docs/beta-launch-audit.md`, still true: a
correctly-muted, clearly-disabled "Continue" button gives no inline hint
about what's still needed. The disabled visual state itself reads fine;
this is about the *next* step being unclear, not the current one looking
broken.

---

## Confirmed strengths — worth protecting, not just problems to fix

- **Zero horizontal overflow** found on any screen tested, at any of the
  three breakpoints. Nothing clips, nothing forces a scrollbar it
  shouldn't.
- **Safe-area handling is real and consistent** (verified by source
  reading, not live rendering, since both live only behind auth):
  `DashboardBottomNav` and `FloatingTuto` both correctly compensate with
  `env(safe-area-inset-bottom)` on mobile, and `FloatingTuto`'s own code
  shows deliberate, previously-fixed handling of not overlapping the
  bottom nav — this is exactly the kind of detail that's easy to skip
  and wasn't skipped here.
- **The bottom nav's real tap target is generous** despite a compact
  18px icon glyph — the entire icon+label column is the `<Link>`, giving
  each of the four destinations a properly sized target even though the
  visible icon circle alone is small. Initially looked like a possible
  violation from the icon size alone; reading the actual markup clears it.
- **The animation system is a single, well-architected source of truth**
  — one file, natural easing curves throughout, JS and CSS values kept
  in sync by explicit convention. No "screen transitions feel sudden"
  problem anywhere this audit could check.
- **The onboarding wizard itself is close to the design system's own
  ambition** — "feels like Apple onboarding, never a registration form."
  Restrained copy, one clear action per screen, consistent mascot
  framing, sensible grid reflow at tablet width, correct touch targets
  and font sizes throughout. It's the standard the rest of the product
  (especially `(auth)`) should be brought up to, not the other way
  around.
- **404 and the password-reset-invalid-link states are both genuinely
  good empty/error-state execution** — on-brand, a single clear CTA,
  no dead ends.

---

## What this audit could not check

Dashboard, Explore, Progress, Profile, the bottom nav/FloatingTuto in
real authenticated use, and the article/podcast learning session
(Reading/Player/Dictionary/Quiz steps) all require a real session against
real Supabase data this sandbox doesn't have — these were not rendered
live and are not covered by the P0–P2 findings above beyond the two
code-reviewed items explicitly marked as such. A follow-up visual pass
against a real staging environment is the natural next step before final
sign-off, same recommendation every prior audit in this repo has made
for the same reason.
