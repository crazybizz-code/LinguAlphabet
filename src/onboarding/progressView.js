// ============================================================
// progressView.js — Progress Experience for Learning Brain
// Initialization
// ============================================================
// Displays the exact real progress messages emitted by the
// Initialization Runner (Phase C) alongside a percentage derived
// directly from the runner's own step index/total — the percentage
// is never a separately-timed fake progress bar; it only ever moves
// when runInitialization() reports a real step has started
// (5 steps -> 20/40/60/80/100, matching the approved example
// exactly, because it's computed from the same index/total, not
// hardcoded).
//
// Built via createStage() to share the {id, mount, validate, collect,
// unmount} contract with the answer-collecting stages (reusing the
// Stage Registry's descriptor infrastructure), but this stage is
// intentionally NOT added to STAGE_REGISTRY: per the approved
// engineering plan, initialization is a terminal "on finish" step,
// not a Back/Next-navigable, answer-collecting stage the user steps
// through. Mixing it into the registry would blur that distinction.
//
// createProgressViewStage() + the progressViewStage singleton follow
// the same factory+singleton pattern established for the Phase B
// stages (see onboarding/store.js's precedent).

import { createStage } from './stages/stageDescriptor.js';
import { runInitialization } from './initialization.js';
import { mountMascot } from './mascot.js';

const STAGE_ID = 'initializing';

// Exported for direct unit testing of the "no faked progress" guarantee:
// the percentage is always a pure function of the runner's own real
// step index/total, never a separate timer.
export function percentageFor(index, total) {
  return Math.round(((index + 1) / total) * 100);
}

export function createProgressViewStage() {
  let containerRef = null;
  let mascotHandle = null;
  let cancelled = false;
  let succeeded = false;

  function render(ctx) {
    containerRef.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'ob2-stage ob2-stage--initializing';
    wrapper.innerHTML = `
      <div class="ob2-progress-mascot-mount" data-role="mascot"></div>
      <div class="ob2-progress-percentage" data-role="percentage">0%</div>
      <div class="ob2-progress-message" data-role="message"></div>
      <div class="ob2-progress-bar"><div class="ob2-progress-bar-fill" data-role="bar-fill" style="width:0%"></div></div>
      <div class="ob2-progress-error hidden" data-role="error"></div>
    `;
    containerRef.appendChild(wrapper);

    mascotHandle = mountMascot(wrapper.querySelector('[data-role="mascot"]'));

    const percentageEl = wrapper.querySelector('[data-role="percentage"]');
    const messageEl = wrapper.querySelector('[data-role="message"]');
    const barFillEl = wrapper.querySelector('[data-role="bar-fill"]');
    const errorEl = wrapper.querySelector('[data-role="error"]');

    const onProgress = ({ index, total, message }) => {
      if (cancelled) return;
      const pct = percentageFor(index, total);
      percentageEl.textContent = `${pct}%`;
      barFillEl.style.width = `${pct}%`;

      // Re-trigger the fade-in on every message change (not just once).
      messageEl.classList.remove('ob2-progress-message--enter');
      void messageEl.offsetWidth;
      messageEl.textContent = message;
      messageEl.classList.add('ob2-progress-message--enter');
    };

    runInitialization({ ...(ctx?.runnerOptions || {}), onProgress })
      .then((profile) => {
        if (cancelled) return;
        succeeded = true;
        ctx?.onComplete?.(profile);
      })
      .catch((error) => {
        if (cancelled) return;
        errorEl.textContent = 'Something went wrong preparing your Learning Brain. Please try again.';
        errorEl.classList.remove('hidden');
        ctx?.onError?.(error);
      });
  }

  return createStage({
    id: STAGE_ID,

    mount(ctx) {
      containerRef = ctx.container;
      cancelled = false;
      succeeded = false;
      render(ctx);
    },

    validate() {
      return succeeded;
    },

    collect() {
      return {};
    },

    unmount() {
      cancelled = true;
      mascotHandle?.destroy();
      mascotHandle = null;
      if (containerRef) containerRef.innerHTML = '';
      containerRef = null;
    },
  });
}

export const progressViewStage = createProgressViewStage();
