"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { Tuto } from "@/components/mascot/Tuto";
import { ClickableText } from "@/components/vocabulary/ClickableText";
import { DictionaryOverlay } from "@/components/vocabulary/DictionaryOverlay";
import { cn } from "@/lib/utils";
import type { LearningSessionContent } from "@/lib/learning-session/types";
import type { TranscriptSegment, VocabularyEntry } from "@/types/content";

const SKIP_SECONDS = 15;

function formatTime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

/**
 * One transcript line. Memoized so that during playback — when the active
 * segment index changes on every audio timeupdate tick — only the segment
 * losing highlight and the segment gaining it actually re-render; the other
 * 60-150+ segments in a real transcript bail out via React.memo's shallow
 * prop comparison (their `segment` reference and `isActive` boolean are
 * unchanged). Re-tokenizing every word button on every tick is what made
 * clicks unresponsive on longer transcripts before this was isolated.
 */
const TranscriptLine = memo(function TranscriptLine({
  segment,
  isActive,
  onWordClick,
}: {
  segment: TranscriptSegment;
  isActive: boolean;
  onWordClick: (word: string, context: string) => void;
}) {
  const lineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isActive) {
      lineRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isActive]);

  return (
    <div
      ref={lineRef}
      className={cn(
        "rounded-xl px-2 py-1.5 transition-colors duration-300",
        isActive && "bg-primary-lighter",
      )}
    >
      <p
        className={cn(
          "text-xs font-semibold uppercase tracking-wide transition-colors duration-300",
          isActive ? "text-primary" : "text-text-tertiary",
        )}
      >
        {segment.speaker}
      </p>
      <ClickableText
        text={segment.text}
        onWordClick={onWordClick}
        className={cn(
          "mt-0.5 text-sm leading-relaxed transition-colors duration-300",
          isActive ? "font-medium text-text-primary" : "text-text-secondary",
        )}
      />
    </div>
  );
});

/**
 * The transcript list itself stays memoized on (transcript, onWordClick) —
 * activeIndex is threaded through as a plain prop rather than causing this
 * wrapper to re-render on every tick regardless (see TranscriptLine above
 * for where the actual re-render cost is contained).
 */
const TranscriptPanel = memo(function TranscriptPanel({
  transcript,
  activeIndex,
  onWordClick,
}: {
  transcript: LearningSessionContent["transcript"];
  activeIndex: number;
  onWordClick: (word: string, context: string) => void;
}) {
  return (
    <div className="mt-6 max-h-72 overflow-y-auto rounded-2xl border border-border bg-bg-card p-4">
      <div className="flex flex-col gap-1">
        {transcript.map((segment, index) => (
          <TranscriptLine
            key={`${segment.startMs}-${index}`}
            segment={segment}
            isActive={index === activeIndex}
            onWordClick={onWordClick}
          />
        ))}
      </div>
    </div>
  );
});

/**
 * The actual "listen to the podcast" step — the flow's original first item
 * ("Podcast" → "Podcast Summary" → ...) was always meant to be its own
 * screen, distinct from the Summary that follows it. Custom transport UI
 * over a plain <audio> element (native controls don't carry our brand or
 * support tappable-word lookup).
 *
 * Transcript sync: the audio element's real playback position (currentTime,
 * updated by the native `timeupdate` event — never a timer/interval) is
 * compared against each segment's startMs/endMs to find the one segment
 * currently playing, which gets highlighted and scrolled into view. The
 * audio is the only source of truth; pausing, seeking, or changing
 * playback rate all flow through currentTime automatically, so the
 * transcript can never drift or advance on its own.
 *
 * This depends on real per-segment timestamps. scripts/build-podcast-seed.mjs
 * sources them from content/legacy-podcast-lessons/generated/bbcTranscripts.js
 * — WhisperX forced alignment against the actual downloaded audio
 * (docs/transcript-alignment.md), not an estimate. A prior version of this
 * screen computed startMs/endMs as a proportional guess from word/punctuation
 * weight, which is why highlighting was pulled entirely rather than shipped
 * against data that couldn't support it — this is the real alignment data,
 * not that estimate restored.
 */
export function PlayerStep({ content, onNext }: { content: LearningSessionContent; onNext: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(content.durationSeconds);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [selectedContext, setSelectedContext] = useState("");

  const activeIndex = useMemo(() => {
    const currentMs = currentTime * 1000;
    return content.transcript.findIndex((segment) => currentMs >= segment.startMs && currentMs < segment.endMs);
  }, [content.transcript, currentTime]);

  const handleWordClick = useCallback((word: string, context: string) => {
    setSelectedWord(word);
    setSelectedContext(context);
  }, []);

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
          <TranscriptPanel transcript={content.transcript} activeIndex={activeIndex} onWordClick={handleWordClick} />
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
        context={selectedContext}
        entry={selectedWord ? findVocabularyEntry(selectedWord) : null}
        sourceContentId={content.contentId}
        onClose={() => setSelectedWord(null)}
      />
    </motion.div>
  );
}
