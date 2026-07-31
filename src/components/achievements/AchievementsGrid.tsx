"use client";

import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACHIEVEMENT_CATALOG } from "@/lib/achievements/catalog";

export interface AchievementsGridProps {
  earnedAchievementIds: Set<string>;
  /** Delay before the first card's stagger starts — each caller places this grid at a different point in its own section sequence. */
  baseDelay?: number;
}

/**
 * Shared by Progress's "Milestones" and Profile's "Achievements" sections —
 * same catalog, same earned/locked treatment, same layout. Each caller
 * keeps its own section header (icon + title differ), only the grid itself
 * is shared.
 */
export function AchievementsGrid({ earnedAchievementIds, baseDelay = 0 }: AchievementsGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
      {ACHIEVEMENT_CATALOG.map((achievement, index) => {
        const unlocked = earnedAchievementIds.has(achievement.id);
        return (
          <motion.div
            key={achievement.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: baseDelay + index * 0.05 }}
            className={cn(
              "flex items-center gap-3 rounded-2xl border p-4 transition-all",
              unlocked ? "border-border bg-bg-card" : "border-border/60 bg-bg-muted/50 opacity-60",
            )}
          >
            <div
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-2xl",
                unlocked ? "bg-primary-lighter" : "bg-bg-muted",
              )}
            >
              <span className="text-xl" aria-hidden="true">
                {achievement.icon}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-text-primary">{achievement.title}</p>
              {/* text-secondary (4.76:1), not tertiary (2.56:1) — the
                  description is the only thing that says what an
                  achievement is for. Shared with Progress and Profile, so
                  all three surfaces get the same fix. */}
              <p className="text-xs text-text-secondary">{achievement.description}</p>
            </div>
            {unlocked && <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden="true" />}
          </motion.div>
        );
      })}
    </div>
  );
}
