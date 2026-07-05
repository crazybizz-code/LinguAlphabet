// ============================================================
// components/mascotHero.js — Tuto + floating micro-learning badges
//
// Shared across every onboarding phase that stages Tuto as a hero
// visual with surrounding badges (01-authentication, 02-tuto-welcome,
// and per components.md's <MascotHero> node, likely more) — extracted
// so the badge icon set/positions/stacking fix live in one place
// instead of being copy-pasted per screen.
// ============================================================

import { Tuto } from './tuto.js';

const HEADPHONE_ICON = `<svg viewBox="0 0 20 20" width="18" height="18" fill="none"><path d="M3 11v-1a7 7 0 0 1 14 0v1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><rect x="2" y="11" width="4" height="5.5" rx="1.6" stroke="currentColor" stroke-width="1.6"/><rect x="14" y="11" width="4" height="5.5" rx="1.6" stroke="currentColor" stroke-width="1.6"/></svg>`;
const BOOK_ICON = `<svg viewBox="0 0 20 20" width="18" height="18" fill="none"><path d="M10 5.2C8.8 4.3 7 3.8 5 3.8c-.9 0-1.6.08-2 .16v10.5c.4-.08 1.1-.16 2-.16 2 0 3.8.5 5 1.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 5.2c1.2-.9 3-1.4 5-1.4.9 0 1.6.08 2 .16v10.5c-.4-.08-1.1-.16-2-.16-2 0-3.8.5-5 1.4V5.2z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const MIC_ICON = `<svg viewBox="0 0 20 20" width="18" height="18" fill="none"><rect x="7" y="2.5" width="6" height="9.5" rx="3" stroke="currentColor" stroke-width="1.6"/><path d="M4.5 10.5a5.5 5.5 0 0 0 11 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M10 16v1.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

// Positions tuned against the reference composition: badges sit close
// against the mascot's silhouette without overlapping its opaque
// pixels (see .ds-mascot-badge's z-index for why overlap is otherwise
// unsafe — .ds-tuto-avatar has its own z-index that would otherwise
// paint over a badge wherever their boxes intersect).
const DEFAULT_BADGES = [
  { content: 'Aa', position: 'top: 14%; left: 10%;' },
  { content: HEADPHONE_ICON, position: 'top: 36%; right: 8%;' },
  { content: BOOK_ICON, position: 'top: 54%; right: 6%;' },
  { content: MIC_ICON, position: 'bottom: 22%; right: 4%;' }
];

function FloatingBadge(content, position) {
  const el = document.createElement('div');
  el.className = 'ds-mascot-badge';
  el.style.cssText = position;
  el.innerHTML = content;
  return el;
}

// pose/size/glow/altText pass straight through to Tuto(). badges lets a
// screen override the default 4-badge set; pass [] to render Tuto alone.
export function MascotHero({ pose = 'wave', size = 375, glow = true, altText, badges = DEFAULT_BADGES, className = '' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = `ds-mascot-hero ${className}`.trim();
  const tuto = Tuto({ pose, size, glow, altText });
  wrap.append(tuto, ...badges.map(b => FloatingBadge(b.content, b.position)));
  return wrap;
}
