// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { meetTutoScene, createMeetTutoScene } from './meetTuto.js';

let container;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  meetTutoScene.unmount();
  vi.useRealTimers();
});

function lineTexts() {
  return [...container.querySelectorAll('.ds-line')].map(el => el.textContent);
}

describe('meetTutoScene', () => {
  it('has the expected id', () => {
    expect(meetTutoScene.id).toBe('meet-tuto');
  });

  it('renders the aura, Tuto’s avatar, and an empty transcript immediately on mount', () => {
    meetTutoScene.mount({ container });
    expect(container.querySelector('.ds-aura')).not.toBeNull();
    expect(container.querySelector('.ds-avatar svg')).not.toBeNull();
    expect(lineTexts()).toEqual([]);
  });

  it('keeps the CTA hidden until the conversation finishes', () => {
    meetTutoScene.mount({ container });
    expect(container.querySelector('.ds-cta').classList.contains('ds-hidden')).toBe(true);
  });

  it('says nothing during the opening silence — presence before words', () => {
    meetTutoScene.mount({ container });
    vi.advanceTimersByTime(1000); // still inside the 1100ms opening silence
    expect(container.querySelector('.ds-typing')).toBeNull();
    expect(lineTexts()).toEqual([]);
  });

  it('shows a typing beat before the first line lands', () => {
    meetTutoScene.mount({ container });

    vi.advanceTimersByTime(1100); // opening silence
    expect(container.querySelector('.ds-typing')).not.toBeNull();
    expect(lineTexts()).toEqual([]);

    vi.advanceTimersByTime(650); // first typing beat resolves
    expect(container.querySelector('.ds-typing')).toBeNull();
    expect(lineTexts()).toEqual(['Hi.']);
  });

  it('marks the newest line current and recedes earlier lines instead of removing them', () => {
    meetTutoScene.mount({ container });

    vi.advanceTimersByTime(1750); // beat 1 lands ("Hi.")
    let current = container.querySelectorAll('.ds-line--current');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe('Hi.');

    vi.advanceTimersByTime(650 + 550); // beat 2 lands ("I'm Tuto.")

    const past = container.querySelectorAll('.ds-line--past');
    current = container.querySelectorAll('.ds-line--current');
    expect(past).toHaveLength(1);
    expect(past[0].textContent).toBe('Hi.');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe("I'm Tuto.");

    // history is retained, not deleted
    expect(lineTexts()).toEqual(['Hi.', "I'm Tuto."]);
  });

  it('reveals the CTA only after all four beats and a final silence', () => {
    meetTutoScene.mount({ container });

    vi.advanceTimersByTime(1750); // beat 1
    vi.advanceTimersByTime(1200); // beat 2 (650 + 550)
    vi.advanceTimersByTime(1700); // beat 3 (950 + 750)
    vi.advanceTimersByTime(1700); // beat 4 (1000 + 700)

    expect(lineTexts()).toHaveLength(4);
    expect(container.querySelector('.ds-cta').classList.contains('ds-hidden')).toBe(true);

    vi.advanceTimersByTime(900); // final silence
    expect(container.querySelector('.ds-cta').classList.contains('ds-hidden')).toBe(false);
  });

  it('invokes onReady exactly once per tap when the CTA is tapped', () => {
    const onReady = vi.fn();
    meetTutoScene.mount({ container, onReady });

    vi.advanceTimersByTime(1750 + 1200 + 1700 + 1700 + 900);
    const cta = container.querySelector('.ds-cta');
    cta.click();
    cta.click();

    expect(onReady).toHaveBeenCalledTimes(2);
  });

  it('never exposes test/exam/score/difficulty/algorithm/confidence language', () => {
    meetTutoScene.mount({ container });
    vi.advanceTimersByTime(1750 + 1200 + 1700 + 1700 + 900);

    const text = container.textContent.toLowerCase();
    for (const forbidden of ['test', 'exam', 'score', 'grade', 'difficulty', 'algorithm', 'confidence']) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('unmount clears the container and stops pending timers', () => {
    meetTutoScene.mount({ container });
    vi.advanceTimersByTime(300); // still inside the opening silence

    meetTutoScene.unmount();
    expect(container.innerHTML).toBe('');

    // Advancing further must not throw or write to the detached scene state
    expect(() => vi.advanceTimersByTime(10000)).not.toThrow();
  });
});

describe('createMeetTutoScene (factory)', () => {
  it('produces independent instances that do not share timers or DOM', () => {
    const instanceA = createMeetTutoScene();
    const instanceB = createMeetTutoScene();
    const containerA = document.createElement('div');
    const containerB = document.createElement('div');

    instanceA.mount({ container: containerA });
    instanceB.mount({ container: containerB });

    vi.advanceTimersByTime(1750);

    expect(containerA.querySelectorAll('.ds-line')).toHaveLength(1);
    expect(containerB.querySelectorAll('.ds-line')).toHaveLength(1);

    instanceA.unmount();
    expect(containerA.innerHTML).toBe('');
    expect(containerB.innerHTML).not.toBe('');

    instanceB.unmount();
  });
});
