// ============================================================
// meetTuto.js — Discovery Session, Scene 1: Meet Tuto
// ============================================================
// Experience-layer only. This scene renders before the adaptive
// engine asks anything — it exists purely to make the learner feel
// like they've started a conversation with Tuto, not a test.
//
// Per the Conversation Experience Specification and the Founder
// Decisions: no "test/exam/score/grade/difficulty/algorithm/
// confidence" language anywhere in this file's copy; Tuto's presence
// persists on screen; the transcript accumulates (bubble history
// stays visible); pacing uses silence + a typing beat before each
// line, mirroring the established welcome-screen convention
// (src/main.js initWelcomeScreen — typing dots, then a delayed
// reveal) rather than inventing a new rhythm. The scene ends on an
// explicit confirmation (tap), never an auto-advance, since it is
// the threshold into the session itself.
//
// This scene does not touch the Engineering Specification's state
// machine, adaptive algorithm, or Learning Brain integration — it
// only calls ctx.onReady() once, when the learner taps through, and
// leaves what happens next entirely to the (unchanged) caller.

import { createScene } from './sceneDescriptor.js';
import { getTutoSVG } from '../../auth-ui.js';

const SCENE_ID = 'meet-tuto';

// Each beat: a silent pause, then a typing indicator, then the line
// lands. Timings echo the app's existing conversational cadence
// (see src/main.js initWelcomeScreen's 800ms typing-to-reveal beat)
// rather than a new invented rhythm, with deliberately uneven gaps
// so the sequence doesn't read as a metronome.
const BEATS = Object.freeze([
  Object.freeze({ silenceMs: 300, typingMs: 700, text: "Hey — I'm Tuto." }),
  Object.freeze({
    silenceMs: 500,
    typingMs: 650,
    text: "I'm going to get to know you a little before we start.",
  }),
  Object.freeze({
    silenceMs: 900,
    typingMs: 700,
    text: 'There’s no wrong answer here — I just want to see how you think.',
  }),
]);

const FINAL_SILENCE_MS = 700;

export function createMeetTutoScene() {
  let containerRef = null;
  let transcriptEl = null;
  let ctaEl = null;
  let timers = [];
  let onReadyCallback = null;

  function schedule(fn, delay) {
    const timer = setTimeout(fn, delay);
    timers.push(timer);
    return timer;
  }

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  function appendBubble(text) {
    const bubble = document.createElement('div');
    bubble.className = 'ds-bubble';
    const p = document.createElement('p');
    p.className = 'ds-bubble-text';
    p.textContent = text;
    bubble.appendChild(p);
    transcriptEl.appendChild(bubble);
    return bubble;
  }

  function appendTyping() {
    const typing = document.createElement('div');
    typing.className = 'ds-bubble ds-typing';
    typing.setAttribute('aria-hidden', 'true');
    typing.innerHTML = '<span></span><span></span><span></span>';
    transcriptEl.appendChild(typing);
    return typing;
  }

  function playBeat(index) {
    if (index >= BEATS.length) {
      schedule(revealCta, FINAL_SILENCE_MS);
      return;
    }

    const beat = BEATS[index];
    schedule(() => {
      const typingEl = appendTyping();
      schedule(() => {
        typingEl.remove();
        appendBubble(beat.text);
        playBeat(index + 1);
      }, beat.typingMs);
    }, beat.silenceMs);
  }

  function revealCta() {
    if (ctaEl) ctaEl.classList.remove('ds-hidden');
  }

  function render(ctx) {
    containerRef.innerHTML = '';
    onReadyCallback = typeof ctx?.onReady === 'function' ? ctx.onReady : null;

    const wrapper = document.createElement('div');
    wrapper.className = 'ds-scene ds-scene--meet-tuto';
    wrapper.innerHTML = `
      <div class="ds-avatar" aria-hidden="true"></div>
      <div class="ds-transcript" role="log" aria-live="polite"></div>
      <button type="button" class="ds-cta ds-hidden">I'm ready</button>
    `;
    containerRef.appendChild(wrapper);

    wrapper.querySelector('.ds-avatar').innerHTML = getTutoSVG(120);
    transcriptEl = wrapper.querySelector('.ds-transcript');
    ctaEl = wrapper.querySelector('.ds-cta');
    ctaEl.addEventListener('click', () => {
      if (onReadyCallback) onReadyCallback();
    });
  }

  return createScene({
    id: SCENE_ID,

    mount(ctx) {
      containerRef = ctx.container;
      render(ctx);
      playBeat(0);
    },

    unmount() {
      clearTimers();
      if (containerRef) containerRef.innerHTML = '';
      containerRef = null;
      transcriptEl = null;
      ctaEl = null;
      onReadyCallback = null;
    },
  });
}

export const meetTutoScene = createMeetTutoScene();
