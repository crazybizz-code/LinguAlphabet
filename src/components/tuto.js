// ============================================================
// components/tuto.js — Tuto, the official 3D mascot
//
// Renders the official LinguAlphabet-Tuto-Assets renders exactly as
// provided (public/assets/mascot/). Per the asset package's own
// implementation-guide.md: never recreate, redraw, or vectorize Tuto —
// only import the official PNG renders.
//
// Poses (manifest.json / usage.md — strict one-to-one per phase):
//   wave           -> 01-authentication, 02-tuto-welcome
//   thinking       -> 03-display-name
//   listening      -> 04-level-selection
//   happy          -> 05-confidence-message
//   pointing       -> 06-learning-goal
//   holding-clock  -> 07-daily-time
//   typing-laptop  -> 08-ai-learning-plan
//   celebrating    -> 09-personalized-learning-plan
// ============================================================

const MASCOT_BASE_PATH = '/assets/mascot/';

const VALID_POSES = [
  'wave',
  'thinking',
  'listening',
  'happy',
  'pointing',
  'holding-clock',
  'typing-laptop',
  'celebrating'
];

// size: pixel size of the (square) container the image is contained
// within — the source renders are not uniformly square, so `object-fit:
// contain` in components.css letterboxes them safely regardless of the
// asset's real aspect ratio. glow: soft ambient halo behind Tuto, per
// color-system.md's brand_glow token (used for hero moments).
export function Tuto({ pose = 'wave', size = 160, glow = false, altText = 'Tuto, the AI English Coach' } = {}) {
  if (!VALID_POSES.includes(pose)) {
    throw new Error(`Tuto: unknown pose "${pose}" (expected one of ${VALID_POSES.join(', ')})`);
  }

  const wrap = document.createElement('div');
  wrap.className = 'ds-tuto';
  wrap.style.setProperty('--ds-tuto-size', `${size}px`);

  if (glow) {
    const glowEl = document.createElement('div');
    glowEl.className = 'ds-tuto-glow';
    wrap.appendChild(glowEl);
  }

  const shadow = document.createElement('div');
  shadow.className = 'ds-tuto-shadow';
  wrap.appendChild(shadow);

  const img = document.createElement('img');
  img.className = 'ds-tuto-avatar';
  img.src = `${MASCOT_BASE_PATH}${pose}.png`;
  img.alt = altText;
  img.loading = 'eager';
  img.decoding = 'async';
  wrap.appendChild(img);

  return wrap;
}
