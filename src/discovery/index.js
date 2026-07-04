// ============================================================
// discovery/index.js — Discovery Session experience layer
// ============================================================
// Public entry point for the Discovery Session's conversational
// scenes. This module owns presentation only: the adaptive engine,
// state machine, confidence model, and Learning Brain integration
// defined by the Engineering Specification are unchanged and are not
// referenced here. Scene 1 (Meet Tuto / First Light) hands its
// { preferredName } payload to Scene 2 (Self Level Reflection) as
// ctx.initialData; Scene 2 hands { selfAssessedLevel } onward the
// same way. Later scenes register alongside these as they land.

export { createMeetTutoScene, meetTutoScene } from './scenes/meetTuto.js';
export {
  createSelfLevelReflectionScene,
  selfLevelReflectionScene,
} from './scenes/selfLevelReflection.js';
export { createScene, isValidScene } from './scenes/sceneDescriptor.js';
