// ============================================================
// stageDescriptor.js — onboarding stage contract
// ============================================================
// Defines the shape every onboarding stage must implement and a
// factory that validates a descriptor against that shape. This is
// infrastructure only: it does not render anything, does not drive
// transitions between stages, and does not touch the DOM itself.
// The flow controller that mounts stages in sequence (machine.js)
// is out of scope for this phase.

export const STAGE_METHOD_KEYS = Object.freeze(['mount', 'validate', 'collect', 'unmount']);

/**
 * A stage descriptor's contract:
 *   id: string                     unique, stable stage identifier
 *   mount(ctx): void                render the stage into its container
 *   validate(): boolean             can the user proceed from this stage?
 *   collect(): object               this stage's contribution to onboarding answers
 *   unmount(): void                 teardown listeners/DOM before leaving
 *
 * `ctx` passed to mount() is intentionally undefined at this phase —
 * the machine that will define and pass it does not exist yet.
 */
export function createStage(descriptor) {
  if (typeof descriptor !== 'object' || descriptor === null) {
    throw new Error('createStage: descriptor must be an object');
  }

  if (typeof descriptor.id !== 'string' || !descriptor.id) {
    throw new Error('createStage: descriptor.id must be a non-empty string');
  }

  for (const key of STAGE_METHOD_KEYS) {
    if (typeof descriptor[key] !== 'function') {
      throw new Error(`createStage: descriptor.${key} must be a function (stage "${descriptor.id}")`);
    }
  }

  return Object.freeze({
    id: descriptor.id,
    mount: descriptor.mount,
    validate: descriptor.validate,
    collect: descriptor.collect,
    unmount: descriptor.unmount,
  });
}

/** True if `value` satisfies the stage contract. Never throws. */
export function isValidStage(value) {
  try {
    createStage(value);
    return true;
  } catch {
    return false;
  }
}
