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

// The official asset package's own filenames don't match their content
// for 3 of the 8 poses (found while building Phase 03: `thinking.png`
// is a cheering/confetti pose, `celebrating.png` is a hand-on-chin
// thinking pose; `happy.png` holds a clock, `holding-clock.png` is the
// big-smile happy pose; `pointing.png` is sitting at a laptop,
// `typing-laptop.png` is a pointing gesture). This maps the *semantic*
// pose every screen asks for to the file that actually shows it,
// without renaming or modifying the underlying package files. `wave`
// and `listening` are visually similar (both a raised open hand) and
// ambiguous which is "more correct" — left unmapped since `wave` is
// already shipped and approved in Phases 01-02.
const POSE_FILE = {
  wave: 'wave',
  listening: 'listening',
  thinking: 'celebrating',
  celebrating: 'thinking',
  happy: 'holding-clock',
  'holding-clock': 'happy',
  pointing: 'typing-laptop',
  'typing-laptop': 'pointing'
};

const VALID_POSES = Object.keys(POSE_FILE);

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
  img.src = `${MASCOT_BASE_PATH}${POSE_FILE[pose]}.png`;
  img.alt = altText;
  img.loading = 'eager';
  img.decoding = 'async';
  wrap.appendChild(img);

  return wrap;
}
