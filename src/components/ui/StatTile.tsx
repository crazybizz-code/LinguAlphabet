import type { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";

export interface StatTileProps {
  icon: LucideIcon;
  iconClassName: string;
  value: string;
  label: string;
  subtext?: string;
  delay?: number;
}

/** Stat card on the plan-reveal screen (Daily Goal, Weekly Target, ...). */
export function StatTile({ icon: Icon, iconClassName, value, label, subtext, delay = 0 }: StatTileProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-lg border border-border bg-bg-card p-5 shadow-soft"
    >
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-md ${iconClassName}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="font-heading text-h2 font-extrabold text-text-primary">{value}</p>
      <p className="mt-0.5 text-small text-text-secondary">{label}</p>
      {subtext && <p className="mt-1 text-caption text-text-tertiary">{subtext}</p>}
    </motion.div>
  );
}
