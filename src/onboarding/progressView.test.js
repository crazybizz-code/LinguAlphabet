// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { progressViewStage, createProgressViewStage, percentageFor } from './progressView.js';
import { INITIALIZATION_STEPS } from './initialization.js';

const CATALOG = [
  { podcastId: 'pod_beginner', title: 'Beginner Lesson', difficulty: 'Beginner' },
  { podcastId: 'pod_intermediate', title: 'Intermediate Lesson', difficulty: 'Intermediate' },
];

const COMPLETE_ANSWERS = {
  targetGoal: 'General English',
  selectedLevel: 'Intermediate',
  needsLevelAssessment: false,
  dailyTimeGoalMinutes: 20,
  tags: ['Career'],
  freeText: '',
};

function fakeStore(initialAnswers = {}) {
  let answers = { ...initialAnswers };
  return {
    getAnswers: () => ({ ...answers }),
    clear: () => { answers = {}; },
  };
}

function fakeUserState(data = {}) {
  const state = { streak: 0, xp: 0, username: 'Learner', isGuest: true, userId: 'guest_test', ...data };
  return {
    get: (key) => state[key],
    update: (patch) => Object.assign(state, patch),
  };
}

function runnerOptions(overrides = {}) {
  return {
    store: fakeStore(COMPLETE_ANSWERS),
    userState: fakeUserState(),
    catalog: CATALOG,
    minStepDurationMs: 0,
    ...overrides,
  };
}

let container;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  progressViewStage.unmount();
});

function mountAndWait(stage) {
  return new Promise((resolve, reject) => {
    stage.mount({
      container,
      runnerOptions: runnerOptions(),
      onComplete: resolve,
      onError: reject,
    });
  });
}

describe('progressViewStage', () => {
  it('has the expected id', () => {
    expect(progressViewStage.id).toBe('initializing');
  });

  it('renders a mascot, percentage, message, and progress bar shell on mount', () => {
    const stage = createProgressViewStage();
    stage.mount({ container, runnerOptions: runnerOptions() });
    expect(container.querySelector('.ob2-mascot')).not.toBeNull();
    expect(container.querySelector('[data-role="percentage"]')).not.toBeNull();
    expect(container.querySelector('[data-role="message"]')).not.toBeNull();
    expect(container.querySelector('[data-role="bar-fill"]')).not.toBeNull();
    stage.unmount();
  });

  it('percentageFor derives 20/40/60/80/100% directly from the real step index/total (never a separate timer)', () => {
    const total = INITIALIZATION_STEPS.length;
    expect(total).toBe(5);
    expect([0, 1, 2, 3, 4].map(index => percentageFor(index, total))).toEqual([20, 40, 60, 80, 100]);
  });

  it('reaches 100% and shows the final approved message once initialization completes', async () => {
    const profile = await mountAndWait(progressViewStage);

    expect(profile.onboardingCompleted).toBe(true);
    expect(container.querySelector('[data-role="percentage"]').textContent).toBe('100%');
    expect(container.querySelector('[data-role="message"]').textContent).toBe(
      INITIALIZATION_STEPS[INITIALIZATION_STEPS.length - 1],
    );
    expect(container.querySelector('[data-role="bar-fill"]').style.width).toBe('100%');
  });

  it('calls onComplete with the completed profile and becomes valid()', async () => {
    const stage = createProgressViewStage();
    const profile = await mountAndWait(stage);
    expect(profile.onboardingCompleted).toBe(true);
    expect(stage.validate()).toBe(true);
    stage.unmount();
  });

  it('collect() always returns an empty object — this stage contributes no answers', async () => {
    const stage = createProgressViewStage();
    await mountAndWait(stage);
    expect(stage.collect()).toEqual({});
    stage.unmount();
  });

  it('is not valid() before initialization completes', () => {
    const stage = createProgressViewStage();
    stage.mount({ container, runnerOptions: runnerOptions() });
    expect(stage.validate()).toBe(false);
    stage.unmount();
  });

  it('shows an error and calls onError when initialization fails, without throwing', async () => {
    const stage = createProgressViewStage();
    const incompleteStore = fakeStore({ targetGoal: 'General English' }); // missing level/commitment/motivation

    const error = await new Promise((resolve) => {
      stage.mount({
        container,
        runnerOptions: runnerOptions({ store: incompleteStore }),
        onError: resolve,
      });
    });

    expect(error).toBeDefined();
    const errorEl = container.querySelector('[data-role="error"]');
    expect(errorEl.classList.contains('hidden')).toBe(false);
    expect(errorEl.textContent.length).toBeGreaterThan(0);
    expect(stage.validate()).toBe(false);
    stage.unmount();
  });

  it('never calls onComplete or onError after unmount (cancellation guard)', async () => {
    const stage = createProgressViewStage();
    let completed = false;
    let errored = false;

    stage.mount({
      container,
      runnerOptions: runnerOptions(),
      onComplete: () => { completed = true; },
      onError: () => { errored = true; },
    });
    stage.unmount();

    // Let any in-flight microtasks from runInitialization resolve.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(completed).toBe(false);
    expect(errored).toBe(false);
  });

  it('unmount clears the container and destroys the mascot', async () => {
    const stage = createProgressViewStage();
    await mountAndWait(stage);
    stage.unmount();
    expect(container.innerHTML).toBe('');
  });
});
