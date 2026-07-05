// ============================================================
// screens/auth/login.js — Phase 01: Authentication (Login view)
//
// Pixel spec: 01-authentication/{design,desktop,mobile}.png,
// prompt.md, interaction.md, notes.md (v1.1).
//
// Out of scope for this phase (no pixel-perfect spec exists for
// these — see the Phase 01 completion report's "Known differences"):
//   - Sign Up / Forgot Password destination screens
//   - Real Google/Apple OAuth (no backend wiring exists for it yet)
//   - Phase 02 (Tuto Welcome) — a minimal placeholder stands in for it
//     so the documented screen-push transition is still real and
//     testable, per notes.md: "On valid submission ... route to
//     Phase 2: Tuto Welcome."
// ============================================================

import './login.css';
import { Button, setButtonLoading } from '../../components/button.js';
import { Card } from '../../components/card.js';
import { Tuto } from '../../components/tuto.js';
import { FormInput } from '../../components/formInput.js';
import { SocialButton } from '../../components/socialButton.js';
import { supabase, UserState } from '../../db.js';
import { fadeSlideIn, shake, slidePush, prefersReducedMotion } from '../../animation.js';
import { replace } from '../../router.js';
import * as Phase02Placeholder from '../onboarding/_phase02Placeholder.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAIL_ICON = `<svg viewBox="0 0 20 20" width="18" height="18" fill="none"><path d="M3 5.5h14a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.6"/><path d="M2.4 6 10 11.5 17.6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const LOCK_ICON = `<svg viewBox="0 0 20 20" width="18" height="18" fill="none"><rect x="4.5" y="9" width="11" height="8" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const EYE_ICON = `<svg viewBox="0 0 20 20" width="18" height="18" fill="none"><path d="M1.5 10S4.5 4.5 10 4.5 18.5 10 18.5 10 15.5 15.5 10 15.5 1.5 10 1.5 10z" stroke="currentColor" stroke-width="1.6"/><circle cx="10" cy="10" r="2.4" stroke="currentColor" stroke-width="1.6"/></svg>`;
const EYE_OFF_ICON = `<svg viewBox="0 0 20 20" width="18" height="18" fill="none"><path d="M2.5 2.5l15 15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M1.5 10S4.5 4.5 10 4.5c1.4 0 2.6.35 3.6.87M18.5 10S16.9 12.9 14 14.4M6.6 6.9C4.6 8 1.5 10 1.5 10s3 5.5 8.5 5.5c1.05 0 2-.18 2.85-.48" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function ValueCard(icon, title, desc) {
  const el = document.createElement('div');
  el.className = 'auth-value-card';
  el.innerHTML = `
    <span class="auth-value-card__icon">${icon}</span>
    <span class="auth-value-card__title">${title}</span>
    <span class="auth-value-card__desc">${desc}</span>
  `;
  return el;
}

function FloatingBadge(content, position) {
  const el = document.createElement('div');
  el.className = 'auth-floating-badge';
  el.style.cssText = position;
  el.innerHTML = content;
  return el;
}

export function mount(container) {
  container.classList.add('ds-screen--split', 'ds-screen--split-even');

  // ---- Left: Tuto hero panel ----
  const hero = document.createElement('div');
  hero.className = 'ds-split-hero auth-hero';

  const header = document.createElement('div');
  header.className = 'auth-header';
  header.innerHTML = `
    <div class="auth-logo">Lingu<span>Alphabet</span></div>
    <p class="auth-tagline">AI Coach for Language Mastery</p>
  `;

  const heroCopy = document.createElement('div');
  heroCopy.className = 'auth-hero-copy';
  heroCopy.innerHTML = `
    <h1 class="auth-headline">Welcome back!</h1>
    <p class="auth-subheadline">Continue your English journey with your AI coach.</p>
  `;

  const mascotWrap = document.createElement('div');
  mascotWrap.className = 'auth-mascot-wrap ds-hide-mobile';
  const tuto = Tuto({ pose: 'wave', size: 220, glow: true, altText: 'Tuto waving hello' });
  mascotWrap.append(
    tuto,
    FloatingBadge('Aa', 'top: 6%; left: 4%;'),
    FloatingBadge('🎧', 'top: 42%; right: 2%;'),
    FloatingBadge('📖', 'bottom: 14%; right: 10%;')
  );

  const valueCards = document.createElement('div');
  valueCards.className = 'auth-value-cards ds-hide-mobile';
  valueCards.append(
    ValueCard('🎯', 'Personalized Learning', 'AI adapts to your level and goals'),
    ValueCard('📈', 'Track Progress', 'See your growth every day'),
    ValueCard('🛡️', 'Learn Confidently', 'Practice anytime, anywhere')
  );

  hero.append(header, heroCopy, mascotWrap, valueCards);

  // ---- Right: auth card ----
  const panel = document.createElement('div');
  panel.className = 'ds-split-panel ds-split-panel--canvas';

  const card = Card({ className: 'ds-card--spacious auth-card' });

  const headingDesktop = document.createElement('h2');
  headingDesktop.className = 'auth-card-heading ds-hide-mobile';
  headingDesktop.textContent = 'Sign In';

  const headingMobile = document.createElement('p');
  headingMobile.className = 'auth-card-heading-mobile ds-hide-desktop';
  headingMobile.textContent = 'Enter your credentials to continue';

  const email = FormInput({
    id: 'auth-email',
    label: 'Email address',
    type: 'email',
    placeholder: 'Enter your email',
    iconSvg: MAIL_ICON,
    autocomplete: 'email'
  });

  const password = FormInput({
    id: 'auth-password',
    label: 'Password',
    type: 'password',
    placeholder: 'Enter your password',
    iconSvg: LOCK_ICON,
    autocomplete: 'current-password'
  });

  // Mobile mockup drops the standalone label (field icon + placeholder
  // carry the meaning instead) — see this file's header note and the
  // Phase 01 report's "Known differences" for the placeholder-text caveat.
  email.el.querySelector('.ds-input-label')?.classList.add('ds-hide-mobile');
  password.el.querySelector('.ds-input-label')?.classList.add('ds-hide-mobile');

  const eyeToggle = document.createElement('button');
  eyeToggle.type = 'button';
  eyeToggle.className = 'auth-eye-toggle';
  eyeToggle.innerHTML = EYE_ICON;
  eyeToggle.setAttribute('aria-label', 'Show password');
  eyeToggle.addEventListener('click', () => {
    const showing = password.input.type === 'text';
    password.input.type = showing ? 'password' : 'text';
    eyeToggle.innerHTML = showing ? EYE_ICON : EYE_OFF_ICON;
    eyeToggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
  });
  password.el.querySelector('.ds-input-field').appendChild(eyeToggle);

  const optionsRow = document.createElement('div');
  optionsRow.className = 'auth-options-row';
  optionsRow.innerHTML = `
    <label class="auth-checkbox">
      <input type="checkbox" id="auth-remember" />
      <span>Remember me</span>
    </label>
    <button type="button" class="auth-link-btn" id="auth-forgot">Forgot password?</button>
  `;

  const errorBanner = document.createElement('p');
  errorBanner.className = 'auth-error-banner hidden';
  errorBanner.setAttribute('role', 'alert');

  const submitBtn = Button({ label: 'Sign In', variant: 'primary', block: true, arrow: true, disabled: true });

  const divider = document.createElement('div');
  divider.className = 'auth-divider';
  divider.innerHTML = `<span>or continue with</span>`;

  const ssoDesktop = document.createElement('div');
  ssoDesktop.className = 'ds-social-group ds-hide-mobile';
  ssoDesktop.append(
    SocialButton({ provider: 'google', variant: 'icon', onClick: () => handleSsoStub('Google') }),
    SocialButton({ provider: 'apple', variant: 'icon', onClick: () => handleSsoStub('Apple') })
  );

  const ssoMobile = document.createElement('div');
  ssoMobile.className = 'ds-social-group ds-social-group--stacked ds-hide-desktop';
  ssoMobile.append(
    SocialButton({ provider: 'google', variant: 'full', onClick: () => handleSsoStub('Google') }),
    SocialButton({ provider: 'apple', variant: 'full', onClick: () => handleSsoStub('Apple') })
  );

  const signupRow = document.createElement('p');
  signupRow.className = 'auth-signup-row';
  signupRow.innerHTML = `Don't have an account? <button type="button" class="auth-link-btn" id="auth-signup">Sign Up</button>`;

  card.append(
    headingDesktop, headingMobile,
    email.el, password.el,
    optionsRow, errorBanner, submitBtn,
    divider, ssoDesktop, ssoMobile,
    signupRow
  );

  const footer = document.createElement('p');
  footer.className = 'auth-footer';
  footer.innerHTML = `<span class="ds-hide-mobile">${LOCK_ICON}</span> By continuing, you agree to our <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>.`;

  panel.append(card, footer);

  container.append(hero, panel);

  // ---- Validation ----
  function validate() {
    const emailValid = EMAIL_RE.test(email.input.value.trim());
    const passwordValid = password.input.value.length >= 8;
    submitBtn.disabled = !(emailValid && passwordValid);
    return { emailValid, passwordValid };
  }

  email.input.addEventListener('input', () => { email.setError(null); validate(); });
  password.input.addEventListener('input', () => { password.setError(null); validate(); });

  function showFormError(message) {
    errorBanner.textContent = message;
    errorBanner.classList.remove('hidden');
    shake(card);
  }

  function clearFormError() {
    errorBanner.classList.add('hidden');
  }

  // ---- Stubs for out-of-scope destinations (see file header) ----
  function handleSsoStub(provider) {
    showFormError(`${provider} sign-in isn't wired up yet — no OAuth backend exists for it in this project.`);
  }

  card.querySelector('#auth-forgot')?.addEventListener('click', () => {
    showFormError('Forgot Password has no approved screen design yet — out of scope for Phase 01.');
  });

  const signupBtn = card.querySelector('#auth-signup');
  signupBtn?.addEventListener('click', () => {
    showFormError('Sign Up has no approved screen design yet — out of scope for Phase 01.');
  });

  // ---- Submit ----
  async function handleSubmit() {
    const { emailValid, passwordValid } = validate();
    if (!emailValid) {
      email.setError('Enter a valid email address.');
    }
    if (!passwordValid) {
      password.setError('Password must be at least 8 characters.');
    }
    if (!emailValid || !passwordValid) {
      showFormError('Please fix the highlighted fields.');
      return;
    }

    clearFormError();
    setButtonLoading(submitBtn, true);

    try {
      await supabase.signIn(email.input.value.trim(), password.input.value);
      UserState.update({ userId: supabase.currentUser?.id, email: email.input.value.trim(), isGuest: false });

      // interaction.md: "Form card fades (150ms), screen pushes left (450ms)"
      card.style.transition = 'opacity 150ms ease';
      card.style.opacity = '0';

      setTimeout(() => {
        replace(Phase02Placeholder, {}, { transition: slidePush });
      }, prefersReducedMotion() ? 0 : 150);
    } catch (err) {
      setButtonLoading(submitBtn, false);
      showFormError(err.message || 'Incorrect email or password.');
    }
  }

  submitBtn.addEventListener('click', handleSubmit);
  password.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !submitBtn.disabled) handleSubmit();
  });

  // ---- Entrance animation (interaction.md) ----
  // The root container's own "Background: Opacity 0 -> 1 (300ms)" fade is
  // handled by the router's mount transition (see main.js), not here —
  // duplicating it on `container` would fight the router's own opacity
  // transition on the same element.
  fadeSlideIn(hero, { delay: 150, duration: 450, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fromY: 24 });
  fadeSlideIn(card, { delay: 250, duration: 350, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fromY: 16, fromScale: 0.96 });

  return {
    unmount() {
      // No timers/subscriptions held beyond what fadeSlideIn's internal
      // setTimeouts already self-resolve; nothing to tear down.
    }
  };
}
