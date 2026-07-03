import { describe, it, expect } from 'vitest';
import {
  buildStageRegistry,
  getStageById,
  getStageIndex,
  getFirstStage,
  getNextStage,
  getPreviousStage,
  isLastStage,
} from './registry.js';

function stub(id) {
  return { id, mount() {}, validate() { return true; }, collect() { return {}; }, unmount() {} };
}

describe('buildStageRegistry', () => {
  it('builds a frozen, ordered registry from valid descriptors', () => {
    const registry = buildStageRegistry([stub('a'), stub('b'), stub('c')]);
    expect(registry.map(s => s.id)).toEqual(['a', 'b', 'c']);
    expect(Object.isFrozen(registry)).toBe(true);
  });

  it('returns an empty, frozen registry for an empty input', () => {
    const registry = buildStageRegistry([]);
    expect(registry).toHaveLength(0);
    expect(Object.isFrozen(registry)).toBe(true);
  });

  it('defaults to an empty registry when called with no arguments', () => {
    expect(buildStageRegistry()).toHaveLength(0);
  });

  it('rejects duplicate stage ids', () => {
    expect(() => buildStageRegistry([stub('a'), stub('a')])).toThrow(/duplicate/i);
  });

  it('propagates stage-contract validation errors for a malformed descriptor', () => {
    expect(() => buildStageRegistry([{ id: 'broken' }])).toThrow();
  });
});

describe('registry navigation', () => {
  const registry = buildStageRegistry([stub('a'), stub('b'), stub('c')]);

  it('getStageById finds an existing stage and returns null for an unknown id', () => {
    expect(getStageById(registry, 'b')?.id).toBe('b');
    expect(getStageById(registry, 'z')).toBeNull();
  });

  it('getStageIndex returns the position, or -1 when not found', () => {
    expect(getStageIndex(registry, 'b')).toBe(1);
    expect(getStageIndex(registry, 'z')).toBe(-1);
  });

  it('getFirstStage returns the first stage, or null for an empty registry', () => {
    expect(getFirstStage(registry)?.id).toBe('a');
    expect(getFirstStage(buildStageRegistry([]))).toBeNull();
  });

  it('getNextStage walks forward and returns null past the last stage', () => {
    expect(getNextStage(registry, 'a')?.id).toBe('b');
    expect(getNextStage(registry, 'b')?.id).toBe('c');
    expect(getNextStage(registry, 'c')).toBeNull();
  });

  it('getNextStage returns null for an unknown current id', () => {
    expect(getNextStage(registry, 'nope')).toBeNull();
  });

  it('getPreviousStage walks backward and returns null before the first stage', () => {
    expect(getPreviousStage(registry, 'c')?.id).toBe('b');
    expect(getPreviousStage(registry, 'b')?.id).toBe('a');
    expect(getPreviousStage(registry, 'a')).toBeNull();
  });

  it('getPreviousStage returns null for an unknown current id', () => {
    expect(getPreviousStage(registry, 'nope')).toBeNull();
  });

  it('isLastStage is true only for the final stage', () => {
    expect(isLastStage(registry, 'c')).toBe(true);
    expect(isLastStage(registry, 'a')).toBe(false);
    expect(isLastStage(registry, 'nope')).toBe(false);
  });
});
