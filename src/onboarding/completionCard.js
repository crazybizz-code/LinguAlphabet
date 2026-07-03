// ============================================================
// completionCard.js — the mandatory Completion Card
// ============================================================
// The emotional ending of onboarding, and the ONLY path into the
// Dashboard: nowhere in this module, progressView.js, or
// initialization.js is there any other call that could reach a
// dashboard-entry point. The Start Learning button's click handler
// is the single exit from the onboarding flow — enforced
// structurally (there is no other exposed hook), the same way
// Phase C's atomicity guarantee is enforced by the runner simply
// having no code path that writes before its last step.
//
// Celebration is deliberately subtle: one one-shot mascot bounce via
// the existing tutoCelebrate keyframe (mascot.js) — no confetti, no
// particle effects, no looping attention-grabbing motion. The exit
// transition mirrors the app's existing screen-exit pattern (an exit
// class plus a matching timeout before the handoff — the same shape
// as main.js's transitionWelcomeToOnboarding(), reusing its 400ms
// timing) instead of an abrupt switch.
//
// Built via createStage() for the same reason as progressView.js:
// contract consistency with the Stage Registry's stages, without
// being registered in STAGE_REGISTRY itself (it's not a Back/Next
// answer-collecting stage).

import { createStage } from './stages/stageDescriptor.js';
import { mountMascot } from './mascot.js';

const STAGE_ID = 'completion';

// Matches the app's existing welcome->onboarding exit transition timing.
export const EXIT_TRANSITION_MS = 400;

function formatWelcomeMessage(profile) {
  const name = profile?.identity?.displayName?.trim();
  return name ? `Nice work, ${name}!` : 'Nice work!';
}

export function createCompletionCardStage() {
  let containerRef = null;
  let mascotHandle = null;
  let exitTimer = null;
  let ctaButton = null;
  let ctaHandler = null;

  function render(ctx) {
    containerRef.innerHTML = '';

    const profile = ctx?.profile || {};
    const firstSession = profile.firstSession || {};
    const mission = firstSession.firstMission;
    const lesson = firstSession.recommendedFirstLesson;

    const wrapper = document.createElement('div');
    wrapper.className = 'ob2-completion-card';
    wrapper.innerHTML = `
      <div class="ob2-completion-mascot-mount" data-role="mascot"></div>
      <span class="ob2-badge">Learning Brain Ready</span>
      <h1 class="ob2-heading" data-role="welcome"></h1>
      <p class="ob2-subtext">Your personalized English journey starts now.</p>
      ${mission ? `
        <div class="ob2-completion-block" data-role="mission">
          <span class="ob2-completion-block-label">Today's First Mission</span>
          <span class="ob2-completion-block-title">${mission.title}</span>
          <span class="ob2-completion-block-desc">${mission.description}</span>
        </div>
      ` : ''}
      ${lesson ? `
        <div class="ob2-completion-block" data-role="podcast">
          <span class="ob2-completion-block-label">Recommended First Podcast</span>
          <span class="ob2-completion-block-title">${lesson.title}</span>
        </div>
      ` : ''}
      <button type="button" class="ob2-completion-cta" data-role="start-learning">Start Learning</button>
    `;
    containerRef.appendChild(wrapper);

    wrapper.querySelector('[data-role="welcome"]').textContent = formatWelcomeMessage(profile);

    mascotHandle = mountMascot(wrapper.querySelector('[data-role="mascot"]'));
    // A single, gentle celebration on arrival — not looping, not attention-grabbing.
    mascotHandle.celebrate();

    ctaButton = wrapper.querySelector('[data-role="start-learning"]');
    ctaHandler = () => {
      ctaButton.disabled = true;
      wrapper.classList.add('ob2-completion-card--exit');
      exitTimer = setTimeout(() => {
        ctx?.onStartLearning?.(profile);
      }, EXIT_TRANSITION_MS);
    };
    ctaButton.addEventListener('click', ctaHandler);
  }

  return createStage({
    id: STAGE_ID,

    mount(ctx) {
      containerRef = ctx.container;
      render(ctx);
    },

    validate() {
      return true;
    },

    collect() {
      return {};
    },

    unmount() {
      if (exitTimer) clearTimeout(exitTimer);
      exitTimer = null;
      mascotHandle?.destroy();
      mascotHandle = null;
      if (ctaButton && ctaHandler) ctaButton.removeEventListener('click', ctaHandler);
      ctaButton = null;
      ctaHandler = null;
      if (containerRef) containerRef.innerHTML = '';
      containerRef = null;
    },
  });
}

export const completionCardStage = createCompletionCardStage();
