// ============================================================
// db.js — Supabase + IndexedDB persistence layer
// ============================================================
import { getInitialData } from './data.js';

// ==================== CONFIG ====================
export const CONFIG = {
  supabaseUrl: localStorage.getItem('sb_url') || import.meta.env.VITE_SUPABASE_URL || '',
  supabaseKey: localStorage.getItem('sb_key') || import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  geminiKey: localStorage.getItem('gemini_key') || import.meta.env.VITE_GEMINI_API_KEY || '',
};

export function updateConfig(key, value) {
  CONFIG[key] = value;
  if (key === 'supabaseUrl') localStorage.setItem('sb_url', value);
  if (key === 'supabaseKey') localStorage.setItem('sb_key', value);
  if (key === 'geminiKey') localStorage.setItem('gemini_key', value);
}

function reportError(...args) {
  if (import.meta.env.DEV) console.error(...args);
}

// ==================== SUPABASE CLIENT ====================
class SupabaseClient {
  constructor() {
    this.isReady = false;
    this.session = null;
    this.listeners = [];
  }

  get url() { return CONFIG.supabaseUrl; }
  get key() { return CONFIG.supabaseKey; }

  async init() {
    if (!this.url || !this.key) return false;
    // Try to restore session (Remember Me: localStorage; session-only: sessionStorage)
    const stored = this._loadPersistedSession();
    if (stored) {
      try {
        this.session = JSON.parse(stored);
        this.isReady = true;
        return true;
      } catch {}
    }
    this.isReady = !!this.url;
    return this.isReady;
  }

  // ---- Session persistence (Remember Me aware) ----
  _persistSession(data, remember = true) {
    const payload = JSON.stringify(data);
    if (remember) {
      localStorage.setItem('sb_session', payload);
      sessionStorage.removeItem('sb_session');
    } else {
      sessionStorage.setItem('sb_session', payload);
      localStorage.removeItem('sb_session');
    }
  }

  _loadPersistedSession() {
    return localStorage.getItem('sb_session') || sessionStorage.getItem('sb_session');
  }

  _clearPersistedSession() {
    localStorage.removeItem('sb_session');
    sessionStorage.removeItem('sb_session');
  }

  // Validates the current access token against Supabase (used by the Splash
  // screen's cold-start session check). Clears a dead/expired session so the
  // app falls back to the Welcome screen instead of a broken "logged in" state.
  async validateSession() {
    if (!this.session?.access_token) return false;
    try {
      const user = await this.request('/auth/v1/user');
      if (user && !user.error) {
        this.session.user = user;
        return true;
      }
      throw new Error('Invalid session');
    } catch {
      this.session = null;
      this._clearPersistedSession();
      return false;
    }
  }

  headers(extra = {}) {
    const h = {
      'Content-Type': 'application/json',
      'apikey': this.key,
      ...extra
    };
    if (this.session?.access_token) {
      h['Authorization'] = `Bearer ${this.session.access_token}`;
    } else {
      h['Authorization'] = `Bearer ${this.key}`;
    }
    return h;
  }

  async request(path, options = {}) {
    if (!this.url) throw new Error('Supabase not configured');
    const res = await fetch(`${this.url}${path}`, {
      headers: this.headers(),
      ...options,
    });
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!res.ok) {
      const message = typeof data === 'object'
        ? (data.message || data.msg || data.error_description || data.error || data.details)
        : data;
      throw new Error(message || 'Request failed');
    }
    return data;
  }

  // ---- Auth ----
  async signUp(email, password, username) {
    const data = await this.request('/auth/v1/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, data: { username } })
    });
    this.session = data;
    this._persistSession(data, true);
    return data;
  }

  async signIn(email, password, remember = true) {
    const data = await this.request('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    this.session = data;
    this._persistSession(data, remember);
    return data;
  }

  async signOut() {
    if (this.session?.access_token) {
      await this.request('/auth/v1/logout', { method: 'POST' }).catch(() => {});
    }
    this.session = null;
    this._clearPersistedSession();
  }

  async resetPassword(email) {
    return this.request('/auth/v1/recover', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  }

  get currentUser() {
    return this.session?.user || null;
  }

  // ---- Google OAuth ----
  // Checks whether the Google provider is actually enabled on this Supabase
  // project before navigating away, so a misconfigured backend produces a
  // friendly in-app message instead of a broken redirect.
  async getGoogleOAuthAvailability() {
    if (!this.url || !this.key) {
      return { available: false, reason: 'Sign-in is not configured yet. Please try again later.' };
    }

    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const authorizeUrl = `${this.url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`;

    try {
      const res = await fetch(authorizeUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: { apikey: this.key }
      });

      // GoTrue redirects (opaque under `redirect: 'manual'`) to Google when the
      // provider is enabled. A normal JSON response means it rejected the
      // request before ever redirecting (provider disabled/misconfigured).
      if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
        return { available: true, url: authorizeUrl };
      }

      let reason = 'Google Sign-In isn’t available right now. Please use email instead.';
      try {
        const body = await res.json();
        if (body?.msg || body?.message || body?.error_description) {
          reason = body.msg || body.message || body.error_description;
        }
      } catch {}
      return { available: false, reason };
    } catch {
      return { available: false, reason: 'Could not reach the sign-in service. Check your connection and try again.' };
    }
  }

  async signInWithGoogle() {
    const check = await this.getGoogleOAuthAvailability();
    if (!check.available) {
      throw new Error(check.reason);
    }
    window.location.assign(check.url);
  }

  // Called on boot to consume the #access_token=...&refresh_token=... fragment
  // Supabase appends when it redirects back from a successful OAuth flow.
  async handleOAuthCallback() {
    if (!window.location.hash || !window.location.hash.includes('access_token')) return null;

    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get('access_token');
    if (!accessToken) return null;

    const sessionData = {
      access_token: accessToken,
      refresh_token: params.get('refresh_token') || null,
      expires_in: params.get('expires_in') ? Number(params.get('expires_in')) : null,
      token_type: params.get('token_type') || 'bearer'
    };
    this.session = sessionData;

    const user = await this.request('/auth/v1/user').catch(() => null);
    if (user) this.session.user = user;
    this._persistSession(this.session, true);

    history.replaceState(null, '', window.location.pathname + window.location.search);
    return this.session;
  }

  // ---- Database ----
  async from(table) {
    return new QueryBuilder(this, table);
  }

  async upsertProfile(profile) {
    return this.request(`/rest/v1/profiles?on_conflict=user_id`, {
      method: 'POST',
      headers: { ...this.headers(), 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify(profile)
    });
  }

  async getProfile(userId) {
    const data = await this.request(`/rest/v1/profiles?user_id=eq.${userId}&select=*`);
    return Array.isArray(data) ? data[0] : null;
  }

  async upsertProgress(progress) {
    return this.request('/rest/v1/progress?on_conflict=user_id,podcast_id', {
      method: 'POST',
      headers: { ...this.headers(), 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify(progress)
    });
  }

  async getProgress(userId) {
    return this.request(`/rest/v1/progress?user_id=eq.${userId}&select=*`);
  }

  async upsertNote(note) {
    return this.request('/rest/v1/notes?on_conflict=id', {
      method: 'POST',
      headers: { ...this.headers(), 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(note)
    });
  }

  async getNotes(userId) {
    return this.request(`/rest/v1/notes?user_id=eq.${userId}&order=created_at.desc&select=*`);
  }

  async deleteNote(id) {
    return this.request(`/rest/v1/notes?id=eq.${id}`, { method: 'DELETE' });
  }

  async upsertBookmark(bookmark) {
    return this.request('/rest/v1/bookmarks?on_conflict=id', {
      method: 'POST',
      headers: { ...this.headers(), 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(bookmark)
    });
  }

  async getBookmarks(userId) {
    return this.request(`/rest/v1/bookmarks?user_id=eq.${userId}&order=created_at.desc&select=*`);
  }

  async deleteBookmark(id) {
    return this.request(`/rest/v1/bookmarks?id=eq.${id}`, { method: 'DELETE' });
  }

  async upsertVocabulary(wordData) {
    return this.request('/rest/v1/vocabulary?on_conflict=user_id,word', {
      method: 'POST',
      headers: { ...this.headers(), 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify(wordData)
    });
  }

  async getVocabulary(userId) {
    return this.request(`/rest/v1/vocabulary?user_id=eq.${userId}&select=*`);
  }

  async deleteVocabulary(userId, word) {
    return this.request(`/rest/v1/vocabulary?user_id=eq.${userId}&word=eq.${word}`, { method: 'DELETE' });
  }

  async upsertAchievement(achievement) {
    return this.request('/rest/v1/achievements?on_conflict=user_id,achievement_id', {
      method: 'POST',
      headers: { ...this.headers(), 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify(achievement)
    });
  }

  async getAchievements(userId) {
    return this.request(`/rest/v1/achievements?user_id=eq.${userId}&select=*`);
  }

  async getLeaderboard(period = 'week') {
    return this.request(`/rest/v1/profiles?order=xp.desc&limit=20&select=*`);
  }

  async getPublishedLessonBundle() {
    if (!this.url || !this.key) {
      return { lessons: [], transcripts: [] };
    }

    const [lessons, transcripts] = await Promise.all([
      this.request('/rest/v1/published_lessons?is_published=eq.true&select=*&order=sort_order.asc,published_at.desc'),
      this.request('/rest/v1/published_transcripts?is_published=eq.true&select=*')
    ]);

    return {
      lessons: Array.isArray(lessons) ? lessons : [],
      transcripts: Array.isArray(transcripts) ? transcripts : []
    };
  }
}

class QueryBuilder {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this._filters = [];
    this._select = '*';
    this._order = null;
    this._limit = null;
  }

  select(cols) { this._select = cols; return this; }
  eq(col, val) { this._filters.push(`${col}=eq.${val}`); return this; }
  order(col, { ascending = true } = {}) { this._order = `${col}.${ascending ? 'asc' : 'desc'}`; return this; }
  limit(n) { this._limit = n; return this; }

  async execute() {
    let params = `select=${this._select}`;
    if (this._filters.length) params += '&' + this._filters.join('&');
    if (this._order) params += `&order=${this._order}`;
    if (this._limit) params += `&limit=${this._limit}`;
    const data = await this.client.request(`/rest/v1/${this.table}?${params}`);
    return { data, error: null };
  }
}

export const supabase = new SupabaseClient();

// ==================== INDEXEDDB ====================
class LocalDB {
  constructor() {
    this.dbName = 'linguAlphabet';
    this.version = 3;
    this.db = null;
  }

  async open() {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, this.version);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        const stores = [
          { name: 'profile', keyPath: 'userId' },
          { name: 'progress', keyPath: 'podcastId' },
          { name: 'notes', keyPath: 'id' },
          { name: 'bookmarks', keyPath: 'id' },
          { name: 'vocabulary', keyPath: 'word' },
          { name: 'inbox', keyPath: 'id' },
          { name: 'podcasts', keyPath: 'podcastId' },
          { name: 'quests', keyPath: 'id' },
        ];
        stores.forEach(s => {
          if (!db.objectStoreNames.contains(s.name)) {
            db.createObjectStore(s.name, { keyPath: s.keyPath });
          }
        });
      };
      req.onsuccess = e => { this.db = e.target.result; resolve(this.db); };
      req.onerror = e => reject(e);
    });
  }

  async put(store, data) {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).put(data);
      req.onsuccess = () => resolve(req.result);
      req.onerror = e => reject(e);
    });
  }

  async get(store, key) {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = e => reject(e);
    });
  }

  async getAll(store) {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = e => reject(e);
    });
  }

  async delete(store, key) {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).delete(key);
      req.onsuccess = () => resolve();
      req.onerror = e => reject(e);
    });
  }

  async clear(store) {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).clear();
      req.onsuccess = () => resolve();
      req.onerror = e => reject(e);
    });
  }
}

export const localDB = new LocalDB();

// ==================== USER STATE ====================
// localStorage-based quick state (synced with IndexedDB for heavy data)
export const UserState = {
  _data: null,

  defaults() {
    return {
      userId: 'guest_' + Math.random().toString(36).slice(2,8),
      username: 'Learner',
      email: '',
      avatar: null,
      level: 1,
      xp: 0,
      xpToNext: 300,
      streak: 0,
      lastStudyDate: null,
      totalMinutes: 0,
      completedPodcasts: [],
      savedPodcasts: [],
      vocabulary: [],
      notes: [],
      bookmarks: [],
      achievements: [],
      quests: [],
      inbox: [],
      progress: {},
      tutoName: 'Turbo',
      lastActiveTab: 'home',

      // Outcome-driven state
      hasCompletedAssessment: false,
      cefrLevel: null,
      targetGoal: null,
      dailyTimeGoal: 20, // minutes
      studyHoursGoal: 50,
      learningScore: { listening: 0, vocabulary: 0, grammar: 0, comprehension: 0, retention: 0 },
      learningMemory: { masteredWords: [], weakWords: [], masteredConcepts: [], weakConcepts: [], repeatedMistakes: [] },
      assessmentHistory: [],
      pathStep: 1,
      pathDate: ""
    };
  },

  load() {
    try {
      const stored = localStorage.getItem('linguAlphabet_user');
      this._data = stored ? { ...this.defaults(), ...JSON.parse(stored) } : this.defaults();
    } catch {
      this._data = this.defaults();
    }
    
    const todayStr = new Date().toDateString();
    if (this._data.pathDate !== todayStr) {
      this._data.pathStep = 1;
      this._data.pathDate = todayStr;
    }

    this._updateStreak();
    return this._data;
  },

  save() {
    this.recalculateInsights();
    localStorage.setItem('linguAlphabet_user', JSON.stringify(this._data));
    this.syncToRemote().catch(() => null);
  },

  recalculateInsights() {
    if (!this._data) this.load();
    const completed = this._data.completedPodcasts || [];
    const progress = this._data.progress || {};
    const vocab = this._data.vocabulary || [];
    const streak = this._data.streak || 0;
    
    let podcasts = [];
    try {
      podcasts = getInitialData().podcasts;
    } catch {}

    let sumDurations = 0;
    let countDurations = 0;
    completed.forEach(id => {
      const p = podcasts.find(pod => pod.podcastId === id);
      if (p) {
        sumDurations += p.duration || 6;
        countDurations++;
      }
    });
    let preferredLessonLength = countDurations > 0 ? Math.round(sumDurations / countDurations) : 6;

    let preferredLearningStyle = 'Auditory-Visual';
    if ((this._data.notes || []).length > 3) {
      preferredLearningStyle = 'Auditory-Visual (Active Writer)';
    } else if (vocab.length > 5) {
      preferredLearningStyle = 'Auditory-Visual (Vocabulary Learner)';
    }

    let morningCount = 0;
    let afternoonCount = 0;
    let eveningCount = 0;
    Object.values(progress).forEach(p => {
      if (p.updatedAt) {
        const hour = new Date(p.updatedAt).getHours();
        if (hour >= 5 && hour < 12) morningCount++;
        else if (hour >= 12 && hour < 17) afternoonCount++;
        else eveningCount++;
      }
    });
    let bestStudyTime = 'morning';
    if (afternoonCount > morningCount && afternoonCount > eveningCount) {
      bestStudyTime = 'afternoon';
    } else if (eveningCount > morningCount && eveningCount > afternoonCount) {
      bestStudyTime = 'evening';
    }

    let averageAttentionSpan = Math.max(4, Math.min(12, preferredLessonLength));

    let confidenceLevel = 50;
    const scores = this._data.learningScore || { listening: 0, vocabulary: 0, grammar: 0, comprehension: 0, retention: 0 };
    const avgScore = ((scores.listening || 0) + (scores.vocabulary || 0) + (scores.grammar || 0) + (scores.comprehension || 0) + (scores.retention || 0)) / 5;
    if (avgScore > 0) {
      confidenceLevel = Math.round(Math.max(30, Math.min(95, avgScore + (streak * 2))));
    }

    let consistencyLevel = Math.max(30, Math.min(100, 40 + (streak * 10)));

    this._data.learningMemory = this._data.learningMemory || { masteredWords: [], weakWords: [], masteredConcepts: [], weakConcepts: [], repeatedMistakes: [] };
    this._data.learningMemory.insights = {
      preferredLearningStyle,
      preferredLessonLength,
      bestStudyTime,
      averageAttentionSpan,
      confidenceLevel,
      motivationLevel: this._data.motivation || 'medium',
      consistencyLevel
    };
  },

  async syncToRemote() {
    if (!this._data || this._data.isGuest || !this._data.userId || this._data.userId.startsWith('guest_')) {
      return;
    }
    if (!supabase.isReady) return;

    try {
      // 1. Sync Profile
      const remoteProfile = {
        user_id: this._data.userId,
        username: this._data.username,
        avatar_url: this._data.avatar,
        level: this._data.level,
        xp: this._data.xp,
        xp_to_next: this._data.xpToNext,
        streak: this._data.streak,
        last_study_date: this._data.lastStudyDate,
        total_minutes: this._data.totalMinutes,
        tuto_name: this._data.tutoName,
        motivation: this._data.motivation,
        cefr_level: this._data.cefrLevel,
        target_goal: this._data.targetGoal,
        daily_time_goal: this._data.dailyTimeGoal,
        study_hours_goal: this._data.studyHoursGoal,
        learning_score: this._data.learningScore,
        learning_memory: this._data.learningMemory,
        assessment_history: this._data.assessmentHistory,
        has_completed_assessment: this._data.hasCompletedAssessment
      };
      await supabase.upsertProfile(remoteProfile).catch(err => reportError("Profile sync error:", err));

      // 2. Sync Progress
      if (this._data.progress) {
        for (const [podcastId, progressData] of Object.entries(this._data.progress)) {
          await supabase.upsertProgress({
            user_id: this._data.userId,
            podcast_id: podcastId,
            position_seconds: progressData.position || 0,
            completed: progressData.completed || false
          }).catch(() => null);
        }
      }

      // 3. Sync Vocabulary
      if (this._data.vocabulary) {
        for (const wordData of this._data.vocabulary) {
          await supabase.upsertVocabulary({
            user_id: this._data.userId,
            word: wordData.word,
            definition: wordData.definition,
            phonetic: wordData.phonetic,
            pos: wordData.pos,
            translations: wordData.translations,
            example: wordData.example,
            source_podcast_id: wordData.sourcePodcastId || ''
          }).catch(() => null);
        }
      }

      // 4. Sync Achievements
      if (this._data.achievements) {
        for (const achId of this._data.achievements) {
          await supabase.upsertAchievement({
            user_id: this._data.userId,
            achievement_id: achId
          }).catch(() => null);
        }
      }
    } catch (err) {
      reportError("Supabase syncToRemote failed:", err);
    }
  },

  async syncFromRemote() {
    if (!this._data || this._data.isGuest || !this._data.userId || this._data.userId.startsWith('guest_')) {
      return;
    }
    if (!supabase.isReady) return;

    try {
      const userId = this._data.userId;

      // 1. Pull Profile
      const profile = await supabase.getProfile(userId).catch(() => null);
      if (profile) {
        this._data.username = profile.username || this._data.username;
        this._data.avatar = profile.avatar_url || this._data.avatar;
        this._data.level = profile.level || this._data.level;
        this._data.xp = profile.xp || this._data.xp;
        this._data.xpToNext = profile.xp_to_next || this._data.xpToNext;
        this._data.streak = profile.streak || this._data.streak;
        this._data.lastStudyDate = profile.last_study_date || this._data.lastStudyDate;
        this._data.totalMinutes = profile.total_minutes || this._data.totalMinutes;
        this._data.tutoName = profile.tuto_name || this._data.tutoName;
        this._data.motivation = profile.motivation || this._data.motivation;
        this._data.cefrLevel = profile.cefr_level || this._data.cefrLevel;
        this._data.targetGoal = profile.target_goal || this._data.targetGoal;
        this._data.dailyTimeGoal = profile.daily_time_goal || this._data.dailyTimeGoal;
        this._data.studyHoursGoal = profile.study_hours_goal || this._data.studyHoursGoal;
        this._data.learningScore = profile.learning_score || this._data.learningScore;
        this._data.learningMemory = profile.learning_memory || this._data.learningMemory;
        this._data.assessmentHistory = profile.assessment_history || this._data.assessmentHistory;
        if (typeof profile.has_completed_assessment === 'boolean') {
          this._data.hasCompletedAssessment = profile.has_completed_assessment;
        }
      }

      // 2. Pull Progress
      const progressList = await supabase.getProgress(userId).catch(() => []);
      if (Array.isArray(progressList)) {
        this._data.progress = this._data.progress || {};
        progressList.forEach(p => {
          this._data.progress[p.podcast_id] = {
            position: p.position_seconds || 0,
            completed: p.completed || false,
            updatedAt: p.updated_at ? new Date(p.updated_at).getTime() : Date.now()
          };
        });
      }

      // 3. Pull Notes
      const notesList = await supabase.getNotes(userId).catch(() => []);
      if (Array.isArray(notesList)) {
        this._data.notes = notesList.map(n => ({
          id: n.id,
          podcastId: n.podcast_id,
          podcastTitle: n.podcast_title,
          content: n.content,
          time: n.timestamp_seconds,
          createdAt: new Date(n.created_at).getTime()
        }));
      }

      // 4. Pull Bookmarks
      const bookmarksList = await supabase.getBookmarks(userId).catch(() => []);
      if (Array.isArray(bookmarksList)) {
        this._data.bookmarks = bookmarksList.map(b => ({
          id: b.id,
          podcastId: b.podcast_id,
          podcastTitle: b.podcast_title,
          time: b.position_seconds,
          label: b.label,
          createdAt: new Date(b.created_at).getTime()
        }));
      }

      // 5. Pull Vocabulary
      const vocabList = await supabase.getVocabulary(userId).catch(() => []);
      if (Array.isArray(vocabList)) {
        const localVocab = this._data.vocabulary || [];
        this._data.vocabulary = vocabList.map(v => {
          const localMatch = localVocab.find(w => w.word === v.word);
          return {
            word: v.word,
            definition: v.definition,
            phonetic: v.phonetic,
            pos: v.pos,
            translations: v.translations,
            example: v.example,
            sourcePodcastId: v.source_podcast_id,
            sourcePodcastTitle: localMatch?.sourcePodcastTitle || '',
            firstLearned: localMatch?.firstLearned || new Date(v.created_at).getTime(),
            lastReviewed: localMatch?.lastReviewed || new Date(v.created_at).getTime(),
            reviewCount: localMatch?.reviewCount || 0,
            masteryScore: localMatch?.masteryScore || 30,
            nextReview: localMatch?.nextReview || (new Date(v.created_at).getTime() + 24 * 60 * 60 * 1000),
            savedAt: localMatch?.savedAt || new Date(v.created_at).getTime()
          };
        });
      }

      // 6. Pull Achievements
      const achsList = await supabase.getAchievements(userId).catch(() => []);
      if (Array.isArray(achsList)) {
        this._data.achievements = achsList.map(a => a.achievement_id);
      }

      localStorage.setItem('linguAlphabet_user', JSON.stringify(this._data));
    } catch (err) {
      reportError("Supabase syncFromRemote failed:", err);
    }
  },

  get(key) { return this._data?.[key]; },

  set(key, value) {
    if (!this._data) this.load();
    this._data[key] = value;
    this.save();
  },

  update(patch) {
    if (!this._data) this.load();
    Object.assign(this._data, patch);
    this.save();
  },

  _updateStreak() {
    const today = new Date().toDateString();
    const last = this._data.lastStudyDate;
    if (!last) return;
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (last !== today && last !== yesterday) {
      this._data.streak = 0;
      this.save();
    }
  },

  recordStudy() {
    const today = new Date().toDateString();
    const last = this._data.lastStudyDate;
    if (last !== today) {
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      if (last === yesterday) {
        this._data.streak = (this._data.streak || 0) + 1;
      } else if (!last) {
        this._data.streak = 1;
      } else {
        this._data.streak = 1;
      }
      this._data.lastStudyDate = today;
      this.save();
    }
  },

  addXP(amount) {
    if (!this._data) this.load();
    this._data.xp = (this._data.xp || 0) + amount;
    // Level up check
    let leveled = false;
    while (this._data.xp >= this._data.xpToNext) {
      this._data.xp -= this._data.xpToNext;
      this._data.level = (this._data.level || 1) + 1;
      this._data.xpToNext = Math.floor(300 * Math.pow(1.2, this._data.level - 1));
      leveled = true;
    }
    this.save();
    return leveled;
  },

  saveWord(wordData) {
    if (!this._data) this.load();
    const vocab = this._data.vocabulary || [];
    if (!vocab.find(w => w.word === wordData.word)) {
      vocab.push({
        word: wordData.word,
        definition: wordData.definition,
        phonetic: wordData.phonetic,
        pos: wordData.pos,
        translations: wordData.translations,
        example: wordData.example,
        sourcePodcastId: wordData.sourcePodcastId || '',
        sourcePodcastTitle: wordData.sourcePodcastTitle || '',
        firstLearned: wordData.firstLearned || Date.now(),
        lastReviewed: wordData.lastReviewed || Date.now(),
        reviewCount: wordData.reviewCount || 0,
        masteryScore: wordData.masteryScore || 30,
        nextReview: wordData.nextReview || (Date.now() + 24 * 60 * 60 * 1000),
        savedAt: Date.now()
      });
      this._data.vocabulary = vocab;
      this.save();
      return true;
    }
    return false;
  },

  addNote(note) {
    if (!this._data) this.load();
    const notes = this._data.notes || [];
    notes.unshift({ ...note, id: 'note_' + Date.now(), createdAt: Date.now() });
    this._data.notes = notes;
    this.save();
  },

  addBookmark(bookmark) {
    if (!this._data) this.load();
    const bks = this._data.bookmarks || [];
    bks.unshift({ ...bookmark, id: 'bk_' + Date.now(), createdAt: Date.now() });
    this._data.bookmarks = bks;
    this.save();
  },

  savePodcast(podcastId) {
    if (!this._data) this.load();
    const saved = this._data.savedPodcasts || [];
    if (!saved.includes(podcastId)) {
      saved.push(podcastId);
      this._data.savedPodcasts = saved;
      this.save();
      return true;
    }
    return false;
  },

  updateProgress(podcastId, progressData) {
    if (!this._data) this.load();
    this._data.progress = this._data.progress || {};
    this._data.progress[podcastId] = {
      ...this._data.progress[podcastId],
      ...progressData,
      updatedAt: Date.now()
    };
    this.save();
  },

  getProgress(podcastId) {
    return this._data?.progress?.[podcastId] || null;
  },

  addInboxItem(item) {
    if (!this._data) this.load();
    const inbox = this._data.inbox || [];
    inbox.unshift({ ...item, id: 'inbox_' + Date.now(), read: false, ts: Date.now() });
    this._data.inbox = inbox.slice(0, 50); // keep last 50
    this.save();
  },

  unlockAchievement(id) {
    if (!this._data) this.load();
    const achs = this._data.achievements || [];
    if (!achs.includes(id)) {
      achs.push(id);
      this._data.achievements = achs;
      this.save();
      return true;
    }
    return false;
  },

  updateQuests(quests) {
    this._data.quests = quests;
    this.save();
  },

  incrementQuest(type) {
    if (!this._data) this.load();
    const quests = this._data.quests || [];
    const q = quests.find(q => q.type === type);
    if (q && q.current < q.goal) {
      q.current += 1;
      this.save();
      return q;
    }
    return null;
  },

  saveAssessment(level, scores) {
    if (!this._data) this.load();
    this._data.cefrLevel = level;
    this._data.hasCompletedAssessment = true;
    this._data.learningScore = {
      listening: Math.round(scores.listening || 0),
      vocabulary: Math.round(scores.vocabulary || 0),
      grammar: Math.round(scores.grammar || 0),
      comprehension: Math.round(scores.comprehension || ((scores.reading || 0) + (scores.listening || 0)) / 2),
      retention: Math.round(scores.confidence || 0)
    };
    this._data.assessmentHistory = this._data.assessmentHistory || [];
    this._data.assessmentHistory.push({
      date: new Date().toISOString(),
      cefrLevel: level,
      scores: { ...this._data.learningScore }
    });
    this.save();
  },

  updateLearningScore(skill, value) {
    if (!this._data) this.load();
    this._data.learningScore = this._data.learningScore || { listening: 0, vocabulary: 0, grammar: 0, comprehension: 0, retention: 0 };
    this._data.learningScore[skill] = Math.max(0, Math.min(100, Math.round(value)));
    this.save();
  },

  updateLearningMemory(type, item, status) {
    if (!this._data) this.load();
    this._data.learningMemory = this._data.learningMemory || { masteredWords: [], weakWords: [], masteredConcepts: [], weakConcepts: [], repeatedMistakes: [] };
    const list = this._data.learningMemory[type] || [];
    if (status === 'mastered') {
      // Remove from weak list, add to mastered list
      this._data.learningMemory[type] = list.filter(i => i !== item);
      const masteredKey = type.replace('weak', 'mastered');
      const masteredList = this._data.learningMemory[masteredKey] || [];
      if (!masteredList.includes(item)) masteredList.push(item);
      this._data.learningMemory[masteredKey] = masteredList;
    } else if (status === 'weak') {
      // Add to weak list, remove from mastered list
      if (!list.includes(item)) list.push(item);
      this._data.learningMemory[type] = list;
      const masteredKey = type.replace('weak', 'mastered');
      const masteredList = this._data.learningMemory[masteredKey] || [];
      this._data.learningMemory[masteredKey] = masteredList.filter(i => i !== item);
    } else if (status === 'mistake') {
      if (!list.includes(item)) list.push(item);
      this._data.learningMemory[type] = list;
    }
    this.save();
  }
};
