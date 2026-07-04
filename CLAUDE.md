# LinguAlphabet

AI-powered English coaching platform. Vanilla JS + Vite (no framework), Capacitor
for Android, Supabase for backend/auth, Google Gemini for AI Coach ("Tuto").

## Design system — mandatory reading before any UI work

Every screen must follow `docs/design-system.md` (Apple HIG-inspired, premium,
calm — not Material Design, not a generic SaaS dashboard). Read it before
touching `index.html`, `src/style.css`, or adding any new screen/component.

## Structure

- `index.html` — single-page shell, all views (`#view-home`, `#view-explore`,
  `#view-library`, `#view-inbox`, `#view-profile`) plus auth screens
- `src/main.js` — view rendering, navigation, onboarding/assessment flow
- `src/db.js` — Supabase REST client (hand-written, no SDK) + IndexedDB + localStorage `UserState`
- `src/data.js` + `src/generated/*.js` — bundled podcast lessons (18 total: 5 hand-authored, 13 imported via `scripts/import-new-bbc-lessons.mjs`)
- `src/ai.js` — Gemini client for Tuto
- `src/agents.js` — internal agent/orchestration log
- `supabase-schema.sql`, `supabase/remote-lessons.sql` — DB schema + remote lesson CMS
