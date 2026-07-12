"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Tuto } from "@/components/mascot/Tuto";
import { cn } from "@/lib/utils";
import { SESSION_STEP_CONTAINER, SESSION_STEP_CONTENT } from "./sessionStepLayout";
import type { LearningSessionContent } from "@/lib/learning-session/types";

/** Several approved sources (docs/content-source-policy.md) require visible attribution + a link back — this is that link. Hostname only, not the full URL, to keep it unobtrusive. */
function sourceHostname(sourceUrl: string): string | null {
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * The "read the article" step — Reading's counterpart to the Podcast
 * Player's "must listen to X%" gate (PlayerStep.tsx): Continue stays
 * disabled until a sentinel placed after the last paragraph has actually
 * scrolled into view, so jumping straight to the end isn't possible
 * without at least scrolling past the whole body. Short articles that
 * already fit on screen satisfy this the moment they mount, since the
 * sentinel is already in the viewport — no minimum-length special-casing
 * needed. Plain text only, no tap-to-define here — that's the next step,
 * Live Dictionary (DictionaryStep.tsx), which reuses the exact same
 * paragraphs.
 */
export function ReadingStep({ content, onNext }: { content: LearningSessionContent; onNext: () => void }) {
  const [reachedEnd, setReachedEnd] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hostname = content.sourceUrl ? sourceHostname(content.sourceUrl) : null;

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
        </div>

        <div className="rounded-[1.75rem] bg-bg-muted p-5 sm:p-8">
          <div className="mb-5 flex items-center gap-3">
            <span className="rounded-full border border-border bg-bg-card px-3 py-1 text-xs font-bold text-primary">
              {content.cefrLevel}
            </span>
          </div>
          <h3 className="mb-5 text-xl font-bold text-text-primary">{content.title}</h3>

          <div className="flex flex-col gap-4">
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
              Source: {hostname}
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
    </motion.div>
  );
}
