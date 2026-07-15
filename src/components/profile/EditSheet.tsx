"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
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

/** Drag-to-expand/dismiss thresholds — offset in px, velocity in px/s. Matches the feel of native iOS/Android bottom sheets: a small flick counts the same as a slow, longer drag. */
const EXPAND_OFFSET_THRESHOLD = 60;
const COLLAPSE_OFFSET_THRESHOLD = 60;
const DISMISS_OFFSET_THRESHOLD = 100;
const VELOCITY_THRESHOLD = 500;

/**
 * Shared chrome for every Learning Profile field editor (English Level,
 * Goal, Daily Time, Interests) — bottom sheet on mobile, centered modal on
 * desktop, per docs/design-system.md's premium-not-generic-dashboard bar.
 * Centering is done with flex, not a translate-based transform, so it
 * doesn't fight Framer Motion's own `y` transform on the panel.
 */
export function EditSheet({ open, title, onClose, children }: EditSheetProps) {
  useLockBodyScroll(open);
  // Resets to collapsed every time the sheet opens — AnimatePresence fully
  // unmounts this subtree while closed, so a fresh `useState(false)` here
  // is enough, no extra effect needed.
  const [expanded, setExpanded] = useState(false);

  /**
   * Three snap points, one step at a time (full -> partial -> dismissed),
   * matching how native bottom sheets behave — not a straight-line
   * mapping from drag distance to dismiss, so a small overshoot while
   * trying to collapse from full never accidentally closes the sheet.
   * A fast flick counts the same as a slower, longer drag, same as a
   * native sheet's velocity-aware snapping.
   */
  function handleHandleDragEnd(_event: unknown, info: PanInfo) {
    const offsetY = info.offset.y;
    const isFastUp = info.velocity.y < -VELOCITY_THRESHOLD;
    const isFastDown = info.velocity.y > VELOCITY_THRESHOLD;

    if (!expanded) {
      if (offsetY < -EXPAND_OFFSET_THRESHOLD || isFastUp) {
        setExpanded(true);
      } else if (offsetY > DISMISS_OFFSET_THRESHOLD || isFastDown) {
        onClose();
      }
      // else: released in the dead zone — Framer's dragConstraints
      // already snaps the handle back, nothing else to do.
    } else if (offsetY > COLLAPSE_OFFSET_THRESHOLD || isFastDown) {
      setExpanded(false);
    }
  }

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
            // `expanded` swaps the mobile height to a full 100dvh sheet —
            // desktop is unaffected (sm:max-h-none/sm:h-auto below always
            // wins on desktop regardless of `expanded`, since there's no
            // handle to drag there in the first place).
            className={`relative z-10 flex w-full flex-col overflow-hidden rounded-t-[2rem] bg-bg-card shadow-card-hero transition-[max-height,height] duration-300 ease-out sm:h-auto sm:max-h-[85vh] sm:max-w-lg sm:rounded-[2rem] ${
              expanded
                ? "h-[100vh] h-[100svh] h-[100dvh] max-h-none"
                : "max-h-[85vh] max-h-[85svh] max-h-[85dvh]"
            }`}
          >
            <motion.div
              className="flex shrink-0 touch-none justify-center py-3 sm:hidden"
              aria-hidden="true"
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.15}
              onDragEnd={handleHandleDragEnd}
            >
              <div className="h-1.5 w-10 rounded-full bg-border" />
            </motion.div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 pt-0 sm:pt-6">
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
