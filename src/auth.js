// ============================================================
// auth.js — Authentication Module (Sprint 1: Splash, Welcome Hero, Guest Mode,
// Login, Register, Forgot Password)
// Owns the auth entry-experience screens, the Tuto mascot renderer, and every
// shared auth-form behavior (validation, password strength, Google sign-in,
// field errors). main.js stays orchestration-only and delegates to this module.
// ============================================================
import { supabase, UserState } from './db.js';

const SPLASH_MIN_DISPLAY_MS = 1200;
const SPLASH_VALIDATE_TIMEOUT_MS = 4000;
const SPLASH_EXIT_MS = 400; // matches --dur-slow in style.css

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
// react to a panel becoming active without auth.js importing main.js back.
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

export function showAuthPanel(panelId) {
  document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(panelId)?.classList.add('active');
  syncAuthScreenMode();
  if (panelId === 'welcome-hero-panel') {
    initHeroScreen();
  }
  panelHook?.(panelId);
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

// ==================== SPLASH (SCR-001) ====================
export function showSplash() {
  document.getElementById('splash-screen')?.classList.remove('hidden', 'splash-exit');
}

export function showSplashOfflineBanner() {
  document.getElementById('splash-offline-banner')?.classList.remove('hidden');
}

export function hideSplash() {
  const splash = document.getElementById('splash-screen');
  if (!splash) return;
  splash.classList.add('splash-exit');
  setTimeout(() => {
    splash.classList.add('hidden');
    splash.classList.remove('splash-exit');
  }, SPLASH_EXIT_MS);
}

// Cold-start session routing: consumes a Google OAuth redirect if present,
// then validates any existing token before deciding where to land, so the
// caller can keep Splash visible until this resolves (never flashes the
// wrong screen while the check is in flight).
export async function determineColdStartRoute() {
  const oauthSession = await supabase.handleOAuthCallback().catch(() => null);
  if (oauthSession?.user) {
    UserState.update({
      userId: oauthSession.user.id,
      email: oauthSession.user.email || UserState.get('email') || '',
      isGuest: false
    });
    await UserState.syncFromRemote().catch(() => null);
    return 'authenticated';
  }

  const user = UserState._data;
  if (user?.isGuest) return 'authenticated';

  if (user?.email && supabase.session?.access_token) {
    const result = await Promise.race([
      supabase.validateSession(),
      wait(SPLASH_VALIDATE_TIMEOUT_MS).then(() => 'timeout')
    ]);
    if (result === true) return 'authenticated';
    if (result === 'timeout') return 'offline';
    return 'welcome'; // token invalid/expired — validateSession() already cleared it
  }

  return 'welcome';
}

// Runs the full Splash sequence: shows Splash, resolves the cold-start route
// while enforcing a minimum premium dwell time, and reports whether the app
// should land on the Main App/Onboarding or the Welcome Hero. Does not hide
// Splash itself — the caller hides it once the destination screen is ready,
// so nothing flashes in between.
export async function runColdStartSequence() {
  showSplash();
  await supabase.init().catch(() => {});
  const [route] = await Promise.all([
    determineColdStartRoute(),
    wait(SPLASH_MIN_DISPLAY_MS)
  ]);
  if (route === 'offline') showSplashOfflineBanner();
  return route === 'welcome' ? 'welcome' : 'authenticated';
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

// ==================== VALIDATION ====================
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FULL_NAME_RE = /^[A-Za-z\s]{2,50}$/;

export function isValidEmail(email) {
  return EMAIL_RE.test(String(email || '').trim());
}

export function isValidFullName(name) {
  return FULL_NAME_RE.test(String(name || '').trim());
}

// Register's hard submit-blocking rule: 8+ chars, upper, lower, digit, special.
export function isPasswordComplex(password) {
  const pw = String(password || '');
  return pw.length >= 8
    && /[A-Z]/.test(pw)
    && /[a-z]/.test(pw)
    && /[0-9]/.test(pw)
    && /[^A-Za-z0-9]/.test(pw);
}

// Login's lighter client-side gate (the real check happens server-side).
export function isLoginPasswordValid(password) {
  return String(password || '').length > 0;
}

// 4-tier live strength meter (Weak / Medium / Strong / Excellent), scored
// across length, uppercase, lowercase, number, and special character.
export function getPasswordStrength(password) {
  const pw = String(password || '');
  if (!pw) return { score: 0, level: 0, label: '' };

  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (score <= 2) return { score, level: 1, label: 'Weak' };
  if (score === 3) return { score, level: 2, label: 'Medium' };
  if (score <= 5) return { score, level: 3, label: 'Strong' };
  return { score, level: 4, label: 'Excellent' };
}

export function renderPasswordStrength(password, meterEl, labelEl) {
  const { level, label } = getPasswordStrength(password);
  if (meterEl) meterEl.dataset.level = String(level);
  if (labelEl) {
    labelEl.textContent = label;
    labelEl.dataset.level = String(level);
  }
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

// ==================== GOOGLE OAUTH ====================
// Shared by the Login and Register Google buttons. Reuses the Phase A
// availability check so an unconfigured provider shows a friendly message
// instead of crashing or leaving the button stuck in a loading state.
export async function handleGoogleAuth(button, errorEl) {
  if (!button || button.disabled) return;
  const originalHTML = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span> Connecting to Google...';
  try {
    await supabase.signInWithGoogle(); // navigates away on success
  } catch (err) {
    button.disabled = false;
    button.innerHTML = originalHTML;
    showError(errorEl, err.message || 'Google Sign-In isn’t available right now. Please use email instead.');
  }
}
