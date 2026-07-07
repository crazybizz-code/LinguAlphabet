# Coding Standards — Next.js Rebuild

Applies to everything under `src/` in the current (V2) architecture: Next.js 16
(App Router, Turbopack), React 19, TypeScript, Tailwind CSS v4, Supabase,
Framer Motion. `docs/design-system.md` is the visual philosophy; this doc is
the code-level convention that implements it.

## Stack

- Next.js 16 App Router. Route groups `(auth)` and `(onboarding)` organize
  files only — they never appear in the URL.
- Next.js 16 renamed `middleware.ts` to `proxy.ts` (exported function must be
  named `proxy`, not `middleware`). Don't reintroduce a `middleware.ts`.
- TypeScript strict mode. `tsconfig.json`'s `include` covers every `.ts`/`.tsx`
  file in the project, so `next build`'s type-check runs against unimported
  files too — an unused placeholder still has to type-check.
- Tailwind v4 config lives in `src/app/globals.css` via `@theme` (CSS-based),
  not `tailwind.config.js`.

## Folder layout

```
src/
  app/                  routes (App Router) — (auth), (onboarding), dashboard
  components/
    ui/                 generic, reusable primitives (Button, Card, Input, …)
    layout/             page-composition components (SplitScreen, headers)
    mascot/             Tuto-specific components
  lib/
    supabase/           client.ts, server.ts, proxy.ts
    motion/             Framer Motion shared variants
    utils.ts            cn() and other cross-cutting helpers
  hooks/                shared React hooks
  types/                hand-written Supabase Database types
```

## Tailwind v4 `@theme` namespacing — read before adding any token

Tailwind v4 derives utility classes from `@theme` variable *prefixes*. Adding a
custom key under a given prefix extends (or, for default-named keys,
overrides) the utilities in that family:

| Prefix | Utilities generated | Safe to add named keys? |
|---|---|---|
| `--color-*` | `bg-*`, `text-*`, `border-*`, … | Yes |
| `--radius-*` | `rounded-*` | Yes (xs/sm/md/lg/xl/2xl/full are default Tailwind keys — safe to override) |
| `--shadow-*` | `shadow-*` | Yes (same reasoning) |
| `--text-*` (+ `--text-*--line-height`, `--text-*--letter-spacing`) | font-size utilities | Yes |
| `--font-weight-*` | `font-*` | Yes |
| `--ease-*` | `ease-*` (transition-timing-function) | Yes |
| `--animate-*` (+ a real `@keyframes` block, declared *outside* `@theme`) | `animate-*` | Yes |
| `--breakpoint-*` | responsive variants (`md:`, `lg:`, `xl:`) and container-query sizes | Yes |
| `--spacing-*` | **also** backs `max-w-*`, `w-*`, `h-*`, `min-w-*`, `min-h-*`, `inset-*`, `top/left/right/bottom-*` | **No — do not add letter-named keys (xs/sm/md/lg/xl/2xl/3xl) here** |

**The `--spacing-*` trap (already hit once, don't repeat it):** an earlier
version of `globals.css` defined `--spacing-xs` through `--spacing-3xl` to
express the 8pt grid. Because Tailwind resolves `max-w-md`/`w-md`/etc. against
the *same* `--spacing-*` namespace, this silently redefined `max-w-md` to
`16px` instead of Tailwind's default `~448px` — a `Card` component collapsed
to near-zero width and wrapped text one word per line. The fix: don't add
named `--spacing-*` keys at all. The approved 8pt-grid values are exact
multiples of Tailwind's default 4px base spacing unit, so use the native
**numeric** spacing scale instead:

| Semantic name | px | Tailwind utility (e.g. `gap-`, `p-`) |
|---|---|---|
| xs | 4px | `-1` |
| sm | 8px | `-2` |
| md | 16px | `-4` |
| lg | 24px | `-6` |
| xl | 36px | `-9` |
| 2xl | 48px | `-12` |
| 3xl | 64px | `-16` |

Use these numeric utilities directly (`gap-4`, `p-9`, `px-6`, …) everywhere
spacing is needed. Never reintroduce letter-named `--spacing-*` theme keys.

## Breakpoints — desktop-first

Base (unprefixed) styles target the 1440px desktop canvas. Narrower tiers
override via Tailwind's `max-*:` variants, not the default `min-width`
mobile-first convention:

- Desktop `1440px+` — base, no variant
- Laptop `1024–1439px` — `max-xl:`
- Tablet `768–1023px` — `max-lg:`
- Mobile `<768px` — `max-md:`

This is implemented by setting `--breakpoint-md: 768px`, `--breakpoint-lg:
1024px`, `--breakpoint-xl: 1440px` in `@theme`. Always write the desktop rule
first, then layer `max-lg:`/`max-md:` overrides — don't write `md:`/`lg:`
(min-width) variants, they invert the intended cascade.

## Components

- Every `ui/` primitive is a small, prop-driven wrapper (variant/size/shadow
  props), not a one-off per screen. Screens compose primitives; they don't
  restyle them.
- Interactive primitives (`Button`, `Input`, `Checkbox`) are `forwardRef` +
  `"use client"` since they take refs and/or use hooks.
- Use `cn()` (`src/lib/utils.ts`, clsx + tailwind-merge) for all conditional
  class composition — never string-concatenate class names.
- Prefer semantic Tailwind arbitrary values (`border-[1.5px]`, `z-[2]`) over
  forcing a value into a scale that doesn't have it (Tailwind's `border-*` and
  `z-*` scales only have fixed steps — don't invent `border-1.5` or `z-1`,
  they silently fail to generate any CSS).
- `useSyncExternalStore`, not `useState` + `useEffect`, for subscribing to
  external browser state (see `hooks/useMediaQuery.ts`). The
  `useState`+`useEffect` version trips the `react-hooks/set-state-in-effect`
  lint rule because it calls `setState` synchronously inside the effect body.
- Empty interface extension (`interface X extends Omit<Y, "z"> {}`) trips
  `@typescript-eslint/no-empty-object-type` — use a type alias instead
  (`type X = Omit<Y, "z">;`).

## Tuto mascot pose files

Three of the eight official pose PNGs are content-swapped pairs in the asset
export: `thinking.png` ↔ `celebrating.png`, `happy.png` ↔ `holding-clock.png`,
`pointing.png` ↔ `typing-laptop.png`. `Tuto.tsx`'s `POSE_FILE` map corrects
this — don't "fix" it back to a literal name-to-file match, the literal
match is wrong. `wave` and `listening` are intentionally left unmapped
(ambiguous asset, and `wave` already shipped/approved).

## ProgressDots variants

`ProgressDots` supports two visually distinct variants because the approved
reference designs disagree across phases — neither is a stylistic choice to
consolidate:

- `highlight-next`: bracket-arc current-step badge + one solid "next" dot +
  hollow rest. No checkmarks.
- `checklist`: a checkmark badge per completed step + a plain current-step
  badge (no brackets) + hollow dots for the rest. Connector dots appear
  *between* checkmarks too, not just after the current badge.

## Supabase

- `lib/supabase/client.ts` — browser client (`createBrowserClient`), used in
  Client Components.
- `lib/supabase/server.ts` — server client (`createServerClient`) via
  `await cookies()`; the `cookieStore.set` call is wrapped in try/catch
  because Server Components can't set cookies — this is expected and handled
  by the proxy's session refresh, not an error to fix.
- `lib/supabase/proxy.ts` — `updateSession()`, called from `src/proxy.ts`.
  Uses `supabase.auth.getUser()`, not `getSession()`, since only `getUser()`
  revalidates against the server.
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are public by
  design (Next.js `NEXT_PUBLIC_` convention). `GEMINI_API_KEY` has no
  `NEXT_PUBLIC_` prefix — it's a server-only secret and must never be read
  from a Client Component.

## Verification checklist before considering any foundation change done

1. `npm run build` — must compile and type-check cleanly.
2. `npm run lint` — zero errors/warnings.
3. Visual check in the browser — compiling is not sufficient. The spacing bug
   above only surfaced by rendering components together and inspecting layout,
   not from a clean build/lint pass.
