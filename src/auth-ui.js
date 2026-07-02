// ============================================================
// auth-ui.js — Auth screen DOM building blocks (no db.js/session dependency).
// Tuto mascot rendering, panel switching, and generic field interactions
// (password show/hide, Enter-to-submit, error display, field shake) shared
// across every auth screen: Welcome Hero, Guest Mode, Guest name-capture,
// Login, Register, Forgot Password.
// ============================================================

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
