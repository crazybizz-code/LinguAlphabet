// ============================================================
// components/button.js — shared Button primitive
// See styles/components.css for the visual language (.ds-btn*).
// ============================================================

const VARIANTS = ['primary', 'secondary', 'ghost'];

export function Button({ label, variant = 'primary', block = false, disabled = false, onClick } = {}) {
  if (!VARIANTS.includes(variant)) {
    throw new Error(`Button: unknown variant "${variant}" (expected one of ${VARIANTS.join(', ')})`);
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `ds-btn ds-btn--${variant}${block ? ' ds-btn--block' : ''}`;
  btn.textContent = label;
  btn.disabled = disabled;
  if (onClick) btn.addEventListener('click', onClick);
  return btn;
}
