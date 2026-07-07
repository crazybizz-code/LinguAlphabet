# LinguAlphabet

AI-powered English coaching platform. Next.js 16 (App Router, Turbopack) +
React 19 + TypeScript, Tailwind CSS v4, Supabase for backend/auth, Google
Gemini for the AI Coach ("Tuto"), Framer Motion for animation.

This is a V2 rebuild. The original Vanilla JS + Vite implementation has been
fully retired — see `content/legacy-podcast-lessons/README.md` for what was
preserved from it (podcast content only, no application code). Android is out
of scope for this phase; `android/`/`capacitor.config.json` are preserved but
dormant, and the architecture is kept Capacitor-compatible without doing any
Android-specific work yet.

## Mandatory reading before any UI work

- `docs/design-system.md` — visual/product philosophy (Apple HIG-inspired,
  premium, calm — not Material Design, not a generic SaaS dashboard).
- `docs/coding-standards.md` — code-level conventions: folder layout,
  Tailwind v4 `@theme` token rules (including the `--spacing-*` /
  `max-w-*` collision to never reintroduce), desktop-first breakpoints,
  component patterns, Tuto pose-file mapping, Supabase client usage.

Read both before touching `src/app/globals.css` or adding any new
screen/component.

## Workflow rules (current phase)

- One screen = one task. Do not build multiple screens in parallel.
- Do not design or invent new screens — implement only approved designs
  ("Base44"). Ask if a design is unclear or missing rather than guessing.
- Foundation (tokens, reusable components, routing, Supabase wiring) is
  complete; screens are built one at a time, gated on review after each.
- Every screen must support Desktop / Tablet / Mobile and be production
  quality — no MVP/temporary screens.
- No Google/Apple OAuth — Supabase Email Authentication only, per approved
  Authentication V1 scope.

## Structure

- `src/app/` — Next.js App Router routes. Route groups `(auth)` and
  `(onboarding)` are organizational only (no URL segment): `/login`,
  `/signup`, `/forgot-password`, `/reset-password`, `/welcome`, `/name`,
  `/level`, `/goal`, `/daily-time`, `/interests`, `/ready`, `/ai-plan`,
  `/dashboard`.
- `src/components/ui/` — reusable primitives (`Button`, `Card`, `Input`,
  `Checkbox`, `ProgressDots`).
- `src/components/layout/` — page composition (`SplitScreen`,
  `OnboardingLayout` + `OnboardingNav` — bottom step-dots + Back/Continue
  nav for the onboarding wizard).
- `src/components/mascot/` — Tuto (`Tuto`, `FloatingBadge`, `MascotHero`).
- `src/lib/supabase/` — `client.ts` (browser), `server.ts` (Server
  Components), `proxy.ts` (session refresh, wired from `src/proxy.ts`; note
  Next.js 16 renamed `middleware.ts` → `proxy.ts`).
- `src/lib/motion/variants.ts` — shared Framer Motion variants.
- `src/hooks/useMediaQuery.ts` — `useSyncExternalStore`-based responsive hook.
- `src/types/supabase.ts` — hand-written `Database` types (regenerate via
  `npx supabase gen types typescript --project-id <ref>` once CLI-linked).
- `content/legacy-podcast-lessons/` — preserved V1 podcast lesson content
  (data only, not yet wired into the new app).
- `supabase-schema.sql`, `supabase/remote-lessons.sql` — DB schema + remote
  lesson CMS.

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public by
  design (Next.js convention), safe in Client Components.
- `GEMINI_API_KEY` — server-only secret, no `NEXT_PUBLIC_` prefix; never read
  it from a Client Component.
- `.env` is gitignored and must never be committed.
