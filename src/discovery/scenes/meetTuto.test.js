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

function bubbleTexts() {
  return [...container.querySelectorAll('.ds-bubble-text')].map(el => el.textContent);
}

describe('meetTutoScene', () => {
  it('has the expected id', () => {
    expect(meetTutoScene.id).toBe('meet-tuto');
  });

  it('renders Tuto’s avatar and an empty transcript immediately on mount', () => {
    meetTutoScene.mount({ container });
    expect(container.querySelector('.ds-avatar svg')).not.toBeNull();
    expect(bubbleTexts()).toEqual([]);
  });

  it('keeps the CTA hidden until the conversation finishes', () => {
    meetTutoScene.mount({ container });
    expect(container.querySelector('.ds-cta').classList.contains('ds-hidden')).toBe(true);
  });

  it('shows a typing beat before the first line lands', () => {
    meetTutoScene.mount({ container });

    vi.advanceTimersByTime(300); // first silence
    expect(container.querySelector('.ds-typing')).not.toBeNull();
    expect(bubbleTexts()).toEqual([]);

    vi.advanceTimersByTime(700); // first typing beat resolves
    expect(container.querySelector('.ds-typing')).toBeNull();
    expect(bubbleTexts()).toEqual(["Hey — I'm Tuto."]);
  });

  it('accumulates bubble history instead of clearing previous lines', () => {
    meetTutoScene.mount({ container });

    vi.advanceTimersByTime(1000); // beat 1 lands
    vi.advanceTimersByTime(500 + 650); // beat 2 silence + typing

    expect(bubbleTexts()).toEqual([
      "Hey — I'm Tuto.",
      "I'm going to get to know you a little before we start.",
    ]);
  });

  it('reveals the CTA only after all three beats and a final silence', () => {
    meetTutoScene.mount({ container });

    vi.advanceTimersByTime(1000); // beat 1
    vi.advanceTimersByTime(1150); // beat 2 (500 + 650)
    vi.advanceTimersByTime(1600); // beat 3 (900 + 700)

    expect(bubbleTexts()).toHaveLength(3);
    expect(container.querySelector('.ds-cta').classList.contains('ds-hidden')).toBe(true);

    vi.advanceTimersByTime(700); // final silence
    expect(container.querySelector('.ds-cta').classList.contains('ds-hidden')).toBe(false);
  });

  it('invokes onReady exactly once when the CTA is tapped', () => {
    const onReady = vi.fn();
    meetTutoScene.mount({ container, onReady });

    vi.advanceTimersByTime(1000 + 1150 + 1600 + 700);
    const cta = container.querySelector('.ds-cta');
    cta.click();
    cta.click();

    expect(onReady).toHaveBeenCalledTimes(2);
  });

  it('never exposes test/exam/score/difficulty/algorithm/confidence language', () => {
    meetTutoScene.mount({ container });
    vi.advanceTimersByTime(1000 + 1150 + 1600 + 700);

    const text = container.textContent.toLowerCase();
    for (const forbidden of ['test', 'exam', 'score', 'grade', 'difficulty', 'algorithm', 'confidence']) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('unmount clears the container and stops pending timers', () => {
    meetTutoScene.mount({ container });
    vi.advanceTimersByTime(300); // typing beat is in flight

    meetTutoScene.unmount();
    expect(container.innerHTML).toBe('');

    // Advancing further must not throw or write to the detached scene state
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
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

    vi.advanceTimersByTime(1000);

    expect(containerA.querySelectorAll('.ds-bubble-text')).toHaveLength(1);
    expect(containerB.querySelectorAll('.ds-bubble-text')).toHaveLength(1);

    instanceA.unmount();
    expect(containerA.innerHTML).toBe('');
    expect(containerB.innerHTML).not.toBe('');

    instanceB.unmount();
  });
});
