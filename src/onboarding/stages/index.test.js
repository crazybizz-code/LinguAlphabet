import { describe, it, expect } from 'vitest';
import { STAGE_REGISTRY } from './index.js';

describe('STAGE_REGISTRY', () => {
  it('ships empty until stage modules are registered in a later phase', () => {
    expect(STAGE_REGISTRY).toHaveLength(0);
    expect(Object.isFrozen(STAGE_REGISTRY)).toBe(true);
  });
});
