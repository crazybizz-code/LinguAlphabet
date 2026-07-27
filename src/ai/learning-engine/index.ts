/**
 * src/ai/learning-engine — Phase 4A: Signals → Learner State. A
 * deterministic reasoning layer, not a repository (no I/O — see
 * engine.ts) and not a recommendation or coaching system (deliberately
 * out of scope this phase, see docs/ai-coach-audit.md's roadmap).
 *
 * LearnerRepository (src/ai/data/learner-repository.ts) is the one
 * caller today: it fetches signals via SignalRepository, calls
 * computeLearnerState(), and projects the result into the thinner
 * LearnerProfile shape the prompt already consumes. A future consumer
 * (a Coach Planner, a debug view) can call computeLearnerState()
 * directly for the full picture instead.
 */
export type { LearnerState, TopicMasteryRecord, MasteryStatus, LearnerMomentum, LearnerStateOpenQuestion } from "./types";
export { MASTERY_STATUSES } from "./types";
export { computeLearnerState } from "./engine";
