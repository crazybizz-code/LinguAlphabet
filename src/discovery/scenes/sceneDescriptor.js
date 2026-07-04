// ============================================================
// sceneDescriptor.js — Discovery Session scene contract
// ============================================================
// Mirrors onboarding/stages/stageDescriptor.js. A scene is simpler
// than an onboarding stage: it has nothing to validate or collect —
// the Discovery Session's state machine (Engineering Specification,
// unchanged) owns answers and progression. A scene only renders
// itself into a container and tears down cleanly.

export const SCENE_METHOD_KEYS = Object.freeze(['mount', 'unmount']);

/**
 * A scene descriptor's contract:
 *   id: string           unique, stable scene identifier
 *   mount(ctx): void     render the scene into ctx.container
 *   unmount(): void      clear timers/listeners/DOM before leaving
 */
export function createScene(descriptor) {
  if (typeof descriptor !== 'object' || descriptor === null) {
    throw new Error('createScene: descriptor must be an object');
  }

  if (typeof descriptor.id !== 'string' || !descriptor.id) {
    throw new Error('createScene: descriptor.id must be a non-empty string');
  }

  for (const key of SCENE_METHOD_KEYS) {
    if (typeof descriptor[key] !== 'function') {
      throw new Error(`createScene: descriptor.${key} must be a function (scene "${descriptor.id}")`);
    }
  }

  return Object.freeze({
    id: descriptor.id,
    mount: descriptor.mount,
    unmount: descriptor.unmount,
  });
}

/** True if `value` satisfies the scene contract. Never throws. */
export function isValidScene(value) {
  try {
    createScene(value);
    return true;
  } catch {
    return false;
  }
}
