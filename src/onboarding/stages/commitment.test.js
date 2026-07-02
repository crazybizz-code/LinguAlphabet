// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { commitmentStage, DAILY_COMMITMENT_MINUTES } from './commitment.js';

let container;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  commitmentStage.unmount();
});

function clickMinutes(minutes) {
  container.querySelector(`.ob2-chip[data-value="${minutes}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('commitmentStage', () => {
  it('has the expected id', () => {
    expect(commitmentStage.id).toBe('commitment');
  });

  it('renders one chip per commitment option', () => {
    commitmentStage.mount({ container });
    expect(container.querySelectorAll('.ob2-chip')).toHaveLength(DAILY_COMMITMENT_MINUTES.length);
  });

  it('defaults to 20 minutes with no initialData', () => {
    commitmentStage.mount({ container });
    expect(commitmentStage.collect()).toEqual({ dailyTimeGoalMinutes: 20 });
    expect(commitmentStage.validate()).toBe(true);
  });

  it('pre-selects a valid resumed value from initialData', () => {
    commitmentStage.mount({ container, initialData: { dailyTimeGoalMinutes: 45 } });
    expect(commitmentStage.collect()).toEqual({ dailyTimeGoalMinutes: 45 });
  });

  it('falls back to the default when initialData holds an unsupported value', () => {
    commitmentStage.mount({ container, initialData: { dailyTimeGoalMinutes: 999 } });
    expect(commitmentStage.collect()).toEqual({ dailyTimeGoalMinutes: 20 });
  });

  it('selecting a different value updates collect() as a number', () => {
    commitmentStage.mount({ container });
    clickMinutes(60);
    const result = commitmentStage.collect();
    expect(result.dailyTimeGoalMinutes).toBe(60);
    expect(typeof result.dailyTimeGoalMinutes).toBe('number');
  });

  it('unmount clears state', () => {
    commitmentStage.mount({ container });
    commitmentStage.unmount();
    expect(container.innerHTML).toBe('');
    expect(commitmentStage.collect()).toEqual({ dailyTimeGoalMinutes: null });
  });
});
