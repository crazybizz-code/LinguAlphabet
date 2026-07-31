"use client";

import { useEffect, useRef, type ReactNode } from "react";
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

/**
 * Escape closes the sheet.
 *
 * This carries `role="dialog"` and `aria-modal="true"`, which is a promise
 * to assistive tech that the usual modal conventions hold — and Escape is
 * the first of them. Without it a keyboard user who opened a sheet could
 * only leave by tabbing to the X; there is no other keyboard exit, since
 * the backdrop is a click target and the swipe-down is a pointer gesture.
 * Routed through the same onClose as every other dismissal, so the
 * history-entry cleanup below still runs exactly once.
 */
function useEscapeClosesSheet(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);
}

/**
 * CRITICAL ISSUE #3: on Android, hardware/gesture Back must close an open
 * sheet, never exit the page underneath it. The standard cross-browser fix:
 * push one extra history entry the instant the sheet opens, so a Back press
 * fires `popstate` here instead of actually leaving the page — we just
 * treat that as a close. If the sheet is closed any OTHER way (X button,
 * backdrop tap, swipe-down, or the consumer unmounting it) while that entry
 * is still sitting there, we pop it ourselves in cleanup — otherwise the
 * learner would need to press Back twice (once to silently discard our
 * marker entry, once more to actually leave) to get off the page for real.
 *
 * That cleanup-time `history.back()` used to run synchronously and
 * unconditionally, which collided with React's dev-mode double effect
 * invocation (mount -> cleanup -> mount, run synchronously to catch missing
 * cleanup bugs — see react.dev's "Strict Mode" docs): the first
 * (StrictMode-diagnostic) cleanup called `history.back()`, whose resulting
 * `popstate` fires asynchronously and landed on the SECOND (real) effect
 * instance's listener, which read it as "the user pressed Back" and
 * immediately closed the sheet the instant it opened — reproduced with a
 * calendar day tap: state set correctly, then reset to null on the very
 * next render, confirmed via trace logging before this fix. `pendingBackRef`
 * defers the `history.back()` by one microtask and lets a synchronous
 * re-mount (StrictMode's churn, or a genuinely fast reopen) cancel it
 * before it ever fires, while a real close still calls it right after.
 */
function useBackButtonClosesSheet(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  // Keeps the ref pointed at the latest callback without making it a
  // dependency of the effect below — refs must only be written outside of
  // render, so this runs as its own no-deps effect (fires after every
  // render) rather than as a plain assignment in the function body.
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const pendingBackRef = useRef<{ cancelled: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;

    // A previous close's deferred history.back() hasn't fired yet -- this
    // fresh mount means that entry is ours now, not stale, so cancel it.
    if (pendingBackRef.current) {
      pendingBackRef.current.cancelled = true;
      pendingBackRef.current = null;
    }

    let consumedByBackButton = false;
    history.pushState({ sheetOpen: true }, "");

    function handlePopState() {
      consumedByBackButton = true;
      onCloseRef.current();
    }

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (!consumedByBackButton) {
        const token = { cancelled: false };
        pendingBackRef.current = token;
        queueMicrotask(() => {
          if (!token.cancelled) history.back();
        });
      }
    };
  }, [open]);
}

/** Swipe-down-to-dismiss thresholds — offset in px, velocity in px/s. A small fast flick counts the same as a slower, longer drag, matching native iOS/Android sheets. */
const DISMISS_OFFSET_THRESHOLD = 100;
const VELOCITY_THRESHOLD = 500;

/** ~78% of viewport height — the "never randomly cover the whole screen" middle of the requested 75-80vh range. svh/dvh override the plain vh fallback where supported (mobile browser chrome resize-safe), same cascade trick used for max-h elsewhere in this file. */
const SHEET_HEIGHT_CLASSES = "h-[78vh] h-[78svh] h-[78dvh]";

/**
 * Shared chrome for every bottom sheet in the app (Learning Profile field
 * editors, the Live Dictionary lookup, the Learning Calendar's Daily
 * Activity panel) — bottom sheet on mobile, centered modal on desktop, per
 * docs/design-system.md's premium-not-generic-dashboard bar.
 *
 * One fixed snap point, not a drag-to-fullscreen expand: a sheet that can
 * balloon to cover the entire screen on a stray upward flick reads as
 * broken, not native (Apple Maps/Music/Google Maps all open to one
 * considered height and dismiss on a downward drag, they don't expand to
 * fullscreen from a bottom sheet). Drag is intentionally scoped to the
 * handle only — the content pane is a separate, independently scrollable
 * element, so a vertical swipe over content always scrolls and a
 * vertical drag from the handle always moves the sheet; the two can never
 * fight each other for the same gesture.
 */
export function EditSheet({ open, title, onClose, children }: EditSheetProps) {
  useLockBodyScroll(open);
  useEscapeClosesSheet(open, onClose);
  useBackButtonClosesSheet(open, onClose);
  const contentRef = useRef<HTMLDivElement>(null);

  // CRITICAL ISSUE #5: a reopened sheet must always start scrolled to the
  // top, never wherever it happened to be scrolled to last time. The
  // subtree below fully unmounts on close (`{open && ...}`), which already
  // gives every reopen a brand new, scrollTop-0 DOM node -- this is an
  // explicit belt-and-suspenders reset for the one case that wouldn't be
  // true (a consumer that keeps `open` truthy but swaps `children`).
  useEffect(() => {
    if (open) contentRef.current?.scrollTo(0, 0);
  }, [open]);

  function handleHandleDragEnd(_event: unknown, info: PanInfo) {
    const isFastDown = info.velocity.y > VELOCITY_THRESHOLD;
    if (info.offset.y > DISMISS_OFFSET_THRESHOLD || isFastDown) {
      onClose();
    }
    // Released without crossing the threshold: Framer's own drag release
    // physics (dragConstraints + dragElastic below) spring the handle back
    // to rest on its own, no extra code needed.
  }

  return (
    <AnimatePresence>
      {/* z-[60]: strictly above the persistent bottom nav / FAB (both
          z-50) so the sheet's own bottom edge is never stacked behind
          them — on mobile viewports the nav bar's fixed 97px band and
          the sheet's bottom edge occupy the same screen region, and at
          equal z-index DOM order let the nav win the tie, visually
          covering the sheet's last scrollable content even though its
          internal scrollTop had genuinely reached its max. */}
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6">
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
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`relative z-10 flex w-full flex-col overflow-hidden rounded-t-[2rem] bg-bg-card shadow-card-hero sm:h-auto sm:max-h-[85vh] sm:max-w-lg sm:rounded-[2rem] ${SHEET_HEIGHT_CLASSES}`}
          >
            {/* Drag handle — the ONLY draggable region, deliberately kept
                separate from the scrollable content pane below so a swipe
                never has to be disambiguated between "scroll" and "drag
                the sheet." Hidden on desktop, where this renders as a
                centered modal with no handle to grab. */}
            <motion.div
              className="flex shrink-0 touch-none justify-center py-3 sm:hidden"
              aria-hidden="true"
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={handleHandleDragEnd}
            >
              <div className="h-1.5 w-10 rounded-full bg-border" />
            </motion.div>

            <div className="flex shrink-0 items-center justify-between px-6 pb-4 pt-1 sm:pt-6">
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

            {/* Independently scrollable content — never the drag target,
                never fights the handle's gesture. overscroll-contain stops
                an over-scroll here from rubber-banding the (locked)
                page behind it. pt-1 gives the content its own breathing
                room below the header instead of butting straight up
                against it; bottom padding respects the iOS home indicator /
                Android gesture bar safe area on top of a generous base gap
                so the last card never reads as cut off. */}
            <div
              ref={contentRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-1"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 2rem)" }}
            >
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
