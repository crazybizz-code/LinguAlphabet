"use client";

import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

export interface EditSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Locks background scrolling while a sheet is open — `overflow: hidden`
 * alone is well-known to still let iOS Safari scroll/rubber-band the
 * page behind a fixed-position overlay, so this uses the standard
 * cross-browser fix instead: pin the body at its current scroll offset
 * with `position: fixed`, then restore both the styles and the scroll
 * position on close.
 */
function useLockBodyScroll(locked: boolean) {
  useEffect(() => {
    if (!locked) return;

    const { body } = document;
    const scrollY = window.scrollY;
    const original = { position: body.style.position, top: body.style.top, width: body.style.width, overflow: body.style.overflow };

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";

    return () => {
      body.style.position = original.position;
      body.style.top = original.top;
      body.style.width = original.width;
      body.style.overflow = original.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [locked]);
}

/**
 * Shared chrome for every Learning Profile field editor (English Level,
 * Goal, Daily Time, Interests) — bottom sheet on mobile, centered modal on
 * desktop, per docs/design-system.md's premium-not-generic-dashboard bar.
 * Centering is done with flex, not a translate-based transform, so it
 * doesn't fight Framer Motion's own `y` transform on the panel.
 */
export function EditSheet({ open, title, onClose, children }: EditSheetProps) {
  useLockBodyScroll(open);

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
            // max-h-[85vh] is the fallback for browsers without dvh/svh
            // support; the later dvh/svh declarations win when supported,
            // per normal CSS cascade — same 85% proportion on every unit,
            // just no longer thrown off by mobile browser chrome resizing
            // the viewport (the classic plain-vh bottom-sheet bug).
            className="relative z-10 flex max-h-[85vh] max-h-[85svh] max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-[2rem] bg-bg-card shadow-card-hero sm:max-w-lg sm:rounded-[2rem]"
          >
            <div className="flex shrink-0 justify-center pt-3 sm:hidden" aria-hidden="true">
              <div className="h-1.5 w-10 rounded-full bg-border" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 pt-3 sm:pt-6">
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
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
