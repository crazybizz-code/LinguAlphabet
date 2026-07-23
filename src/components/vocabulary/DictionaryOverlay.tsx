"use client";

import { useEffect, useState, useTransition } from "react";
import { BookMarked, Check, MessageCircleQuestion, ArrowLeft } from "lucide-react";
import { EditSheet } from "@/components/profile/EditSheet";
import { TutoChatPanel } from "@/components/tuto-chat/TutoChatPanel";
import { VocabularyCard } from "@/components/tuto-chat/VocabularyCard";
import { useTutoChat } from "@/hooks/useTutoChat";
import { askVocabulary, type VocabularyExplanation } from "@/lib/tuto-chat/askVocabulary";
import { summarizeVocabularyForHistory } from "@/lib/tuto-chat/summarizeVocabulary";
import type { TutoContextInput } from "@/lib/tuto-chat/types";
import { saveVocabularyWord } from "@/lib/vocabulary/actions";
import { lookupWord } from "@/lib/vocabulary/lookup";
import type { VocabularyEntry } from "@/types/content";

const CEFR_LEVELS = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);

export interface DictionaryOverlayProps {
  open: boolean;
  word: string;
  /** The sentence the word was clicked in — sent to the live lookup for word-sense disambiguation. */
  context: string;
  /** The matched curated vocabulary entry, or null if this exact word isn't curated for this lesson. */
  entry: VocabularyEntry | null;
  sourceContentId: string;
  /** Title of the podcast/article this word was clicked in — becomes part of Tuto's LearningContext for "Ask Tuto". */
  contentTitle: string;
  /** Same union as LearningSessionContent["contentType"] — only "podcast"/"article" map onto LearningContext today, everything else (a future Story/Video adapter) degrades to no content reference rather than a wrong one. */
  contentType: "podcast" | "article" | "story" | "video" | "news" | "conversation" | "challenge";
  /** The content's own CEFR level, used as a stand-in for the learner's level — PlayerStep/DictionaryStep don't currently thread the learner's own profile level down this far. */
  cefrLevel?: string;
  onClose: () => void;
}

/**
 * Reusable word-lookup overlay — takes a plain word + optional matched
 * curated entry, no knowledge of podcasts specifically, so Articles/Stories/
 * Videos/Conversations can all open this exact component from their own
 * tappable text later. Built on the same sheet chrome as Profile's field
 * editors (bottom sheet on mobile, centered modal on desktop).
 *
 * Curated entries (a lesson's own hand-reviewed vocabulary list) render
 * instantly and never touch the network. Every other word falls through to
 * a live Gemini lookup — a real generated definition, not a fabricated
 * fallback — cached per word for the lifetime of this component so
 * re-clicking the same word doesn't refetch.
 */
export function DictionaryOverlay({
  open,
  word,
  context,
  entry,
  sourceContentId,
  contentTitle,
  contentType,
  cefrLevel,
  onClose,
}: DictionaryOverlayProps) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [trackedWord, setTrackedWord] = useState(word);
  const [cache, setCache] = useState<Record<string, VocabularyEntry>>({});
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // "definition" is the existing curated/live-lookup view above; "chat" is
  // this sprint's Vocabulary Intelligence view (VocabularyCard + follow-up
  // conversation) — a content swap inside the same sheet, not a second
  // sheet stacked on top of this one.
  const [mode, setMode] = useState<"definition" | "chat">("definition");
  const [vocabularyExplanation, setVocabularyExplanation] = useState<VocabularyExplanation | null>(null);
  const [isLoadingVocabulary, setIsLoadingVocabulary] = useState(false);
  const [vocabularyError, setVocabularyError] = useState<string | null>(null);

  const normalizedWord = word.trim().toLowerCase();
  const cachedEntry = cache[normalizedWord] ?? null;
  const effectiveEntry = entry ?? cachedEntry;

  const tutoContext: TutoContextInput = {
    currentScreen: contentType === "podcast" || contentType === "article" ? contentType : null,
    currentPodcast: contentType === "podcast" ? { id: sourceContentId, title: contentTitle } : null,
    currentArticle: contentType === "article" ? { id: sourceContentId, title: contentTitle } : null,
    selectedWord: word || null,
    userLevel: cefrLevel && CEFR_LEVELS.has(cefrLevel) ? (cefrLevel as TutoContextInput["userLevel"]) : null,
  };

  const chat = useTutoChat({ context: tutoContext });

  // Adjust local state during render when the word changes, per React's
  // documented pattern for resetting state from a changed prop — not an
  // effect, so this never fires a synchronous setState-in-effect chain.
  if (word !== trackedWord) {
    setTrackedWord(word);
    setSaved(false);
    setLookupError(null);
    setIsLookingUp(open && Boolean(word) && !entry && !cachedEntry);
    setMode("definition");
    setVocabularyExplanation(null);
    setVocabularyError(null);
  }

  // The actual network call: fires once per word that needs it (guarded by
  // isLookingUp, which render-phase logic above only sets true for a fresh,
  // uncached, non-curated word), and only ever calls setState from the
  // resolved promise — the sanctioned "subscribe to an external system" shape.
  useEffect(() => {
    if (!isLookingUp) return;

    let cancelled = false;
    lookupWord(word, context).then((result) => {
      if (cancelled) return;
      setIsLookingUp(false);
      if (result.success) {
        setCache((prev) => ({ ...prev, [normalizedWord]: result.entry }));
      } else {
        setLookupError(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isLookingUp, word, context, normalizedWord]);

  function retryLookup() {
    setCache((prev) => {
      const next = { ...prev };
      delete next[normalizedWord];
      return next;
    });
    setLookupError(null);
    setIsLookingUp(true);
  }

  function handleSave() {
    startTransition(async () => {
      const result = await saveVocabularyWord({
        word,
        definition: effectiveEntry?.definition ?? null,
        phonetic: effectiveEntry?.phonetic ?? null,
        pos: effectiveEntry?.pos ?? null,
        translation: effectiveEntry?.translation ?? null,
        example: effectiveEntry?.example ?? null,
        sourceContentId,
      });
      if (result.success) setSaved(true);
    });
  }

  async function handleAskTuto() {
    setMode("chat");
    if (vocabularyExplanation || isLoadingVocabulary) return;

    setIsLoadingVocabulary(true);
    setVocabularyError(null);
    try {
      const explanation = await askVocabulary(word, tutoContext);
      setVocabularyExplanation(explanation);
      chat.addHiddenContext(summarizeVocabularyForHistory(explanation));
    } catch (err) {
      setVocabularyError(err instanceof Error ? err.message : "Tuto couldn't explain that word right now.");
    } finally {
      setIsLoadingVocabulary(false);
    }
  }

  return (
    <EditSheet open={open} title={word ? word.charAt(0).toUpperCase() + word.slice(1) : ""} onClose={onClose}>
      {mode === "chat" ? (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setMode("definition")}
            className="flex items-center gap-1.5 self-start text-xs font-semibold text-text-tertiary hover:text-text-secondary"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to definition
          </button>

          {isLoadingVocabulary ? (
            <div className="flex items-center gap-2 py-2 text-sm text-text-secondary">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" aria-hidden="true" />
              Tuto is thinking&hellip;
            </div>
          ) : vocabularyError && !vocabularyExplanation ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm leading-relaxed text-text-secondary">{vocabularyError}</p>
              <button
                type="button"
                onClick={handleAskTuto}
                className="self-start rounded-full border border-border px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-bg-muted"
              >
                Try again
              </button>
            </div>
          ) : (
            <TutoChatPanel
              messages={chat.messages}
              status={chat.status}
              error={chat.error}
              onSend={chat.sendMessage}
              header={vocabularyExplanation ? <VocabularyCard explanation={vocabularyExplanation} /> : undefined}
              placeholder={`Ask about "${word}"…`}
            />
          )}
        </div>
      ) : (
        <>
          {effectiveEntry ? (
            <div className="flex flex-col gap-4">
              {(effectiveEntry.phonetic || effectiveEntry.pos) && (
                <div className="flex flex-wrap items-center gap-2">
                  {effectiveEntry.phonetic && <span className="text-sm text-text-tertiary">/{effectiveEntry.phonetic}/</span>}
                  {effectiveEntry.pos && (
                    <span className="rounded-full bg-bg-muted px-2.5 py-1 text-xs font-semibold text-text-secondary">
                      {effectiveEntry.pos}
                    </span>
                  )}
                </div>
              )}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Definition</p>
                <p className="mt-1 text-sm leading-relaxed text-text-primary">{effectiveEntry.definition}</p>
              </div>
              {effectiveEntry.translation && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Uzbek</p>
                  <p className="mt-1 text-sm leading-relaxed text-text-primary">{effectiveEntry.translation}</p>
                </div>
              )}
              {effectiveEntry.example && (
                <div className="rounded-2xl border border-border bg-bg-muted p-3">
                  <p className="text-sm italic leading-relaxed text-text-secondary">&ldquo;{effectiveEntry.example}&rdquo;</p>
                </div>
              )}
            </div>
          ) : isLookingUp ? (
            <div className="flex items-center gap-2 py-2 text-sm text-text-secondary">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" aria-hidden="true" />
              Looking up &ldquo;{word}&rdquo;&hellip;
            </div>
          ) : lookupError ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm leading-relaxed text-text-secondary">
                We couldn&apos;t look this word up right now. Check your connection and try again.
              </p>
              <button
                type="button"
                onClick={retryLookup}
                className="self-start rounded-full border border-border px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-bg-muted"
              >
                Try again
              </button>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-text-secondary">
              We don&apos;t have a definition for this word yet — but you can still save it to look up later.
            </p>
          )}

          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || saved}
              className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-text-on-primary transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
            >
              {saved ? <Check className="h-4 w-4" aria-hidden="true" /> : <BookMarked className="h-4 w-4" aria-hidden="true" />}
              {saved ? "Saved to Vocabulary" : "Save to Vocabulary"}
            </button>
            <button
              type="button"
              onClick={handleAskTuto}
              className="flex items-center justify-center gap-2 rounded-2xl border border-border py-3 text-sm font-bold text-text-primary transition-all hover:bg-bg-muted active:scale-[0.98]"
            >
              <MessageCircleQuestion className="h-4 w-4" aria-hidden="true" />
              Ask Tuto
            </button>
          </div>
        </>
      )}
    </EditSheet>
  );
}
