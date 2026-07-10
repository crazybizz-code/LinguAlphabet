"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowRight, Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { Tuto } from "@/components/mascot/Tuto";
import { ClickableText } from "@/components/vocabulary/ClickableText";
import { DictionaryOverlay } from "@/components/vocabulary/DictionaryOverlay";
import { cn } from "@/lib/utils";
import { SESSION_STEP_CONTAINER } from "./sessionStepLayout";
import type { LearningSessionContent } from "@/lib/learning-session/types";
import type { TranscriptSegment, VocabularyEntry } from "@/types/content";

const SKIP_SECONDS = 15;
const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5];
/** Real cumulative listened time must reach this fraction of the real
 * duration before Continue unlocks — not 100%, since timeupdate's ~250ms
 * granularity can legitimately leave the tally a hair short even after a
 * genuine full listen. */
const LISTEN_COMPLETION_THRESHOLD = 0.95;
/** Above this per-tick delta, a jump is a seek (forward or backward), not
 * natural playback — excluded from the listened tally so completion can't
 * be gamed by dragging the scrubber to the end. */
const MAX_NATURAL_TICK_SECONDS = 1.5;

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
 *
 * `size` only changes padding/type scale (desktop's reading pane wants a
 * bigger, airier line than the compact mobile panel) — the highlight and
 * auto-scroll logic is identical either way.
 */
const TranscriptLine = memo(function TranscriptLine({
  segment,
  isActive,
  onWordClick,
  size = "compact",
}: {
  segment: TranscriptSegment;
  isActive: boolean;
  onWordClick: (word: string, context: string) => void;
  size?: "compact" | "comfortable";
}) {
  const lineRef = useRef<HTMLDivElement>(null);
  const comfortable = size === "comfortable";

  useEffect(() => {
    if (isActive) {
      lineRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isActive]);

  return (
    <div
      ref={lineRef}
      className={cn(
        "rounded-xl transition-colors duration-300",
        comfortable ? "px-4 py-3" : "px-2 py-1.5",
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
          "leading-relaxed transition-colors duration-300",
          comfortable ? "mt-1 text-base leading-loose" : "mt-0.5 text-sm",
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
  size = "compact",
  className,
}: {
  transcript: LearningSessionContent["transcript"];
  activeIndex: number;
  onWordClick: (word: string, context: string) => void;
  size?: "compact" | "comfortable";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-y-auto",
        size === "compact" && "max-h-72 rounded-2xl border border-border bg-bg-card p-4",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        {transcript.map((segment, index) => (
          <TranscriptLine
            key={`${segment.startMs}-${index}`}
            segment={segment}
            isActive={index === activeIndex}
            onWordClick={onWordClick}
            size={size}
          />
        ))}
      </div>
    </div>
  );
});

/** Back/play-pause/forward transport row — identical on mobile and desktop. */
function PlaybackControls({
  isPlaying,
  onTogglePlay,
  onSkip,
}: {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSkip: (deltaSeconds: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-6">
      <button
        type="button"
        onClick={() => onSkip(-SKIP_SECONDS)}
        aria-label={`Back ${SKIP_SECONDS} seconds`}
        className="flex h-11 w-11 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-bg-card"
      >
        <RotateCcw className="h-5 w-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onTogglePlay}
        aria-label={isPlaying ? "Pause" : "Play"}
        className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-text-on-primary shadow-glow transition-transform active:scale-95"
      >
        {isPlaying ? <Pause className="h-7 w-7" aria-hidden="true" /> : <Play className="ml-0.5 h-7 w-7" aria-hidden="true" />}
      </button>
      <button
        type="button"
        onClick={() => onSkip(SKIP_SECONDS)}
        aria-label={`Forward ${SKIP_SECONDS} seconds`}
        className="flex h-11 w-11 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-bg-card"
      >
        <RotateCw className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Seek range + elapsed/total labels — identical on mobile and desktop. */
function SeekBar({
  currentTime,
  duration,
  onSeek,
}: {
  currentTime: number;
  duration: number;
  onSeek: (value: number) => void;
}) {
  return (
    <div>
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={currentTime}
        onChange={(event) => onSeek(Number(event.target.value))}
        aria-label="Seek"
        className="w-full accent-primary"
      />
      <div className="mt-1 flex justify-between text-xs font-medium text-text-tertiary">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}

/** Desktop-only — mobile's transport is already thumb-reachable enough that a rate control adds clutter rather than value there. */
function PlaybackSpeedControl({ rate, onChange }: { rate: number; onChange: (rate: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Speed</span>
      <div className="flex gap-1.5">
        {PLAYBACK_RATES.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={rate === option}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-bold transition-colors",
              rate === option
                ? "border-primary bg-primary text-text-on-primary"
                : "border-border bg-bg-card text-text-secondary hover:bg-bg-muted",
            )}
          >
            {option}x
          </button>
        ))}
      </div>
    </div>
  );
}

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
 * (docs/transcript-alignment.md), not an estimate.
 *
 * Listening is a required activity, not a skippable intro: Continue stays
 * disabled until `listenedSeconds` (cumulative real forward-playback time,
 * see handleTimeUpdate) reaches LISTEN_COMPLETION_THRESHOLD of the real
 * duration. currentTime alone can't gate this — dragging the scrubber to
 * the end moves currentTime without the learner having heard anything.
 *
 * Layout: below `lg` this renders a mobile-first single-column flow (tight
 * card padding, full-width transcript and controls). At `lg` and up it
 * switches to a two-column reading layout (artwork/
 * controls/speed on the left, a dedicated wide transcript pane on the
 * right) — both trees share the same state and the same PlaybackControls/
 * SeekBar/TranscriptPanel pieces, so only the composition differs, not the
 * underlying sync logic.
 */
export function PlayerStep({ content, onNext }: { content: LearningSessionContent; onNext: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(content.durationSeconds);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [selectedContext, setSelectedContext] = useState("");

  // Cumulative real listened time — the gate for unlocking Continue.
  // Deliberately not derived from currentTime alone (see handleTimeUpdate):
  // currentTime reaching the end via a seek must not count as "listened."
  const [listenedSeconds, setListenedSeconds] = useState(0);
  const lastTimeRef = useRef(0);
  const hasFinishedListening = duration > 0 && listenedSeconds >= duration * LISTEN_COMPLETION_THRESHOLD;

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

  function setPlaybackRate(rate: number) {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = rate;
    setPlaybackRateState(rate);
  }

  function handleTimeUpdate(time: number) {
    const delta = time - lastTimeRef.current;
    if (delta > 0 && delta < MAX_NATURAL_TICK_SECONDS) {
      setListenedSeconds((prev) => prev + delta);
    }
    lastTimeRef.current = time;
    setCurrentTime(time);
  }

  function handleEnded() {
    setIsPlaying(false);
    // A real finish always unlocks Continue, even if timeupdate's granularity
    // left the cumulative tally a hair under the threshold.
    setListenedSeconds(duration);
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={SESSION_STEP_CONTAINER}
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
        onEnded={handleEnded}
        onTimeUpdate={(event) => handleTimeUpdate(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || content.durationSeconds)}
      />

      {/* Mobile & tablet (<lg) — single-column, mobile-first: tighter card
          padding than desktop so the transcript and controls get the full
          available width rather than losing it to nested card margins. */}
      <div className="lg:hidden">
        <div className="mb-6 flex items-start gap-3">
          <Tuto pose="listening" size="md" animation="float" />
          <div className="flex-1 pt-1">
            <h2 className="text-lg font-bold text-text-primary">Let&apos;s listen together</h2>
            <p className="text-sm text-text-secondary">Tap any word in the transcript to look it up.</p>
          </div>
        </div>

        <div className="rounded-[1.75rem] bg-bg-muted p-5 sm:p-8">
          <div className="mb-5 flex items-center gap-3">
            <span className="rounded-full border border-border bg-bg-card px-3 py-1 text-xs font-bold text-primary">
              {content.cefrLevel}
            </span>
          </div>
          <h3 className="mb-6 text-xl font-bold text-text-primary">{content.title}</h3>

          <PlaybackControls isPlaying={isPlaying} onTogglePlay={togglePlay} onSkip={skip} />

          <div className="mt-6">
            <SeekBar currentTime={currentTime} duration={duration} onSeek={seek} />
          </div>

          {content.transcript.length > 0 && (
            <TranscriptPanel
              transcript={content.transcript}
              activeIndex={activeIndex}
              onWordClick={handleWordClick}
              className="mt-6"
            />
          )}
        </div>
      </div>

      {/* Desktop (lg+) — dedicated two-column reading layout. */}
      <div className="hidden lg:grid lg:grid-cols-[380px_1fr] lg:items-stretch lg:gap-8">
        <div className="flex flex-col rounded-card bg-bg-muted p-8">
          <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-border bg-bg-card shadow-soft">
            {content.thumbnailUrl ? (
              <Image src={content.thumbnailUrl} alt="" fill sizes="380px" className="object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Tuto pose="listening" size="lg" animation="float" />
              </div>
            )}
          </div>

          <div className="mt-6 flex items-center gap-3">
            <span className="rounded-full border border-border bg-bg-card px-3 py-1 text-xs font-bold text-primary">
              {content.cefrLevel}
            </span>
          </div>
          <h3 className="mt-3 text-xl font-bold leading-snug text-text-primary">{content.title}</h3>

          <div className="mt-8">
            <PlaybackControls isPlaying={isPlaying} onTogglePlay={togglePlay} onSkip={skip} />
          </div>

          <div className="mt-6">
            <SeekBar currentTime={currentTime} duration={duration} onSeek={seek} />
          </div>

          <div className="mt-6">
            <PlaybackSpeedControl rate={playbackRate} onChange={setPlaybackRate} />
          </div>
        </div>

        <div className="flex flex-col rounded-card border border-border bg-bg-card p-8">
          <div className="mb-4 flex items-center gap-3">
            <Tuto pose="listening" size="sm" animation="float" />
            <div>
              <h2 className="text-lg font-bold text-text-primary">Let&apos;s listen together</h2>
              <p className="text-sm text-text-secondary">Tap any word in the transcript to look it up.</p>
            </div>
          </div>

          {content.transcript.length > 0 && (
            <TranscriptPanel
              transcript={content.transcript}
              activeIndex={activeIndex}
              onWordClick={handleWordClick}
              size="comfortable"
              className="flex-1 lg:max-h-[calc(100vh-20rem)]"
            />
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onNext}
        disabled={!hasFinishedListening}
        aria-disabled={!hasFinishedListening}
        className={cn(
          "mt-6 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold transition-all lg:mt-8",
          hasFinishedListening
            ? "bg-primary text-text-on-primary hover:opacity-90 active:scale-[0.98]"
            : "cursor-not-allowed bg-bg-muted text-text-tertiary",
        )}
      >
        Continue to Summary
        <ArrowRight className="h-5 w-5" aria-hidden="true" />
      </button>
      {!hasFinishedListening && (
        <p className="mt-2 text-center text-xs font-medium text-text-tertiary">Finish listening to continue.</p>
      )}

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
