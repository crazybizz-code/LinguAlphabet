import type {
  CheckId,
  EpisodeMetadata,
  TranscriptCandidate,
  VerificationCheck,
  VerificationResult,
} from "./types";

/**
 * Transcript verification — pure, deterministic, no IO, no model call.
 *
 * SCOPE, STATED PLAINLY: this does not compare the transcript to the
 * audio waveform. Doing that would require decoding and transcribing the
 * audio, which is the automatic-transcription service this workflow
 * deliberately does not build. What this does instead is check the
 * transcript against (a) the episode's own independently-supplied
 * metadata and (b) itself — which is what actually catches the real
 * failure modes of a human-in-the-loop workflow: the wrong transcript
 * pasted against the wrong episode, a truncated or partial file, a
 * transcript for a 5-minute clip attached to a 50-minute episode, and
 * mangled speaker labels.
 *
 * The strongest available signal by far is duration ↔ word count: speech
 * rate is bounded by human physiology, so a transcript whose implied
 * runtime is wildly off the stated runtime is provably not a full,
 * correct transcript of that audio — no acoustic analysis needed.
 *
 * Deliberately model-free: verification is a gate, and a gate that can
 * fail because a third-party API rate-limited is not a gate. Pure also
 * means fully unit-testable, same posture as xp.ts/streak.ts/
 * spaced-repetition.ts elsewhere in this codebase.
 */

/** Conversational-English speech rate. Podcasts cluster ~140-160; the accept band below is deliberately wide enough to cover slow interview shows and fast news reads alike. */
const WORDS_PER_MINUTE = 150;

/** Ratio of (transcript-implied runtime) to (stated runtime). 1.0 is perfect. */
const DURATION_ACCEPT_MIN = 0.6;
const DURATION_ACCEPT_MAX = 1.4;
const DURATION_WARN_MIN = 0.4;
const DURATION_WARN_MAX = 1.8;

/** Below this, the transcript is rejected even with no hard-gate failure. */
const CONFIDENCE_THRESHOLD = 0.6;

/** How many speakers is plausible for a real episode before the labels look like a parsing artifact. */
const MAX_PLAUSIBLE_SPEAKERS = 8;

/** Words scanned at each end when looking for an opening/closing. */
const EDGE_WINDOW_WORDS = 120;

const WEIGHTS: Record<CheckId, number> = {
  duration_consistency: 3,
  speaker_consistency: 2,
  title_alignment: 2,
  description_overlap: 1.5,
  intro_present: 1,
  outro_present: 1,
};

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "have", "has", "are", "was", "were", "you", "your",
  "our", "its", "it's", "but", "not", "all", "can", "will", "how", "why", "what", "when", "who", "into",
  "about", "they", "them", "their", "there", "here", "been", "more", "most", "some", "than", "then",
  "episode", "podcast",
]);

const INTRO_MARKERS = [
  "welcome", "hello", "hi ", "hey", "good morning", "good afternoon", "good evening",
  "today we", "today i", "in this episode", "this episode", "joining me", "joining us",
  "my name is", "i'm ", "this is ", "thanks for tuning", "let's get started", "let's begin",
];

const OUTRO_MARKERS = [
  "thanks for listening", "thank you for listening", "see you next", "until next time",
  "that's all", "that's it for", "subscribe", "goodbye", "bye for now", "take care",
  "catch you next", "we'll see you", "join us next", "signing off",
];

function words(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

function significantTokens(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s']/g, " ")
        .split(/\s+/)
        .filter((token) => token.length > 3 && !STOPWORDS.has(token)),
    ),
  );
}

function check(id: CheckId, status: VerificationCheck["status"], score: number, detail: string): VerificationCheck {
  return { id, status, score, detail };
}

/**
 * The single most load-bearing check. A transcript's word count implies a
 * runtime; if that's far from the episode's stated runtime, this is not a
 * complete transcript of this episode — the most common real defect in a
 * manual workflow (partial paste, wrong file, wrong episode).
 *
 * Returns null when no duration was supplied: that's "couldn't check",
 * which must never be scored as either pass or fail. Collapsing missing
 * data into a low score would reject good transcripts for feeds that
 * simply omit <itunes:duration>.
 */
function checkDuration(candidate: TranscriptCandidate, metadata: EpisodeMetadata): VerificationCheck | null {
  if (!metadata.durationSeconds || metadata.durationSeconds <= 0) return null;

  const wordCount = words(candidate.text).length;
  const impliedMinutes = wordCount / WORDS_PER_MINUTE;
  const actualMinutes = metadata.durationSeconds / 60;
  const ratio = impliedMinutes / actualMinutes;
  const summary = `transcript has ${wordCount} words (~${impliedMinutes.toFixed(1)} min at ${WORDS_PER_MINUTE} wpm) vs stated runtime ${actualMinutes.toFixed(1)} min — ratio ${ratio.toFixed(2)}`;

  if (ratio >= DURATION_ACCEPT_MIN && ratio <= DURATION_ACCEPT_MAX) {
    return check("duration_consistency", "pass", 1, `Length is consistent with the audio: ${summary}.`);
  }
  if (ratio >= DURATION_WARN_MIN && ratio <= DURATION_WARN_MAX) {
    return check(
      "duration_consistency",
      "warn",
      0.5,
      `Length is loosely consistent but off-target: ${summary}. Plausible for unusually slow or fast delivery, worth a spot-check.`,
    );
  }
  return check(
    "duration_consistency",
    "fail",
    0,
    ratio < DURATION_WARN_MIN
      ? `Transcript is far too short for this audio: ${summary}. This usually means a partial paste or the wrong file.`
      : `Transcript is far too long for this audio: ${summary}. This usually means it belongs to a different, longer episode.`,
  );
}

/** Does the transcript actually talk about what the episode says it's about? Guards against a correct-looking transcript of the wrong episode. */
function checkTitleAlignment(candidate: TranscriptCandidate, metadata: EpisodeMetadata): VerificationCheck | null {
  const titleTokens = significantTokens(metadata.title);
  // A title like "Episode 12" carries no checkable content words — not a
  // defect in the transcript, so this check simply doesn't apply.
  if (titleTokens.length < 2) return null;

  const haystack = candidate.text.toLowerCase();
  const hits = titleTokens.filter((token) => haystack.includes(token));
  const coverage = hits.length / titleTokens.length;
  const summary = `${hits.length}/${titleTokens.length} significant title words appear in the transcript`;

  if (coverage >= 0.4) return check("title_alignment", "pass", 1, `Transcript matches the episode title: ${summary}.`);
  if (coverage >= 0.15) return check("title_alignment", "warn", 0.5, `Weak title match: ${summary}. Acceptable for a metaphorical title, suspicious otherwise.`);
  return check("title_alignment", "fail", 0, `Transcript does not appear to be about this episode: ${summary} (missing: ${titleTokens.filter((t) => !hits.includes(t)).slice(0, 5).join(", ")}).`);
}

/** A real episode opens. A transcript starting mid-sentence is truncated at the head. */
function checkIntro(candidate: TranscriptCandidate): VerificationCheck {
  const head = words(candidate.text).slice(0, EDGE_WINDOW_WORDS).join(" ").toLowerCase();
  const hasMarker = INTRO_MARKERS.some((marker) => head.includes(marker));
  const firstChar = candidate.text.trim().charAt(0);
  const startsMidSentence = firstChar !== "" && firstChar === firstChar.toLowerCase() && /[a-z]/.test(firstChar);

  if (startsMidSentence) {
    return check("intro_present", "fail", 0, "Transcript starts mid-sentence (lowercase first word) — the beginning is missing.");
  }
  if (hasMarker) return check("intro_present", "pass", 1, "Recognisable episode opening found in the first 120 words.");
  return check("intro_present", "warn", 0.5, "No conventional opening (greeting/intro phrase) in the first 120 words. Normal for edited or narrative shows.");
}

/** Mirror of checkIntro at the tail — catches the far more common truncation direction. */
function checkOutro(candidate: TranscriptCandidate): VerificationCheck {
  const allWords = words(candidate.text);
  const tail = allWords.slice(-EDGE_WINDOW_WORDS).join(" ").toLowerCase();
  const hasMarker = OUTRO_MARKERS.some((marker) => tail.includes(marker));
  const trimmed = candidate.text.trim();
  const endsCleanly = /[.!?"')\]]$/.test(trimmed);

  if (!endsCleanly) {
    return check("outro_present", "fail", 0, "Transcript ends without terminal punctuation — it is cut off mid-sentence.");
  }
  if (hasMarker) return check("outro_present", "pass", 1, "Recognisable episode closing found in the last 120 words.");
  return check("outro_present", "warn", 0.5, "No conventional sign-off in the last 120 words. Normal for edited or narrative shows.");
}

/** Speaker labels are the part of a transcript most often mangled by format conversion — and a mangled label set breaks the Learning Session's transcript rendering. */
function checkSpeakerConsistency(candidate: TranscriptCandidate): VerificationCheck {
  const segments = candidate.segments;
  if (segments.length === 0) {
    return check("speaker_consistency", "fail", 0, "Transcript has no segments at all.");
  }

  const missing = segments.filter((segment) => !segment.speaker || !segment.speaker.trim()).length;
  if (missing > 0) {
    return check("speaker_consistency", "fail", 0, `${missing} of ${segments.length} segments have no speaker label.`);
  }

  const labels = segments.map((segment) => segment.speaker.trim());
  const distinct = new Set(labels);
  if (distinct.size > MAX_PLAUSIBLE_SPEAKERS) {
    return check(
      "speaker_consistency",
      "fail",
      0,
      `${distinct.size} distinct speaker labels — implausible for one episode, and a strong sign the labels are a parsing artifact rather than real speakers.`,
    );
  }

  // Same speaker written three different ways ("Host"/"HOST"/"host") is a
  // formatting defect that renders as three different people.
  const caseFolded = new Set(labels.map((label) => label.toLowerCase()));
  if (caseFolded.size < distinct.size) {
    return check("speaker_consistency", "warn", 0.5, `Speaker labels are inconsistently cased (${distinct.size} raw vs ${caseFolded.size} case-folded) — they will render as separate speakers.`);
  }

  // A label used exactly once across a long transcript is usually a stray
  // line that got parsed as a speaker rather than a genuine one-line guest.
  if (segments.length >= 20) {
    const counts = new Map<string, number>();
    for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
    const orphans = [...counts.entries()].filter(([, count]) => count === 1).map(([label]) => label);
    if (orphans.length > 0) {
      return check("speaker_consistency", "warn", 0.6, `Speaker label(s) used only once across ${segments.length} segments: ${orphans.slice(0, 3).join(", ")}. Often a stray line misparsed as a speaker.`);
    }
  }

  return check("speaker_consistency", "pass", 1, `${distinct.size} consistent speaker label(s) across ${segments.length} segments.`);
}

/**
 * The "sample paragraph comparison": the episode description is the only
 * prose about this episode that did NOT come from the transcript, so
 * content-word overlap between the two is a genuine independent signal
 * that they describe the same episode. Skipped entirely when no
 * description was supplied.
 */
function checkDescriptionOverlap(candidate: TranscriptCandidate, metadata: EpisodeMetadata): VerificationCheck | null {
  const descriptionTokens = significantTokens(metadata.description ?? "");
  if (descriptionTokens.length < 5) return null;

  const haystack = candidate.text.toLowerCase();
  const hits = descriptionTokens.filter((token) => haystack.includes(token));
  const overlap = hits.length / descriptionTokens.length;
  const summary = `${hits.length}/${descriptionTokens.length} content words from the episode description appear in the transcript`;

  if (overlap >= 0.35) return check("description_overlap", "pass", 1, `Transcript content matches the show notes: ${summary}.`);
  if (overlap >= 0.15) return check("description_overlap", "warn", 0.5, `Partial match with the show notes: ${summary}.`);
  return check("description_overlap", "fail", 0, `Transcript content does not match the show notes: ${summary}.`);
}

/**
 * Runs every applicable check and produces an accept/reject verdict.
 *
 * Two hard gates short-circuit the weighted score entirely: a duration
 * mismatch and a broken speaker set are each, on their own, proof the
 * transcript is not usable — no combination of other passing checks
 * should be able to average them away.
 *
 * Checks that could not run (no stated duration, no description, a title
 * with no content words) are excluded from the average rather than scored
 * zero — missing metadata is not evidence of a bad transcript.
 */
export function verifyTranscript(candidate: TranscriptCandidate, metadata: EpisodeMetadata): VerificationResult {
  const checks = [
    checkDuration(candidate, metadata),
    checkTitleAlignment(candidate, metadata),
    checkIntro(candidate),
    checkOutro(candidate),
    checkSpeakerConsistency(candidate),
    checkDescriptionOverlap(candidate, metadata),
  ].filter((result): result is VerificationCheck => result !== null);

  const totalWeight = checks.reduce((sum, item) => sum + WEIGHTS[item.id], 0);
  const weighted = checks.reduce((sum, item) => sum + item.score * WEIGHTS[item.id], 0);
  const confidence = totalWeight > 0 ? weighted / totalWeight : 0;

  const hardGateFailures = checks.filter(
    (item) => item.status === "fail" && (item.id === "duration_consistency" || item.id === "speaker_consistency"),
  );
  const otherFailures = checks.filter((item) => item.status === "fail" && !hardGateFailures.includes(item));

  const rejectionReasons: string[] = [];
  if (hardGateFailures.length > 0) {
    rejectionReasons.push(...hardGateFailures.map((item) => item.detail));
  } else if (confidence < CONFIDENCE_THRESHOLD) {
    rejectionReasons.push(
      `Overall confidence ${(confidence * 100).toFixed(0)}% is below the ${(CONFIDENCE_THRESHOLD * 100).toFixed(0)}% threshold.`,
      ...otherFailures.map((item) => item.detail),
    );
  }

  return {
    confidence,
    verdict: rejectionReasons.length > 0 ? "reject" : "accept",
    checks,
    rejectionReasons,
  };
}
