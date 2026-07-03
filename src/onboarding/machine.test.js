// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { createOnboardingMachine, onboardingMachine } from './machine.js';
import { createStage } from './stages/stageDescriptor.js';
import { buildStageRegistry } from './stages/registry.js';
import { createOnboardingStore } from './store.js';
import { STAGE_REGISTRY } from './stages/index.js';

const CATALOG = [{ podcastId: 'pod_1', title: 'Lesson One', difficulty: 'Beginner' }];

function fakeUserState(data = {}) {
  const state = { streak: 0, xp: 0, username: 'Yodgor', isGuest: true, userId: 'guest_test', ...data };
  return { get: (key) => state[key], update: (patch) => Object.assign(state, patch), snapshot: () => ({ ...state }) };
}

function fakeStage(id, { validFn = () => true, collectFn = () => ({}) } = {}) {
  const mountCalls = [];
  const unmountCalls = [];
  const stage = createStage({
    id,
    mount(ctx) { mountCalls.push(ctx); },
    validate() { return validFn(); },
    collect() { return collectFn(); },
    unmount() { unmountCalls.push(true); },
  });
  return { stage, mountCalls, unmountCalls };
}

// Three fake stages whose combined collect() output satisfies
// isOnboardingAnswersComplete() exactly, so a full walk-through
// reaches a genuinely successful initialization.
function buildThreeStageFixture() {
  const a = fakeStage('a', { collectFn: () => ({ targetGoal: 'General English' }) });
  const b = fakeStage('b', { collectFn: () => ({ selectedLevel: 'Intermediate', needsLevelAssessment: false }) });
  const c = fakeStage('c', { collectFn: () => ({ dailyTimeGoalMinutes: 20, tags: ['Career'], freeText: '' }) });
  const registry = buildStageRegistry([a.stage, b.stage, c.stage]);
  return { registry, a, b, c };
}

function runnerOptions(overrides = {}) {
  return { catalog: CATALOG, minStepDurationMs: 0, now: () => '2026-07-02T12:00:00.000Z', ...overrides };
}

let container;

beforeEach(() => {
  // createOnboardingStore() instances share the same underlying
  // localStorage draft key — clear it between tests so a resumed
  // draft from one test can never leak into the next.
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
});

describe('createOnboardingMachine — construction', () => {
  it('throws if started without a container', () => {
    const machine = createOnboardingMachine({ registry: buildThreeStageFixture().registry, store: createOnboardingStore(), userState: fakeUserState() });
    expect(() => machine.start(null)).toThrow(/container/);
  });

  it('throws if started with an empty registry', () => {
    const machine = createOnboardingMachine({ registry: buildStageRegistry([]), store: createOnboardingStore(), userState: fakeUserState() });
    expect(() => machine.start(container)).toThrow(/registry/);
  });
});

describe('createOnboardingMachine — answering phase navigation', () => {
  it('mounts the first stage and renders the chrome (progress label + buttons)', () => {
    const { registry, a } = buildThreeStageFixture();
    const machine = createOnboardingMachine({ registry, store: createOnboardingStore(), userState: fakeUserState() });
    machine.start(container, { userId: 'user_1' });

    expect(machine.getPhase()).toBe('answering');
    expect(machine.getCurrentStageId()).toBe('a');
    expect(a.mountCalls).toHaveLength(1);
    expect(container.querySelector('[data-role="progress-label"]').textContent).toBe('Step 1 of 3');
    expect(container.querySelector('[data-role="back"]').style.visibility).toBe('hidden');
  });

  it('disables Continue when the current stage is invalid, enables it when valid', () => {
    const a = fakeStage('a', { validFn: () => false });
    const registry = buildStageRegistry([a.stage, fakeStage('b').stage]);
    const machine = createOnboardingMachine({ registry, store: createOnboardingStore(), userState: fakeUserState() });
    machine.start(container, { userId: 'user_1' });

    expect(container.querySelector('[data-role="next"]').disabled).toBe(true);
  });

  it('reacts to onChange by re-checking validate()', () => {
    let valid = false;
    const a = fakeStage('a', { validFn: () => valid });
    const registry = buildStageRegistry([a.stage, fakeStage('b').stage]);
    const machine = createOnboardingMachine({ registry, store: createOnboardingStore(), userState: fakeUserState() });
    machine.start(container, { userId: 'user_1' });

    expect(container.querySelector('[data-role="next"]').disabled).toBe(true);
    valid = true;
    a.mountCalls[0].onChange();
    expect(container.querySelector('[data-role="next"]').disabled).toBe(false);
  });

  it('Continue collects the current stage answers into the store and advances', () => {
    const { registry, a, b } = buildThreeStageFixture();
    const store = createOnboardingStore();
    const machine = createOnboardingMachine({ registry, store, userState: fakeUserState() });
    machine.start(container, { userId: 'user_1' });

    container.querySelector('[data-role="next"]').click();

    expect(a.unmountCalls).toHaveLength(1);
    expect(b.mountCalls).toHaveLength(1);
    expect(store.getAnswers()).toMatchObject({ targetGoal: 'General English' });
    expect(machine.getCurrentStageId()).toBe('b');
    expect(container.querySelector('[data-role="progress-label"]').textContent).toBe('Step 2 of 3');
    expect(container.querySelector('[data-role="back"]').style.visibility).toBe('visible');
  });

  it('Back returns to the previous stage without discarding already-collected answers', () => {
    const { registry, a, b } = buildThreeStageFixture();
    const store = createOnboardingStore();
    const machine = createOnboardingMachine({ registry, store, userState: fakeUserState() });
    machine.start(container, { userId: 'user_1' });

    container.querySelector('[data-role="next"]').click(); // a -> b
    container.querySelector('[data-role="back"]').click(); // b -> a

    expect(b.unmountCalls).toHaveLength(1);
    expect(a.mountCalls).toHaveLength(2); // re-mounted
    expect(machine.getCurrentStageId()).toBe('a');
    // Stage b's (empty-string) contribution was still collected on the way back.
    expect(store.getAnswers()).toMatchObject({ targetGoal: 'General English' });
  });

  it('Back is a no-op on the first stage', () => {
    const { registry, a } = buildThreeStageFixture();
    const machine = createOnboardingMachine({ registry, store: createOnboardingStore(), userState: fakeUserState() });
    machine.start(container, { userId: 'user_1' });

    container.querySelector('[data-role="back"]').click();
    expect(a.unmountCalls).toHaveLength(0);
    expect(machine.getCurrentStageId()).toBe('a');
  });

  it('resumes at the saved draft stage with previously collected answers as initialData', () => {
    const { registry } = buildThreeStageFixture();
    const store = createOnboardingStore();
    store.load('user_1');
    store.patchAnswers({ targetGoal: 'Business English' });
    store.setStageId('b');

    const machine = createOnboardingMachine({ registry, store, userState: fakeUserState() });
    machine.start(container, { userId: 'user_1' });

    expect(machine.getCurrentStageId()).toBe('b');
    expect(container.querySelector('[data-role="progress-label"]').textContent).toBe('Step 2 of 3');
  });

  it('a different userId does not resume a stale draft (falls back to the first stage)', () => {
    const { registry } = buildThreeStageFixture();
    const store = createOnboardingStore();
    store.load('user_1');
    store.setStageId('b');

    const machine = createOnboardingMachine({ registry, store, userState: fakeUserState() });
    machine.start(container, { userId: 'user_2' });

    expect(machine.getCurrentStageId()).toBe('a');
  });
});

describe('createOnboardingMachine — full walk-through to Dashboard handoff', () => {
  it('advances through every stage, into initialization, into the Completion Card, and calls onExit only from Start Learning', async () => {
    const { registry } = buildThreeStageFixture();
    const store = createOnboardingStore();
    const userState = fakeUserState();
    const machine = createOnboardingMachine({ registry, store, userState });

    let exitedProfile = null;
    machine.start(container, {
      userId: 'user_1',
      onExit: (profile) => { exitedProfile = profile; },
      runnerOptions: runnerOptions(),
    });

    container.querySelector('[data-role="next"]').click(); // a -> b
    container.querySelector('[data-role="next"]').click(); // b -> c
    container.querySelector('[data-role="next"]').click(); // c -> initializing

    expect(machine.getPhase()).toBe('initializing');
    expect(exitedProfile).toBeNull();

    // Wait for the Initialization Runner (real, unmocked) to finish.
    await new Promise((resolve) => {
      const check = () => (machine.getPhase() === 'completion' ? resolve() : setTimeout(check, 5));
      check();
    });

    expect(machine.getPhase()).toBe('completion');
    expect(container.querySelector('.ob2-completion-card')).not.toBeNull();
    expect(exitedProfile).toBeNull(); // Completion Card is showing — not yet exited

    container.querySelector('[data-role="start-learning"]').click();
    await new Promise((resolve) => setTimeout(resolve, 450)); // exit-transition timing

    expect(exitedProfile).not.toBeNull();
    expect(exitedProfile.onboardingCompleted).toBe(true);
    expect(machine.getPhase()).toBeNull();
  });
});

describe('createOnboardingMachine — error recovery / retry', () => {
  it('shows a retry banner when initialization fails, and a retry can succeed', async () => {
    const { registry } = buildThreeStageFixture();
    const store = createOnboardingStore();
    const userState = fakeUserState();
    let shouldFail = true;
    const realUpdate = userState.update;
    userState.update = (patch) => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error('transient failure');
      }
      realUpdate(patch);
    };

    const machine = createOnboardingMachine({ registry, store, userState });
    let exitedProfile = null;
    machine.start(container, { userId: 'user_1', onExit: (p) => { exitedProfile = p; }, runnerOptions: runnerOptions() });

    container.querySelector('[data-role="next"]').click();
    container.querySelector('[data-role="next"]').click();
    container.querySelector('[data-role="next"]').click();

    await new Promise((resolve) => {
      const check = () => (container.querySelector('[data-role="retry"]') ? resolve() : setTimeout(check, 5));
      check();
    });

    expect(container.querySelector('.ob2-machine-error')).not.toBeNull();

    container.querySelector('[data-role="retry"]').click();

    await new Promise((resolve) => {
      const check = () => (machine.getPhase() === 'completion' ? resolve() : setTimeout(check, 5));
      check();
    });

    expect(machine.getPhase()).toBe('completion');
    expect(exitedProfile).toBeNull(); // still requires the explicit Start Learning click
  });
});

describe('createOnboardingMachine — destroy', () => {
  it('unmounts the current stage and clears the container', () => {
    const { registry, a } = buildThreeStageFixture();
    const machine = createOnboardingMachine({ registry, store: createOnboardingStore(), userState: fakeUserState() });
    machine.start(container, { userId: 'user_1' });

    machine.destroy();

    expect(a.unmountCalls).toHaveLength(1);
    expect(container.innerHTML).toBe('');
    expect(machine.getPhase()).toBeNull();
  });
});

describe('onboardingMachine (shared singleton) + the real STAGE_REGISTRY', () => {
  it('drives the actual 5 Phase B stages end-to-end without throwing', () => {
    const store = createOnboardingStore();
    const machine = createOnboardingMachine({ registry: STAGE_REGISTRY, store, userState: fakeUserState() });

    expect(() => machine.start(container, { userId: 'user_1' })).not.toThrow();
    expect(machine.getCurrentStageId()).toBe('welcome');
    expect(container.querySelector('[data-role="next"]').disabled).toBe(false); // welcome is always valid

    machine.destroy();
  });

  it('the exported onboardingMachine singleton is directly usable', () => {
    expect(() => onboardingMachine.start(container, { userId: 'singleton_user' })).not.toThrow();
    onboardingMachine.destroy();
  });
});
