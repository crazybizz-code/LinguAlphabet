// ============================================================
// stages/index.js — STAGE_REGISTRY
// ============================================================
// Phase A ships the registry infrastructure only. No stage modules
// exist yet (welcome, reason, level selection, goal, commitment,
// motivation, review, initializing are all later phases), so the
// registry is intentionally empty. Later phases append descriptors
// here in onboarding order; nothing else in this file changes.

import { buildStageRegistry } from './registry.js';

export const STAGE_REGISTRY = buildStageRegistry([]);

export {
  getStageById,
  getStageIndex,
  getFirstStage,
  getNextStage,
  getPreviousStage,
  isLastStage,
} from './registry.js';

export { createStage, isValidStage } from './stageDescriptor.js';
