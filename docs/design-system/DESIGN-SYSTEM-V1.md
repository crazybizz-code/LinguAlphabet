# LinguAlphabet Design System v1 — "Meridian"

**Status:** v1 · visual source of truth for everything the learner sees.
All previous UI exploration is archived. Architecture, state machine,
callbacks, business logic and responsiveness carry over; visuals do not.

---

## 1. Design idea

LinguAlphabet is not a form-filling app — it is a *coaching session*.
Meridian therefore treats every scene as a **stage**: a deep, calm canvas
lit by two aurora light sources, on which glass instruments (cards,
bubbles, controls) are placed. Tuto is present as a **living orb of
light**; that same light reappears at smaller scales across the system
(inside the CTA, as the presence dot on coach bubbles), so the whole
interface reads as one organism.

This is a deliberate single-theme world (deep canvas), like a focused
learning environment — not a document that inverts with the OS theme.

## 2. Foundations

All tokens live in `src/design-system/tokens.css`. Components never
hard-code a value that exists as a token.

### Color

| Token | Value | Role |
|---|---|---|
| `--la-canvas-0/1/2` | `#070B18 / #0B1124 / #0E1530` | stage depths |
| `--la-surface-1/2/3` | white @ 4 / 7 / 11 % | glass surfaces |
| `--la-ink-hi/mid/low` | `#F2F5FF / #A9B3D6 / #67729B` | text ramp |
| `--la-iris` | `#7C5CFF` | brand primary — Tuto's core |
| `--la-cyan` | `#36D6CE` | live/interactive, focus ring |
| `--la-coral` | `#FF7E6B` | warmth, celebration |
| `--la-aurora` | iris → blue → cyan 135° | primary gradient |
| `--la-success/warning/danger` | `#3DDC97 / #FFC24D / #FF6B7A` | semantic |

### CEFR spectrum — *sunrise to open sky*

One journey, six identities. Warm hues for early levels (effort, warmth,
first light), cooling toward open sky as mastery deepens.

| Level | Token | Hue | Identity | Glyph |
|---|---|---|---|---|
| A1 | `--la-cefr-a1` `#FFB74A` | amber | **Spark** — every word is a door opening | four-point spark |
| A2 | `--la-cefr-a2` `#FF8A66` | coral | **Ember** — everyday moments make sense | flame |
| B1 | `--la-cefr-b1` `#F06FB7` | rose | **Bloom** — conversations begin to flow | sprouting leaves |
| B2 | `--la-cefr-b2` `#9D7BFF` | violet | **Momentum** — thinking on your feet | compass |
| C1 | `--la-cefr-c1` `#5D8DFF` | blue | **Constellation** — nuance becomes natural | linked stars |
| C2 | `--la-cefr-c2` `#38D6CE` | teal | **Summit** — the language feels like home | peak with flag |

### Typography

- **Display:** `Sora` (self-host in product build) → Avenir Next → Segoe UI → system.
  Rounded-geometric; echoes the orb's softness. Weights 600–700 only.
- **Body:** `Inter` → SF Pro Text → Segoe UI → system. Weight 400/600.
- Scale: 12 / 14 / 16 / 18 / 22 / 28 / 38 / 52. Caps labels track `0.14em`.
- Reading measure: `--la-col-reading: 62ch`.

### Space, shape, elevation, motion

- 4 px spatial scale (`--la-space-1…9`).
- Radii 10 / 16 / 22 / 30 / full. Bubbles use a 6 px "speaker corner."
- Elevation = shadow **plus light**: interactive brand elements glow
  (`--la-glow-iris`, `--la-glow-cyan`); accent glows are mixed from the
  element's own accent.
- Signature ease `cubic-bezier(0.22, 1, 0.36, 1)`; durations 120/240/460 ms.
- **Reduced motion is a first-class mode:** all animation collapses to
  instant state changes; states stay legible through color and glow
  (see `base.css`, plus per-component static substitutes).

### Focus

One focus voice everywhere: 2 px canvas gap + 2.5 px signal-cyan ring
(`--la-focus-ring`). Never suppressed, never re-colored per component.

## 3. Responsiveness model

Desktop-first, **container-query driven**. Components respond to the
width of their *container*, not the viewport — that is what makes each
one reusable across Discovery Session, Adaptive Assessment, Learning
Brain and Dashboard without scene-specific overrides. The Conversation
Canvas declares `container-type: inline-size`; drop any Meridian
component inside and it adapts. Desktop is the primary composition
(e.g. the CEFR grid is designed as 3×2 with vertical cards; it becomes
2-up on tablet and single-column rows on mobile — never a stretched
mobile card on desktop).

## 4. Components

| Component | Files | Reused in |
|---|---|---|
| Conversation Canvas | `components/canvas.css`, `js/canvas.js` | all four contexts (density: `focus` / `default` / `wide`) |
| Section Heading | `components/section-heading.css`, `js/section-heading.js` | all four |
| Tuto Hero | `components/tuto-hero.css`, `js/tuto-hero.js` | Discovery, Assessment, Dashboard greeting |
| Conversation Bubble | `components/bubble.css`, `js/bubble.js` | Discovery, Assessment, Learning Brain explanations |
| Orb CTA | `components/orb-cta.css`, `js/orb-cta.js` | all four |
| CEFR Choice Card | `components/cefr-card.css`, `js/cefr-card.js` | Discovery, Assessment, Learning Brain (level display), Dashboard (goal) |

### API contracts (state machine ↔ design system)

Factories are pure view: they render, expose setters, and report intent
through callbacks. Scene logic stays in the existing state machine.

- `createCefrGrid({ value, disabledLevels, onSelect })` — accessible
  radiogroup; roving tabindex; Arrow/Home/End/Space/Enter; states:
  default · hover · selected (`aria-checked`) · disabled
  (`aria-disabled`) · `:focus-visible` · reduced-motion.
- `createBubble({ speaker, text, typing, streaming })` +
  `setText / setStreaming` — for live coach turns.
- `createTutoHero({ title, sub, state })` + `setState('idle'|'listening'|
  'thinking'|'speaking'|'celebrating')` — the scene's state machine
  drives the orb; the component only translates state into light.
- `createOrbCta({ label, variant, size, onClick })` + `setLoading`.
- `createSectionHeading({ eyebrow, title, lede, align, meta })`.
- `createCanvas({ density, scroll })` → `header / stage / dock` slots.

### Demo/testing hook

`.is-hover` mirrors `:hover` on interactive components so review boards
and visual regression tests can pin the hover state without a pointer.

## 5. Review board

`docs/design-system/review-board.html` — self-contained page showing
every component at Desktop (1440), Laptop (1152), Tablet (834) and
Mobile (390) container widths, plus the full CEFR state matrix and
foundation swatches. Regenerate with
`node scripts/build-review-board.mjs` after editing any component CSS.
