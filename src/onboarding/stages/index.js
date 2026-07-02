// ============================================================
// stages/index.js — STAGE_REGISTRY
// ============================================================
// Phase B registers the five stages built for this phase: Welcome,
// Goal Selection, English Level Selection, Daily Commitment, and
// Motivation — in that order. Learning Reason, Level Preview,
// Review, Learning Brain Initialization, and the Completion Card
// are not part of Phase B and are not registered here.
//
// This module is still unwired: nothing in the running app imports
// STAGE_REGISTRY yet. The flow controller that mounts these stages
// in sequence (machine.js) and the main.js/index.html integration
// are later work.

import { buildStageRegistry } from './registry.js';
import { welcomeStage } from './welcome.js';
import { goalStage } from './goal.js';
import { levelStage } from './level.js';
import { commitmentStage } from './commitment.js';
import { motivationStage } from './motivation.js';

export const STAGE_REGISTRY = buildStageRegistry([
  welcomeStage,
  goalStage,
  levelStage,
  commitmentStage,
  motivationStage,
]);

export {
  getStageById,
  getStageIndex,
  getFirstStage,
  getNextStage,
  getPreviousStage,
  isLastStage,
} from './registry.js';

export { createStage, isValidStage } from './stageDescriptor.js';
