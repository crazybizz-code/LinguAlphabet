// ============================================================
// selfLevelReflection.js — Discovery Session, Scene 2: Self Level
// Reflection ("Where do you think your English is today?")
// ============================================================
// Experience-layer only. Same contract as every scene: mount(ctx),
// unmount(), and a single ctx.onReady(payload). No state machine,
// adaptive engine, or Learning Brain contact — this scene only reads
// ctx.initialData.preferredName (the payload Scene 1 handed the
// caller) and hands its own payload, { selfAssessedLevel }, forward
// the same way.
//
// This scene continues the conversation Scene 1 started rather than
// opening a new one: Tuto is already awake, so there is no veil, no
// ember, no wake bloom — that ritual is a one-time "first light"
// event and does not repeat (Founder Principle v1.4 is about
// reviewing every scene at four breakpoints; this note is about not
// re-running the wake itself). The stage simply condenses in — the
// same "arrival" motion Scene 1 uses for Tuto's entrance — and the
// exchange continues in single focal lines, per Scene 1's motion law:
// everything breathes, entrances condense, exits dissolve.
//
// The self-assessment itself is a set of real <button role="radio">
// cards (a native radiogroup, not a form), which is the premium/
// responsive surface this scene adds to Scene 1's vocabulary — the
// reply bubble was right for a name, but wrong for a six-way choice.
// Selecting a card auto-advances (Founder Decision 5: selections may
// auto-advance; only typed replies require explicit confirmation).
// Copy is explicit that this is a self-guess, not the real answer:
// the upcoming Discovery Session is what actually finds the level.
//
// Copy rules unchanged: no test/exam/score/grade/difficulty/
// algorithm/confidence anywhere.

import { createScene } from './sceneDescriptor.js';
import { getTutoSVG } from '../../auth-ui.js';

const SCENE_ID = 'self-level-reflection';

const QUESTION = 'Where do you think your English is today?';
const REASSURANCE =
  "Just a starting point — the Discovery Session will find your real level as we go.";
const reactionFor = code => `${code} — got it. Let's find out together.`;

const LEVELS = Object.freeze([
  Object.freeze({ code: 'A1', label: 'Just starting out' }),
  Object.freeze({ code: 'A2', label: 'Building the basics' }),
  Object.freeze({ code: 'B1', label: 'Comfortable enough' }),
  Object.freeze({ code: 'B2', label: 'Confident day-to-day' }),
  Object.freeze({ code: 'C1', label: 'Advanced' }),
  Object.freeze({ code: 'C2', label: 'Near native' }),
]);

// Every duration in the scene, in one place (and exported for tests).
// T0 = mount. See docs/scene1-first-light-design.md for the sibling
// timeline this one continues.
export const SCENE_TIMINGS = Object.freeze({
  entranceMs: 500, // Tuto condenses in — quieter than Scene 1's wake condense
  firstLineAtMs: 500,
  lineHoldMs: 1300,
  lineDissolveMs: 600,
  advanceGuardMs: 350,
  gridRevealDelayMs: 400, // cards condense in just after the question lands
  selectionHoldMs: 550, // the chosen card is visibly selected before advancing
  thinkingMs: 700, // Tuto takes the choice in before reacting to it
  orbReleaseGapMs: 300,
  orbDescentMs: 900,
  orbLabelDelayMs: 800,
});

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function createSelfLevelReflectionScene() {
  let containerRef = null;
  let wrapperEl = null;
  let avatarEl = null;
  let transcriptEl = null;
  let gridEl = null;
  let reassuranceEl = null;
  let orbEl = null;
  let timers = [];
  let onReadyCallback = null;

  // Phases: 'entering' → 'exchange' (bridge line) → 'choosing'
  //       → 'selected' → 'exchange' (reaction) → 'orb' → done.
  let phase = 'entering';
  let currentLineEl = null;
  let nextAction = null;
  let advanceGuard = false;
  let advanceTimer = null;
  let selectedLevel = null;
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

  function scheduleIdleBlink() {
    if (prefersReducedMotion()) return;
    const delay = 3000 + Math.random() * 3000;
    schedule(() => {
      avatarEl?.querySelectorAll('.ds-eye').forEach(eye => {
        eye.classList.remove('ds-eye--blink');
        void eye.getBoundingClientRect();
        eye.classList.add('ds-eye--blink');
      });
      schedule(() => {
        avatarEl?.querySelectorAll('.ds-eye').forEach(eye => eye.classList.remove('ds-eye--blink'));
      }, 300);
      scheduleIdleBlink();
    }, delay);
  }

  // ---------- the exchange (shared with Scene 1's convention) ----------

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

  function dissolveCurrentLine(onDone) {
    const line = currentLineEl;
    currentLineEl = null;
    if (!line) {
      onDone();
      return;
    }
    line.classList.add('ds-line--dissolve');
    schedule(() => {
      line.remove();
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
    wrapperEl.classList.add('ds-scene--thinking');
    dissolveCurrentLine(action);
  }

  function handleSceneInput() {
    if (phase !== 'exchange' || advanceGuard) return;
    advance();
  }

  function handleSceneKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (phase === 'exchange') {
      if (advanceGuard) return;
      advance();
    }
  }

  // ---------- the self-assessment ----------

  function askLevel() {
    phase = 'choosing';
    showLine(QUESTION, null); // holds until a card is chosen — cannot be skipped
    schedule(() => {
      gridEl.classList.remove('ds-hidden');
      gridEl.classList.add('ds-panel--reveal');
      reassuranceEl.classList.remove('ds-hidden');
      reassuranceEl.classList.add('ds-panel--reveal');
      gridEl.querySelector('.ds-level-card')?.focus({ preventScroll: true });
    }, SCENE_TIMINGS.gridRevealDelayMs);
  }

  function selectLevel(code, cardEl) {
    if (phase !== 'choosing') return;
    phase = 'selected';
    selectedLevel = code;

    gridEl.querySelectorAll('.ds-level-card').forEach(btn => {
      btn.setAttribute('aria-checked', btn === cardEl ? 'true' : 'false');
      btn.disabled = true;
    });
    cardEl.classList.add('ds-level-card--selected');

    schedule(() => {
      gridEl.classList.add('ds-panel--dissolve');
      reassuranceEl.classList.add('ds-panel--dissolve');
      wrapperEl.classList.add('ds-scene--thinking');

      schedule(() => {
        gridEl.classList.add('ds-hidden');
        reassuranceEl.classList.add('ds-hidden');
      }, SCENE_TIMINGS.lineDissolveMs);

      dissolveCurrentLine(() => {
        schedule(() => {
          phase = 'exchange';
          showLine(reactionFor(code), () => schedule(releaseOrb, SCENE_TIMINGS.orbReleaseGapMs));
        }, SCENE_TIMINGS.thinkingMs);
      });
    }, SCENE_TIMINGS.selectionHoldMs);
  }

  // ---------- the threshold (identical mechanic to Scene 1's orb) ----------

  function releaseOrb() {
    phase = 'orb';
    orbEl.classList.remove('ds-hidden');
    orbEl.classList.add('ds-orb--arriving');
    schedule(() => {
      orbEl.classList.add('ds-orb--settled');
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
    if (onReadyCallback) onReadyCallback({ selfAssessedLevel: selectedLevel });
  }

  // ---------- render ----------

  function render(ctx) {
    containerRef.innerHTML = '';
    onReadyCallback = typeof ctx?.onReady === 'function' ? ctx.onReady : null;
    const preferredName = ctx?.initialData?.preferredName?.trim() || '';

    const wrapper = document.createElement('div');
    wrapper.className = 'ds-scene ds-scene--self-level';
    wrapper.innerHTML = `
      <div class="ds-vignette" aria-hidden="true"></div>
      <div class="ds-stage ds-stage--condense">
        <div class="ds-aura" aria-hidden="true"></div>
        <div class="ds-avatar" aria-hidden="true"></div>
      </div>
      <div class="ds-transcript" role="log" aria-live="polite"></div>
      <div class="ds-level-grid ds-hidden" role="radiogroup" aria-label="${QUESTION}">
        ${LEVELS.map(
          l => `<button type="button" class="ds-level-card" role="radio" aria-checked="false" data-code="${l.code}">
            <span class="ds-level-code">${l.code}</span>
            <span class="ds-level-label">${l.label}</span>
          </button>`
        ).join('')}
      </div>
      <p class="ds-reassurance ds-hidden">${REASSURANCE}</p>
      <button type="button" class="ds-orb ds-hidden">
        <span class="ds-orb-label">Continue</span>
      </button>
    `;
    containerRef.appendChild(wrapper);
    wrapperEl = wrapper;

    avatarEl = wrapper.querySelector('.ds-avatar');
    transcriptEl = wrapper.querySelector('.ds-transcript');
    gridEl = wrapper.querySelector('.ds-level-grid');
    reassuranceEl = wrapper.querySelector('.ds-reassurance');
    orbEl = wrapper.querySelector('.ds-orb');

    avatarEl.innerHTML = getTutoSVG(192);
    avatarEl.querySelectorAll('circle[fill="#2c3e50"]').forEach(c => c.classList.add('ds-pupil', 'ds-eye'));
    avatarEl.querySelectorAll('circle[fill="white"]').forEach(c => c.classList.add('ds-eye'));

    gridEl.querySelectorAll('.ds-level-card').forEach(card => {
      card.addEventListener('click', () => selectLevel(card.dataset.code, card));
    });

    wrapper.addEventListener('pointerdown', handleSceneInput);
    wrapper.addEventListener('keydown', handleSceneKeydown);
    orbEl.addEventListener('click', takeTheLight);

    schedule(() => {
      phase = 'exchange';
      const bridge = preferredName ? `Alright, ${preferredName}.` : 'Alright.';
      showLine(bridge, askLevel);
    }, SCENE_TIMINGS.firstLineAtMs);

    schedule(scheduleIdleBlink, SCENE_TIMINGS.entranceMs);
  }

  return createScene({
    id: SCENE_ID,

    mount(ctx) {
      containerRef = ctx.container;
      phase = 'entering';
      currentLineEl = null;
      nextAction = null;
      advanceGuard = false;
      selectedLevel = null;
      readyFired = false;
      render(ctx);
    },

    unmount() {
      clearTimers();
      if (containerRef) containerRef.innerHTML = '';
      containerRef = null;
      wrapperEl = null;
      avatarEl = null;
      transcriptEl = null;
      gridEl = null;
      reassuranceEl = null;
      orbEl = null;
      currentLineEl = null;
      nextAction = null;
      onReadyCallback = null;
      phase = 'entering';
    },
  });
}

export const selfLevelReflectionScene = createSelfLevelReflectionScene();
