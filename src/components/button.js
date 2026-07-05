// ============================================================
// components/button.js — shared Button primitive
// See styles/components.css for the visual language (.ds-btn*).
// ============================================================

const VARIANTS = ['primary', 'secondary', 'ghost'];

const ARROW_SVG = `<svg class="ds-btn__arrow" viewBox="0 0 20 20" width="18" height="18" fill="none"><path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// arrow: appends the trailing "→" icon used by every primary CTA in the
// handoff ("Continue →", "Sign In →", etc.).
export function Button({ label, variant = 'primary', block = false, disabled = false, arrow = false, onClick } = {}) {
  if (!VARIANTS.includes(variant)) {
    throw new Error(`Button: unknown variant "${variant}" (expected one of ${VARIANTS.join(', ')})`);
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `ds-btn ds-btn--${variant}${block ? ' ds-btn--block' : ''}`;
  btn.disabled = disabled;

  const labelEl = document.createElement('span');
  labelEl.className = 'ds-btn__label';
  labelEl.textContent = label;
  btn.appendChild(labelEl);

  if (arrow) {
    btn.insertAdjacentHTML('beforeend', ARROW_SVG);
  }

  if (onClick) btn.addEventListener('click', onClick);
  return btn;
}

// Toggles the button into/out of its loading state: label hides, a
// spinner takes its place, and the button is disabled for the duration
// (interaction.md: "Button text fades, white circular spinner rotates").
export function setButtonLoading(btn, isLoading) {
  btn.disabled = isLoading;
  btn.classList.toggle('is-loading', isLoading);

  if (isLoading && !btn.querySelector('.ds-btn__spinner')) {
    const spinner = document.createElement('span');
    spinner.className = 'ds-btn__spinner';
    btn.appendChild(spinner);
  } else if (!isLoading) {
    btn.querySelector('.ds-btn__spinner')?.remove();
  }
}
