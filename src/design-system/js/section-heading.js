/**
 * Meridian · Section Heading
 * ---------------------------------------------------------------
 * Eyebrow · Title · Lede · optional meta slot. The voice of every
 * scene; alignment adapts to context (left for dashboards, center
 * for conversational moments).
 */

/**
 * @param {{
 *   eyebrow?: string,
 *   title: string,
 *   lede?: string,
 *   align?: 'left' | 'center',
 *   level?: 1 | 2 | 3,             // heading element level
 *   meta?: string | HTMLElement,   // right-side slot on wide containers
 * }} options
 * @returns {{ el: HTMLElement }}
 */
export function createSectionHeading({
  eyebrow = '',
  title,
  lede = '',
  align = 'left',
  level = 2,
  meta = '',
} = {}) {
  const root = document.createElement('header');
  root.className = 'la-section-heading';
  if (align === 'center') root.classList.add('la-section-heading--center');

  const grid = document.createElement('div');
  grid.className = 'la-section-heading__grid';

  if (eyebrow) {
    const eb = document.createElement('span');
    eb.className = 'la-section-heading__eyebrow';
    eb.textContent = eyebrow;
    grid.appendChild(eb);
  }

  const h = document.createElement(`h${level}`);
  h.className = 'la-section-heading__title';
  h.textContent = title;
  grid.appendChild(h);

  if (lede) {
    const p = document.createElement('p');
    p.className = 'la-section-heading__lede';
    p.textContent = lede;
    grid.appendChild(p);
  }

  if (meta) {
    const m = document.createElement('div');
    m.className = 'la-section-heading__meta';
    if (meta instanceof HTMLElement) m.appendChild(meta);
    else m.textContent = meta;
    grid.appendChild(m);
  }

  root.appendChild(grid);
  return { el: root };
}
