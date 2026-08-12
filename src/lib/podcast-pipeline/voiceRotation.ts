import { VOICES, type SpeakerName } from "./config";
import { findByReferenceId } from "./voiceRegistry";

/**
 * Voice rotation for the daily automation.
 *
 * DELIBERATELY STATELESS — no new table/column and no rotation-log file
 * to keep in sync. The rotation position is derived directly from the
 * real episode number (nextEpisodeNumber() already counts
 * podcast_details.attribution = 'LinguABC' rows, so this "considers
 * previously published episodes" without needing separate storage).
 *
 * ONLY THREE COMBINATIONS ARE CURRENTLY APPROVED FOR PRODUCTION:
 *   female_female -> Sarah + Hannah
 *   male_male      -> Ben + Leo
 *   male_female    -> Ben + Hannah
 * female_male (Maya + Alex, Episode #001's pair) is explicitly EXCLUDED
 * from the active rotation by instruction -- Maya/Alex's own approval
 * from Episode #001 stands and that episode is untouched, but the pair is
 * retired from future selection, not reused. "Do not invent another
 * pair" -- so there is no female_male entry here at all, not even a
 * `null` placeholder task-listing it as pending.
 *
 * A PAIR IS SELECTABLE ONLY IF BOTH VOICES ARE "approved" IN
 * voiceRegistry.ts. This is enforced twice, not once: config.ts's VOICES
 * only ever contains synthesis-eligible (i.e. non-rejected) voices, AND
 * chooseVoicesForEpisode() independently re-checks voiceRegistry.ts's
 * status for both names before returning a pair. A combination whose pair
 * is `null` (none currently approved) throws a clear error rather than
 * silently falling back to some other pair -- the caller (dailyGenerate.ts)
 * must treat that as a failed generation, never a reason to substitute an
 * unapproved voice.
 */

export type VoiceCombination = "female_female" | "male_male" | "male_female";

const ROTATION_SEQUENCE: readonly VoiceCombination[] = ["female_female", "male_male", "male_female"];

/** Each combination maps to one concrete, manually-approved pair (see
 * voiceRegistry.ts for the listening-review record each one went
 * through). A combination with no currently-approved pair is `null` --
 * do not fill it with a candidate or an unverified guess; wait for a
 * human approval and add the pair here explicitly. */
const PAIR_FOR_COMBINATION: Record<VoiceCombination, [SpeakerName, SpeakerName] | null> = {
  female_female: ["Sarah", "Hannah"],
  // Approved: Ben passed an individual listening review AND a Ben+Leo
  // pair test, both manually confirmed -- see voiceRegistry.ts.
  male_male: ["Ben", "Leo"],
  // Approved as Ben+Hannah specifically (Ben speaking first) -- the
  // reverse ordering (Sarah+Ben, i.e. female_male) was short-tested
  // alongside it but was NOT approved and must never be used; see
  // podcast-test/voice-candidates/mixed/results.json for both tests.
  male_female: ["Ben", "Hannah"],
};

export interface VoiceRotationResult {
  combination: VoiceCombination;
  speaker0: SpeakerName;
  speaker1: SpeakerName;
}

/** Shared by chooseVoicesForEpisode() and its override escape hatch --
 * looks up the approved pair for a given combination and re-verifies both
 * voices' registry status, never trusting a cached/assumed approval. */
function resolveCombination(combination: VoiceCombination): VoiceRotationResult {
  const pair = PAIR_FOR_COMBINATION[combination];
  if (!pair) {
    throw new Error(
      `No approved voice pair exists for combination "${combination}" -- see voiceRegistry.ts for candidates awaiting a human listening review. Refusing to substitute an unapproved voice.`,
    );
  }

  for (const name of pair) {
    const entry = findByReferenceId(VOICES[name].referenceId);
    if (!entry || entry.status !== "approved") {
      throw new Error(
        `Voice "${name}" is registered in config.ts's VOICES but is not marked "approved" in voiceRegistry.ts (status: ${entry?.status ?? "not found"}). Refusing to use it.`,
      );
    }
  }

  const [speaker0, speaker1] = pair;
  return { combination, speaker0, speaker1 };
}

export function chooseVoicesForEpisode(episodeNumber: number): VoiceRotationResult {
  const combination = ROTATION_SEQUENCE[(episodeNumber - 1) % ROTATION_SEQUENCE.length];
  return resolveCombination(combination);
}

/**
 * Escape hatch for a corrective replacement of an EXISTING published
 * episode, where the requirement is to keep that episode's original voice
 * pair rather than follow the forward-going rotation for whatever new
 * episode number the replacement happens to land on. Learned the hard way:
 * Episode #004's opening-structure fix was first regenerated at
 * episodeNumber 5, which naturally rotated to Ben+Leo instead of the
 * required Sarah+Hannah -- this function is what a caller should use
 * instead of chooseVoicesForEpisode() for that specific situation. Still
 * goes through the exact same registry approval check, never bypasses it.
 */
export function chooseVoicesForCombination(combination: VoiceCombination): VoiceRotationResult {
  return resolveCombination(combination);
}

/** Full voice metadata for generation logs/audio-metadata.json — never
 * guessed, always read from the same VOICES registry the pipeline itself
 * uses for <|speaker:N|> mapping. */
export function voiceMetadata(name: SpeakerName) {
  const voice = VOICES[name];
  return { characterName: name, catalogName: voice.name, creator: voice.creator, referenceId: voice.referenceId };
}
