/**
 * Meridian · Orb CTA
 * ---------------------------------------------------------------
 * The primary action of a scene — a pill carrying a small living
 * orb. One `primary` per view; `quiet` for secondary paths.
 */

/**
 * @param {{
 *   label?: string,
 *   variant?: 'primary' | 'quiet',
 *   size?: 'md' | 'lg',
 *   disabled?: boolean,
 *   onClick?: (event: MouseEvent) => void,
 * }} [options]
 * @returns {{ el: HTMLButtonElement, setLoading: (on: boolean) => void,
 *            setDisabled: (on: boolean) => void, setLabel: (t: string) => void }}
 */
export function createOrbCta({
  label = 'Continue',
  variant = 'primary',
  size = 'md',
  disabled = false,
  onClick,
} = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'la-orb-cta';
  if (variant === 'quiet') btn.classList.add('la-orb-cta--quiet');
  if (size === 'lg') btn.classList.add('la-orb-cta--lg');
  btn.disabled = disabled;
  btn.innerHTML =
    '<span class="la-orb-cta__orb" aria-hidden="true"></span>' +
    '<span class="la-orb-cta__label"></span>';

  const labelEl = btn.querySelector('.la-orb-cta__label');
  labelEl.textContent = label;

  if (onClick) {
    btn.addEventListener('click', (e) => {
      if (btn.getAttribute('aria-busy') === 'true') return;
      onClick(e);
    });
  }

  return {
    el: btn,
    setLoading(on) {
      if (on) btn.setAttribute('aria-busy', 'true');
      else btn.removeAttribute('aria-busy');
    },
    setDisabled(on) { btn.disabled = on; },
    setLabel(t) { labelEl.textContent = t; },
  };
}
