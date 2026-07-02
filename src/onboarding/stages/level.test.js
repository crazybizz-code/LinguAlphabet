// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { levelStage, LEVEL_OPTIONS, LEVEL_UNKNOWN_VALUE } from './level.js';
import { LEARNING_LEVELS } from '../../profile/learningBrainProfile.js';

let container;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  levelStage.unmount();
});

function clickLevel(value) {
  container.querySelector(`.ob2-chip[data-value="${value}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('levelStage', () => {
  it('has the expected id', () => {
    expect(levelStage.id).toBe('level');
  });

  it('renders the 6 canonical levels plus the "I don\'t know" option', () => {
    levelStage.mount({ container });
    expect(container.querySelectorAll('.ob2-chip')).toHaveLength(7);
    expect(LEVEL_OPTIONS.map(o => o.value)).toEqual([...LEARNING_LEVELS, LEVEL_UNKNOWN_VALUE]);
  });

  it('renders the level vocabulary from the schema module, not a local duplicate', () => {
    levelStage.mount({ container });
    for (const level of LEARNING_LEVELS) {
      expect(container.querySelector(`.ob2-chip[data-value="${level}"]`)).not.toBeNull();
    }
  });

  it('has nothing pre-selected by default (no CEFR/level is assumed)', () => {
    levelStage.mount({ container });
    expect(levelStage.validate()).toBe(false);
    expect(levelStage.collect()).toEqual({ selectedLevel: null, needsLevelAssessment: false });
  });

  it('never renders or references a CEFR value anywhere in the DOM', () => {
    levelStage.mount({ container });
    expect(container.innerHTML).not.toMatch(/\bA1\b|\bA2\b|\bB1\b|\bB2\b|\bC1\b|\bC2\b|CEFR/);
  });

  it('selecting a concrete level stores it exactly as chosen, with no CEFR mapping', () => {
    levelStage.mount({ container });
    clickLevel('Upper Intermediate');
    expect(levelStage.validate()).toBe(true);
    expect(levelStage.collect()).toEqual({ selectedLevel: 'Upper Intermediate', needsLevelAssessment: false });
  });

  it('selecting "I don\'t know my level" sets needsLevelAssessment with no selectedLevel', () => {
    levelStage.mount({ container });
    clickLevel(LEVEL_UNKNOWN_VALUE);
    expect(levelStage.validate()).toBe(true);
    expect(levelStage.collect()).toEqual({ selectedLevel: null, needsLevelAssessment: true });
  });

  it('resumes a previously self-reported level from initialData', () => {
    levelStage.mount({ container, initialData: { selectedLevel: 'Beginner', needsLevelAssessment: false } });
    expect(levelStage.collect()).toEqual({ selectedLevel: 'Beginner', needsLevelAssessment: false });
  });

  it('resumes a previous "I don\'t know" choice from initialData', () => {
    levelStage.mount({ container, initialData: { selectedLevel: null, needsLevelAssessment: true } });
    expect(levelStage.collect()).toEqual({ selectedLevel: null, needsLevelAssessment: true });
  });

  it('switching from a concrete level to "I don\'t know" clears the concrete selection', () => {
    levelStage.mount({ container });
    clickLevel('Advanced');
    clickLevel(LEVEL_UNKNOWN_VALUE);
    expect(levelStage.collect()).toEqual({ selectedLevel: null, needsLevelAssessment: true });
  });

  it('unmount clears state so collect() reflects no selection', () => {
    levelStage.mount({ container });
    clickLevel('Intermediate');
    levelStage.unmount();
    expect(container.innerHTML).toBe('');
    expect(levelStage.collect()).toEqual({ selectedLevel: null, needsLevelAssessment: false });
  });
});
