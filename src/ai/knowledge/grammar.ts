import type { GrammarUnit } from "./types";

/**
 * Six reusable grammar units (Sprint 8) — teaching content Tuto draws on
 * instead of re-deriving an explanation from scratch every time the same
 * rule comes up in conversation. `exerciseIds` point at ./assets.ts;
 * `relatedGrammarUnitIds` point at other keys in this same record —
 * neither is a copy, both are looked up via ./registry.ts.
 */
export const GRAMMAR_UNITS: Record<string, GrammarUnit> = {
  "present-simple": {
    id: "present-simple",
    title: "Present Simple",
    cefrLevels: ["A1", "A2"],
    explanation:
      "Use the present simple for facts, routines, and habits — things that are generally true or happen regularly, not just right now. Form: base verb, adding -s for he/she/it. Time markers like 'always', 'usually', or 'every day' often signal it.",
    commonMistakes: [
      "Dropping the -s for he/she/it: 'She work' instead of 'She works'.",
      "Using present continuous for habits: 'I am going to the gym every day' instead of 'I go to the gym every day'.",
    ],
    examples: [
      { sentence: "She works at a hospital.", note: "A fact about her job." },
      { sentence: "I usually wake up at 7.", note: "A routine, marked by 'usually'." },
    ],
    exerciseIds: ["ex-present-simple-third-person"],
    followUpSuggestions: [
      "Ask the learner to describe their own daily routine using three present simple sentences.",
      "Introduce frequency adverbs (always/usually/often/sometimes/never) as a natural next step.",
    ],
    relatedGrammarUnitIds: ["present-continuous"],
  },

  "present-continuous": {
    id: "present-continuous",
    title: "Present Continuous",
    cefrLevels: ["A1", "A2", "B1"],
    explanation:
      "Use the present continuous (am/is/are + verb-ing) for something happening right now, or a temporary situation around the present — not a permanent fact. It's also common for fixed future plans: 'I'm meeting her tomorrow.'",
    commonMistakes: [
      "Forgetting the auxiliary: 'She working now' instead of 'She is working now'.",
      "-ing spelling slips: 'runing' instead of 'running'.",
      "Using it for permanent facts instead of temporary ones — context decides which one fits, so this pair needs real practice, not just a rule.",
    ],
    examples: [
      { sentence: "I'm reading a great book right now.", note: "Happening at this moment." },
      { sentence: "We're meeting Sarah on Friday.", note: "A fixed future plan." },
    ],
    exerciseIds: ["ex-continuous-vs-simple"],
    followUpSuggestions: [
      "Contrast this directly against Present Simple with the same verb — that's where the real confusion lives.",
      "Ask the learner what they're doing right now, in continuous form.",
    ],
    relatedGrammarUnitIds: ["present-simple", "present-perfect"],
  },

  "present-perfect": {
    id: "present-perfect",
    title: "Present Perfect",
    cefrLevels: ["B1", "B2"],
    explanation:
      "Use have/has + past participle for a past action connected to now — the exact time doesn't matter, only the result or experience matters today. Compare 'I lost my keys' (a past event) to 'I've lost my keys' (I still can't find them).",
    commonMistakes: [
      "Mixing it with a specific past time: 'I have seen him yesterday' — 'yesterday' forces past simple instead: 'I saw him yesterday'.",
      "Irregular past participles: 'I have wrote' instead of 'I have written'.",
    ],
    examples: [
      { sentence: "I've lived here for six years.", note: "Started in the past, still true now." },
      { sentence: "Have you ever tried sushi?", note: "Life experience, no specific time." },
    ],
    exerciseIds: ["ex-present-perfect-vs-simple"],
    followUpSuggestions: [
      "Ask about a life experience with 'Have you ever...?' — the most natural production practice for this tense.",
      "Flag that a specific past-time word almost always means past simple instead.",
    ],
    relatedGrammarUnitIds: ["present-continuous", "reported-speech"],
  },

  conditionals: {
    id: "conditionals",
    title: "Conditionals",
    cefrLevels: ["B1", "B2", "C1"],
    explanation:
      "Conditionals describe cause and effect at different degrees of reality. Zero (if + present, present) for general truths; First (if + present, will) for real future possibilities; Second (if + past, would) for hypothetical or unlikely present/future; Third (if + past perfect, would have) for an unreal past that can't be changed now.",
    commonMistakes: [
      "Using 'will' in the if-clause: 'If it will rain, I will stay home' instead of 'If it rains, I will stay home'.",
      "Mixing second and third conditional forms in the same sentence: 'If I would have known, I will tell you'.",
    ],
    examples: [
      { sentence: "If you heat ice, it melts.", note: "Zero — a general truth." },
      { sentence: "If I have time tomorrow, I'll call you.", note: "First — a real possibility." },
      { sentence: "If I won the lottery, I'd travel the world.", note: "Second — hypothetical." },
      { sentence: "If I'd studied harder, I would have passed.", note: "Third — unreal past." },
    ],
    exerciseIds: ["ex-conditionals-transform"],
    followUpSuggestions: [
      "Ask the learner for one real 'if' about their own week, in first conditional.",
      "Once first/second are solid, mixed conditionals make a good stretch goal for a C1 learner.",
    ],
    relatedGrammarUnitIds: ["passive-voice"],
  },

  "passive-voice": {
    id: "passive-voice",
    title: "Passive Voice",
    cefrLevels: ["B1", "B2"],
    explanation:
      "Use the passive (be + past participle) when the action matters more than who did it, or the doer is unknown, obvious, or unimportant. 'The bridge was built in 1920' — nobody needs to know exactly who built it.",
    commonMistakes: [
      "Overusing the passive where active sounds more natural in conversation: 'The ball was kicked by me' instead of just 'I kicked the ball'.",
      "Wrong participle form: 'The letter was wrote' instead of 'The letter was written'.",
    ],
    examples: [
      { sentence: "English is spoken in many countries.", note: "The doer (people in general) isn't the point." },
      { sentence: "The report was finished yesterday.", note: "Who finished it isn't the point." },
    ],
    exerciseIds: ["ex-passive-transform"],
    followUpSuggestions: [
      "Ask the learner to turn one of their own active sentences into passive, and discuss whether it actually sounds better.",
      "Point out that news headlines often lean on the passive — a useful thing to notice while reading.",
    ],
    relatedGrammarUnitIds: ["conditionals", "reported-speech"],
  },

  "reported-speech": {
    id: "reported-speech",
    title: "Reported Speech",
    cefrLevels: ["B2", "C1"],
    explanation:
      "When reporting what someone said, tenses usually shift one step back ('backshift'): present becomes past, past becomes past perfect, will becomes would. Pronouns and time expressions ('today' becomes 'that day') also change to fit the new speaker's perspective.",
    commonMistakes: [
      "Forgetting to backshift the tense: 'She said she works there' instead of 'She said she worked there'.",
      "Not adjusting time words: keeping 'tomorrow' instead of 'the next day'.",
    ],
    examples: [
      { sentence: '"I\'m tired," she said. → She said she was tired.', note: "Present becomes past." },
      {
        sentence: '"I\'ll call you tomorrow," he said. → He said he would call me the next day.',
        note: "will → would, tomorrow → the next day.",
      },
    ],
    exerciseIds: ["ex-reported-speech-transform"],
    followUpSuggestions: [
      "Give the learner a direct-speech sentence and ask them to report it themselves.",
      "Once backshifting is solid, mention that reported questions also flip word order back to statement order.",
    ],
    relatedGrammarUnitIds: ["present-perfect", "passive-voice"],
  },
};
