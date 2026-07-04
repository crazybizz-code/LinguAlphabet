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
// event and does not repeat. The stage simply condenses in — the same
// "arrival" motion Scene 1 uses for Tuto's entrance — and the exchange
// continues in single focal lines, per Scene 1's motion law:
// everything breathes, entrances condense, exits dissolve.
//
// v2 — production pass to match the approved reference design: a
// minimal brand header (reusing the app's existing logo mark) and a
// "why do we ask" disclosure sit above the conversation; small
// sparkle motes accompany Tuto's breathing aura; the self-assessment
// is seven real <button role="radio"> cards (six CEFR levels plus an
// explicit "I'm not sure") styled as premium mountain-flag cards, not
// a form. Selecting a card auto-advances (Founder Decision 5:
// selections may auto-advance; only typed replies require explicit
// confirmation). Copy stays explicit that this is a self-guess, not
// the real answer — the Discovery Session is what actually finds it.
//
// Copy rules unchanged: no test/exam/score/grade/difficulty/
// algorithm/confidence anywhere.

import { createScene } from './sceneDescriptor.js';
import { getTutoSVG } from '../../auth-ui.js';

const SCENE_ID = 'self-level-reflection';

const QUESTION = 'Where do you think your English is today?';
const SUBHEADING = 'Be honest with yourself — this helps Tuto personalize your learning journey.';
const REASSURANCE = "No pressure — the Discovery Session will find your real level as we go.";
const WHY_WE_ASK =
  "Knowing where you think you are helps Tuto start in the right place. The Discovery Session fine-tunes it from there.";
const reactionFor = code => `${code} — got it. Let's find out together.`;
const UNSURE_REACTION = "That's alright — we'll figure it out together.";

// Each level carries its own color (a violet ramp, pale → deep — the
// progression signal) and its own icon complexity (peak count grows
// 1 → 2 → 3, and the tallest peak grows with it, C1/C2 alone earning
// a snow-capped summit). A1 and C2 must not look like the same card
// wearing a different label — this is how that's true even before
// reading either one.
const LEVELS = Object.freeze([
  Object.freeze({ code: 'A1', label: 'Just starting out', accent: '#D7CFF0', peaks: 1, scale: 0.62, snow: false }),
  Object.freeze({ code: 'A2', label: 'Building the basics', accent: '#C3B6E8', peaks: 1, scale: 0.76, snow: false }),
  Object.freeze({ code: 'B1', label: 'Comfortable enough', accent: '#A996DD', peaks: 2, scale: 0.86, snow: false }),
  Object.freeze({ code: 'B2', label: 'Confident day-to-day', accent: '#9680D2', peaks: 2, scale: 0.94, snow: false }),
  Object.freeze({ code: 'C1', label: 'Advanced', accent: '#7C63C4', peaks: 3, scale: 1.0, snow: true }),
  Object.freeze({ code: 'C2', label: 'Near native', accent: '#6449B5', peaks: 3, scale: 1.1, snow: true }),
]);

// A mountain-range mark that visually grows with the level: one modest
// peak for A1/A2, two for B1/B2, a full range with a snow-capped
// summit for C1/C2. Peaks past the first are rendered dimmer (behind
// the tallest) for depth. Scale and color come from LEVELS above, so
// there is one template, not six near-duplicate hand-authored icons.
function levelIcon({ peaks, snow }) {
  const backPeaks =
    peaks >= 2
      ? `<path d="M2 24L9 13l5 6.5H2z" fill="currentColor" opacity="0.45"/>`
      : '';
  const rightPeak =
    peaks >= 3
      ? `<path d="M24 24L30 15l4 9H24z" fill="currentColor" opacity="0.6"/>`
      : '';
  const snowCap = snow
    ? `<path d="M16 4l-3.4 6h6.8z" fill="white" opacity="0.92"/>`
    : '';
  return `
    <svg class="ds-level-icon" width="34" height="26" viewBox="0 0 34 26" fill="none" aria-hidden="true">
      ${backPeaks}
      ${rightPeak}
      <path d="M6 24L16 4l10 20H6z" fill="currentColor"/>
      ${snowCap}
      <path d="M16 4V0" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M16 0l4.5 2.1L16 4.2V0z" fill="#FF6B35"/>
    </svg>`;
}

const UNSURE_ICON = `
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <circle cx="14" cy="14" r="10.5" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 3"/>
    <text x="14" y="19" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor" font-family="inherit">?</text>
  </svg>`;

const CHECK_BADGE = `
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M3 7.2l2.7 2.8L11 4" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

// The app's existing brand mark (index.html's .auth-logo-icon), reused
// here rather than inventing new branding for this one scene.
const BRAND_ICON = `
  <svg width="26" height="26" viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <circle cx="20" cy="20" r="20" fill="#FF6B35"/>
    <path d="M12 14a8 8 0 0 1 16 0v8a8 8 0 0 1-16 0v-8z" fill="white" opacity="0.9"/>
    <circle cx="16" cy="18" r="2.5" fill="#FF6B35"/>
    <circle cx="24" cy="18" r="2.5" fill="#FF6B35"/>
  </svg>`;

// Fixed sparkle positions/delays (percent offsets within .ds-stage) so
// the motif renders identically every run — decorative only, never
// read by the phase state machine.
const SPARKLES = Object.freeze([
  { x: 12, y: 18, size: 10, delay: 0 },
  { x: 88, y: 10, size: 7, delay: 0.6 },
  { x: 92, y: 55, size: 9, delay: 1.3 },
  { x: 6, y: 62, size: 6, delay: 2 },
]);

// getTutoSVG() is shared with the frozen Scene 1 and must not change
// for everyone — but the reference design calls for a clearer, more
// dimensional Tuto here. This polishes the already-injected markup in
// place (gradient shading on the existing shapes, glossy catchlights
// on the existing pupils, a softer floor glow) rather than forking or
// redrawing the character. A per-call id suffix keeps gradient
// references collision-free when more than one instance is mounted
// at once (e.g. the factory test).
let avatarPolishSeq = 0;

function polishAvatar(avatarEl) {
  const svg = avatarEl.querySelector('svg');
  if (!svg) return;
  const uid = `ds-tuto-${avatarPolishSeq++}`;

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <radialGradient id="${uid}-shell" cx="35%" cy="30%" r="75%">
      <stop offset="0%" stop-color="#ffb98c"/>
      <stop offset="55%" stop-color="#d4865a"/>
      <stop offset="100%" stop-color="#b96a42"/>
    </radialGradient>
    <radialGradient id="${uid}-head" cx="35%" cy="28%" r="75%">
      <stop offset="0%" stop-color="#a6c9a9"/>
      <stop offset="60%" stop-color="#7a9e82"/>
      <stop offset="100%" stop-color="#5f8268"/>
    </radialGradient>
  `;
  svg.insertBefore(defs, svg.firstChild);

  const shadow = svg.querySelector('ellipse[fill="rgba(0,0,0,0.08)"]');
  shadow?.classList.add('ds-tuto-shadow');

  const shell = svg.querySelector('ellipse[fill="#d4865a"]');
  if (shell) shell.setAttribute('fill', `url(#${uid}-shell)`);

  const head = svg.querySelector('ellipse[fill="#7a9e82"]');
  if (head) head.setAttribute('fill', `url(#${uid}-head)`);

  // Glossy catchlights: a small bright dot on each pupil, offset
  // toward the same light source the gradients above imply.
  svg.querySelectorAll('circle[fill="#2c3e50"]').forEach(pupil => {
    const cx = Number(pupil.getAttribute('cx'));
    const cy = Number(pupil.getAttribute('cy'));
    const light = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    light.setAttribute('cx', cx - 2.5);
    light.setAttribute('cy', cy - 3);
    light.setAttribute('r', '2.4');
    light.setAttribute('fill', 'white');
    light.setAttribute('opacity', '0.9');
    pupil.insertAdjacentElement('afterend', light);
  });
}

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
  let subheadingEl = null;
  let gridEl = null;
  let reassuranceEl = null;
  let orbEl = null;
  let whyBtnEl = null;
  let whyPopoverEl = null;
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
  let closeWhyPopover = null;

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

  // ---------- "why do we ask" disclosure ----------

  function openWhyPopover() {
    whyPopoverEl.classList.remove('ds-hidden');
    whyBtnEl.setAttribute('aria-expanded', 'true');
    const onDocPointer = e => {
      if (!whyPopoverEl.contains(e.target) && e.target !== whyBtnEl) closeWhyPopoverNow();
    };
    const onDocKey = e => {
      if (e.key === 'Escape') closeWhyPopoverNow();
    };
    document.addEventListener('pointerdown', onDocPointer);
    document.addEventListener('keydown', onDocKey);
    closeWhyPopover = () => {
      document.removeEventListener('pointerdown', onDocPointer);
      document.removeEventListener('keydown', onDocKey);
    };
  }

  function closeWhyPopoverNow() {
    whyPopoverEl.classList.add('ds-hidden');
    whyBtnEl.setAttribute('aria-expanded', 'false');
    closeWhyPopover?.();
    closeWhyPopover = null;
  }

  function toggleWhyPopover() {
    if (whyPopoverEl.classList.contains('ds-hidden')) openWhyPopover();
    else closeWhyPopoverNow();
  }

  // ---------- the self-assessment ----------

  function askLevel() {
    phase = 'choosing';
    showLine(QUESTION, null); // holds until a card is chosen — cannot be skipped
    schedule(() => {
      subheadingEl.classList.remove('ds-hidden');
      subheadingEl.classList.add('ds-panel--reveal');
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
    selectedLevel = code === 'unsure' ? null : code;

    gridEl.querySelectorAll('.ds-level-card').forEach(btn => {
      btn.setAttribute('aria-checked', btn === cardEl ? 'true' : 'false');
      btn.disabled = true;
    });
    cardEl.classList.add('ds-level-card--selected');

    schedule(() => {
      subheadingEl.classList.add('ds-panel--dissolve');
      gridEl.classList.add('ds-panel--dissolve');
      reassuranceEl.classList.add('ds-panel--dissolve');
      wrapperEl.classList.add('ds-scene--thinking');

      schedule(() => {
        subheadingEl.classList.add('ds-hidden');
        gridEl.classList.add('ds-hidden');
        reassuranceEl.classList.add('ds-hidden');
      }, SCENE_TIMINGS.lineDissolveMs);

      dissolveCurrentLine(() => {
        schedule(() => {
          phase = 'exchange';
          const reaction = code === 'unsure' ? UNSURE_REACTION : reactionFor(code);
          showLine(reaction, () => schedule(releaseOrb, SCENE_TIMINGS.orbReleaseGapMs));
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
      <div class="ds-header">
        <div class="ds-brand">${BRAND_ICON}<span class="ds-brand-text">LinguAlphabet</span></div>
        <div class="ds-why">
          <button type="button" class="ds-why-btn" aria-expanded="false" aria-controls="ds-why-popover">
            <i class="fa-regular fa-circle-question" aria-hidden="true"></i>
            <span>Why do we ask?</span>
          </button>
          <div class="ds-why-popover ds-hidden" id="ds-why-popover" role="note">${WHY_WE_ASK}</div>
        </div>
      </div>
      <div class="ds-stage ds-stage--condense">
        <div class="ds-aura" aria-hidden="true"></div>
        <div class="ds-tuto-cloud" aria-hidden="true"></div>
        <div class="ds-sparkles" aria-hidden="true">
          ${SPARKLES.map(
            s => `<span class="ds-sparkle" style="--sx:${s.x}%;--sy:${s.y}%;--ssize:${s.size}px;--sdelay:${s.delay}s"></span>`
          ).join('')}
        </div>
        <div class="ds-avatar" aria-hidden="true"></div>
      </div>
      <div class="ds-transcript" role="log" aria-live="polite"></div>
      <p class="ds-subheading ds-hidden">${SUBHEADING}</p>
      <div class="ds-level-grid ds-hidden" role="radiogroup" aria-label="${QUESTION}">
        ${LEVELS.map(
          l => `<button type="button" class="ds-level-card" role="radio" aria-checked="false" data-code="${l.code}" style="--card-accent:${l.accent}">
            <span class="ds-level-check">${CHECK_BADGE}</span>
            <span class="ds-level-icon-slot" style="--card-scale:${l.scale}">${levelIcon(l)}</span>
            <span class="ds-level-code">${l.code}</span>
            <span class="ds-level-label">${l.label}</span>
          </button>`
        ).join('')}
        <button type="button" class="ds-level-card ds-level-card--unsure" role="radio" aria-checked="false" data-code="unsure">
          <span class="ds-level-check">${CHECK_BADGE}</span>
          <span class="ds-level-icon-slot" style="--card-scale:0.86">${UNSURE_ICON}</span>
          <span class="ds-level-label">I'm not sure</span>
        </button>
      </div>
      <p class="ds-reassurance ds-hidden">
        <i class="fa-solid fa-bookmark" aria-hidden="true"></i>
        ${REASSURANCE}
      </p>
      <button type="button" class="ds-orb ds-hidden">
        <span class="ds-orb-label">Continue</span>
      </button>
    `;
    containerRef.appendChild(wrapper);
    wrapperEl = wrapper;

    avatarEl = wrapper.querySelector('.ds-avatar');
    transcriptEl = wrapper.querySelector('.ds-transcript');
    subheadingEl = wrapper.querySelector('.ds-subheading');
    gridEl = wrapper.querySelector('.ds-level-grid');
    reassuranceEl = wrapper.querySelector('.ds-reassurance');
    orbEl = wrapper.querySelector('.ds-orb');
    whyBtnEl = wrapper.querySelector('.ds-why-btn');
    whyPopoverEl = wrapper.querySelector('.ds-why-popover');

    avatarEl.innerHTML = getTutoSVG(192);
    avatarEl.querySelectorAll('circle[fill="#2c3e50"]').forEach(c => c.classList.add('ds-pupil', 'ds-eye'));
    avatarEl.querySelectorAll('circle[fill="white"]').forEach(c => c.classList.add('ds-eye'));
    polishAvatar(avatarEl);

    gridEl.querySelectorAll('.ds-level-card').forEach(card => {
      card.addEventListener('click', () => selectLevel(card.dataset.code, card));
    });

    whyBtnEl.addEventListener('click', toggleWhyPopover);

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
      closeWhyPopover?.();
      closeWhyPopover = null;
      if (containerRef) containerRef.innerHTML = '';
      containerRef = null;
      wrapperEl = null;
      avatarEl = null;
      transcriptEl = null;
      subheadingEl = null;
      gridEl = null;
      reassuranceEl = null;
      orbEl = null;
      whyBtnEl = null;
      whyPopoverEl = null;
      currentLineEl = null;
      nextAction = null;
      onReadyCallback = null;
      phase = 'entering';
    },
  });
}

export const selfLevelReflectionScene = createSelfLevelReflectionScene();
