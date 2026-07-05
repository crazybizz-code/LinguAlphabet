// ============================================================
// components/tuto.js — Tuto, the mascot/emotional center of the app
//
// Per docs/design-system.md: "Tuto is NOT a chatbot — Tuto is the
// face of the company." One shared definition of the character
// instead of copy-pasted SVG markup per screen (as V1 had).
// ============================================================

const TUTO_SVG = `
<svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
  <!-- Floor Shadow -->
  <ellipse cx="200" cy="360" rx="80" ry="12" fill="rgba(0,0,0,0.08)"/>
  <!-- Shell -->
  <ellipse cx="200" cy="238" rx="95" ry="78" fill="#d4865a"/>
  <!-- Body / Head -->
  <ellipse cx="200" cy="172" rx="56" ry="62" fill="#7a9e82" class="ds-tuto-body"/>
  <!-- Eyes -->
  <circle cx="181" cy="163" r="13" fill="white"/>
  <circle cx="219" cy="163" r="13" fill="white"/>
  <circle cx="184" cy="166" r="8" fill="#2c3e50"/>
  <circle cx="222" cy="166" r="8" fill="#2c3e50"/>
  <!-- Smile -->
  <path d="M188,184 Q200,196 212,184" fill="none" stroke="#6b4226" stroke-width="3" stroke-linecap="round"/>
  <!-- Headphones -->
  <path d="M152,152 Q152,108 200,108 Q248,108 248,152" fill="none" stroke="#FF6B35" stroke-width="9" stroke-linecap="round"/>
  <rect x="143" y="147" width="20" height="28" rx="9" fill="#FF6B35"/>
  <rect x="237" y="147" width="20" height="28" rx="9" fill="#FF6B35"/>
</svg>`;

// size: pixel size of the avatar itself. glow: adds the soft radial
// halo behind it (used for hero moments, e.g. onboarding welcome).
export function Tuto({ size = 160, glow = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'ds-tuto';
  wrap.style.setProperty('--ds-tuto-size', `${size}px`);

  if (glow) {
    const glowEl = document.createElement('div');
    glowEl.className = 'ds-tuto-glow';
    wrap.appendChild(glowEl);
  }

  const avatar = document.createElement('div');
  avatar.className = 'ds-tuto-avatar';
  avatar.innerHTML = TUTO_SVG;
  wrap.appendChild(avatar);

  return wrap;
}
