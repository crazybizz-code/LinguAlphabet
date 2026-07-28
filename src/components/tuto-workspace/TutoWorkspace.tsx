"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Send, Square, RotateCcw, ChevronRight, Flame } from "lucide-react";
import { ChatBubble } from "@/components/tuto-chat/ChatBubble";
import { ActionChips } from "./ActionChips";
import { AIStatusIndicator } from "./AIStatusIndicator";
import { TutoOnlineAvatar } from "@/components/mascot/TutoOnlineAvatar";
import { useTutoChat } from "@/hooks/useTutoChat";
import { useThinkingPhase } from "@/hooks/useThinkingPhase";
import { estimateRevealDurationMs, prefersReducedMotion } from "@/hooks/useProgressiveReveal";
import { fadeSlideUp } from "@/lib/motion/variants";
import type { TutoContextInput } from "@/lib/tuto-chat/types";

/** Always-available conversation starters shown alongside the greeting — sent exactly like any AI-suggested action (ActionChips), not a special case. */
const DEFAULT_ACTIONS = ["Explain simpler", "Give examples", "Practice this"];

export type TutoWorkspaceMode = "general" | "article" | "podcast" | "checkpoint" | "ielts";

/**
 * Compact banner pinned above the conversation — "Discussing / Climate
 * Change / BBC Future · B2 · 5 min read / Change Article". `undefined` in
 * general mode (nothing is in view to summarize); every future mode
 * (article today, podcast/checkpoint/ielts later) supplies one without
 * TutoWorkspace itself changing at all — this is the whole point of the
 * mode being a prop, not a rebuild.
 */
export interface TutoWorkspaceContextBanner {
  eyebrow: string;
  title: string;
  meta: string[];
  changeLabel?: string;
  onChange?: () => void;
}

export interface TutoWorkspaceEmptyState {
  title: string;
  description: string;
  starters?: string[];
}

export interface TutoWorkspaceProps {
  mode: TutoWorkspaceMode;
  context: TutoContextInput;
  /** Drives the header's streak badge (Base44 reference) in general mode — omit to hide the badge entirely rather than show a fabricated 0. */
  streak?: number | null;
  contextBanner?: TutoWorkspaceContextBanner;
  emptyState?: TutoWorkspaceEmptyState;
  placeholder?: string;
}

function WorkspaceContextBanner({ banner }: { banner: TutoWorkspaceContextBanner }) {
  return (
    <div className="shrink-0 border-b border-border bg-bg-card/95 px-5 py-3 backdrop-blur-sm sm:px-8">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">{banner.eyebrow}</p>
          <p className="truncate text-sm font-bold text-text-primary">{banner.title}</p>
          {banner.meta.length > 0 && (
            <p className="truncate text-xs text-text-tertiary">{banner.meta.join(" · ")}</p>
          )}
        </div>
        {banner.onChange && (
          <button
            type="button"
            onClick={banner.onChange}
            className="flex shrink-0 items-center gap-0.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:border-primary/40 hover:text-primary"
          >
            {banner.changeLabel ?? "Change"}
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Shown instead of a context banner when there's nothing specific in view
 * (General Coach) — Base44 reference: "English Coaching Session" title,
 * "Ready to help" status (mirrors the sidebar's own Tuto card exactly, via
 * the same TutoOnlineAvatar), and the learner's streak instead of a level
 * pill (level now lives in the sidebar's Learning Status panel).
 */
function WorkspaceHeader({ streak }: { streak: number | null | undefined }) {
  return (
    <div className="shrink-0 border-b border-border bg-bg-card/95 px-5 py-4 backdrop-blur-sm sm:px-8">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <TutoOnlineAvatar />
          <div className="min-w-0">
            <h1 className="text-sm font-bold leading-snug text-text-primary sm:text-lg">English Coaching Session</h1>
            <p className="flex items-center gap-1.5 text-xs text-text-tertiary">
              <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
              Ready to help
            </p>
          </div>
        </div>
        {typeof streak === "number" && streak > 0 && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary-lighter px-3 py-1.5 text-xs font-bold text-primary">
            <Flame className="h-3.5 w-3.5" aria-hidden="true" />
            {streak} days
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * The single reusable AI workspace behind every Tuto surface (General
 * Coach today; Article Coach/Podcast Coach/Checkpoint Coach/IELTS Coach
 * later) — one full-page chat layout, `mode` + `context` + `contextBanner`
 * are what change per surface, never the component itself. Bottom-anchor
 * + fixed-composer layout mirrors TutoChatPanel's (src/components/
 * tuto-chat/TutoChatPanel.tsx) proven, measured-correct pattern — built
 * fresh here rather than shared, since TutoChatPanel is the legacy sheet
 * kept running unchanged as a compatibility layer until Article/Podcast
 * Coach migrate off it.
 *
 * `fixed inset-0` (offset by the sidebar's width on desktop, matching
 * DashboardShell's own `pl-[260px] max-lg:pl-0`) rather than a normal
 * flow child: a normal page relies on DashboardShell's own scroll
 * clearance spacer for its trailing content, which is exactly wrong for a
 * page that must fill one exact viewport height and manage its own
 * internal scroll — `fixed` opts this route out of that spacer entirely,
 * the same way DashboardSidebar/DashboardBottomNav already opt into fixed
 * positioning for their own chrome.
 */
export function TutoWorkspace({ mode, context, streak, contextBanner, emptyState, placeholder = "Ask Tuto anything…" }: TutoWorkspaceProps) {
  const chat = useTutoChat({ context });
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const contentSizeRef = useRef<HTMLDivElement>(null);

  const visibleMessages = chat.messages.filter((message) => !message.hidden);
  const lastMessage = visibleMessages[visibleMessages.length - 1];
  const isThinking = chat.status === "streaming" && (!lastMessage || lastMessage.role !== "assistant" || lastMessage.content.length === 0);
  const showEmptyState = emptyState && visibleMessages.length === 0 && chat.status === "idle";
  const canRegenerate = chat.status === "idle" && lastMessage?.role === "assistant" && lastMessage.content.length > 0;

  /** Reading → Thinking status copy shown before real content exists (AIStatusIndicator). */
  const thinkingPhase = useThinkingPhase(isThinking);

  /**
   * Contextual quick actions (Base44 reference) are meant to feel like they
   * follow Tuto finishing a reply, not pop in while it's still visually
   * "writing" — chat.status flips to idle the instant the network turn
   * completes, which can land slightly before ChatBubble's own client-side
   * reveal animation has finished typing the text out. Holding the chips
   * back for the same duration the reveal itself will take (estimateRevealDurationMs,
   * the exact formula useProgressiveReveal animates on) keeps the two in sync
   * without either component needing to know about the other's internals.
   */
  const [quickActionsReady, setQuickActionsReady] = useState(false);
  const [trackedQuickActions, setTrackedQuickActions] = useState(chat.lastQuickActions);
  // `lastQuickActions` gets a fresh array both when a new turn starts
  // (cleared to []) and when it ends (populated) — exactly the two moments
  // "not ready yet" needs to (re)apply, done during render rather than as a
  // setState sitting at the top of the effect below.
  if (trackedQuickActions !== chat.lastQuickActions) {
    setTrackedQuickActions(chat.lastQuickActions);
    setQuickActionsReady(false);
  }

  useEffect(() => {
    if (chat.status !== "idle" || chat.lastQuickActions.length === 0) return;
    const charCount = lastMessage?.role === "assistant" ? lastMessage.content.length : 0;
    const delay = prefersReducedMotion() ? 0 : estimateRevealDurationMs(charCount);
    const timeout = setTimeout(() => setQuickActionsReady(true), delay);
    return () => clearTimeout(timeout);
    // lastMessage?.content intentionally omitted: it never changes once
    // chat.status is idle (the turn is already fully settled by then), and
    // including it would re-arm this timer on every unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.status, chat.lastQuickActions]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [visibleMessages.length, lastMessage?.content, isThinking]);

  // Same ResizeObserver fix as TutoChatPanel: keeps the view pinned to the
  // newest content if it grows after the effect above already ran for
  // this turn (a streamed reply's own content growth is already covered
  // by lastMessage.content above).
  useEffect(() => {
    if (chat.status !== "streaming") return;
    const el = contentSizeRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      endRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [chat.status]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || chat.status === "streaming") return;
    chat.sendMessage(draft);
    setDraft("");
  }

  return (
    <div className="fixed inset-0 z-0 flex flex-col bg-bg pl-[260px] max-lg:pl-0" data-tuto-workspace-mode={mode}>
      {contextBanner ? <WorkspaceContextBanner banner={contextBanner} /> : <WorkspaceHeader streak={streak} />}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        {/* mt-auto anchors a short conversation to the bottom (Claude/ChatGPT
            mobile pattern) without the justify-end flexbug — see
            TutoChatPanel.tsx's identical comment for the measured proof. */}
        <div ref={contentSizeRef} className="mx-auto mt-auto flex w-full max-w-2xl flex-col gap-3 px-5 pb-3 pt-6 sm:px-8">
          {showEmptyState && (
            <motion.div variants={fadeSlideUp} initial="hidden" animate="visible" className="flex flex-col gap-3">
              <ChatBubble
                message={{ id: "__greeting", role: "assistant", content: `${emptyState.title} ${emptyState.description}` }}
                showSender
              />
              <ActionChips actions={DEFAULT_ACTIONS} onSelect={chat.sendMessage} />
              {emptyState.starters && emptyState.starters.length > 0 && (
                <ActionChips actions={emptyState.starters} onSelect={chat.sendMessage} />
              )}
            </motion.div>
          )}

          {visibleMessages.map((message, index) => {
            const isLastAssistant = index === visibleMessages.length - 1 && message.role === "assistant";
            if (isLastAssistant && (chat.status === "streaming" || chat.status === "error") && message.content.length === 0) return null;
            // Identity-based, not `chat.status === "streaming"`: status can
            // already read "idle" by this message's very first render with
            // real content (see useTutoChat's liveAssistantId doc comment),
            // which would otherwise skip the entrance fade and the reveal
            // entirely instead of just cutting them short.
            const isLiveTurn = message.id === chat.liveAssistantId;
            return (
              <ChatBubble
                key={message.id}
                message={message}
                streaming={isLiveTurn}
                showSender={message.role === "assistant"}
                animateEntrance={isLiveTurn}
                revealMode="committed"
              />
            );
          })}

          <AnimatePresence>
            {isThinking && (
              <motion.div variants={fadeSlideUp} initial="hidden" animate="visible" exit={{ opacity: 0 }}>
                <AIStatusIndicator phase={thinkingPhase} />
              </motion.div>
            )}
          </AnimatePresence>

          {chat.error && (
            <div className="flex flex-col items-start gap-2 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
              <span>{chat.error}</span>
              <button
                type="button"
                onClick={chat.retryLast}
                className="text-xs font-bold text-danger underline underline-offset-2 hover:opacity-80"
              >
                Try again
              </button>
            </div>
          )}

          {chat.status === "idle" && chat.lastQuickActions.length > 0 && quickActionsReady && (
            <ActionChips actions={chat.lastQuickActions} onSelect={chat.sendMessage} />
          )}

          {canRegenerate && (
            <button
              type="button"
              onClick={chat.retryLast}
              className="flex w-fit items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:border-primary/40 hover:text-primary"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Regenerate
            </button>
          )}

          <div ref={endRef} aria-hidden="true" />
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-bg-card/95 backdrop-blur-sm">
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex w-full max-w-2xl items-center gap-2 px-5 pt-3 sm:px-8"
        >
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={placeholder}
            disabled={chat.status === "streaming"}
            className="h-12 flex-1 rounded-2xl bg-bg-muted px-4 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
          />
          {chat.status === "streaming" ? (
            <button
              type="button"
              onClick={chat.stop}
              aria-label="Stop generating"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-text-primary text-text-on-primary transition-all hover:opacity-90 active:scale-[0.95]"
            >
              <Square className="h-4 w-4" aria-hidden="true" fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!draft.trim()}
              aria-label="Send"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-text-on-primary transition-all hover:opacity-90 active:scale-[0.95] disabled:opacity-40"
            >
              <Send className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </form>
        <p className="mx-auto w-full max-w-2xl px-5 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-1.5 text-center text-[11px] text-text-tertiary sm:px-8 lg:pb-3">
          Tuto can make mistakes. Always verify important information.
        </p>
      </div>
    </div>
  );
}
