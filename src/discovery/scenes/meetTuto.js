// ============================================================
// meetTuto.js — Discovery Session, Scene 1: Meet Tuto
// ============================================================
// Experience-layer only. This scene renders before the adaptive
// engine asks anything — it exists to make the learner feel like
// they've just met Tuto, not opened a chat widget or a form.
//
// Redesign notes (v2 — cinematic pass): the first cut rendered this
// as a stacked chat transcript (card bubbles, compact spacing). That
// read as a UI sequence, not a meeting. This version makes Tuto the
// visual hero (larger, lit by a breathing aura), drops the chat-card
// chrome in favor of large type set directly on an atmospheric
// backdrop, and lets only the current line hold full attention while
// earlier lines recede (dimmed + shrunk, never removed — history
// stays visible per the Founder Decisions, it just stops competing
// for focus). Copy is broken into short, weighted beats rather than
// full sentences, with a longer opening silence before Tuto says
// anything at all, so the first thing the learner perceives is
// presence, not text.
//
// Per the Conversation Experience Specification and the Founder
// Decisions: no "test/exam/score/grade/difficulty/algorithm/
// confidence" language anywhere in this file's copy; Tuto's presence
// persists on screen for the entire scene; the scene ends on an
// explicit confirmation (tap), never an auto-advance, since it is the
// threshold into the session itself.
//
// This scene does not touch the Engineering Specification's state
// machine, adaptive algorithm, or Learning Brain integration — it
// only calls ctx.onReady() once, when the learner taps through, and
// leaves what happens next entirely to the (unchanged) caller.

import { createScene } from './sceneDescriptor.js';
import { getTutoSVG } from '../../auth-ui.js';

const SCENE_ID = 'meet-tuto';

// The opening silence is deliberately long: nothing is said until
// Tuto has simply been present — breathing, lit — for a beat. Every
// beat after that: a silence, then a typing beat, then the line
// lands. Gaps are uneven on purpose so the rhythm doesn't read as a
// metronome, and the longest pause (before beat 3) sits under the
// most personal line.
const BEATS = Object.freeze([
  Object.freeze({ silenceMs: 1100, typingMs: 650, text: 'Hi.' }),
  Object.freeze({ silenceMs: 650, typingMs: 550, text: "I'm Tuto." }),
  Object.freeze({
    silenceMs: 950,
    typingMs: 750,
    text: "I'll be with you for this whole session.",
  }),
  Object.freeze({
    silenceMs: 1000,
    typingMs: 700,
    text: 'There’s no wrong answer here — I just want to see how you think.',
  }),
]);

const FINAL_SILENCE_MS = 900;

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

  function recedeExistingLines() {
    transcriptEl.querySelectorAll('.ds-line--current').forEach(line => {
      line.classList.remove('ds-line--current');
      line.classList.add('ds-line--past');
    });
  }

  function appendLine(text) {
    recedeExistingLines();
    const line = document.createElement('p');
    line.className = 'ds-line ds-line--current';
    line.textContent = text;
    transcriptEl.appendChild(line);
    return line;
  }

  function appendTyping() {
    const typing = document.createElement('div');
    typing.className = 'ds-typing';
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
        appendLine(beat.text);
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
      <div class="ds-stage">
        <div class="ds-aura" aria-hidden="true"></div>
        <div class="ds-avatar" aria-hidden="true"></div>
      </div>
      <div class="ds-transcript" role="log" aria-live="polite"></div>
      <button type="button" class="ds-cta ds-hidden">I'm ready</button>
    `;
    containerRef.appendChild(wrapper);

    wrapper.querySelector('.ds-avatar').innerHTML = getTutoSVG(176);
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
