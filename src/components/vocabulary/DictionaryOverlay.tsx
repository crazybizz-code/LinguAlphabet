"use client";

import { useState, useTransition } from "react";
import { BookMarked, Check, MessageCircleQuestion } from "lucide-react";
import { EditSheet } from "@/components/profile/EditSheet";
import { saveVocabularyWord } from "@/lib/vocabulary/actions";
import type { VocabularyEntry } from "@/types/content";

export interface DictionaryOverlayProps {
  open: boolean;
  word: string;
  /** The matched curated vocabulary entry, or null if this exact word isn't in our data yet — never fabricated. */
  entry: VocabularyEntry | null;
  sourceContentId: string;
  onClose: () => void;
}

/**
 * Reusable word-lookup overlay — takes a plain word + optional matched
 * entry, no knowledge of podcasts specifically, so Articles/Stories/Videos/
 * Conversations can all open this exact component from their own tappable
 * text later. Built on the same sheet chrome as Profile's field editors
 * (bottom sheet on mobile, centered modal on desktop) for visual
 * consistency with the rest of the app, not a bespoke shape of its own.
 */
export function DictionaryOverlay({ open, word, entry, sourceContentId, onClose }: DictionaryOverlayProps) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function handleSave() {
    startTransition(async () => {
      const result = await saveVocabularyWord({
        word,
        definition: entry?.definition ?? null,
        phonetic: entry?.phonetic ?? null,
        pos: entry?.pos ?? null,
        translation: entry?.translation ?? null,
        example: entry?.example ?? null,
        sourceContentId,
      });
      if (result.success) setSaved(true);
    });
  }

  return (
    <EditSheet open={open} title={word ? word.charAt(0).toUpperCase() + word.slice(1) : ""} onClose={onClose}>
      {entry ? (
        <div className="flex flex-col gap-4">
          {(entry.phonetic || entry.pos) && (
            <div className="flex flex-wrap items-center gap-2">
              {entry.phonetic && <span className="text-sm text-text-tertiary">/{entry.phonetic}/</span>}
              {entry.pos && (
                <span className="rounded-full bg-bg-muted px-2.5 py-1 text-xs font-semibold text-text-secondary">{entry.pos}</span>
              )}
            </div>
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Definition</p>
            <p className="mt-1 text-sm leading-relaxed text-text-primary">{entry.definition}</p>
          </div>
          {entry.translation && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Uzbek</p>
              <p className="mt-1 text-sm leading-relaxed text-text-primary">{entry.translation}</p>
            </div>
          )}
          {entry.example && (
            <div className="rounded-2xl border border-border bg-bg-muted p-3">
              <p className="text-sm italic leading-relaxed text-text-secondary">&ldquo;{entry.example}&rdquo;</p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-text-secondary">
          We don&apos;t have a full definition for this word yet — but you can still save it to look up later.
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
        {/* Tuto Chat has no backend yet (task #36) — an honest disabled
            state, not a fake "ask" action with nothing behind it. */}
        <div
          aria-disabled="true"
          className="flex cursor-not-allowed items-center justify-center gap-2 rounded-2xl border border-border py-3 text-sm font-bold text-text-tertiary opacity-60"
        >
          <MessageCircleQuestion className="h-4 w-4" aria-hidden="true" />
          Ask Tuto — Coming Soon
        </div>
      </div>
    </EditSheet>
  );
}
