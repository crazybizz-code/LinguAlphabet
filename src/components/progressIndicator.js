// ============================================================
// components/progressIndicator.js — subtle step progress
//
// Per docs/design-system.md: assessment/onboarding progress must
// never show a percentage. This renders a row of dots instead.
// ============================================================

export function ProgressDots({ total, current = 0 } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'ds-progress-dots';
  wrap.setAttribute('role', 'progressbar');
  wrap.setAttribute('aria-valuemin', '0');
  wrap.setAttribute('aria-valuemax', String(total - 1));
  wrap.setAttribute('aria-valuenow', String(current));

  for (let i = 0; i < total; i++) {
    const dot = document.createElement('span');
    dot.className = 'ds-progress-dot';
    wrap.appendChild(dot);
  }

  updateProgressDots(wrap, current);
  return wrap;
}

export function updateProgressDots(el, current) {
  el.setAttribute('aria-valuenow', String(current));
  Array.from(el.children).forEach((dot, i) => {
    dot.classList.toggle('is-active', i === current);
    dot.classList.toggle('is-complete', i < current);
  });
}
