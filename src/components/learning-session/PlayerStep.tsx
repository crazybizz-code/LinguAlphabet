"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { Tuto } from "@/components/mascot/Tuto";
import { ClickableText } from "@/components/vocabulary/ClickableText";
import { DictionaryOverlay } from "@/components/vocabulary/DictionaryOverlay";
import type { LearningSessionContent } from "@/lib/learning-session/types";
import type { VocabularyEntry } from "@/types/content";

const SKIP_SECONDS = 15;

function formatTime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

/**
 * The actual "listen to the podcast" step — the flow's original first item
 * ("Podcast" → "Podcast Summary" → ...) was always meant to be its own
 * screen, distinct from the Summary that follows it. Custom transport UI
 * over a plain <audio> element (native controls don't carry our brand or
 * support tappable-word lookup).
 *
 * Transcript is rendered statically, with no active-segment highlighting —
 * this project's seeded transcripts don't have real timestamps yet
 * (scripts/build-podcast-seed.mjs's estimateTiming() distributes startMs/
 * endMs proportionally by a word/punctuation weight, not a measured forced
 * alignment). Highlighting against an estimate drifts further from the
 * real audio the longer playback runs. Re-add sync once real per-segment
 * timestamps exist — the comparison logic itself wasn't wrong, the data it
 * trusted was never reliable enough to build a feature on.
 */
export function PlayerStep({ content, onNext }: { content: LearningSessionContent; onNext: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(content.durationSeconds);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);

  function findVocabularyEntry(word: string): VocabularyEntry | null {
    const normalized = word.toLowerCase();
    return content.vocabulary.find((entry) => entry.word.toLowerCase() === normalized) ?? null;
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
  }

  function skip(deltaSeconds: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.min(Math.max(0, audio.currentTime + deltaSeconds), duration);
  }

  function seek(value: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setCurrentTime(value);
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="mx-auto max-w-2xl px-5 py-6 sm:px-8"
    >
      {/* Audio playback is independent of the overlay below — opening a
          word's definition never touches this element, so playback
          continues uninterrupted while the dictionary is open. */}
      <audio
        ref={audioRef}
        src={content.audioUrl}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || content.durationSeconds)}
      />

      <div className="mb-6 flex items-start gap-3">
        <Tuto pose="listening" size="md" animation="float" />
        <div className="flex-1 pt-1">
          <h2 className="text-lg font-bold text-text-primary">Let&apos;s listen together</h2>
          <p className="text-sm text-text-secondary">Tap any word in the transcript to look it up.</p>
        </div>
      </div>

      <div className="rounded-[1.75rem] bg-bg-muted p-6 sm:p-8">
        <div className="mb-5 flex items-center gap-3">
          <span className="rounded-full border border-border bg-bg-card px-3 py-1 text-xs font-bold text-primary">
            {content.cefrLevel}
          </span>
        </div>
        <h3 className="mb-6 text-xl font-bold text-text-primary">{content.title}</h3>

        <div className="flex items-center justify-center gap-6">
          <button
            type="button"
            onClick={() => skip(-SKIP_SECONDS)}
            aria-label={`Back ${SKIP_SECONDS} seconds`}
            className="flex h-11 w-11 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-bg-card"
          >
            <RotateCcw className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-text-on-primary shadow-glow transition-transform active:scale-95"
          >
            {isPlaying ? <Pause className="h-7 w-7" aria-hidden="true" /> : <Play className="ml-0.5 h-7 w-7" aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={() => skip(SKIP_SECONDS)}
            aria-label={`Forward ${SKIP_SECONDS} seconds`}
            className="flex h-11 w-11 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-bg-card"
          >
            <RotateCw className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-6">
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onChange={(event) => seek(Number(event.target.value))}
            aria-label="Seek"
            className="w-full accent-primary"
          />
          <div className="mt-1 flex justify-between text-xs font-medium text-text-tertiary">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {content.transcript.length > 0 && (
          <div className="mt-6 max-h-72 overflow-y-auto rounded-2xl border border-border bg-bg-card p-4">
            <div className="flex flex-col gap-3">
              {content.transcript.map((segment, index) => (
                <div key={`${segment.startMs}-${index}`} className="px-1 py-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">{segment.speaker}</p>
                  <ClickableText
                    text={segment.text}
                    onWordClick={setSelectedWord}
                    className="mt-0.5 text-sm leading-relaxed text-text-secondary"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onNext}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-bold text-text-on-primary transition-all hover:opacity-90 active:scale-[0.98]"
      >
        Continue to Summary
        <ArrowRight className="h-5 w-5" aria-hidden="true" />
      </button>

      <DictionaryOverlay
        open={selectedWord !== null}
        word={selectedWord ?? ""}
        entry={selectedWord ? findVocabularyEntry(selectedWord) : null}
        sourceContentId={content.contentId}
        onClose={() => setSelectedWord(null)}
      />
    </motion.div>
  );
}
