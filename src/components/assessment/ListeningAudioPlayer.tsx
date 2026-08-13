"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Info, Play, Volume2 } from "lucide-react";

interface ListeningAudioPlayerProps {
  audioUrl: string;
  instruction?: string | null;
  /**
   * Seeds the "already played" state on mount — lets a caller restore this
   * when a learner revisits a question they've already played audio for.
   * Pair with a `key` at the call site (e.g. `key={question.id}`) so the
   * component remounts and re-seeds per question instead of carrying state
   * over from a previous `audioUrl`.
   */
  initiallyPlayed?: boolean;
  /** Fired once, the moment playback starts (mirrors `played` flipping true) — lets a caller persist "played" externally, e.g. per-question across navigation. */
  onPlay?: () => void;
  /** Fired when playback finishes naturally. */
  onEnded?: () => void;
}

export function ListeningAudioPlayer({
  audioUrl,
  instruction,
  initiallyPlayed = false,
  onPlay,
  onEnded,
}: ListeningAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [played, setPlayed] = useState(initiallyPlayed);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    audio.volume = volume;
    audio.addEventListener("timeupdate", () => setCurrentTime(audio.currentTime));
    audio.addEventListener("loadedmetadata", () => setDuration(audio.duration));
    audio.addEventListener("ended", () => {
      setPlaying(false);
      onEnded?.();
    });
    return () => {
      audio.pause();
      audio.src = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl]);

  function handlePlay() {
    if (played || !audioRef.current) return;
    setPlayed(true);
    setPlaying(true);
    onPlay?.();
    audioRef.current.play().catch(console.error);
  }

  function handleVolumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  }

  function formatTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-5">
      <div className="flex items-center gap-2">
        <p className="text-sm font-bold text-text-primary">Audio Recording</p>
        {playing ? (
          <span className="flex items-center gap-1.5 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" aria-hidden="true" />
            Playing…
          </span>
        ) : played ? (
          <span className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-600">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            Played
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
            <Info className="h-3 w-3" aria-hidden="true" />
            One play only
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center gap-4">
        <button
          onClick={handlePlay}
          disabled={played}
          aria-label={played ? "Already played" : "Play audio"}
          className={[
            "flex h-14 w-14 shrink-0 items-center justify-center rounded-full shadow-lg transition-all",
            played
              ? "cursor-not-allowed bg-bg-muted text-text-tertiary"
              : "bg-blue-500 text-white shadow-blue-500/30 hover:scale-105 active:scale-95",
          ].join(" ")}
        >
          <Play className="h-6 w-6 fill-current" aria-hidden="true" />
        </button>

        <div className="flex-1">
          <div className="relative h-2 overflow-hidden rounded-full bg-blue-100">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-500 to-blue-400"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[10px] font-medium tabular-nums text-text-tertiary">
            <span>{formatTime(currentTime)}</span>
            <span>{duration > 0 ? formatTime(duration) : "--:--"}</span>
          </div>
        </div>
      </div>

      {/* Volume control */}
      <div className="mt-3 flex items-center gap-3">
        <Volume2 className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={handleVolumeChange}
          className="h-1.5 flex-1 cursor-pointer accent-blue-500"
          aria-label="Volume"
        />
        <span className="w-8 text-right text-[11px] tabular-nums text-text-tertiary">
          {Math.round(volume * 100)}%
        </span>
      </div>

      {!played && (
        <p className="mt-3 text-[11px] text-text-tertiary">
          {instruction ?? "Press play to begin. The recording can only be played once — there is no pause, rewind, or seek."}
        </p>
      )}
    </div>
  );
}
