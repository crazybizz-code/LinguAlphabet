// ============================================================
// machine.js — the Onboarding Machine (OnboardingController)
// ============================================================
// Drives the full onboarding experience end to end: navigates the
// answer-collecting stages in STAGE_REGISTRY (Phase B), collecting
// each stage's answers into the OnboardingStore (Phase A) on every
// transition; hands off to the Progress Experience (Phase D, which
// itself invokes the Initialization Runner from Phase C); and
// finally to the Completion Card (Phase D), whose Start Learning CTA
// is the only exit this machine ever calls.
//
// This module is pure integration: it does not reimplement any
// stage's rendering/validation, the Initialization Runner's task
// sequence, or the Completion Card's content — it only sequences
// already-built pieces and owns the one piece of chrome none of them
// render themselves: the answering-phase progress label and
// Back/Continue buttons (reusing the existing generic .btn-primary /
// .btn-ghost button classes, not inventing new ones).

import { STAGE_REGISTRY, getStageIndex, getNextStage, getPreviousStage } from './stages/index.js';
import { onboardingStore } from './store.js';
import { UserState } from '../db.js';
import { createProgressViewStage } from './progressView.js';
import { createCompletionCardStage } from './completionCard.js';

function isElement(value) {
  return typeof value === 'object' && value !== null && typeof value.appendChild === 'function';
}

export function createOnboardingMachine({
  registry = STAGE_REGISTRY,
  store = onboardingStore,
  userState = UserState,
} = {}) {
  let rootContainer = null;
  let onExitCallback = null;
  let baseRunnerOptions = {};

  // 'answering' | 'initializing' | 'completion' | null
  let phase = null;
  let currentStage = null;

  // Answering-phase chrome refs, (re)built once per enterAnsweringPhase().
  let stageMountEl = null;
  let progressLabelEl = null;
  let progressFillEl = null;
  let backButton = null;
  let nextButton = null;

  function clearRoot() {
    if (rootContainer) rootContainer.innerHTML = '';
    stageMountEl = null;
    progressLabelEl = null;
    progressFillEl = null;
    backButton = null;
    nextButton = null;
  }

  // ---- Answering phase ----

  function buildChrome() {
    clearRoot();
    const chrome = document.createElement('div');
    chrome.className = 'ob2-machine';
    chrome.innerHTML = `
      <div class="ob2-subtext" data-role="progress-label"></div>
      <div class="ob2-progress-bar"><div class="ob2-progress-bar-fill" data-role="progress-fill" style="width:0%"></div></div>
      <div class="ob2-machine-stage-mount" data-role="stage-mount"></div>
      <div class="ob2-machine-footer">
        <button type="button" class="btn-primary btn-full" data-role="next">Continue</button>
        <button type="button" class="btn-ghost btn-full" data-role="back">Back</button>
      </div>
    `;
    rootContainer.appendChild(chrome);

    stageMountEl = chrome.querySelector('[data-role="stage-mount"]');
    progressLabelEl = chrome.querySelector('[data-role="progress-label"]');
    progressFillEl = chrome.querySelector('[data-role="progress-fill"]');
    nextButton = chrome.querySelector('[data-role="next"]');
    backButton = chrome.querySelector('[data-role="back"]');

    nextButton.addEventListener('click', handleNext);
    backButton.addEventListener('click', handleBack);
  }

  function refreshNextButton() {
    if (nextButton) nextButton.disabled = !currentStage?.validate();
  }

  function updateChromeForStage(stage) {
    const index = getStageIndex(registry, stage.id);
    const total = registry.length;
    progressLabelEl.textContent = `Step ${index + 1} of ${total}`;
    progressFillEl.style.width = `${Math.round(((index + 1) / total) * 100)}%`;
    backButton.style.visibility = getPreviousStage(registry, stage.id) ? 'visible' : 'hidden';
    refreshNextButton();
  }

  function mountAnsweringStage(stage) {
    currentStage = stage;
    store.setStageId(stage.id);
    stage.mount({
      container: stageMountEl,
      initialData: store.getAnswers(),
      onChange: refreshNextButton,
    });
    updateChromeForStage(stage);
  }

  function leaveCurrentAnsweringStage() {
    if (!currentStage) return;
    store.patchAnswers(currentStage.collect());
    currentStage.unmount();
    currentStage = null;
  }

  function handleNext() {
    if (phase !== 'answering' || !currentStage || !currentStage.validate()) return;
    const finishedStageId = currentStage.id;
    leaveCurrentAnsweringStage();

    const next = getNextStage(registry, finishedStageId);
    if (next) {
      mountAnsweringStage(next);
    } else {
      enterInitializingPhase();
    }
  }

  function handleBack() {
    if (phase !== 'answering' || !currentStage) return;
    const prev = getPreviousStage(registry, currentStage.id);
    if (!prev) return;
    leaveCurrentAnsweringStage();
    mountAnsweringStage(prev);
  }

  function enterAnsweringPhase(startStage) {
    phase = 'answering';
    buildChrome();
    mountAnsweringStage(startStage);
  }

  // ---- Initialization phase ----

  function enterInitializingPhase() {
    phase = 'initializing';
    clearRoot();
    currentStage = createProgressViewStage();
    currentStage.mount({
      container: rootContainer,
      runnerOptions: { ...baseRunnerOptions, store, userState },
      onComplete: (profile) => enterCompletionPhase(profile),
      onError: (error) => {
        currentStage?.unmount();
        currentStage = null;
        showInitializationError(error);
      },
    });
  }

  function showInitializationError(error) {
    clearRoot();
    const banner = document.createElement('div');
    banner.className = 'ob2-machine-error';
    banner.innerHTML = `
      <p class="ob2-subtext">${(error && error.message) || 'Something went wrong. Please try again.'}</p>
      <button type="button" class="btn-primary btn-full" data-role="retry">Try Again</button>
    `;
    rootContainer.appendChild(banner);
    banner.querySelector('[data-role="retry"]').addEventListener('click', () => {
      enterInitializingPhase();
    });
  }

  // ---- Completion phase ----

  function enterCompletionPhase(profile) {
    phase = 'completion';
    currentStage?.unmount();
    clearRoot();
    currentStage = createCompletionCardStage();
    currentStage.mount({
      container: rootContainer,
      profile,
      onStartLearning: (finalProfile) => {
        currentStage?.unmount();
        currentStage = null;
        phase = null;
        onExitCallback?.(finalProfile);
      },
    });
  }

  // ---- Public API ----

  /**
   * @param {HTMLElement} container - mount point; owned by the caller
   * @param {object} [options]
   * @param {string} [options.userId] - scopes draft resume, same rule as OnboardingStore
   * @param {(profile: object) => void} [options.onExit] - the ONLY hook this machine ever
   *   calls to leave onboarding; fired exclusively from the Completion Card's CTA
   * @param {object} [options.runnerOptions] - passed through to runInitialization()
   *   (e.g. catalog/minStepDurationMs/now for tests); store/userState are always the
   *   machine's own, regardless of what's passed here
   */
  function start(container, options = {}) {
    if (!isElement(container)) {
      throw new Error('OnboardingMachine.start: a mount container element is required');
    }
    if (registry.length === 0) {
      throw new Error('OnboardingMachine.start: the stage registry is empty');
    }

    rootContainer = container;
    onExitCallback = options.onExit;
    baseRunnerOptions = options.runnerOptions || {};

    const draft = store.load(options.userId ?? null);

    // Seed a display name for the Welcome stage's greeting. This is a
    // display-only convenience — the profile builder still sources
    // identity.displayName from UserState directly (answersAdapter.js).
    if (!store.getAnswers().displayName) {
      const displayName = userState.get('username') || '';
      if (displayName) store.patchAnswers({ displayName });
    }

    const resumeStageId = store.hasResumableDraft(options.userId ?? null) ? draft.stageId : null;
    const startIndex = resumeStageId ? Math.max(0, getStageIndex(registry, resumeStageId)) : 0;
    const startStage = registry[startIndex] || registry[0];

    enterAnsweringPhase(startStage);
  }

  function destroy() {
    currentStage?.unmount();
    currentStage = null;
    clearRoot();
    rootContainer = null;
    phase = null;
  }

  return {
    start,
    destroy,
    getPhase: () => phase,
    getCurrentStageId: () => currentStage?.id ?? null,
  };
}

export const onboardingMachine = createOnboardingMachine();
