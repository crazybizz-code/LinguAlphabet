/**
 * Forced-alignment algorithm — ported faithfully from
 * scripts/align-bbc-transcripts.mjs (tokenize / loadWhisperWords /
 * alignTokens / buildAlignedSegments / fillSmallAlignmentGaps), not
 * reinvented. Same dynamic-programming token alignment that produced
 * Episode #001's real transcript timestamps (99.24% coverage, 0 missing
 * segments). Only the data source differs: a script's segments +
 * faster-whisper JSON, passed in directly, instead of the BBC
 * legacy-lesson source and its generated-module output.
 *
 * The one piece this module does NOT do is run faster-whisper itself —
 * that still requires a Python process (scripts/faster-whisper-words.py,
 * .venv-asr/) and is invoked by the caller (see pipeline.ts), which is
 * why this whole pipeline currently only runs on a machine with that
 * environment available, not in a Vercel serverless function.
 */

export interface WhisperWord {
  token: string;
  startMs: number;
  endMs: number;
}

export interface AlignedSegment {
  speaker: string;
  text: string;
  startMs: number;
  endMs: number;
}

interface WhisperJson {
  duration: number;
  segments: Array<{
    words?: Array<{ word?: string; text?: string; start: number | null; end: number | null }>;
  }>;
}

const WORD_RE = /[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu;

function normalizeToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "");
}

function tokenize(text: string): string[] {
  return [...text.matchAll(WORD_RE)].map((match) => normalizeToken(match[0])).filter(Boolean);
}

export function loadWhisperWords(whisperJson: WhisperJson): WhisperWord[] {
  const words: WhisperWord[] = [];
  for (const segment of whisperJson.segments || []) {
    for (const word of segment.words || []) {
      if (!Number.isFinite(word.start) || !Number.isFinite(word.end)) continue;
      const token = normalizeToken(String(word.word || word.text || ""));
      if (!token) continue;
      words.push({ token, startMs: Math.round(Number(word.start) * 1000), endMs: Math.round(Number(word.end) * 1000) });
    }
  }
  return words;
}

function tokenScore(a: string, b: string): number {
  if (a === b) return 3;
  if (a.length > 4 && b.length > 4 && (a.includes(b) || b.includes(a))) return 1;
  return -2;
}

function alignTokens(
  officialTokens: { token: string; segmentIndex: number }[],
  audioWords: WhisperWord[],
): Array<{ officialIndex: number; audioIndex: number }> {
  const n = officialTokens.length;
  const m = audioWords.length;
  const gapPenalty = -1;
  const dp: Int32Array[] = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  const trace: Uint8Array[] = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));

  for (let i = 1; i <= n; i++) {
    dp[i][0] = dp[i - 1][0] + gapPenalty;
    trace[i][0] = 1;
  }
  for (let j = 1; j <= m; j++) {
    dp[0][j] = dp[0][j - 1] + gapPenalty;
    trace[0][j] = 2;
  }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const diagonal = dp[i - 1][j - 1] + tokenScore(officialTokens[i - 1].token, audioWords[j - 1].token);
      const up = dp[i - 1][j] + gapPenalty;
      const left = dp[i][j - 1] + gapPenalty;
      if (diagonal >= up && diagonal >= left) {
        dp[i][j] = diagonal;
        trace[i][j] = 0;
      } else if (up >= left) {
        dp[i][j] = up;
        trace[i][j] = 1;
      } else {
        dp[i][j] = left;
        trace[i][j] = 2;
      }
    }
  }

  const matches: Array<{ officialIndex: number; audioIndex: number }> = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const move = trace[i][j];
    if (i > 0 && j > 0 && move === 0) {
      if (tokenScore(officialTokens[i - 1].token, audioWords[j - 1].token) > 0) {
        matches.push({ officialIndex: i - 1, audioIndex: j - 1 });
      }
      i -= 1;
      j -= 1;
    } else if (i > 0 && (j === 0 || move === 1)) {
      i -= 1;
    } else {
      j -= 1;
    }
  }
  return matches.reverse();
}

function fillSmallAlignmentGaps(segments: Array<{ text: string; startMs: number | null; endMs: number | null }>, durationMs: number): void {
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment.startMs !== null && segment.endMs !== null) continue;

    const previous = [...segments.slice(0, index)].reverse().find((s) => s.endMs !== null);
    const next = segments.slice(index + 1).find((s) => s.startMs !== null);
    if (!previous || !next) continue;

    const gapStart = previous.endMs as number;
    const gapEnd = next.startMs as number;
    const gapSegments: typeof segments = [];
    for (let cursor = index; cursor < segments.length; cursor += 1) {
      if (segments[cursor].startMs !== null) break;
      gapSegments.push(segments[cursor]);
    }

    const gapTextLengths = gapSegments.map((s) => Math.max(1, tokenize(s.text).length));
    const total = gapTextLengths.reduce((sum, value) => sum + value, 0);
    let offset = gapStart;

    gapSegments.forEach((missing, missingIndex) => {
      const share = gapTextLengths[missingIndex] / total;
      const end = missingIndex === gapSegments.length - 1 ? gapEnd : Math.round(offset + (gapEnd - gapStart) * share);
      missing.startMs = offset;
      missing.endMs = Math.max(offset + 1, end);
      offset = missing.endMs;
    });
  }

  for (const segment of segments) {
    if (segment.startMs === null || segment.endMs === null) {
      throw new Error(`Unable to align segment: "${segment.text.slice(0, 80)}"`);
    }
    segment.startMs = Math.max(0, Math.min(durationMs, segment.startMs));
    segment.endMs = Math.max(segment.startMs + 1, Math.min(durationMs, segment.endMs));
  }
}

export interface AlignmentResult {
  segments: AlignedSegment[];
  coverage: number;
  missingSegments: number;
  durationMs: number;
}

export function alignSegments(
  officialSegments: Array<{ speaker: string; text: string }>,
  audioWords: WhisperWord[],
  statedDurationMs: number,
): AlignmentResult {
  const officialTokens: { token: string; segmentIndex: number }[] = [];
  officialSegments.forEach((segment, segmentIndex) => {
    tokenize(segment.text).forEach((token) => officialTokens.push({ token, segmentIndex }));
  });

  const matches = alignTokens(officialTokens, audioWords);
  const perSegment: WhisperWord[][] = officialSegments.map(() => []);
  for (const match of matches) {
    const official = officialTokens[match.officialIndex];
    const audio = audioWords[match.audioIndex];
    perSegment[official.segmentIndex].push(audio);
  }

  const aligned = officialSegments.map((segment, index) => {
    const words = perSegment[index];
    if (!words.length) {
      return { speaker: segment.speaker, text: segment.text, startMs: null as number | null, endMs: null as number | null };
    }
    return { speaker: segment.speaker, text: segment.text, startMs: words[0].startMs, endMs: words[words.length - 1].endMs };
  });

  const audioDurationMs = audioWords.at(-1)?.endMs || statedDurationMs || 0;
  const durationMs = Math.max(statedDurationMs || 0, audioDurationMs);
  fillSmallAlignmentGaps(aligned, durationMs);

  const alignedTokenCount = perSegment.reduce((sum, words) => sum + words.length, 0);
  const coverage = officialTokens.length ? alignedTokenCount / officialTokens.length : 0;
  const missingSegments = aligned.filter((s) => s.startMs === null || s.endMs === null).length;

  return {
    segments: aligned as AlignedSegment[],
    coverage,
    missingSegments,
    durationMs,
  };
}

/** Same 0.82 threshold scripts/align-bbc-transcripts.mjs's --strict mode
 * (the default) uses — reused, not re-decided. */
export const MIN_TOKEN_COVERAGE = 0.82;

/**
 * Extracted from pipeline.ts so this pure, I/O-free validation logic is
 * independently unit-testable without mocking ffprobe/Fish
 * Audio/faster-whisper/Supabase — pipeline.ts calls this unchanged.
 *
 * Security-audit finding (MEDIUM): the original checks allowed segment i
 * to START before segment i-1 ENDS, as long as i's start wasn't before
 * i-1's start -- two adjacent segments could still overlap in time,
 * which the Learning Session's transcript scrubber would render as
 * garbled/simultaneous text. The new overlap check only adds a rejection
 * case; it does not alter what counts as a valid, non-overlapping
 * timestamp.
 */
export function validateAlignmentQuality(alignment: AlignmentResult, expectedSegmentCount: number): string[] {
  const problems: string[] = [];
  if (alignment.segments.length !== expectedSegmentCount) problems.push(`segment count ${alignment.segments.length} !== ${expectedSegmentCount}`);
  if (alignment.missingSegments > 0) problems.push(`${alignment.missingSegments} segments have no aligned words`);
  if (alignment.coverage < MIN_TOKEN_COVERAGE) problems.push(`token coverage ${alignment.coverage.toFixed(4)} < ${MIN_TOKEN_COVERAGE}`);

  for (let i = 0; i < alignment.segments.length; i++) {
    if (alignment.segments[i].startMs >= alignment.segments[i].endMs) problems.push(`segment ${i} startMs >= endMs`);
    if (i > 0 && alignment.segments[i].startMs < alignment.segments[i - 1].startMs) problems.push(`segment ${i} out of order`);
    if (i > 0 && alignment.segments[i].startMs < alignment.segments[i - 1].endMs) {
      problems.push(`segment ${i} overlaps segment ${i - 1} (starts at ${alignment.segments[i].startMs}ms, before segment ${i - 1} ends at ${alignment.segments[i - 1].endMs}ms)`);
    }
  }
  return problems;
}
