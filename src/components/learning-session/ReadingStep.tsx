"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowRight, ExternalLink, MessageCircleQuestion } from "lucide-react";
import { Tuto } from "@/components/mascot/Tuto";
import { SelectionToolbar } from "@/components/tuto-chat/SelectionToolbar";
import { TutoChatSheet } from "@/components/tuto-chat/TutoChatSheet";
import { useTutoChat } from "@/hooks/useTutoChat";
import { cn } from "@/lib/utils";
import { SESSION_STEP_CONTAINER, SESSION_STEP_CONTENT } from "./sessionStepLayout";
import type { LearningSessionContent } from "@/lib/learning-session/types";
import type { TutoContextInput } from "@/lib/tuto-chat/types";

/** Selections up to this length are treated as a sentence/phrase; longer ones as a paragraph-level selection — matches LearningContext's selectedSentence/selectedParagraph split (src/ai/context). */
const SENTENCE_LENGTH_THRESHOLD = 200;
const CEFR_LEVELS = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);

const ACTION_TITLES = { explain: "Explain", translate: "Translate", simplify: "Simplify" } as const;
const ACTION_PROMPTS = {
  explain: "Can you explain this?",
  translate: "Can you translate this to Uzbek?",
  simplify: "Can you simplify this paragraph?",
} as const;
type SelectionAction = keyof typeof ACTION_PROMPTS;

/** Several approved sources (docs/content-source-policy.md) require visible attribution + a link back — this is that link. Hostname only, not the full URL, to keep it unobtrusive. */
function sourceHostname(sourceUrl: string): string | null {
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

interface SelectionState {
  text: string;
  top: number;
  left: number;
}

/**
 * The "read the article" step — Reading's counterpart to the Podcast
 * Player's "must listen to X%" gate (PlayerStep.tsx): Continue stays
 * disabled until a sentinel placed after the last paragraph has actually
 * scrolled into view, so jumping straight to the end isn't possible
 * without at least scrolling past the whole body. Short articles that
 * already fit on screen satisfy this the moment they mount, since the
 * sentinel is already in the viewport — no minimum-length special-casing
 * needed.
 *
 * Selecting any text shows a small floating action bar (Explain/Translate/
 * Simplify — "AI UX Integration" sprint) — deliberately separate from Live
 * Dictionary's tap-a-single-word lookup (DictionaryStep.tsx, still the
 * next step): this is a text-selection capability, not word-tapping, so it
 * doesn't reintroduce the tap-to-define interaction this step deliberately
 * doesn't have.
 */
export function ReadingStep({ content, onNext }: { content: LearningSessionContent; onNext: () => void }) {
  const [reachedEnd, setReachedEnd] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const paragraphsRef = useRef<HTMLDivElement>(null);
  const hostname = content.sourceUrl ? sourceHostname(content.sourceUrl) : null;

  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTitle, setSheetTitle] = useState("Ask Tuto");

  const baseContext: TutoContextInput = {
    currentScreen: "article",
    currentArticle: { id: content.contentId, title: content.title },
    userLevel: CEFR_LEVELS.has(content.cefrLevel) ? (content.cefrLevel as TutoContextInput["userLevel"]) : null,
  };

  // A selection action's context needs the selected text folded in before
  // the request is built, so it's tracked separately from the plain
  // "ask about the article" context — one hook, one context value that
  // changes per interaction, rather than two parallel chat instances.
  const [activeContext, setActiveContext] = useState<TutoContextInput>(baseContext);
  const chat = useTutoChat({ context: activeContext });

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setReachedEnd(true);
      },
      { threshold: 1 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function handleTextSelected() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setSelection(null);
      return;
    }
    const text = sel.toString().trim();
    if (!text || !paragraphsRef.current?.contains(sel.anchorNode)) {
      setSelection(null);
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    setSelection({ text, top: rect.top, left: rect.left + rect.width / 2 });
  }

  function handleSelectionAction(action: SelectionAction, text: string) {
    const contextWithSelection: TutoContextInput =
      text.length <= SENTENCE_LENGTH_THRESHOLD ? { ...baseContext, selectedSentence: text } : { ...baseContext, selectedParagraph: text };

    setSelection(null);
    window.getSelection()?.removeAllRanges();
    setActiveContext(contextWithSelection);
    setSheetTitle(ACTION_TITLES[action]);
    setSheetOpen(true);
    // Each selection action starts its own fresh conversation — jumping
    // between unrelated passages shouldn't carry an earlier exchange with
    // it, but follow-up questions asked afterward still preserve history.
    chat.sendFresh(ACTION_PROMPTS[action]);
  }

  function handleAskAboutArticle() {
    setActiveContext(baseContext);
    chat.reset();
    setSheetTitle("Ask Tuto about this article");
    setSheetOpen(true);
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={SESSION_STEP_CONTAINER}
    >
      <div className={SESSION_STEP_CONTENT}>
        <div className="mb-6 flex items-start gap-3">
          <Tuto pose="neutral" size="md" animation="float" />
          <div className="flex-1 pt-1">
            <h2 className="text-lg font-bold text-text-primary">Let&apos;s read together</h2>
            <p className="text-sm text-text-secondary">Read through the article at your own pace.</p>
          </div>
          <button
            type="button"
            onClick={handleAskAboutArticle}
            aria-label="Ask Tuto about this article"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-text-secondary transition-colors hover:bg-bg-muted hover:text-primary"
          >
            <MessageCircleQuestion className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="rounded-[1.75rem] bg-bg-muted p-5 sm:p-8">
          <div className="mb-5 flex items-center gap-3">
            <span className="rounded-full border border-border bg-bg-card px-3 py-1 text-xs font-bold text-primary">
              {content.cefrLevel}
            </span>
          </div>
          <h3 className="mb-5 text-xl font-bold text-text-primary">{content.title}</h3>

          {content.thumbnailUrl && (
            <div className="relative mb-5 aspect-video overflow-hidden rounded-2xl">
              <Image
                src={content.thumbnailUrl}
                alt=""
                fill
                sizes="(min-width: 640px) 42rem, 100vw"
                className="object-cover"
              />
            </div>
          )}

          <div ref={paragraphsRef} className="flex flex-col gap-4" onMouseUp={handleTextSelected} onTouchEnd={handleTextSelected}>
            {content.paragraphs.map((paragraph, index) => (
              <p key={index} className="text-base leading-relaxed text-text-secondary">
                {paragraph}
              </p>
            ))}
          </div>

          {hostname && (
            <a
              href={content.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-text-tertiary hover:text-text-secondary"
            >
              {content.author ? `By ${content.author} · Source: ${hostname}` : `Source: ${hostname}`}
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          )}

          <div ref={sentinelRef} aria-hidden="true" />
        </div>

        <button
          type="button"
          onClick={onNext}
          disabled={!reachedEnd}
          aria-disabled={!reachedEnd}
          className={cn(
            "mt-6 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold transition-all",
            reachedEnd
              ? "bg-primary text-text-on-primary hover:opacity-90 active:scale-[0.98]"
              : "cursor-not-allowed bg-bg-muted text-text-tertiary",
          )}
        >
          Continue to Live Dictionary
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </button>
        {!reachedEnd && (
          <p className="mt-2 text-center text-xs font-medium text-text-tertiary">Finish reading to continue.</p>
        )}
      </div>

      {selection && (
        <SelectionToolbar
          position={selection}
          onExplain={() => handleSelectionAction("explain", selection.text)}
          onTranslate={() => handleSelectionAction("translate", selection.text)}
          onSimplify={() => handleSelectionAction("simplify", selection.text)}
        />
      )}

      <TutoChatSheet
        open={sheetOpen}
        title={sheetTitle}
        onClose={() => setSheetOpen(false)}
        messages={chat.messages}
        status={chat.status}
        error={chat.error}
        onSend={chat.sendMessage}
        placeholder="Ask Tuto a question…"
      />
    </motion.div>
  );
}
