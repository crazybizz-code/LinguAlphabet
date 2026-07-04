# LinguAlphabet Design Constitution (MANDATORY)

LinguAlphabet follows Apple's Human Interface Guidelines philosophy — NOT Material
Design, NOT a generic SaaS dashboard, NOT Bootstrap, NOT Duolingo, NOT Notion.

Study the *philosophy* of Apple Health, Fitness, Journal, Podcasts, Music, Wallet,
and Settings. Never copy their layouts directly — LinguAlphabet keeps its own
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
| Primary | `#FF6B4A` |
| Background | `#FFFDFB` |
| Surface (cards) | `#FFFFFF` |
| Primary text | `#111111` |
| Secondary text | `#6B7280` |
| Border | `rgba(0,0,0,0.05)` |
| Success | `#34C759` |
| Warning | `#FF9500` |
| Error | `#FF3B30` |

Avoid saturated colors; accent is a soft orange gradient, never harsh.

> Note: current `src/style.css` tokens (`--primary: #FF6B35`, `--bg: #FAFAF8`,
> radius scale `6–36px`) predate this constitution and need reconciling —
> confirm before repainting the whole token set.

## Border Radius

Cards `24px` · Buttons `20px` · Inputs `20px` · Dialogs `28px` · Sheets `32px`.
Everything should feel soft.

## Shadows

Very soft, used sparingly. Example: `0 8px 30px rgba(0,0,0,.08)`. No heavy shadows.

## Glassmorphism

Use only where it feels premium (e.g. frosted nav/sheets). Never overuse blur,
never flashy.

## Typography

Font: Inter. Comfortable line height, minimal, readable.

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

Heroicons, chosen to resemble SF Symbols. Simple, never decorative.

## Animation

Duration `250–350ms`. Natural easing only (no linear, no bounce-everywhere).
Use: fade, slide, scale, spring, blur. Screen transitions must feel like iOS —
smooth, elegant, never sudden.

## Tuto (the mascot)

Tuto is NOT a chatbot — Tuto is the face of the company and the emotional
connection to the product. Every onboarding screen should feel like a
conversation with Tuto, never like filling out a form.

## Onboarding Flow

One screen, one action, never ask multiple things at once:

```
Welcome → Name → Level → Confidence → Assessment → Analysis → Learning Plan → Dashboard
```

## Assessment

Must never feel like an exam — feels like a conversation. Progress indicator is
subtle. Never show percentages. Never scare the user.

## Dashboard

Peaceful, not crowded, large cards. "Today's Mission" is the hero section,
"Recommended Podcast" comes second, progress appears naturally (not as a wall of
stats).

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
