/** Reviewer-only evidence and distractor analysis for Listening Section 2. */
export interface ListeningSection2QaRecord {
  q: number;
  subSkill: string;
  evidence: string;
  rationale: string;
  distractor: string;
  /** Verbatim transcript fragments which make the distractor tempting and then wrong. */
  distractorEvidence: string[];
  ambiguityCheck: string;
  manualReview?: string;
}

export const LS2_QA_RECORDS: ListeningSection2QaRecord[] = [
  {
    q: 11,
    subSkill: "identifying an improvement after contrasting old and new arrangements",
    evidence: "we've turned the old repair workshop by the east gate into a locked room where bikes can be left under cover",
    rationale: "A former workshop is now a secure, indoor place for bicycles, which maps to option B without repeating its wording.",
    distractor: "A is plausible because extra parking was discussed, but the plan was shelved. The old outdoor cycle rail remains only as overflow and does not invalidate the new indoor facility.",
    distractorEvidence: ["The council did discuss adding another row of parking spaces, but the ground was too wet and that plan has been shelved."],
    ambiguityCheck: "Only B describes a completed bicycle-related improvement.",
  },
  {
    q: 12,
    subSkill: "distinguishing a completed digital change from postponed or unchanged services",
    evidence: "The change people seem happiest about is the new booking page on our website.",
    rationale: "The new page allows immediate online reservations, matching option D.",
    distractor: "C is explicitly unchanged, while E is postponed until spring. Both are presented as requested improvements before being ruled out.",
    distractorEvidence: ["Its hours are unchanged this weekend", "the contractor can't start that job until spring"],
    ambiguityCheck: "The speaker labels the booking page as a change and describes it as already usable.",
  },
  {
    q: 13,
    subSkill: "identifying an advance-booking requirement among drop-in activities",
    evidence: "you do need to reserve the pottery class by six o'clock on Friday evening",
    rationale: "The deadline is before the weekend begins, so the pottery workshop is option C.",
    distractor: "The bread demonstration and garden walk sound capacity-limited but are explicitly available through same-day entry or tickets.",
    distractorEvidence: ["you can simply join the next one with space", "collect a free ticket from the guide when you arrive"],
    ambiguityCheck: "The words 'do need to reserve' and the Friday deadline make the requirement categorical.",
  },
  {
    q: 14,
    subSkill: "tracking a second exception signposted later in a programme description",
    evidence: "we also need children's names in advance for the drama session",
    rationale: "The second explicit advance requirement is the children's drama session, option E.",
    distractor: "The railway talk is described as if it might be restricted, then clearly made drop-in because the library is large enough.",
    distractorEvidence: ["the library holds nearly eighty people, so just turn up"],
    ambiguityCheck: "Parents may attend without booking, but the question asks which activity must be booked; participating children must be registered.",
  },
  {
    q: 15,
    subSkill: "following a redirected first step",
    evidence: "Start at the reception desk, immediately inside the main doors. The team there will check your name and give you a coloured wristband.",
    rationale: "The wristband is the pass required for a reserved session, so visitors collect it at A.",
    distractor: "The pottery and drama rooms are the eventual destinations, but the speaker explicitly says not to go directly to them.",
    distractorEvidence: ["don't head directly to the pottery or drama rooms"],
    ambiguityCheck: "The confirmation email is rejected as sufficient evidence; the reception-issued wristband is required.",
  },
  {
    q: 16,
    subSkill: "following a temporary relocation",
    evidence: "we've made a supervised cloakroom in the far corner of the sports hall",
    rationale: "Coats, umbrellas and bags belong in the temporary cloakroom located at H.",
    distractor: "The former cloakroom beside reception is named first but is closed for repairs.",
    distractorEvidence: ["don't use the old cloakroom beside reception; that's closed while the heating is repaired"],
    ambiguityCheck: "The sports hall is the only currently operating storage location.",
  },
  {
    q: 17,
    subSkill: "separating similar services by product type",
    evidence: "tea, coffee and hot chocolate will come from the serving hatch in the community kitchen",
    rationale: "All warm drinks are supplied from D.",
    distractor: "The café counter sells food and cold drinks, making it the obvious but incorrect location for this specific request.",
    distractorEvidence: ["the café counter in the entrance passage has sandwiches, fruit and cold drinks"],
    ambiguityCheck: "The contrast word 'However' establishes a clean hot-versus-cold division.",
  },
  {
    q: 18,
    subSkill: "distinguishing passive information from personal advice",
    evidence: "The volunteer team will be based in the upstairs meeting room",
    rationale: "Visitors who want to discuss regular helping roles need the team in I.",
    distractor: "Reception holds volunteer leaflets, but its staff are explicitly unavailable for discussions about roles.",
    distractorEvidence: ["there are leaflets on the reception desk, but don't try to discuss roles with the staff working there"],
    ambiguityCheck: "The question asks to discuss becoming a helper, not merely collect printed information.",
  },
  {
    q: 19,
    subSkill: "rejecting a sign or sample as the destination",
    evidence: "The complete display is in the library",
    rationale: "The full collection of neighbourhood photographs is at E.",
    distractor: "A single photograph near Studio One is only a directional sign, not the exhibition.",
    distractorEvidence: ["One photograph is on the noticeboard near Studio One", "That's only a sign pointing you onwards."],
    ambiguityCheck: "'Complete display' removes any defensible claim that Studio One is also an answer.",
  },
  {
    q: 20,
    subSkill: "choosing a planned venue over a conditional backup",
    evidence: "the community choir will lead a sing-along in the courtyard",
    rationale: "The participatory closing music event is planned for F.",
    distractor: "The sports hall is named as a wet-weather alternative, but the forecast is dry and the courtyard is confirmed as the planned location.",
    distractorEvidence: ["If it rains heavily we'll move into the sports hall", "the courtyard is the planned location"],
    ambiguityCheck: "The conditional move applies only in heavy rain; the stated plan remains the courtyard.",
    manualReview: "During audio production, keep the conditional sports-hall clause clearly subordinate to the confirmed courtyard location.",
  },
];
