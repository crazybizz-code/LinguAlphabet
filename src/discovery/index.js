// ============================================================
// discovery/index.js — Discovery Session experience layer
// ============================================================
// Public entry point for the Discovery Session's conversational
// scenes. This module owns presentation only: the adaptive engine,
// state machine, confidence model, and Learning Brain integration
// defined by the Engineering Specification are unchanged and are not
// referenced here. Scene 1 (Meet Tuto) is the only scene implemented
// so far; later scenes register alongside it as they land.

export { createMeetTutoScene, meetTutoScene } from './scenes/meetTuto.js';
export { createScene, isValidScene } from './scenes/sceneDescriptor.js';
