"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { tutoIdleAnimation, type TutoAnimation } from "@/lib/motion/variants";

export type TutoPose =
  | "wave"
  | "listening"
  | "thinking"
  | "happy"
  | "pointing"
  | "holding-clock"
  | "typing-laptop"
  | "celebrating"
  | "neutral";

const MASCOT_BASE_PATH = "/assets/mascot/";

/**
 * The official asset package's own filenames don't match their content
 * for 3 of the 8 contextual poses (found while building the prior
 * implementation): `thinking.png` is actually a cheering/confetti pose,
 * `celebrating.png` is actually a hand-on-chin thinking pose; `happy.png`
 * holds a clock, `holding-clock.png` is the big-smile happy pose;
 * `pointing.png` is sitting at a laptop, `typing-laptop.png` is a pointing
 * gesture. This maps the semantic pose every screen asks for to the file
 * that actually shows it, without renaming the underlying package files.
 * `wave`/`listening` are visually similar (both a raised open hand) and
 * ambiguous which is "more correct" — left unmapped. `neutral` is its own
 * dedicated asset (`master-tuto.png`, correctly named) — Tuto simply
 * standing, no gesture — reserved for surfaces that want Tuto's normal
 * presence without invoking a greeting (`wave` is Welcome/onboarding-only).
 */
const POSE_FILE: Record<TutoPose, string> = {
  wave: "wave",
  listening: "listening",
  thinking: "celebrating",
  celebrating: "thinking",
  happy: "holding-clock",
  "holding-clock": "happy",
  pointing: "typing-laptop",
  "typing-laptop": "pointing",
  neutral: "master-tuto",
};

const SIZE_CLASSES = {
  /** Compact inline presence — status rows, not a hero moment. */
  xs: "w-10 h-10",
  sm: "w-28 h-28 sm:w-36 sm:h-36",
  md: "w-40 h-40 sm:w-48 sm:h-48",
  lg: "w-52 h-52 sm:w-64 sm:h-64",
  xl: "w-64 h-64 sm:w-80 sm:h-80",
} as const;

/** Matches SIZE_CLASSES' actual rendered widths so `next/image` requests an
 * appropriately-sized source instead of always fetching the xl variant. */
const SIZE_SIZES = {
  xs: "40px",
  sm: "(min-width: 640px) 144px, 112px",
  md: "(min-width: 640px) 192px, 160px",
  lg: "(min-width: 640px) 256px, 208px",
  xl: "(min-width: 640px) 320px, 256px",
} as const;

export type TutoSize = keyof typeof SIZE_CLASSES;

export interface TutoProps {
  pose?: TutoPose;
  /** Responsive preset size (matches the approved Base44 spec exactly). */
  size?: TutoSize;
  /** Idle-loop animation — see lib/motion/variants.ts for exact timings. */
  animation?: TutoAnimation;
  /** Soft ambient glow behind Tuto, used for hero moments. */
  glow?: boolean;
  alt?: string;
  className?: string;
  priority?: boolean;
}

/**
 * Renders the official LinguABC Tuto mascot renders exactly as
 * provided — never recreate, redraw, mirror, crop, recolor, or vectorize
 * Tuto, and never synthesize a pose we don't have a real render for.
 * The source renders are not uniformly square, so object-fit: contain
 * (Next/Image with `fill`) letterboxes them safely regardless of aspect
 * ratio.
 */
export function Tuto({
  pose = "wave",
  size = "md",
  animation = "float",
  glow = false,
  alt = "Tuto, the AI English Coach",
  className,
  priority = false,
}: TutoProps) {
  const idle = tutoIdleAnimation[animation];

  return (
    <motion.div
      className={cn("relative flex items-center justify-center", SIZE_CLASSES[size], className)}
      animate={idle.animate}
      transition={idle.transition}
    >
      {glow && (
        <div
          className="absolute -inset-[12%] rounded-full"
          style={{
            background:
              "radial-gradient(circle, var(--color-primary-soft) 0%, var(--color-primary-soft-2) 45%, rgba(255,107,0,0) 72%)",
          }}
          aria-hidden="true"
        />
      )}
      <div
        className="absolute bottom-[2%] left-1/2 h-[10%] w-[55%] -translate-x-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(0,0,0,0.06) 0%, transparent 70%)",
        }}
        aria-hidden="true"
      />
      {/* The source PNGs have an opaque white backdrop, removed via
          mix-blend-mode: multiply — but blend-mode only sees backdrops
          painted within its own stacking context, and this component's
          transform-animated wrapper creates one, cutting it off from the
          real page background. This filler (matching the near-white bg
          every screen uses) gives it something to blend against. */}
      <div className="absolute inset-0 rounded-full bg-bg" aria-hidden="true" />
      <Image
        src={`${MASCOT_BASE_PATH}${POSE_FILE[pose]}.png`}
        alt={alt}
        fill
        priority={priority}
        sizes={SIZE_SIZES[size]}
        className="relative z-[1] object-contain"
        style={{ mixBlendMode: "multiply" }}
      />
    </motion.div>
  );
}
