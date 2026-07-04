// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { meetTutoScene, createMeetTutoScene, SCENE_TIMINGS } from './meetTuto.js';

const T = SCENE_TIMINGS;

// Absolute beat times from the wake touch (T0), derived from the
// exported timings so the tests and the scene can never drift apart.
const LINE_1_AT = T.firstLineAtMs; // "Oh— hello."
const LINE_2_AT = LINE_1_AT + T.lineHoldMs + T.lineDissolveMs; // "I'm Tuto."
const QUESTION_AT = LINE_2_AT + T.lineHoldMs + T.lineDissolveMs; // the ask
const REPLY_AT = QUESTION_AT + T.replyRevealDelayMs; // the reply bubble
// From the submit (S): dissolve → thinking breath → Tuto answers.
const RESPONSE_AFTER_SUBMIT = T.lineDissolveMs + T.thinkingMs;
const ORB_AFTER_SUBMIT = RESPONSE_AFTER_SUBMIT + T.lineHoldMs + T.lineDissolveMs + T.orbReleaseGapMs;

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

function runToQuestion() {
  wake();
  vi.advanceTimersByTime(REPLY_AT);
}

function reply(name) {
  container.querySelector('.ds-reply-input').value = name;
  container
    .querySelector('.ds-reply')
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

describe('meetTutoScene — the veil (State I)', () => {
  it('has the expected id', () => {
    expect(meetTutoScene.id).toBe('meet-tuto');
  });

  it('opens veiled: ember button + whisper visible, Tuto hidden, no lines, no reply, no orb', () => {
    meetTutoScene.mount({ container });
    expect(container.querySelector('.ds-veil')).not.toBeNull();
    const ember = container.querySelector('button.ds-ember');
    expect(ember).not.toBeNull();
    expect(ember.getAttribute('aria-label')).toBe('Tuto is waiting. Press to say hello.');
    expect(container.querySelector('.ds-whisper').textContent).toBe('touch the light');
    expect(container.querySelector('.ds-stage').classList.contains('ds-stage--veiled')).toBe(true);
    expect(lineTexts()).toEqual([]);
    expect(container.querySelector('.ds-reply').classList.contains('ds-hidden')).toBe(true);
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

describe('meetTutoScene — the introduction', () => {
  it('says hello without a name — he does not know it yet', () => {
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

  it('impatience is obeyed: a press advances the intro immediately', () => {
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
});

describe('meetTutoScene — the ask', () => {
  it('asks for a name and reveals the reply bubble just after, with focus handed over', () => {
    meetTutoScene.mount({ container });
    wake();
    vi.advanceTimersByTime(QUESTION_AT);
    expect(lineTexts()).toEqual(['Before we continue… what should I call you?']);
    expect(container.querySelector('.ds-reply').classList.contains('ds-hidden')).toBe(true);

    vi.advanceTimersByTime(T.replyRevealDelayMs);
    const replyForm = container.querySelector('.ds-reply');
    expect(replyForm.classList.contains('ds-hidden')).toBe(false);
    expect(document.activeElement).toBe(container.querySelector('.ds-reply-input'));
    expect(container.querySelector('.ds-reply-input').getAttribute('aria-label')).toBe(
      'What should I call you?'
    );
  });

  it('the question cannot be skipped — taps and Enter do not advance past it', () => {
    meetTutoScene.mount({ container });
    runToQuestion();
    vi.advanceTimersByTime(60_000); // and it never auto-advances either
    container.querySelector('.ds-scene').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    container
      .querySelector('.ds-scene')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(lineTexts()).toEqual(['Before we continue… what should I call you?']);
  });

  it('an empty reply sways the bubble and keeps waiting — nothing scolds', () => {
    meetTutoScene.mount({ container });
    runToQuestion();
    reply('   ');
    expect(container.querySelector('.ds-reply').classList.contains('ds-reply--sway')).toBe(true);
    expect(lineTexts()).toEqual(['Before we continue… what should I call you?']);
    expect(document.activeElement).toBe(container.querySelector('.ds-reply-input'));
  });

  it('a submitted name dissolves the question and the bubble together', () => {
    meetTutoScene.mount({ container });
    runToQuestion();
    reply('Zafar');
    expect(container.querySelector('.ds-line--dissolve')).not.toBeNull();
    expect(container.querySelector('.ds-reply').classList.contains('ds-reply--dissolve')).toBe(true);
  });

  it('Tuto takes the name in for a breath, then answers with it', () => {
    meetTutoScene.mount({ container });
    runToQuestion();
    reply('Zafar');
    vi.advanceTimersByTime(T.lineDissolveMs); // question gone, still thinking
    expect(lineTexts()).toEqual([]);

    vi.advanceTimersByTime(T.thinkingMs);
    expect(lineTexts()).toEqual(["Zafar — it's really good to meet you."]);
  });

  it('normalizes the reply: whitespace collapsed and trimmed, length capped', () => {
    meetTutoScene.mount({ container });
    runToQuestion();
    reply('  Zafar   khan  ');
    vi.advanceTimersByTime(RESPONSE_AFTER_SUBMIT);
    expect(lineTexts()).toEqual(["Zafar khan — it's really good to meet you."]);
  });

  it('the send button is a labeled submit control — tap parity with Enter', () => {
    meetTutoScene.mount({ container });
    runToQuestion();
    const send = container.querySelector('.ds-reply-send');
    expect(send.getAttribute('aria-label')).toBe('Tell Tuto');
    container.querySelector('.ds-reply-input').value = 'Aziza';
    send.click(); // jsdom fires the form's submit event; our handler prevents default
    vi.advanceTimersByTime(RESPONSE_AFTER_SUBMIT);
    expect(lineTexts()).toEqual(["Aziza — it's really good to meet you."]);
  });
});

describe('meetTutoScene — the threshold (the orb)', () => {
  function runToOrb(name = 'Zafar') {
    meetTutoScene.mount({ container });
    runToQuestion();
    reply(name);
    vi.advanceTimersByTime(ORB_AFTER_SUBMIT);
  }

  it('the orb appears only after Tuto has answered with the name', () => {
    meetTutoScene.mount({ container });
    runToQuestion();
    reply('Zafar');
    vi.advanceTimersByTime(RESPONSE_AFTER_SUBMIT + T.lineHoldMs); // response dissolving
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

  it('taking the light fires onReady exactly once with the chosen name', () => {
    const onReady = vi.fn();
    meetTutoScene.mount({ container, onReady });
    runToQuestion();
    reply('Zafar');
    vi.advanceTimersByTime(ORB_AFTER_SUBMIT + T.orbDescentMs + T.orbLabelDelayMs);

    const orb = container.querySelector('.ds-orb');
    orb.click();
    orb.click();
    orb.click();

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledWith({ preferredName: 'Zafar' });
    expect(orb.classList.contains('ds-orb--taken')).toBe(true);
  });
});

describe('meetTutoScene — invariants', () => {
  it('never exposes test/exam/score/grade/difficulty/algorithm/confidence language', () => {
    meetTutoScene.mount({ container });
    const forbidden = ['test', 'exam', 'score', 'grade', 'difficulty', 'algorithm', 'confidence'];
    const check = () => {
      const text = container.textContent.toLowerCase();
      for (const word of forbidden) expect(text).not.toContain(word);
    };

    check(); // the veil
    wake();
    vi.advanceTimersByTime(LINE_1_AT);
    check();
    vi.advanceTimersByTime(REPLY_AT);
    check();
    reply('Zafar');
    vi.advanceTimersByTime(ORB_AFTER_SUBMIT + T.orbDescentMs + T.orbLabelDelayMs);
    check();
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

    instanceA.mount({ container: containerA });
    instanceB.mount({ container: containerB });

    containerA.querySelector('.ds-ember').click(); // only A wakes
    vi.advanceTimersByTime(LINE_1_AT);

    expect(containerA.querySelectorAll('.ds-line')).toHaveLength(1);
    expect(containerB.querySelectorAll('.ds-line')).toHaveLength(0);

    instanceA.unmount();
    expect(containerA.innerHTML).toBe('');
    expect(containerB.querySelector('.ds-ember')).not.toBeNull();

    instanceB.unmount();
    containerA.remove();
    containerB.remove();
  });
});
