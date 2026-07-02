// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { completionCardStage, createCompletionCardStage, EXIT_TRANSITION_MS } from './completionCard.js';

const FULL_PROFILE = {
  identity: { displayName: 'Yodgor' },
  firstSession: {
    firstPodcastId: 'pod_1',
    recommendedFirstLesson: { podcastId: 'pod_1', title: 'Airport English', reason: 'Matched to your level' },
    firstMission: { title: 'Complete your first lesson', description: 'Listen to "Airport English"', xpReward: 20 },
  },
};

let container;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  completionCardStage.unmount();
  vi.useRealTimers();
});

describe('completionCardStage', () => {
  it('has the expected id', () => {
    expect(completionCardStage.id).toBe('completion');
  });

  it('displays "Learning Brain Ready" and a personalized welcome message', () => {
    completionCardStage.mount({ container, profile: FULL_PROFILE });
    expect(container.querySelector('.ob2-badge').textContent).toBe('Learning Brain Ready');
    expect(container.querySelector('[data-role="welcome"]').textContent).toBe('Nice work, Yodgor!');
  });

  it('falls back to a generic welcome message when no display name is present', () => {
    completionCardStage.mount({ container, profile: { ...FULL_PROFILE, identity: {} } });
    expect(container.querySelector('[data-role="welcome"]').textContent).toBe('Nice work!');
  });

  it("displays Today's First Mission and the Recommended First Podcast", () => {
    completionCardStage.mount({ container, profile: FULL_PROFILE });
    const mission = container.querySelector('[data-role="mission"]');
    const podcast = container.querySelector('[data-role="podcast"]');
    expect(mission.textContent).toContain("Today's First Mission");
    expect(mission.textContent).toContain('Complete your first lesson');
    expect(podcast.textContent).toContain('Recommended First Podcast');
    expect(podcast.textContent).toContain('Airport English');
  });

  it('omits the mission/podcast blocks gracefully when the profile has none (never throws)', () => {
    const bareProfile = { identity: {}, firstSession: { firstMission: null, recommendedFirstLesson: null } };
    expect(() => completionCardStage.mount({ container, profile: bareProfile })).not.toThrow();
    expect(container.querySelector('[data-role="mission"]')).toBeNull();
    expect(container.querySelector('[data-role="podcast"]')).toBeNull();
  });

  it('renders a Start Learning CTA', () => {
    completionCardStage.mount({ container, profile: FULL_PROFILE });
    const cta = container.querySelector('[data-role="start-learning"]');
    expect(cta.textContent).toBe('Start Learning');
    expect(cta.disabled).toBe(false);
  });

  it('triggers a single, one-shot mascot celebration on mount', () => {
    completionCardStage.mount({ container, profile: FULL_PROFILE });
    expect(container.querySelector('.ob2-mascot--celebrate')).not.toBeNull();
  });

  it('is always valid() and collects nothing — a display-only terminal stage', () => {
    completionCardStage.mount({ container, profile: FULL_PROFILE });
    expect(completionCardStage.validate()).toBe(true);
    expect(completionCardStage.collect()).toEqual({});
  });

  it('clicking Start Learning disables the button, plays the exit transition, then hands off — the sole path to the Dashboard', () => {
    vi.useFakeTimers();
    let handedOffProfile = null;
    completionCardStage.mount({
      container,
      profile: FULL_PROFILE,
      onStartLearning: (profile) => { handedOffProfile = profile; },
    });

    const wrapper = container.querySelector('.ob2-completion-card');
    const cta = container.querySelector('[data-role="start-learning"]');

    cta.click();
    expect(cta.disabled).toBe(true);
    expect(wrapper.classList.contains('ob2-completion-card--exit')).toBe(true);
    expect(handedOffProfile).toBeNull(); // not yet — transition is still playing

    vi.advanceTimersByTime(EXIT_TRANSITION_MS);
    expect(handedOffProfile).toBe(FULL_PROFILE);
  });

  it('never calls onStartLearning if unmounted before the exit transition finishes', () => {
    vi.useFakeTimers();
    let called = false;
    completionCardStage.mount({
      container,
      profile: FULL_PROFILE,
      onStartLearning: () => { called = true; },
    });

    container.querySelector('[data-role="start-learning"]').click();
    completionCardStage.unmount();
    vi.advanceTimersByTime(EXIT_TRANSITION_MS);

    expect(called).toBe(false);
  });

  it('unmount clears the container, destroys the mascot, and removes the click listener', () => {
    const stage = createCompletionCardStage();
    stage.mount({ container, profile: FULL_PROFILE });
    stage.unmount();
    expect(container.innerHTML).toBe('');
  });
});
