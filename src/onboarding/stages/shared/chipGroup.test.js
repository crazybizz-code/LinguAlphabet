// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createChipGroup } from './chipGroup.js';

const OPTIONS = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B', description: 'desc B' },
  { value: 'c', label: 'Option C', icon: '🎯' },
];

let container;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

function clickChip(value) {
  const button = container.querySelector(`.ob2-chip[data-value="${value}"]`);
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('createChipGroup (single-select)', () => {
  it('renders one chip per option with a radiogroup role', () => {
    createChipGroup({ container, options: OPTIONS, groupLabel: 'Test group' });
    const group = container.querySelector('.ob2-chip-group');
    expect(group.getAttribute('role')).toBe('radiogroup');
    expect(group.getAttribute('aria-label')).toBe('Test group');
    expect(container.querySelectorAll('.ob2-chip')).toHaveLength(3);
  });

  it('honors initialSelected', () => {
    const handle = createChipGroup({ container, options: OPTIONS, initialSelected: ['b'] });
    expect(handle.getSelected()).toEqual(['b']);
    expect(container.querySelector('[data-value="b"]').classList.contains('ob2-chip--selected')).toBe(true);
  });

  it('clicking a chip replaces the previous selection', () => {
    const handle = createChipGroup({ container, options: OPTIONS, initialSelected: ['a'] });
    clickChip('c');
    expect(handle.getSelected()).toEqual(['c']);
    expect(container.querySelector('[data-value="a"]').classList.contains('ob2-chip--selected')).toBe(false);
    expect(container.querySelector('[data-value="c"]').getAttribute('aria-checked')).toBe('true');
  });

  it('calls onChange with the new selection', () => {
    const onChange = vi.fn();
    createChipGroup({ container, options: OPTIONS, onChange });
    clickChip('a');
    expect(onChange).toHaveBeenCalledWith(['a']);
  });

  it('clicking outside a chip button does nothing', () => {
    const onChange = vi.fn();
    createChipGroup({ container, options: OPTIONS, onChange });
    container.querySelector('.ob2-chip-group').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('createChipGroup (multi-select)', () => {
  it('uses a group role and toggles aria-pressed', () => {
    createChipGroup({ container, options: OPTIONS, multi: true });
    expect(container.querySelector('.ob2-chip-group').getAttribute('role')).toBe('group');
    clickChip('a');
    expect(container.querySelector('[data-value="a"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('accumulates multiple selections and toggles off on re-click', () => {
    const handle = createChipGroup({ container, options: OPTIONS, multi: true });
    clickChip('a');
    clickChip('c');
    expect(handle.getSelected().sort()).toEqual(['a', 'c']);
    clickChip('a');
    expect(handle.getSelected()).toEqual(['c']);
  });
});

describe('setSelected', () => {
  it('overwrites the current selection and updates the DOM', () => {
    const handle = createChipGroup({ container, options: OPTIONS, multi: true, initialSelected: ['a'] });
    handle.setSelected(['b', 'c']);
    expect(handle.getSelected().sort()).toEqual(['b', 'c']);
    expect(container.querySelector('[data-value="a"]').classList.contains('ob2-chip--selected')).toBe(false);
    expect(container.querySelector('[data-value="b"]').classList.contains('ob2-chip--selected')).toBe(true);
  });
});

describe('destroy', () => {
  it('removes the group from the DOM and stops listening for clicks', () => {
    const onChange = vi.fn();
    const handle = createChipGroup({ container, options: OPTIONS, onChange });
    handle.destroy();
    expect(container.querySelector('.ob2-chip-group')).toBeNull();
  });
});

describe('input validation', () => {
  it('throws when no container is provided', () => {
    expect(() => createChipGroup({ options: OPTIONS })).toThrow(/container/);
  });
});
