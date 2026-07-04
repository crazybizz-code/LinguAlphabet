/**
 * LinguAlphabet Design System v1 — "Meridian"
 * ---------------------------------------------------------------
 * Import this module once; it loads tokens, base behavior and all
 * component styles, and re-exports every component factory.
 *
 *   import { createCefrGrid, createTutoHero } from './design-system/index.js';
 */

import './tokens.css';
import './base.css';
import './components/section-heading.css';
import './components/orb-cta.css';
import './components/bubble.css';
import './components/tuto-hero.css';
import './components/cefr-card.css';
import './components/canvas.css';

export { CEFR_LEVELS, createCefrCard, createCefrGrid } from './js/cefr-card.js';
export { createBubble } from './js/bubble.js';
export { createTutoHero } from './js/tuto-hero.js';
export { createOrbCta } from './js/orb-cta.js';
export { createSectionHeading } from './js/section-heading.js';
export { createCanvas } from './js/canvas.js';
