import { describe, it, expect } from 'vitest';
import { createStage, isValidStage, STAGE_METHOD_KEYS } from './stageDescriptor.js';

function validDescriptor(overrides = {}) {
  return {
    id: 'welcome',
    mount() {},
    validate() { return true; },
    collect() { return {}; },
    unmount() {},
    ...overrides,
  };
}

describe('STAGE_METHOD_KEYS', () => {
  it('lists the full required-method contract', () => {
    expect(STAGE_METHOD_KEYS).toEqual(['mount', 'validate', 'collect', 'unmount']);
  });
});

describe('createStage', () => {
  it('accepts a fully-formed descriptor and freezes it', () => {
    const stage = createStage(validDescriptor());
    expect(stage.id).toBe('welcome');
    expect(Object.isFrozen(stage)).toBe(true);
  });

  it('rejects a non-object descriptor', () => {
    expect(() => createStage(null)).toThrow();
    expect(() => createStage('welcome')).toThrow();
  });

  it('rejects a missing or empty id', () => {
    expect(() => createStage(validDescriptor({ id: undefined }))).toThrow(/id/);
    expect(() => createStage(validDescriptor({ id: '' }))).toThrow(/id/);
  });

  it.each(['mount', 'validate', 'collect', 'unmount'])('rejects a descriptor missing %s()', (method) => {
    expect(() => createStage(validDescriptor({ [method]: undefined }))).toThrow(new RegExp(method));
  });

  it('rejects a descriptor where a required method is not a function', () => {
    expect(() => createStage(validDescriptor({ collect: 'not a function' }))).toThrow(/collect/);
  });
});

describe('isValidStage', () => {
  it('returns true for a valid descriptor', () => {
    expect(isValidStage(validDescriptor())).toBe(true);
  });

  it('returns false (never throws) for an invalid descriptor', () => {
    expect(isValidStage({ id: 'incomplete' })).toBe(false);
    expect(isValidStage(null)).toBe(false);
    expect(isValidStage(undefined)).toBe(false);
  });
});
