"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp } from "lucide-react";
import { ChatBubble } from "./ChatBubble";
import { ThinkingTimeline, type ThinkingFocus } from "./ThinkingTimeline";
import { TutoMascotStatus } from "./TutoMascotStatus";
import { ResponseActions } from "./ResponseActions";
import { QuickReplyChips } from "./QuickReplyChips";
import { useTutoMascotState } from "@/hooks/useTutoMascotState";
import { fadeSlideUp, fadeScaleIn } from "@/lib/motion/variants";
import type { ChatMessage } from "@/lib/tuto-chat/types";
import type { ChatOrchestratorAction } from "@/lib/tuto-chat/streamChatCompletion";
import type { TutoChatStatus } from "@/hooks/useTutoChat";
import type { CefrLevel } from "@/ai/context";

export interface TutoChatEmptyState {
  title: string;
  description: string;
  /** Tappable starter prompts — sent exactly like a quick reply. Optional; omit for just title/description. */
  starters?: string[];
}

export interface TutoChatPanelProps {
  messages: ChatMessage[];
  status: TutoChatStatus;
  error: string | null;
  onSend: (text: string) => void;
  /** Rendered above the message list — e.g. a VocabularyCard for the word-lookup flow. Omit for a plain conversation. */
  header?: ReactNode;
  placeholder?: string;
  /** Which ThinkingTimeline step leads first — a light hint, not a real trace of backend activity. Omit for a balanced default order. */
  thinkingFocus?: ThinkingFocus;
  /** Sprint UX-3: the same CEFR level already threaded through TutoContextInput at the call site — drives the adaptive level badge and the continue-learning card's copy. Omit when not known. */
  learnerLevel?: CefrLevel | null;
  /** The Learning Orchestrator's decision on the most recently completed turn (useTutoChat's lastOrchestratorAction) — refines the mascot's transient "success" moment. Omit for the original generic copy. */
  orchestratorAction?: ChatOrchestratorAction | null;
  /**
   * Sprint UX-3.1 (Polish): contextual copy shown in place of a blank box
   * before the first message — only rendered when there's no header (a
   * header, e.g. VocabularyCard, already fills that gap) and nothing's
   * been sent yet. Omit for a plain blank start.
   */
  emptyState?: TutoChatEmptyState;
  /** Sprint UX-3.1 (Polish): resends the last user turn after an error — omit to hide the retry action. */
  onRetry?: () => void;
}

/**
 * The reusable conversation surface behind every Tuto interaction (word
 * lookup follow-ups, article selection actions, ask-about-the-article,
 * the global floating chat) — one component, every trigger point, so
 * streaming rendering, loading states, and error handling are each built
 * once. Sprint UX-1 (Living Tuto) added the mascot status row and the
 * thinking timeline on top of the same underlying useTutoChat contract —
 * no change to that hook or anything upstream of it.
 *
 * Mobile scroll/pin fix: this used to render as one flat flex column
 * inside EditSheet's own scrollable content pane, with the input row
 * `sticky bottom-0` inside that same scroll flow. Measured (real DOM
 * geometry, not guessed) two failure modes on mobile's fixed-height sheet
 * (`h-[78vh]`, EditSheet.tsx): (1) a short conversation never overflows
 * that tall pane at all, so `sticky` never activates — the composer just
 * sits at its natural position right after the last message, leaving the
 * rest of the sheet as dead space below it, instead of pinned to the true
 * bottom; (2) once a conversation *does* overflow, the now-"stuck"
 * composer visually overlaps the tail of the scrolled content — and the
 * auto-scroll sentinel (`endRef`, placed just before the composer in
 * flow) ends up geometrically underneath that same stuck overlay, so
 * `scrollIntoView` (which only checks bounding-rect containment, not
 * real occlusion) concludes nothing more needs to scroll and leaves the
 * newest message/thinking indicator hidden behind the input bar.
 *
 * Fixed the standard way every mobile chat UI does it: the composer is
 * its own fixed (non-scrolling, non-sticky) row, and only the message
 * list scrolls in a sibling region above it — the composer can no longer
 * ever overlap content, and the scroll anchor's geometry is honest since
 * nothing else can render on top of it. Purely a layout mechanism change
 * — same EditSheet chrome, same colors/spacing/borders, desktop
 * unaffected (EditSheet already sizes the sheet to its content there via
 * `sm:h-auto`, so this fixed-height failure mode never applied there).
 */
export function TutoChatPanel({
  messages,
  status,
  error,
  onSend,
  header,
  placeholder = "Ask Tuto a question…",
  thinkingFocus = null,
  learnerLevel = null,
  emptyState,
  onRetry,
  orchestratorAction = null,
}: TutoChatPanelProps) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const contentSizeRef = useRef<HTMLDivElement>(null);
  const visibleMessages = messages.filter((message) => !message.hidden);
  const lastMessage = visibleMessages[visibleMessages.length - 1];
  const mascotState = useTutoMascotState(status, messages);

  const isThinking = status === "streaming" && (!lastMessage || lastMessage.role !== "assistant" || lastMessage.content.length === 0);
  const assistantTurnCount = visibleMessages.filter((message) => message.role === "assistant").length;
  const showResponseActions = status === "idle" && lastMessage?.role === "assistant" && lastMessage.content.length > 0;
  const showEmptyState = emptyState && !header && visibleMessages.length === 0 && status === "idle";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [visibleMessages.length, lastMessage?.content, isThinking]);

  // ThinkingTimeline cycles its own label every 700ms independent of any
  // prop this component passes it (ThinkingTimeline.tsx's own internal
  // interval) -- different label lengths (one line vs. two on a narrow
  // phone) change content height without changing visibleMessages.length,
  // lastMessage.content, or isThinking, so the effect above alone can't
  // catch it. A streamed reply's growing token-by-token content is
  // already covered by lastMessage.content above; this ResizeObserver is
  // specifically for the thinking-phase case that isn't. Scoped to
  // status === "streaming" only, so it's inert once a turn settles.
  useEffect(() => {
    if (status !== "streaming") return;
    const el = contentSizeRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      endRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [status]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || status === "streaming") return;
    onSend(draft);
    setDraft("");
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Independently scrollable — the composer below is a separate,
          non-scrolling sibling, never part of this flow, so it can never
          overlap or hide the newest message the way a sticky element
          sharing this same scroll region used to. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div ref={contentSizeRef} className="flex flex-col gap-3 pb-3">
          <TutoMascotStatus state={mascotState} level={learnerLevel} orchestratorAction={orchestratorAction} />
          {header}
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
                <QuickReplyChips replies={emptyState.starters} onSelect={onSend} />
              )}
            </motion.div>
          )}
          {visibleMessages.map((message, index) => {
            const isLastAssistant = index === visibleMessages.length - 1 && message.role === "assistant";
            // The thinking timeline covers this moment instead of an empty bubble —
            // and an error leaves this same empty placeholder behind too (Sprint
            // UX-3.1: the retry button sits right below it, so a stray blank
            // bubble must never linger between the user's question and the error).
            if (isLastAssistant && (status === "streaming" || status === "error") && message.content.length === 0) return null;
            return <ChatBubble key={message.id} message={message} streaming={status === "streaming" && isLastAssistant} />;
          })}
          <AnimatePresence>
            {isThinking && (
              <motion.div variants={fadeSlideUp} initial="hidden" animate="visible" exit={{ opacity: 0 }}>
                <ThinkingTimeline focus={thinkingFocus} />
              </motion.div>
            )}
          </AnimatePresence>
          {showResponseActions && (
            <ResponseActions
              key={lastMessage.id}
              content={lastMessage.content}
              thinkingFocus={thinkingFocus}
              onSend={onSend}
              turnIndex={assistantTurnCount}
              learnerLevel={learnerLevel}
            />
          )}
          {error && (
            <div className="flex flex-col items-start gap-2 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
              <span>{error}</span>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="text-xs font-bold text-danger underline underline-offset-2 hover:opacity-80"
                >
                  Try again
                </button>
              )}
            </div>
          )}
          <div ref={endRef} aria-hidden="true" />
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="-mx-6 flex shrink-0 items-center gap-2 border-t border-border bg-bg-card/95 px-6 py-3 backdrop-blur-sm"
      >
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={placeholder}
          disabled={status === "streaming"}
          className="h-12 flex-1 rounded-2xl bg-bg-muted px-4 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!draft.trim() || status === "streaming"}
          aria-label="Send"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-text-on-primary transition-all hover:opacity-90 active:scale-[0.95] disabled:opacity-40"
        >
          <ArrowUp className="h-5 w-5" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
