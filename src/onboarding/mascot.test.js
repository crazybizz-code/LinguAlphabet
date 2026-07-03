// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mountMascot, CELEBRATE_ANIMATION_MS } from './mascot.js';

let container;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('mountMascot', () => {
  it('throws when no container is provided', () => {
    expect(() => mountMascot(null)).toThrow(/container/);
  });

  it('renders the existing mascot asset via a plain img reference, idle by default', () => {
    mountMascot(container);
    const wrapper = container.querySelector('.ob2-mascot');
    const img = container.querySelector('.ob2-mascot-img');
    expect(wrapper.classList.contains('ob2-mascot--idle')).toBe(true);
    expect(img.getAttribute('src')).toBe('/linguAlphabet-mascot.svg');
  });

  it('uses a sensible default alt text, overridable', () => {
    mountMascot(container);
    expect(container.querySelector('img').alt).toBe('Tuto the mascot');

    container.innerHTML = '';
    mountMascot(container, { alt: 'Custom alt' });
    expect(container.querySelector('img').alt).toBe('Custom alt');
  });

  it('celebrate() applies the celebrate class and removes it after the animation duration', () => {
    vi.useFakeTimers();
    const { celebrate } = mountMascot(container);
    const wrapper = container.querySelector('.ob2-mascot');

    celebrate();
    expect(wrapper.classList.contains('ob2-mascot--celebrate')).toBe(true);

    vi.advanceTimersByTime(CELEBRATE_ANIMATION_MS);
    expect(wrapper.classList.contains('ob2-mascot--celebrate')).toBe(false);
  });

  it('celebrate() called again mid-animation restarts cleanly instead of stacking timers', () => {
    vi.useFakeTimers();
    const { celebrate } = mountMascot(container);
    const wrapper = container.querySelector('.ob2-mascot');

    celebrate();
    vi.advanceTimersByTime(CELEBRATE_ANIMATION_MS / 2);
    celebrate();
    vi.advanceTimersByTime(CELEBRATE_ANIMATION_MS / 2);
    // First timer would have fired here if not cleared — class must still be present.
    expect(wrapper.classList.contains('ob2-mascot--celebrate')).toBe(true);

    vi.advanceTimersByTime(CELEBRATE_ANIMATION_MS / 2);
    expect(wrapper.classList.contains('ob2-mascot--celebrate')).toBe(false);
  });

  it('destroy() removes the mascot from the DOM', () => {
    mountMascot(container);
    expect(container.querySelector('.ob2-mascot')).not.toBeNull();

    const { destroy } = mountMascot(container);
    // second mount adds another node; destroy the second instance only
    const handles = container.querySelectorAll('.ob2-mascot');
    expect(handles).toHaveLength(2);
    destroy();
    expect(container.querySelectorAll('.ob2-mascot')).toHaveLength(1);
  });

  it('destroy() during an in-flight celebration does not throw when timers later elapse', () => {
    vi.useFakeTimers();
    const { celebrate, destroy } = mountMascot(container);
    celebrate();
    destroy();
    expect(() => vi.advanceTimersByTime(CELEBRATE_ANIMATION_MS)).not.toThrow();
  });
});
