/**
 * LinguABC Podcast Pipeline — shared configuration.
 *
 * VOICES here is the SYNTHESIS-ELIGIBLE set only — every entry is a voice
 * currently cleared for production use. It is NOT the full decision
 * record: candidates under evaluation and voices that were rejected after
 * testing (e.g. "Marcus", removed after Episode #003's manual listening
 * review) live in voiceRegistry.ts instead, which is the authoritative
 * approve/reject/candidate audit trail. A voice is added here only after
 * voiceRegistry.ts marks it "approved" — never automatically, never for a
 * "candidate"-status voice.
 */

export const PODCAST_MODEL = "s2.1-pro-free";
export const FISH_TTS_URL = "https://api.fish.audio/v1/tts";

export const VOICES = {
  Maya: {
    name: "Female",
    creator: "Billionaires Advice",
    referenceId: "edd5f930301c4cf38ae60fd9d1cd7903",
    speakerIndex: 0,
  },
  Alex: {
    name: "VODDIE BAUCHAM",
    creator: "anaya khan",
    referenceId: "8d5303fdffb948bca5c4544a378d12d8",
    speakerIndex: 1,
  },
  /** Episode #002 v2's approved pair (female+female, deliberately distinct
   * from Maya/Alex — see podcast-test/episode-002-v2/metadata.json). Not
   * used by fishAudio.ts for this episode since its audio was already
   * synthesized and approved out-of-band (see pipeline.ts's
   * `precomputedAudio` path) — registered here so ScriptLine/SpeakerName
   * typing and buildReaderTranscript/alignSegments can represent this
   * episode's real speaker labels the same way Maya/Alex do. */
  Sarah: {
    name: "Sarah",
    creator: "Fish Audio official voice library (author id d8b0991f96b44e489422ca2ddf0bd31d; no public creator nickname listed)",
    referenceId: "933563129e564b19a115bedd57b7406a",
    speakerIndex: 0,
  },
  Hannah: {
    name: "Hannah",
    creator: "Fish Audio official voice library (author id d8b0991f96b44e489422ca2ddf0bd31d; no public creator nickname listed)",
    referenceId: "9a9cf47702da476aa4629e2506d4a857",
    speakerIndex: 1,
  },
  /** Confirmed natural-sounding on manual listening of Episode #003 (see
   * voiceRegistry.ts). Its original pairing, "Marcus", was rejected after
   * that same listening review for sounding synthetic. */
  Leo: {
    name: "Youthful Male Narrator",
    creator: "facafa5801",
    referenceId: "7e5102e4f5ff4339bc8ad0692279436c",
    speakerIndex: 1,
  },
  /** "young male calm friendly voice" -- approved as an individual voice
   * after a genuine human listening review of the standardized candidate
   * batch (see voiceRegistry.ts). NOTE: individual-voice approval is not
   * the same thing as pair approval -- voiceRotation.ts's male_male stays
   * `null` until a Ben+Leo pair test is ALSO manually approved; do not
   * infer pair-readiness from this entry existing. (An earlier version of
   * this comment described a prior premature approval of this same voice
   * based on mechanical checks alone -- that was reverted; this approval
   * is the real one, confirmed by an actual listen.) */
  Ben: {
    name: "young male calm friendly voice",
    creator: "Chittath Nithinraj Dharmarajan",
    referenceId: "01d0c5da29324ac1be005166b4b39eb7",
    speakerIndex: 0,
  },
} as const;

export type SpeakerName = keyof typeof VOICES;

export const STORAGE_BUCKET = "linguabc-podcast-audio";

export const BRAND = "LinguABC";
// Level policy (which of B2/C1/C2 an episode targets) lives in
// cefrLevel.ts -- this used to be a single hardcoded "B2" here, unused
// anywhere, which would now be actively wrong (production policy allows
// B2, C1, or C2, rotated per episode; B1 is never generated).

/** Same 5:15-5:45 window Episode #001 targeted and hit (5:42.6). */
export const TARGET_DURATION_SECONDS = 330;
export const MIN_DURATION_SECONDS = 300;
export const MAX_DURATION_SECONDS = 360;
