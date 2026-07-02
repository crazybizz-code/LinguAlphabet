// ============================================================
// chipGroup.js — shared single/multi-select chip renderer
// ============================================================
// Presentational DOM helper reused by every option-based onboarding
// stage (Goal Selection, Level Selection, Daily Commitment, and
// Motivation's tag picker) so the same render/select/toggle/cleanup
// logic isn't rewritten four times. It has no opinion about what the
// options mean — validation and data shape stay owned by each stage.

const CHIP_CLASS = 'ob2-chip';
const SELECTED_CLASS = 'ob2-chip--selected';
const GROUP_CLASS = 'ob2-chip-group';

function buildChipButton(option) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = CHIP_CLASS;
  if (option.variant) button.classList.add(`ob2-chip--${option.variant}`);
  button.dataset.value = option.value;

  if (option.icon) {
    const iconEl = document.createElement('span');
    iconEl.className = 'ob2-chip-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.textContent = option.icon;
    button.appendChild(iconEl);
  }

  const textWrap = document.createElement('span');
  textWrap.className = 'ob2-chip-text';

  const labelEl = document.createElement('span');
  labelEl.className = 'ob2-chip-label';
  labelEl.textContent = option.label;
  textWrap.appendChild(labelEl);

  if (option.description) {
    const descEl = document.createElement('span');
    descEl.className = 'ob2-chip-desc';
    descEl.textContent = option.description;
    textWrap.appendChild(descEl);
  }

  button.appendChild(textWrap);
  return button;
}

/**
 * @param {object} config
 * @param {HTMLElement} config.container - mounted into this element (appended, not cleared)
 * @param {Array<{value:string, label:string, icon?:string, description?:string, variant?:string}>} config.options
 * @param {boolean} [config.multi] - multi-select (checkbox-like) vs single-select (radio-like)
 * @param {string[]} [config.initialSelected]
 * @param {string} [config.groupLabel] - accessible name for the group
 * @param {(selected: string[]) => void} [config.onChange]
 * @returns {{ getSelected: () => string[], setSelected: (values: string[]) => void, destroy: () => void }}
 */
export function createChipGroup({
  container,
  options,
  multi = false,
  initialSelected = [],
  groupLabel,
  onChange,
}) {
  if (!container) {
    throw new Error('createChipGroup: container is required');
  }

  const group = document.createElement('div');
  group.className = GROUP_CLASS;
  group.setAttribute('role', multi ? 'group' : 'radiogroup');
  if (groupLabel) group.setAttribute('aria-label', groupLabel);

  let selected = new Set(initialSelected);

  function syncButtonState(button) {
    const isSelected = selected.has(button.dataset.value);
    button.classList.toggle(SELECTED_CLASS, isSelected);
    if (multi) {
      button.setAttribute('aria-pressed', String(isSelected));
    } else {
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(isSelected));
    }
  }

  options.forEach(option => {
    const button = buildChipButton(option);
    syncButtonState(button);
    group.appendChild(button);
  });

  function handleClick(event) {
    const button = event.target.closest(`.${CHIP_CLASS}`);
    if (!button || !group.contains(button)) return;

    const value = button.dataset.value;
    if (multi) {
      if (selected.has(value)) selected.delete(value);
      else selected.add(value);
    } else {
      selected = new Set([value]);
    }

    group.querySelectorAll(`.${CHIP_CLASS}`).forEach(syncButtonState);
    onChange?.(Array.from(selected));
  }

  group.addEventListener('click', handleClick);
  container.appendChild(group);

  return {
    getSelected: () => Array.from(selected),
    setSelected: (values) => {
      selected = new Set(values);
      group.querySelectorAll(`.${CHIP_CLASS}`).forEach(syncButtonState);
    },
    destroy: () => {
      group.removeEventListener('click', handleClick);
      group.remove();
    },
  };
}
