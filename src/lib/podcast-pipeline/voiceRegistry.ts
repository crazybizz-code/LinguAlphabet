/**
 * Voice Quality Registry — the authoritative decision log for every Fish
 * Audio voice LinguABC has ever evaluated, independent of whether it is
 * currently wired into config.ts's synthesis-eligible VOICES map.
 *
 * WHY THIS EXISTS. "Marcus" (calm storyteller male,
 * e686ae649ee44f219a108aacba206c1a) was technically valid by every
 * catalog-level check this project had used before Episode #003: real,
 * English, correctly synthesized, clean tags, no red flags like the
 * earlier "Verity" mistake. It still sounded strongly AI/synthetic on
 * manual listening and was rejected. That is the concrete lesson this
 * registry encodes structurally: catalog validity is a FLOOR, not a
 * naturalness signal, and status here can only become "approved" after a
 * human has actually listened to real generated speech from that voice —
 * never from tags/task_count/like_count alone, and never automatically.
 *
 * STATUS LIFECYCLE:
 *   candidate  -> sourced from the catalog, short-tested (see
 *                 podcast-test/voice-candidates/), awaiting a human's
 *                 listening judgment. NEVER used by voiceRotation.ts.
 *   approved   -> a human confirmed it sounds natural/conversational,
 *                 either via a full published episode's manual review
 *                 (Maya/Alex/Sarah/Hannah/Leo) or via a short-test manual
 *                 review with the standardized voice test. Passing every
 *                 mechanical check (ASR accuracy, intelligibility, pacing,
 *                 tag leakage, catalog tags, API success) is NEVER
 *                 sufficient on its own -- "Ben" passed all of those plus
 *                 a Leo pair test and was still moved back to "candidate"
 *                 because no human had actually confirmed it reaches
 *                 Leo's naturalness. Only add to config.ts's VOICES /
 *                 voiceRotation.ts after that confirmation exists.
 *   rejected   -> a human listened and rejected it. Permanently excluded;
 *                 kept here (not deleted) so the same voice is never
 *                 re-discovered and re-tried without that history being
 *                 visible.
 *
 * This file is intentionally separate from config.ts: config.ts is "what
 * CAN be synthesized with right now" (typed, used by fishAudio.ts's
 * <|speaker:N|> mapping); this file is "the full history of why."
 */

export type VoiceQualityStatus = "candidate" | "approved" | "rejected";

export interface VoiceRegistryEntry {
  /** The character/speaker name used in scripts, when approved (matches config.ts's VOICES keys). Undefined for a candidate not yet promoted. */
  characterName?: string;
  /** The Fish Audio catalog's own title for this voice. */
  catalogName: string;
  creator: string;
  referenceId: string;
  gender: "male" | "female";
  language: string;
  catalogTags: string[];
  status: VoiceQualityStatus;
  notes: string;
  testedDate: string | null;
  /** Path to the short isolated test clip generated for evaluation, or the full episode that first exercised this voice for the pre-registry approvals. Null if never synthesized. */
  testAudioPath: string | null;
}

export const VOICE_REGISTRY: VoiceRegistryEntry[] = [
  // ===================== APPROVED (pre-registry episodes) =====================
  {
    characterName: "Maya",
    catalogName: "Female",
    creator: "Billionaires Advice",
    referenceId: "edd5f930301c4cf38ae60fd9d1cd7903",
    gender: "female",
    language: "en",
    catalogTags: [],
    status: "approved",
    notes: "Approved via Episode #001's full published episode and its own manual listening review (pre-dates this registry).",
    testedDate: "2026-08-05",
    testAudioPath: "podcast-test/episode-001-final-v2/podcast.mp3",
  },
  {
    characterName: "Alex",
    catalogName: "VODDIE BAUCHAM",
    creator: "anaya khan",
    referenceId: "8d5303fdffb948bca5c4544a378d12d8",
    gender: "male",
    language: "en",
    catalogTags: [],
    status: "approved",
    notes: "Approved via Episode #001's full published episode and its own manual listening review (pre-dates this registry).",
    testedDate: "2026-08-05",
    testAudioPath: "podcast-test/episode-001-final-v2/podcast.mp3",
  },
  {
    characterName: "Sarah",
    catalogName: "Sarah",
    creator: "Fish Audio official voice library (author id d8b0991f96b44e489422ca2ddf0bd31d; no public creator nickname listed)",
    referenceId: "933563129e564b19a115bedd57b7406a",
    gender: "female",
    language: "en",
    catalogTags: ["female", "young", "conversational", "narration", "soft", "breathy", "intimate", "gentle", "Sincere"],
    status: "approved",
    notes: "Approved via Episode #002 v2's full published episode and its own manual listening review -- the current female+female gold standard.",
    testedDate: "2026-08-09",
    testAudioPath: "podcast-test/episode-002-v2/podcast.mp3",
  },
  {
    characterName: "Hannah",
    catalogName: "Hannah",
    creator: "Fish Audio official voice library (author id d8b0991f96b44e489422ca2ddf0bd31d; no public creator nickname listed)",
    referenceId: "9a9cf47702da476aa4629e2506d4a857",
    gender: "female",
    language: "en",
    catalogTags: ["female", "middle-aged", "advertisement", "educational", "professional", "confident", "clear", "friendly", "Fitness"],
    status: "approved",
    notes: "Approved via Episode #002 v2's full published episode and its own manual listening review -- the current female+female gold standard.",
    testedDate: "2026-08-09",
    testAudioPath: "podcast-test/episode-002-v2/podcast.mp3",
  },
  {
    characterName: "Leo",
    catalogName: "Youthful Male Narrator",
    creator: "facafa5801",
    referenceId: "7e5102e4f5ff4339bc8ad0692279436c",
    gender: "male",
    language: "en",
    catalogTags: ["male", "young", "narration", "educational", "conversational", "medium", "clear", "calm", "measured", "professional", "confident", "friendly", "narrative", "storytelling", "expressive"],
    status: "approved",
    notes: "Approved via Episode #003's manual listening review: sounds highly natural and human-like. The male-side reference other male candidates are compared against -- see podcast-test/voice-candidates/leo-control.mp3 for the standardized-test control recording.",
    testedDate: "2026-08-10",
    testAudioPath: "podcast-test/episode-003 (published as podcast-bad5a8dc4ab0c35f)",
  },
  {
    characterName: "Ben",
    catalogName: "young male calm friendly voice",
    creator: "Chittath Nithinraj Dharmarajan",
    referenceId: "01d0c5da29324ac1be005166b4b39eb7",
    gender: "male",
    language: "en",
    catalogTags: ["male", "middle-aged", "professional", "calm", "friendly", "soft", "educational", "social-media", "conversational", "energetic", "clear", "Instructional"],
    status: "approved",
    notes: "Approved as an INDIVIDUAL voice via a genuine human listening review of the standardized candidate batch (podcast-test/voice-candidates/male/young-male-calm-friendly-ben.mp3, compared directly against podcast-test/voice-candidates/leo-control.mp3): confirmed natural/human-like. This corrects an earlier premature approval of the same voice that was based only on mechanical checks + a pair test, without an actual listen -- that one was reverted; this is the real approval. The Ben+Leo PAIR was then separately confirmed via manual listening of podcast-test/voice-candidates/ben-leo-final-pair.mp3 -- voiceRotation.ts's male_male is now live (['Ben','Leo']). Ben's mixed-gender pairings (Sarah+Ben, Ben+Hannah) are a SEPARATE, still-unapproved question -- see the mixed/ pair tests underway.",
    testedDate: "2026-08-10",
    testAudioPath: "podcast-test/voice-candidates/male/young-male-calm-friendly-ben.mp3",
  },
  // ===================== REJECTED =====================
  {
    characterName: undefined,
    catalogName: "calm storyteller male",
    creator: "Blazing",
    referenceId: "e686ae649ee44f219a108aacba206c1a",
    gender: "male",
    language: "en",
    catalogTags: ["male", "middle-aged", "narration", "educational", "deep", "calm", "professional", "measured", "documentary"],
    status: "rejected",
    notes: "Strongly AI/synthetic sounding during manual listening of Episode #003. Was catalog-valid (real, English, clean tags, no red flags) but failed the naturalness bar -- catalog validity is not a naturalness signal. Permanently excluded; removed from config.ts's VOICES so it cannot be selected by the pipeline again.",
    testedDate: "2026-08-10",
    testAudioPath: "podcast-test/episode-003 (published as podcast-bad5a8dc4ab0c35f)",
  },
  // ===================== CANDIDATES (awaiting human listening review) =====================
  // Standardized batch -- ALL 10 tested with the identical ~20-25s text
  // (podcast-test/voice-candidates/male/male-voice-test.py), alongside a
  // Leo control recording using the SAME text
  // (podcast-test/voice-candidates/leo-control.mp3) for direct comparison.
  // See podcast-test/voice-candidates/male/results.json for the full
  // machine-readable record (includes Leo's own control-run numbers).
  //
  // Every one of these passed essentially the same mechanical bar (96.9-
  // 98.5% ASR coverage, zero tag/markdown leakage, 2.56-3.05 words/sec,
  // all close to Leo's own control numbers) -- which is exactly the
  // point: these checks cannot discriminate naturalness, so none of that
  // similarity is evidence any of them is production-ready. NONE may be
  // added to config.ts's VOICES or voiceRotation.ts until a human
  // listens and selects one, followed by its own Leo pair test.
  {
    characterName: undefined,
    catalogName: "Casual Conversational Male",
    creator: "Toller Peterson",
    referenceId: "d1f22efc5dab44e7a90ebbd3b0780439",
    gender: "male",
    language: "en",
    catalogTags: ["male", "middle-aged", "conversational", "social-media", "entertainment", "medium", "energetic", "friendly", "clear", "expressive", "relaxed", "neutral-tone", "storytelling", "smooth"],
    status: "candidate",
    notes: "Standardized test: 22.20s, 96.9% ASR coverage, 2.93 words/sec, no leakage. No narration/documentary/educational/professional tags at all -- purely conversational/relaxed/expressive. Awaiting human listening review.",
    testedDate: "2026-08-10",
    testAudioPath: "podcast-test/voice-candidates/male/casual-conversational-male.mp3",
  },
  {
    characterName: undefined,
    catalogName: "Friendly Male Voice",
    creator: "Lala Bunny",
    referenceId: "2adcdee4b3ce4b648dc16ea65430ea76",
    gender: "male",
    language: "en",
    catalogTags: ["male", "middle-aged", "conversational", "social-media", "entertainment", "medium", "warm", "friendly", "relaxed", "smooth", "clear", "expressive", "cheerful", "calm"],
    status: "candidate",
    notes: "Standardized test: 24.63s, 96.9% ASR coverage, 2.64 words/sec, no leakage. Warmest/most cheerful tag profile. Awaiting human listening review.",
    testedDate: "2026-08-10",
    testAudioPath: "podcast-test/voice-candidates/male/friendly-male-warm-cheerful.mp3",
  },
  {
    characterName: undefined,
    catalogName: "Warm Male Voice",
    creator: "Sharon Williams",
    referenceId: "eb7b35cda00a4b8a97088a16b05badc5",
    gender: "male",
    language: "en",
    catalogTags: ["male", "young", "conversational", "social-media", "entertainment", "warm", "smooth", "friendly", "calm", "measured", "clear", "confident", "relaxed"],
    status: "candidate",
    notes: "Standardized test: 22.52s, 98.5% ASR coverage (highest of the batch), 2.89 words/sec, no leakage. Young, warm, confident register. Awaiting human listening review.",
    testedDate: "2026-08-10",
    testAudioPath: "podcast-test/voice-candidates/male/warm-male-young.mp3",
  },
  {
    characterName: undefined,
    catalogName: "Authentic Male Voice",
    creator: "Kboy William",
    referenceId: "8e44c20194b143708772ad30f9b2bdd9",
    gender: "male",
    language: "en",
    catalogTags: ["male", "young", "conversational", "social-media", "entertainment", "medium", "warm", "smooth", "clear", "calm", "relaxed", "friendly", "neutral-tone", "storytelling"],
    status: "candidate",
    notes: "Standardized test: 22.20s, 96.9% ASR coverage, 2.93 words/sec, no leakage. Clean conversational/warm/relaxed profile, no narration/documentary baggage. Awaiting human listening review.",
    testedDate: "2026-08-10",
    testAudioPath: "podcast-test/voice-candidates/male/authentic-male-young.mp3",
  },
  {
    characterName: undefined,
    catalogName: "Everyday Confident Male V3",
    creator: "Rocco Holcomb",
    referenceId: "b080cf7aa7b24f06b1255bdf9b301bc7",
    gender: "male",
    language: "en",
    catalogTags: ["male", "middle-aged", "conversational", "social-media", "entertainment", "medium", "clear", "crisp", "expressive", "dynamic", "energetic", "confident", "friendly", "storytelling", "narrative", "professional"],
    status: "candidate",
    notes: "Standardized test: 22.31s, 96.9% ASR coverage, 2.96 words/sec, no leakage. More energetic/dynamic register than the others; carries a 'professional' tag worth listening for. Awaiting human listening review.",
    testedDate: "2026-08-10",
    testAudioPath: "podcast-test/voice-candidates/male/everyday-confident-male-v3.mp3",
  },
  {
    characterName: undefined,
    catalogName: "Young Casual Male",
    creator: "carticarti281",
    referenceId: "fa6b3bedc7364348bfab20507ab7d380",
    gender: "male",
    language: "en",
    catalogTags: ["male", "young", "conversational", "social-media", "entertainment", "friendly", "energetic", "expressive", "clear", "neutral-tone", "animated", "medium", "smooth"],
    status: "candidate",
    notes: "Standardized test: 22.00s, 96.9% ASR coverage, 2.96 words/sec, no leakage. Highest catalog usage of the whole batch (1672 tasks). Awaiting human listening review.",
    testedDate: "2026-08-10",
    testAudioPath: "podcast-test/voice-candidates/male/young-casual-male-high-usage.mp3",
  },
  {
    characterName: undefined,
    catalogName: "Chill Young Male",
    creator: "Daniela Flores",
    referenceId: "ed5f7ba1729a40d3b5599d7ef00a2a96",
    gender: "male",
    language: "en",
    catalogTags: ["male", "young", "conversational", "social-media", "entertainment", "medium", "smooth", "calm", "relaxed", "friendly", "clear", "neutral-tone", "expressive"],
    status: "candidate",
    notes: "Standardized test: 23.04s, 96.9% ASR coverage, 2.86 words/sec, no leakage. Calm/relaxed young register. Awaiting human listening review.",
    testedDate: "2026-08-10",
    testAudioPath: "podcast-test/voice-candidates/male/chill-young-male.mp3",
  },
  {
    characterName: undefined,
    catalogName: "Casual Young Male",
    creator: "uxnownnzz",
    referenceId: "40f171957e4a4007be49735e40ad136a",
    gender: "male",
    language: "en",
    catalogTags: ["male", "young", "conversational", "social-media", "entertainment", "low", "relaxed", "calm", "neutral-tone", "clear", "friendly", "smooth", "medium", "expressive"],
    status: "candidate",
    notes: "Standardized test: 22.62s, 96.9% ASR coverage, 2.87 words/sec, no leakage. Lower-pitched young/relaxed register -- the most vocally distinct from Leo of the batch on paper. Awaiting human listening review.",
    testedDate: "2026-08-10",
    testAudioPath: "podcast-test/voice-candidates/male/young-casual-male-low-relaxed.mp3",
  },
  {
    characterName: undefined,
    catalogName: "Warm Male Voice",
    creator: "STEVE BURTON",
    referenceId: "5913d2f7ff934acbbcfc5bd3f64f9c3c",
    gender: "male",
    language: "en",
    catalogTags: ["male", "middle-aged", "conversational", "social-media", "entertainment", "warm", "soft", "smooth", "calm", "relaxed", "friendly", "gentle", "empathetic", "intimate", "expressive"],
    status: "candidate",
    notes: "Standardized test: 21.32s, 96.9% ASR coverage, 3.05 words/sec, no leakage. Gentlest/most intimate tag profile of the batch. Awaiting human listening review.",
    testedDate: "2026-08-10",
    testAudioPath: "podcast-test/voice-candidates/male/warm-male-middleaged-gentle.mp3",
  },
];

export function approvedVoices(gender?: "male" | "female"): VoiceRegistryEntry[] {
  return VOICE_REGISTRY.filter((v) => v.status === "approved" && (gender === undefined || v.gender === gender));
}

export function findByReferenceId(referenceId: string): VoiceRegistryEntry | undefined {
  return VOICE_REGISTRY.find((v) => v.referenceId === referenceId);
}
