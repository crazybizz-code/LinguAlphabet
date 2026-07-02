import { validatePodcastData, fuzzyMatch, getDaysAgo, formatTime } from './utils.js';

export class AgentCommunicationLog {
  constructor() {
    this.logs = [];
    this.listeners = [];
  }

  log(agentName, action, input, output) {
    const entry = {
      timestamp: new Date().toISOString(),
      agent: agentName,
      action,
      input: JSON.parse(JSON.stringify(input)),
      output: JSON.parse(JSON.stringify(output)),
      status: output.status || 'success'
    };
    this.logs.push(entry);
    
    if (this.logs.length > 100) {
      this.logs.shift();
    }

    this.listeners.forEach(cb => cb(entry));
  }

  onChange(callback) {
    this.listeners.push(callback);
  }

  getLogs(limit = 50) {
    return this.logs.slice(-limit);
  }

  clear() {
    this.logs = [];
  }
}

export const agentLog = new AgentCommunicationLog();

// ==========================================
// AGENT 1: Podcast Data Manager
// ==========================================
export class Agent1_DataManager {
  constructor(database) {
    this.database = database;
  }

  addPodcast(podcastData) {
    const validation = validatePodcastData(podcastData);
    if (!validation.valid) {
      const output = { status: "error", errors: validation.errors };
      agentLog.log("Agent1_DataManager", "add_podcast (failed validation)", podcastData, output);
      return output;
    }

    const podcastId = "pod_" + String(this.database.podcasts.length + 1).padStart(3, '0');
    const newPodcast = {
      podcastId,
      title: podcastData.title,
      description: podcastData.description,
      language: podcastData.language,
      category: podcastData.category,
      difficulty: podcastData.difficulty,
      duration: Number(podcastData.duration),
      coverImage: podcastData.coverImage || "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=400&q=80",
      audioUrl: podcastData.audioUrl || "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
      transcriptId: "trans_" + String(this.database.podcasts.length + 1).padStart(3, '0'),
      createdAt: new Date().toISOString(),
      views: 0,
      averageRating: 0.0,
      speaker: podcastData.speaker || "Guest Scholar"
    };

    this.database.podcasts.push(newPodcast);

    const audioProcessor = new Agent2_AudioProcessor(this.database);
    audioProcessor.transcribeAudio(newPodcast.audioUrl, newPodcast.language, newPodcast.podcastId, newPodcast.transcriptId);

    const output = {
      status: "success",
      action: "add_podcast",
      data: newPodcast
    };
    agentLog.log("Agent1_DataManager", "add_podcast", podcastData, output);
    return output;
  }

  filterPodcasts(filters) {
    let results = [...this.database.podcasts];

    if (filters.language && filters.language.length > 0) {
      results = results.filter(p => filters.language.includes(p.language));
    }
    if (filters.category && filters.category.length > 0) {
      results = results.filter(p => filters.category.includes(p.category));
    }
    if (filters.difficulty && filters.difficulty.length > 0) {
      results = results.filter(p => filters.difficulty.includes(p.difficulty));
    }
    if (filters.duration) {
      const min = filters.duration.min || 0;
      const max = filters.duration.max || 14400;
      results = results.filter(p => p.duration >= min && p.duration <= max);
    }

    const output = {
      status: "success",
      action: "filter_podcasts",
      data: {
        totalResults: results.length,
        podcasts: results
      }
    };
    agentLog.log("Agent1_DataManager", "filter_podcasts", filters, output);
    return output;
  }

  saveQuote(userId, podcastId, quoteText, timecode, tags = []) {
    const quoteId = "quote_" + String(this.database.notebook.length + 1).padStart(3, '0');
    const newQuote = {
      quoteId,
      userId,
      podcastId,
      quote: quoteText,
      timecode,
      addedAt: new Date().toISOString(),
      tags
    };

    this.database.notebook.push(newQuote);

    const output = {
      status: "success",
      action: "save_quote",
      data: newQuote
    };
    agentLog.log("Agent1_DataManager", "save_quote", { userId, podcastId, quoteText }, output);
    return output;
  }
}

// ==========================================
// AGENT 2: Audio Processing & Transcript
// ==========================================
export class Agent2_AudioProcessor {
  constructor(database) {
    this.database = database;
  }

  transcribeAudio(audioUrl, language, podcastId, transcriptId) {
    const defaultText = `This is a newly transcribed lecture on academics and research in ${language}. Let's examine the scientific methods and formulas. [PAUSE 2s] However, some results remain [INAUDIBLE] due to sensor noise.`;
    const words = defaultText.split(/\s+/);
    
    const wordTimestamps = [];
    let currentMs = 0;
    
    words.forEach((word) => {
      let isPause = word.includes("[PAUSE");
      let increment = isPause ? 2000 : Math.floor(Math.random() * 400) + 200;
      
      wordTimestamps.push({
        word: word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,""),
        timeMs: currentMs
      });
      currentMs += increment;
    });

    const newTranscript = {
      transcriptId,
      podcastId,
      language,
      duration: currentMs,
      content: [
        {
          timecode: "00:00:00",
          timecodeMs: 0,
          text: defaultText,
          speaker: "Guest Speaker",
          wordTimestamps
        }
      ]
    };

    this.database.transcripts[transcriptId] = newTranscript;

    const output = {
      status: "success",
      podcastId,
      language,
      duration: currentMs,
      transcriptStatus: "completed",
      transcript: newTranscript.content,
      metadata: {
        totalWords: words.length,
        totalSentences: defaultText.split(/[.!?]/).length - 1,
        confidence: 0.94
      }
    };
    agentLog.log("Agent2_AudioProcessor", "transcribe", { audioUrl, language, podcastId }, output);
    return output;
  }

  autoDetectLanguage(audioUrl) {
    const output = {
      status: "success",
      audioUrl,
      detectedLanguage: "English",
      confidence: 0.98
    };
    agentLog.log("Agent2_AudioProcessor", "auto_detect_language", { audioUrl }, output);
    return "English";
  }

  parseTranscript(rawText) {
    const speakers = [];
    const speakerRegex = /(Host:|Guest:|Speaker \d+:)/g;
    let match;
    while ((match = speakerRegex.exec(rawText)) !== null) {
      speakers.push(match[0]);
    }

    const output = {
      status: "success",
      parsedSpeakers: [...new Set(speakers)],
      hasPauses: rawText.includes("[PAUSE"),
      hasInaudibles: rawText.includes("[INAUDIBLE]")
    };
    agentLog.log("Agent2_AudioProcessor", "parse_transcript", { rawText }, output);
    return output;
  }
}

// ==========================================
// AGENT 3: NLP & Contextual Dictionary
// ==========================================
export class Agent3_NLPDictionary {
  constructor(database) {
    this.database = database;
  }

  translateWord(word, targetLanguage, context = {}) {
    const cleanWord = word.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g,"").trim();
    const dictEntry = this.database.dictionary.find(entry => 
      entry.word.toLowerCase() === cleanWord
    );

    if (dictEntry) {
      const translation = dictEntry.translations[targetLanguage] || dictEntry.translations["English"] || cleanWord;
      const output = {
        status: "success",
        word: cleanWord,
        language: dictEntry.language,
        targetLanguage,
        translation,
        definition: dictEntry.definition,
        category: dictEntry.category,
        pronunciation: dictEntry.pronunciation,
        exampleSentence: dictEntry.exampleSentence,
        synonyms: dictEntry.synonyms || [],
        antonyms: dictEntry.antonyms || [],
        difficulty: dictEntry.difficulty,
        context: {
          originalSentence: context.sentence || "",
          podcastId: context.podcastId || ""
        }
      };
      agentLog.log("Agent3_NLPDictionary", "translate_word", { word, targetLanguage, context }, output);
      return output;
    }

    const simulatedTranslations = {
      "electron": { "Uzbek": "elektron", "Russian": "электрон", "Spanish": "electrón", "German": "Elektron", "French": "électron" },
      "behavior": { "Uzbek": "hulq-atvor", "Russian": "поведение", "Spanish": "comportamiento", "German": "Verhalten", "French": "comportement" },
      "velocity": { "Uzbek": "tezlik", "Russian": "скорость", "Spanish": "velocidad", "German": "Geschwindigkeit", "French": "vitesse" },
      "heisenberg": { "Uzbek": "Geyzenberg", "Russian": "Гейзенберг", "Spanish": "Heisenberg", "German": "Heisenberg", "French": "Heisenberg" },
      "clorofila": { "Uzbek": "xlorofill", "Russian": "хлорофилл", "Spanish": "clorofila", "German": "Chlorophyll", "French": "chlorophylle" },
      "astronomiya": { "English": "astronomy", "Russian": "астрономия", "Spanish": "astronomía", "German": "Astronomie" },
      "künstliche": { "English": "artificial", "Uzbek": "sun'iy", "Russian": "искусственный", "Spanish": "artificial" },
      "синапсах": { "English": "synapses", "Uzbek": "sinapslar", "Spanish": "sinapsis" }
    };

    const termTrans = simulatedTranslations[cleanWord] || { "Uzbek": `tarjima (${cleanWord})`, "English": cleanWord };
    const translation = termTrans[targetLanguage] || termTrans["English"] || cleanWord;
    
    const output = {
      status: "success",
      word: cleanWord,
      language: "Unknown",
      targetLanguage,
      translation,
      definition: `Academic term referencing concept in ${context.category || 'General Science'}.`,
      category: context.category || "General",
      pronunciation: `/${cleanWord}/`,
      exampleSentence: `We observed the ${cleanWord} in our laboratory experiment.`,
      synonyms: [`concept`, `term`],
      antonyms: [],
      difficulty: "Intermediate",
      context: {
        originalSentence: context.sentence || "",
        podcastId: context.podcastId || ""
      }
    };
    agentLog.log("Agent3_NLPDictionary", "translate_word (simulated fallback)", { word, targetLanguage, context }, output);
    return output;
  }

  getContextualDefinition(word, category) {
    const cleanWord = word.toLowerCase().trim();
    const dictEntry = this.database.dictionary.find(entry => entry.word.toLowerCase() === cleanWord);
    
    let def = "General terms definition.";
    if (dictEntry) {
      def = dictEntry.definition;
    }

    const output = {
      status: "success",
      word,
      category,
      definition: def
    };
    agentLog.log("Agent3_NLPDictionary", "contextual_definition", { word, category }, output);
    return def;
  }

  findSynonymsAntonyms(word) {
    const entry = this.database.dictionary.find(e => e.word.toLowerCase() === word.toLowerCase());
    return {
      synonyms: entry ? entry.synonyms : [],
      antonyms: entry ? entry.antonyms : []
    };
  }
}

// ==========================================
// AGENT 4: User Progress & Gamification
// ==========================================
export class Agent4_Gamification {
  constructor(database) {
    this.database = database;
  }

  earnXP(userId, action, value) {
    const user = this.database.users.find(u => u.userId === userId);
    if (!user) {
      return { status: "error", errors: ["User not found"] };
    }

    const oldXP = user.totalXP;
    user.totalXP += value;

    let leveledUp = false;
    while (user.totalXP >= user.nextLevelXP) {
      user.level += 1;
      user.nextLevelXP = user.level * 500;
      leveledUp = true;
    }

    const achievementsUnlocked = [];
    this.database.achievements.forEach((badge) => {
      const alreadyUnlocked = this.database.userAchievements && 
        this.database.userAchievements.some(ua => ua.userId === userId && ua.badgeId === badge.badgeId);
      
      if (!alreadyUnlocked) {
        let conditionMet = false;
        
        if (badge.badgeId === 'badge_first_podcast' && action === 'complete_podcast') {
          conditionMet = true;
        } else if (badge.badgeId === 'badge_first_quiz' && action === 'complete_quiz') {
          conditionMet = true;
        } else if (badge.badgeId === 'badge_perfect_score' && action === 'complete_quiz' && value >= 100) {
          conditionMet = true;
        } else if (badge.badgeId === 'badge_streak_7' && user.streak >= 7) {
          conditionMet = true;
        } else if (badge.badgeId === 'badge_words_100') {
          const dictWords = this.database.notebook.filter(q => q.userId === userId).length;
          if (dictWords >= 3) { // Lowered for demonstration
            conditionMet = true;
          }
        }

        if (conditionMet) {
          if (!this.database.userAchievements) {
            this.database.userAchievements = [];
          }
          this.database.userAchievements.push({
            achievementId: "ach_" + String(this.database.userAchievements.length + 1).padStart(3, '0'),
            userId,
            badgeId: badge.badgeId,
            unlockedAt: new Date().toISOString()
          });
          
          user.totalXP += badge.xpReward;
          achievementsUnlocked.push(badge);
        }
      }
    });

    const lbEntry = this.database.leaderboard.find(l => l.username === user.username);
    if (lbEntry) {
      lbEntry.xp = user.totalXP;
    } else {
      this.database.leaderboard.push({
        rank: this.database.leaderboard.length + 1,
        username: user.username,
        xp: user.totalXP
      });
    }

    this.database.leaderboard.sort((a, b) => b.xp - a.xp);
    this.database.leaderboard.forEach((item, index) => {
      item.rank = index + 1;
    });

    const output = {
      status: "success",
      action: "earn_xp",
      profile: {
        username: user.username,
        level: user.level,
        totalXP: user.totalXP,
        nextLevelXP: user.nextLevelXP,
        streak: user.streak,
        streakLastUpdate: user.streakLastUpdate
      },
      xpGained: value,
      leveledUp,
      achievements: this.database.userAchievements
        .filter(ua => ua.userId === userId)
        .map(ua => {
          const badge = this.database.achievements.find(b => b.badgeId === ua.badgeId);
          return {
            badgeId: ua.badgeId,
            name: badge.name,
            description: badge.description,
            icon: badge.icon,
            unlockedAt: ua.unlockedAt
          };
        }),
      newAchievements: achievementsUnlocked,
      errors: []
    };

    agentLog.log("Agent4_Gamification", "earn_xp", { userId, action, value }, output);
    return output;
  }

  updateStreak(userId) {
    const user = this.database.users.find(u => u.userId === userId);
    if (!user) return { status: "error", errors: ["User not found"] };

    const now = new Date();
    const lastUpdate = user.streakLastUpdate ? new Date(user.streakLastUpdate) : null;

    if (!lastUpdate) {
      user.streak = 1;
      user.streakLastUpdate = now.toISOString();
    } else {
      const diffMs = now - lastUpdate;
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      if (diffDays < 1.0) {
        // Updated today
      } else if (diffDays >= 1.0 && diffDays < 2.0) {
        user.streak += 1;
        user.streakLastUpdate = now.toISOString();
        this.earnXP(userId, "streak_increment", 20);
      } else {
        user.streak = 1;
        user.streakLastUpdate = now.toISOString();
      }
    }

    user.lastLogin = now.toISOString();

    const output = {
      status: "success",
      action: "update_streak",
      profile: {
        username: user.username,
        level: user.level,
        totalXP: user.totalXP,
        streak: user.streak,
        streakLastUpdate: user.streakLastUpdate
      }
    };
    agentLog.log("Agent4_Gamification", "update_streak", { userId }, output);
    return output;
  }

  unlockBadge(userId, badgeId) {
    const alreadyUnlocked = this.database.userAchievements && 
      this.database.userAchievements.some(ua => ua.userId === userId && ua.badgeId === badgeId);
    
    if (alreadyUnlocked) return { status: "success", info: "Badge already unlocked" };

    if (!this.database.userAchievements) {
      this.database.userAchievements = [];
    }

    this.database.userAchievements.push({
      achievementId: "ach_" + String(this.database.userAchievements.length + 1).padStart(3, '0'),
      userId,
      badgeId,
      unlockedAt: new Date().toISOString()
    });

    const badge = this.database.achievements.find(b => b.badgeId === badgeId);
    if (badge) {
      this.earnXP(userId, "unlock_badge", badge.xpReward);
    }

    const output = {
      status: "success",
      action: "unlock_badge",
      badgeId
    };
    agentLog.log("Agent4_Gamification", "unlock_badge", { userId, badgeId }, output);
    return output;
  }

  getLeaderboard(topN = 100) {
    return this.database.leaderboard.slice(0, topN);
  }
}

// ==========================================
// AGENT 5: Search & Filter Intelligence
// ==========================================
export class Agent5_SearchFilter {
  constructor(database) {
    this.database = database;
  }

  search(query, filters = {}) {
    const q = query ? query.toLowerCase().trim() : "";
    const results = [];

    this.database.podcasts.forEach((podcast) => {
      if (filters.language && filters.language.length > 0 && !filters.language.includes(podcast.language)) {
        return;
      }
      if (filters.category && filters.category.length > 0 && !filters.category.includes(podcast.category)) {
        return;
      }
      if (filters.difficulty && filters.difficulty.length > 0 && !filters.difficulty.includes(podcast.difficulty)) {
        return;
      }
      if (filters.duration) {
        const min = filters.duration.min || 0;
        const max = filters.duration.max || 14400;
        if (podcast.duration < min || podcast.duration > max) {
          return;
        }
      }

      let titleMatch = 0;
      let descMatch = 0;
      let categoryMatch = 0;
      let recencyScore = 0;
      const matchedFields = [];

      if (q) {
        if (fuzzyMatch(q, podcast.title, 2)) {
          titleMatch = 1;
          matchedFields.push("Title");
        }
        if (fuzzyMatch(q, podcast.description, 2)) {
          descMatch = 1;
          matchedFields.push("Description");
        }
        if (fuzzyMatch(q, podcast.category, 1)) {
          categoryMatch = 1;
          matchedFields.push("Category");
        }
        if (fuzzyMatch(q, podcast.speaker, 1)) {
          matchedFields.push("Speaker");
        }
      } else {
        titleMatch = 0.5;
        descMatch = 0.5;
        categoryMatch = 0.5;
      }

      const daysAgo = getDaysAgo(podcast.createdAt);
      recencyScore = 1 / (daysAgo + 1);

      const relevanceScore = (titleMatch * 0.4) + (descMatch * 0.3) + (categoryMatch * 0.2) + (recencyScore * 0.1);

      if (!q || relevanceScore > 0.05) {
        results.push({
          podcastId: podcast.podcastId,
          title: podcast.title,
          description: podcast.description,
          language: podcast.language,
          category: podcast.category,
          difficulty: podcast.difficulty,
          duration: podcast.duration,
          coverImage: podcast.coverImage,
          audioUrl: podcast.audioUrl,
          speaker: podcast.speaker,
          createdAt: podcast.createdAt,
          relevanceScore: parseFloat(relevanceScore.toFixed(3)),
          matchedFields,
          rating: podcast.averageRating
        });
      }
    });

    const sortBy = filters.sortBy || "relevance";
    if (sortBy === "relevance" && q) {
      results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    } else if (sortBy === "rating") {
      results.sort((a, b) => b.rating - a.rating);
    } else if (sortBy === "duration") {
      results.sort((a, b) => a.duration - b.duration);
    } else {
      results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    const recommendations = this.getRecommendations(filters.userId || "user_001");

    const output = {
      status: "success",
      searchQuery: query,
      filters,
      totalResults: results.length,
      results,
      recommendations
    };
    agentLog.log("Agent5_SearchFilter", "search", { query, filters }, output);
    return output;
  }

  getRecommendations(userId) {
    const user = this.database.users.find(u => u.userId === userId);
    if (!user) return [];

    const recs = [];
    const listenedPodcastIds = this.database.userProgress
      ? this.database.userProgress.filter(up => up.userId === userId).map(up => up.podcastId)
      : [];

    this.database.podcasts.forEach((podcast) => {
      if (listenedPodcastIds.includes(podcast.podcastId)) return;

      let historyScore = 0;
      if (user.preferredCategories.includes(podcast.category)) {
        historyScore += 0.5;
      }
      if (user.preferredLanguages.includes(podcast.language)) {
        historyScore += 0.5;
      }

      const maxViews = Math.max(...this.database.podcasts.map(p => p.views), 1);
      const popularityScore = podcast.views / maxViews;

      const ratingScore = podcast.averageRating / 5.0;

      const daysAgo = getDaysAgo(podcast.createdAt);
      const newnessScore = 1 / (daysAgo + 1);

      const score = (historyScore * 0.4) + (popularityScore * 0.3) + (ratingScore * 0.2) + (newnessScore * 0.1);

      let reason = "Recommended based on your academic interests.";
      if (historyScore > 0.5) {
        reason = `You like ${podcast.category} podcasts.`;
      } else if (popularityScore > 0.7) {
        reason = "Highly popular among other scholars.";
      } else if (newnessScore > 0.5) {
        reason = "New lecture released recently.";
      }

      recs.push({
        podcastId: podcast.podcastId,
        title: podcast.title,
        reason,
        score: parseFloat(score.toFixed(3)),
        language: podcast.language,
        category: podcast.category,
        coverImage: podcast.coverImage,
        speaker: podcast.speaker
      });
    });

    recs.sort((a, b) => b.score - a.score);
    return recs.slice(0, 3);
  }
}

// ==========================================
// AGENT 6: AI Study Copilot (Flagship)
// ==========================================
export class Agent6_StudyCopilot {
  constructor(database) {
    this.database = database;
  }

  askCopilot(podcastId, question, currentTimestampMs, activeHighlight = "") {
    const q = question.toLowerCase().trim();
    const podcast = this.database.podcasts.find(p => p.podcastId === podcastId);
    
    // Base Response Structure
    let responseText = "";
    let matchedTimestamp = 8000; // default to 8s
    let followUpChips = ["Explain deeper", "Give another example", "Make easier"];

    // Automatically resolve "what does this mean" using activeHighlight text
    if ((q.includes("what does this mean") || q.includes("explain this") || q.includes("tushuntir")) && activeHighlight) {
      const translationAgent = new Agent3_NLPDictionary(this.database);
      const transObj = translationAgent.translateWord(activeHighlight, "Uzbek", { category: podcast.category });
      
      responseText = `The term **"${activeHighlight}"** in the context of this **${podcast.category}** lecture translates to **"${transObj.translation}"**.\n\n*Definition:* ${transObj.definition}\n\n*Lecture Context:* "${transObj.context.originalSentence || 'This sentence was highlighted in the audio player.'}"`;
      matchedTimestamp = currentTimestampMs;
      followUpChips = ["Translate this", "Why is this important?", "Create quiz"];
    }
    // Specific Keyword Responses
    else if (q.includes("duality") || q.includes("wave") || q.includes("particle")) {
      responseText = `**Wave-Particle Duality** is explained by Dr. Wilson around [00:08]. He notes that electrons act both as waves of probability and particles of matter. \n\n*Example:* An electron passing through double slits creates an interference pattern (wave) but hits the sensor screen as a single spot (particle).\n\n▶ Jump to 00:08`;
      matchedTimestamp = 8000;
      followUpChips = ["What is Uncertainty?", "Generate analogies", "Explain deeper"];
    } 
    else if (q.includes("uncertainty") || q.includes("heisenberg") || q.includes("velocity")) {
      responseText = `**Heisenberg's Uncertainty Principle** is introduced at [00:15]. It establishes that the exact position ($x$) and momentum ($p$) of an electron cannot be simultaneously measured.\n\n$$\\Delta x \\cdot \\Delta p \\ge \\frac{h}{4\\pi}$$\n\n*Analogy:* Think of a balloon in a dark room. To find its location, you must touch it, but touching it pushes it away, altering its speed.\n\n▶ Jump to 00:15`;
      matchedTimestamp = 15000;
      followUpChips = ["Show formula details", "Predict exam questions", "Make easier"];
    }
    else if (q.includes("fotosíntesis") || q.includes("clorofila") || q.includes("luz")) {
      responseText = `La **Fotosíntesis** es explicada por la Dra. Gomez. La clorofila capta fotones de luz y descompone la molécula de agua para obtener electrones a partir del segundo [00:07].\n\n$$\\text{6CO}_2 + \\text{6H}_2\\text{O} + \\text{Luz} \\rightarrow \\text{C}_6\\text{H}_{12}\\text{O}_6 + \\text{6O}_2$$\n\n▶ Jump to 00:07`;
      matchedTimestamp = 7000;
      followUpChips = ["¿Qué es Ciclo de Calvin?", "Explicar Fase Luminosa", "Generar examen"];
    }
    else if (q.includes("temur") || q.includes("samarqand") || q.includes("renessans")) {
      responseText = `Amir Temur davrida ilm-fan yuksalishi va me'morchilik astronomik yutuqlarga yo'l ochgan. Professor Rahimov buni [00:08] timestampida tushuntiradi.\n\n*Ahamiyati:* Temuriylar renessansi natijasida keyinchalik buyuk astronom Ulug'bek Samarqandda dunyodagi eng yirik rasadxonani barpo etgan.\n\n▶ Jump to 00:08`;
      matchedTimestamp = 8000;
      followUpChips = ["Ulug'bek haqida", "Tuzuklar nima?", "Test yaratish"];
    }
    else if (q.includes("summarize") || q.includes("summary") || q.includes("konspekt")) {
      const sum = this.database.summaries[podcastId] || { "30s": "Lecture summary" };
      responseText = `Mana bu ma'ruzaning **3 daqiqalik qisqacha mazmuni**:\n\n${sum["3m"]}\n\n*Asosiy xulosalar:*\n${sum.takeaways.map(t => `- ${t}`).join('\n')}`;
      matchedTimestamp = 0;
      followUpChips = ["Exam tips", "Key formulas", "Ask me questions"];
    }
    else if (q.includes("quiz") || q.includes("test")) {
      responseText = `Sure! I have prepared a quiz for this lecture. Switch to the **Study Tools** tab above to start the interactive quiz panel, or answer this question here: \n\n*Define Wave-Particle Duality in 1 sentence.*`;
      matchedTimestamp = 0;
      followUpChips = ["Start Quiz", "Give flashcards", "Explain wave-particle duality"];
    }
    else {
      // General Fallback Chat response using transcript sentences
      const trans = this.database.transcripts[podcast.transcriptId];
      const matchSentence = trans.content.find(s => 
        s.text.toLowerCase().includes(q)
      ) || trans.content[0];
      
      const timecode = matchSentence ? matchSentence.timecode : "00:00:00";
      const timeMs = matchSentence ? matchSentence.timecodeMs : 0;
      
      responseText = `Regarding **"${question}"** in the context of this lecture, the professor notes: \n\n> "${matchSentence.text}" [${timecode}]\n\nHow can I help you explore this concept deeper?\n\n▶ Jump to ${timecode}`;
      matchedTimestamp = timeMs;
    }

    const output = {
      status: "success",
      response: responseText,
      timestamp: formatTime(matchedTimestamp / 1000),
      timecodeMs: matchedTimestamp,
      followUpChips
    };

    agentLog.log("Agent6_StudyCopilot", "ask_copilot", { podcastId, question, currentTimestampMs }, output);
    return output;
  }

  getSummary(podcastId, type = "30s") {
    const sum = this.database.summaries[podcastId] || { "30s": "No summary available." };
    const output = {
      status: "success",
      podcastId,
      type,
      summary: sum[type] || sum["30s"],
      takeaways: sum.takeaways || [],
      formulas: sum.formulas || [],
      definitions: sum.definitions || [],
      examTips: sum.examTips || "",
      mistakes: sum.mistakes || ""
    };
    agentLog.log("Agent6_StudyCopilot", "get_summary", { podcastId, type }, output);
    return output;
  }

  getFlashcards(podcastId) {
    const fc = this.database.flashcards[podcastId] || [];
    const output = {
      status: "success",
      podcastId,
      totalCards: fc.length,
      flashcards: fc
    };
    agentLog.log("Agent6_StudyCopilot", "get_flashcards", { podcastId }, output);
    return fc;
  }

  getQuiz(podcastId) {
    const quiz = this.database.quizzes[podcastId] || [];
    const output = {
      status: "success",
      podcastId,
      totalQuestions: quiz.length,
      quiz
    };
    agentLog.log("Agent6_StudyCopilot", "get_quiz", { podcastId }, output);
    return quiz;
  }

  getTutoQuote() {
    const quotes = this.database.tutoQuotes;
    const quote = quotes[Math.floor(Math.random() * quotes.length)];
    return quote;
  }
}
