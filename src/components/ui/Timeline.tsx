import { motion } from "framer-motion";

export interface TimelineItem {
  week: string;
  goal: string;
}

export interface TimelineProps {
  items: TimelineItem[];
  baseDelay?: number;
}

/** Connected-dot roadmap list — the 8-Week Roadmap on the plan-reveal screen. */
export function Timeline({ items, baseDelay = 1 }: TimelineProps) {
  return (
    <div className="relative pl-6">
      <div className="absolute top-2 bottom-2 left-2 w-0.5 bg-primary-light" aria-hidden="true" />
      {items.map((item, index) => (
        <motion.div
          key={item.week}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: baseDelay + index * 0.15 }}
          className="relative mb-5 last:mb-0"
        >
          <div className="absolute top-1 -left-[18px] h-3.5 w-3.5 rounded-full border-2 border-bg-card bg-primary shadow-sm" />
          <p className="mb-0.5 text-caption font-semibold text-primary">{item.week}</p>
          <p className="text-small text-text-secondary">{item.goal}</p>
        </motion.div>
      ))}
    </div>
  );
}
