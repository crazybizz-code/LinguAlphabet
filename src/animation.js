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
  out: 'cubic-bezier(0, 0, 0.2, 1)',           // --ease-out
  push: 'cubic-bezier(0.32, 0.72, 0, 1)'       // --ease-push, animation-system.md
};

// accessibility.md: "Respect prefers-reduced-motion: reduce by disabling
// spring animations and typewriter delays, using simple 200ms cross-fades
// instead." Every helper below that does its own inline animation (not
// just toggling a CSS class already covered by the stylesheet's own
// `@media (prefers-reduced-motion: reduce)` rules) checks this first.
export function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

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

// Same as revealSequence, but for entrance choreography that isn't an
// even stagger — each phase's interaction.md gives every element its
// own explicit delay (e.g. header @150ms, hero @300ms, card @600ms).
// Pass `[[el, delayMs], ...]`.
export function revealWithDelays(pairs) {
  const timers = pairs
    .filter(([el]) => el)
    .map(([el, delay]) => setTimeout(() => el.classList.add('is-revealed'), delay));
  return () => timers.forEach(clearTimeout);
}

// Invalid-submit shake — interaction.md: "card shakes horizontally
// (-6px -> +6px, 300ms)". Removes/reflows/re-adds the class so it
// replays even if the element is already mid- or post-shake.
export function shake(el) {
  if (!el) return;
  el.classList.remove('ds-shake');
  void el.offsetWidth;
  el.classList.add('ds-shake');
}

// Precise fade+slide(+scale) entrance for the cases where a phase's
// interaction.md gives an element its own exact duration/delay/easing
// (most of them do, and the curves differ per element) rather than a
// value covered by the shared `.ds-reveal` utility's fixed timing.
export function fadeSlideIn(el, { delay = 0, duration = 300, easing = EASE.standard, fromY = 16, fromScale = 1 } = {}) {
  if (!el) return;

  if (prefersReducedMotion()) {
    el.style.transition = 'opacity 200ms ease-out';
    el.style.opacity = '0';
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    return;
  }

  const transformAt = (y, s) => `translate3d(0, ${y}px, 0)${s !== 1 ? ` scale(${s})` : ''}`;

  el.style.opacity = '0';
  el.style.transform = transformAt(fromY, fromScale);

  setTimeout(() => {
    el.style.transition = `opacity ${duration}ms ${easing}, transform ${duration}ms ${easing}`;
    el.style.opacity = '1';
    el.style.transform = transformAt(0, 1);
  }, delay);
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
  if (prefersReducedMotion()) duration = 200;
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

// Screen-to-screen push transition used between onboarding phases —
// animation-system.md: "Screen Exit Push: Viewport pushes left
// (TranslateX 0% -> -100%, 450ms, cubic-bezier(0.32, 0.72, 0, 1))".
// The incoming screen pushes in from the right in the same motion
// (standard iOS navigation push), matching every phase's own
// "screen pushes left ... navigating to Phase N" interaction.md note.
export function slidePush({ outgoing, incoming, duration = 450 } = {}) {
  if (prefersReducedMotion()) return crossFade({ outgoing, incoming, duration: 200 });

  return new Promise(resolve => {
    if (incoming) {
      incoming.style.transform = 'translate3d(100%, 0, 0)';
      requestAnimationFrame(() => {
        incoming.style.transition = `transform ${duration}ms ${EASE.push}`;
        incoming.style.transform = 'translate3d(0, 0, 0)';
      });
    }
    if (outgoing) {
      outgoing.style.transition = `transform ${duration}ms ${EASE.push}`;
      outgoing.style.transform = 'translate3d(-100%, 0, 0)';
    }
    setTimeout(resolve, duration);
  });
}
