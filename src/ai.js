// ============================================================
// ai.js — Google Gemini API client + smart fallbacks
// ============================================================

import { CONFIG } from './db.js';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

function reportWarning(...args) {
  if (import.meta.env.DEV) console.warn(...args);
}

export async function callGemini(prompt, context = '') {
  const key = CONFIG.geminiKey || localStorage.getItem('gemini_key');
  if (!key) {
    return null; // Use fallbacks
  }

  const fullPrompt = context
    ? `Context: ${context}\n\n${prompt}`
    : prompt;

  try {
    const res = await fetch(`${GEMINI_URL}?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
        }
      })
    });

    if (!res.ok) throw new Error(`Gemini error: ${res.status}`);
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return text || null;
  } catch (err) {
    reportWarning('Gemini API failed:', err);
    return null;
  }
}

// ==================== COPILOT ====================
export class CopilotAI {
  constructor() {
    this.history = [];
    this.currentPodcast = null;
    this.currentTranscript = null;
  }

  setContext(podcast, transcript) {
    this.currentPodcast = podcast;
    this.currentTranscript = transcript;
    this.history = [];
  }

  getTranscriptContext() {
    if (!this.currentTranscript?.content) return '';
    const text = this.currentTranscript.content
      .map(s => `[${formatSec(s.startMs / 1000)}] ${s.text}`)
      .join('\n');
    return text;
  }

  async chat(userMessage) {
    const podcastInfo = this.currentPodcast
      ? `Podcast: "${this.currentPodcast.title}" (${this.currentPodcast.language}, ${this.currentPodcast.difficulty})\nSpeaker: ${this.currentPodcast.speaker || 'Unknown'}\n`
      : '';

    const transcriptCtx = this.getTranscriptContext();
    const context = podcastInfo + (transcriptCtx ? `\nTranscript excerpt:\n${transcriptCtx}` : '');

    const historyText = this.history.slice(-4).map(m =>
      `${m.role === 'user' ? 'User' : 'Tuto'}: ${m.content}`
    ).join('\n');

    const prompt = `You are Tuto, a friendly and helpful AI study companion for the LinguAlphabet educational podcast app.
You help learners understand content, vocabulary, and concepts from educational podcasts.
Be concise, friendly, encouraging. Use emojis sparingly. Format with markdown when helpful.

${context}

${historyText ? `Previous conversation:\n${historyText}\n` : ''}
User: ${userMessage}

Tuto:`;

    this.history.push({ role: 'user', content: userMessage });

    const response = await callGemini(prompt);
    const reply = response || this.getFallbackResponse(userMessage);

    this.history.push({ role: 'assistant', content: reply });
    return reply;
  }

  async explainConcept(concept) {
    const context = this.getTranscriptContext();
    const prompt = `You are an educational AI. Explain the concept "${concept}" in simple, clear terms.
${context ? `This comes from the podcast: "${this.currentPodcast?.title}"\nRelevant transcript:\n${context}` : ''}
Keep the explanation under 150 words. Use simple language. Add 1-2 real-world examples.`;

    const response = await callGemini(prompt);
    return response || this.getConceptFallback(concept);
  }

  async summarizeSection(transcriptText) {
    const prompt = `Summarize the following podcast transcript in 3-4 key bullet points. Be concise and educational:

"${transcriptText}"

Format as: • Point 1\n• Point 2\n• Point 3`;

    const response = await callGemini(prompt);
    return response || '• This podcast covers key educational concepts\n• Main ideas are explored through examples\n• Practical applications are discussed';
  }

  async generateQuiz(transcript, count = 5) {
    const context = transcript || this.getTranscriptContext();
    if (!context) return this.getFallbackQuiz();

    const prompt = `Based on this educational transcript, create ${count} quiz questions.
Return ONLY valid JSON array, no markdown:
[{"question":"...","options":["A","B","C","D"],"correct":0,"explanation":"..."}]

Transcript: "${context}"`;

    const response = await callGemini(prompt);
    if (response) {
      try {
        // Extract JSON from response
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
      } catch (e) {}
    }
    return this.getFallbackQuiz();
  }

  async generateFlashcards(words) {
    if (!words || words.length === 0) return [];

    const prompt = `Create flashcards for these words: ${words.join(', ')}.
Return ONLY valid JSON array:
[{"word":"...","definition":"...","example":"...","translation":"..."}]`;

    const response = await callGemini(prompt);
    if (response) {
      try {
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
      } catch (e) {}
    }
    return words.map(w => ({
      word: w,
      definition: `Definition of ${w}`,
      example: `Example using ${w}`,
      translation: w
    }));
  }

  async lookupWord(word, context = '') {
    const prompt = `Look up the word "${word}" and provide:
1. Phonetic pronunciation (IPA)
2. Part of speech
3. Clear definition (1-2 sentences)
4. Translations in: Uzbek, Russian, Spanish, German, French
5. One example sentence

Return ONLY valid JSON (no markdown):
{"phonetic":"...","pos":"...","definition":"...","translations":{"Uzbek":"...","Russian":"...","Spanish":"...","German":"...","French":"..."},"example":"..."}`;

    const response = await callGemini(prompt, context);
    if (response) {
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
      } catch (e) {}
    }
    return this.getFallbackWordData(word);
  }

  async translate(text, targetLang) {
    const prompt = `Translate the following text to ${targetLang}. Return ONLY the translation, nothing else:

"${text}"`;
    const response = await callGemini(prompt);
    return response || `[Translation to ${targetLang} unavailable]`;
  }

  // ==================== FALLBACKS ====================
  getFallbackResponse(message) {
    const msg = message.toLowerCase();
    const podcast = this.currentPodcast;
    const title = podcast?.title || 'this podcast';

    if (msg.includes('explain') || msg.includes('what is') || msg.includes('what are')) {
      return `Great question! 🎓 In the context of **${title}**, the key concepts relate to understanding core principles and their applications. I'd recommend pausing at key moments to take notes. Would you like me to break down a specific part?`;
    }
    if (msg.includes('summar') || msg.includes('recap')) {
      return `Here's a quick summary of what we've covered in **${title}**: The episode explores foundational concepts and builds understanding through examples. The speaker highlights practical applications that you can connect to real life. Want me to go deeper into any specific part?`;
    }
    if (msg.includes('quiz') || msg.includes('test')) {
      return `Let's test your knowledge! 🎯\n\nBased on **${title}**, here's a question:\n\n**What is the main theme explored in this episode?**\n\nA) Historical context\nB) Core scientific principles\nC) Practical applications\nD) All of the above\n\nThink about it and let me know your answer!`;
    }
    if (msg.includes('translat')) {
      return `I can help translate content from **${title}**! Please share the specific sentence or phrase you'd like translated, and tell me which language you'd like it in. 🌍`;
    }
    if (msg.includes('vocabulary') || msg.includes('word') || msg.includes('definition')) {
      return `Great for building vocabulary! 📚 Tap any word in the **Transcript** tab to look it up instantly. I'll show you the pronunciation, definition, translations, and examples. You can save words to your Notebook too!`;
    }
    if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey')) {
      return `Hi there! 👋 I'm Tuto, your AI study companion. I'm here to help you get the most out of **${title}**. Ask me to explain concepts, summarize sections, translate content, or quiz you on what you've learned!`;
    }
    return `I'm here to help you learn from **${title}**! 🐢✨ I can:\n• **Explain** concepts from the podcast\n• **Summarize** key points\n• **Translate** content\n• **Quiz** you on what you've learned\n• **Help** with vocabulary\n\nWhat would you like to explore?`;
  }

  getConceptFallback(concept) {
    return `**${concept}** is an important concept in this field of study.\n\nIt refers to a foundational principle that helps us understand how things work in context. Real-world applications include everyday situations where this concept plays a key role.\n\n💡 *Pro tip: Look up related terms in the transcript to deepen your understanding!*`;
  }

  getFallbackQuiz() {
    return [
      {
        question: "What is the primary purpose of educational podcasts?",
        options: ["Entertainment only", "Learning and knowledge sharing", "Music listening", "News updates"],
        correct: 1,
        explanation: "Educational podcasts are designed to share knowledge and facilitate learning on specific topics."
      },
      {
        question: "Which study technique involves reviewing material at increasing intervals?",
        options: ["Cramming", "Spaced repetition", "Passive listening", "Note skipping"],
        correct: 1,
        explanation: "Spaced repetition is a proven technique that helps move information to long-term memory."
      },
      {
        question: "What does active listening involve?",
        options: ["Playing audio in the background", "Engaging with and analyzing content", "Listening while sleeping", "Playing at 3x speed"],
        correct: 1,
        explanation: "Active listening means fully concentrating, understanding, and engaging with what you hear."
      },
      {
        question: "How does vocabulary building improve language skills?",
        options: ["It doesn't help", "It provides more tools for expression and comprehension", "Only through grammar", "Through writing only"],
        correct: 1,
        explanation: "A larger vocabulary enables better communication and deeper understanding of content."
      },
      {
        question: "What is the benefit of reading a transcript while listening?",
        options: ["It slows learning", "It reinforces comprehension through dual encoding", "It is distracting", "No benefit"],
        correct: 1,
        explanation: "Reading while listening activates multiple learning pathways, improving retention."
      }
    ];
  }

  getFallbackWordData(word) {
    const words = {
      'empathy': {
        phonetic: '/ˈem.pə.θi/',
        pos: 'Noun',
        definition: 'The ability to understand and share the feelings of another person. The capacity to place oneself in another\'s position.',
        translations: { Uzbek: 'Empatiya', Russian: 'Эмпатия', Spanish: 'Empatía', German: 'Empathie', French: 'Empathie' },
        example: 'She showed great empathy towards her friend who was going through a difficult time.'
      },
      'quantum': {
        phonetic: '/ˈkwɒn.təm/',
        pos: 'Noun/Adjective',
        definition: 'The smallest discrete unit of a phenomenon, or relating to quantum mechanics.',
        translations: { Uzbek: 'Kvant', Russian: 'Квант', Spanish: 'Cuántico', German: 'Quanten-', French: 'Quantique' },
        example: 'Quantum mechanics describes the behavior of particles at the atomic scale.'
      }
    };

    return words[word.toLowerCase()] || {
      phonetic: `/${word}/`,
      pos: 'Unknown',
      definition: `Definition for "${word}". Configure your Gemini API key in Settings for detailed definitions.`,
      translations: { Uzbek: word, Russian: word, Spanish: word, German: word, French: word },
      example: `This word "${word}" appears in the context of this educational content.`
    };
  }
}

export const copilot = new CopilotAI();

// ==================== DICTIONARY ====================
export async function lookupWordFree(word) {
  // Try Free Dictionary API first (no key needed)
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (res.ok) {
      const data = await res.json();
      const entry = data[0];
      const meaning = entry.meanings?.[0];
      const definition = meaning?.definitions?.[0];
      return {
        phonetic: entry.phonetics?.find(p => p.text)?.text || `/${word}/`,
        pos: meaning?.partOfSpeech || 'Unknown',
        definition: definition?.definition || 'No definition found',
        example: definition?.example || '',
        audio: entry.phonetics?.find(p => p.audio)?.audio || '',
        synonyms: (meaning?.synonyms || []).slice(0, 5),
        antonyms: (meaning?.antonyms || []).slice(0, 3),
      };
    }
  } catch (e) {}

  return null;
}

export async function lookupWord(word, context = '') {
  // Try free API first
  const freeData = await lookupWordFree(word);

  // Try Gemini for translations
  const geminiData = await copilot.lookupWord(word, context);

  if (freeData) {
    return {
      ...freeData,
      translations: geminiData?.translations || {},
    };
  }

  return geminiData || copilot.getFallbackWordData(word);
}

// ==================== UTILS ====================
function formatSec(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
