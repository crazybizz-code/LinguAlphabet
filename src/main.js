// ============================================================
// main.js — LinguAlphabet App Orchestrator (Milestone 1 V2)
// ============================================================

import './style.css';
import { getInitialData } from './data.js';
import { supabase, UserState, CONFIG, updateConfig } from './db.js';
import { copilot, lookupWord } from './ai.js';
import { SyncedAudioPlayer } from './player.js';
import { syncAllFeeds } from './rss.js';
import {
  getTutoSVG,
  startTutoBlinkLoop,
  showAuthPanel,
  syncAuthScreenMode,
  setAuthPanelHook,
  showSplash,
  hideSplash,
  runColdStartSequence,
  showError,
  shakeFieldError,
  isValidEmail,
  isValidFullName,
  isPasswordComplex,
  isLoginPasswordValid,
  renderPasswordStrength,
  setupPasswordToggle,
  bindEnterToSubmit,
  handleGoogleAuth,
  runAuthFlow,
  showAuthSuccess,
  lockAuthNavigation,
  unlockAuthNavigation,
  setGuestUpgradeHook,
  requestGuestUpgrade,
  setupAuthKeyboardNav
} from './auth.js';

// ==================== GLOBAL STATE ====================
const state = {
  currentView: 'home',
  currentPodcast: null,
  currentTranscript: null,
  currentWordTimestamp: 0,
  playerOpen: false,
  wsTab: 'transcript',
  libTab: 'saved',
  leaderboardPeriod: 'week',
  podcastDetailId: null,
  
  // Onboarding Assessment State
  assessmentQuestions: [],
  assessmentIndex: 0,
  assessmentAnswers: {},
  selectedAssessmentIdx: null,

  // Active Recall Wizard State
  activeLearningStep: 'prompt', // prompt, flashcards, quiz, reflection
  activePodcast: null,
  activeQuizQuestions: [],
  activeQuizIndex: 0,
  activeQuizAnswers: [],
  activeFlashcards: [],
  activeFlashcardIndex: 0,

  filterActive: 'all',
  exploreSort: 'recommended',
  searchQuery: '',
  tutoState: 'idle', // idle, listening, celebrating, thinking, sleeping
  podcasts: [],
  transcripts: {},
  selectedWord: null,
  copilotLoading: false,
  isGuest: true,
  user: null,
};

// ==================== PLAYER INSTANCE ====================
const player = new SyncedAudioPlayer();
let data = null;
const REMOTE_LESSON_CACHE_KEY = 'linguAlphabet_remote_lessons_v1';

function reportWarning(...args) {
  if (import.meta.env.DEV) console.warn(...args);
}

// ==================== TIME HELPERS ====================
function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatMs(ms) {
  return formatTime(ms / 1000);
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getLangClass(lang) {
  const map = { English: 'lang-en', Spanish: 'lang-es', German: 'lang-de', Russian: 'lang-ru', Uzbek: 'lang-uz', French: 'lang-fr' };
  return map[lang] || 'lang-en';
}

function getDiffClass(diff) {
  const map = { Beginner: 'diff-beginner', Intermediate: 'diff-intermediate', Advanced: 'diff-advanced' };
  return map[diff] || 'diff-beginner';
}

// ==================== STATUS TIME ====================
function updateStatusTime() {
  const el = document.getElementById('status-time');
  if (!el) return;
  const now = new Date();
  el.textContent = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
}
setInterval(updateStatusTime, 30000);
updateStatusTime();

// ==================== APP BOOT ====================
async function boot() {
  data = getInitialData();
  state.podcasts = data.podcasts;
  state.assessmentQuestions = data.assessmentQuestions || [];
  state.transcripts = normalizeTranscriptCollection(data.transcripts);
  applyCachedRemoteLessons();

  UserState.load();
  state.user = UserState._data;

  // RSS synchronization is kept in codebase as a future content ingestion tool,
  // but disabled for user-facing active library views in Milestone 1.
  /*
  syncAllFeeds().then(rssEpisodes => {
    state.podcasts = [...state.podcasts, ...rssEpisodes];
    if (state.currentView === 'home') renderHome();
    if (state.currentView === 'explore') renderExplore();
  }).catch(() => {});
  */

  // Splash validates any existing session while showing the brand mark, then
  // reports where to land. The destination screen is prepared before Splash
  // is hidden, so the UI never flashes the wrong screen mid-check.
  const route = await runColdStartSequence();
  if (route === 'authenticated') {
    showMainApp();
  } else {
    showAuth();
  }
  hideSplash();

  setupEventListeners();
  setupPlayer();
  renderTuto();
  ensureDailyQuests();
  refreshRemoteLessons().catch(error => {
    reportWarning('Remote lessons unavailable:', error.message);
  });
}

const FALLBACK_ART = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100%25' height='100%25' fill='%23FF6B35' opacity='0.15'/><circle cx='50' cy='50' r='20' fill='%23FF6B35' opacity='0.3'/><path d='M47 35v25c0 3-2 5-5 5s-5-2-5-5 2-5 5-5c1 0 2 0 3 1V39h15v10c0 3-2 5-5 5s-5-2-5-5 2-5 5-5c1 0 2 0 3 1V35H47z' fill='%23FF6B35'/></svg>";

function getSafeImageHtml(src, alt = '', className = '') {
  const imageSrc = src || FALLBACK_ART;
  return `<img src="${imageSrc}" alt="${alt}" class="skeleton-loader ${className}" onload="this.classList.remove('skeleton-loader'); this.classList.add('loaded')" onerror="this.src='${FALLBACK_ART}'; this.classList.remove('skeleton-loader'); this.classList.add('loaded')" />`;
}

function normalizeTranscriptCollection(transcripts) {
  if (transcripts && typeof transcripts === 'object' && !Array.isArray(transcripts)) {
    return transcripts;
  }

  if (Array.isArray(transcripts)) {
    const normalized = {};
    transcripts.forEach(t => {
      if (t?.transcriptId) normalized[t.transcriptId] = t;
    });
    return normalized;
  }

  return {};
}

function normalizeRemotePodcast(row) {
  const podcast = row.podcast || row;
  const podcastId = row.podcast_id || podcast.podcastId || podcast.podcast_id;
  const transcriptId = row.transcript_id || podcast.transcriptId || podcast.transcript_id;
  if (!podcastId || !transcriptId || !podcast.audioUrl && !podcast.audio_url) return null;

  return {
    ...podcast,
    podcastId,
    transcriptId,
    title: podcast.title || 'Untitled lesson',
    description: podcast.description || '',
    language: podcast.language || 'English',
    source: podcast.source || 'LinguAlphabet',
    series: podcast.series || 'Remote Lessons',
    category: podcast.category || 'English',
    difficulty: podcast.difficulty || 'Intermediate',
    cefrLevel: podcast.cefrLevel || podcast.cefr_level || 'B1',
    duration: Number(podcast.duration) || 0,
    coverImage: podcast.coverImage || podcast.cover_image || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=400&q=80',
    audioUrl: podcast.audioUrl || podcast.audio_url,
    transcriptUrl: podcast.transcriptUrl || podcast.transcript_url || '',
    createdAt: podcast.createdAt || podcast.created_at || row.published_at || row.created_at || new Date().toISOString(),
    views: Number(podcast.views) || 0,
    averageRating: Number(podcast.averageRating || podcast.average_rating) || 4.8,
    skills: podcast.skills || ['Listening', 'Vocabulary'],
    keywords: podcast.keywords || [],
    flashcards: podcast.flashcards || [],
    quizQuestions: podcast.quizQuestions || podcast.quiz_questions || [],
    remoteManaged: true
  };
}

function normalizeRemoteTranscript(row) {
  const transcript = row.transcript || row;
  const transcriptId = row.transcript_id || transcript.transcriptId || transcript.transcript_id;
  const podcastId = row.podcast_id || transcript.podcastId || transcript.podcast_id;
  const content = transcript.content || row.content;
  if (!transcriptId || !podcastId || !Array.isArray(content) || content.length === 0) return null;

  return {
    ...transcript,
    transcriptId,
    podcastId,
    language: transcript.language || 'English',
    duration: Number(transcript.duration) || 0,
    source: transcript.source || 'Remote transcript',
    timing: transcript.timing || 'forced-aligned-from-audio',
    alignment: transcript.alignment || { engine: 'external', tokenCoverage: null, missingSegments: 0 },
    content
  };
}

function applyRemoteLessonBundle(bundle, { cache = false, render = false } = {}) {
  const remoteTranscripts = {};
  (bundle.transcripts || []).forEach(row => {
    const transcript = normalizeRemoteTranscript(row);
    if (transcript) remoteTranscripts[transcript.transcriptId] = transcript;
  });

  const remotePodcasts = (bundle.lessons || [])
    .map(normalizeRemotePodcast)
    .filter(podcast => podcast && remoteTranscripts[podcast.transcriptId]);

  if (!remotePodcasts.length) return false;

  state.transcripts = { ...state.transcripts, ...remoteTranscripts };

  const byId = new Map(state.podcasts.map(podcast => [podcast.podcastId, podcast]));
  remotePodcasts.forEach(podcast => byId.set(podcast.podcastId, podcast));
  state.podcasts = Array.from(byId.values());

  if (cache) {
    try {
      localStorage.setItem(REMOTE_LESSON_CACHE_KEY, JSON.stringify({
        savedAt: new Date().toISOString(),
        lessons: remotePodcasts.map(podcast => ({ podcast })),
        transcripts: Object.values(remoteTranscripts).map(transcript => ({ transcript }))
      }));
    } catch (error) {
      reportWarning('Remote lesson cache skipped:', error.message);
    }
  }

  if (render) renderCurrentContentView();
  return true;
}

function applyCachedRemoteLessons() {
  try {
    const cached = JSON.parse(localStorage.getItem(REMOTE_LESSON_CACHE_KEY) || 'null');
    if (cached?.lessons?.length && cached?.transcripts?.length) {
      applyRemoteLessonBundle(cached);
    }
  } catch {
    localStorage.removeItem(REMOTE_LESSON_CACHE_KEY);
  }
}

async function refreshRemoteLessons() {
  const bundle = await supabase.getPublishedLessonBundle();
  applyRemoteLessonBundle(bundle, { cache: true, render: true });
}

function renderCurrentContentView() {
  if (state.currentView === 'home') renderHome();
  if (state.currentView === 'explore') renderExplore();
  if (state.currentView === 'library') renderLibrary();
}

// ==================== AUTH ====================
let welcomeSpeechTimer = null;
let welcomeTransitionTimer = null;

function clearWelcomeTimers() {
  if (welcomeSpeechTimer) {
    clearTimeout(welcomeSpeechTimer);
    welcomeSpeechTimer = null;
  }
  if (welcomeTransitionTimer) {
    clearTimeout(welcomeTransitionTimer);
    welcomeTransitionTimer = null;
  }
}

function setupWelcomeKeyboard() {
  const input = document.getElementById('welcome-name-input');
  const authScreen = document.getElementById('auth-screen');
  if (!input || !authScreen || input.dataset.keyboardBound === '1') return;
  input.dataset.keyboardBound = '1';

  const updateKeyboardOffset = () => {
    if (!document.getElementById('welcome-panel')?.classList.contains('active')) {
      authScreen.style.removeProperty('--keyboard-offset');
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;
    const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    authScreen.style.setProperty('--keyboard-offset', `${offset}px`);
  };

  window.visualViewport?.addEventListener('resize', updateKeyboardOffset);
  window.visualViewport?.addEventListener('scroll', updateKeyboardOffset);

  input.addEventListener('focus', () => {
    requestAnimationFrame(updateKeyboardOffset);
  });
  input.addEventListener('blur', () => {
    authScreen.style.removeProperty('--keyboard-offset');
  });
}

function transitionWelcomeToOnboarding(onComplete) {
  const authScreen = document.getElementById('auth-screen');
  authScreen?.classList.add('auth-screen--exit');
  welcomeTransitionTimer = setTimeout(() => {
    authScreen?.classList.remove('auth-screen--exit', 'auth-screen--welcome');
    authScreen?.style.removeProperty('--keyboard-offset');
    onComplete();
  }, 400);
}

function showAuth() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('main-app').classList.add('hidden');
  document.getElementById('onboarding-screen').classList.add('hidden');

  // Welcome Hero (SCR-002) is the default entry panel; showAuthPanel() is the
  // single source of truth for activating/initializing any auth panel.
  showAuthPanel('welcome-hero-panel');
}

function initWelcomeScreen() {
  const container = document.getElementById('welcome-tuto-avatar');
  const speechEl = document.getElementById('welcome-tuto-speech');
  const typingEl = document.getElementById('welcome-tuto-typing');
  const inputEl = document.getElementById('welcome-name-input');
  const errorEl = document.getElementById('welcome-name-error');
  const btn = document.getElementById('welcome-continue-btn');

  if (!container) return;

  clearWelcomeTimers();
  syncAuthScreenMode();

  // Random blink interval (3-6 seconds per spec) — shared helper (auth.js)
  startTutoBlinkLoop(container);

  // Render Tuto SVG immediately
  const tutoSize = window.matchMedia('(max-width: 360px), (max-height: 740px)').matches ? 120 : 160;
  container.innerHTML = getTutoSVG(tutoSize);

  // Reset inputs and buttons
  if (inputEl) {
    inputEl.value = '';
    inputEl.disabled = false;
  }
  if (errorEl) {
    errorEl.textContent = '';
    errorEl.classList.add('hidden');
  }
  if (btn) {
    btn.disabled = true;
  }

  // Show typing dots immediately, hide speech text
  if (typingEl) typingEl.classList.remove('hidden');
  if (speechEl) {
    speechEl.classList.add('hidden');
    speechEl.innerHTML = '';
  }

  // Dynamic greeting text fade-in (800ms per spec)
  welcomeSpeechTimer = setTimeout(() => {
    if (typingEl) typingEl.classList.add('hidden');
    if (speechEl) {
      speechEl.innerHTML = "Hi! 👋<br><br>I'm Tuto.<br><br>I'll be your personal English coach.<br><br>What's your name?";
      speechEl.classList.remove('hidden');
    }
  }, 800);
}

function showMainApp() {
  document.getElementById('auth-screen').classList.add('hidden');

  const user = UserState._data;
  const onboardingComplete = user?.hasCompletedAssessment === true;
  if (!onboardingComplete) {
    document.getElementById('main-app').classList.add('hidden');
    document.getElementById('onboarding-screen').classList.remove('hidden');
    startOnboardingFlow();
    return;
  }

  document.getElementById('onboarding-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  navigateTo(UserState.get('lastActiveTab') || 'home');
  renderAllViews();
}

function setupAuthListeners() {
  setupWelcomeKeyboard();
  setupAuthKeyboardNav();

  // The Guest name-capture panel (SCR "welcome-panel") keeps its own init
  // logic here in main.js since it owns onboarding-draft state; auth.js
  // invokes it via this hook whenever that panel becomes active.
  setAuthPanelHook((panelId) => {
    if (panelId === 'welcome-panel') {
      initWelcomeScreen();
    }
  });

  // auth-guest.js knows nothing about the DOM or which modal to open — it
  // just calls this hook. main.js owns the existing #upgrade-overlay, so
  // every upgrade prompt (manual, from Settings, or a future feature-limit
  // trigger) opens through this single path — no second upgrade modal.
  setGuestUpgradeHook((reason) => {
    const reasonEl = document.getElementById('upgrade-reason');
    if (reasonEl) {
      if (reason) {
        reasonEl.textContent = reason;
        reasonEl.classList.remove('hidden');
      } else {
        reasonEl.classList.add('hidden');
      }
    }
    const errEl = document.getElementById('upgrade-error');
    if (errEl) errEl.classList.add('hidden');
    showModal('upgrade-overlay');
  });

  // Welcome Hero (SCR-002) triggers
  document.getElementById('hero-start-btn')?.addEventListener('click', () => {
    showAuthPanel('signup-panel');
  });

  document.getElementById('hero-signin-btn')?.addEventListener('click', () => {
    showAuthPanel('login-panel');
  });

  document.getElementById('hero-guest-btn')?.addEventListener('click', () => {
    showAuthPanel('guest-mode-panel');
  });

  // Guest Mode (SCR-006) triggers
  document.getElementById('guest-create-account-btn')?.addEventListener('click', () => {
    showAuthPanel('signup-panel');
  });

  document.getElementById('guest-continue-btn')?.addEventListener('click', () => {
    showAuthPanel('welcome-panel');
  });

  document.getElementById('guest-back-btn')?.addEventListener('click', () => {
    showAuthPanel('welcome-hero-panel');
  });

  // Login / Register field interactions (shared helpers, see auth.js)
  setupPasswordToggle('login-password', 'login-password-toggle');
  setupPasswordToggle('signup-password', 'signup-password-toggle');
  setupPasswordToggle('signup-confirm-password', 'signup-confirm-password-toggle');

  bindEnterToSubmit(['login-email', 'login-password'], 'login-btn');
  bindEnterToSubmit(['signup-username', 'signup-email', 'signup-password', 'signup-confirm-password'], 'signup-btn');
  bindEnterToSubmit(['forgot-email'], 'forgot-submit-btn');

  // Live password strength meter (Register)
  const signupPasswordInput = document.getElementById('signup-password');
  const signupStrengthMeter = document.getElementById('signup-strength-meter');
  const signupStrengthLabel = document.getElementById('signup-strength-label');
  signupPasswordInput?.addEventListener('input', () => {
    renderPasswordStrength(signupPasswordInput.value, signupStrengthMeter, signupStrengthLabel);
  });

  // Google Sign In / Sign Up
  document.getElementById('login-google-btn')?.addEventListener('click', () => {
    handleGoogleAuth(document.getElementById('login-google-btn'), document.getElementById('login-error'));
  });
  document.getElementById('signup-google-btn')?.addEventListener('click', () => {
    handleGoogleAuth(document.getElementById('signup-google-btn'), document.getElementById('signup-error'));
  });

  // Welcome panel name input validation
  const nameInput = document.getElementById('welcome-name-input');
  const continueBtn = document.getElementById('welcome-continue-btn');
  const nameError = document.getElementById('welcome-name-error');

  nameInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && continueBtn && !continueBtn.disabled) {
      e.preventDefault();
      continueBtn.click();
    }
  });

  nameInput?.addEventListener('input', () => {
    const rawVal = nameInput.value;
    const val = rawVal.trim();
    if (val === '') {
      if (continueBtn) continueBtn.disabled = true;
      nameError?.classList.add('hidden');
      return;
    }

    // Letters and spaces only
    const isValid = /^[A-Za-z\s]+$/.test(rawVal);
    if (!isValid) {
      if (nameError) {
        nameError.textContent = "Just letters, please! Tuto likes clean names.";
        nameError.classList.remove('hidden');
      }
      if (continueBtn) continueBtn.disabled = true;
    } else {
      nameError?.classList.add('hidden');
      if (continueBtn) continueBtn.disabled = false;
    }
  });

  // Welcome panel Continue trigger — the conversational Tuto pacing (750ms
  // pause + its own fade transition) stays exactly as designed; only the
  // navigation lock and the shared Success Transition are added, so Guest
  // gets the same premium close as Login/Register without disturbing the
  // existing name-capture experience.
  continueBtn?.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) return;

    // Lock controls + navigation for the duration of this transition
    if (nameInput) nameInput.disabled = true;
    if (continueBtn) continueBtn.disabled = true;
    lockAuthNavigation();

    // Show Tuto's transition response
    const speechEl = document.getElementById('welcome-tuto-speech');
    if (speechEl) {
      speechEl.innerHTML = `Nice to meet you, ${name}! 👋<br><br>Let's build your English journey together.`;
    }

    // Pause for 750ms to allow conversational reading before transition
    welcomeTransitionTimer = setTimeout(() => {
      if (nameInput) nameInput.disabled = false;
      if (continueBtn) continueBtn.disabled = false;

      transitionWelcomeToOnboarding(async () => {
        // Initialize guest session and proceed to Onboarding
        clearOnboardingDraft();
        state.assessmentIndex = 0;
        state.assessmentAnswers = {};
        state.selectedAssessmentIdx = null;
        state.tempCEFR = null;
        state.tempScores = null;
        UserState.update({
          isGuest: true,
          username: name,
          email: '',
          hasCompletedAssessment: false,
          cefrLevel: null,
          targetGoal: null
        });
        state.isGuest = true;
        state.user = UserState._data;
        await showAuthSuccess('guest');
        unlockAuthNavigation();
        showMainApp();
      });
    }, 750);
  });

  // Welcome panel Sign In link trigger
  document.getElementById('welcome-signin-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    showAuthPanel('login-panel');
  });

  // Login panel triggers
  document.getElementById('goto-welcome-btn')?.addEventListener('click', () => {
    showAuthPanel('welcome-hero-panel');
  });

  document.getElementById('goto-signup')?.addEventListener('click', () => {
    showAuthPanel('signup-panel');
  });

  document.getElementById('forgot-password-btn')?.addEventListener('click', () => {
    showAuthPanel('forgot-panel');
  });

  // Signup panel triggers
  document.getElementById('goto-welcome-from-signup-btn')?.addEventListener('click', () => {
    showAuthPanel('welcome-hero-panel');
  });

  document.getElementById('goto-login')?.addEventListener('click', () => {
    showAuthPanel('login-panel');
  });

  // Forgot password panel triggers
  document.getElementById('goto-login-from-forgot')?.addEventListener('click', () => {
    showAuthPanel('login-panel');
  });

  // Sign In submission
  document.getElementById('login-btn').addEventListener('click', async () => {
    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');
    const rememberInput = document.getElementById('login-remember');
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const errEl = document.getElementById('login-error');

    if (!isValidEmail(email)) {
      showError(errEl, 'Please enter a valid email address');
      shakeFieldError(emailInput);
      return;
    }
    if (!isLoginPasswordValid(password)) {
      showError(errEl, 'Please enter your password');
      shakeFieldError(passwordInput);
      return;
    }

    try {
      await runAuthFlow(async () => {
        const remember = rememberInput ? rememberInput.checked : true;
        await supabase.signIn(email, password, remember);
        UserState.update({
          userId: supabase.currentUser.id,
          email,
          isGuest: false
        });
        // Fetch remote profile
        await UserState.syncFromRemote().catch(() => null);
      }, { context: 'login' });
      showMainApp();
    } catch (err) {
      showError(errEl, err.message || 'Incorrect email or password');
      shakeFieldError(passwordInput);
    }
  });

  // Sign Up submission (the "Full Name" field is stored internally as
  // `username`, which every other screen — home greeting, avatar initial,
  // leaderboard — already reads; only the label/validation is "Full Name")
  document.getElementById('signup-btn').addEventListener('click', async () => {
    const nameInput = document.getElementById('signup-username');
    const emailInput = document.getElementById('signup-email');
    const passwordInput = document.getElementById('signup-password');
    const confirmInput = document.getElementById('signup-confirm-password');
    const termsInput = document.getElementById('signup-terms');
    const fullName = nameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmInput.value;
    const errEl = document.getElementById('signup-error');

    if (!isValidFullName(fullName)) {
      showError(errEl, 'Please enter your full name (letters only, 2-50 characters)');
      shakeFieldError(nameInput);
      return;
    }
    if (!isValidEmail(email)) {
      showError(errEl, 'Please enter a valid email address');
      shakeFieldError(emailInput);
      return;
    }
    if (!isPasswordComplex(password)) {
      showError(errEl, 'Password must be at least 8 characters with an uppercase letter, lowercase letter, number and special character');
      shakeFieldError(passwordInput);
      return;
    }
    if (password !== confirmPassword) {
      showError(errEl, 'Passwords do not match');
      shakeFieldError(confirmInput);
      return;
    }
    if (!termsInput?.checked) {
      showError(errEl, 'Please agree to the Terms and Privacy Policy to continue');
      return;
    }

    try {
      await runAuthFlow(async () => {
        await supabase.signUp(email, password, fullName);
        UserState.update({
          userId: supabase.currentUser?.id || 'guest_user',
          email,
          username: fullName,
          isGuest: false,
          hasCompletedAssessment: false // Force onboarding for new accounts
        });
        clearOnboardingDraft();
        // Sync initial profile state to remote
        await UserState.syncToRemote().catch(() => null);
      }, { context: 'register' });
      showMainApp();
    } catch (err) {
      showError(errEl, err.message || 'Failed to create account');
    }
  });

  // Forgot password submission
  document.getElementById('forgot-submit-btn')?.addEventListener('click', async () => {
    const emailInput = document.getElementById('forgot-email');
    const email = emailInput.value.trim();
    const errEl = document.getElementById('forgot-error');
    const successEl = document.getElementById('forgot-success');

    if (!isValidEmail(email)) {
      showError(errEl, 'Please enter a valid email address');
      shakeFieldError(emailInput);
      return;
    }

    try {
      // Forgot Password stays on its own panel after success (SCR-005) —
      // no Success Transition here, only the shared Loading experience.
      await runAuthFlow(() => supabase.resetPassword(email), { context: 'forgot', withSuccess: false });
      if (successEl) {
        successEl.textContent = 'A secure recovery link has been sent to your email!';
        successEl.classList.remove('hidden');
        setTimeout(() => successEl.classList.add('hidden'), 5000);
      }
    } catch (err) {
      showError(errEl, err.message || 'Failed to send recovery link');
    }
  });
}

// ==================== ONBOARDING ASSESSMENT ENGINE ====================
function saveOnboardingDraft() {
  try {
    localStorage.setItem('linguAlphabet_onboarding_draft', JSON.stringify({
      userId: UserState.get('userId') || null,
      assessmentIndex: state.assessmentIndex,
      assessmentAnswers: state.assessmentAnswers,
      tempCEFR: state.tempCEFR,
      tempScores: state.tempScores
    }));
  } catch {}
}

function loadOnboardingDraft() {
  try {
    const data = localStorage.getItem('linguAlphabet_onboarding_draft');
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

function clearOnboardingDraft() {
  localStorage.removeItem('linguAlphabet_onboarding_draft');
}

function startOnboardingFlow() {
  const draft = loadOnboardingDraft();
  const currentUserId = UserState.get('userId') || null;
  if (draft?.userId && draft.userId !== currentUserId) {
    clearOnboardingDraft();
  }
  const activeDraft = draft?.userId && draft.userId !== currentUserId ? null : draft;
  if (activeDraft) {
    state.assessmentIndex = activeDraft.assessmentIndex;
    state.assessmentAnswers = activeDraft.assessmentAnswers;
    state.tempCEFR = activeDraft.tempCEFR;
    state.tempScores = activeDraft.tempScores;

    if (state.assessmentIndex >= 10) {
      gradeAssessment();
    } else {
      showOnboardingStep('qa');
      renderAssessmentQuestion();
    }
  } else {
    state.assessmentIndex = 0;
    state.assessmentAnswers = {};
    showOnboardingStep('welcome');
  }
}

function showOnboardingStep(stepId) {
  document.querySelectorAll('.onboarding-step').forEach(el => el.classList.remove('active'));
  const step = document.getElementById(`ob-step-${stepId}`);
  if (!step) return;
  step.classList.add('active');

  if (stepId === 'welcome') {
    const tutoArt = document.getElementById('ob-welcome-tuto');
    if (tutoArt) tutoArt.innerHTML = getTutoSVG(160);
  }
}

function getCurrentAdaptiveQuestion() {
  const testSkills = ['vocabulary', 'grammar', 'reading', 'listening', 'comprehension'];
  const idx = state.assessmentIndex; // 0 to 9
  
  if (idx < 5) {
    // First round: all skills at Medium difficulty
    const skill = testSkills[idx];
    return state.assessmentQuestions.find(q => q.skill === skill && q.difficulty === 'medium');
  } else {
    // Second round: adapt based on first round results
    const skill = testSkills[idx - 5];
    const firstQ = state.assessmentQuestions.find(q => q.skill === skill && q.difficulty === 'medium');
    const firstQCorrect = state.assessmentAnswers[firstQ.id] === firstQ.correct;
    
    const targetDiff = firstQCorrect ? 'hard' : 'easy';
    return state.assessmentQuestions.find(q => q.skill === skill && q.difficulty === targetDiff);
  }
}

function renderAssessmentQuestion() {
  const q = getCurrentAdaptiveQuestion();
  if (!q) {
    gradeAssessment();
    return;
  }

  state.currentAssessmentQuestion = q; // Save reference to current question
  state.selectedAssessmentIdx = null;
  const progressPct = ((state.assessmentIndex + 1) / 10) * 100;
  const progressFill = document.getElementById('ob-progress-fill');
  const skillEl = document.getElementById('ob-question-skill');
  const numEl = document.getElementById('ob-question-num');
  const questionCard = document.getElementById('ob-question-card');
  const optionsContainer = document.getElementById('ob-options-list');
  if (!progressFill || !skillEl || !numEl || !questionCard || !optionsContainer) return;

  progressFill.style.width = `${progressPct}%`;
  skillEl.textContent = q.skill.toUpperCase();
  numEl.textContent = `Question ${state.assessmentIndex + 1} of 10`;
  
  // Format question text with HTML linebreaks for Reading/Listening transcripts
  questionCard.innerHTML = q.question.replace(/\n/g, '<br>');

  optionsContainer.innerHTML = q.options.map((opt, i) => `
    <button class="ob-option-btn" data-idx="${i}">${opt}</button>
  `).join('');

  optionsContainer.querySelectorAll('.ob-option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      optionsContainer.querySelectorAll('.ob-option-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.selectedAssessmentIdx = parseInt(btn.dataset.idx);
      
      // Auto-advance after 300ms
      setTimeout(() => {
        state.assessmentAnswers[q.id] = state.selectedAssessmentIdx;
        state.assessmentIndex++;
        saveOnboardingDraft();
        if (state.assessmentIndex < 10) {
          renderAssessmentQuestion();
        } else {
          gradeAssessment();
        }
      }, 300);
    });
  });
}

function gradeAssessment() {
  const skills = ['vocabulary', 'grammar', 'reading', 'listening', 'comprehension'];
  const resultScores = {};

  skills.forEach(skill => {
    const qMedium = state.assessmentQuestions.find(q => q.skill === skill && q.difficulty === 'medium');
    const qEasy = state.assessmentQuestions.find(q => q.skill === skill && q.difficulty === 'easy');
    const qHard = state.assessmentQuestions.find(q => q.skill === skill && q.difficulty === 'hard');

    const ansMedium = state.assessmentAnswers[qMedium.id];
    const correctMedium = ansMedium === qMedium.correct;

    if (correctMedium) {
      const ansHard = state.assessmentAnswers[qHard.id];
      const correctHard = ansHard === qHard.correct;
      resultScores[skill] = correctHard ? 100 : 70;
    } else {
      const ansEasy = state.assessmentAnswers[qEasy.id];
      const correctEasy = ansEasy === qEasy.correct;
      resultScores[skill] = correctEasy ? 40 : 10;
    }
  });

  // Calculate Overall English Ability (average of core skills)
  const overallScore = Math.round((resultScores.vocabulary + resultScores.grammar + resultScores.reading + resultScores.listening + resultScores.comprehension) / 5);

  // Map to CEFR level & friendly labels
  let cefr = 'A1';
  let friendlyLevel = 'Beginner';
  if (overallScore >= 90) { cefr = 'C1'; friendlyLevel = 'Advanced'; }
  else if (overallScore >= 70) { cefr = 'B2'; friendlyLevel = 'Upper Intermediate'; }
  else if (overallScore >= 50) { cefr = 'B1'; friendlyLevel = 'Intermediate'; }
  else if (overallScore >= 30) { cefr = 'A2'; friendlyLevel = 'Elementary'; }

  state.tempCEFR = cefr;
  state.tempScores = {
    listening: resultScores.listening,
    vocabulary: resultScores.vocabulary,
    grammar: resultScores.grammar,
    comprehension: resultScores.comprehension,
    retention: resultScores.reading // Map Reading skill score to Retention slot
  };
  saveOnboardingDraft();

  // Find Strongest and Weakest Skills
  const strongest = skills.reduce((a, b) => resultScores[a] > resultScores[b] ? a : b);
  const weakest = skills.reduce((a, b) => resultScores[a] < resultScores[b] ? a : b);

  // Generate Personalized Recommendations & Roadmap
  let recGoal = 'General English';
  let suggestedMins = '20 min / day';
  if (cefr === 'A1' || cefr === 'A2') {
    recGoal = 'General English';
    suggestedMins = '15 min / day';
  } else if (cefr === 'B1') {
    recGoal = 'Speaking Fluency';
    suggestedMins = '30 min / day';
  } else if (cefr === 'B2') {
    recGoal = 'IELTS Preparation';
    suggestedMins = '30 min / day';
  } else if (cefr === 'C1') {
    recGoal = 'Academic English';
    suggestedMins = '45 min / day';
  }

  // Find Recommended First Lesson based on level
  const firstPod = state.podcasts.find(p => p.cefrLevel === cefr) || state.podcasts[0];

  // Render report card
  const reportCefr = document.getElementById('report-cefr-value');
  const reportSubtitle = document.querySelector('.report-cefr-subtitle');
  const reportList = document.getElementById('report-stat-list');
  const reportVocab = document.getElementById('report-stat-vocab');
  const reportGram = document.getElementById('report-stat-gram');
  const reportComp = document.getElementById('report-stat-comp');
  const reportRet = document.getElementById('report-stat-ret');
  const reportCoach = document.getElementById('ob-report-coach-card');
  if (!reportCefr || !reportSubtitle || !reportList || !reportVocab || !reportGram || !reportComp || !reportRet || !reportCoach) {
    showOnboardingStep('report');
    return;
  }

  reportCefr.textContent = cefr;
  reportSubtitle.textContent = friendlyLevel;

  reportList.textContent = `${resultScores.listening}%`;
  reportVocab.textContent = `${resultScores.vocabulary}%`;
  reportGram.textContent = `${resultScores.grammar}%`;
  reportComp.textContent = `${resultScores.comprehension}%`;
  reportRet.textContent = `${resultScores.reading}%`; // Display reading in retention slot

  // Display Friendly Outcome Roadmap & Insight
  reportCoach.innerHTML = `
    <div style="background:var(--bg-card);padding:14px;border-radius:12px;margin-bottom:14px;border:1px solid var(--border)">
      <div style="font-weight:700;color:var(--text-primary);margin-bottom:8px;font-size:13px;display:flex;align-items:center;gap:6px">
        <i class="fa-solid fa-star" style="color:var(--primary)"></i> Skill Profile
      </div>
      <div style="font-size:12px;color:var(--text-secondary);line-height:1.5">
        <div><strong>Strongest Competency:</strong> <span style="text-transform:capitalize;color:var(--text-primary);font-weight:600">${strongest}</span> (${resultScores[strongest]}%)</div>
        <div style="margin-top:6px"><strong>Target Focus Competency:</strong> <span style="text-transform:capitalize;color:var(--primary);font-weight:600">${weakest}</span> (${resultScores[weakest]}%)</div>
      </div>
    </div>
    <div style="background:var(--bg-card);padding:14px;border-radius:12px;border:1px solid var(--border)">
      <div style="font-weight:700;color:var(--text-primary);margin-bottom:8px;font-size:13px;display:flex;align-items:center;gap:6px">
        <i class="fa-solid fa-map-location-dot" style="color:var(--primary)"></i> Study Roadmap Recommendation
      </div>
      <div style="font-size:12px;color:var(--text-secondary);line-height:1.5">
        <div><strong>Suggested Goal:</strong> <span style="color:var(--text-primary);font-weight:600">${recGoal}</span></div>
        <div style="margin-top:6px"><strong>Daily Practice Time:</strong> <span style="color:var(--text-primary);font-weight:600">${suggestedMins}</span></div>
        <div style="margin-top:6px"><strong>Recommended First Lesson:</strong> <span style="color:var(--text-primary);font-weight:600">${firstPod ? firstPod.title : 'Limiting Screen Time'}</span></div>
      </div>
    </div>
  `;

  showOnboardingStep('report');
}

function generateLearningPlan() {
  const goalBtn = document.querySelector('.goal-btn.active');
  const targetGoal = goalBtn ? goalBtn.dataset.goal : 'IELTS 6.5';
  const dailyTime = parseInt(document.getElementById('ob-daily-time').value) || 20;

  UserState.saveAssessment(state.tempCEFR, state.tempScores);
  UserState.update({
    targetGoal,
    dailyTimeGoal: dailyTime,
    studyHoursGoal: targetGoal.includes('7.5') ? 120 : 60,
  });
  clearOnboardingDraft();

  // Inbox welcome
  UserState.addInboxItem({
    type: 'badge',
    title: 'English Profile Created',
    body: `Estimated CEFR: ${state.tempCEFR}. Roadmap targeted to: ${targetGoal}.`
  });

  showXPToast('Welcome! Plan Generated ✓');
  UserState.addXP(50);

  // Switch to main app
  document.getElementById('onboarding-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  navigateTo('home');
  renderAllViews();
}

// ==================== NAVIGATION ====================
function navigateTo(viewName) {
  state.currentView = viewName;
  UserState.set('lastActiveTab', viewName);

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add('active');

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  if (viewName === 'home') renderHome();
  if (viewName === 'explore') renderExplore();
  if (viewName === 'library') renderLibrary();
  if (viewName === 'inbox') renderInbox();
  if (viewName === 'profile') renderProfile();
}

// ==================== ADAPTIVE RECOMMENDATION ENGINE ====================
function getWeakestSkill() {
  const scores = UserState.get('learningScore') || { listening: 0, vocabulary: 0, grammar: 0, comprehension: 0, retention: 0 };
  let minSkill = 'listening';
  let minVal = 100;
  Object.entries(scores).forEach(([skill, val]) => {
    if (val < minVal) {
      minVal = val;
      minSkill = skill;
    }
  });
  return minSkill;
}

function getCompletedLessonCount() {
  return (UserState.get('completedPodcasts') || []).length;
}

function hasSufficientLearningData() {
  return getCompletedLessonCount() >= 2;
}

function getStreakCount() {
  return Number(UserState.get('streak')) || 0;
}

function getStreakLabel(streak = getStreakCount()) {
  const value = Number(streak) || 0;
  if (value <= 0) return 'No streak yet';
  if (value === 1) return '1 day streak';
  return `${value} day streak`;
}

function getBuildingProfileMessage() {
  return 'Coach Tuto is building your Learning Brain. Complete a couple of lessons and your personalized insights will appear here.';
}

function getRecommendedPodcasts() {
  const user = UserState._data;
  const userCefr = user.cefrLevel || 'A1';
  const weakSkill = getWeakestSkill();
  const goal = user.targetGoal || 'General English';
  const completed = user.completedPodcasts || [];
  const insights = user.learningMemory?.insights || {};
  const preferredLen = insights.preferredLessonLength || 6;

  const weakWords = user.learningMemory?.weakWords || [];
  const repeatedMistakes = user.learningMemory?.repeatedMistakes || [];

  let list = state.podcasts.filter(p => p.transcriptId !== null);

  const levelMap = { A1: 'Beginner', A2: 'Beginner', B1: 'Intermediate', B2: 'Intermediate', C1: 'Advanced', C2: 'Advanced' };
  const targetDiff = levelMap[userCefr] || 'Intermediate';

  const scored = list.map(pod => {
    let score = 0;
    const reasons = [];

    // 1. CEFR & Difficulty Level Alignment
    if (pod.cefrLevel === userCefr) {
      score += 50;
      reasons.push(`aligns with your target CEFR Level ${userCefr}`);
    } else if (pod.difficulty === targetDiff) {
      score += 35;
      reasons.push(`matches your target difficulty group (${targetDiff})`);
    } else {
      score += 10;
    }

    // 2. Weakest Skill Targeting
    const trainsWeakSkill = pod.skills && pod.skills.some(s => s.toLowerCase() === weakSkill.toLowerCase());
    if (trainsWeakSkill) {
      score += 40;
      reasons.push(`targets your active improvement area: ${weakSkill.toUpperCase()}`);
    }

    // 3. Goal Alignment
    const matchesGoal = pod.targetGoals && pod.targetGoals.some(g => g.toLowerCase() === goal.toLowerCase());
    if (matchesGoal) {
      score += 25;
      reasons.push(`supports your prep target for ${goal}`);
    }

    // 4. Session Duration Alignment
    const durationDiff = Math.abs(pod.duration - preferredLen);
    if (durationDiff <= 3) {
      score += 15;
      reasons.push(`fits your average study span of ${preferredLen} mins`);
    }

    // 5. Forgotten Vocabulary Check
    const containsWeakWords = pod.flashcards && pod.flashcards.some(fc => weakWords.includes(fc.word));
    if (containsWeakWords) {
      score += 30;
      reasons.push(`reviews vocabulary you recently found difficult`);
    }

    // 6. Repeated Grammar Mistakes Check
    const containsMistakeTopics = pod.grammarTopics && pod.grammarTopics.some(topic => {
      return repeatedMistakes.some(m => m.toLowerCase().includes(topic.toLowerCase()));
    });
    if (containsMistakeTopics) {
      score += 20;
      reasons.push(`reinforces grammar concepts you previously got wrong`);
    }

    // 7. Completion status
    if (completed.includes(pod.podcastId)) {
      score -= 100; // Demote completed lessons
    } else {
      score += 15; // Prefer new content
    }

    return {
      pod,
      score,
      reasons
    };
  });

  scored.sort((a, b) => b.score - a.score);
  
  return scored.map(item => {
    const bulletList = item.reasons.length > 0
      ? item.reasons.map(r => `✓ ${r}`)
      : [`✓ Selected to build overall listening and vocabulary skills`];
    
    return {
      ...item.pod,
      recommendationReasons: bulletList,
      recommendationScore: item.score
    };
  });
}

function getRecommendationReason(pod) {
  if (pod.recommendationReasons && pod.recommendationReasons.length > 0) {
    return pod.recommendationReasons[0];
  }
  return `Selected to boost your general English proficiency.`;
}

// ==================== HOME VIEW RENDER ====================
function renderHome() {
  const user = UserState._data;
  
  // Hello & Level title
  document.getElementById('home-hello').textContent = `${getGreeting()}, ${user.username}! 👋`;
  document.getElementById('home-xp-label').textContent = `${user.cefrLevel || 'A1'} Level · Goal: ${user.targetGoal || 'IELTS 6.5'}`;
  document.getElementById('home-streak-num').textContent = getStreakCount();

  // Study Roadmap stats & quest updates
  const progress = UserState.get('progress') || {};
  let dailyListenSec = 0;
  Object.values(progress).forEach(p => {
    if (p.updatedAt && new Date(p.updatedAt).toDateString() === new Date().toDateString()) {
      dailyListenSec += p.position || 0;
    }
  });
  const dailyMins = Math.round(dailyListenSec / 60);

  // Increment listen minutes daily task progress
  const questsList = UserState.get('quests') || [];
  const listenQ = questsList.find(q => q.type === 'listen');
  if (listenQ && listenQ.current !== dailyMins) {
    listenQ.current = Math.min(listenQ.goal, dailyMins);
    if (listenQ.current >= listenQ.goal && !listenQ.completed) {
      listenQ.completed = true;
      UserState.addXP(listenQ.xp);
      showXPToast(`+${listenQ.xp} XP — Task Completed: ${listenQ.name}!`);
    }
    UserState.update({ quests: questsList });
  }

  // Render dynamic learning path timeline
  renderDailyLearningPath();

  // Update Tuto AI Coach Bubble
  updateTutoCoach('home');

  renderQuests();
  renderSrsReview();
  renderContinueListening();
  renderPodcastGrid('popular-podcasts-grid', state.podcasts.slice(0, 6));
}

function renderDailyLearningPath() {
  const user = UserState._data;
  const progress = UserState.get('progress') || {};
  const completed = user.completedPodcasts || [];
  const vocab = UserState.get('vocabulary') || [];
  const pathStep = Number(user.pathStep) || 1;
  
  let dailyListenSec = 0;
  Object.values(progress).forEach(p => {
    if (p.updatedAt && new Date(p.updatedAt).toDateString() === new Date().toDateString()) {
      dailyListenSec += p.position || 0;
    }
  });
  const dailyMins = Math.round(dailyListenSec / 60);
  const timeGoal = user.dailyTimeGoal || 20;
  const goalPercent = Math.min(100, Math.round((dailyMins / timeGoal) * 100));
  const minsRemaining = Math.max(0, timeGoal - dailyMins);

  const recommended = getRecommendedPodcasts();
  const nextPod = recommended[0];
  if (!nextPod) {
    const container = document.getElementById('daily-learning-path-container');
    if (container) container.innerHTML = `<div style="text-align:center;padding:12px;color:var(--text-secondary)">No lessons available</div>`;
    return;
  }

  const podCompleted = completed.includes(nextPod.podcastId);
  const srsWords = vocab.filter(w => w.srsDate && w.srsDate <= Date.now()).length;
  const srsCompleted = srsWords === 0;

  const container = document.getElementById('daily-learning-path-container');
  if (!container) return;

  const grammarTopic = nextPod.grammarTopics?.[0] || 'Present Simple';
  const grammarSent = nextPod.grammarSentences?.[0] || { sentence: 'Practice makes perfect.', explanation: 'Simple statement' };

  const streakCount = getStreakCount();
  const showInsights = hasSufficientLearningData();
  const weakSkill = getWeakestSkill();

  // 1. Today's personalized focus card
  let goalFocusText = '';
  if (!showInsights) {
    goalFocusText = `Start today's recommended lesson and help Coach Tuto build your Learning Brain.`;
  } else if (weakSkill.toLowerCase() === 'listening') {
    goalFocusText = `Improve listening accuracy through today's BBC lesson while reinforcing ${grammarTopic}.`;
  } else if (weakSkill.toLowerCase() === 'grammar') {
    goalFocusText = `Strengthen grammatical confidence by analyzing contextual patterns of ${grammarTopic} in today's lesson.`;
  } else if (weakSkill.toLowerCase() === 'vocabulary') {
    goalFocusText = `Reinforce academic vocabulary and save target terms in context from "${nextPod.title}".`;
  } else if (weakSkill.toLowerCase() === 'comprehension') {
    goalFocusText = `Consolidate active comprehension and test reading speed with today's lesson check.`;
  } else {
    goalFocusText = `Review scheduled spaced recall flashcards and test retention stability.`;
  }

  const goalHtml = `
    <div style="background: linear-gradient(135deg, rgba(255,107,53,0.08), rgba(255,140,90,0.02)); border: 1px solid rgba(255,107,53,0.18); border-radius: 12px; padding: 10px 12px; margin-bottom: 16px">
      <div style="display: flex; justify-content: space-between; align-items: center">
        <div style="font-size: 10px; font-weight: 800; color: var(--primary); text-transform: uppercase; letter-spacing: 0.5px">🎯 Today's Focus</div>
        <div style="font-size: 10px; color: var(--text-tertiary); font-weight: 600">🔥 ${getStreakLabel(streakCount)}</div>
      </div>
      <p style="font-size: 12px; color: var(--text-primary); margin-top: 4px; line-height: 1.35; font-weight: 700">${goalFocusText}</p>
      
      <div style="margin-top: 8px; display: flex; align-items: center; gap: 10px">
        <div style="flex: 1">
          <div class="progress-bar-track" style="height: 5px; background: rgba(0,0,0,0.05); border-radius: 10px">
            <div class="progress-bar-fill" style="width: ${goalPercent}%; background: var(--primary); border-radius: 10px"></div>
          </div>
        </div>
        <div style="font-size: 10.5px; font-weight: 700; color: var(--text-secondary); white-space: nowrap">
          ${dailyMins}/${timeGoal}m (${goalPercent}%) · ${minsRemaining > 0 ? `${minsRemaining}m left` : 'Done! ✓'}
        </div>
      </div>
    </div>
  `;

  const getStepClass = (stepIndex) => {
    if (stepIndex < pathStep) return 'completed';
    if (stepIndex === pathStep) return 'current';
    return 'future';
  };

  const reasonsHtml = nextPod.recommendationReasons
    ? nextPod.recommendationReasons.map(r => `
        <div style="font-size: 11px; color: var(--text-secondary); line-height: 1.3; display: flex; align-items: flex-start; gap: 6px; margin-top: 3px">
          <i class="fa-solid fa-circle-check" style="color: var(--primary); font-size: 10px; margin-top: 2px; flex-shrink: 0"></i>
          <span>${r}</span>
        </div>
      `).join('')
    : `
        <div style="font-size: 11px; color: var(--text-secondary); line-height: 1.3; display: flex; align-items: flex-start; gap: 6px; margin-top: 3px">
          <i class="fa-solid fa-circle-check" style="color: var(--primary); font-size: 10px; margin-top: 2px; flex-shrink: 0"></i>
          <span>Selected to build overall listening skills</span>
        </div>
      `;

  container.innerHTML = `
    ${goalHtml}

    <div class="daily-path-container">
      <!-- Step 1: Recommended Podcast -->
      <div class="daily-path-step ${getStepClass(1)}" id="path-step-podcast">
        <div class="daily-path-node">
          ${pathStep > 1 ? '<i class="fa-solid fa-check"></i>' : '1'}
        </div>
        <div class="daily-path-content" id="path-podcast-card" style="cursor: pointer">
          <div class="daily-path-title">
            <span>Step 1: Recommended Podcast</span>
            ${pathStep > 1 ? '<span style="color:var(--success); font-size:10px">✓ Done</span>' : ''}
          </div>
          <div class="continue-card" style="margin: 10px 0 0; padding: 12px; border: 1px solid var(--border-light); background: var(--bg); border-radius: var(--r-md); display: flex; align-items: flex-start; gap: 12px; box-shadow: none">
            <div class="continue-artwork" style="width: 48px; height: 48px; border-radius: 6px; overflow: hidden; flex-shrink: 0; background: var(--border-light)">
              ${getSafeImageHtml(nextPod.coverImage, nextPod.title)}
            </div>
            <div class="continue-info" style="flex: 1; min-width: 0">
              <div class="continue-title" style="font-size: 13.5px; font-weight: 800; color: var(--text-primary); line-height: 1.35; margin-bottom: 6px">${nextPod.title}</div>
              <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px">
                ${reasonsHtml}
              </div>
              <div style="margin-top: 4px">
                <span class="diff-badge ${getDiffClass(nextPod.difficulty)}" style="padding: 3px 8px; font-size: 10px; font-weight: 700">${nextPod.cefrLevel} · ${nextPod.difficulty}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Step 2: Grammar Focus -->
      <div class="daily-path-step ${getStepClass(2)}" id="path-step-grammar">
        <div class="daily-path-node">
          ${pathStep > 2 ? '<i class="fa-solid fa-check"></i>' : '2'}
        </div>
        <div class="daily-path-content" id="path-grammar-card">
          <div class="daily-path-title">
            <span>Step 2: Grammar in Context</span>
            ${pathStep > 2 ? '<span style="color:var(--success); font-size:10px">✓ Done</span>' : ''}
          </div>
          <div style="margin-top: 6px; font-size: 12px; color: var(--text-secondary); background: var(--bg-light); padding: 10px; border-radius: 8px">
            <div style="font-weight: 700; color: var(--primary); font-size: 11px; text-transform: uppercase">${grammarTopic}</div>
            <div style="font-style: italic; color: var(--text-primary); margin-top: 4px">"${grammarSent.sentence}"</div>
            <div style="font-size: 11px; margin-top: 4px; opacity: 0.95">${grammarSent.explanation}</div>
            
            ${pathStep === 2 ? `
              <button class="btn-primary" id="path-grammar-expand-btn" style="margin-top: 10px; padding: 8px 12px; font-size: 11px; width: 100%">
                Analyze Grammar Structure
              </button>
            ` : ''}
          </div>
        </div>
      </div>

      <!-- Step 3: Vocabulary Review -->
      <div class="daily-path-step ${getStepClass(3)}" id="path-step-vocab">
        <div class="daily-path-node">
          ${pathStep > 3 ? '<i class="fa-solid fa-check"></i>' : '3'}
        </div>
        <div class="daily-path-content" id="path-vocab-card" style="cursor: pointer">
          <div class="daily-path-title">
            <span>Step 3: Vocabulary Review</span>
            ${pathStep > 3 ? '<span style="color:var(--success); font-size:10px">✓ Done</span>' : `<span style="font-size: 10px; color: var(--primary)">${srsWords} due</span>`}
          </div>
          <div class="daily-path-subtitle">
            ${pathStep > 3 ? 'All words caught up for today! Nice job.' : `You have <strong>${srsWords} words</strong> due for spaced repetition review.`}
          </div>
        </div>
      </div>

      <!-- Step 4: Quiz -->
      <div class="daily-path-step ${getStepClass(4)}" id="path-step-quiz">
        <div class="daily-path-node">
          ${pathStep > 4 ? '<i class="fa-solid fa-check"></i>' : '4'}
        </div>
        <div class="daily-path-content" id="path-quiz-card" style="cursor: pointer">
          <div class="daily-path-title">
            <span>Step 4: Comprehension Quiz</span>
            ${pathStep > 4 ? '<span style="color:var(--success); font-size:10px">✓ Done</span>' : ''}
          </div>
          <div class="daily-path-subtitle">
            Answer lesson comprehension questions to lock in learning points.
          </div>
        </div>
      </div>

      <!-- Step 5: Reflection -->
      <div class="daily-path-step ${getStepClass(5)}" id="path-step-reflection">
        <div class="daily-path-node">
          ${pathStep > 5 ? '<i class="fa-solid fa-check"></i>' : '5'}
        </div>
        <div class="daily-path-content" id="path-reflection-card">
          <div class="daily-path-title">
            <span>Step 5: Coach Tuto's Reflection</span>
            ${pathStep > 5 ? '<span style="color:var(--success); font-size:10px">✓ Done</span>' : ''}
          </div>
          <div class="daily-path-subtitle" id="path-reflection-card-text">
            ${pathStep > 4 ? 'Completed active recall session. Coach review is ready.' : 'Unlock after completing today\'s recommended lesson quiz.'}
            
            ${pathStep === 5 ? `
              <button class="btn-primary" id="path-reflection-next-btn" style="margin-top: 10px; padding: 8px 12px; font-size: 11px; width: 100%">
                Preview Tomorrow's Agenda
              </button>
            ` : ''}
          </div>
        </div>
      </div>

      <!-- Step 6: Tomorrow's Preview -->
      <div class="daily-path-step ${getStepClass(6)}" id="path-step-tomorrow" style="cursor: pointer">
        <div class="daily-path-node">
          <i class="fa-solid fa-arrow-right"></i>
        </div>
        <div class="daily-path-content">
          <div class="daily-path-title">
            <span>Step 6: Tomorrow's Preview</span>
          </div>
          <div class="daily-path-subtitle">
            Click here to preview tomorrow's study agenda, due reviews, and streak alerts!
          </div>
        </div>
      </div>
    </div>
  `;

  // Attach event listeners
  if (pathStep === 1 || pathStep > 1) {
    container.querySelector('#path-podcast-card')?.addEventListener('click', () => {
      if (pathStep === 1) {
        loadPodcast(nextPod.podcastId, { autoPlay: true });
        return;
      }
      openPodcastDetail(nextPod.podcastId);
    });
  }

  if (pathStep === 2) {
    container.querySelector('#path-grammar-expand-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      user.pathStep = 3;
      UserState.save();
      renderHome();
      showLearningFeedback("Grammar skills reinforced! (+10 XP)");
      setTimeout(() => {
        document.getElementById('path-step-vocab')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 600);
    });
  }

  if (pathStep === 3) {
    container.querySelector('#path-vocab-card')?.addEventListener('click', () => {
      if (srsWords > 0) {
        openFlashcards(vocab.filter(w => w.srsDate && w.srsDate <= Date.now()));
      } else {
        user.pathStep = 4;
        UserState.save();
        renderHome();
        showLearningFeedback("Vocabulary reviews caught up!");
        setTimeout(() => {
          document.getElementById('path-step-quiz')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 600);
      }
    });
  }

  if (pathStep === 4) {
    container.querySelector('#path-quiz-card')?.addEventListener('click', () => {
      launchActiveLearning(nextPod);
    });
  }

  if (pathStep === 5) {
    container.querySelector('#path-reflection-next-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      user.pathStep = 6;
      UserState.save();
      renderHome();
      showLearningFeedback("Retention memory mapped! (+5 XP)");
      setTimeout(() => {
        document.getElementById('path-step-tomorrow')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        showTomorrowPreviewModal(false);
      }, 600);
    });
  }

  if (pathStep === 6) {
    container.querySelector('#path-step-tomorrow')?.addEventListener('click', () => {
      showTomorrowPreviewModal(false);
    });
  }
}

// ==================== TUTO AI COACH CARD ====================
function updateTutoCoach(view = 'home') {
  const user = UserState._data;
  const coachText = document.getElementById(`${view}-coach-text`);
  const coachActions = document.getElementById(`${view}-coach-actions`);
  const coachAvatar = document.getElementById(`${view}-coach-avatar`);

  if (!coachText || !coachActions) return;
  if (coachAvatar) coachAvatar.innerHTML = getTutoSVG(64);

  const vocab = UserState.get('vocabulary') || [];
  const srsCount = vocab.filter(w => w.srsDate && w.srsDate <= Date.now()).length;
  const showInsights = hasSufficientLearningData();
  const weakSkill = getWeakestSkill();
  const scores = user.learningScore || { listening: 0, vocabulary: 0, grammar: 0, comprehension: 0, retention: 0 };
  const weakSkillVal = scores[weakSkill] || 0;
  const pathStep = Number(user.pathStep) || 1;
  
  let quip = '';
  let actions = [];

  if (!showInsights) {
    quip = getBuildingProfileMessage();
  } else if (view === 'home') {
    if (pathStep === 1) {
      quip = `Welcome! Today's podcast is curated because it targets your **${weakSkill}** skill (currently at **${weakSkillVal}%**). Start listening now!`;
    } else if (pathStep === 2) {
      quip = `Excellent job completing that podcast! Next up: let's analyze the **grammar topic** used in this context to boost your grammar confidence.`;
    } else if (pathStep === 3) {
      quip = `You have **${srsCount} vocabulary words** scheduled for spaced recall review. Reviewing them now will strengthen your **retention score**!`;
      actions.push({ label: 'Review Vocab', action: 'review_words' });
    } else if (pathStep === 4) {
      quip = `Vocabulary deck completed! Now launch the comprehension quiz to evaluate your reading and grammar consolidation.`;
    } else if (pathStep === 5) {
      quip = `Quiz completed! Check out my detailed session feedback below, and preview tomorrow's study plan.`;
    } else {
      quip = `All study steps completed for today! Awesome streak momentum (Streak: **${getStreakCount()} days** 🔥). See you tomorrow!`;
    }
  } else {
    if (srsCount > 0) {
      quip = `You have **${srsCount} vocabulary items** due. Spaced recall exercises today will raise your **retention score**!`;
      actions.push({ label: 'Start Review', action: 'review_words' });
    } else if (weakSkillVal < 50) {
      quip = `Your **${weakSkill} score** (${weakSkillVal}%) is currently below 50% and needs focus. I've tailored tomorrow's lessons to target this gap.`;
    } else if (getStreakCount() > 0) {
      quip = `Awesome job! You have a **${getStreakCount()}-day streak** 🔥. Keep up the momentum to master your **${user.targetGoal}** goal!`;
    } else {
      quip = `Welcome back! Ready to continue your roadmap for **${user.targetGoal}**? I've prepared today's lessons for you.`;
    }
  }

  coachText.innerHTML = renderMarkdown(quip);
  coachActions.innerHTML = actions.map(act => `
    <button class="coach-action-btn" data-action="${act.action}" style="background:var(--primary);color:white;padding:6px 12px;border-radius:var(--r-sm);font-size:11px;font-weight:600;border:none;cursor:pointer">${act.label}</button>
  `).join('');

  coachActions.querySelectorAll('.coach-action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'review_words') {
        openFlashcards(vocab.filter(w => w.srsDate && w.srsDate <= Date.now()));
      }
    });
  });
}

// ==================== PROFILE VIEW RENDER ====================
function renderProfile() {
  const user = UserState._data;
  const scores = user.learningScore || { listening: 0, vocabulary: 0, grammar: 0, comprehension: 0, retention: 0 };

  // CEFR & Target badges
  document.getElementById('db-cefr-current').textContent = user.cefrLevel || 'A1';
  document.getElementById('db-cefr-target').textContent = user.targetGoal || 'IELTS 6.5';

  const showInsights = hasSufficientLearningData();
  const scoreChart = document.getElementById('learning-score-chart');
  if (scoreChart) {
    if (!showInsights) {
      scoreChart.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:20px 12px;font-size:12px;color:var(--text-secondary);line-height:1.5">Building your profile...</div>`;
    } else {
      const skillMap = {
        listening: 'list',
        vocabulary: 'vocab',
        grammar: 'gram',
        comprehension: 'comp',
        retention: 'ret'
      };
      Object.entries(scores).forEach(([skill, val]) => {
        const shortKey = skillMap[skill] || skill;
        const fillEl = document.getElementById(`score-fill-${shortKey}`);
        const txtEl = document.getElementById(`score-txt-${shortKey}`);
        if (fillEl) fillEl.style.height = `${val}%`;
        if (txtEl) txtEl.textContent = `${val}%`;
      });
    }
  }

  // Detailed Outcome grid values
  document.getElementById('db-val-mastered').textContent = (user.learningMemory?.masteredWords || []).length;
  document.getElementById('db-val-hours').textContent = `${Math.round(user.totalMinutes / 60)}h`;
  document.getElementById('db-val-weekly').textContent = showInsights
    ? `${Math.round(Object.values(scores).reduce((a,b)=>a+b,0) / 5)}`
    : '—';

  // Tuto AI Coach bubble in Profile
  updateTutoCoach('profile');

  // Settings Labels
  const goalSub = document.getElementById('settings-goal-sub');
  if (goalSub) goalSub.textContent = user.targetGoal || 'IELTS 6.5';

  const dailySub = document.getElementById('settings-daily-sub');
  if (dailySub) dailySub.textContent = `${user.dailyTimeGoal || 15} mins / day`;

  const reminderSub = document.getElementById('settings-reminder-sub');
  if (reminderSub) reminderSub.textContent = user.dailyReminder || 'Enabled (9:00 AM)';

  const upgradeBtn = document.getElementById('settings-upgrade-btn');
  if (upgradeBtn) {
    if (user.isGuest) {
      upgradeBtn.classList.remove('hidden');
    } else {
      upgradeBtn.classList.add('hidden');
    }
  }

  // Render dynamic Profile switch panels (Timeline, Weekly, Predictions)
  renderProfileInsights();

  // Badge list, leaderboard, quests
  renderQuests();
  checkBadges();
  renderBadges();
  renderLeaderboard();
}

function renderProfileInsights() {
  const user = UserState._data;
  const vocab = user.vocabulary || [];
  const notes = user.notes || [];
  const bookmarks = user.bookmarks || [];
  const completed = user.completedPodcasts || [];

  // Compile timeline items
  const items = [];
  
  vocab.forEach(v => {
    items.push({
      type: 'vocab',
      title: `Saved vocabulary: "${v.word}"`,
      desc: `Learned POS: ${v.pos || 'Word'}`,
      date: v.savedAt || Date.now()
    });
  });

  notes.forEach(n => {
    items.push({
      type: 'note',
      title: `Added a study note`,
      desc: `"${n.content.substring(0, 40)}${n.content.length > 40 ? '...' : ''}"`,
      date: n.createdAt || Date.now()
    });
  });

  bookmarks.forEach(b => {
    items.push({
      type: 'bookmark',
      title: `Bookmarked audio segment`,
      desc: `At position ${formatTime(b.time || 0)}`,
      date: b.createdAt || Date.now()
    });
  });

  // Let's check completed podcasts progress dates
  const progress = user.progress || {};
  completed.forEach(id => {
    const p = progress[id];
    const pod = state.podcasts.find(item => item.podcastId === id);
    if (pod) {
      items.push({
        type: 'podcast',
        title: `Completed Lesson`,
        desc: pod.title,
        date: p?.updatedAt || Date.now()
      });
    }
  });

  // Sort descending
  items.sort((a, b) => b.date - a.date);

  // Group by date
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const groups = {
    today: [],
    yesterday: [],
    thisWeek: [],
    lastWeek: [],
    lastMonth: []
  };

  items.forEach(item => {
    const diff = now - item.date;
    if (diff < dayMs) groups.today.push(item);
    else if (diff < 2 * dayMs) groups.yesterday.push(item);
    else if (diff < 7 * dayMs) groups.thisWeek.push(item);
    else if (diff < 14 * dayMs) groups.lastWeek.push(item);
    else groups.lastMonth.push(item);
  });

  const timelineContainer = document.getElementById('profile-timeline-list');
  if (timelineContainer) {
    let html = '';
    const renderGroup = (label, list) => {
      if (list.length === 0) return '';
      return `
        <div style="margin-bottom:14px">
          <div style="font-size:11px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;margin-bottom:8px;letter-spacing:0.5px">${label}</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${list.map(item => {
              let icon = '📖';
              if (item.type === 'vocab') icon = '🧠';
              if (item.type === 'note') icon = '📝';
              if (item.type === 'bookmark') icon = '🔖';
              return `
                <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:10px 12px;display:flex;align-items:center;gap:10px">
                  <span style="font-size:16px">${icon}</span>
                  <div style="min-width:0;flex:1">
                    <div style="font-size:12px;font-weight:700;color:white;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.title}</div>
                    <div style="font-size:11px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">${item.desc}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    };

    html += renderGroup('Today', groups.today);
    html += renderGroup('Yesterday', groups.yesterday);
    html += renderGroup('This Week', groups.thisWeek);
    html += renderGroup('Last Week', groups.lastWeek);
    html += renderGroup('Last Month', groups.lastMonth);

    if (items.length === 0) {
      html = `<div style="text-align:center;padding:20px;font-size:12px;color:var(--text-secondary)">No study activities recorded yet</div>`;
    }

    timelineContainer.innerHTML = html;
  }

  // Render Weekly Report
  const statsGrid = document.getElementById('weekly-report-stats-grid');
  if (statsGrid) {
    if (!hasSufficientLearningData()) {
      statsGrid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:16px;font-size:12px;color:var(--text-secondary)">Building your profile...</div>`;
    } else {
    const scores = user.learningScore || { listening: 0, vocabulary: 0, grammar: 0, comprehension: 0, retention: 0 };
    const avgScore = Math.round(Object.values(scores).reduce((a,b)=>a+b,0)/5);
    statsGrid.innerHTML = `
      <div style="background:var(--bg-light);border:1px solid var(--border);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:16px;font-weight:800;color:var(--primary)">${completed.length}</div>
        <div style="font-size:10px;color:var(--text-secondary);margin-top:2px">Lessons Completed</div>
      </div>
      <div style="background:var(--bg-light);border:1px solid var(--border);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:16px;font-weight:800;color:var(--primary)">${vocab.length}</div>
        <div style="font-size:10px;color:var(--text-secondary);margin-top:2px">Words Learned</div>
      </div>
      <div style="background:var(--bg-light);border:1px solid var(--border);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:16px;font-weight:800;color:var(--primary)">${avgScore}%</div>
        <div style="font-size:10px;color:var(--text-secondary);margin-top:2px">Average Score</div>
      </div>
      <div style="background:var(--bg-light);border:1px solid var(--border);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:16px;font-weight:800;color:var(--primary)">+${getStreakCount() * 5}%</div>
        <div style="font-size:10px;color:var(--text-secondary);margin-top:2px">Consistency Growth</div>
      </div>
    `;
    }
  }

  const adviceEl = document.getElementById('weekly-report-advice');
  if (adviceEl) {
    if (!hasSufficientLearningData()) {
      adviceEl.innerHTML = `
        <p style="font-size:11px;color:var(--text-secondary);line-height:1.4;margin:0">${getBuildingProfileMessage()}</p>
      `;
    } else {
    const weakSkill = getWeakestSkill();
    const insights = user.learningMemory?.insights || {};
    adviceEl.innerHTML = `
      <div style="font-size:11px;font-weight:700;color:white;margin-bottom:4px;display:flex;align-items:center;gap:4px">
        <span>💡</span> COACH TUTO ADVICE
      </div>
      <p style="font-size:11px;color:var(--text-secondary);line-height:1.4;margin:0">
        Based on your preferred learning style: <strong>${insights.preferredLearningStyle || 'Auditory-Visual'}</strong>, we recommend reviewing vocabulary daily.
        Your attention span averages <strong>${insights.averageAttentionSpan || 6} minutes</strong>. Keep lessons short.
        Your weakest competency is <strong>${weakSkill.toUpperCase()}</strong>. Target tomorrow's exercises specifically on this skill.
      </p>
    `;
    }
  }

  // Render Predictions Panel
  const predictionsContainer = document.getElementById('predictions-list');
  if (predictionsContainer) {
    if (!hasSufficientLearningData()) {
      predictionsContainer.innerHTML = `
        <div style="background:var(--bg-light);border:1px solid var(--border);border-radius:8px;padding:16px;text-align:center;font-size:12px;color:var(--text-secondary)">
          Building your profile...
        </div>
      `;
    } else {
    const dailyMins = user.dailyTimeGoal || 20;
    const currentLevel = user.cefrLevel || 'A1';
    
    const levelTargets = { A1: 'A2', A2: 'B1', B1: 'B2', B2: 'C1', C1: 'C2', C2: 'Complete' };
    const targetLevel = levelTargets[currentLevel] || 'C2';
    
    const hoursNeeded = 100;
    const minsNeeded = hoursNeeded * 60;
    const daysToTarget = Math.round(minsNeeded / dailyMins);
    
    let goalTarget = user.targetGoal || 'IELTS 6.5';
    let daysToIELTS = Math.round((200 * 60) / dailyMins);

    predictionsContainer.innerHTML = `
      <!-- Prediction 1: Next CEFR Level -->
      <div style="background:var(--bg-light);border:1px solid var(--border);border-radius:8px;padding:12px">
        <div style="font-size:11px;font-weight:700;color:var(--primary);margin-bottom:4px;text-transform:uppercase">Next CEFR Transition</div>
        <div style="font-size:13px;font-weight:700;color:white;display:flex;justify-content:space-between">
          <span>${currentLevel} ➔ ${targetLevel}</span>
          <span style="color:var(--primary)">~${daysToTarget} days</span>
        </div>
        <p style="font-size:11px;color:var(--text-secondary);margin-top:4px;margin-bottom:0">Estimated study time required to advance: 100 hours at your current daily goal of ${dailyMins}m.</p>
      </div>

      <!-- Prediction 2: IELTS Score Target -->
      <div style="background:var(--bg-light);border:1px solid var(--border);border-radius:8px;padding:12px">
        <div style="font-size:11px;font-weight:700;color:var(--primary);margin-bottom:4px;text-transform:uppercase">IELTS Goal Target Prediction</div>
        <div style="font-size:13px;font-weight:700;color:white;display:flex;justify-content:space-between">
          <span>Target: ${goalTarget}</span>
          <span style="color:var(--primary)">~${daysToIELTS} days</span>
        </div>
        <p style="font-size:11px;color:var(--text-secondary);margin-top:4px;margin-bottom:0">Estimate to score ${goalTarget} on academic IELTS based on your learning speed metrics.</p>
      </div>

      <!-- Prediction 3: Vocabulary Milestones -->
      <div style="background:var(--bg-light);border:1px solid var(--border);border-radius:8px;padding:12px">
        <div style="font-size:11px;font-weight:700;color:var(--primary);margin-bottom:4px;text-transform:uppercase">Vocabulary Mastery Pace</div>
        <div style="font-size:13px;font-weight:700;color:white;display:flex;justify-content:space-between">
          <span>Reach 500 mastered words</span>
          <span style="color:var(--primary)">~${Math.max(10, Math.round(500 / Math.max(1, vocab.length)) * 3)} days</span>
        </div>
        <p style="font-size:11px;color:var(--text-secondary);margin-top:4px;margin-bottom:0">Based on your current retention rate of saving ${vocab.length} words.</p>
      </div>
    `;
    }
  }
}

function showTomorrowPreviewModal(isLogoutTrigger = false) {
  const user = UserState._data;
  const vocab = UserState.get('vocabulary') || [];
  
  // Calculate reviews scheduled in next 24 hours
  const dueTomorrowCount = vocab.filter(w => w.nextReview && w.nextReview <= Date.now() + 24 * 60 * 60 * 1000).length;
  
  document.getElementById('tomorrow-streak-val').textContent = getStreakCount();
  document.getElementById('tomorrow-reviews-badge').textContent = dueTomorrowCount;
  document.getElementById('tomorrow-reviews-sub').textContent = `${dueTomorrowCount} word${dueTomorrowCount === 1 ? '' : 's'} scheduled for spaced recall`;

  // Next podcast in recommendation queue
  const recommended = getRecommendedPodcasts();
  const nextPod = recommended[1] || recommended[0];
  const nextCard = document.getElementById('tomorrow-next-podcast-card');
  
  if (nextPod) {
    nextCard.innerHTML = `
      <div class="continue-card" style="margin: 0; padding: 0; border: none; background: none">
        <div class="continue-artwork" style="width: 44px; height: 44px">
          ${getSafeImageHtml(nextPod.coverImage, nextPod.title)}
        </div>
        <div class="continue-info">
          <div class="continue-title" style="font-size: 13px; color: white">${nextPod.title}</div>
          <div class="continue-meta" style="font-size: 11px; margin-bottom: 0; color: var(--text-secondary)">
            ${nextPod.cefrLevel} · ${nextPod.difficulty} · ${nextPod.duration} min
          </div>
        </div>
      </div>
    `;
  } else {
    nextCard.innerHTML = `<div style="font-size:12px;color:var(--text-secondary)">No upcoming podcasts scheduled</div>`;
  }

  // Handle logout button visibility
  const logoutBtn = document.getElementById('tomorrow-preview-logout-btn');
  if (logoutBtn) {
    if (isLogoutTrigger) {
      logoutBtn.classList.remove('hidden');
    } else {
      logoutBtn.classList.add('hidden');
    }
  }

  showModal('tomorrow-preview-overlay');
}

// ==================== ACTIVE LEARNING POST-PLAY SESSION ====================
function launchActiveLearning(podcast) {
  state.activePodcast = podcast;
  state.activeLearningStep = 'prompt';

  // Render Tuto in prompt step
  document.getElementById('al-prompt-tuto-art').innerHTML = getTutoSVG(120);
  
  showActiveLearningStep('prompt');
  showModal('active-learning-overlay');
}

function showActiveLearningStep(stepId) {
  state.activeLearningStep = stepId;
  document.querySelectorAll('.al-step').forEach(el => el.classList.remove('active'));
  document.getElementById(`al-step-${stepId}`).classList.add('active');

  if (stepId === 'flashcards') {
    startActiveFlashcards();
  } else if (stepId === 'quiz') {
    startActiveQuiz();
  } else if (stepId === 'reflection') {
    startActiveReflection();
  }
}

function getActivePodcast() {
  return state.activePodcast || state.currentPodcast || null;
}

async function startActiveFlashcards() {
  const currentPod = getActivePodcast();
  const podcastWords = currentPod?.flashcards || [];

  state.activeFlashcards = podcastWords;
  state.activeFlashcardIndex = 0;
  renderActiveFlashcard();
}

function renderActiveFlashcard() {
  const card = state.activeFlashcards[state.activeFlashcardIndex];
  if (!card) {
    showActiveLearningStep('quiz');
    return;
  }

  document.getElementById('al-fc-progress').textContent = `${state.activeFlashcardIndex + 1} / ${state.activeFlashcards.length} words`;
  document.getElementById('al-fc-word').textContent = card.word;
  document.getElementById('al-fc-definition').textContent = card.definition;
  document.getElementById('al-fc-translation').textContent = card.translation;

  const fc = document.getElementById('al-flashcard');
  fc.classList.remove('flipped');
  document.getElementById('al-fc-actions').classList.add('hidden');

  fc.onclick = () => {
    fc.classList.toggle('flipped');
    if (fc.classList.contains('flipped')) {
      document.getElementById('al-fc-actions').classList.remove('hidden');
    }
  };
}

async function startActiveQuiz() {
  const currentPod = getActivePodcast();
  const fallbackQuiz = currentPod?.quizQuestions || [];

  state.activeQuizQuestions = fallbackQuiz;
  state.activeQuizIndex = 0;
  state.activeQuizAnswers = [];
  renderActiveQuizQuestion();
}

function renderActiveQuizQuestion() {
  const q = state.activeQuizQuestions[state.activeQuizIndex];
  if (!q) {
    showActiveLearningStep('reflection');
    return;
  }

  const pct = ((state.activeQuizIndex + 1) / state.activeQuizQuestions.length) * 100;
  document.getElementById('al-quiz-q-num').textContent = `${state.activeQuizIndex + 1} / ${state.activeQuizQuestions.length}`;
  document.getElementById('al-quiz-prog').style.width = `${pct}%`;

  const container = document.getElementById('al-quiz-body');
  container.innerHTML = `
    <div class="quiz-question" style="font-size:15px;margin-bottom:12px">${q.question}</div>
    <div class="quiz-options">
      ${q.options.map((opt, i) => `
        <button class="ob-option-btn al-quiz-opt" data-idx="${i}" style="width:100%">${opt}</button>
      `).join('')}
    </div>
    <div class="quiz-feedback hidden" id="al-quiz-feedback" style="padding:10px;border-radius:var(--r-sm);margin-top:10px;font-size:13px"></div>
    <button class="btn-primary btn-full hidden" id="al-quiz-next-btn" style="margin-top:10px">
      ${state.activeQuizIndex < state.activeQuizQuestions.length - 1 ? 'Next Question' : 'View Session Report'}
    </button>
  `;

  container.querySelectorAll('.al-quiz-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      const isCorrect = idx === q.correct;
      state.activeQuizAnswers.push(isCorrect);

      if (isCorrect) {
        const scores = UserState.get('learningScore') || { listening: 0, vocabulary: 0, grammar: 0, comprehension: 0, retention: 0 };
        if (q.type === 'fill') {
          UserState.updateLearningScore('grammar', Math.min(100, (scores.grammar || 0) + 4));
        } else {
          UserState.updateLearningScore('comprehension', Math.min(100, (scores.comprehension || 0) + 4));
        }
      } else {
        UserState.updateLearningMemory('repeatedMistakes', q.question, 'mistake');
      }

      container.querySelectorAll('.al-quiz-opt').forEach((b, i) => {
        b.disabled = true;
        if (i === q.correct) b.style.borderColor = 'var(--success)';
        if (i === idx && !isCorrect) b.style.borderColor = 'var(--danger)';
      });

      const fb = document.getElementById('al-quiz-feedback');
      fb.textContent = isCorrect ? `✅ Correct! ${q.explanation}` : `❌ Incorrect. ${q.explanation}`;
      fb.className = `quiz-feedback ${isCorrect ? 'correct' : 'wrong'}`;
      fb.classList.remove('hidden');

      document.getElementById('al-quiz-next-btn').classList.remove('hidden');
    });
  });

  document.getElementById('al-quiz-next-btn')?.addEventListener('click', () => {
    state.activeQuizIndex++;
    if (state.activeQuizIndex < state.activeQuizQuestions.length) {
      renderActiveQuizQuestion();
    } else {
      showActiveLearningStep('reflection');
    }
  });
}

function startActiveReflection() {
  const user = UserState._data;
  const quizScores = state.activeQuizAnswers.filter(Boolean).length;
  const quizPct = state.activeQuizQuestions.length
    ? Math.round((quizScores / state.activeQuizQuestions.length) * 100)
    : 0;

  const currentScores = user.learningScore || { listening: 0, vocabulary: 0, grammar: 0, comprehension: 0, retention: 0 };
  
  // Calculate gains
  const listGain = 5;
  const vocabGain = state.activeFlashcards.length * 2;
  const gramGain = quizPct >= 66 ? 6 : -1;
  const compGain = quizPct;

  const newList = Math.max(0, Math.min(100, (currentScores.listening || 0) + listGain));
  const newVoc = Math.max(0, Math.min(100, (currentScores.vocabulary || 0) + vocabGain));
  const newGram = Math.max(0, Math.min(100, (currentScores.grammar || 0) + gramGain));
  const newComp = Math.max(0, Math.min(100, Math.round(((currentScores.comprehension || 0) + compGain) / 2)));

  UserState.update({
    learningScore: {
      ...currentScores,
      listening: newList,
      vocabulary: newVoc,
      grammar: newGram,
      comprehension: newComp
    }
  });

  // Render reflection values
  document.getElementById('al-ref-cefr').textContent = user.cefrLevel || 'A1';
  document.getElementById('al-ref-listening').textContent = `${newList}%`;
  document.getElementById('al-ref-comprehension').textContent = `${newComp}%`;
  document.getElementById('al-ref-vocabulary').textContent = `${newVoc}%`;
  document.getElementById('al-ref-grammar').textContent = `${newGram}%`;

  // Custom data-driven Coach comment
  let coachingMsg = `### COACH ANALYSIS\n\n`;
  coachingMsg += `* **Listening**: Improved to **${newList}%** (+${listGain}%). Your daily focus is solid.\n`;
  coachingMsg += `* **Vocabulary**: Mastered **${state.activeFlashcards.length} new words** in this session, raising retention to **${newVoc}%**.\n`;
  coachingMsg += `* **Grammar**: Your accuracy is at **${newGram}%**. ${quizPct >= 66 ? 'You handled the grammatical patterns perfectly!' : 'Pay close attention to word orders next time.'}\n`;
  coachingMsg += `* **Comprehension**: You scored **${quizPct}%** on the lesson check. `;

  if (quizPct >= 75) {
    coachingMsg += `Superb reading & listening consolidation! You have fully mastered this lesson.`;
  } else {
    coachingMsg += `We recommend reviewing the transcript and repeating the audio block before starting a new lesson.`;
  }

  document.getElementById('al-reflection-coach-card').innerHTML = renderMarkdown(coachingMsg);

  // Render next study recommendation
  const recommended = getRecommendedPodcasts();
  const nextPod = recommended.find(p => p.podcastId !== state.activePodcast?.podcastId) || recommended[0];
  const nextContainer = document.getElementById('al-next-recommendation-container');

  if (nextPod) {
    nextContainer.innerHTML = `
      <div class="continue-card" style="margin: 0" data-podcast="${nextPod.podcastId}">
        <div class="continue-artwork">
          ${getSafeImageHtml(nextPod.coverImage, nextPod.title)}
        </div>
        <div class="continue-info">
          <div class="continue-title" style="font-size:13px">${nextPod.title}</div>
          <div class="continue-reason" style="font-size:11px;color:var(--primary);margin-top:2px">${getRecommendationReason(nextPod)}</div>
          <div class="continue-meta" style="margin-top:4px">${nextPod.cefrLevel} · ${nextPod.difficulty}</div>
        </div>
      </div>
    `;
    nextContainer.querySelector('.continue-card').addEventListener('click', () => {
      hideModal('active-learning-overlay');
      openPodcastDetail(nextPod.podcastId);
    });
  } else {
    nextContainer.innerHTML = ``;
  }
}

function finishActiveLearningSession() {
  hideModal('active-learning-overlay');
  
  // Award massive XP
  const xp = 150;
  const leveled = UserState.addXP(xp);
  showXPToast(`+${xp} XP — Active Recall Complete!`);

  // Track completed podcast
  const compList = UserState.get('completedPodcasts') || [];
  if (state.activePodcast && !compList.includes(state.activePodcast.podcastId)) {
    compList.push(state.activePodcast.podcastId);
    UserState.set('completedPodcasts', compList);
    
    // Increment daily tasks progress
    updateQuestProgress('complete_lesson', 1);
    updateQuestProgress('complete_quiz', 1);
  }

  // Auto-advance step in the daily learning path
  const user = UserState._data;
  const pathStep = Number(user.pathStep) || 1;
  if (pathStep === 1) {
    user.pathStep = 2;
    showLearningFeedback("Listening accuracy improved! (+10 XP)");
  } else if (pathStep === 4) {
    user.pathStep = 5;
    showLearningFeedback("Comprehension accuracy consolidated! (+15 XP)");
  }
  UserState.save();

  if (leveled) {
    setTimeout(() => showLevelUp(), 1000);
  }

  renderAllViews();

  // Scroll smoothly to next active card
  setTimeout(() => {
    const nextId = Number(user.pathStep) === 2 ? 'path-step-grammar' : 'path-step-reflection';
    document.getElementById(nextId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 1000);
}

// ==================== REST OF THE SYSTEM FUNCTIONS ====================
// (Keep all standard components stable)

function setupPlayer() {
  player.onStateChange((newState, error) => {
    updatePlayerUI(newState);
 
    if (newState === 'error') {
      showXPToast(error?.message || 'Playback failed. Tap Play to retry.');
      return;
    }
 
    if (newState === 'ended') {
      if (state.currentPodcast) {
        launchActiveLearning(state.currentPodcast);
      }
    }
  });

  player.onWordBoundary((ms) => {
    state.currentWordTimestamp = ms;
    updateTranscriptHighlight(ms);
    updateWaveformProgress();
    updateMiniPlayer();
    savePlaybackProgress();
  });
}

function normalizeTranscript(transcript) {
  if (!transcript?.content?.length) return transcript;

  return {
    ...transcript,
    content: transcript.content.map((section, i) => {
      const startMs = section.startMs ?? section.timecodeMs ?? 0;
      const nextSection = transcript.content[i + 1];
      const endMs = section.endMs ?? section.timecodeMs_end ?? (
        nextSection
          ? (nextSection.startMs ?? nextSection.timecodeMs ?? startMs + 5000)
          : startMs + 5000
      );

      return {
        startMs,
        endMs,
        text: section.text,
        speaker: section.speaker || '',
        wordTimestamps: section.wordTimestamps || []
      };
    })
  };
}

function loadPodcast(podcastId, { autoPlay = false } = {}) {
  const pod = state.podcasts.find(p => p.podcastId === podcastId);
  if (!pod) return false;

  const transcript = normalizeTranscript(state.transcripts[pod.transcriptId] || null);

  state.currentPodcast = pod;
  state.currentTranscript = transcript;

  const loaded = player.loadPodcast(pod, transcript);
  if (!loaded) return false;

  copilot.setContext(pod, transcript);

  const prog = UserState.getProgress(podcastId);
  if (prog?.position && prog.position > 0) {
    player.seek(prog.position * 1000);
  }

  updatePlayerInfo(pod);
  renderTranscript(transcript);
  renderWaveform();
  showMiniPlayer(pod);
  openFullPlayer();

  UserState.recordStudy();

  if (autoPlay) {
    player.play();
  }

  return true;
}

function updatePlayerInfo(pod) {
  const img = document.getElementById('player-artwork-img');
  if (img) {
    img.classList.remove('loaded');
    img.classList.add('skeleton-loader');
    img.src = pod.coverImage || FALLBACK_ART;
    img.onload = () => {
      img.classList.remove('skeleton-loader');
      img.classList.add('loaded');
    };
    img.onerror = () => {
      img.src = FALLBACK_ART;
      img.classList.remove('skeleton-loader');
      img.classList.add('loaded');
    };
  }
  document.getElementById('player-title').textContent = pod.title;
  document.getElementById('player-desc').textContent = pod.description;
  document.getElementById('player-category').textContent = pod.category || 'Education';
  document.getElementById('player-lang-badge').textContent = pod.language;
  document.getElementById('player-lang-badge').className = `player-lang-badge ${getLangClass(pod.language)}`;
  document.getElementById('player-speaker').textContent = `· ${pod.speaker || ''}`;
  document.getElementById('player-total-time').textContent = formatTime(getActiveDurationMs() / 1000);
}

function getActiveDurationMs(pod = state.currentPodcast) {
  return state.currentTranscript?.duration || (pod?.duration || 0) * 60 * 1000;
}

function showMiniPlayer(pod) {
  const img = document.getElementById('mini-artwork-img');
  if (img) {
    img.classList.remove('loaded');
    img.classList.add('skeleton-loader');
    img.src = pod.coverImage || FALLBACK_ART;
    img.onload = () => {
      img.classList.remove('skeleton-loader');
      img.classList.add('loaded');
    };
    img.onerror = () => {
      img.src = FALLBACK_ART;
      img.classList.remove('skeleton-loader');
      img.classList.add('loaded');
    };
  }
  document.getElementById('mini-title').textContent = pod.title;
  document.getElementById('mini-artist').textContent = `${pod.language} · ${pod.speaker || ''}`;
  document.getElementById('mini-player').classList.remove('hidden');
}

function openFullPlayer() {
  state.playerOpen = true;
  const fp = document.getElementById('full-player');
  fp.classList.remove('hidden');
  requestAnimationFrame(() => {
    fp.classList.add('open');
    scheduleBottomSheetMini();
  });
  hideModal('podcast-detail-overlay');
}

function scheduleBottomSheetMini() {
  if (!BottomSheetController._openToken) BottomSheetController._openToken = 0;
  const token = ++BottomSheetController._openToken;
  setTimeout(() => {
    if (token !== BottomSheetController._openToken || !state.playerOpen) return;
    BottomSheetController.refreshLayout();
    BottomSheetController.snapTo('mini');
  }, 500);
}

function closeFullPlayer() {
  state.playerOpen = false;
  const fp = document.getElementById('full-player');
  fp.classList.remove('open');
  setTimeout(() => fp.classList.add('hidden'), 400);
}

function updatePlayerUI(stateName) {
  const playIcon = document.getElementById('player-play-icon');
  const miniPlayIcon = document.getElementById('mini-play-icon');
  
  if (stateName === 'buffering') {
    if (playIcon) playIcon.className = 'fa-solid fa-spinner fa-spin';
    if (miniPlayIcon) miniPlayIcon.className = 'fa-solid fa-spinner fa-spin';
  } else if (stateName === 'play') {
    if (playIcon) playIcon.className = 'fa-solid fa-pause';
    if (miniPlayIcon) miniPlayIcon.className = 'fa-solid fa-pause';
  } else if (stateName === 'error') {
    if (playIcon) playIcon.className = 'fa-solid fa-rotate-right';
    if (miniPlayIcon) miniPlayIcon.className = 'fa-solid fa-rotate-right';
  } else {
    if (playIcon) playIcon.className = 'fa-solid fa-play';
    if (miniPlayIcon) miniPlayIcon.className = 'fa-solid fa-play';
  }
}

function updateMiniPlayer() {
  if (!state.currentPodcast) return;
  const duration = getActiveDurationMs();
  const pct = Math.min(100, (player.currentTime / duration) * 100);
  document.getElementById('mini-progress-fill').style.width = `${pct}%`;
}

function savePlaybackProgress() {
  if (!state.currentPodcast) return;
  const pos = Math.floor(player.currentTime / 1000);
  UserState.updateProgress(state.currentPodcast.podcastId, { position: pos });
}

function renderWaveform() {
  const waveform = document.getElementById('waveform');
  if (!waveform) return;

  const bars = 50;
  waveform.innerHTML = Array.from({ length: bars }, (_, i) => {
    const h = 20 + Math.random() * 60;
    return `<div class="waveform-bar" data-index="${i}" style="height:${h}%"></div>`;
  }).join('');

  waveform.addEventListener('click', (e) => {
    const rect = waveform.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = x / rect.width;
    const totalMs = getActiveDurationMs();
    player.seek(pct * totalMs);
  });
}

function updateWaveformProgress() {
  if (!state.currentPodcast) return;
  const totalMs = getActiveDurationMs();
  const pct = player.currentTime / totalMs;
  const bars = document.querySelectorAll('.waveform-bar');
  const playedCount = Math.floor(pct * bars.length);

  bars.forEach((bar, i) => {
    bar.classList.toggle('played', i < playedCount);
    bar.classList.toggle('active', i === playedCount);
  });

  const currentSec = player.currentTime / 1000;
  document.getElementById('player-current-time').textContent = formatTime(currentSec);
  document.getElementById('player-progress-pct').textContent = `${Math.round(pct * 100)}%`;
}

function renderTranscript(transcript) {
  const container = document.getElementById('transcript-list');
  if (!container) return;

  if (!transcript || !transcript.content || !transcript.content.length) {
    container.innerHTML = `
      <div class="transcript-empty" style="text-align:center;padding:24px 16px">
        <i class="fa-solid fa-clock-rotate-left" style="font-size:36px;color:var(--text-tertiary);margin-bottom:12px;display:block"></i>
        <h4 style="font-weight:700;color:var(--text-primary);margin-bottom:4px">Transcript Pending</h4>
        <p style="font-size:12px;color:var(--text-secondary);line-height:1.4">We are preparing the synchronized transcript, quiz, and learning assets for this RSS episode. Please check back shortly!</p>
      </div>
    `;
    return;
  }

  const totalDuration = getActiveDurationMs();
  const normalized = transcript.content.map((section, i) => {
    const startMs = section.startMs ?? section.timecodeMs ?? 0;
    const nextSection = transcript.content[i + 1];
    const endMs = section.endMs ?? section.timecodeMs_end ?? (nextSection ? (nextSection.startMs ?? nextSection.timecodeMs ?? startMs + 5000) : totalDuration);
    return { ...section, startMs, endMs };
  });

  container.innerHTML = normalized.map((section, i) => `
    <div class="transcript-row" data-index="${i}" data-start="${section.startMs}" data-end="${section.endMs}">
      <div class="transcript-time">${formatMs(section.startMs)}</div>
      <div class="transcript-text">
        ${section.text.split(' ').map(word =>
          `<span class="transcript-word" data-word="${word.replace(/[^a-zA-Z]/g, '')}">${word} </span>`
        ).join('')}
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.transcript-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.classList.contains('transcript-word')) {
        const word = e.target.dataset.word;
        if (word && word.length > 2) {
          openDictionary(word);
          return;
        }
      }
      const startMs = parseInt(row.dataset.start);
      player.seek(startMs);
    });
  });
}

function updateTranscriptHighlight(ms) {
  if (!state.currentTranscript?.content) return;

  const rows = document.querySelectorAll('.transcript-row');
  let activeRow = null;

  rows.forEach(row => {
    const start = parseInt(row.dataset.start);
    const end = parseInt(row.dataset.end);
    const isActive = ms >= start && ms < end;
    row.classList.toggle('active', isActive);
    if (isActive) activeRow = row;
  });

  const sheetIsFull = BottomSheetController.getState() === 'full';
  if (activeRow && state.wsTab === 'transcript' && sheetIsFull) {
    activeRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

async function openDictionary(word) {
  switchWsTab('notes');

  document.getElementById('dict-empty').classList.add('hidden');
  const entry = document.getElementById('dict-entry');
  entry.classList.remove('hidden');
  document.getElementById('dict-word').textContent = word;
  document.getElementById('dict-phonetic').innerHTML = `<span>Loading...</span>`;
  document.getElementById('dict-pos').textContent = '...';
  document.getElementById('dict-definition').textContent = 'Looking up definition...';
  document.getElementById('dict-translations').innerHTML = '';

  const data = await lookupWord(word);

  document.getElementById('dict-phonetic').innerHTML = `${data.phonetic || ''} <button class="icon-btn" id="dict-play-phonetic" style="font-size:14px"><i class="fa-solid fa-volume-high"></i></button>`;
  document.getElementById('dict-pos').textContent = data.pos || 'Unknown';
  document.getElementById('dict-definition').textContent = data.definition || 'No definition found';

  if (data.example) {
    document.getElementById('dict-examples').innerHTML = `<div style="font-size:13px;color:var(--text-secondary);font-style:italic;margin-bottom:12px">"${data.example}"</div>`;
  }

  if (data.translations) {
    document.getElementById('dict-translations').innerHTML = Object.entries(data.translations)
      .filter(([_, v]) => v && v !== word)
      .map(([lang, trans]) => `
        <div class="dict-translation-row">
          <span class="dict-translation-lang">${lang}</span>
          <span class="dict-translation-word">${trans}</span>
        </div>
      `).join('');
  }

  state.selectedWord = { word, ...data };

  document.getElementById('dict-play-phonetic')?.addEventListener('click', () => {
    if (data.audio) new Audio(data.audio).play().catch(() => {});
  });

  document.getElementById('dict-save-btn').onclick = () => saveWordToNotebook(word, data);
}

function saveWordToNotebook(word, data) {
  const saved = UserState.saveWord({ word, ...data });
  if (saved) {
    showXPToast('+10 XP — Word saved!');
    UserState.addXP(10);
    UserState.updateLearningMemory('weakWords', word, 'weak');

    const quest = UserState.incrementQuest('save_word');
    if (quest?.current >= quest?.goal && !quest.completed) {
      quest.completed = true;
      UserState.addXP(quest.xp);
      showXPToast(`+${quest.xp} XP — Quest complete!`);
    }

    const btn = document.getElementById('dict-save-btn');
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Saved!';
    btn.style.background = 'var(--success)';
    setTimeout(() => {
      btn.innerHTML = '<i class="fa-solid fa-plus"></i> Save to Notebook';
      btn.style.background = '';
    }, 2000);
    checkBadges();
  }
}

// ==================== REST OF THE INTERFACE BINDERS ====================

function renderAllViews() {
  renderHome();
  renderProfile();
  renderInbox();
}

function renderSrsReview() {
  const container = document.getElementById('home-srs-card');
  if (!container) return;

  const vocab = UserState.get('vocabulary') || [];
  const dueCount = vocab.filter(w => w.srsDate && w.srsDate <= Date.now()).length;

  if (dueCount > 0) {
    container.innerHTML = `
      <div style="background:rgba(255,107,53,0.1);border:1.5px solid rgba(255,107,53,0.3);border-radius:12px;padding:16px;display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="font-size:24px">🔥</div>
          <div>
            <h4 style="font-weight:700;color:var(--text-primary);margin-bottom:2px;font-size:14px">Review Vocabulary</h4>
            <p style="font-size:12px;color:var(--text-secondary)">You have <strong style="color:var(--primary)">${dueCount} words</strong> due for spaced repetition.</p>
          </div>
        </div>
        <button class="btn-primary" id="home-start-srs-btn" style="padding:8px 14px;font-size:11px;font-weight:600">Start Review</button>
      </div>
    `;
    document.getElementById('home-start-srs-btn')?.addEventListener('click', () => {
      openFlashcards(vocab.filter(w => w.srsDate && w.srsDate <= Date.now()));
    });
  } else {
    container.innerHTML = `
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px;display:flex;align-items:center;gap:12px">
        <div style="font-size:24px">✨</div>
        <div>
          <h4 style="font-weight:700;color:var(--text-primary);margin-bottom:2px;font-size:14px">All Caught Up!</h4>
          <p style="font-size:12px;color:var(--text-secondary)">No vocabulary items due for spaced review today.</p>
        </div>
      </div>
    `;
  }
}

function renderContinueListening() {
  const header = document.getElementById('continue-section-header');
  const container = document.getElementById('continue-listening-container');
  if (!header || !container) return;

  const progress = UserState.get('progress') || {};
  const progEntries = Object.entries(progress)
    .filter(([_, p]) => p.position > 0 && !p.completed)
    .sort(([_,a], [__,b]) => b.updatedAt - a.updatedAt)
    .slice(0, 2);

  if (progEntries.length === 0) {
    header.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  header.style.display = 'flex';
  container.innerHTML = progEntries.map(([podId, prog]) => {
    const pod = state.podcasts.find(p => p.podcastId === podId);
    if (!pod) return '';
    const totalSeconds = (state.transcripts[pod.transcriptId]?.duration || pod.duration * 60 * 1000) / 1000;
    const pct = Math.round((prog.position / totalSeconds) * 100);
    return `
      <div class="continue-card" data-podcast="${podId}">
        <div class="continue-artwork">
          ${getSafeImageHtml(pod.coverImage, pod.title)}
        </div>
        <div class="continue-info">
          <div class="continue-title">${pod.title}</div>
          <div class="continue-meta">${formatTime(prog.position)} left · ${pod.language}</div>
          <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${pct}%;background:var(--primary)"></div></div>
        </div>
        <button class="continue-play-btn">
          <i class="fa-solid fa-play"></i>
        </button>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.continue-card').forEach(card => {
    card.addEventListener('click', () => openPodcastDetail(card.dataset.podcast));
  });
}

function renderPodcastGrid(containerId, podcasts) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = podcasts.map(pod => `
    <div class="podcast-card" data-podcast="${pod.podcastId}">
      <div class="podcast-artwork-wrap">
        ${getSafeImageHtml(pod.coverImage, pod.title)}
        <div class="vinyl-record"></div>
      </div>
      <div class="podcast-card-info">
        <div class="podcast-card-title">${pod.title}</div>
        <div class="podcast-card-meta">${pod.language} · ${pod.duration} min</div>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.podcast-card').forEach(card => {
    card.addEventListener('click', () => openPodcastDetail(card.dataset.podcast));
  });
}

function renderExplore() {
  let filtered = [...state.podcasts];
  const filter = state.filterActive;
  const query = state.searchQuery.toLowerCase();
  const sort = state.exploreSort || 'recommended';

  // Apply filters
  if (filter && filter !== 'all') {
    filtered = filtered.filter(p => 
      p.cefrLevel === filter || 
      p.difficulty === filter || 
      p.category === filter || 
      (p.skills && p.skills.includes(filter)) ||
      (p.keywords && p.keywords.includes(filter.toLowerCase()))
    );
  }

  // Apply search
  if (query) {
    filtered = filtered.filter(p => 
      p.title.toLowerCase().includes(query) || 
      p.description.toLowerCase().includes(query) || 
      (p.category && p.category.toLowerCase().includes(query)) ||
      (p.speaker && p.speaker.toLowerCase().includes(query)) ||
      (p.series && p.series.toLowerCase().includes(query)) ||
      (p.keywords && p.keywords.some(k => k.toLowerCase().includes(query))) ||
      (p.flashcards && p.flashcards.some(f => f.word.toLowerCase().includes(query) || f.definition.toLowerCase().includes(query) || f.translation.toLowerCase().includes(query)))
    );
  }

  // Apply sorting
  if (sort === 'newest') {
    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } else if (sort === 'difficulty') {
    const weights = { A2: 1, B1: 2, B2: 3, C1: 4 };
    filtered.sort((a, b) => (weights[a.cefrLevel] || 0) - (weights[b.cefrLevel] || 0));
  } else if (sort === 'duration') {
    filtered.sort((a, b) => a.duration - b.duration);
  } else if (sort === 'most_popular') {
    filtered.sort((a, b) => (b.views || 0) - (a.views || 0));
  } else {
    // default recommended sorting
    const user = UserState._data;
    const completed = user.completedPodcasts || [];
    filtered.sort((a, b) => {
      // Uncompleted podcasts first
      const aDone = completed.includes(a.podcastId) ? 1 : 0;
      const bDone = completed.includes(b.podcastId) ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;

      // Target CEFR level match first
      const aMatch = a.cefrLevel === user.cefrLevel ? 1 : 0;
      const bMatch = b.cefrLevel === user.cefrLevel ? 1 : 0;
      return bMatch - aMatch;
    });
  }

  const grid = document.getElementById('explore-grid');
  if (!grid) return;

  // Empty state handling
  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state-container" style="text-align:center;padding:40px 16px;grid-column:1/-1;color:var(--text-secondary)">
        <i class="fa-solid fa-folder-open" style="font-size:42px;color:var(--text-tertiary);margin-bottom:14px;display:block"></i>
        <h3 style="font-weight:700;color:white;margin-bottom:6px">No lessons found</h3>
        <p style="font-size:12px;line-height:1.4;margin-bottom:16px">No episodes match your search query or active level filter.</p>
        <div style="display:flex;gap:10px;justify-content:center">
          <button class="btn-primary" id="explore-clear-filters-btn" style="padding:10px 18px;font-size:12px">Clear Filters</button>
          <button class="btn-ghost" id="explore-browse-all-btn" style="padding:10px 18px;font-size:12px">Browse All</button>
        </div>
      </div>
    `;
    document.getElementById('explore-clear-filters-btn')?.addEventListener('click', () => {
      state.filterActive = 'all';
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c.dataset.filter === 'all'));
      renderExplore();
    });
    document.getElementById('explore-browse-all-btn')?.addEventListener('click', () => {
      state.searchQuery = '';
      state.filterActive = 'all';
      const input = document.getElementById('explore-search-input');
      if (input) input.value = '';
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c.dataset.filter === 'all'));
      renderExplore();
    });
    return;
  }

  const completedList = UserState.get('completedPodcasts') || [];

  grid.innerHTML = filtered.map(pod => {
    const isCompleted = completedList.includes(pod.podcastId);
    return `
      <div class="podcast-card" data-podcast="${pod.podcastId}">
        <div class="podcast-artwork-wrap">
          ${getSafeImageHtml(pod.coverImage, pod.title)}
          <div class="vinyl-record"></div>
          ${isCompleted ? `<div class="card-completed-badge" style="position:absolute;top:10px;left:10px;background:rgba(122,158,130,0.9);color:white;padding:4px 8px;border-radius:12px;font-size:10px;font-weight:600;display:flex;align-items:center;gap:4px;backdrop-filter:blur(4px)"><i class="fa-solid fa-circle-check"></i> Done</div>` : ''}
          <div class="card-duration-badge" style="position:absolute;bottom:10px;right:10px;background:rgba(0,0,0,0.7);color:white;padding:4px 8px;border-radius:12px;font-size:10px;font-weight:600">${pod.duration} min</div>
        </div>
        <div class="podcast-card-info">
          <div class="podcast-card-series" style="font-size:11px;color:var(--primary);font-weight:600;margin-bottom:4px">${pod.series || 'BBC Learning English'}</div>
          <div class="podcast-card-title" style="font-size:13px;font-weight:700;line-height:1.3;margin-bottom:8px;color:white">${pod.title}</div>
          <div class="podcast-card-footer" style="display:flex;gap:6px;align-items:center;margin-bottom:8px">
            <span class="card-difficulty-tag ${getDiffClass(pod.difficulty)}" style="font-size:10px;padding:3px 8px;border-radius:4px;font-weight:600">${pod.cefrLevel} · ${pod.difficulty}</span>
            <span class="card-category-tag" style="font-size:10px;background:var(--bg-light);color:var(--text-secondary);padding:3px 8px;border-radius:4px;font-weight:500">${pod.category || 'Vocabulary'}</span>
          </div>
          <!-- Learning context Badge -->
          <div class="card-recommendation-reason" style="font-size:11px;color:var(--text-secondary);background:var(--bg-light);padding:6px 10px;border-radius:6px;display:flex;align-items:center;gap:6px;border:1px solid var(--border)">
            <i class="fa-solid fa-circle-info" style="color:var(--primary)"></i> <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${getRecommendationReason(pod)}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.podcast-card').forEach(card => {
    card.addEventListener('click', () => openPodcastDetail(card.dataset.podcast));
  });
}

function renderLibrary() {
  const tab = state.libTab;
  const container = document.getElementById('library-content');
  if (!container) return;

  if (tab === 'saved') {
    const saved = UserState.get('savedPodcasts') || [];
    if (saved.length === 0) {
      container.innerHTML = `<div class="library-empty"><i class="fa-regular fa-bookmark"></i><p>No saved podcasts yet</p></div>`;
      return;
    }
    const pods = saved.map(id => state.podcasts.find(p => p.podcastId === id)).filter(Boolean);
    container.innerHTML = pods.map(pod => `
      <div class="saved-podcast-item" data-podcast="${pod.podcastId}">
        ${getSafeImageHtml(pod.coverImage, pod.title)}
        <div class="saved-info">
          <div class="saved-title">${pod.title}</div>
          <div class="saved-meta">${pod.language} · ${pod.duration} min</div>
        </div>
      </div>
    `).join('');
    container.querySelectorAll('.saved-podcast-item').forEach(item => {
      item.addEventListener('click', () => openPodcastDetail(item.dataset.podcast));
    });
  } else if (tab === 'notebook') {
    const vocab = UserState.get('vocabulary') || [];
    if (vocab.length === 0) {
      container.innerHTML = `<div class="library-empty"><i class="fa-solid fa-book-open"></i><p>Your notebook is empty</p></div>`;
      return;
    }
    container.innerHTML = vocab.map(w => `
      <div class="notebook-item">
        <div class="notebook-word">${w.word}</div>
        <div class="notebook-def">${w.definition || '...'}</div>
        <div class="notebook-tag">${w.pos || ''} · Mastered: ${UserState.get('learningMemory')?.masteredWords?.includes(w.word) ? 'Yes' : 'No'}</div>
      </div>
    `).join('');
  } else if (tab === 'flashcards') {
    const vocab = UserState.get('vocabulary') || [];
    if (vocab.length === 0) {
      container.innerHTML = `<div class="library-empty"><i class="fa-solid fa-layer-group"></i><p>Save vocabulary words first</p></div>`;
      return;
    }
    container.innerHTML = `
      <button class="btn-primary btn-full" id="lib-start-fc">Start Flashcard Review</button>
    `;
    document.getElementById('lib-start-fc')?.addEventListener('click', () => {
      openFlashcards(vocab);
    });
  } else if (tab === 'history') {
    const comp = UserState.get('completedPodcasts') || [];
    if (comp.length === 0) {
      container.innerHTML = `<div class="library-empty"><i class="fa-solid fa-clock-rotate-left"></i><p>No study history yet</p></div>`;
      return;
    }
    const pods = comp.map(id => state.podcasts.find(p => p.podcastId === id)).filter(Boolean);
    container.innerHTML = pods.map(pod => `
      <div class="saved-podcast-item" data-podcast="${pod.podcastId}">
        ${getSafeImageHtml(pod.coverImage, pod.title)}
        <div class="saved-info">
          <div class="saved-title">${pod.title}</div>
          <div class="saved-meta">Completed ✓</div>
        </div>
      </div>
    `).join('');
  }
}

function renderInbox() {
  const inbox = UserState.get('inbox') || [];
  const container = document.getElementById('inbox-list');
  if (!container) return;

  if (inbox.length === 0) {
    container.innerHTML = `<div class="library-empty"><i class="fa-regular fa-bell"></i><p>No notifications</p></div>`;
    return;
  }

  container.innerHTML = inbox.map(item => `
    <div class="inbox-item ${item.read ? '' : 'unread'}" data-id="${item.id}">
      <div class="inbox-icon xp">⭐</div>
      <div class="inbox-text">
        <div class="inbox-text-title">${item.title}</div>
        <div class="inbox-text-body">${item.body}</div>
      </div>
    </div>
  `).join('');
}

function renderQuests() {
  const quests = UserState.get('quests') || [];
  const container = document.getElementById('quests-list');
  if (!container) return;

  container.innerHTML = quests.map(q => {
    const pct = Math.min(100, Math.round((q.current / q.goal) * 100));
    return `
      <div class="quest-item">
        <div class="quest-info">
          <div class="quest-name" style="color:white">${q.name}</div>
          <div class="quest-prog-track"><div class="quest-prog-fill" style="width:${pct}%;background:var(--primary)"></div></div>
        </div>
        <div class="quest-right">
          <div class="quest-xp" style="color:var(--primary)">+${q.xp} XP</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderBadges() {
  const container = document.getElementById('badges-grid');
  if (!container) return;

  const user = UserState._data;
  const achs = user.achievements || [];

  const badges = [
    { id: 'assessment_champ', name: 'Assessment Champ', icon: '🎯', desc: 'Completed skills assessment' },
    { id: 'first_milestone', name: 'First Listener', icon: '🏆', desc: 'Completed your first lesson' },
    { id: 'perfect_score', name: 'Perfect Quiz', icon: '💯', desc: 'Scored 100% on a lesson quiz' },
    { id: 'vocab_master', name: 'Vocab Scholar', icon: '📚', desc: 'Mastered 5+ vocabulary words' },
    { id: 'streak_maker', name: 'Streak Maker', icon: '🔥', desc: 'Reached a 3-day study streak' }
  ];

  container.innerHTML = badges.map(b => {
    const unlocked = achs.includes(b.id);
    return `
      <div class="badge-item ${unlocked ? 'unlocked' : 'locked'}" style="opacity: ${unlocked ? '1' : '0.45'}; text-align: center" title="${b.desc}">
        <div class="badge-icon" style="font-size: 26px; margin-bottom: 4px">${b.icon}</div>
        <div class="badge-name" style="font-size: 11px; font-weight: 700; color: white">${b.name}</div>
        <div style="font-size: 9px; color: var(--text-tertiary); margin-top: 2px">${unlocked ? 'Unlocked ✓' : 'Locked'}</div>
      </div>
    `;
  }).join('');
}

function renderLeaderboard() {
  const container = document.getElementById('leaderboard-list');
  if (!container) return;

  container.innerHTML = `
    <div class="leaderboard-item me">
      <div class="leaderboard-rank">1</div>
      <div class="leaderboard-name">You (Learner)</div>
      <div class="leaderboard-xp">${UserState.get('xp') || 0} XP</div>
    </div>
  `;
}

function openPodcastDetail(podcastId) {
  const pod = state.podcasts.find(p => p.podcastId === podcastId);
  if (!pod) return;

  state.podcastDetailId = podcastId;
  
  const pdArtwork = document.getElementById('pd-artwork');
  if (pdArtwork) {
    pdArtwork.classList.remove('loaded');
    pdArtwork.classList.add('skeleton-loader');
    pdArtwork.src = pod.coverImage || FALLBACK_ART;
    pdArtwork.onload = () => {
      pdArtwork.classList.remove('skeleton-loader');
      pdArtwork.classList.add('loaded');
    };
    pdArtwork.onerror = () => {
      pdArtwork.src = FALLBACK_ART;
      pdArtwork.classList.remove('skeleton-loader');
      pdArtwork.classList.add('loaded');
    };
  }

  document.getElementById('pd-title').textContent = pod.title;
  document.getElementById('pd-speaker').textContent = `By ${pod.speaker || 'LinguAlphabet'}`;
  document.getElementById('pd-duration').textContent = `${pod.duration} mins`;
  document.getElementById('pd-lang').textContent = pod.language;
  document.getElementById('pd-diff').textContent = pod.difficulty;
  document.getElementById('pd-desc').textContent = pod.description;

  showModal('podcast-detail-overlay');
}

function openFlashcards(cards) {
  state.flashcards = cards;
  state.flashcardIndex = 0;
  
  if (cards.length === 0) {
    showXPToast('No words ready for spaced review!');
    return;
  }

  showModal('flashcard-overlay');
  renderFlashcard();
}

function renderFlashcard() {
  const card = state.flashcards[state.flashcardIndex];
  if (!card) {
    finishSpacedVocabularyReview();
    return;
  }

  document.getElementById('fc-progress-label').textContent = `${state.flashcardIndex + 1} / ${state.flashcards.length}`;
  document.getElementById('fc-word').textContent = card.word;
  document.getElementById('fc-definition').textContent = card.definition || '';
  document.getElementById('fc-translation').textContent = card.translations?.Uzbek || card.translation || '';

  const fc = document.getElementById('flashcard');
  const front = fc.querySelector('.flashcard-front');
  const back = fc.querySelector('.flashcard-back');

  if (front && back) {
    front.style.display = 'block';
    back.style.display = 'none';
  }
  fc.classList.remove('flipped');
  document.getElementById('fc-actions').classList.add('hidden');

  fc.onclick = () => {
    fc.classList.toggle('flipped');
    if (fc.classList.contains('flipped')) {
      if (front && back) {
        front.style.display = 'none';
        back.style.display = 'block';
      }
      document.getElementById('fc-actions').classList.remove('hidden');
    } else {
      if (front && back) {
        front.style.display = 'block';
        back.style.display = 'none';
      }
      document.getElementById('fc-actions').classList.add('hidden');
    }
  };
}

function finishSpacedVocabularyReview() {
  hideModal('flashcard-overlay');
  const user = UserState._data;
  if (Number(user.pathStep) === 3) {
    user.pathStep = 4;
    UserState.save();
    renderHome();
    showLearningFeedback("Vocabulary vocabulary strengthened! (+10 XP)");
    setTimeout(() => {
      document.getElementById('path-step-quiz')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 600);
  } else {
    showXPToast("Vocabulary practice completed!");
  }
}

function ensureDailyQuests() {
  const user = UserState._data;
  const todayStr = new Date().toDateString();
  
  if (user.quests && user.quests.length > 0 && user.questsDate === todayStr) {
    return;
  }

  const quests = [];
  
  quests.push({
    id: 'q_today_lesson',
    name: "Complete today's lesson",
    current: 0,
    goal: 1,
    xp: 50,
    type: 'complete_lesson'
  });

  const vocab = UserState.get('vocabulary') || [];
  const dueCount = vocab.filter(w => w.srsDate && w.srsDate <= Date.now()).length;
  if (dueCount > 0) {
    quests.push({
      id: 'q_srs_review',
      name: `Review ${Math.min(dueCount, 10)} vocabulary words`,
      current: 0,
      goal: Math.min(dueCount, 10),
      xp: 30,
      type: 'review_words'
    });
  } else {
    quests.push({
      id: 'q_save_words',
      name: `Save 3 new words in your notebook`,
      current: 0,
      goal: 3,
      xp: 25,
      type: 'save_word'
    });
  }

  quests.push({
    id: 'q_finish_quiz',
    name: "Complete lesson comprehension quiz",
    current: 0,
    goal: 1,
    xp: 40,
    type: 'complete_quiz'
  });

  const dailyTarget = user.dailyTimeGoal || 20;
  quests.push({
    id: 'q_daily_goal',
    name: `Study for ${dailyTarget} minutes today`,
    current: 0,
    goal: dailyTarget,
    xp: 60,
    type: 'listen'
  });

  UserState.update({
    quests: quests,
    questsDate: todayStr
  });
}

function updateQuestProgress(type, amount = 1) {
  const quests = UserState.get('quests') || [];
  const q = quests.find(x => x.type === type);
  if (!q) return;

  if (q.current < q.goal) {
    q.current = Math.min(q.goal, q.current + amount);
    if (q.current >= q.goal && !q.completed) {
      q.completed = true;
      UserState.addXP(q.xp);
      showXPToast(`+${q.xp} XP — Task Completed: ${q.name}!`);
    }
    UserState.update({ quests });
    renderQuests();
  }
}

function showXPToast(text) {
  const toast = document.getElementById('xp-toast');
  if (!toast) return;
  document.getElementById('xp-toast-text').textContent = text;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2500);
}

function showLearningFeedback(text) {
  document.getElementById('learning-feedback-toast')?.remove();

  const toast = document.createElement('div');
  toast.id = 'learning-feedback-toast';
  toast.className = 'brain-feedback-toast';
  toast.innerHTML = `<span style="font-size:16px">🧠</span> <span>${text}</span>`;
  document.body.appendChild(toast);

  // Force reflow
  toast.offsetHeight;

  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

function showLevelUp() {
  const overlay = document.getElementById('levelup-overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    document.getElementById('levelup-tuto').innerHTML = getTutoSVG(100);
  }
}

function showModal(id) {
  document.getElementById(id)?.classList.remove('hidden');
}

function hideModal(id) {
  document.getElementById(id)?.classList.add('hidden');
}

function switchWsTab(tab) {
  state.wsTab = tab;
  document.querySelectorAll('.ws-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.ws === tab));
  document.querySelectorAll('.ws-panel').forEach(p => p.classList.toggle('active', p.id === `ws-${tab}`));
}

function checkBadges() {
  const user = UserState._data;
  
  // Assessment Champ
  if (user.hasCompletedAssessment) {
    if (UserState.unlockAchievement('assessment_champ')) {
      showXPToast('🎯 Unlocked Badge: Assessment Champ!');
    }
  }

  // First Listener
  if ((user.completedPodcasts || []).length >= 1) {
    if (UserState.unlockAchievement('first_milestone')) {
      showXPToast('🏆 Unlocked Badge: First Listener!');
    }
  }

  // Vocab Scholar
  if ((user.learningMemory?.masteredWords || []).length >= 5) {
    if (UserState.unlockAchievement('vocab_master')) {
      showXPToast('📚 Unlocked Badge: Vocab Scholar!');
    }
  }

  // Streak Maker
  if ((user.streak || 0) >= 3) {
    if (UserState.unlockAchievement('streak_maker')) {
      showXPToast('🔥 Unlocked Badge: Streak Maker!');
    }
  }
}

// ==================== TUTO FLOATING COACH SVG ====================
function renderTuto() {}

// Simple markdown renderer
function renderMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

// ==================== WORKSPACE BOTTOM SHEET ====================
const BottomSheetController = {
  sheet: null,
  handle: null,
  tabsNav: null,
  panels: [],
  transcriptList: null,
  _playerRoot: null,
  _chromeRoot: null,
  _resizeObserver: null,
  _layoutTimer: null,

  _openToken: 0,

  _state: 'mini',
  _isDragging: false,
  _dragPointerId: null,
  _startY: 0,
  _startHeight: 0,
  _currentHeight: 64,
  _pendingContentDrag: null,
  _lastDragDy: 0,

  _dimensions: {
    maxHeight: 320,
    miniH: 64,
    halfH: 160,
    fullH: 320
  },

  _PEEK: 64,
  _SPRING: 'height 0.42s cubic-bezier(0.2, 1.2, 0.22, 1)',

  init() {
    this.sheet = document.getElementById('workspace-tabs');
    this.handle = document.getElementById('ws-drag-handle');
    this.tabsNav = document.querySelector('.workspace-tabs-nav');
    this.panels = this.sheet?.querySelectorAll('.ws-panel') || [];
    this.transcriptList = document.getElementById('transcript-list');
    this._playerRoot = document.getElementById('full-player');
    this._chromeRoot = document.getElementById('player-chrome');

    if (!this.sheet || !this.handle) return;

    this.setupListeners();

    this._resizeObserver = new ResizeObserver(() => {
      if (!this._playerRoot?.classList.contains('open') || this._isDragging) return;
      clearTimeout(this._layoutTimer);
      this._layoutTimer = setTimeout(() => {
        this.refreshLayout();
        this._setHeight(this._getHeightForState(this._state));
      }, 16);
    });
    if (this._playerRoot) this._resizeObserver.observe(this._playerRoot);

    window.snapWorkspaceTo = (stateName) => this.snapTo(stateName);
  },

  refreshLayout() {
    if (!this.sheet) return;

    const fp = this._playerRoot;
    let maxHeight = 320;

    if (fp && fp.classList.contains('open')) {
      const fpH = fp.clientHeight;
      const chromeH = this._chromeRoot?.offsetHeight || 170;
      maxHeight = Math.max(200, Math.round(fpH - chromeH - 72));
    }

    this._dimensions.maxHeight = maxHeight;
    this._dimensions.miniH = this._PEEK;
    this._dimensions.halfH = Math.round(maxHeight * 0.5);
    this._dimensions.fullH = maxHeight;
    this.sheet.style.setProperty('--sheet-max-height', `${maxHeight}px`);
  },

  getState() {
    return this._state;
  },

  snapTo(stateName, { animate = true } = {}) {
    if (!this.sheet) return;
    const normalized = stateName === 'collapsed' ? 'mini' : stateName;
    this.refreshLayout();
    this._state = normalized;
    this.sheet.dataset.sheetState = normalized;
    this.sheet.classList.toggle('is-full', normalized === 'full');
    this.sheet.classList.toggle('is-half', normalized === 'half');
    this.sheet.classList.toggle('is-mini', normalized === 'mini');

    const targetH = this._getHeightForState(normalized);
    this.sheet.style.transition = animate ? this._SPRING : 'none';
    this._setHeight(targetH);

    if (normalized !== 'full' && this.transcriptList) {
      this.transcriptList.scrollTop = 0;
    }

    if (animate) {
      const onTransitionEnd = () => {
        if (this.sheet) this.sheet.style.transition = '';
        this.sheet.removeEventListener('transitionend', onTransitionEnd);
      };
      this.sheet.addEventListener('transitionend', onTransitionEnd);
    } else if (this.sheet) {
      this.sheet.style.transition = '';
    }
  },

  expand() {
    if (this._state === 'mini') this.snapTo('half');
    else if (this._state === 'half') this.snapTo('full');
  },

  collapse() {
    if (this._state === 'full') this.snapTo('half');
    else if (this._state === 'half') this.snapTo('mini');
  },

  _getHeightForState(stateName) {
    if (stateName === 'mini') return this._dimensions.miniH;
    if (stateName === 'half') return this._dimensions.halfH;
    return this._dimensions.fullH;
  },

  _setHeight(heightVal) {
    const clamped = Math.max(this._dimensions.miniH, Math.min(this._dimensions.fullH, Math.round(heightVal)));
    if (this.sheet) {
      this.sheet.style.height = `${clamped}px`;
    }
    this._currentHeight = clamped;
  },

  _readCurrentHeight() {
    return this.sheet ? this.sheet.getBoundingClientRect().height : this._currentHeight;
  },

  _beginDrag(clientY, pointerId, target) {
    this._isDragging = true;
    this._dragPointerId = pointerId ?? null;
    this._startY = clientY;
    this._lastDragDy = 0;
    this.refreshLayout();
    this._startHeight = this._readCurrentHeight();
    this.sheet.style.transition = 'none';
    target?.setPointerCapture?.(pointerId);
  },

  _moveDrag(clientY) {
    const dy = clientY - this._startY;
    this._lastDragDy = dy;
    // Drag up (negative dy) expands the sheet.
    let targetH = this._startHeight - dy;
    targetH = Math.max(this._dimensions.miniH, Math.min(this._dimensions.fullH, targetH));
    this._setHeight(targetH);
  },

  _endDrag() {
    this._isDragging = false;
    this._dragPointerId = null;
    this._pendingContentDrag = null;

    const h = this._currentHeight;
    const anchors = [
      { state: 'mini', h: this._dimensions.miniH },
      { state: 'half', h: this._dimensions.halfH },
      { state: 'full', h: this._dimensions.fullH }
    ];

    const bias = -this._lastDragDy * 0.2;
    let nearest = anchors[0];
    let minDist = Math.abs(h + bias - anchors[0].h);
    anchors.forEach(anchor => {
      const dist = Math.abs(h + bias - anchor.h);
      if (dist < minDist) {
        minDist = dist;
        nearest = anchor;
      }
    });

    this.snapTo(nearest.state);
  },

  setupListeners() {
    const getClientY = (e) => e.clientY ?? e.touches?.[0]?.clientY ?? 0;

    const startDrag = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      this._beginDrag(getClientY(e), e.pointerId, e.currentTarget);
    };

    const moveDrag = (e) => {
      if (!this._isDragging) return;
      if (this._dragPointerId !== null && e.pointerId !== this._dragPointerId) return;
      this._moveDrag(getClientY(e));
      e.preventDefault();
    };

    const endDrag = (e) => {
      if (!this._isDragging) return;
      if (this._dragPointerId !== null && e?.pointerId !== undefined && e.pointerId !== this._dragPointerId) return;
      this._endDrag();
    };

    const getScrollableTarget = (target) => {
      return target.closest?.('.transcript-list, .copilot-messages, .dictionary-panel, .notes-panel');
    };

    const rememberContentDrag = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      this._pendingContentDrag = {
        startY: getClientY(e),
        startX: e.clientX || 0,
        pointerId: e.pointerId,
        target: e.currentTarget,
        scrollable: getScrollableTarget(e.target)
      };
    };

    const maybeStartContentDrag = (e) => {
      if (!this._pendingContentDrag || this._isDragging) return;
      if (this._pendingContentDrag.pointerId !== e.pointerId) return;

      const dy = getClientY(e) - this._pendingContentDrag.startY;
      const dx = (e.clientX || 0) - this._pendingContentDrag.startX;
      if (Math.abs(dy) < 8 || Math.abs(dx) > Math.abs(dy)) return;

      const scrollable = this._pendingContentDrag.scrollable;
      const isPullingDownAtTop = dy > 0 && scrollable && scrollable.scrollTop <= 0;
      const shouldResizeSheet = this._state !== 'full' || isPullingDownAtTop;
      if (!shouldResizeSheet) return;

      this._beginDrag(this._pendingContentDrag.startY, e.pointerId, this._pendingContentDrag.target);
      this._moveDrag(getClientY(e));
    };

    const preventScrollConflict = (e) => {
      if (!this._pendingContentDrag) return;
      const dy = getClientY(e) - this._pendingContentDrag.startY;
      const scrollable = this._pendingContentDrag.scrollable;
      const isPullingDownAtTop = dy > 0 && scrollable && scrollable.scrollTop <= 0;
      const shouldResizeSheet = this._state !== 'full' || isPullingDownAtTop;
      if (shouldResizeSheet && e.cancelable) {
        e.preventDefault();
      }
    };

    const clearPendingDrag = (e) => {
      if (!this._pendingContentDrag) return;
      if (this._pendingContentDrag.pointerId === e.pointerId) {
        this._pendingContentDrag = null;
      }
    };

    this.handle.addEventListener('pointerdown', startDrag);
    this.tabsNav?.addEventListener('pointerdown', startDrag);

    this.panels.forEach(panel => {
      panel.addEventListener('pointerdown', rememberContentDrag);
      panel.addEventListener('pointermove', maybeStartContentDrag);
      panel.addEventListener('pointerup', clearPendingDrag);
      panel.addEventListener('pointercancel', clearPendingDrag);
      panel.addEventListener('touchmove', preventScrollConflict, { passive: false });
    });
    if (this.transcriptList) {
      this.transcriptList.addEventListener('pointerdown', rememberContentDrag);
      this.transcriptList.addEventListener('pointermove', maybeStartContentDrag);
      this.transcriptList.addEventListener('pointerup', clearPendingDrag);
      this.transcriptList.addEventListener('pointercancel', clearPendingDrag);
      this.transcriptList.addEventListener('touchmove', preventScrollConflict, { passive: false });
      this.transcriptList.addEventListener('scroll', () => {
        if (this._state !== 'full') this.transcriptList.scrollTop = 0;
      });
    }

    document.addEventListener('pointermove', moveDrag);
    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);
  }
};

// ==================== EVENT BINDINGS ====================
function setupEventListeners() {
  BottomSheetController.init();
  setupAuthListeners();

  // Onboarding Assessment buttons
  document.getElementById('start-assessment-btn')?.addEventListener('click', () => {
    const motivation = document.getElementById('ob-motivation').value;
    const errEl = document.getElementById('ob-welcome-error');
    const username = (UserState.get('username') || '').trim();

    if (!username) {
      showError(errEl, 'Please enter your first name');
      return;
    }

    UserState.update({
      motivation: motivation
    });

    showOnboardingStep('qa');
    renderAssessmentQuestion();
  });

  document.getElementById('report-continue-btn')?.addEventListener('click', () => {
    showOnboardingStep('plan');
  });

  document.getElementById('plan-finish-btn')?.addEventListener('click', generateLearningPlan);

  // Goal buttons selection
  document.querySelectorAll('.goal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.goal-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Active recall overlay buttons
  document.getElementById('al-prompt-start-btn')?.addEventListener('click', () => {
    showActiveLearningStep('flashcards');
  });

  document.getElementById('al-prompt-skip-btn')?.addEventListener('click', () => {
    hideModal('active-learning-overlay');
  });

  document.getElementById('al-fc-again-btn')?.addEventListener('click', () => {
    const card = state.activeFlashcards[state.activeFlashcardIndex];
    if (card) {
      UserState.saveWord({
        word: card.word,
        phonetic: card.phonetic,
        pos: card.pos,
        translation: card.translation,
        definition: card.definition,
        example: card.example
      });
      const vocab = UserState.get('vocabulary') || [];
      const vIndex = vocab.findIndex(x => x.word === card.word);
      if (vIndex !== -1) {
        vocab[vIndex].srsDate = Date.now() + 300000; // 5 minutes
        UserState.set('vocabulary', vocab);
      }
      UserState.updateLearningMemory('weakWords', card.word, 'weak');
    }
    state.activeFlashcardIndex = (state.activeFlashcardIndex + 1) % state.activeFlashcards.length;
    renderActiveFlashcard();
  });

  document.getElementById('al-fc-known-btn')?.addEventListener('click', () => {
    const card = state.activeFlashcards[state.activeFlashcardIndex];
    if (card) {
      UserState.saveWord({
        word: card.word,
        phonetic: card.phonetic,
        pos: card.pos,
        translation: card.translation,
        definition: card.definition,
        example: card.example
      });
      const vocab = UserState.get('vocabulary') || [];
      const vIndex = vocab.findIndex(x => x.word === card.word);
      if (vIndex !== -1) {
        vocab[vIndex].srsDate = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
        UserState.set('vocabulary', vocab);
      }
      UserState.updateLearningMemory('weakWords', card.word, 'mastered');
      
      // Update daily tasks progress
      updateQuestProgress('review_words', 1);
      updateQuestProgress('save_word', 1);
    }
    state.activeFlashcardIndex++;
    if (state.activeFlashcardIndex >= state.activeFlashcards.length) {
      showActiveLearningStep('quiz');
    } else {
      renderActiveFlashcard();
    }
  });

  document.getElementById('al-reflection-finish-btn')?.addEventListener('click', () => {
    finishActiveLearningSession();
  });

  // General Flashcard Review buttons
  document.getElementById('fc-again-btn')?.addEventListener('click', () => {
    const card = state.flashcards[state.flashcardIndex];
    if (card) {
      UserState.updateLearningMemory('weakWords', card.word, 'weak');
    }
    state.flashcardIndex++;
    if (state.flashcardIndex >= state.flashcards.length) {
      finishSpacedVocabularyReview();
    } else {
      renderFlashcard();
    }
  });

  document.getElementById('fc-known-btn')?.addEventListener('click', () => {
    const card = state.flashcards[state.flashcardIndex];
    if (card) {
      UserState.updateLearningMemory('weakWords', card.word, 'mastered');
      updateQuestProgress('review_words', 1);
    }
    state.flashcardIndex++;
    if (state.flashcardIndex >= state.flashcards.length) {
      finishSpacedVocabularyReview();
    } else {
      renderFlashcard();
    }
  });

  // Nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.view));
  });

  // Explore search
  document.getElementById('explore-search-input')?.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.trim();
    renderExplore();
  });

  // Explore filters
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.filterActive = chip.dataset.filter || 'all';
      renderExplore();
    });
  });

  // Explore sort select
  document.getElementById('explore-sort-select')?.addEventListener('change', (e) => {
    state.exploreSort = e.target.value;
    renderExplore();
  });

  // Play controls
  document.getElementById('player-play-pause')?.addEventListener('click', () => {
    player.isPlaying ? player.pause() : player.play();
  });
  document.getElementById('mini-play-btn')?.addEventListener('click', () => {
    player.isPlaying ? player.pause() : player.play();
  });

  document.getElementById('player-skip-back')?.addEventListener('click', () => {
    player.seek(Math.max(0, player.currentTime - 15000));
  });
  document.getElementById('player-skip-fwd')?.addEventListener('click', () => {
    player.seek(player.currentTime + 15000);
  });

  document.getElementById('player-back-btn')?.addEventListener('click', closeFullPlayer);
  document.getElementById('mini-expand-btn')?.addEventListener('click', openFullPlayer);

  // Speed
  const speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
  let sIdx = 2;
  document.getElementById('player-speed-btn')?.addEventListener('click', () => {
    sIdx = (sIdx + 1) % speeds.length;
    player.setPlaybackRate(speeds[sIdx]);
    document.getElementById('player-speed-btn').textContent = `${speeds[sIdx]}x`;
  });

  // Workspace
  document.querySelectorAll('.ws-tab').forEach(tab => {
    tab.addEventListener('click', () => switchWsTab(tab.dataset.ws));
  });

  // Library
  document.querySelectorAll('.lib-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.lib-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.libTab = tab.dataset.tab;
      renderLibrary();
    });
  });

  // Close modals
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });
  });

  document.querySelectorAll('[data-modal]').forEach(b => {
    b.addEventListener('click', () => hideModal(b.dataset.modal));
  });

  // Settings
  document.getElementById('open-target-settings')?.addEventListener('click', () => {
    document.getElementById('settings-modal-title').textContent = 'Learning Goal';
    document.getElementById('settings-modal-content').innerHTML = `
      <div class="form-group" style="margin-bottom:16px">
        <label>Select Target Goal</label>
        <select id="goal-select" style="background:var(--bg);border:1.5px solid var(--border);border-radius:var(--r-md);padding:14px;width:100%;color:var(--text-primary);font-size:14px;margin-top:6px">
          <option value="IELTS 6.5">IELTS 6.5</option>
          <option value="IELTS 7.5">IELTS 7.5</option>
          <option value="IELTS 8.5+">IELTS 8.5+</option>
          <option value="Daily Conversation">Daily Conversation</option>
          <option value="Business English">Business English</option>
          <option value="Academic English">Academic English</option>
        </select>
      </div>
    `;
    const user = UserState._data;
    const select = document.getElementById('goal-select');
    if (select && user.targetGoal) select.value = user.targetGoal;

    document.getElementById('settings-save-btn').onclick = () => {
      const val = document.getElementById('goal-select').value;
      UserState.update({ targetGoal: val });
      renderProfile();
      hideModal('settings-overlay');
      showXPToast('Target goal updated ✓');
    };
    showModal('settings-overlay');
  });

  document.getElementById('open-daily-goal-settings')?.addEventListener('click', () => {
    document.getElementById('settings-modal-title').textContent = 'Daily Practice Goal';
    document.getElementById('settings-modal-content').innerHTML = `
      <div class="form-group" style="margin-bottom:16px">
        <label>Select Daily Minutes Target</label>
        <select id="daily-select" style="background:var(--bg);border:1.5px solid var(--border);border-radius:var(--r-md);padding:14px;width:100%;color:var(--text-primary);font-size:14px;margin-top:6px">
          <option value="10">10 minutes / day</option>
          <option value="15">15 minutes / day</option>
          <option value="30">30 minutes / day</option>
          <option value="45">45 minutes / day</option>
          <option value="60">60 minutes / day</option>
        </select>
      </div>
    `;
    const user = UserState._data;
    const select = document.getElementById('daily-select');
    if (select && user.dailyTimeGoal) select.value = user.dailyTimeGoal.toString();

    document.getElementById('settings-save-btn').onclick = () => {
      const val = parseInt(document.getElementById('daily-select').value);
      UserState.update({ dailyTimeGoal: val });
      renderProfile();
      hideModal('settings-overlay');
      showXPToast('Daily goal updated ✓');
    };
    showModal('settings-overlay');
  });

  document.getElementById('open-reminder-settings')?.addEventListener('click', () => {
    document.getElementById('settings-modal-title').textContent = 'Daily Notifications';
    document.getElementById('settings-modal-content').innerHTML = `
      <div class="form-group" style="margin-bottom:16px">
        <label>Configure Reminders</label>
        <select id="reminder-select" style="background:var(--bg);border:1.5px solid var(--border);border-radius:var(--r-md);padding:14px;width:100%;color:var(--text-primary);font-size:14px;margin-top:6px">
          <option value="Enabled (9:00 AM)">Enabled (9:00 AM)</option>
          <option value="Enabled (12:00 PM)">Enabled (12:00 PM)</option>
          <option value="Enabled (6:00 PM)">Enabled (6:00 PM)</option>
          <option value="Disabled">Disabled</option>
        </select>
      </div>
    `;
    const user = UserState._data;
    const select = document.getElementById('reminder-select');
    if (select && user.dailyReminder) select.value = user.dailyReminder;

    document.getElementById('settings-save-btn').onclick = () => {
      const val = document.getElementById('reminder-select').value;
      UserState.update({ dailyReminder: val });
      renderProfile();
      hideModal('settings-overlay');
      showXPToast('Notification settings saved ✓');
    };
    showModal('settings-overlay');
  });

  document.getElementById('reset-progress-btn')?.addEventListener('click', () => {
    document.getElementById('settings-modal-title').textContent = 'Reset Progress';
    document.getElementById('settings-modal-content').innerHTML = `
      <div style="font-size:14px;line-height:1.5;color:var(--text-secondary);margin-bottom:12px">
        Are you sure you want to reset all your progress, stats, and achievements? This action is permanent and will restart the onboarding assessment.
      </div>
    `;
    document.getElementById('settings-save-btn').onclick = () => {
      // Clear data and reset UserState
      localStorage.removeItem('linguAlphabet_user');
      clearOnboardingDraft();
      UserState.load();
      UserState.update({ hasCompletedAssessment: false });
      UserState.syncToRemote().catch(() => null);
      hideModal('settings-overlay');
      showMainApp();
      showXPToast('All progress reset successfully');
    };
    showModal('settings-overlay');
  });

  document.getElementById('settings-upgrade-btn')?.addEventListener('click', () => {
    requestGuestUpgrade();
  });

  document.getElementById('upgrade-cancel-btn')?.addEventListener('click', () => {
    hideModal('upgrade-overlay');
  });

  document.getElementById('upgrade-submit-btn')?.addEventListener('click', async () => {
    const username = document.getElementById('upgrade-username').value.trim();
    const email = document.getElementById('upgrade-email').value.trim();
    const password = document.getElementById('upgrade-password').value;
    const errEl = document.getElementById('upgrade-error');

    if (!username || !email || !password) {
      showError(errEl, 'Please fill in all fields');
      return;
    }
    if (password.length < 6) {
      showError(errEl, 'Password must be at least 6 characters');
      return;
    }

    const btn = document.getElementById('upgrade-submit-btn');
    btn.innerHTML = '<span class="spinner"></span> Upgrading...';
    btn.disabled = true;

    try {
      await supabase.signUp(email, password, username);
      UserState.update({
        userId: supabase.currentUser?.id || 'guest_upgrade',
        email: email,
        username: username,
        isGuest: false,
        hasCompletedAssessment: false
      });
      clearOnboardingDraft();
      UserState.save();
      UserState.addInboxItem({
        type: 'badge',
        title: 'Cloud Backup Active',
        body: 'Your Guest Profile has been successfully upgraded! All vocabulary, XP, and lesson achievements are now synced to the cloud.'
      });
      hideModal('upgrade-overlay');
      renderProfile();
      showXPToast('Profile upgraded & synced! ☁️');
    } catch (err) {
      showError(errEl, err.message || 'Failed to upgrade account');
    } finally {
      btn.innerHTML = 'Upgrade & Sync Progress';
      btn.disabled = false;
    }
  });

  document.getElementById('logout-btn')?.addEventListener('click', () => {
    showTomorrowPreviewModal(true);
  });

  document.getElementById('tomorrow-preview-close-btn')?.addEventListener('click', () => {
    hideModal('tomorrow-preview-overlay');
  });

  document.getElementById('tomorrow-preview-logout-btn')?.addEventListener('click', () => {
    const user = UserState._data;
    if (user.isGuest) {
      const confirmDelete = confirm("Warning: As a Guest, signing out will delete all your local progress, stats, and saved vocabulary permanently. To save your progress, cancel and sign up for an account.\n\nDo you want to sign out and clear progress anyway?");
      if (!confirmDelete) return;
    }
    supabase.signOut();
    localStorage.removeItem('linguAlphabet_user');
    showAuth();
    hideModal('tomorrow-preview-overlay');
  });

  // Profile tabs switcher
  document.querySelectorAll('.profile-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.profile-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      
      document.querySelectorAll('.profile-tab-panel').forEach(panel => {
        panel.classList.add('hidden');
      });
      document.getElementById(`profile-panel-${tab}`).classList.remove('hidden');
    });
  });

  document.getElementById('levelup-ok')?.addEventListener('click', () => {
    hideModal('levelup-overlay');
  });

  document.getElementById('pd-play-btn')?.addEventListener('click', () => {
    const id = state.podcastDetailId;
    if (id) loadPodcast(id, { autoPlay: true });
  });

  document.getElementById('pd-bookmark-btn')?.addEventListener('click', () => {
    const id = state.podcastDetailId;
    if (!id) return;
    UserState.savePodcast(id);
    showXPToast('Podcast saved ✓');
  });

  document.getElementById('reassess-trigger-btn')?.addEventListener('click', () => {
    UserState.update({ hasCompletedAssessment: false });
    showMainApp();
  });

  document.getElementById('roadmap-review-trigger')?.addEventListener('click', () => {
    const vocab = UserState.get('vocabulary') || [];
    openFlashcards(vocab.filter(w => w.srsDate && w.srsDate <= Date.now()));
  });

  // Settings for AI Copilot close
  const copilotInput = document.getElementById('copilot-input');
  document.getElementById('copilot-send-btn')?.addEventListener('click', async () => {
    const msg = copilotInput.value.trim();
    if (msg) {
      copilotInput.value = '';
      await sendCopilotMessage(msg);
    }
  });
  copilotInput?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      const msg = copilotInput.value.trim();
      if (msg) {
        copilotInput.value = '';
        await sendCopilotMessage(msg);
      }
    }
  });
}

async function sendCopilotMessage(message) {
  if (state.copilotLoading) return;
  state.copilotLoading = true;

  const msgs = document.getElementById('copilot-messages');
  msgs.innerHTML += `
    <div class="copilot-msg user">
      <div class="copilot-msg-body">${message}</div>
    </div>
  `;
  msgs.scrollTop = msgs.scrollHeight;

  const typingId = 'typing_' + Date.now();
  msgs.innerHTML += `
    <div class="copilot-msg" id="${typingId}">
      <div class="copilot-msg-avatar">🐢</div>
      <div class="copilot-msg-body">...</div>
    </div>
  `;
  msgs.scrollTop = msgs.scrollHeight;

  const response = await copilot.chat(message);
  document.getElementById(typingId)?.remove();

  msgs.innerHTML += `
    <div class="copilot-msg">
      <div class="copilot-msg-avatar">🐢</div>
      <div class="copilot-msg-body">${renderMarkdown(response)}</div>
    </div>
  `;
  msgs.scrollTop = msgs.scrollHeight;
  state.copilotLoading = false;
}

// ==================== BOOT RUN ====================
boot();
