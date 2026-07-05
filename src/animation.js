// ============================================================
// animation.js — Shared animation helpers
//
// Durations/easings mirror the CSS custom properties defined in
// styles/tokens.css exactly, so JS-driven timing (setTimeout delays)
// never drifts from what the stylesheet declares.
// ============================================================

export const DURATION = {
  fast: 150,   // --dur-fast
  normal: 250, // --dur-normal
  slow: 400    // --dur-slow
};

export const EASE = {
  standard: 'cubic-bezier(0.4, 0, 0.2, 1)',   // --ease
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // --ease-spring
  out: 'cubic-bezier(0, 0, 0.2, 1)'            // --ease-out
};

// Staged reveal: adds `.is-revealed` to each element in turn, one
// `stagger`ms after the previous. Elements are expected to already
// carry the `.ds-reveal` base class (hidden/offset resting state) from
// styles/components.css — this just triggers the transition per
// element instead of all at once.
export function revealSequence(elements, { stagger = 120 } = {}) {
  const timers = elements.filter(Boolean).map((el, i) =>
    setTimeout(() => el.classList.add('is-revealed'), i * stagger)
  );
  return () => timers.forEach(clearTimeout);
}

// Marks elements as exiting. See the `.is-exiting` rule in
// components.css for why this must cancel `animation` explicitly
// rather than relying on a plain class-based opacity change: a
// completed `forwards`-fill entrance animation otherwise overrides a
// later plain CSS transition on the same property.
export function prepareExit(elements) {
  elements.filter(Boolean).forEach(el => el.classList.add('is-exiting'));
}

// Default cross-fade transition used by the router between screens.
export function crossFade({ outgoing, incoming, duration = DURATION.normal } = {}) {
  return new Promise(resolve => {
    if (incoming) {
      incoming.style.opacity = '0';
      requestAnimationFrame(() => {
        incoming.style.transition = `opacity ${duration}ms ${EASE.standard}`;
        incoming.style.opacity = '1';
      });
    }
    if (outgoing) {
      outgoing.style.transition = `opacity ${duration}ms ${EASE.standard}`;
      outgoing.style.opacity = '0';
    }
    setTimeout(resolve, duration);
  });
}
