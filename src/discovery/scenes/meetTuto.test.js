// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { meetTutoScene, createMeetTutoScene, SCENE_TIMINGS } from './meetTuto.js';

const T = SCENE_TIMINGS;

// Absolute beat times from the wake touch (T0), derived from the
// exported timings so the tests and the scene can never drift apart.
const LINE_1_AT = T.firstLineAtMs; // 1900
const LINE_2_AT = LINE_1_AT + T.lineHoldMs + T.lineDissolveMs; // 4200
const LINE_3_AT = LINE_2_AT + T.lineHoldMs + T.lineDissolveMs; // 6500
const ORB_AT = LINE_3_AT + T.lineHoldMs + T.lineDissolveMs + T.orbReleaseGapMs; // 9100
const ORB_SETTLED_AT = ORB_AT + T.orbDescentMs; // 10000
const LABEL_AT = ORB_SETTLED_AT + T.orbLabelDelayMs; // 10800

let container;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  meetTutoScene.unmount();
  container.remove();
  vi.useRealTimers();
});

function lineTexts() {
  return [...container.querySelectorAll('.ds-line')].map(el => el.textContent);
}

function wake() {
  container.querySelector('.ds-ember').click();
}

describe('meetTutoScene — the veil (State I)', () => {
  it('has the expected id', () => {
    expect(meetTutoScene.id).toBe('meet-tuto');
  });

  it('opens veiled: ember button + whisper visible, Tuto hidden, no lines, no orb', () => {
    meetTutoScene.mount({ container });
    expect(container.querySelector('.ds-veil')).not.toBeNull();
    const ember = container.querySelector('button.ds-ember');
    expect(ember).not.toBeNull();
    expect(ember.getAttribute('aria-label')).toBe('Tuto is waiting. Press to say hello.');
    expect(container.querySelector('.ds-whisper').textContent).toBe('touch the light');
    expect(container.querySelector('.ds-stage').classList.contains('ds-stage--veiled')).toBe(true);
    expect(lineTexts()).toEqual([]);
    expect(container.querySelector('.ds-orb').classList.contains('ds-hidden')).toBe(true);
  });

  it('focuses the ember on mount so keyboard and AT users can wake Tuto immediately', () => {
    meetTutoScene.mount({ container });
    expect(document.activeElement).toBe(container.querySelector('.ds-ember'));
  });

  it('never begins on its own — the learner owns the first beat', () => {
    meetTutoScene.mount({ container });
    vi.advanceTimersByTime(60_000);
    expect(lineTexts()).toEqual([]);
    expect(container.querySelector('.ds-veil').classList.contains('ds-veil--lifting')).toBe(false);
  });
});

describe('meetTutoScene — the wake (T0)', () => {
  it('a click on the ember lifts the veil and starts the bloom', () => {
    meetTutoScene.mount({ container });
    wake();
    expect(container.querySelector('.ds-veil').classList.contains('ds-veil--lifting')).toBe(true);
    expect(container.querySelector('.ds-scene').classList.contains('ds-scene--waking')).toBe(true);
  });

  it('a pointer press anywhere on the veil also wakes', () => {
    meetTutoScene.mount({ container });
    container.querySelector('.ds-veil').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(container.querySelector('.ds-veil').classList.contains('ds-veil--lifting')).toBe(true);
  });

  it('Enter on the veil wakes — keyboard parity', () => {
    meetTutoScene.mount({ container });
    container
      .querySelector('.ds-veil')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(container.querySelector('.ds-veil').classList.contains('ds-veil--lifting')).toBe(true);
  });

  it('Tuto condenses out of the light after the bloom starts travelling', () => {
    meetTutoScene.mount({ container });
    wake();
    const stage = container.querySelector('.ds-stage');
    expect(stage.classList.contains('ds-stage--condense')).toBe(false);

    vi.advanceTimersByTime(T.condenseDelayMs);
    expect(stage.classList.contains('ds-stage--veiled')).toBe(false);
    expect(stage.classList.contains('ds-stage--condense')).toBe(true);
    expect(stage.querySelector('.ds-avatar svg')).not.toBeNull();
  });

  it('waking twice is impossible', () => {
    meetTutoScene.mount({ container });
    wake();
    vi.advanceTimersByTime(LINE_1_AT);
    wake(); // stray second activation must not restart the sequence
    expect(lineTexts()).toHaveLength(1);
  });
});

describe('meetTutoScene — the exchange', () => {
  it('greets the learner by name', () => {
    meetTutoScene.mount({ container, initialData: { displayName: 'Yodgor' } });
    wake();
    vi.advanceTimersByTime(LINE_1_AT);
    expect(lineTexts()).toEqual(['Oh— hello, Yodgor.']);
  });

  it('greets warmly without a name', () => {
    meetTutoScene.mount({ container });
    wake();
    vi.advanceTimersByTime(LINE_1_AT);
    expect(lineTexts()).toEqual(['Oh— hello.']);
  });

  it('one focal line at a time: the spent line dissolves before the next condenses', () => {
    meetTutoScene.mount({ container });
    wake();
    vi.advanceTimersByTime(LINE_1_AT + T.lineHoldMs); // dissolve begins
    expect(container.querySelector('.ds-line--dissolve')).not.toBeNull();
    expect(container.querySelectorAll('.ds-mote').length).toBeGreaterThan(0);

    vi.advanceTimersByTime(T.lineDissolveMs); // line 2 lands
    expect(lineTexts()).toEqual(["I'm Tuto."]);
    expect(container.querySelectorAll('.ds-mote')).toHaveLength(0);
  });

  it('plays all three beats on schedule', () => {
    meetTutoScene.mount({ container, initialData: { displayName: 'Yodgor' } });
    wake();
    vi.advanceTimersByTime(LINE_3_AT);
    expect(lineTexts()).toEqual(["From here on, it's you and me."]);
  });

  it('impatience is obeyed: a press advances the exchange immediately', () => {
    meetTutoScene.mount({ container });
    wake();
    vi.advanceTimersByTime(LINE_1_AT + T.advanceGuardMs); // line 1 landed, guard released
    container.querySelector('.ds-scene').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(container.querySelector('.ds-line--dissolve')).not.toBeNull();

    vi.advanceTimersByTime(T.lineDissolveMs);
    expect(lineTexts()).toEqual(["I'm Tuto."]);
  });

  it('a fresh line always gets its moment: input inside the guard window is ignored', () => {
    meetTutoScene.mount({ container });
    wake();
    vi.advanceTimersByTime(LINE_1_AT + T.advanceGuardMs - 100);
    container.querySelector('.ds-scene').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(container.querySelector('.ds-line--dissolve')).toBeNull();
  });

  it('Enter advances the exchange — keyboard parity', () => {
    meetTutoScene.mount({ container });
    wake();
    vi.advanceTimersByTime(LINE_1_AT + T.advanceGuardMs);
    container
      .querySelector('.ds-scene')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(container.querySelector('.ds-line--dissolve')).not.toBeNull();
  });
});

describe('meetTutoScene — the threshold (the orb)', () => {
  function runToOrb() {
    meetTutoScene.mount({ container });
    wake();
    vi.advanceTimersByTime(ORB_AT);
  }

  it('the orb stays hidden until the last line has dissolved', () => {
    meetTutoScene.mount({ container });
    wake();
    vi.advanceTimersByTime(LINE_3_AT + T.lineHoldMs); // final dissolve just starting
    expect(container.querySelector('.ds-orb').classList.contains('ds-hidden')).toBe(true);
  });

  it('descends, settles, takes focus, and only then reveals its label', () => {
    runToOrb();
    const orb = container.querySelector('.ds-orb');
    expect(orb.classList.contains('ds-hidden')).toBe(false);
    expect(orb.classList.contains('ds-orb--arriving')).toBe(true);
    expect(orb.classList.contains('ds-orb--labeled')).toBe(false);

    vi.advanceTimersByTime(T.orbDescentMs);
    expect(orb.classList.contains('ds-orb--settled')).toBe(true);
    expect(document.activeElement).toBe(orb);

    vi.advanceTimersByTime(T.orbLabelDelayMs);
    expect(orb.classList.contains('ds-orb--labeled')).toBe(true);
    expect(orb.querySelector('.ds-orb-label').textContent).toBe('Begin');
  });

  it('taking the light fires onReady exactly once, ever', () => {
    const onReady = vi.fn();
    meetTutoScene.mount({ container, onReady });
    wake();
    vi.advanceTimersByTime(LABEL_AT);

    const orb = container.querySelector('.ds-orb');
    orb.click();
    orb.click();
    orb.click();

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(orb.classList.contains('ds-orb--taken')).toBe(true);
  });
});

describe('meetTutoScene — invariants', () => {
  it('never exposes test/exam/score/grade/difficulty/algorithm/confidence language', () => {
    meetTutoScene.mount({ container, initialData: { displayName: 'Yodgor' } });
    const forbidden = ['test', 'exam', 'score', 'grade', 'difficulty', 'algorithm', 'confidence'];
    const check = () => {
      const text = container.textContent.toLowerCase();
      for (const word of forbidden) expect(text).not.toContain(word);
    };

    check(); // the veil
    wake();
    for (const at of [LINE_1_AT, LINE_2_AT, LINE_3_AT, LABEL_AT]) {
      vi.advanceTimersByTime(at); // cumulative overshoot is fine — we only read text
      check();
    }
  });

  it('unmount mid-wake clears the DOM and strands no timers', () => {
    meetTutoScene.mount({ container });
    wake();
    vi.advanceTimersByTime(600); // bloom in flight

    meetTutoScene.unmount();
    expect(container.innerHTML).toBe('');
    expect(() => vi.advanceTimersByTime(60_000)).not.toThrow();
  });
});

describe('createMeetTutoScene (factory)', () => {
  it('produces independent instances that do not share phase, timers, or DOM', () => {
    const instanceA = createMeetTutoScene();
    const instanceB = createMeetTutoScene();
    const containerA = document.createElement('div');
    const containerB = document.createElement('div');
    document.body.append(containerA, containerB);

    instanceA.mount({ container: containerA, initialData: { displayName: 'Alice' } });
    instanceB.mount({ container: containerB, initialData: { displayName: 'Bob' } });

    containerA.querySelector('.ds-ember').click(); // only A wakes
    vi.advanceTimersByTime(LINE_1_AT);

    expect([...containerA.querySelectorAll('.ds-line')].map(el => el.textContent)).toEqual([
      'Oh— hello, Alice.',
    ]);
    expect(containerB.querySelectorAll('.ds-line')).toHaveLength(0);

    instanceA.unmount();
    expect(containerA.innerHTML).toBe('');
    expect(containerB.querySelector('.ds-ember')).not.toBeNull();

    instanceB.unmount();
    containerA.remove();
    containerB.remove();
  });
});
