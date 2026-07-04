// ============================================================
// meetTuto.js — Discovery Session, Scene 1: "First Light"
// ============================================================
// Experience-layer only. Same contract as every scene: mount(ctx),
// unmount(), and a single ctx.onReady(payload) when the learner
// crosses the threshold. No state machine, adaptive engine, or
// Learning Brain contact. The caller owns the once-in-a-lifetime rule
// (Founder Override 5): this scene is stateless and must simply never
// be mounted again after the first completion.
//
// v5 — First Light + the ask (Founder Correction). The learner acts
// first: the scene opens under a warm honey veil (Override 1: warm,
// never dark) with one breathing ember and a whisper. Their touch is
// T0: light blooms outward from their own contact point, Tuto
// condenses out of it, glances at where they touched, blinks, and
// says hello. He introduces himself, then asks the scene's one real
// question — "what should I call you?" — and a conversational reply
// bubble appears: the learner's half of the conversation, not a form
// field. Tuto answers using the name they chose, and only then does
// the aura shed the orb that ends the scene. Taking the orb fires
// onReady({ preferredName }) exactly once; the caller persists the
// name (Learning Brain identity) and never mounts this scene again.
//
// Founder Overrides honored:
//   2. Sound is optional — a single warm WebAudio tone, gesture-
//      unlocked, wrapped so its absence changes nothing.
//   3. Haptics are progressive enhancement (navigator.vibrate probe).
//   4. Input parity — ember, reply (a real <form> with a labeled
//      input and submit button), and orb all have native semantics
//      for mouse/touch/keyboard/AT; focus is managed ember → reply
//      input → orb; typing requires explicit confirmation (Founder
//      Decision 5), never auto-advance.
//
// Copy rules unchanged: no test/exam/score/grade/difficulty/
// algorithm/confidence anywhere.

import { createScene } from './sceneDescriptor.js';
import { getTutoSVG } from '../../auth-ui.js';

const SCENE_ID = 'meet-tuto';

// Tuto doesn't know the learner's name yet — asking for it *is* the
// scene's first real conversation, so the intro is nameless by
// design. The "Oh—" is deliberate: a tiny catch of surprise reads as
// "he was actually waiting", where scripted perfection reads as a
// kiosk.
const INTRO_LINES = Object.freeze(['Oh— hello.', "I'm Tuto."]);
const QUESTION = 'Before we continue… what should I call you?';
const responseFor = name => `${name} — it's really good to meet you.`;

const NAME_MAX_LENGTH = 30;

// Every duration in the scene, in one place (and exported for tests).
// T0 = the learner's wake touch. See the design doc's timeline table.
export const SCENE_TIMINGS = Object.freeze({
  veilLiftMs: 700, // bloom + veil fade
  condenseDelayMs: 400, // Tuto starts forming while the bloom is still travelling
  gazeAtMs: 1400, // after 350ms of deliberate stillness
  gazeRecenterMs: 1640,
  blinkAtMs: 1840,
  firstLineAtMs: 1900,
  lineHoldMs: 1700, // how long a line owns the screen before auto-advance
  lineDissolveMs: 600,
  advanceGuardMs: 350, // inputs this soon after a line lands don't skip it
  replyRevealDelayMs: 400, // the reply bubble condenses just after the question
  thinkingMs: 700, // Tuto takes the name in before answering with it
  orbReleaseGapMs: 300, // pause between the last mote and the orb detaching
  orbDescentMs: 900,
  orbLabelDelayMs: 800, // curiosity first, clarity just after
});

// Fixed mote offsets (x px, drift px) so dissolution renders
// identically every run — no randomness in the scene's own motion.
const MOTE_OFFSETS = Object.freeze([
  { x: -64, drift: -34 },
  { x: -28, drift: -46 },
  { x: 0, drift: -40 },
  { x: 30, drift: -50 },
  { x: 62, drift: -36 },
]);

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

// Override 2: sound is a grace note, never a dependency. A single
// warm tone (sine, ~220Hz, faint, 900ms) synthesized on the wake
// gesture — the one moment browsers permit audio. Pitch varies ±3
// cents per play so no two phones chime identically. Any failure or
// absence of WebAudio is silence, by design.
function playWakeTone() {
  try {
    const AudioContextImpl = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextImpl) return null;
    const ctx = new AudioContextImpl();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 220;
    osc.detune.value = (Math.random() * 6) - 3;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.95);
    return ctx;
  } catch {
    return null;
  }
}

// Override 3: haptics as progressive enhancement — one soft tap at
// contact, nothing anywhere else, no plugin dependency.
function pulseHaptic() {
  try {
    navigator.vibrate?.(12);
  } catch {
    /* absence is fine */
  }
}

export function createMeetTutoScene() {
  let containerRef = null;
  let wrapperEl = null;
  let veilEl = null;
  let emberEl = null;
  let stageEl = null;
  let avatarEl = null;
  let transcriptEl = null;
  let replyEl = null;
  let replyInputEl = null;
  let orbEl = null;
  let timers = [];
  let onReadyCallback = null;
  let audioCtx = null;

  // Scene phases:
  // 'veiled' → 'waking' → 'exchange' (intro) → 'asking' → 'thinking'
  //          → 'exchange' (response) → 'orb' → done.
  let phase = 'veiled';
  let currentLineEl = null;
  let nextAction = null; // what dissolving the current line leads to
  let advanceGuard = false; // a fresh line always gets a moment to land
  let advanceTimer = null;
  let preferredName = '';
  let readyFired = false;

  function schedule(fn, delay) {
    const timer = setTimeout(fn, delay);
    timers.push(timer);
    return timer;
  }

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
    advanceTimer = null;
  }

  // ---------- gaze & blink (pupils addressed without touching auth-ui) ----------

  function tagEyes() {
    if (!avatarEl) return;
    avatarEl.querySelectorAll('circle[fill="#2c3e50"]').forEach(c => c.classList.add('ds-pupil', 'ds-eye'));
    avatarEl.querySelectorAll('circle[fill="white"]').forEach(c => c.classList.add('ds-eye'));
  }

  function gazeToward(clientX, clientY) {
    if (!avatarEl || prefersReducedMotion()) return;
    const rect = avatarEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const mag = Math.hypot(dx, dy) || 1;
    // Max 5 viewBox units of pupil travel — a glance, not a stare.
    avatarEl.style.setProperty('--ds-gx', `${(dx / mag) * 5}px`);
    avatarEl.style.setProperty('--ds-gy', `${(dy / mag) * 5}px`);
  }

  function gazeCenter() {
    if (!avatarEl) return;
    avatarEl.style.setProperty('--ds-gx', '0px');
    avatarEl.style.setProperty('--ds-gy', '0px');
  }

  function blinkOnce() {
    if (!avatarEl || prefersReducedMotion()) return;
    avatarEl.querySelectorAll('.ds-eye').forEach(eye => {
      eye.classList.remove('ds-eye--blink');
      void eye.getBoundingClientRect();
      eye.classList.add('ds-eye--blink');
    });
    schedule(() => {
      avatarEl?.querySelectorAll('.ds-eye').forEach(eye => eye.classList.remove('ds-eye--blink'));
    }, 300);
  }

  // ---------- the wake (T0) ----------

  function wake(clientX, clientY) {
    if (phase !== 'veiled') return;
    phase = 'waking';

    const sceneRect = wrapperEl.getBoundingClientRect();
    const hasPoint = Number.isFinite(clientX) && Number.isFinite(clientY);
    // Keyboard/AT wake blooms from the ember itself — their "touch"
    // is the ember they activated.
    const emberRect = emberEl.getBoundingClientRect();
    const x = hasPoint ? clientX : emberRect.left + emberRect.width / 2;
    const y = hasPoint ? clientY : emberRect.top + emberRect.height / 2;

    // The bloom is centered on the learner's own contact point —
    // every user's dawn is geometrically theirs.
    wrapperEl.style.setProperty('--ds-wake-x', `${x - sceneRect.left}px`);
    wrapperEl.style.setProperty('--ds-wake-y', `${y - sceneRect.top}px`);

    audioCtx = playWakeTone();
    pulseHaptic();

    emberEl.disabled = true;
    veilEl.classList.add('ds-veil--lifting');
    wrapperEl.classList.add('ds-scene--waking');
    schedule(() => {
      veilEl.classList.add('ds-veil--gone');
    }, SCENE_TIMINGS.veilLiftMs);

    schedule(() => {
      stageEl.classList.remove('ds-stage--veiled');
      stageEl.classList.add('ds-stage--condense');
    }, SCENE_TIMINGS.condenseDelayMs);

    // Recognition: he looks at where you touched, then at you, then
    // one slow blink. The 350ms of stillness before this is the
    // point — presence before performance.
    schedule(() => gazeToward(x, y), SCENE_TIMINGS.gazeAtMs);
    schedule(gazeCenter, SCENE_TIMINGS.gazeRecenterMs);
    schedule(blinkOnce, SCENE_TIMINGS.blinkAtMs);

    schedule(() => {
      phase = 'exchange';
      showLine(INTRO_LINES[0], () => {
        showLine(INTRO_LINES[1], askName);
      });
    }, SCENE_TIMINGS.firstLineAtMs);
  }

  // ---------- the exchange ----------

  // Shows one focal line. `next` is what dissolving it leads to; a
  // line with no `next` (the question) holds the screen until the
  // learner acts — it cannot be skipped past.
  function showLine(text, next, { hold = SCENE_TIMINGS.lineHoldMs } = {}) {
    wrapperEl.classList.remove('ds-scene--thinking');

    const line = document.createElement('p');
    line.className = 'ds-line';
    line.textContent = text;
    transcriptEl.appendChild(line);
    currentLineEl = line;
    nextAction = next || null;

    advanceGuard = true;
    schedule(() => {
      advanceGuard = false;
    }, SCENE_TIMINGS.advanceGuardMs);

    if (next) {
      advanceTimer = schedule(advance, hold);
    }
  }

  // Spent lines dissolve upward into motes — the conversation becomes
  // the air of the room. (Scene-1-only exception to stacked history,
  // approved via the design review.)
  function dissolveCurrentLine(onDone) {
    const line = currentLineEl;
    currentLineEl = null;
    if (!line) {
      onDone();
      return;
    }

    line.classList.add('ds-line--dissolve');
    const rect = line.getBoundingClientRect();
    const sceneRect = wrapperEl.getBoundingClientRect();
    MOTE_OFFSETS.forEach(({ x, drift }) => {
      const mote = document.createElement('span');
      mote.className = 'ds-mote';
      mote.style.left = `${rect.left - sceneRect.left + rect.width / 2 + x}px`;
      mote.style.top = `${rect.top - sceneRect.top + rect.height / 2}px`;
      mote.style.setProperty('--ds-mote-drift', `${drift}px`);
      wrapperEl.appendChild(mote);
    });

    schedule(() => {
      line.remove();
      wrapperEl.querySelectorAll('.ds-mote').forEach(m => m.remove());
      onDone();
    }, SCENE_TIMINGS.lineDissolveMs);
  }

  function advance() {
    if (phase !== 'exchange' || !currentLineEl || !nextAction) return;
    if (advanceTimer) {
      clearTimeout(advanceTimer);
      advanceTimer = null;
    }
    const action = nextAction;
    nextAction = null;
    // Between beats Tuto "thinks": the aura he was given dims a
    // breath — thought expressed in the character, never in dots.
    wrapperEl.classList.add('ds-scene--thinking');
    dissolveCurrentLine(action);
  }

  // Impatience is obeyed, never punished: any input during the intro
  // advances it (with a short guard so a line always gets a moment to
  // land). During the wake it becomes play instead — Tuto's gaze
  // flicks to each tap. During the ask, the reply owns all input.
  function handleSceneInput(event) {
    if (phase === 'waking') {
      if (Number.isFinite(event.clientX)) gazeToward(event.clientX, event.clientY);
      return;
    }
    if (phase !== 'exchange' || advanceGuard) return;
    advance();
  }

  function handleSceneKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (phase === 'exchange') {
      event.preventDefault();
      if (advanceGuard) return;
      advance();
    }
  }

  // ---------- the ask ----------

  function askName() {
    phase = 'asking';
    showLine(QUESTION, null); // holds until the learner replies
    schedule(() => {
      replyEl.classList.remove('ds-hidden');
      replyEl.classList.add('ds-reply--reveal');
      // The learner's turn to speak: hand them the floor.
      replyInputEl.focus({ preventScroll: true });
    }, SCENE_TIMINGS.replyRevealDelayMs);
  }

  function submitReply(event) {
    event.preventDefault();
    if (phase !== 'asking') return;

    const name = replyInputEl.value.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX_LENGTH);
    if (!name) {
      // Nothing scolds, nothing turns red — the bubble just sways,
      // like a held-out hand still waiting.
      replyEl.classList.remove('ds-reply--sway');
      void replyEl.getBoundingClientRect();
      replyEl.classList.add('ds-reply--sway');
      replyInputEl.focus({ preventScroll: true });
      return;
    }

    preferredName = name;
    phase = 'thinking';
    replyInputEl.blur(); // lets the mobile keyboard fall away with the bubble
    replyEl.classList.add('ds-reply--dissolve');
    wrapperEl.classList.add('ds-scene--thinking');

    schedule(() => {
      replyEl.classList.add('ds-hidden');
    }, SCENE_TIMINGS.lineDissolveMs);

    // The question dissolves with the reply; Tuto takes the name in
    // for a breath, then answers with it.
    dissolveCurrentLine(() => {
      schedule(() => {
        phase = 'exchange';
        showLine(responseFor(preferredName), () => schedule(releaseOrb, SCENE_TIMINGS.orbReleaseGapMs));
      }, SCENE_TIMINGS.thinkingMs);
    });
  }

  // ---------- the threshold ----------

  function releaseOrb() {
    phase = 'orb';
    orbEl.classList.remove('ds-hidden');
    orbEl.classList.add('ds-orb--arriving');
    schedule(() => {
      orbEl.classList.add('ds-orb--settled');
      // Focus moves to the threshold so Enter works and AT announces
      // it — the keyboard user's orb arrives exactly like the touch
      // user's.
      orbEl.focus({ preventScroll: true });
    }, SCENE_TIMINGS.orbDescentMs);
    schedule(() => {
      orbEl.classList.add('ds-orb--labeled');
    }, SCENE_TIMINGS.orbDescentMs + SCENE_TIMINGS.orbLabelDelayMs);
  }

  function takeTheLight() {
    if (readyFired) return;
    readyFired = true;
    orbEl.classList.add('ds-orb--taken');
    // The caller persists the chosen name (Learning Brain identity)
    // and uses it from Scene 2 onward.
    if (onReadyCallback) onReadyCallback({ preferredName });
  }

  // ---------- render ----------

  function render(ctx) {
    containerRef.innerHTML = '';
    onReadyCallback = typeof ctx?.onReady === 'function' ? ctx.onReady : null;

    const wrapper = document.createElement('div');
    wrapper.className = 'ds-scene ds-scene--meet-tuto';
    wrapper.innerHTML = `
      <div class="ds-vignette" aria-hidden="true"></div>
      <div class="ds-stage ds-stage--veiled">
        <div class="ds-aura" aria-hidden="true"></div>
        <div class="ds-avatar" aria-hidden="true"></div>
      </div>
      <div class="ds-transcript" role="log" aria-live="polite"></div>
      <form class="ds-reply ds-hidden">
        <input
          class="ds-reply-input"
          type="text"
          maxlength="${NAME_MAX_LENGTH}"
          placeholder="your name"
          autocomplete="off"
          autocapitalize="words"
          spellcheck="false"
          aria-label="What should I call you?"
        />
        <button type="submit" class="ds-reply-send" aria-label="Tell Tuto"></button>
      </form>
      <button type="button" class="ds-orb ds-hidden">
        <span class="ds-orb-label">Begin</span>
      </button>
      <div class="ds-veil">
        <button type="button" class="ds-ember" aria-label="Tuto is waiting. Press to say hello."></button>
        <p class="ds-whisper" aria-hidden="true">touch the light</p>
      </div>
    `;
    containerRef.appendChild(wrapper);
    wrapperEl = wrapper;

    veilEl = wrapper.querySelector('.ds-veil');
    emberEl = wrapper.querySelector('.ds-ember');
    stageEl = wrapper.querySelector('.ds-stage');
    avatarEl = wrapper.querySelector('.ds-avatar');
    transcriptEl = wrapper.querySelector('.ds-transcript');
    replyEl = wrapper.querySelector('.ds-reply');
    replyInputEl = wrapper.querySelector('.ds-reply-input');
    orbEl = wrapper.querySelector('.ds-orb');

    avatarEl.innerHTML = getTutoSVG(192);
    tagEyes();

    // Wake paths (Override 4 — full input parity):
    //  - pointer: any press on the veil blooms from that exact point
    //  - the ember is a real button: click/Enter/Space/AT activation
    //  - Enter/Space anywhere on the veil also wakes (belt-and-braces)
    veilEl.addEventListener('pointerdown', e => wake(e.clientX, e.clientY));
    emberEl.addEventListener('click', e => wake(e.clientX, e.clientY));
    veilEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        wake();
      }
    });

    wrapper.addEventListener('pointerdown', handleSceneInput);
    wrapper.addEventListener('keydown', handleSceneKeydown);
    replyEl.addEventListener('submit', submitReply);
    orbEl.addEventListener('click', takeTheLight);

    // The whisper waits one half-breath (2.4s, CSS-delayed); the
    // ember simply breathes until the learner is ready. The learner
    // owns the first beat — there is no timeout and no autoplay.
    emberEl.focus({ preventScroll: true });
  }

  return createScene({
    id: SCENE_ID,

    mount(ctx) {
      containerRef = ctx.container;
      phase = 'veiled';
      currentLineEl = null;
      nextAction = null;
      advanceGuard = false;
      preferredName = '';
      readyFired = false;
      render(ctx);
    },

    unmount() {
      clearTimers();
      try {
        audioCtx?.close?.();
      } catch {
        /* already closed */
      }
      audioCtx = null;
      if (containerRef) containerRef.innerHTML = '';
      containerRef = null;
      wrapperEl = null;
      veilEl = null;
      emberEl = null;
      stageEl = null;
      avatarEl = null;
      transcriptEl = null;
      replyEl = null;
      replyInputEl = null;
      orbEl = null;
      currentLineEl = null;
      nextAction = null;
      onReadyCallback = null;
      phase = 'veiled';
    },
  });
}

export const meetTutoScene = createMeetTutoScene();
