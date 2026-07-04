/**
 * Meridian · Tuto Hero
 * ---------------------------------------------------------------
 * Tuto's presence: the living orb plus a greeting block.
 * State is driven from outside (the scene's state machine calls
 * `setState`); the component only translates state into light.
 */

/** @typedef {'idle'|'listening'|'thinking'|'speaking'|'celebrating'} TutoState */

/**
 * @param {{
 *   eyebrow?: string,
 *   title?: string,
 *   sub?: string,
 *   state?: TutoState,
 * }} [options]
 * @returns {{ el: HTMLElement, setState: (s: TutoState) => void,
 *            setTitle: (t: string) => void, setSub: (t: string) => void }}
 */
export function createTutoHero({
  eyebrow = 'Tuto · your English coach',
  title = '',
  sub = '',
  state = 'idle',
} = {}) {
  const root = document.createElement('section');
  root.className = 'la-tuto-hero';
  root.dataset.state = state;
  root.innerHTML = `
    <div class="la-tuto-hero__grid">
      <div class="la-tuto-hero__stage" aria-hidden="true">
        <span class="la-tuto-hero__halo"></span>
        <span class="la-tuto-hero__orb"></span>
      </div>
      <div class="la-tuto-hero__copy">
        <span class="la-tuto-hero__eyebrow"></span>
        <h1 class="la-tuto-hero__title"></h1>
        <p class="la-tuto-hero__sub"></p>
      </div>
    </div>`;

  const eyebrowEl = root.querySelector('.la-tuto-hero__eyebrow');
  const titleEl = root.querySelector('.la-tuto-hero__title');
  const subEl = root.querySelector('.la-tuto-hero__sub');
  eyebrowEl.textContent = eyebrow;
  titleEl.textContent = title;
  subEl.textContent = sub;

  return {
    el: root,
    setState(s) { root.dataset.state = s; },
    setTitle(t) { titleEl.textContent = t; },
    setSub(t) { subEl.textContent = t; },
  };
}
