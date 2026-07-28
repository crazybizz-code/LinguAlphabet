"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Square, RotateCcw, ChevronRight } from "lucide-react";
import { ChatBubble } from "@/components/tuto-chat/ChatBubble";
import { TypingIndicator } from "@/components/tuto-chat/TypingIndicator";
import { QuickReplyChips } from "@/components/tuto-chat/QuickReplyChips";
import { AdaptiveLevelBadge } from "@/components/tuto-chat/AdaptiveLevelBadge";
import { Tuto } from "@/components/mascot/Tuto";
import { useTutoChat } from "@/hooks/useTutoChat";
import { fadeSlideUp, fadeScaleIn } from "@/lib/motion/variants";
import type { TutoContextInput } from "@/lib/tuto-chat/types";
import type { CefrLevel } from "@/ai/context";

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
  learnerLevel?: CefrLevel | null;
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

/** Shown instead of a context banner when there's nothing specific in view (General Coach) — mirrors Explore/Progress's own page-header pattern (title + one-line subtitle) so Tuto reads as a normal primary destination, not a bare chat box. */
function WorkspaceHeader({ learnerLevel }: { learnerLevel: CefrLevel | null }) {
  return (
    <div className="shrink-0 border-b border-border bg-bg-card/95 px-5 py-4 backdrop-blur-sm sm:px-8">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Tuto pose="neutral" size="xs" animation="floatSm" />
          <div>
            <h1 className="text-lg font-bold text-text-primary">Tuto</h1>
            <p className="text-xs text-text-tertiary">Your AI English coach</p>
          </div>
        </div>
        <AdaptiveLevelBadge level={learnerLevel} />
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
export function TutoWorkspace({ mode, context, learnerLevel = null, contextBanner, emptyState, placeholder = "Ask Tuto anything…" }: TutoWorkspaceProps) {
  const chat = useTutoChat({ context });
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const contentSizeRef = useRef<HTMLDivElement>(null);

  const visibleMessages = chat.messages.filter((message) => !message.hidden);
  const lastMessage = visibleMessages[visibleMessages.length - 1];
  const isThinking = chat.status === "streaming" && (!lastMessage || lastMessage.role !== "assistant" || lastMessage.content.length === 0);
  const showEmptyState = emptyState && visibleMessages.length === 0 && chat.status === "idle";
  const canRegenerate = chat.status === "idle" && lastMessage?.role === "assistant" && lastMessage.content.length > 0;

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
      {contextBanner ? <WorkspaceContextBanner banner={contextBanner} /> : <WorkspaceHeader learnerLevel={learnerLevel} />}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        {/* mt-auto anchors a short conversation to the bottom (Claude/ChatGPT
            mobile pattern) without the justify-end flexbug — see
            TutoChatPanel.tsx's identical comment for the measured proof. */}
        <div ref={contentSizeRef} className="mx-auto mt-auto flex w-full max-w-2xl flex-col gap-3 px-5 pb-3 pt-6 sm:px-8">
          {showEmptyState && (
            <motion.div
              variants={fadeScaleIn}
              initial="hidden"
              animate="visible"
              className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-bg-muted px-5 py-8 text-center"
            >
              <p className="text-sm font-bold text-text-primary">{emptyState.title}</p>
              <p className="text-sm leading-relaxed text-text-secondary">{emptyState.description}</p>
              {emptyState.starters && emptyState.starters.length > 0 && (
                <QuickReplyChips replies={emptyState.starters} onSelect={chat.sendMessage} />
              )}
            </motion.div>
          )}

          {visibleMessages.map((message, index) => {
            const isLastAssistant = index === visibleMessages.length - 1 && message.role === "assistant";
            if (isLastAssistant && (chat.status === "streaming" || chat.status === "error") && message.content.length === 0) return null;
            return <ChatBubble key={message.id} message={message} streaming={chat.status === "streaming" && isLastAssistant} />;
          })}

          <AnimatePresence>
            {isThinking && (
              <motion.div variants={fadeSlideUp} initial="hidden" animate="visible" exit={{ opacity: 0 }} className="flex items-center gap-2 py-1">
                <TypingIndicator />
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

          {chat.status === "idle" && chat.lastQuickActions.length > 0 && (
            <QuickReplyChips replies={chat.lastQuickActions} onSelect={chat.sendMessage} />
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
          className="mx-auto flex w-full max-w-2xl items-center gap-2 px-5 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-3 sm:px-8 lg:pb-4"
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
              <ArrowUp className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
