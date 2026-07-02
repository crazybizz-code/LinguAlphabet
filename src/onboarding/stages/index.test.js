import { describe, it, expect } from 'vitest';
import { STAGE_REGISTRY } from './index.js';

describe('STAGE_REGISTRY', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(STAGE_REGISTRY)).toBe(true);
  });

  it('registers exactly the five Phase B stages, in flow order', () => {
    expect(STAGE_REGISTRY.map(stage => stage.id)).toEqual([
      'welcome',
      'goal',
      'level',
      'commitment',
      'motivation',
    ]);
  });

  it('every registered stage satisfies the full stage contract', () => {
    for (const stage of STAGE_REGISTRY) {
      expect(typeof stage.mount).toBe('function');
      expect(typeof stage.validate).toBe('function');
      expect(typeof stage.collect).toBe('function');
      expect(typeof stage.unmount).toBe('function');
    }
  });
});
