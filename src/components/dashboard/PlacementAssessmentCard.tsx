import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Clock, Headphones, BookOpen } from "lucide-react";

export interface PlacementAssessmentCardProps {
  /** Hidden once the learner has a plan — see supabase/placement-assessment-flag.sql. */
  placementCompleted: boolean;
  /** Used for the greeting line, so the mission reads as addressed to them rather than posted at them. */
  displayName: string;
}

/**
 * The learner's first mission: the Reading & Listening placement test.
 *
 * Deliberately a mission on the Dashboard rather than the final step of
 * onboarding. Ending the wizard on a 15-minute test makes the test feel
 * like more paperwork before the product starts; ending on the Dashboard
 * with the test waiting as mission one makes it the first thing they do
 * *inside* the product. Same task, opposite framing.
 *
 * Rendered above Today's Mission and given the brand fill, because until
 * it is done every other recommendation is working from a self-reported
 * band rather than evidence — this genuinely is the highest-value next
 * action, not merely a new card competing for attention.
 *
 * Disappears entirely once completed rather than showing a "done" state:
 * a permanent tick is clutter, and the plan it produces is already
 * visible elsewhere.
 */
export function PlacementAssessmentCard({ placementCompleted, displayName }: PlacementAssessmentCardProps) {
  if (placementCompleted) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15 }}
      className="mt-5 px-5 sm:px-8"
      aria-labelledby="placement-mission-heading"
    >
      <Link
        href="/ai-plan"
        className="group block rounded-[1.75rem] bg-primary p-5 text-text-on-primary shadow-glow transition-all hover:-translate-y-0.5 hover:shadow-lg sm:p-6"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-text-on-primary/80">Your first mission</p>

        <h2 id="placement-mission-heading" className="mt-1.5 font-heading text-xl font-extrabold leading-tight sm:text-2xl">
          Reading &amp; Listening Placement Test
        </h2>

        <p className="mt-2 max-w-md text-sm leading-relaxed text-text-on-primary/85">
          {displayName ? `${displayName}, this` : "This"} is how Tuto finds your real IELTS level — and builds a study
          plan around it.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Chip icon={BookOpen} label="Reading" />
          <Chip icon={Headphones} label="Listening" />
          <Chip icon={Clock} label="About 15 min" />
        </div>

        <span className="mt-5 inline-flex items-center gap-2 rounded-full bg-bg-card px-5 py-2.5 text-sm font-semibold text-primary">
          Start assessment
          <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
        </span>
      </Link>
    </motion.section>
  );
}

function Chip({ icon: Icon, label }: { icon: typeof Clock; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-text-on-primary/15 px-3 py-1 text-xs font-medium">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}
