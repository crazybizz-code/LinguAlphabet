"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, X } from "lucide-react";
import { Tuto } from "@/components/mascot/Tuto";

/**
 * Global "Ask Tuto" entry point — persists on every shell screen except the
 * Tuto Chat screen itself (docs/dashboard-architecture.md §3: "Tuto's
 * presence is felt on every screen"). The trigger is a plain chat-bubble
 * icon button, not a Tuto render, so it carries no avatar-cropping concern;
 * the expanded teaser uses the full Tuto mascot (never a cropped circular
 * avatar) sized to fit the card, per product decision.
 *
 * Tuto Chat itself isn't built yet (task #36), so the teaser's CTA is a
 * same-card "coming soon" acknowledgment rather than a link to a route
 * that doesn't exist — docs/dashboard-architecture.md's Coming Soon
 * principle applies here too: "never a dead link, never hidden entirely."
 */
export function FloatingTuto() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [notified, setNotified] = useState(false);

  if (pathname === "/tuto-chat") return null;

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-24 right-4 z-50 w-80 rounded-3xl border border-border bg-bg-card p-5 shadow-xl max-lg:bottom-44 lg:right-8"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full hover:bg-bg-muted"
            >
              <X className="h-4 w-4 text-text-tertiary" />
            </button>

            <div className="flex flex-col items-center text-center">
              {/* `wave` is reserved for Welcome/first-time onboarding — this
                  teaser appears on every screen for returning learners, so
                  it gets Tuto's normal presence instead. */}
              <Tuto pose="neutral" size="sm" animation="float" />
              <p className="mt-2 text-sm font-bold text-text-primary">Ask Tuto</p>
              <p className="text-xs text-text-tertiary">Your English learning coach</p>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                {notified
                  ? "“I’ll let you know the moment chat is ready!”"
                  : "“Have a question about grammar or vocabulary? I’m here to help!”"}
              </p>
              <button
                type="button"
                onClick={() => setNotified(true)}
                disabled={notified}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-text-on-primary shadow-glow transition-transform active:scale-95 disabled:opacity-60"
              >
                {notified ? "We'll let you know!" : "Coming Soon — Notify Me"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5, duration: 0.3 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Close Tuto chat teaser" : "Open Tuto chat teaser"}
        className="fixed bottom-24 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-text-on-primary shadow-glow max-lg:bottom-24 lg:bottom-6 lg:right-8"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </motion.button>
    </>
  );
}
