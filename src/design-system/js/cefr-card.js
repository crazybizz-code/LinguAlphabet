/**
 * Meridian · CEFR Choice Card
 * ---------------------------------------------------------------
 * Six levels, one language. Each level owns a point on the
 * sunrise→open-sky spectrum, a glyph, and an emotional tone line.
 *
 * `createCefrGrid` renders an accessible radiogroup with roving
 * tabindex (arrow keys, Home/End, Space/Enter) and reports every
 * selection through `onSelect(levelId)` — no scene logic inside.
 */

const svg = (paths) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

/** Canonical CEFR level identities. Copy is design-system-owned. */
export const CEFR_LEVELS = [
  {
    id: 'a1',
    code: 'A1 · Spark',
    name: 'Beginner',
    tone: 'Every word you learn is a door opening.',
    glyph: svg('<path d="M12 3v5M12 16v5M3 12h5M16 12h5"/><circle cx="12" cy="12" r="2.2"/>'),
  },
  {
    id: 'a2',
    code: 'A2 · Ember',
    name: 'Elementary',
    tone: 'Everyday moments start to make sense.',
    glyph: svg('<path d="M12 21c3.9 0 6.5-2.5 6.5-6 0-4-3.5-6-4.5-10-2.5 2-3 4.5-3 6.5-1.2-.8-2-2-2.2-3.5C7 9.5 5.5 12 5.5 15c0 3.5 2.6 6 6.5 6Z"/>'),
  },
  {
    id: 'b1',
    code: 'B1 · Bloom',
    name: 'Intermediate',
    tone: 'Conversations begin to flow on their own.',
    glyph: svg('<path d="M12 21v-8"/><path d="M12 13c0-4 2.5-7 6.5-7 0 4-2.5 7-6.5 7Z"/><path d="M12 13c0-3-2-5.5-5.5-5.5 0 3.2 2 5.5 5.5 5.5Z"/>'),
  },
  {
    id: 'b2',
    code: 'B2 · Momentum',
    name: 'Upper Intermediate',
    tone: 'You joke, argue, and think on your feet.',
    glyph: svg('<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>'),
  },
  {
    id: 'c1',
    code: 'C1 · Constellation',
    name: 'Advanced',
    tone: 'Nuance and style become second nature.',
    glyph: svg('<circle cx="6" cy="17" r="1.4"/><circle cx="12" cy="7" r="1.4"/><circle cx="18" cy="13" r="1.4"/><path d="m7.2 15.9 3.7-7M13.3 7.8l3.5 4.2M7.4 16.7l9.2-3.3"/>'),
  },
  {
    id: 'c2',
    code: 'C2 · Summit',
    name: 'Mastery',
    tone: 'The language no longer feels foreign at all.',
    glyph: svg('<path d="M3 19 10 6l3.5 6.5L16 9l5 10H3Z"/><path d="M10 6V3.5M10 3.5h3l-1 1.2 1 1.2h-3"/>'),
  },
];

const CHECK_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

/**
 * Create one CEFR card element.
 * @param {object} level - entry from CEFR_LEVELS
 * @param {{ selected?: boolean, disabled?: boolean }} [state]
 * @returns {HTMLButtonElement}
 */
export function createCefrCard(level, { selected = false, disabled = false } = {}) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'la-cefr-card';
  card.dataset.level = level.id;
  card.setAttribute('role', 'radio');
  card.setAttribute('aria-checked', String(selected));
  if (disabled) card.setAttribute('aria-disabled', 'true');
  card.innerHTML = `
    <span class="la-cefr-card__glyph">${level.glyph}</span>
    <span class="la-cefr-card__text">
      <span class="la-cefr-card__code">${level.code}</span>
      <span class="la-cefr-card__name">${level.name}</span>
      <span class="la-cefr-card__tone">${level.tone}</span>
    </span>
    <span class="la-cefr-card__check">${CHECK_ICON}</span>`;
  return card;
}

/**
 * Create the CEFR choice grid (radiogroup).
 * @param {{
 *   levels?: typeof CEFR_LEVELS,
 *   value?: string|null,
 *   disabledLevels?: string[],
 *   label?: string,
 *   onSelect?: (levelId: string) => void,
 * }} [options]
 * @returns {{ el: HTMLElement, getValue: () => string|null, setValue: (id: string|null) => void }}
 */
export function createCefrGrid({
  levels = CEFR_LEVELS,
  value = null,
  disabledLevels = [],
  label = 'Choose your current English level',
  onSelect,
} = {}) {
  const grid = document.createElement('div');
  grid.className = 'la-cefr-grid';
  grid.setAttribute('role', 'radiogroup');
  grid.setAttribute('aria-label', label);

  let current = value;
  const cards = levels.map((level) =>
    createCefrCard(level, {
      selected: level.id === value,
      disabled: disabledLevels.includes(level.id),
    }),
  );
  cards.forEach((card) => grid.appendChild(card));

  const enabled = () => cards.filter((c) => c.getAttribute('aria-disabled') !== 'true');

  const syncTabIndex = () => {
    const focusables = enabled();
    const active =
      focusables.find((c) => c.dataset.level === current) ?? focusables[0];
    cards.forEach((c) => { c.tabIndex = c === active ? 0 : -1; });
  };

  const select = (card, { focus = false } = {}) => {
    if (!card || card.getAttribute('aria-disabled') === 'true') return;
    current = card.dataset.level;
    cards.forEach((c) => c.setAttribute('aria-checked', String(c === card)));
    syncTabIndex();
    if (focus) card.focus();
    onSelect?.(current);
  };

  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.la-cefr-card');
    if (card) select(card);
  });

  grid.addEventListener('keydown', (e) => {
    const card = e.target.closest('.la-cefr-card');
    if (!card) return;
    const focusables = enabled();
    const i = focusables.indexOf(card);
    const move = (next) => {
      e.preventDefault();
      select(focusables[(next + focusables.length) % focusables.length], { focus: true });
    };
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown': move(i + 1); break;
      case 'ArrowLeft':
      case 'ArrowUp': move(i - 1); break;
      case 'Home': move(0); break;
      case 'End': move(focusables.length - 1); break;
      case ' ':
      case 'Enter': e.preventDefault(); select(card); break;
      default:
    }
  });

  syncTabIndex();

  return {
    el: grid,
    getValue: () => current,
    setValue: (id) => {
      const card = cards.find((c) => c.dataset.level === id) ?? null;
      if (id === null) {
        current = null;
        cards.forEach((c) => c.setAttribute('aria-checked', 'false'));
        syncTabIndex();
      } else {
        select(card);
      }
    },
  };
}
