import Image from "next/image";
import { cn } from "@/lib/utils";

export type TutoPose =
  | "wave"
  | "listening"
  | "thinking"
  | "happy"
  | "pointing"
  | "holding-clock"
  | "typing-laptop"
  | "celebrating";

const MASCOT_BASE_PATH = "/assets/mascot/";

/**
 * The official asset package's own filenames don't match their content
 * for 3 of the 8 poses (found while building the prior implementation):
 * `thinking.png` is actually a cheering/confetti pose, `celebrating.png`
 * is actually a hand-on-chin thinking pose; `happy.png` holds a clock,
 * `holding-clock.png` is the big-smile happy pose; `pointing.png` is
 * sitting at a laptop, `typing-laptop.png` is a pointing gesture. This
 * maps the semantic pose every screen asks for to the file that
 * actually shows it, without renaming the underlying package files.
 * `wave`/`listening` are visually similar (both a raised open hand) and
 * ambiguous which is "more correct" — left unmapped.
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
};

export interface TutoProps {
  pose?: TutoPose;
  /** Pixel size of the square container Tuto is rendered in. */
  size?: number;
  /** Soft ambient glow behind Tuto, used for hero moments. */
  glow?: boolean;
  alt?: string;
  className?: string;
  priority?: boolean;
}

/**
 * Renders the official LinguAlphabet Tuto mascot renders exactly as
 * provided — never recreate, redraw, or vectorize Tuto. The source
 * renders are not uniformly square, so object-fit: contain (Next/Image
 * with `fill`) letterboxes them safely regardless of aspect ratio.
 */
export function Tuto({
  pose = "wave",
  size = 160,
  glow = false,
  alt = "Tuto, the AI English Coach",
  className,
  priority = false,
}: TutoProps) {
  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      {glow && (
        <div
          className="absolute -inset-[12%] rounded-full"
          style={{
            background:
              "radial-gradient(circle, var(--color-primary-soft) 0%, var(--color-primary-soft-2) 45%, rgba(255,107,74,0) 72%)",
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
      <Image
        src={`${MASCOT_BASE_PATH}${POSE_FILE[pose]}.png`}
        alt={alt}
        fill
        priority={priority}
        sizes={`${size}px`}
        className="relative z-[1] object-contain motion-safe:animate-tuto-float"
      />
    </div>
  );
}
