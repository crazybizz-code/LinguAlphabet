"use client";

import { useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, X } from "lucide-react";
import { Tuto } from "@/components/mascot/Tuto";
import { TutoChatSheet } from "@/components/tuto-chat/TutoChatSheet";
import type { TutoChatEmptyState } from "@/components/tuto-chat/TutoChatPanel";
import { useTutoChat } from "@/hooks/useTutoChat";
import { subscribeSheetOpen, getIsAnySheetOpen } from "@/lib/ui/sheetOpenStore";
import type { Screen } from "@/ai/context";
import type { TutoContextInput } from "@/lib/tuto-chat/types";

/** Best-effort — this button has no specific content in scope, only whatever screen it happens to be floating over. Anything that doesn't map to a known AI screen is simply left out of the context rather than guessed. */
function screenFromPathname(pathname: string): Screen | null {
  if (pathname.startsWith("/podcast")) return "podcast";
  if (pathname.startsWith("/article")) return "article";
  if (pathname === "/dashboard") return "home";
  return null;
}

/**
 * Sprint UX-3.1 (Polish): a blank box with no starting point was the
 * highest-friction moment on the app's most-used chat entry point — this
 * gives each known screen context (the same ones screenFromPathname
 * already distinguishes) its own contextual starting copy instead of
 * one generic message, or nothing at all.
 */
function emptyStateFor(screen: Screen | null): TutoChatEmptyState {
  if (screen === "article") {
    return {
      title: "Ask me about this article",
      description: "I can explain a tricky sentence, define a word, or summarize what you just read.",
      starters: ["Summarize this article", "Explain the hardest part", "Quiz me on this"],
    };
  }
  if (screen === "podcast") {
    return {
      title: "Ask me about this podcast",
      description: "I can explain something you heard, define a word, or help you practice it.",
      starters: ["What's this episode about?", "Explain what I just heard", "Teach me a word from it"],
    };
  }
  return {
    title: "Hey, I'm Tuto — your English coach",
    description: "Ask me about grammar, vocabulary, or anything you're curious about.",
    starters: ["What should I practice today?", "Explain a grammar rule", "Teach me a new word"],
  };
}

/**
 * Mobile-only bottom offset for both the trigger button and its teaser
 * card. Must clear DashboardBottomNav's real on-screen height, including
 * the safe-area inset that nav bar adds below `md` -- a fixed px value
 * (the previous `bottom-24`) undercounted that inset on real notched
 * phones, so the two fixed-position elements would visually and
 * hit-test overlap (confirmed by measuring both elements' real
 * bounding boxes: an ~26x51px overlap directly over the Profile tab,
 * which any equal-z-index later-DOM-order element wins, swallowing the
 * tap before it ever reaches the nav Link underneath -- PRIORITY 1's
 * "multiple taps needed" root cause). 6.5rem (104px) plus the same
 * env() the nav bar itself adds leaves a consistent ~20px clearance
 * above the nav on every device, notched or not.
 */
const BUTTON_BOTTOM_OFFSET = "bottom-[calc(6.5rem+env(safe-area-inset-bottom))]";
const TEASER_BOTTOM_OFFSET = "bottom-[calc(11rem+env(safe-area-inset-bottom))]";

/**
 * Global "Ask Tuto" entry point — persists on every shell screen except the
 * Tuto Chat screen itself (docs/dashboard-architecture.md §3: "Tuto's
 * presence is felt on every screen"). The trigger is a plain chat-bubble
 * icon button, not a Tuto render, so it carries no avatar-cropping concern;
 * the expanded teaser uses the full Tuto mascot (never a cropped circular
 * avatar) sized to fit the card, per product decision.
 *
 * Opens the same Tuto Chat (useTutoChat + TutoChatSheet) already wired
 * into DictionaryOverlay and ReadingStep (AI UX Integration sprint) —
 * this is that same chat's third, most global entry point, not a
 * separate chat experience. No specific word/article is in scope here,
 * so its LearningContext is just a best-effort current screen.
 *
 * PRIORITY 2: hidden entirely whenever a bottom sheet (EditSheet) is open
 * — a fixed-position button with no awareness of what else is on screen
 * has no safe way to "move above" an arbitrarily tall sheet, so hiding is
 * the one guarantee that it can never cover sheet content. Getting the
 * `isAnySheetOpen` signal via useSyncExternalStore (see sheetOpenStore.ts)
 * rather than prop-drilling keeps EditSheet and FloatingTuto decoupled —
 * neither needs to import or know about the other.
 */
export function FloatingTuto() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const isAnySheetOpen = useSyncExternalStore(subscribeSheetOpen, getIsAnySheetOpen, () => false);

  const screen = screenFromPathname(pathname);
  const context: TutoContextInput = { currentScreen: screen };
  const chat = useTutoChat({ context });

  if (pathname === "/tuto-chat") return null;

  // Hides the trigger + teaser whenever any sheet is open, including the
  // chat sheet this button itself opens below — but the chat sheet is
  // rendered unconditionally, outside this check, since hiding on its own
  // `isAnySheetOpen` signal would otherwise unmount (and thus instantly
  // close) the very sheet the click just opened.
  const hideTrigger = isAnySheetOpen;

  function openChat() {
    setOpen(false);
    setChatOpen(true);
  }

  return (
    <>
      {!hideTrigger && (
        <>
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 10 }}
                transition={{ duration: 0.2 }}
                className={`fixed right-4 z-50 w-80 rounded-3xl border border-border bg-bg-card p-5 shadow-xl lg:bottom-24 lg:right-8 ${TEASER_BOTTOM_OFFSET}`}
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
                    &ldquo;Have a question about grammar or vocabulary? I&apos;m here to help!&rdquo;
                  </p>
                  <button
                    type="button"
                    onClick={openChat}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-text-on-primary transition-all hover:opacity-90 active:scale-[0.98]"
                  >
                    Chat with Tuto
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
            className={`fixed right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-text-on-primary shadow-glow lg:bottom-6 lg:right-8 ${BUTTON_BOTTOM_OFFSET}`}
          >
            {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
          </motion.button>
        </>
      )}

      <TutoChatSheet
        open={chatOpen}
        title="Ask Tuto"
        onClose={() => setChatOpen(false)}
        messages={chat.messages}
        status={chat.status}
        error={chat.error}
        onSend={chat.sendMessage}
        placeholder="Ask Tuto anything…"
        emptyState={emptyStateFor(screen)}
        onRetry={chat.retryLast}
      />
    </>
  );
}
