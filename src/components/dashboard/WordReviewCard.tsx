import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Layers } from "lucide-react";

export interface WordReviewCardProps {
  /** Words due today or overdue (src/lib/vocabulary/review.ts) — this card doesn't render at all when there's nothing due yet. */
  dueCount: number;
}

/**
 * The one daily touchpoint for spaced-repetition review (Execution Sprint
 * P1 — Learning Engine): words the learner explicitly saved eventually
 * come back due, independent of Today's Mission's fixed article+podcast
 * slots. Deliberately its own card rather than a third Today's Mission
 * slot — that card's two-slot shape is an intentional, documented
 * boundary (docs/content-lifecycle.md §5), not something to stretch.
 */
export function WordReviewCard({ dueCount }: WordReviewCardProps) {
  if (dueCount <= 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.35 }}
      className="mt-5 px-5 sm:px-8"
      aria-labelledby="word-review-heading"
    >
      <Link
        href="/review"
        className="group flex items-center gap-4 rounded-[1.75rem] border border-border bg-bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg sm:p-6"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-lighter text-primary">
          <Layers className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          {/* A heading, not a paragraph: this is a section of Home in its
              own right, and heading navigation was skipping straight past
              it to the recommendations. */}
          <h2 id="word-review-heading" className="font-bold text-text-primary">
            {dueCount} {dueCount === 1 ? "word" : "words"} ready for review
          </h2>
          <p className="mt-0.5 text-sm text-text-secondary">Quick recall practice for words you&apos;ve already saved</p>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 text-text-secondary transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
      </Link>
    </motion.section>
  );
}
