import { bbcTranscripts } from './generated/bbcTranscripts.js';
import { newBbcOfficialTranscripts, newBbcPodcasts } from './generated/newBbcLessons.js';

// ============================================================
// data.js — Curated Premium BBC English Learning Lessons
// ============================================================

function protectInlineText(text) {
  return text
    .replaceAll('bbclearningenglish.com', 'bbclearningenglish[dot]com')
    .replaceAll('learningenglish@bbc.co.uk', 'learningenglish[at]bbc[dot]co[dot]uk');
}

function restoreInlineText(text) {
  return text
    .replaceAll('bbclearningenglish[dot]com', 'bbclearningenglish.com')
    .replaceAll('learningenglish[at]bbc[dot]co[dot]uk', 'learningenglish@bbc.co.uk');
}

function splitLongOfficialText(text) {
  if (text.length <= 110) return [text];

  const clauseParts = text
    .split(/(?<=[,;:–—])\s+/)
    .map(part => part.trim())
    .filter(Boolean);

  if (clauseParts.length > 1 && clauseParts.every(part => part.length <= 130)) {
    return clauseParts;
  }

  const words = text.split(/\s+/);
  const chunks = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > 95 && current) {
      chunks.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function splitOfficialTurn(turn) {
  const protectedText = protectInlineText(turn.text);
  const parts = protectedText
    .match(/[^.!?]+(?:[.!?]+["'”’]?|$)/g)
    ?.map(part => restoreInlineText(part.trim()))
    .filter(Boolean);

  return (parts?.length ? parts : [turn.text])
    .flatMap(splitLongOfficialText)
    .map(text => ({
      speaker: turn.speaker,
      text
    }));
}

function countMatches(text, pattern) {
  return (text.match(pattern) || []).length;
}

function getTimingWeight(segment, previousSegment) {
  const words = segment.text.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu)?.length || 1;
  const sentences = Math.max(1, countMatches(segment.text, /[.!?]+/g));
  const commas = countMatches(segment.text, /[,;:]/g);
  const ellipses = countMatches(segment.text, /\.{2,}|…/g);
  const dashes = countMatches(segment.text, /[–—-]/g);
  const hasQuestion = /[?]/.test(segment.text);
  const speakerChanged = previousSegment && previousSegment.speaker !== segment.speaker;
  const isClipSpeaker = !['Neil', 'Becca', 'Pippa', 'Phil', 'Georgie', 'Hanan'].includes(segment.speaker);

  return (
    words +
    sentences * 2.4 +
    commas * 0.9 +
    ellipses * 2.2 +
    dashes * 1.1 +
    (hasQuestion ? 1.4 : 0) +
    (speakerChanged ? 1.8 : 0) +
    (isClipSpeaker ? words * 0.08 : 0) +
    (words <= 3 ? 1.5 : 0)
  );
}

function buildOfficialTranscript(transcriptId, podcastId, duration, turns, options = {}) {
  const leadInMs = options.leadInMs || 0;
  const tailMs = options.tailMs || 0;
  const segments = turns.flatMap(splitOfficialTurn);
  const weights = segments.map((segment, index) => getTimingWeight(segment, segments[index - 1]));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || segments.length || 1;
  const activeDuration = Math.max(segments.length, duration - leadInMs - tailMs);
  let elapsedWeight = 0;

  return {
    transcriptId,
    podcastId,
    language: "English",
    duration,
    source: "BBC Learning English official transcript",
    timing: "weighted-estimate-from-official-transcript-and-audio",
    content: segments.map((segment, index) => {
      const isLast = index === segments.length - 1;
      const startMs = leadInMs + Math.round((elapsedWeight / totalWeight) * activeDuration);
      elapsedWeight += weights[index];
      const endMs = isLast
        ? duration - tailMs
        : Math.max(startMs + 1, leadInMs + Math.round((elapsedWeight / totalWeight) * activeDuration));

      return {
        speaker: segment.speaker,
        text: segment.text,
        startMs,
        endMs
      };
    })
  };
}

export const initialData = {
  podcasts: [
    {
      podcastId: "pod_bbc_screentime",
      title: "6 Minute English: Limiting Screen Time for Children",
      description: "How much technology is too much for kids? Neil and Becca discuss screen time limits and intentional device use.",
      language: "English",
      source: "BBC Learning English",
      sourceUrl: "https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2026/ep-260618",
      series: "6 Minute English",
      category: "BBC 6 Minute English",
      difficulty: "Beginner",
      cefrLevel: "A2",
      duration: 6.4,
      coverImage: "https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=400&q=80",
      audioUrl: "https://downloads.bbc.co.uk/learningenglish/features/6min/260618_6_minute_english_limiting_screen_time_for_children_download.mp3",
      transcriptUrl: "https://downloads.bbc.co.uk/learningenglish/features/6min/260618_6_minute_english_limiting_screen_time_for_children_transcript_.pdf",
      transcriptId: "trans_bbc_screentime",
      createdAt: "2026-06-29T10:00:00Z",
      views: 3410,
      averageRating: 4.9,
      speaker: "Neil & Becca",
      skills: ["Listening", "Vocabulary", "Comprehension"],
      objective: "Discuss screens and child development, learning words like intentional and enable.",
      keywords: ["screentime", "intentional", "bar needs to be higher", "enable", "shifts"],
      difficultyExplanation: "Uses straightforward sentence structures with moderate-speed British English, suitable for beginner learners.",
      summary: "In this episode, Neil and Becca discuss children's screen time and how parents can be more intentional about technology use, featuring psychologist Dr. Becky Kennedy.",
      takeaways: [
        "1 in 5 children aged three to four have a smartphone in the UK.",
        "Dr Emily Goodacre argues for being intentional rather than removing screens entirely.",
        "Moving devices out of sight is a simple shift that sets children up for success."
      ],
      vocabularyCount: 6,
      vocabularyDifficulty: "A2",
      listeningDifficulty: "A2",
      grammarTopics: ["Modal Verbs", "Present Simple"],
      grammarSentences: [
        { topic: "Modal Verbs", sentence: "We need to be intentional about how we use technology with children.", explanation: "The modal phrase 'need to' expresses necessity or obligation." },
        { topic: "Present Simple", sentence: "Technology can enable children to learn and develop alongside interactive tools.", explanation: "Expresses a general truth or ability in the present." }
      ],
      lessonCategory: "Social Science",
      estimatedLearningValue: 85,
      targetGoals: ["General English", "Travel English"],
      flashcards: [
        { word: 'Intentional', phonetic: '/ɪnˈten.ʃən.əl/', pos: 'Adjective', translation: 'Qasddan qilingan (reja asosida)', definition: 'Done on purpose; deliberate.', example: 'We need to be intentional about how we use technology with children.' },
        { word: 'The bar needs to be higher', phonetic: '/ðə bɑː niːdz tuː biː ˈhaɪ.ər/', pos: 'Idiom', translation: 'Talab yuqoriroq bo\'lishi kerak', definition: 'Standards, expectations, or requirements need to be increased.', example: 'To improve education, the bar needs to be higher for student performance.' },
        { word: 'Enable', phonetic: '/ɪˈneɪ.bəl/', pos: 'Verb', translation: 'Imkoniyat bermoq', definition: 'To make something possible or encourage an ability.', example: 'Technology can enable children to learn and develop alongside interactive tools.' },
        { word: 'Eager', phonetic: '/ˈiː.ɡər/', pos: 'Adjective', translation: 'Ishtiyoqli (chanqoq)', definition: 'Wanting to do or have something very much.', example: 'Parents are eager to understand what is happening around technology.' },
        { word: 'Shift', phonetic: '/ʃɪft/', pos: 'Noun', translation: 'O\'zgarish (siljish)', definition: 'A small change or adjustment in position or direction.', example: 'Making little shifts in daily routines can reduce stress.' },
        { word: 'Set someone up for something', phonetic: '/set ˈsʌm.wʌn ʌp fɔː ˈsʌm.θɪŋ/', pos: 'Phrase', translation: 'Biror narsaga tayyorlamoq', definition: 'To prepare someone for something.', example: 'If you set someone up for something, you prepare them for it.' }
      ],
      quizQuestions: [
        { type: 'mc', question: 'According to the UK media regulator, how many children aged three to four have a smartphone?', options: ['One in twenty', 'One in ten', 'One in five'], correct: 2, explanation: 'Becca reveals that 1 in 5 children aged 3-4 have a smartphone.' },
        { type: 'tf', question: 'True or False: Dr. Emily Goodacre believes we should take away children\'s screen devices completely.', options: ['True', 'False'], correct: 1, explanation: 'Dr. Emily says it\'s not about taking them away, but being intentional about how we use them.' },
        { type: 'fill', question: 'If you _______ someone up for success, you prepare them for it. (Fill in)', options: ['set', 'make', 'give', 'keep'], correct: 0, explanation: 'The phrasal verb is to "set someone up" for success.' }
      ]
    },
    {
      podcastId: "pod_bbc_advertising",
      title: "6 Minute English: How Advertisers Make Us Spend Money",
      description: "Ever wonder why you make impulse purchases? Pippa and Phil look at the behavioural science of advertising.",
      language: "English",
      source: "BBC Learning English",
      sourceUrl: "https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_2026/ep-260611",
      series: "6 Minute English",
      category: "BBC 6 Minute English",
      difficulty: "Beginner",
      cefrLevel: "A2",
      duration: 6.2,
      coverImage: "https://images.unsplash.com/photo-1542744094-3a31f103e35f?w=400&q=80",
      audioUrl: "https://downloads.bbc.co.uk/learningenglish/features/6min/260611_6_minute_english_how_advertisers_make_us_spend_money_download.mp3",
      transcriptUrl: "https://downloads.bbc.co.uk/learningenglish/features/6min/260611_6_minute_english_how_advertisers_make_us_spend_money_transcript.pdf",
      transcriptId: "trans_bbc_advertising",
      createdAt: "2026-06-29T11:00:00Z",
      views: 2950,
      averageRating: 4.8,
      speaker: "Pippa & Phil",
      skills: ["Listening", "Vocabulary", "Grammar"],
      objective: "Analyze marketing tricks and learn behavioural science terms.",
      keywords: ["advertising", "mental shortcut", "nudge theory", "upsell", "basket spend"],
      difficultyExplanation: "Includes vocabulary related to finance, business psychology, and idioms at a beginner pace.",
      summary: "This episode explores how advertisements create 'mental shortcuts' to guide our buying decisions, and how touchscreen interfaces increase basket spend by reducing the fear of judgment.",
      takeaways: [
        "Nudge theory explains how small prompts steer human behavior.",
        "Touchscreen kiosks increase basket spend by 25-30% because customers do not feel judged.",
        "Celebrity endorsements function as a cognitive shortcut when consumers are unsure."
      ],
      vocabularyCount: 6,
      vocabularyDifficulty: "A2",
      listeningDifficulty: "A2",
      grammarTopics: ["Present Simple", "Phrasal Verbs"],
      grammarSentences: [
        { topic: "Present Simple", sentence: "Touchscreen kiosks increase basket spend by 25-30% because customers do not feel judged.", explanation: "Uses present simple tense to state marketing facts." },
        { topic: "Phrasal Verbs", sentence: "They try to upsell you a dessert when you pay.", explanation: "The phrasal verb 'upsell' means to persuade a customer to buy something additional." }
      ],
      lessonCategory: "Business",
      estimatedLearningValue: 88,
      targetGoals: ["Business English", "General English"],
      flashcards: [
        { word: 'Mental Shortcut', phonetic: '/ˈmen.təl ˈʃɔːt.kʌt/', pos: 'Noun', translation: 'Aqliy qisqartma (tez qaror chiqarish)', definition: 'A quick rule of thumb that helps make decisions quickly.', example: 'Endorsements work as a mental shortcut so we don\'t have to think much.' },
        { word: 'Judged', phonetic: '/dʒʌdʒd/', pos: 'Adjective', translation: 'Muhokama qilingan (tanqid qilingan)', definition: 'Feeling that others are forming a negative opinion of you.', example: 'No one feels judged by a computer screen when ordering extra food.' },
        { word: 'Upsell', phonetic: '/ˈʌp.sel/', pos: 'Verb', translation: 'Qimmatroq mahsulot taklif qilish', definition: 'Persuading a customer to buy additional or more expensive items.', example: 'The fast food kiosk tried to upsell me extra fries and drinks.' },
        { word: 'Basket Spend', phonetic: '/ˈbɑː.skɪt spend/', pos: 'Noun', translation: 'Savat xarajati (bir marta xarid qilish)', definition: 'The total amount of money spent in a single transaction.', example: 'Self-ordering screens raise average basket spend by up to 30%.' },
        { word: 'Think outside the box', phonetic: '/θɪŋk ˌaʊt.saɪd ðə ˈbɒks/', pos: 'Idiom', translation: 'Noan\'anaviy fikrlash (ijodkorlik)', definition: 'To think creatively in a different way.', example: 'We needed to think outside the box to impact people through a TV show.' },
        { word: 'Model', phonetic: '/ˈmɒd.əl/', pos: 'Verb', translation: 'O\'rnak ko\'rsatmoq (namuna bo\'lmoq)', definition: 'To show behavior that you want others to copy.', example: 'Parents should model good reading habits for their children.' }
      ],
      quizQuestions: [
        { type: 'mc', question: 'What is the theory that says people respond to small prompts?', options: ['Push theory', 'Pull theory', 'Nudge theory'], correct: 2, explanation: 'Phil explains that Nudge theory says behavior can be changed by small prompts.' },
        { type: 'tf', question: 'True or False: Waiters upselling desserts reduces the total basket spend.', options: ['True', 'False'], correct: 1, explanation: 'False. Upselling increases the total amount spent (basket spend).' },
        { type: 'fill', question: 'Celebrity endorsements work as a _______ shortcut for consumers.', options: ['mental', 'physical', 'financial', 'social'], correct: 0, explanation: 'The episode explains that celebrity endorsements are a "mental shortcut" so we don\'t have to think too hard about a purchase.' }
      ]
    },
    {
      podcastId: "pod_bbc_hates",
      title: "Real Easy English: Things We Can't Stand",
      description: "What makes you annoyed? Neil and Georgie talk about pet peeves and daily frustrations in easy English.",
      language: "English",
      source: "BBC Learning English",
      sourceUrl: "https://www.bbc.co.uk/learningenglish/english/features/real-easy-english/260619",
      series: "Real Easy English",
      category: "Daily Conversations",
      difficulty: "Intermediate",
      cefrLevel: "B1",
      duration: 6.5,
      coverImage: "https://images.unsplash.com/photo-1509248961158-e54f6934749c?w=400&q=80",
      audioUrl: "https://downloads.bbc.co.uk/learningenglish/realeasyenglish/260619_REE_hates_download.mp3",
      transcriptUrl: "https://downloads.bbc.co.uk/learningenglish/realeasyenglish/260619_REE_hates_transcript_.pdf",
      transcriptId: "trans_bbc_hates",
      createdAt: "2026-06-29T13:00:00Z",
      views: 1240,
      averageRating: 4.6,
      speaker: "Neil & Georgie",
      skills: ["Listening", "Pronunciation"],
      objective: "Learn everyday terms for dislikes, likes, and minor frustrations.",
      keywords: ["can't stand", "annoying", "irritating", "frustrated", "DIY", "littering"],
      difficultyExplanation: "Uses simple to intermediate English and focuses on adjectives of emotion (annoyed vs annoying).",
      summary: "Neil and Georgie discuss concert disturbances, littering in nature, and bad home repairs (DIY) to demonstrate adjectives of irritation.",
      takeaways: [
        "Extra conversational phrase 'Can't stand' means you really dislike something.",
        "Annoying describes the situation; annoyed describes how you feel.",
        "Littering in the countryside spoils the environment and makes people angry."
      ],
      vocabularyCount: 5,
      vocabularyDifficulty: "B1",
      listeningDifficulty: "B1",
      grammarTopics: ["Present Simple", "Relative Clauses"],
      grammarSentences: [
        { topic: "Present Simple", sentence: "I can't stand it when people drop litter in the countryside.", explanation: "Expresses strong dislike using the present simple phrase 'can't stand'." },
        { topic: "Relative Clauses", sentence: "This describes a person who is feeling annoyed.", explanation: "The relative pronoun 'who' introduces a defining relative clause." }
      ],
      lessonCategory: "Communication",
      estimatedLearningValue: 90,
      targetGoals: ["Speaking Fluency", "General English"],
      flashcards: [
        { word: 'Can\'t stand', phonetic: '/kɑːnt stænd/', pos: 'Phrase', translation: 'Chidab bo\'lmas (yoqtirmaslik)', definition: 'To really dislike or detest something.', example: 'I can\'t stand it when people talk loudly during a concert.' },
        { word: 'Annoying', phonetic: '/əˈnɔɪ.ɪŋ/', pos: 'Adjective', translation: 'G\'ashni keltiradigan', definition: 'Causing irritation or minor anger.', example: 'Leaving wrappers and cans on the ground is very annoying.' },
        { word: 'Irritating', phonetic: '/ˈɪr.ɪ.teɪ.tɪŋ/', pos: 'Adjective', translation: 'Jahlini chiqaradigan', definition: 'Annoying; making you feel uncomfortable.', example: 'Going through thick crowds of people is frustrating and irritating.' },
        { word: 'Annoyed', phonetic: '/əˈnɔɪd/', pos: 'Adjective', translation: 'G\'azablangan (achchiqlangan)', definition: 'Feeling slightly angry or irritated.', example: 'She felt annoyed because the flight was delayed.' },
        { word: 'Frustrated', phonetic: '/frʌsˈtreɪ.tɪd/', pos: 'Adjective', translation: 'Umidi uzilgan (chorasiz)', definition: 'Feeling annoyed or upset because you cannot achieve something.', example: 'I feel frustrated when I am stuck in a traffic jam.' }
      ],
      quizQuestions: [
        { type: 'mc', question: 'What does "can\'t stand" mean?', options: ['Unable to stand up', 'To really dislike something', 'To prefer sitting down'], correct: 1, explanation: 'Can\'t stand is an idiomatic phrase meaning you strongly dislike something.' },
        { type: 'tf', question: 'True or False: "Annoyed" describes a situation, while "annoying" describes how a person feels.', options: ['True', 'False'], correct: 1, explanation: 'False. Annoying describes the situation; annoyed describes the feeling.' },
        { type: 'fill', question: 'I _______ stand it when people drop litter in the countryside.', options: ['can\'t', 'won\'t', 'don\'t', 'shouldn\'t'], correct: 0, explanation: '"Can\'t stand" is the correct idiomatic phrase to express strong dislike.' }
      ]
    },
    {
      podcastId: "pod_bbc_weather",
      title: "Real Easy English: Hot Weather",
      description: "Sunny days in the UK! Phil and Becca discuss heatwaves, staying cool, and making the most of summer.",
      language: "English",
      source: "BBC Learning English",
      sourceUrl: "https://www.bbc.co.uk/learningenglish/english/features/real-easy-english/260612",
      series: "Real Easy English",
      category: "Everyday English",
      difficulty: "Intermediate",
      cefrLevel: "B2",
      duration: 5.9,
      coverImage: "https://images.unsplash.com/photo-1504370805625-d32c54b16100?w=400&q=80",
      audioUrl: "https://downloads.bbc.co.uk/learningenglish/realeasyenglish/260612_REE_hot_weather_download.mp3",
      transcriptUrl: "https://downloads.bbc.co.uk/learningenglish/realeasyenglish/260612_REE_hot_weather_transcript.pdf",
      transcriptId: "trans_bbc_weather",
      createdAt: "2026-06-29T14:00:00Z",
      views: 1100,
      averageRating: 4.7,
      speaker: "Phil & Becca",
      skills: ["Listening", "Vocabulary"],
      objective: "Describe summer activities, heatwaves, and cooling down in simple sentences.",
      keywords: ["heatwave", "cool down", "air conditioning", "make the most of"],
      difficultyExplanation: "Conversational pacing with intermediate vocabulary suited for upper-intermediate learners.",
      summary: "Phil and Becca talk about sunbathing, eating ice cream to stay cool, and using air conditioning during rare UK heatwaves.",
      takeaways: [
        "A heatwave is a period of unusually hot weather.",
        "Water helps you cool down or cool off when temperatures rise.",
        "Air conditioning is often shortened to 'air con' or 'AC' in conversation."
      ],
      vocabularyCount: 4,
      vocabularyDifficulty: "B2",
      listeningDifficulty: "B2",
      grammarTopics: ["Reported Speech", "Conditionals"],
      grammarSentences: [
        { topic: "Reported Speech", sentence: "Phil mentions that they don't get many very hot days in the UK.", explanation: "Reports Phil's statement using a reporting verb in the present tense." },
        { topic: "Conditionals", sentence: "You should make the most of the weather while it lasts.", explanation: "Uses a conditional recommendation with the modal verb 'should'." }
      ],
      lessonCategory: "Environment",
      estimatedLearningValue: 92,
      targetGoals: ["Speaking Fluency", "IELTS Preparation"],
      flashcards: [
        { word: 'Heatwave', phonetic: '/ˈhiːt.weɪv/', pos: 'Noun', translation: 'Issiq havo oqimi', definition: 'A period of time with unusually hot weather.', example: 'We are experiencing a summer heatwave in London this week.' },
        { word: 'Make the most of', phonetic: '/meɪk ðə məʊst ɒv/', pos: 'Phrase', translation: 'Unumli foydalanmoq', definition: 'To enjoy or use something as much as you can.', example: 'You should make the most of the sunny weekend.' },
        { word: 'Cool down', phonetic: '/kuːl daʊn/', pos: 'Verb', translation: 'Sovutmoq (salqinlamoq)', definition: 'To feel less hot or become cooler.', example: 'Eating ice cream helps me cool down in hot weather.' },
        { word: 'Air conditioning', phonetic: '/ˈeə kənˌdɪʃ.ən.ɪŋ/', pos: 'Noun', translation: 'Konditsioner tizimi', definition: 'A machine that helps a space feel less hot.', example: 'It could be difficult to find an area that does have a fan or air conditioning.' }
      ],
      quizQuestions: [
        { type: 'mc', question: 'What is a heatwave?', options: ['A rainy storm', 'A period of unusually hot weather', 'A cold winter breeze'], correct: 1, explanation: 'A heatwave is defined as a period of excessively hot weather.' },
        { type: 'tf', question: 'True or False: In England, summers are historically extremely hot all the time.', options: ['True', 'False'], correct: 1, explanation: 'False. Phil mentions they don\'t get many very hot days in the UK.' },
        { type: 'fill', question: 'You should _______ the most of the sunny weather while it lasts.', options: ['make', 'take', 'do', 'get'], correct: 0, explanation: '"Make the most of" is the correct phrase meaning to use or enjoy something fully.' }
      ]
    },
    {
      podcastId: "pod_bbc_anxiety",
      title: "Beating Speaking Anxiety: Scared of Making Mistakes",
      description: "Are you scared of making mistakes in English? Hanan and Georgie share tips to overcome speech anxiety.",
      language: "English",
      source: "BBC Learning English",
      sourceUrl: "https://www.bbc.co.uk/learningenglish/english/features/beating-speaking-anxiety/ep-1",
      series: "Beating Speaking Anxiety",
      category: "Speaking",
      difficulty: "Advanced",
      cefrLevel: "C1",
      duration: 10.9,
      coverImage: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&q=80",
      audioUrl: "https://downloads.bbc.co.uk/learningenglish/features/beating_speaking_anxiety/1_BSA_making_mistakes_download.mp3",
      transcriptUrl: "https://downloads.bbc.co.uk/learningenglish/features/beating_speaking_anxiety/1_BSA_making_mistakes_transcript__.pdf",
      transcriptId: "trans_bbc_anxiety",
      createdAt: "2026-06-29T12:00:00Z",
      views: 4120,
      averageRating: 4.9,
      speaker: "Hanan & Georgie",
      skills: ["Speaking", "Vocabulary", "Comprehension"],
      objective: "Overcome fear of speaking and identify cognitive speech blocks.",
      keywords: ["anxiety", "dread", "irrational beliefs", "self-perception", "same boat"],
      difficultyExplanation: "Features natural conversations with fast pacing and academic research on psychology.",
      summary: "In this special series, Hanan and Georgie discuss the fear of making mistakes, introducing academic insights on irrational beliefs and self-perception.",
      takeaways: [
        "Language anxiety comes from internal self-judgement, not other people.",
        "Making errors conscious helps us realize that everyone is in the same boat.",
        "Speaking is about communicating ideas, not passing a test."
      ],
      vocabularyCount: 6,
      vocabularyDifficulty: "C1",
      listeningDifficulty: "C1",
      grammarTopics: ["Passive Voice", "Conditionals"],
      grammarSentences: [
        { topic: "Passive Voice", sentence: "The judgment is often created by our own high expectations.", explanation: "Uses the passive voice structure to focus on the experience rather than the speaker." },
        { topic: "Conditionals", sentence: "Unless you want to swim, we should stay indoors.", explanation: "Uses 'unless' as a negative conditional meaning 'except if'." }
      ],
      lessonCategory: "Psychology",
      estimatedLearningValue: 95,
      targetGoals: ["Academic English", "IELTS Preparation", "Speaking Fluency"],
      flashcards: [
        { word: 'Dread', phonetic: '/dred/', pos: 'Noun', translation: 'Qattiq qo\'rquv (vahima)', definition: 'Great fear or apprehension about something that might happen.', example: 'Her experience speaking English was full of dread and regret.' },
        { word: 'Irrational beliefs', phonetic: '/ɪˈræʃ.ən.əl bɪˈliːfs/', pos: 'Noun', translation: 'Mantiqsiz ishonchlar (xato fikrlar)', definition: 'Beliefs that are not based on facts or what is true.', example: 'Anxiety is often driven by irrational beliefs that people will laugh at you.' },
        { topic: "Conditionals", word: 'Implicit beliefs', phonetic: '/imˈplis.it bɪˈliːfs/', pos: 'Noun', translation: 'Yashirin ishonchlar', definition: 'Beliefs that are sub-conscious and we do not actively notice.', example: 'We must turn implicit beliefs into conscious beliefs to change them.' },
        { word: 'Conscious beliefs', phonetic: '/ˈkɒn.ʃəs bɪˈliːfs/', pos: 'Noun', translation: 'Anglangan ishonchlar', definition: 'Beliefs that we notice and are aware of.', example: 'Once it becomes a conscious belief, you can deal with the anxiety.' },
        { word: 'Self-perception', phonetic: '/ˌself.pəˈsep.ʃən/', pos: 'Noun', translation: 'O\'z-o\'zini baholash', definition: 'How you view or evaluate yourself.', example: 'Low self-perception makes learners overly self-conscious.' },
        { word: 'In the same boat', phonetic: '/ɪn ðə seɪm bəʊt/', pos: 'Idiom', translation: 'Bitta kemada (bir xil qiyin ahvolda)', definition: 'In the same difficult situation as other people.', example: 'Don\'t worry about making mistakes; everyone in this class is in the same boat.' }
      ],
      quizQuestions: [
        { type: 'mc', question: 'Where does the judgement causing speaking anxiety come from?', options: ['From other people', 'From within yourself', 'From teachers only'], correct: 1, explanation: 'The podcast explains that the judgement doesn\'t come from others; it comes from within.' },
        { type: 'tf', question: 'True or False: Speaking is primarily about perfection and being 100% fluent.', options: ['True', 'False'], correct: 1, explanation: 'False. The episode says it is about communicating well, not perfection.' },
        { type: 'fill', question: 'Don\'t worry — everyone learning a language is in the same _______.', options: ['boat', 'room', 'class', 'situation'], correct: 0, explanation: '"In the same boat" is an idiom meaning everyone faces the same difficulty.' }
      ]
    }
  ],

  transcripts: {
    "trans_bbc_screentime": buildOfficialTranscript("trans_bbc_screentime", "pod_bbc_screentime", 384699, [
      { speaker: "Neil", text: `Hello, this is 6 Minute English from BBC Learning English. I'm Neil.` },
      { speaker: "Becca", text: `And I'm Becca. Neil, I’ve noticed that you’re pretty good at not checking your phone at work. How much time do you spend on your phone outside of work?` },
      { speaker: "Neil", text: `Yes, I probably was. You know, Becca, I spend far too much time looking at my phone, and I really don't like it. How about you?` },
      { speaker: "Becca", text: `I don't think you're alone. I also spend way too much time looking at my phone.` },
      { speaker: "Neil", text: `Well, Becca, we are both adults, but today we're talking about screen time and children screen time. Screen time - that’s how much time you spend using devices like smart phones, tablets and laptops.` },
      { speaker: "Becca", text: `Yes, and it’s a particular worry of many parents that their children spend too much time on these devices. At the end of last year, Australia banned access to social media apps for under 16s, and countries like the UK are considering similar measures.` },
      { speaker: "Neil", text: `So, why is this? In this episode, we'll hear from a clinical psychologist and research associate at the University of Cambridge talking about screentime and children. As usual, we'll be learning some useful new words and phrases. And remember, you'll find all this episode's vocabulary, along with a transcript, on our website, bbclearningenglish.com.` },
      { speaker: "Becca", text: `But first Neil, I have a question for you. According to The UK media regulator, how many children aged three to four have a smartphone? Is it: a) one in twenty b) one in ten, or c) one in five?` },
      { speaker: "Neil", text: `Wow. Well, I'm going to guess 1 in 20, but I think it's probably more than that.` },
      { speaker: "Becca", text: `Well, we'll find out the answer later. Dr Emily Goodacre is a research associate at the University of Cambridge. Here, she tells Shiona McCallum, presenter of BBC World Service programme, Tech Life, her thoughts on whether we should take away children’s screen devices completely.` },
      { speaker: "Dr Emily Goodacre", text: `Yeah, I think it's not as much as getting them away from technology but being intentional about how we use technology with children. For me, the bar absolutely needs to be higher, and therefore I think about how to design products that think about childhood first and really think about how children at different stages learn and develop and then see if there's a way that technology can enable that.` },
      { speaker: "Neil", text: `Emily highlights how, rather than stopping children from using technology, parents need to be more intentional about how their children use it. An intention is a plan or reason to do something. So, to be intentional is to act with that plan or reason in mind. It may make you act more carefully as a result.` },
      { speaker: "Becca", text: `Emily also says the bar needs to be higher. The idiom the bar is low means that the standards, expectations, or requirements are minimal and very easy to meet. Therefore, she believes that the bar needs to be higher – parents need to make their expectations higher. They need to think or act more carefully when considering how much time children spend with technology. You might also hear people say set the bar higher or lower.` },
      { speaker: "Neil", text: `Emily believes that being more intentional and setting the bar higher will enable children to learn and develop alongside technology. If you enable something, you encourage somebody’s ability to do something, or to make something possible.` },
      { speaker: "Becca", text: `Now let’s hear Dr Becky Kennedy, a clinical psychologist and founder of an online parenting platform, talking about how parents feel about tech and children, for BBC World Service programme, Tech Life:` },
      { speaker: "Dr Becky Kennedy", text: `I find parents are very, very eager to understand what's really happening around technology in kids and then have practical, realistic things they can do in their home to make little shifts that feel better.` },
      { speaker: "Neil", text: `Becky has found that many parents are eager to understand their children’s use of technology. Eager is an adjective that describes wanting to do or have something very much.` },
      { speaker: "Becca", text: `Becky also talks about making little shifts. A shift is a small change. It can be used as a verb or a noun. Becky shares an example of a shift that can help parents reduce children’s screen time, moving the device somewhere it can’t be seen:` },
      { speaker: "Dr Becky Kennedy", text: `You can even say to a kid, you know why I moved it? It's actually because it's a really hard thing for me to expect from you, to see a screen in a room and not want to use it. I wasn't setting you up for success.` },
      { speaker: "Neil", text: `Becky explains how it’s difficult for children to be expected to reduce their screen time if they can see their device. Having the device in view doesn’t set them up for success. If you set someone up for something, you prepare them for it.` },
      { speaker: "Becca", text: `Yes. For example, earlier, I set Neil up for a shock when I asked him a question about screen time. Neil, I asked you, according to The UK media regulator, how many children ages three to four have a smartphone.` },
      { speaker: "Neil", text: `And I said 1 in 20.` },
      { speaker: "Becca", text: `Well, it is in fact, see 1 in 5.` },
      { speaker: "Neil", text: `Wow. I thought it might be more than I said. Now, let's recap the vocabulary we've learned, starting with intentional. It’s an adjective that describes acting with a plan or reason in mind.` },
      { speaker: "Becca", text: `We had the expression the bar needs to be higher. To set the bar higher is to make your expectations higher.` },
      { speaker: "Neil", text: `We also had enable. This is to encourage someone’s ability to do something, or to make something possible.` },
      { speaker: "Becca", text: `To be eager is to want to do or have something very much.` },
      { speaker: "Neil", text: `A shift is a small change. You can also use it as verb with to mean changing something slightly.` },
      { speaker: "Becca", text: `And if you set someone up for something, you prepare them for it. Once again, our six minutes are up. If you enjoyed this episode, you'll find a quiz and worksheet to practise the vocabulary we've learnt on our website, bbclearningenglish.com. See you again soon. But for now, it's goodbye.` },
      { speaker: "Neil", text: `Goodbye!` }
    ], { leadInMs: 1200, tailMs: 4400 }),

    "trans_bbc_advertising": buildOfficialTranscript("trans_bbc_advertising", "pod_bbc_advertising", 373705, [
      { speaker: "Pippa", text: `Hello, this is 6 Minute English from BBC Learning English. I'm Pippa.` },
      { speaker: "Phil", text: `And I'm Phil. What's the last thing you bought and why did you buy it?` },
      { speaker: "Pippa", text: `I bought a new pair of headphones recently because my old ones broke, and I did lots of research to try and find a good pair. How about you?` },
      { speaker: "Phil", text: `I bought a soft drink on the way to work this morning. It might be because I saw someone I like promoting it in an advert. We call this a celebrity endorsement. But why do they work? Let's start by hearing from Ben Jones, a behavioural research expert, speaking to BBC World Service programme Business Daily.` },
      { speaker: "Ben Jones", text: `When we're unsure, we don't know what to do, it's kind of easy to follow the lead of those who we think are credible or knowledgeable. It's a mental shortcut. It's something that helps us navigate uncertain times or make quick choices. We start doing that from an early age. Our parents… for some people, it's about our teachers – you know, these people who help us learn and make sense of the world. And some businesses can draw on this through things like endorsements – you know, dentists recommending toothpaste, athletes endorsing sportswear.` },
      { speaker: "Pippa", text: `Ben says that endorsements work as a mental shortcut. This is something that helps us make a decision quickly. If we trust the endorsement, then we don't need to think about it that much.` },
      { speaker: "Phil", text: `In this episode, we're going to look at the way that people can be convinced to do things.` },
      { speaker: "Pippa", text: `And as usual, we'll learn some useful new words and phrases. And remember, you'll find all the vocabulary and a quiz on our website, bbclearningenglish.com.` },
      { speaker: "Phil", text: `OK. But first I have a question for you, Pippa. Today we're talking about behavioural science. What's the name of the theory that says people respond to small prompts? Is it: a) push theory, b) pull theory, or c) nudge theory?` },
      { speaker: "Pippa", text: `Oh, I'm not sure. I'm going to say b) pull theory.` },
      { speaker: "Phil", text: `OK. Well, we'll find out the answer at the end of the programme. In recent years, many fast-food chains have installed touchscreen machines for people to order their food. They've reported taking more money as a result. Could behavioural science tell us why this happens? Here's product designer Dean Ward speaking to BBC World Service's Business Daily.` },
      { speaker: "Dean Ward", text: `Firstly, the psychology of speaking to someone and feeling judged – we think is a key factor. So, would you like extra fries? Would you like to go large? Not all people, but I think there's definitely a large proportion of people who may feel judged in those instances and may say no. There's the fact that you've got more time to look. You can see the product, you can see what's in it, you can see all the products linked to it as well. And also around upsell as well. Would you like to add this? Would you like to do that? Because you've got more time and you're not being judged, you're very much more inclined to actually say yes to these things. And that's typically what we're seeing – an increased basket spend of typically 25– 30%.` },
      { speaker: "Pippa", text: `If people feel judged, then it means that they worry what other people will think of them. If we have to ask a human for extra fries, we might worry what they think of us, but no one feels judged by a computer screen.` },
      { speaker: "Phil", text: `If you upsell something, then you get someone to spend more. For example, waiters often try to get people to buy larger portions, more drinks, or dessert.` },
      { speaker: "Pippa", text: `Dean says that upselling can increase people's basket spend. A basket spend is the total amount that someone spends in one transaction, on everything that's in their basket. Now, this is an example of a business using behavioural science to nudge people to do things. But it's not just businesses that use behavioural science in this way. In Tunisia, the United Nations World Food Programme wanted to encourage people to eat food together more often. They made a TV show set in a restaurant. Let's hear from Takwa Khelifi from the World Food Programme, talking to BBC World Service's Business Daily.` },
      { speaker: "Takwa Khelifi", text: `So, we needed something really creative and really different to think outside of the box, or to let people see themselves in those stories, because people are learning and changing by imitating and modelling and, like, observing others' behaviours and others' actions and emotional reactions to things. So, this is why we tried this project or this... tried this product or this TV series – in order that you impact people.` },
      { speaker: "Phil", text: `Takwa says that they needed to think outside the box. This means to try and think in a different way, to come up with something creative.` },
      { speaker: "Pippa", text: `The TV programme leads to people modelling behaviour. If you model behaviour, then you behave in a way that other people can copy. Now Phil, I think it's time to hear the answer to your question.` },
      { speaker: "Phil", text: `Yes, it is. I asked what theory says that people respond to small prompts to change their behaviour.` },
      { speaker: "Pippa", text: `I thought it was pull theory...` },
      { speaker: "Phil", text: `...which I'm afraid was the wrong answer. Nudge theory says that people's behaviour can be changed by small prompts or nudges.` },
      { speaker: "Pippa", text: `OK. Let's recap the vocabulary we've learned, starting with mental shortcut, which is something that helps us make a decision quickly, usually because we don't need to think about it.` },
      { speaker: "Phil", text: `If someone feels judged, then they're worried about what other people think about them.` },
      { speaker: "Pippa", text: `Upsell refers to persuading someone to buy something extra, like a dessert at a restaurant.` },
      { speaker: "Phil", text: `Basket spend is what you spend in one transaction on the things in your shopping basket.` },
      { speaker: "Pippa", text: `If you think outside the box, then you think about something in a different way to come up with a creative solution.` },
      { speaker: "Phil", text: `And finally, modelling is behaving in a way that others can copy. Once again, our six minutes are up, but why not head over to our website, bbclearningenglish.com, to try the quiz and worksheet for this episode. See you again soon!` },
      { speaker: "Pippa", text: `Bye!` }
    ], { leadInMs: 1200, tailMs: 6300 }),

    "trans_bbc_hates": buildOfficialTranscript("trans_bbc_hates", "pod_bbc_hates", 389851, [
      { speaker: "Neil", text: `Hello and welcome to Real Easy English. In this podcast, we have real conversations in easy English to help you learn. I'm Neil.` },
      { speaker: "Georgie", text: `And I'm Georgie. You can find a video version of this podcast with subtitles on our website, bbclearningenglish.com.` },
      { speaker: "Neil", text: `Hi, Georgie. How are you?` },
      { speaker: "Georgie", text: `I'm very well, thank you, Neil. How are you?` },
      { speaker: "Neil", text: `I'm OK. At the weekend, I went to a concert.` },
      { speaker: "Georgie", text: `Yes.` },
      { speaker: "Neil", text: `And I was trying to listen to the music. Lots of people around me were talking loudly, and I really hate that.` },
      { speaker: "Georgie", text: `Oh. It's quite annoying, I guess, yeah. Well, today we're actually talking about things that we don't like – things that we hate doing and things that we don't like other people doing. So, let's talk about your concert then. How... why didn't you like that?` },
      { speaker: "Neil", text: `I just think it's... it feels quite rude to me because lots of people want to listen to the music and they paid money to listen to the music, but other people have decided just to talk and it means I couldn't listen to my favourite music.` },
      { speaker: "Georgie", text: `Yeah, and the tickets are expensive! And you go there for a reason and other people can ruin the experience for you. This happens also in the cinema or the theatre. Yeah, I find that annoying too. I don't like it when people… when groups of people are walking down the street in a line and they don't leave space for other people to pass. I can sometimes be a bit impatient, and maybe that's my problem, but yeah, that annoys me.` },
      { speaker: "Neil", text: `Do you know what I can't stand?` },
      { speaker: "Georgie", text: `What?` },
      { speaker: "Neil", text: `I can't stand it when people leave litter or rubbish, especially in a beautiful, natural place. So, if I'm in the countryside and then I see some old wrappers or...` },
      { speaker: "Georgie", text: `Cans.` },
      { speaker: "Neil", text: `...cans left lying on the ground, that makes me sad and angry.` },
      { speaker: "Georgie", text: `Yeah, because it spoils the beautiful environment. Is there anything that you hate doing personally?` },
      { speaker: "Neil", text: `Oh, lots of things. I really hate DIY. DIY is when you do repairs to your own house or flat.` },
      { speaker: "Georgie", text: `Yes.` },
      { speaker: "Neil", text: `I'm really bad at it. And because I know I'm bad at it, when I do it and it's a failure, everything about it makes me hate it.` },
      { speaker: "Georgie", text: `Another thing that I don't like doing is, similar to what I said before, I don't like going through crowds of people because again, I like to get to places quickly and if I can't move easily in a crowd that frustrates me. I find that annoying and irritating.` },
      { speaker: "Neil", text: `Yeah, it's really irritating, isn't it?` },
      { speaker: "Georgie", text: `And it's strange because usually I'm quite a calm and relaxed person and I just think, well, whatever happens happens. But for some reason, in these situations, I get very annoyed. It makes me very annoyed.` },
      { speaker: "Neil", text: `How about food? Is there any food that you can't stand?` },
      { speaker: "Georgie", text: `Actually, no. I eat most food and I really love food. When I was younger, I used to hate nuts for some reason. I don't like the texture but... or I didn't like the texture. But now I think I don't mind them so much. I just don't want nuts in my sweet treats. So, Neil, do you think that there's anything that you do that other people hate?` },
      { speaker: "Neil", text: `Oh, definitely. I've got kids and kids are very honest. And so my kids think I'm really annoying in the morning, especially if I ask them lots of questions when they're making their breakfast.` },
      { speaker: "Georgie", text: `I can really relate to that, to your kids actually, because I really don't like it when people ask me lots of questions in the morning. I'm just waking up. I don't want to talk to anyone at the moment. Anything else?` },
      { speaker: "Neil", text: `Well probably lots, but let's leave it there. How about you?` },
      { speaker: "Georgie", text: `There's definitely things that people find annoying about me. I'm very forgetful with my possessions – so, things that I own. I often leave bags, phones, jackets, umbrellas in restaurants and bars. And my friends and my sister get really annoyed because they have to follow me around making sure that I've got all of my things. And I think that's very annoying for them. It's annoying for me as well because I lose lots of things, like my phone a couple of times. Annoying for everyone!` },
      { speaker: "Neil", text: `OK. Let's recap the vocabulary we've heard in this episode, starting with can't stand. If you can't stand something, you really, really don't like it.` },
      { speaker: "Georgie", text: `The adjectives annoying and irritating describe something that makes you feel uncomfortable or angry when it happens.` },
      { speaker: "Neil", text: `Georgie just gave the adjectives that describe the situation, but annoyed or irritated describe the way you feel. So, if you are annoyed or irritated, something has made you angry.` },
      { speaker: "Georgie", text: `If you feel frustrated, you're annoyed because you can't do something. For example, if you're in a traffic jam, you can feel frustrated that you can't move somewhere quickly. The situation is frustrating.` },
      { speaker: "Neil", text: `That's it for this episode of Real Easy English, but don't forget to go to our website, bbclearningenglish.com, where you can download a free worksheet.` },
      { speaker: "Georgie", text: `And we'll be back next week with another conversation in Easy English. Goodbye for now.` },
      { speaker: "Neil", text: `Goodbye!` }
    ], { leadInMs: 200, tailMs: 1500 }),

    "trans_bbc_weather": buildOfficialTranscript("trans_bbc_weather", "pod_bbc_weather", 353515, [
      { speaker: "Phil", text: `Hello and welcome to Real Easy English from BBC Learning English. Each week we have a real conversation in easy English to help you learn. I'm Phil.` },
      { speaker: "Becca", text: `And I'm Becca. You can find a video version of this podcast on our website, along with a free worksheet, subtitles and a transcript. That's at bbclearningenglish.com.` },
      { speaker: "Phil", text: `So, how are things, Becca?` },
      { speaker: "Becca", text: `Yeah, things are going really well, thank you, Phil. We've just had a really lovely weekend. It's very sunny, very nice. How are things for you?` },
      { speaker: "Phil", text: `Well, they're very good. As you said, it was a very sunny weekend and, yeah, I love the sunshine. I love it when the weather is a bit warmer. And that's what we're going to be talking about today. We're going to be talking about hot weather and what you do to stay cool.` },
      { speaker: "Becca", text: `Yeah, I love hot weather. I'm very excited for summer to come here soon. I really enjoy eating ice cream when it is very hot. That helps me to stay cool.` },
      { speaker: "Phil", text: `Yeah. Are there any other things? Are there any activities that you do when the weather's hot?` },
      { speaker: "Becca", text: `You mean apart from eating ice cream...?` },
      { speaker: "Phil", text: `Apart from eating ice cream, yeah!` },
      { speaker: "Becca", text: `I really don't like being hot when I'm in the city because I feel like the heat, kind of, stays and it's very difficult to find, like, a swimming pool or... I love to go to the beach. I think being in water can really help you cool down. How about yourself?` },
      { speaker: "Phil", text: `When it's really hot, when we get a heatwave, which is when you get a few days and it's a long way above normal temperatures, then I like to put a paddling pool in the back garden, which is like a little swimming pool, and you just fill it with water and then jump in.` },
      { speaker: "Becca", text: `Yeah, water can really help you cool off or cool down to become cold. So, how do you make the most of hot weather then? Because you mentioned we don't have many days of very hot weather here in the UK.` },
      { speaker: "Phil", text: `I spend a lot more time outside than I do during the winter, for example. If we've got nice warm weather and it's not raining, it's nice to be outside just to sit, spend some time reading, whatever... cooking outside, having a barbecue.` },
      { speaker: "Becca", text: `Yeah.` },
      { speaker: "Phil", text: `Eating outside – you can sit in the garden and eat dinner outside. All of those things you can do in the summer when it's warm and, of course, when it's not raining.` },
      { speaker: "Becca", text: `But that sounds lovely – really making the most of those long, hot days. Yeah. So, to make the most of something is to do as much as you can within the time or the space that you're in.` },
      { speaker: "Phil", text: `If it's a very hot day, do you prefer to be outside in the sun or to be inside near a fan, or near the air conditioner?` },
      { speaker: "Becca", text: `Ah OK. Yeah. Yeah, I prefer to be outside. I remember going on holiday with my friends, and they wanted to stay inside shopping centres where there was an air con, an AC, but I wanted to be out and walking. Although it's very important that if you are outside when it's very hot, that you drink water and you find places where you can cool down.` },
      { speaker: "Phil", text: `It depends as well on the country as well, I guess, because in England the summers are never very, very hot, but in other parts of the world, I guess it can probably be quite dangerous.` },
      { speaker: "Becca", text: `Yes. Yeah. And also adding on to that, because it isn't very hot often in the UK, in England, we aren't very well prepared for the heat. So, yeah, if you do come and visit the UK, just know that on a very, very hot day, it could be quite difficult to find an area that does have a fan or air conditioning.` },
      { speaker: "Phil", text: `OK. Let's recap the vocabulary that we heard during the conversation, starting with heatwave. Now, a heatwave is a period of time with very hot weather.` },
      { speaker: "Becca", text: `If you make the most of something, you enjoy it as much as you can. For example, I make the most of hot days by going outside for walks and getting an ice cream.` },
      { speaker: "Phil", text: `We also heard cool down, which means to feel less hot. So, for example, when it's really hot, I like to cool down by jumping in a paddling pool. And we can also say cool off, which means the same in this context.` },
      { speaker: "Becca", text: `And we had air conditioning. That is a machine that helps the space that you're in – so it could be your house or your work office – it helps that space feel less hot. It helps it feel colder. You might hear it shortened to air con or AC.` },
      { speaker: "Phil", text: `That's it for this episode of Real Easy English. Try the worksheet on our website to test what you've learned. And that's at bbclearningenglish.com.` },
      { speaker: "Becca", text: `And we'll see you next week with another real conversation in easy English. But for now, it's goodbye!` },
      { speaker: "Phil", text: `Bye!` }
    ], { leadInMs: 500, tailMs: 6000 }),

    "trans_bbc_anxiety": buildOfficialTranscript("trans_bbc_anxiety", "pod_bbc_anxiety", 656792, [
      { speaker: "Hanan", text: `Do you get anxious when you speak English? You're not alone.` },
      { speaker: "Miguel", text: `I guess I'd say that my experience speaking English is full of dread and regret. I don't know why, but I cannot find the courage to speak to someone.` },
      { speaker: "Kristina", text: `For me, it was very important to be good in English. And I was like thinking what people will think about me when I'm speaking the wrong way or my pronunciation is not correct.` },
      { speaker: "Han Luo", text: `Imagine that if you are able to sound very intelligent, very wise, very smart in your first language, but then in the second language, you are not able to do that.` },
      { speaker: "Barnaby Griffiths", text: `It isn't about perfection, and it isn't about necessarily being very fluent. It's about communicating well.` },
      { speaker: "Georgie", text: `In this special series from BBC Learning English, we'll be helping you understand speaking anxiety and improve your confidence in English. Hello and welcome to Beating Speaking Anxiety. I'm Georgie, an English teacher and presenter at BBC Learning English.` },
      { speaker: "Hanan", text: `And I'm Hanan, a bilingual reporter for BBC Arabic and presenter of the Arabic educational series, Dars.` },
      { speaker: "Georgie", text: `So, as an English teacher, something my students used to ask me all the time was, "How can I get better at speaking?" And sometimes they mean they want to make fewer mistakes, but most often it's about confidence and wanting to stop feeling so nervous. They're worried about being judged for their mistakes. They're scared they'll forget their words, that people won't understand their accent. There are so many fears when it comes to speaking a foreign language.` },
      { speaker: "Hanan", text: `Yes, it's something I struggled with too when I moved to the UK to work at the BBC. My English was actually pretty good, but having conversations with people, I found it really difficult. So when I first joined the BBC, the Learning English team made an assessment of my English level, which they used to do for all new joiners to see if they need any help or courses. My results were pretty good, and I was fluent, but on that very same day, leaving the building and going to get some coffee, I couldn't really understand what the barista was saying, and I felt pretty nervous to order coffee and was trying to stress every single word, hoping that my grammar is correct and I am pronouncing the words right.` },
      { speaker: "Georgie", text: `Yeah, I'm sure that's a situation lots of people can relate to. So, in this series, we're going to look at all the things that make us afraid of speaking in a new language. We'll speak to experts to understand why speaking makes us so anxious, learn about what happens to our brain when we learn a new language, and explore some tips to help make speaking English less stressful.` },
      { speaker: "Hanan", text: `Each week for the next eight weeks, we will focus on a different fear learners have when speaking English.` },
      { speaker: "Georgie", text: `And we start with one of the most common fears for learners: I'm scared of making mistakes. Let's hear more from some learners – Cindy from Colombia, David from Brazil and Elisa from Mexico.` },
      { speaker: "Cindy", text: `And I feel afraid when I speak English because I don't have more vocabulary and I feel afraid for mistake and can't communicate my idea.` },
      { speaker: "Deivid", text: `I felt very self-conscious. I felt really insecure sometimes because I was like, oh, am I saying the right things? Do I say, do I know things well enough?` },
      { speaker: "Elisa", text: `I don't like making mistakes and knowing they know more than me. I put pressure on myself to avoid making mistakes and being foolish.` },
      { speaker: "Hanan", text: `All of those learners are worried about making mistakes.` },
      { speaker: "Georgie", text: `Yes. A time when I felt this fear the most was when I worked as an English teacher in Spain, and I had to have meetings with my students' parents to discuss their progress, all in Spanish. I was so scared of making mistakes because in my head it was linked to my job and my professionalism. I didn't want the parents to judge me and think I was a bad teacher.` },
      { speaker: "Hanan", text: `Totally. And you know, it's not just new learners of English who are worried about making mistakes. Even advanced learners talk about this. So what's going on?` },
      { speaker: "Han Luo", text: `You know, usually the beliefs that cause anxiety, especially severe anxiety, are, we call it 'irrational beliefs'. And also like, some low self-perceptions, fear of negative evaluation. All those learner internal, you know, factors.` },
      { speaker: "Georgie", text: `This is Han Luo, associate professor of Chinese at Lafayette College in the United States. Han has done lots of research into the sources of anxiety, or where that fear comes from. Han says irrational beliefs can make us anxious. Irrational beliefs are beliefs that aren't based on things that are true. And Han says that learners worry about mistakes because they're scared of 'negative evaluation'. In other words, that people will judge them for their mistakes and think badly of them.` },
      { speaker: "Han Luo", text: `Imagine that if you are able to sound very intelligent, very wise, very smart in your first language. You are, you know, admired by people, but then in the second language, you are not able to do that, right?` },
      { speaker: "Hanan", text: `When people speak in another language, they worry about what other people might think about them. But Han says this judgement doesn't come from other people. It comes from within.` },
      { speaker: "Georgie", text: `Yes. But in the moment when we try to speak, we're often not aware of what's causing the anxiety and stress. And so the first step to reducing the fear of making mistakes is to recognise that fear.` },
      { speaker: "Han Luo", text: `We want to make those implicit beliefs into conscious beliefs. That is already like a very, very important step.` },
      { speaker: "Georgie", text: `Often the beliefs that are making us anxious are implicit – we don't notice them, and we need to make them conscious so that we do notice them.` },
      { speaker: "Han", text: `You realise it now – 'Oh, nobody will laugh at me, uh, if I make a mistake', because everyone is in the same boat, right? So when you realise this, you know, now, I tell you, "You don't have to worry about it". So are you able to just remove your anxiety, you know, and then your your beliefs are changed?` },
      { speaker: "Georgie", text: `I find what Han said about irrational beliefs really interesting. So I'm an English teacher, so I know that mistakes help us learn. And also that as long as you communicate your ideas effectively, it doesn't really matter if you make a few mistakes. But I still have an irrational fear of making mistakes in Spanish. I need to make my feelings match my belief that making mistakes is fine.` },
      { speaker: "Hanan", text: `And you know what, Georgie? Um, we already make mistakes in our own languages, so I feel like we should encourage ourselves and tell ourselves it's OK to make mistakes.` },
      { speaker: "Georgie", text: `A hundred per cent, I totally agree. Han says recognising that these fears of making mistakes are irrational is the first step. But is there anything we can do practically to help get rid of this fear?` },
      { speaker: "Barnaby Griffiths", text: `It isn't about perfection, and it isn't about necessarily being very fluent. It's about communicating well.` },
      { speaker: "Hanan", text: `This is Barnaby Griffiths. He's a speaking coach who works with the students who want to improve their speaking in English.` },
      { speaker: "Georgie", text: `Barnaby says if we think about speaking as communicating rather than like a test, then we can relax. So embrace your mistakes.` },
      { speaker: "Barnaby Griffiths", text: `Above all, allow for mistakes. So self-correct is fine. Allow pauses and silence within your communication and learn to correct yourself and also introduce elements such as humour and smile and laugh when things go wrong and say, 'Oh, I didn't mean to say that' and have phrases like 'Let me rephrase that', or 'I need to say that again' and be vulnerable.` },
      { speaker: "Hanan", text: `I love Barnaby's advice to just smile and laugh when things go wrong, but I imagine it might be difficult to be vulnerable like Barnaby says. Do you have any tips, Georgie?` },
      { speaker: "Georgie", text: `Yes, I do. I think the best way to get comfortable making mistakes is to start in situations where you feel safe. So you could practise with someone you feel comfortable with. And another idea is to do a language exchange. So this is when you find someone who wants to practise your language and you want to practise their language. This is really good because you're both practising languages and you're both making mistakes, and you're kind of in the same situation.` },
      { speaker: "Hanan", text: `That's true. I had a similar experience actually when I was learning Turkish, so I did an exchange with a Turkish friend. She was teaching me Turkish and I was, funnily enough, I was actually giving her some English tips. Um, and it was really good because it is with someone you know and you feel comfortable with and you don't worry too much about mistakes. I was making mistakes in both languages, and, uh, that felt OK.` },
      { speaker: "Georgie", text: `Yeah, it's great because there's no judgement, is there?` },
      { speaker: "Hanan", text: `Exactly. Thanks for listening to this episode of Beating Speaking Anxiety. To learn more about speaking anxiety, head to our website where Georgie has made videos for each of the speaking fears we talk about in this series. You will hear more advice and see some tips in action with real learners. Use the link in the notes for this episode or visit bbclearningenglish.com` },
      { speaker: "Georgie", text: `And we'd love to hear about your experience speaking English. Please send us an email and tell us what scares you about speaking. Our email address is learningenglish@bbc.co.uk. And in the next episode, we'll be talking about what to do when you're speaking English and your mind suddenly goes blank. See you then.` },
      { speaker: "Hanan", text: `Bye.` }
    ], { leadInMs: 200, tailMs: 17200 })
  },

  tutoQuotes: [
    "Slow and steady wins the race. Let's make study progress!",
    "Each word you click is a step closer to global scholarship.",
    "A 5-day streak makes my shell shine! Keep going!",
    "Don't worry about mistakes. Even the best speakers started as beginners.",
    "Let's review the vocabulary together. High five!",
    "Your brain is building new connections. Delight in learning!"
  ],

  assessmentQuestions: [
    // --- VOCABULARY ---
    {
      id: "aq_vocab_easy",
      skill: "vocabulary",
      difficulty: "easy",
      question: "Choose the closest synonym for the word 'common'.",
      options: ["A) rare", "B) ordinary", "C) expensive", "D) foreign"],
      correct: 1,
      explanation: "Common means occurring, found, or done often; ordinary."
    },
    {
      id: "aq_vocab_medium",
      skill: "vocabulary",
      difficulty: "medium",
      question: "Choose the closest synonym for the word 'intentional'.",
      options: ["A) accidental", "B) deliberate", "C) emotional", "D) artistic"],
      correct: 1,
      explanation: "Intentional means done on purpose; deliberate. It is the opposite of accidental."
    },
    {
      id: "aq_vocab_hard",
      skill: "vocabulary",
      difficulty: "hard",
      question: "Choose the closest synonym for the word 'capricious'.",
      options: ["A) steady", "B) unpredictable", "C) generous", "D) malicious"],
      correct: 1,
      explanation: "Capricious means given to sudden and unaccountable changes of mood or behavior; unpredictable."
    },
    // --- GRAMMAR ---
    {
      id: "aq_gram_easy",
      skill: "grammar",
      difficulty: "easy",
      question: "Yesterday, they _______ to the library to study English.",
      options: ["A) go", "B) went", "C) gone", "D) will go"],
      correct: 1,
      explanation: "We use the past simple 'went' for an action completed in the past."
    },
    {
      id: "aq_gram_medium",
      skill: "grammar",
      difficulty: "medium",
      question: "If she _______ harder last week, she would have passed the exam.",
      options: ["A) studied", "B) has studied", "C) had studied", "D) would study"],
      correct: 2,
      explanation: "This is a third conditional sentence. The structure is: If + past perfect, would have + past participle."
    },
    {
      id: "aq_gram_hard",
      skill: "grammar",
      difficulty: "hard",
      question: "Seldom _______ such an impressive performance by a young speaker.",
      options: ["A) I have heard", "B) have I heard", "C) did I heard", "D) I heard"],
      correct: 1,
      explanation: "This sentence requires grammatical inversion after a negative/restrictive adverb ('Seldom')."
    },
    // --- READING ---
    {
      id: "aq_read_easy",
      skill: "reading",
      difficulty: "easy",
      question: "Paragraph: 'Tom loves his new job. He works at a school. He teaches English to young children every morning.'\n\nQuestion: What does Tom do in the morning?",
      options: ["A) He sleeps.", "B) He teaches English.", "C) He plays football.", "D) He goes shopping."],
      correct: 1,
      explanation: "The text directly states Tom teaches English to young children every morning."
    },
    {
      id: "aq_read_medium",
      skill: "reading",
      difficulty: "medium",
      question: "Paragraph: 'Artificial Intelligence is transforming industries by automating repetitive tasks, allowing humans to focus on creative work.'\n\nQuestion: What is the main benefit of AI according to the text?",
      options: ["A) It replaces all human workers.", "B) It automates creative thinking.", "C) It frees humans to focus on creative work.", "D) It only works in tech industries."],
      correct: 2,
      explanation: "The text states AI automates repetitive tasks, allowing humans to focus on creative work."
    },
    {
      id: "aq_read_hard",
      skill: "reading",
      difficulty: "hard",
      question: "Paragraph: 'Despite economic headwinds, the renewable energy sector experienced a double-digit expansion, largely catalyzed by unprecedented fiscal incentives from federal initiatives.'\n\nQuestion: What primarily drove the sector's expansion?",
      options: ["A) Economic headwinds", "B) Unprecedented fiscal incentives", "C) Growth in fossil fuels", "D) Consumer electricity drops"],
      correct: 1,
      explanation: "The text states the sector's expansion was 'largely catalyzed by unprecedented fiscal incentives'."
    },
    // --- LISTENING ---
    {
      id: "aq_list_easy",
      skill: "listening",
      difficulty: "easy",
      question: "Audio Transcript:\nSpeaker A: 'Excuse me, where is the nearest bus station?'\nSpeaker B: 'Go straight ahead and turn right at the corner.'\n\nQuestion: What did Speaker B do?",
      options: ["A) Ignored the question.", "B) Gave directions.", "C) Asked for a ticket.", "D) Boarded a bus."],
      correct: 1,
      explanation: "Speaker B gave directions: 'Go straight ahead and turn right'."
    },
    {
      id: "aq_list_medium",
      skill: "listening",
      difficulty: "medium",
      question: "Audio Transcript:\nSpeaker A: 'Do you think you can finish the report by noon?'\nSpeaker B: 'I'm already halfway through it!'\n\nQuestion: What does Speaker B imply?",
      options: ["A) They will finish on time.", "B) They just started.", "C) They need more help.", "D) They will fail the deadline."],
      correct: 0,
      explanation: "Being 'halfway through' by mid-morning implies they are on track to finish by noon."
    },
    {
      id: "aq_list_hard",
      skill: "listening",
      difficulty: "hard",
      question: "Audio Transcript:\nSpeaker A: 'The new guidelines are quite complex.'\nSpeaker B: 'Tell me about it! I spent hours reading them.'\n\nQuestion: What does Speaker B's response imply?",
      options: ["A) They want Speaker A to explain them.", "B) They strongly agree that guidelines are complex.", "C) They don't have time to read them.", "D) They found guidelines simple."],
      correct: 1,
      explanation: "The idiom 'Tell me about it!' is used to strongly agree with someone's complaint."
    },
    // --- COMPREHENSION ---
    {
      id: "aq_comp_easy",
      skill: "comprehension",
      difficulty: "easy",
      question: "Speaker A: 'Let's order some food. I haven't eaten all day.'\nSpeaker B: 'Good idea. Pizza sounds perfect!'\n\nQuestion: What is Speaker A's main intention?",
      options: ["A) To complain about pizza", "B) To suggest ordering food because they are hungry", "C) To make a pizza recipe", "D) To cancel a dinner plan"],
      correct: 1,
      explanation: "Speaker A states they haven't eaten all day and proposes ordering food."
    },
    {
      id: "aq_comp_medium",
      skill: "comprehension",
      difficulty: "medium",
      question: "Speaker A: 'I'm sorry, I forgot to buy milk.'\nSpeaker B: 'No worries, we can buy some tomorrow.'\n\nQuestion: What is the main idea of this conversation?",
      options: ["A) Speaker B is angry about milk.", "B) Speaker B accepts Speaker A's apology.", "C) Speaker A refuses to buy milk.", "D) They will make milk at home."],
      correct: 1,
      explanation: "Speaker B's 'No worries' accepts the apology and reschedules the purchase."
    },
    {
      id: "aq_comp_hard",
      skill: "comprehension",
      difficulty: "hard",
      question: "Speaker A: 'It's raining cats and dogs out there.'\nSpeaker B: 'Should we postpone our picnic?'\nSpeaker A: 'Well, unless you want to swim!'\n\nQuestion: What does Speaker A mean?",
      options: ["A) They want to swim in the rain.", "B) They agree to postpone the picnic due to heavy rain.", "C) They want to see cats and dogs.", "D) They should go to the pool instead."],
      correct: 1,
      explanation: "The comment 'unless you want to swim' is a sarcastic way of saying it is too wet for a picnic, agreeing to postpone."
    }
  ]
};

export function getInitialData() {
  const data = JSON.parse(JSON.stringify(initialData));
  data.podcasts = [...data.podcasts, ...JSON.parse(JSON.stringify(newBbcPodcasts))];
  data.transcripts = {
    ...JSON.parse(JSON.stringify(data.transcripts)),
    ...JSON.parse(JSON.stringify(newBbcOfficialTranscripts)),
    ...JSON.parse(JSON.stringify(bbcTranscripts))
  };
  return data;
}
