// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  selfLevelReflectionScene,
  createSelfLevelReflectionScene,
  SCENE_TIMINGS,
} from './selfLevelReflection.js';

const T = SCENE_TIMINGS;

// Absolute beat times from mount, derived from the exported timings so
// the tests and the scene can never drift apart.
const BRIDGE_AT = T.firstLineAtMs; // "Alright, ‹name›."
const QUESTION_AT = BRIDGE_AT + T.lineHoldMs + T.lineDissolveMs;
const GRID_AT = QUESTION_AT + T.gridRevealDelayMs;

function afterSelect(extraMs) {
  return T.selectionHoldMs + T.lineDissolveMs + T.thinkingMs + extraMs;
}
const REACTION_AT = afterSelect(0);
const ORB_AT = REACTION_AT + T.lineHoldMs + T.lineDissolveMs + T.orbReleaseGapMs;

let container;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  selfLevelReflectionScene.unmount();
  container.remove();
  vi.useRealTimers();
});

function lineTexts() {
  return [...container.querySelectorAll('.ds-line')].map(el => el.textContent);
}

function goToGrid(initialData) {
  selfLevelReflectionScene.mount({ container, initialData });
  vi.advanceTimersByTime(GRID_AT);
}

function pickCard(code) {
  container.querySelector(`.ds-level-card[data-code="${code}"]`).click();
}

describe('selfLevelReflectionScene — entrance and the bridge', () => {
  it('has the expected id', () => {
    expect(selfLevelReflectionScene.id).toBe('self-level-reflection');
  });

  it('Tuto is already present on mount — no veil, no ember, no wake ritual', () => {
    selfLevelReflectionScene.mount({ container });
    expect(container.querySelector('.ds-veil')).toBeNull();
    expect(container.querySelector('.ds-ember')).toBeNull();
    expect(container.querySelector('.ds-avatar svg')).not.toBeNull();
    expect(container.querySelector('.ds-stage').classList.contains('ds-stage--condense')).toBe(true);
  });

  it('grid, reassurance, and orb start hidden', () => {
    selfLevelReflectionScene.mount({ container });
    expect(container.querySelector('.ds-level-grid').classList.contains('ds-hidden')).toBe(true);
    expect(container.querySelector('.ds-reassurance').classList.contains('ds-hidden')).toBe(true);
    expect(container.querySelector('.ds-orb').classList.contains('ds-hidden')).toBe(true);
  });

  it('greets the learner by name when preferredName is known', () => {
    selfLevelReflectionScene.mount({ container, initialData: { preferredName: 'Yodgor' } });
    vi.advanceTimersByTime(BRIDGE_AT);
    expect(lineTexts()).toEqual(['Alright, Yodgor.']);
  });

  it('greets warmly without a name', () => {
    selfLevelReflectionScene.mount({ container });
    vi.advanceTimersByTime(BRIDGE_AT);
    expect(lineTexts()).toEqual(['Alright.']);
  });

  it('the bridge dissolves into the question on its own — one continuous conversation, no re-wake', () => {
    selfLevelReflectionScene.mount({ container });
    vi.advanceTimersByTime(QUESTION_AT);
    expect(lineTexts()).toEqual(['Where do you think your English is today?']);
  });
});

describe('selfLevelReflectionScene — the self-assessment', () => {
  it('reveals all six level cards and the reassurance line together, just after the question', () => {
    selfLevelReflectionScene.mount({ container });
    vi.advanceTimersByTime(QUESTION_AT);
    expect(container.querySelector('.ds-level-grid').classList.contains('ds-hidden')).toBe(true);

    vi.advanceTimersByTime(T.gridRevealDelayMs);
    const grid = container.querySelector('.ds-level-grid');
    const reassurance = container.querySelector('.ds-reassurance');
    expect(grid.classList.contains('ds-hidden')).toBe(false);
    expect(reassurance.classList.contains('ds-hidden')).toBe(false);
    expect(reassurance.textContent).toMatch(/Discovery Session/);

    const codes = [...grid.querySelectorAll('.ds-level-card')].map(c => c.dataset.code);
    expect(codes).toEqual(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
  });

  it('is a real radiogroup — accessible semantics, not a plain div of buttons', () => {
    goToGrid();
    const grid = container.querySelector('.ds-level-grid');
    expect(grid.getAttribute('role')).toBe('radiogroup');
    const card = grid.querySelector('.ds-level-card');
    expect(card.getAttribute('role')).toBe('radio');
    expect(card.getAttribute('aria-checked')).toBe('false');
  });

  it('the question cannot be skipped by taps or keys — only a card selection moves it forward', () => {
    goToGrid();
    vi.advanceTimersByTime(60_000);
    container.querySelector('.ds-scene').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    container
      .querySelector('.ds-scene')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(lineTexts()).toEqual(['Where do you think your English is today?']);
  });

  it('selecting a card marks it checked and disables the rest — a single choice, made once', () => {
    goToGrid();
    pickCard('B1');

    const cards = [...container.querySelectorAll('.ds-level-card')];
    const b1 = cards.find(c => c.dataset.code === 'B1');
    expect(b1.getAttribute('aria-checked')).toBe('true');
    expect(b1.classList.contains('ds-level-card--selected')).toBe(true);
    cards.forEach(c => expect(c.disabled).toBe(true));
  });

  it('selection auto-advances — no separate confirmation step (Founder Decision 5)', () => {
    goToGrid();
    pickCard('B1');
    vi.advanceTimersByTime(T.selectionHoldMs);
    expect(container.querySelector('.ds-level-grid').classList.contains('ds-panel--dissolve')).toBe(true);
  });

  it('Tuto takes the choice in, then reacts naturally with the chosen level', () => {
    goToGrid();
    pickCard('B1');
    vi.advanceTimersByTime(afterSelect(0) - 1);
    expect(lineTexts()).toEqual([]); // still thinking

    vi.advanceTimersByTime(1);
    expect(lineTexts()).toEqual(["B1 — got it. Let's find out together."]);
  });

  it('the grid and reassurance are gone by the time Tuto reacts', () => {
    goToGrid();
    pickCard('C1');
    vi.advanceTimersByTime(afterSelect(0));
    expect(container.querySelector('.ds-level-grid').classList.contains('ds-hidden')).toBe(true);
    expect(container.querySelector('.ds-reassurance').classList.contains('ds-hidden')).toBe(true);
  });
});

describe('selfLevelReflectionScene — the threshold', () => {
  it('the orb appears only after the reaction line has landed and dissolved', () => {
    goToGrid();
    pickCard('A2');
    vi.advanceTimersByTime(afterSelect(0) + T.lineHoldMs); // reaction dissolving, orb not yet
    expect(container.querySelector('.ds-orb').classList.contains('ds-hidden')).toBe(true);
  });

  it('descends, settles, takes focus, and reveals the "Continue" label', () => {
    goToGrid();
    pickCard('A2');
    vi.advanceTimersByTime(ORB_AT);

    const orb = container.querySelector('.ds-orb');
    expect(orb.classList.contains('ds-hidden')).toBe(false);
    expect(orb.classList.contains('ds-orb--labeled')).toBe(false);

    vi.advanceTimersByTime(T.orbDescentMs);
    expect(orb.classList.contains('ds-orb--settled')).toBe(true);
    expect(document.activeElement).toBe(orb);

    vi.advanceTimersByTime(T.orbLabelDelayMs);
    expect(orb.classList.contains('ds-orb--labeled')).toBe(true);
    expect(orb.querySelector('.ds-orb-label').textContent).toBe('Continue');
  });

  it('taking the light fires onReady exactly once with the chosen level', () => {
    const onReady = vi.fn();
    selfLevelReflectionScene.mount({ container, onReady });
    vi.advanceTimersByTime(GRID_AT);
    pickCard('C2');
    vi.advanceTimersByTime(ORB_AT + T.orbDescentMs + T.orbLabelDelayMs);

    const orb = container.querySelector('.ds-orb');
    orb.click();
    orb.click();

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledWith({ selfAssessedLevel: 'C2' });
  });
});

describe('selfLevelReflectionScene — invariants', () => {
  it('never exposes test/exam/score/grade/difficulty/algorithm/confidence language', () => {
    selfLevelReflectionScene.mount({ container, initialData: { preferredName: 'Yodgor' } });
    const forbidden = ['test', 'exam', 'score', 'grade', 'difficulty', 'algorithm', 'confidence'];
    const check = () => {
      const text = container.textContent.toLowerCase();
      for (const word of forbidden) expect(text).not.toContain(word);
    };

    check();
    vi.advanceTimersByTime(GRID_AT);
    check();
    pickCard('B2');
    vi.advanceTimersByTime(ORB_AT + T.orbDescentMs + T.orbLabelDelayMs);
    check();
  });

  it('unmount clears the container and stops pending timers', () => {
    selfLevelReflectionScene.mount({ container });
    vi.advanceTimersByTime(300);

    selfLevelReflectionScene.unmount();
    expect(container.innerHTML).toBe('');
    expect(() => vi.advanceTimersByTime(60_000)).not.toThrow();
  });
});

describe('createSelfLevelReflectionScene (factory)', () => {
  it('produces independent instances that do not share phase, timers, or DOM', () => {
    const instanceA = createSelfLevelReflectionScene();
    const instanceB = createSelfLevelReflectionScene();
    const containerA = document.createElement('div');
    const containerB = document.createElement('div');
    document.body.append(containerA, containerB);

    instanceA.mount({ container: containerA, initialData: { preferredName: 'Alice' } });
    instanceB.mount({ container: containerB });

    vi.advanceTimersByTime(BRIDGE_AT);

    expect([...containerA.querySelectorAll('.ds-line')].map(el => el.textContent)).toEqual([
      'Alright, Alice.',
    ]);
    expect([...containerB.querySelectorAll('.ds-line')].map(el => el.textContent)).toEqual([
      'Alright.',
    ]);

    instanceA.unmount();
    expect(containerA.innerHTML).toBe('');
    expect(containerB.querySelector('.ds-avatar')).not.toBeNull();

    instanceB.unmount();
    containerA.remove();
    containerB.remove();
  });
});
