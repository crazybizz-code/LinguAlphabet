// ============================================================
// guestMigration.js — preserve a completed Learning Brain across auth
// ============================================================
// Reuses the existing Authentication architecture end to end: no new
// Supabase calls, no new UserState fields, no new sync mechanism.
// This module only reconciles one flag (hasCompletedAssessment)
// against the LearningBrainProfile that UserState already carries,
// at the two points auth already mutates identity — sign-up and
// sign-in.
//
// Why this is enough to "never lose user data":
//   - signUp()/signIn() only ever touch identity fields (userId,
//     email, username, isGuest) — learningBrain is never cleared by
//     them, so it survives the identity swap unchanged.
//   - db.js's syncToRemote()/syncFromRemote() now carry
//     learning_brain using the SAME OR-fallback merge pattern already
//     used for every other profile field there
//     (`this._data.X = profile.x || this._data.X`). That pattern
//     already IS the correct migration policy: a signed-in user's
//     remote brain wins if the server has one; otherwise whatever is
//     already local (e.g. a guest's freshly-completed brain) is left
//     untouched. No extra merge logic is needed here.
//   - The one thing the existing sync code gets wrong on its own:
//     UserState.syncFromRemote() sets hasCompletedAssessment from the
//     remote's has_completed_assessment boolean unconditionally when
//     present — which can stomp `true` back to `false` for a guest
//     whose complete local brain the OR-fallback merge just
//     preserved. reconcileOnboardingCompletionState() is the fix:
//     called after that merge, it re-derives the flag from whichever
//     learningBrain ended up being authoritative.

/**
 * Ensures hasCompletedAssessment matches learningBrain.onboardingCompleted.
 * Call this after any UserState mutation that could have changed which
 * LearningBrainProfile is authoritative — the sign-up identity update,
 * or sign-in's syncFromRemote() merge.
 *
 * @param {{ get: (key: string) => any, update: (patch: object) => void }} userState
 * @returns {boolean} true if a completed brain was found (and the flag set to match)
 */
export function reconcileOnboardingCompletionState(userState) {
  const hasCompletedBrain = Boolean(userState.get('learningBrain')?.onboardingCompleted);
  userState.update({ hasCompletedAssessment: hasCompletedBrain });
  return hasCompletedBrain;
}
