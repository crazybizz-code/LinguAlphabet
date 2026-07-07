import type { TargetAndTransition, Transition, Variants } from "framer-motion";

/**
 * Durations/easings mirror the CSS custom properties in globals.css
 * exactly, so JS-driven motion never drifts from what the stylesheet
 * declares. Keep both in sync by hand.
 */
export const EASE = {
  standard: [0.4, 0, 0.2, 1],
  spring: [0.34, 1.56, 0.64, 1],
  out: [0, 0, 0.2, 1],
  push: [0.32, 0.72, 0, 1],
} as const;

export const DURATION = {
  fast: 0.15,
  normal: 0.25,
  slow: 0.4,
  push: 0.45,
} as const;

/** Apple HIG-approximate spring (mass: 1, stiffness: 120, damping: 14). */
export const SPRING_TRANSITION: Transition = {
  type: "spring",
  mass: 1,
  stiffness: 120,
  damping: 14,
};

/** Fade + slide up — the default entrance for most cards/text blocks. */
export const fadeSlideUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.normal, ease: EASE.out },
  },
};

/** Fade + slide down — used for headers entering from above. */
export const fadeSlideDown: Variants = {
  hidden: { opacity: 0, y: -12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.normal, ease: EASE.out },
  },
};

/** Scale + fade — speech/selection cards. */
export const fadeScaleIn: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: DURATION.normal, ease: EASE.out },
  },
};

/** Spring rise — Tuto's hero entrance (translateY +32 -> 0, scale 0.92 -> 1). */
export const mascotSpringRise: Variants = {
  hidden: { opacity: 0, y: 32, scale: 0.92 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.6, ...SPRING_TRANSITION },
  },
};

/** Small pop — floating badges around Tuto. */
export const badgePop: Variants = {
  hidden: { opacity: 0, y: 8, scale: 0.7 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.4, ...SPRING_TRANSITION },
  },
};

/** Invalid-submit shake — horizontal -6px -> +6px, 300ms. */
export const shake: Variants = {
  shake: {
    x: [0, -6, 6, -6, 6, 0],
    transition: { duration: 0.3, ease: EASE.standard },
  },
};

/** Screen-to-screen push transition (Apple-style navigation push). */
export const screenPush = {
  initial: { x: "100%" },
  animate: { x: 0, transition: { duration: DURATION.push, ease: EASE.push } },
  exit: { x: "-100%", transition: { duration: DURATION.push, ease: EASE.push } },
};

/** Cross-fade — default transition between screens with no directional relationship. */
export const crossFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: DURATION.normal, ease: EASE.standard } },
  exit: { opacity: 0, transition: { duration: DURATION.normal, ease: EASE.standard } },
};

export type TutoAnimation = "float" | "floatSm" | "breathe" | "none";

/**
 * Tuto's idle-loop animations — three distinct intensities used across
 * different screens (Base44 export): a big float for hero moments, a
 * smaller float for inline/compact moments, and a breathing scale for
 * "thinking/waiting" moments. `none` renders Tuto perfectly still.
 */
export const tutoIdleAnimation: Record<TutoAnimation, { animate: TargetAndTransition; transition?: Transition }> = {
  float: { animate: { y: [0, -12, 0] }, transition: { duration: 4, repeat: Infinity, ease: "easeInOut" } },
  floatSm: { animate: { y: [0, -6, 0] }, transition: { duration: 3, repeat: Infinity, ease: "easeInOut" } },
  breathe: { animate: { scale: [1, 1.04, 1] }, transition: { duration: 3.5, repeat: Infinity, ease: "easeInOut" } },
  none: { animate: {} },
};
