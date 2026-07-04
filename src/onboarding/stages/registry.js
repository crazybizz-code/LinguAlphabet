// ============================================================
// registry.js — stage registry helpers
// ============================================================
// Pure functions over an ordered array of stage descriptors. No
// module-level mutable state, no DOM — the registry array itself
// lives in stages/index.js and is passed in explicitly, which keeps
// these helpers trivially testable and reusable if the app ever
// needs more than one registry (e.g. a future onboarding variant).

import { createStage } from './stageDescriptor.js';

/**
 * Validates a list of raw stage descriptors, enforces unique ids,
 * and returns a frozen, ordered registry array.
 */
export function buildStageRegistry(descriptors = []) {
  const stages = descriptors.map(createStage);

  const seen = new Set();
  for (const stage of stages) {
    if (seen.has(stage.id)) {
      throw new Error(`buildStageRegistry: duplicate stage id "${stage.id}"`);
    }
    seen.add(stage.id);
  }

  return Object.freeze(stages);
}

export function getStageById(registry, id) {
  return registry.find(stage => stage.id === id) || null;
}

export function getStageIndex(registry, id) {
  return registry.findIndex(stage => stage.id === id);
}

export function getFirstStage(registry) {
  return registry.length > 0 ? registry[0] : null;
}

export function getNextStage(registry, currentId) {
  const index = getStageIndex(registry, currentId);
  if (index === -1 || index + 1 >= registry.length) return null;
  return registry[index + 1];
}

export function getPreviousStage(registry, currentId) {
  const index = getStageIndex(registry, currentId);
  if (index <= 0) return null;
  return registry[index - 1];
}

export function isLastStage(registry, id) {
  return getStageIndex(registry, id) === registry.length - 1;
}
