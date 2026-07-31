"use client";

import { motion } from "framer-motion";
import { Tuto } from "@/components/mascot/Tuto";
import { formatBand } from "@/lib/onboarding/constants";

export interface ProfileIdentityCardProps {
  displayName: string;
  email: string;
  /** Null until the learner reports one or the placement assessment establishes one — the badge is simply absent. */
  currentBand: number | null;
}

/**
 * Who this learner is, in one card: name, email, and — if they have one —
 * their band, worn as a badge on Tuto rather than stated as another
 * statistic.
 *
 * The badge is the whole reason this section exists. A band is an
 * identity to an IELTS candidate in a way "Level 3" never was, and
 * putting it here means the number the product is organized around is
 * the first thing on their own profile.
 *
 * No badge when the band is unknown. A "—" in a badge reads like a score
 * of nothing; absence reads like "not measured yet", which is the truth,
 * and the Current Band row directly below says so in words.
 */
export function ProfileIdentityCard({ displayName, email, currentBand }: ProfileIdentityCardProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="mt-6 rounded-[2rem] border border-border bg-bg-card p-6 shadow-sm sm:p-8"
      aria-labelledby="profile-identity-heading"
    >
      <div className="flex items-center gap-5">
        <div className="relative shrink-0">
          <div className="absolute inset-0 rounded-full bg-primary-soft blur-2xl" aria-hidden="true" />
          {/* `wave` is reserved for Welcome/first-time onboarding — Profile is
              a returning-learner surface, so it gets Tuto's normal presence
              instead of a greeting gesture. */}
          <Tuto pose="neutral" size="avatar" animation="float" priority className="relative" />
          {currentBand !== null && (
            <span className="absolute -bottom-1 -right-1 flex h-10 w-10 items-center justify-center rounded-full border-4 border-bg-card bg-primary text-xs font-bold text-text-on-primary shadow-lg">
              {formatBand(currentBand)}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <h2 id="profile-identity-heading" className="truncate text-xl font-bold tracking-tight text-text-primary sm:text-2xl">
            {displayName}
          </h2>
          <p className="mt-1 truncate text-sm text-text-secondary">{email}</p>
          <p className="mt-2 text-xs font-medium text-text-secondary">
            {currentBand !== null ? `IELTS Academic · Band ${formatBand(currentBand)}` : "IELTS Academic"}
          </p>
        </div>
      </div>
    </motion.section>
  );
}
