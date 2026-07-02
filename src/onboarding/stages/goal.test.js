// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { goalStage, GOAL_OPTIONS } from './goal.js';

let container;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  goalStage.unmount();
});

function clickGoal(value) {
  container.querySelector(`.ob2-chip[data-value="${value}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('goalStage', () => {
  it('has the expected id', () => {
    expect(goalStage.id).toBe('goal');
  });

  it('renders every goal option', () => {
    goalStage.mount({ container });
    expect(container.querySelectorAll('.ob2-chip')).toHaveLength(GOAL_OPTIONS.length);
  });

  it('defaults to General English with no initialData', () => {
    goalStage.mount({ container });
    expect(goalStage.collect()).toEqual({ targetGoal: 'General English' });
    expect(goalStage.validate()).toBe(true);
  });

  it('pre-selects a valid resumed goal from initialData', () => {
    goalStage.mount({ container, initialData: { targetGoal: 'IELTS Preparation' } });
    expect(goalStage.collect()).toEqual({ targetGoal: 'IELTS Preparation' });
  });

  it('falls back to the default when initialData holds an unknown goal', () => {
    goalStage.mount({ container, initialData: { targetGoal: 'Not A Real Goal' } });
    expect(goalStage.collect()).toEqual({ targetGoal: 'General English' });
  });

  it('selecting a different goal updates collect()', () => {
    goalStage.mount({ container });
    clickGoal('Business English');
    expect(goalStage.collect()).toEqual({ targetGoal: 'Business English' });
  });

  it('fires onChange when a goal is selected', () => {
    let changed = false;
    goalStage.mount({ container, onChange: () => { changed = true; } });
    clickGoal('Travel English');
    expect(changed).toBe(true);
  });

  it('unmount tears down listeners and clears the container', () => {
    goalStage.mount({ container });
    goalStage.unmount();
    expect(container.innerHTML).toBe('');
    expect(goalStage.collect()).toEqual({ targetGoal: null });
  });
});
