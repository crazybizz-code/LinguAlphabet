// ============================================================
// auth-ui.js — Auth screen DOM building blocks (no db.js/session dependency).
// Owns every auth-domain screen/overlay's presentation — Splash, Welcome
// Hero, Guest Mode, Guest name-capture, Login, Register, Forgot Password,
// Auth Loading, Auth Success — plus the generic field interactions they
// share (password show/hide, Enter-to-submit, error display, field shake).
// Screens that need session/network state (Splash's cold-start check,
// Google OAuth) live in auth-session.js and call back into this file's
// display functions; this file never reaches into db.js itself.
// ============================================================

const OVERLAY_EXIT_MS = 400; // matches --dur-slow in style.css

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== TUTO MASCOT ====================
export function getTutoSVG(size = 80) {
  return `
  <svg width="${size}" height="${size}" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
    <!-- Floor Shadow -->
    <ellipse cx="200" cy="360" rx="80" ry="12" fill="rgba(0,0,0,0.08)"/>
    <!-- Shell -->
    <ellipse cx="200" cy="238" rx="95" ry="78" fill="#d4865a"/>
    <!-- Body / Head -->
    <ellipse cx="200" cy="172" rx="56" ry="62" fill="#7a9e82" class="tuto-body"/>
    <!-- Eyes -->
    <circle cx="181" cy="163" r="13" fill="white"/>
    <circle cx="219" cy="163" r="13" fill="white"/>
    <circle cx="184" cy="166" r="8" fill="#2c3e50"/>
    <circle cx="222" cy="166" r="8" fill="#2c3e50"/>
    <!-- Smile -->
    <path d="M188,184 Q200,196 212,184" fill="none" stroke="#6b4226" stroke-width="3" stroke-linecap="round"/>
    <!-- Headphones -->
    <path d="M152,152 Q152,108 200,108 Q248,108 248,152" fill="none" stroke="#FF6B35" stroke-width="9" stroke-linecap="round"/>
    <rect x="143" y="147" width="20" height="28" rx="9" fill="#FF6B35"/>
    <rect x="237" y="147" width="20" height="28" rx="9" fill="#FF6B35"/>
  </svg>`;
}

const tutoBlinkTimers = new WeakMap();

// Shared by every screen that renders Tuto (Welcome Hero, Guest name-capture,
// and future Loading/Success screens) so the blink loop exists in one place.
export function stopTutoBlinkLoop(container) {
  if (!container) return;
  const timerId = tutoBlinkTimers.get(container);
  if (timerId) clearTimeout(timerId);
  tutoBlinkTimers.delete(container);
}

export function startTutoBlinkLoop(container) {
  if (!container) return;
  stopTutoBlinkLoop(container);
  const scheduleBlink = () => {
    const delay = 3000 + Math.random() * 3000;
    const timerId = setTimeout(() => {
      container.querySelectorAll('.tuto-eye').forEach(eye => {
        eye.style.animation = 'none';
        void eye.offsetWidth;
        eye.style.animation = 'tuto-blink 0.3s ease-in-out';
        setTimeout(() => { eye.style.animation = ''; }, 300);
      });
      scheduleBlink();
    }, delay);
    tutoBlinkTimers.set(container, timerId);
  };
  scheduleBlink();
}

// ==================== PANEL SWITCHING ====================
// Single source of truth for activating an auth panel: toggles `.active` and
// keeps the auth-screen mode classes in sync. Reused by every auth screen
// (Welcome Hero, Guest Mode, the existing Guest name-capture, Login,
// Register, Forgot) instead of each screen re-implementing its own switcher.
let panelHook = null;

// Lets main.js (which still owns the Guest name-capture flow's own state)
// react to a panel becoming active without this module importing main.js back.
export function setAuthPanelHook(fn) {
  panelHook = fn;
}

export function syncAuthScreenMode() {
  const authScreen = document.getElementById('auth-screen');
  const welcomeActive = document.getElementById('welcome-panel')?.classList.contains('active');
  authScreen?.classList.toggle('auth-screen--welcome', Boolean(welcomeActive));
  if (!welcomeActive) {
    authScreen?.classList.remove('auth-screen--exit');
    authScreen?.style.removeProperty('--keyboard-offset');
  }
}

// Blocks panel switching while an authentication attempt is in flight
// (Login/Register/Forgot/Guest all route through here via runAuthFlow), so a
// stray tap on "Back" or "Sign In" mid-request can't abandon the request or
// land the user on a screen that no longer matches what's happening.
let navigationLocked = false;

export function lockAuthNavigation() {
  navigationLocked = true;
}

export function unlockAuthNavigation() {
  navigationLocked = false;
}

export function showAuthPanel(panelId) {
  if (navigationLocked) return;
  document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(panelId)?.classList.add('active');
  syncAuthScreenMode();
  if (panelId === 'welcome-hero-panel') {
    initHeroScreen();
  }
  panelHook?.(panelId);
}

// Disables every button/input in a panel for the duration of a submission —
// prevents duplicate submissions and stray interaction with other fields
// while the request is running. Paired with the navigation lock above.
export function setPanelControlsDisabled(panelEl, disabled) {
  if (!panelEl) return;
  panelEl.querySelectorAll('button, input').forEach(el => {
    el.disabled = disabled;
  });
}

// ==================== WELCOME HERO (SCR-002) ====================
export function initHeroScreen() {
  const container = document.getElementById('hero-tuto-avatar');
  if (!container) return;
  if (!container.dataset.rendered) {
    container.innerHTML = getTutoSVG(130);
    container.dataset.rendered = '1';
  }
  startTutoBlinkLoop(container);
}

// ==================== SHARED ERROR / FIELD FEEDBACK ====================
export function showError(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

// Transient shake + red border on a single field (SCR-003 error-state spec).
export function shakeFieldError(inputEl) {
  if (!inputEl) return;
  inputEl.classList.remove('input-error');
  void inputEl.offsetWidth; // restart the animation if it's already mid-shake
  inputEl.classList.add('input-error');
  setTimeout(() => inputEl.classList.remove('input-error'), 600);
}

// ==================== FIELD INTERACTIONS ====================
// Show/hide password toggle, reused by Login, Register and Confirm Password.
export function setupPasswordToggle(inputId, btnId) {
  const input = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  if (!input || !btn || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', () => {
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    btn.setAttribute('aria-pressed', String(!showing));
    btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    btn.innerHTML = showing
      ? '<i class="fa-regular fa-eye"></i>'
      : '<i class="fa-regular fa-eye-slash"></i>';
  });
}

// Enter-to-submit, reused across every auth form (Login, Register, Forgot).
export function bindEnterToSubmit(inputIds, buttonId) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  inputIds.forEach(id => {
    const input = document.getElementById(id);
    if (!input || input.dataset.enterBound === '1') return;
    input.dataset.enterBound = '1';
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !btn.disabled) {
        e.preventDefault();
        btn.click();
      }
    });
  });
}

// ==================== SPLASH (SCR-001) ====================
export function showSplash() {
  document.getElementById('splash-screen')?.classList.remove('hidden', 'overlay-exit');
}

export function showSplashOfflineBanner() {
  document.getElementById('splash-offline-banner')?.classList.remove('hidden');
}

export function hideSplash() {
  const splash = document.getElementById('splash-screen');
  if (!splash) return;
  splash.classList.add('overlay-exit');
  setTimeout(() => {
    splash.classList.add('hidden');
    splash.classList.remove('overlay-exit');
  }, OVERLAY_EXIT_MS);
}

// ==================== AUTH LOADING (SCR-007) ====================
// Friendly coaching messages per flow — never a bare spinner. Two phrases
// rotate for flows with real network latency; single-phrase flows (Forgot)
// just hold their one message.
const LOADING_COPY = {
  login: [
    { main: 'Tuto is finding your profile...', sub: 'Syncing your streak, XP and saved lessons.' },
    { main: 'Almost there...', sub: 'A great coach remembers every detail.' }
  ],
  register: [
    { main: 'Tuto is setting up your coach...', sub: 'Your personalized English journey starts now.' },
    { main: 'Preparing your Learning Brain...', sub: 'Consistent practice of 5 minutes a day builds real fluency.' }
  ],
  forgot: [
    { main: 'Sending your recovery link...', sub: 'Check your inbox in just a moment.' }
  ],
  guest: [
    { main: 'Getting your session ready...', sub: 'You can create a free account anytime to save your progress.' }
  ]
};

let loadingRotationTimer = null;

function renderLoadingPhrase(phrase) {
  const mainEl = document.getElementById('auth-loading-main');
  const subEl = document.getElementById('auth-loading-sub');
  [mainEl, subEl].forEach(el => {
    if (!el) return;
    el.classList.remove('phrase-fade');
    void el.offsetWidth; // restart the fade animation for this swap
    el.classList.add('phrase-fade');
  });
  if (mainEl) mainEl.textContent = phrase.main;
  if (subEl) subEl.textContent = phrase.sub;
}

export function showAuthLoading(context = 'login') {
  const overlay = document.getElementById('auth-loading-screen');
  if (!overlay) return;

  const mascot = document.getElementById('auth-loading-tuto');
  if (mascot && !mascot.dataset.rendered) {
    mascot.innerHTML = getTutoSVG(110);
    mascot.dataset.rendered = '1';
  }
  startTutoBlinkLoop(mascot);

  const phrases = LOADING_COPY[context] || LOADING_COPY.login;
  let index = 0;
  renderLoadingPhrase(phrases[index]);

  clearInterval(loadingRotationTimer);
  if (phrases.length > 1) {
    loadingRotationTimer = setInterval(() => {
      index = (index + 1) % phrases.length;
      renderLoadingPhrase(phrases[index]);
    }, 2200);
  }

  overlay.classList.remove('hidden', 'overlay-exit');
}

// Returns a Promise that resolves once the overlay has fully faded out, so
// runAuthFlow can keep the navigation lock / disabled controls in place for
// the entire time the overlay is visually on screen — not just until the
// underlying network call settles.
export function hideAuthLoading() {
  clearInterval(loadingRotationTimer);
  const overlay = document.getElementById('auth-loading-screen');
  if (!overlay) return Promise.resolve();
  const mascot = document.getElementById('auth-loading-tuto');
  stopTutoBlinkLoop(mascot);
  overlay.classList.add('overlay-exit');
  return new Promise((resolve) => {
    setTimeout(() => {
      overlay.classList.add('hidden');
      overlay.classList.remove('overlay-exit');
      resolve();
    }, OVERLAY_EXIT_MS);
  });
}

// ==================== AUTH SUCCESS (SCR-008) ====================
const SUCCESS_COPY = {
  login: { headline: 'Welcome back!', sub: "Let's continue your English journey." },
  register: { headline: 'Welcome aboard!', sub: "Let's coach your English together." },
  guest: { headline: "You're all set!", sub: "Let's coach your English together." }
};

const SUCCESS_DISPLAY_MS = 1300;

// Small celebration before continuing into the app — never a hard cut.
// Resolves once the overlay has fully faded back out, so callers can
// `await` it and then navigate, keeping the whole transition smooth.
export function showAuthSuccess(context = 'login') {
  return new Promise((resolve) => {
    const overlay = document.getElementById('auth-success-screen');
    if (!overlay) { resolve(); return; }

    const copy = SUCCESS_COPY[context] || SUCCESS_COPY.login;
    const headlineEl = document.getElementById('auth-success-headline');
    const subEl = document.getElementById('auth-success-sub');
    if (headlineEl) headlineEl.textContent = copy.headline;
    if (subEl) subEl.textContent = copy.sub;

    const mascot = document.getElementById('auth-success-tuto');
    if (mascot && !mascot.dataset.rendered) {
      mascot.innerHTML = getTutoSVG(110);
      mascot.dataset.rendered = '1';
    }

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate([40, 60, 40]); } catch {}
    }

    overlay.classList.remove('hidden', 'overlay-exit');

    setTimeout(() => {
      overlay.classList.add('overlay-exit');
      setTimeout(() => {
        overlay.classList.add('hidden');
        overlay.classList.remove('overlay-exit');
        resolve();
      }, OVERLAY_EXIT_MS);
    }, SUCCESS_DISPLAY_MS);
  });
}

// ==================== AUTH FLOW ORCHESTRATOR ====================
const AUTH_TIMEOUT_MS = 12000;

// Wraps Login/Register/Forgot's async submission with the full premium
// treatment: locks navigation, disables the active panel's controls,
// shows the mascot Loading overlay with context-appropriate coaching
// copy, runs the task with a hard timeout (blueprint SCR-007 error state),
// and — for flows that continue into the app — shows the Success
// transition before resolving. Always restores navigation/controls, on
// both success and failure, so the UI can never get stuck locked or mid-load.
export async function runAuthFlow(taskFn, { context = 'login', withSuccess = true } = {}) {
  const activePanel = document.querySelector('.auth-panel.active');
  lockAuthNavigation();
  setPanelControlsDisabled(activePanel, true);
  showAuthLoading(context);

  try {
    const result = await Promise.race([
      taskFn(),
      wait(AUTH_TIMEOUT_MS).then(() => {
        throw new Error('Connection timed out. Tuto is trying to find a better signal. Please try again.');
      })
    ]);
    await hideAuthLoading();
    if (withSuccess) {
      await showAuthSuccess(context);
    }
    return result;
  } catch (err) {
    await hideAuthLoading();
    throw err;
  } finally {
    setPanelControlsDisabled(activePanel, false);
    unlockAuthNavigation();
  }
}
