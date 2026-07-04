// ============================================================
// auth-session.js — Session/network side of authentication: cold-start
// routing (Splash's session check) and Google OAuth. Everything here talks
// to db.js (Supabase + UserState); screen/overlay presentation — including
// Splash's own show/hide — lives in auth-ui.js, which this file calls into.
// ============================================================
import { supabase, UserState } from './db.js';
import { showError, showSplash, showSplashOfflineBanner } from './auth-ui.js';

const SPLASH_MIN_DISPLAY_MS = 1200;
const SPLASH_VALIDATE_TIMEOUT_MS = 4000;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
