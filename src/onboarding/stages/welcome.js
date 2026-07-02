// ============================================================
// welcome.js — Stage: Welcome
// ============================================================
// Purely informational: greets the learner and previews the four
// steps ahead. Nothing is required to proceed, so validate() is
// always true and collect() has nothing to contribute.
//
// The learner's name was already captured on the Sprint 1 auth
// welcome screen; this stage may personalize its greeting from
// ctx.initialData but never reaches into UserState itself — stages
// only see what the (future) machine passes in.
//
// createWelcomeStage() is exported alongside the `welcomeStage`
// singleton, mirroring onboarding/store.js's
// createOnboardingStore()/onboardingStore pair: mount/unmount state
// lives in the factory's closure rather than module scope, so tests
// can create independent instances instead of relying on unmount()
// to reset shared state. The registry still only ever registers one
// instance per id (buildStageRegistry rejects duplicates) — nothing
// about production usage changes.

import { createStage } from './stageDescriptor.js';

const STAGE_ID = 'welcome';

export function createWelcomeStage() {
  let containerRef = null;

  function render(ctx) {
    const displayName = ctx?.initialData?.displayName?.trim();
    const greeting = displayName ? `Welcome back, ${displayName}!` : 'Welcome!';

    containerRef.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'ob2-stage ob2-stage--welcome';
    wrapper.innerHTML = `
      <span class="ob2-badge">Getting started</span>
      <h1 class="ob2-heading"></h1>
      <p class="ob2-subtext">Let's build your personalized English learning journey. This will only take a minute.</p>
      <ul class="ob2-welcome-steps">
        <li>Pick your main learning goal</li>
        <li>Tell us your English level</li>
        <li>Choose your daily study time</li>
        <li>Share what motivates you</li>
      </ul>
    `;
    wrapper.querySelector('.ob2-heading').textContent = greeting;

    containerRef.appendChild(wrapper);
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
      if (containerRef) containerRef.innerHTML = '';
      containerRef = null;
    },
  });
}

export const welcomeStage = createWelcomeStage();
