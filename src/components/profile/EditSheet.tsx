"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

export interface EditSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Shared chrome for every Learning Profile field editor (English Level,
 * Goal, Daily Time, Interests) — bottom sheet on mobile, centered modal on
 * desktop, per docs/design-system.md's premium-not-generic-dashboard bar.
 * Centering is done with flex, not a translate-based transform, so it
 * doesn't fight Framer Motion's own `y` transform on the panel.
 */
export function EditSheet({ open, title, onClose, children }: EditSheetProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/40"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            key="sheet"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.3, ease: [0, 0, 0.2, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="relative z-10 max-h-[85vh] w-full overflow-y-auto rounded-t-[2rem] bg-bg-card p-6 shadow-card-hero sm:max-w-lg sm:rounded-[2rem]"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-text-primary">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-bg-muted"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
