# LinguABC Design Constitution (MANDATORY)

LinguABC follows Apple's Human Interface Guidelines philosophy — NOT Material
Design, NOT a generic SaaS dashboard, NOT Bootstrap, NOT Duolingo, NOT Notion.

Study the *philosophy* of Apple Health, Fitness, Journal, Podcasts, Music, Wallet,
and Settings. Never copy their layouts directly — LinguABC keeps its own
identity while feeling equally premium.

**First impression test:** the user should think "this feels expensive," never
"this looks like another learning app."

Before finishing any screen, ask:
1. Would Apple ship something that looks like this?
2. Does this screen have too much information?
3. Does this feel premium?
4. Is the spacing generous?
5. Is the animation smooth?
6. Does this screen make the user calm?

If any answer is NO, redesign before continuing.

## Visual Language

Large whitespace, very clean layouts, soft rounded corners, floating cards,
natural (soft) shadows, elegant typography. No visual noise, no clutter, no
unnecessary borders. One screen = one task, never overloaded.

## Colors

| Token | Value |
|---|---|
| Primary | `#FF6B00` |
| Background | `#FFFDFB` |
| Surface (cards) | `#FFFFFF` |
| Muted surface (input fill) | `#F8FAFC` |
| Primary text | `#0F172A` |
| Secondary text | `#64748B` |
| Tertiary text | `#94A3B8` |
| Border | `#E5E7EB` |
| Success | `#34C759` |
| Warning | `#FF9500` |
| Error | `#FF3B30` |

Avoid saturated colors; accent is a soft orange gradient, never harsh. Text/
border/muted-surface values are the exact Base44-verified slate palette — see
`docs/coding-standards.md` for the full token list and rationale.

## Border Radius

Cards `32px` · Buttons `24px` · Inputs `24px` · Icon chips `12px` · Sheets
`32px`. Everything should feel soft.

## Shadows

Very soft, used sparingly. Example: `0 8px 30px rgba(0,0,0,.08)`. No heavy shadows.

## Glassmorphism

Use only where it feels premium (e.g. frosted nav/sheets). Never overuse blur,
never flashy.

## Typography

Inter for body text, Plus Jakarta Sans for headings (both Base44-verified).
Comfortable line height, minimal, readable.

| Level | Size |
|---|---|
| Large Hero | 32–40px |
| Screen Title | 28px |
| Section Title | 22px |
| Body | 16–17px |
| Caption | 13–14px |

## Buttons

Large touch targets, comfortable padding, subtle shadow, scale-down animation on
press. Never aggressive colors.

## Inputs

Minimal, rounded, comfortable, large. No ugly outlines — soft focus ring instead.

## Cards

The foundation of the UI. Floating appearance, large padding, rounded, premium
spacing, never overloaded with content.

## Spacing

8pt grid. Everything should breathe — never crowd components together.

## Icons

`lucide-react` (Base44-verified), chosen to resemble SF Symbols. Simple,
never decorative.

## Animation

Duration `250–350ms`. Natural easing only (no linear, no bounce-everywhere).
Use: fade, slide, scale, spring, blur. Screen transitions must feel like iOS —
smooth, elegant, never sudden.

## Tuto (the mascot)

Tuto is not decoration and not a chatbot — Tuto **is** the AI coach, the
product's emotional center. Whenever possible, the interface should feel like
Tuto is personally guiding the learner, not like a UI that happens to have a
mascot on it. Animations exist to reinforce that Tuto is alive, friendly, and
intelligent (idle float/breathe loops, reacting poses per moment) — never
purely decorative motion. Every onboarding screen should feel like a
conversation with Tuto, never like filling out a form.

## Learning Philosophy

LinguABC is not a traditional language-learning app with lessons to
browse. The learner should never feel like they're navigating a content
library or manually deciding what to study — the **Learning Brain** decides
that for them. The interface's job is to minimize decisions, not multiply
them: every screen should reinforce "I have an intelligent coach," not
"I have a course catalog." See `CLAUDE.md`'s Product Model section for how
this maps to the Knowledge Hub (Podcasts live today; Articles, Videos, News,
Stories, Conversations, Challenges are Coming Soon, never manual-pick UIs).

Emotion over density, always: generous whitespace, large type, one clear
focal point per screen, premium motion. Every onboarding screen should read
like Apple onboarding, never like a registration form.

## Onboarding Flow

One screen, one action, never ask multiple things at once:

```
Welcome → Name → Level → Goal → Daily Time → Interests → Ready → Learning Plan → Dashboard
```

## Dashboard

Peaceful, not crowded, large cards. "Today's Mission" is the hero section,
"Recommended Podcast" comes second, progress appears naturally (not as a wall of
stats). The Learning Brain — not the learner — chooses what fills these cards.

## Responsive

Desktop-first, perfect on mobile, perfect as a PWA. Maintain Apple-quality
spacing at every breakpoint.

## Forbidden

- Material Design patterns
- Bootstrap-style layouts
- Generic admin dashboards
- Sharp corners
- Overloaded screens
- Ugly/harsh gradients
- Copying Duolingo, Notion, or generic SaaS templates
