import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, BookOpen, Clock, Headphones, Sparkles } from "lucide-react";

export interface ExamReadinessCardProps {
  /** Hidden once the learner has a plan — see supabase/placement-assessment-flag.sql. */
  placementCompleted: boolean;
  /** Used for the greeting line, so the mission reads as addressed to them rather than posted at them. */
  displayName: string;
}

/**
 * Exam Readiness — which, until the placement assessment is done, is the
 * placement assessment.
 *
 * The Base44 redesign draws these as two separate things: a placement CTA
 * and an "Exam Readiness" panel whose only defined state is empty ("No
 * data yet · Complete your Placement Test to unlock your IELTS
 * insights"). Shipping both would put the same request on screen twice,
 * 200px apart, so they are one card here.
 *
 * Two states, not three:
 *   - not placed  -> this card, the learner's first mission
 *   - placed      -> nothing
 *
 * There is deliberately no populated readiness state yet. Per-skill band
 * estimates come from the mock engine, which is a separate feature and
 * explicitly out of scope; inventing a readiness score from a
 * self-reported band would be a fabricated diagnosis dressed up as
 * insight. When the mock engine lands, the populated state slots in
 * behind `placementCompleted === true` and this card stops being
 * pre-placement-only.
 *
 * Rendered above Today's Mission and given the brand fill, because until
 * it is done every other recommendation is working from a self-reported
 * band rather than evidence — this genuinely is the highest-value next
 * action, not merely a new card competing for attention.
 */
export function ExamReadinessCard({ placementCompleted, displayName }: ExamReadinessCardProps) {
  if (placementCompleted) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15 }}
      className="mt-5 px-5 sm:px-8"
      aria-labelledby="exam-readiness-heading"
    >
      {/* TEMPORARY, and a deliberate MVP decision rather than an
          oversight: the Reading & Listening assessment engine is a
          separate feature not yet built. /ai-plan already performs the AI
          analysis and renders the plan, so it stands in as the end of the
          chain. When the assessment ships, this href is the single place
          that changes — point it at the assessment, and let the
          assessment navigate on to /ai-plan when it finishes. */}
      <Link
        href="/ai-plan"
        className="group block rounded-[1.75rem] bg-primary p-5 text-text-on-primary shadow-glow transition-all hover:-translate-y-0.5 hover:shadow-lg sm:p-6"
      >
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-on-primary/80">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Your first mission
        </p>

        <h2 id="exam-readiness-heading" className="mt-1.5 font-heading text-xl font-extrabold leading-tight sm:text-2xl">
          Reading &amp; Listening Placement Test
        </h2>

        <p className="mt-2 max-w-md text-sm leading-relaxed text-text-on-primary/85">
          {displayName ? `${displayName}, this` : "This"} is how Tuto finds your real IELTS level — and unlocks the exam
          insights on this page.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Chip icon={BookOpen} label="Reading" />
          <Chip icon={Headphones} label="Listening" />
          <Chip icon={Clock} label="About 15 min" />
        </div>

        <span className="mt-5 inline-flex items-center gap-2 rounded-full bg-bg-card px-5 py-2.5 text-sm font-semibold text-primary">
          Start Placement Test
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
