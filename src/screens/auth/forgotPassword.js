// ============================================================
// screens/auth/forgotPassword.js — Authentication V1: Forgot Password
//
// Mirrors login.js's structure/components/CSS exactly per explicit
// instruction — no shared abstraction extracted, by explicit
// instruction not to refactor. The SSO divider/buttons are omitted
// (not the layout being redesigned — "continue with Google" simply
// doesn't apply to a password-reset form).
//
// Supabase wiring: calls the same supabase.resetPassword() already
// implemented in db.js. No real project credentials are configured
// yet (deferred to a separate approved step) — until then this
// correctly surfaces "Supabase not configured" through the same
// error-banner path Sign In already uses.
// ============================================================

import './login.css';
import { Button, setButtonLoading } from '../../components/button.js';
import { Card } from '../../components/card.js';
import { MascotHero } from '../../components/mascotHero.js';
import { FormInput } from '../../components/formInput.js';
import { supabase } from '../../db.js';
import { fadeSlideIn, shake } from '../../animation.js';
import { replace } from '../../router.js';
import * as LoginScreen from './login.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAIL_ICON = `<svg viewBox="0 0 20 20" width="18" height="18" fill="none"><path d="M3 5.5h14a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.6"/><path d="M2.4 6 10 11.5 17.6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const LOCK_ICON = `<svg viewBox="0 0 20 20" width="18" height="18" fill="none"><rect x="4.5" y="9" width="11" height="8" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

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

export function mount(container) {
  container.classList.add('ds-screen--split', 'ds-screen--split-even');

  // ---- Left: Tuto hero panel (identical to login.js) ----
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
    <h1 class="auth-headline">Forgot something?</h1>
    <p class="auth-subheadline">No worries — we'll help you get back in.</p>
  `;

  const mascotWrap = MascotHero({
    pose: 'wave',
    size: 375,
    glow: true,
    altText: 'Tuto waving hello',
    className: 'auth-mascot-wrap ds-hide-mobile'
  });

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
  headingDesktop.textContent = 'Reset Password';

  const headingMobile = document.createElement('p');
  headingMobile.className = 'auth-card-heading-mobile ds-hide-desktop';
  headingMobile.textContent = 'Enter your email to reset your password';

  const subtext = document.createElement('p');
  subtext.className = 'auth-subheadline';
  subtext.style.marginTop = '-8px';
  subtext.textContent = "Enter the email address for your account and we'll send you a link to reset your password.";

  const email = FormInput({
    id: 'forgot-email',
    label: 'Email address',
    type: 'email',
    placeholder: 'Enter your email',
    iconSvg: MAIL_ICON,
    autocomplete: 'email'
  });
  email.el.querySelector('.ds-input-label')?.classList.add('ds-hide-mobile');

  const mobileQuery = window.matchMedia('(max-width: 767px)');
  function applyResponsivePlaceholder() {
    email.input.placeholder = mobileQuery.matches ? 'Email address' : 'Enter your email';
  }
  applyResponsivePlaceholder();
  mobileQuery.addEventListener('change', applyResponsivePlaceholder);

  const errorBanner = document.createElement('p');
  errorBanner.className = 'auth-error-banner hidden';
  errorBanner.setAttribute('role', 'alert');

  const successBanner = document.createElement('p');
  successBanner.className = 'auth-success-banner hidden';
  successBanner.setAttribute('role', 'status');

  const submitBtn = Button({ label: 'Send Reset Link', variant: 'primary', block: true, arrow: true, disabled: true });

  const loginRow = document.createElement('p');
  loginRow.className = 'auth-signup-row';
  loginRow.innerHTML = `Remembered your password? <button type="button" class="auth-link-btn" id="forgot-to-login">Sign In</button>`;

  card.append(
    headingDesktop, headingMobile, subtext,
    email.el,
    errorBanner, successBanner, submitBtn,
    loginRow
  );

  const footer = document.createElement('p');
  footer.className = 'auth-footer';
  footer.innerHTML = `<span class="ds-hide-mobile">${LOCK_ICON}</span> By continuing, you agree to our <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>.`;

  panel.append(card, footer);

  container.append(hero, panel);

  // ---- Validation ----
  function validate() {
    const emailValid = EMAIL_RE.test(email.input.value.trim());
    submitBtn.disabled = !emailValid;
    return { emailValid };
  }

  email.input.addEventListener('input', () => { email.setError(null); validate(); });

  function showFormError(message) {
    errorBanner.textContent = message;
    errorBanner.classList.remove('hidden');
    successBanner.classList.add('hidden');
    shake(card);
  }

  function clearFormError() {
    errorBanner.classList.add('hidden');
  }

  card.querySelector('#forgot-to-login')?.addEventListener('click', () => {
    replace(LoginScreen, {});
  });

  // ---- Submit ----
  async function handleSubmit() {
    const { emailValid } = validate();
    if (!emailValid) {
      email.setError('Enter a valid email address.');
      showFormError('Please fix the highlighted field.');
      return;
    }

    clearFormError();
    setButtonLoading(submitBtn, true);

    try {
      await supabase.resetPassword(email.input.value.trim());
      setButtonLoading(submitBtn, false);
      submitBtn.disabled = true;
      email.input.disabled = true;
      successBanner.textContent = `If an account exists for ${email.input.value.trim()}, a password reset link has been sent.`;
      successBanner.classList.remove('hidden');
    } catch (err) {
      setButtonLoading(submitBtn, false);
      showFormError(err.message || 'Could not send the reset link.');
    }
  }

  submitBtn.addEventListener('click', handleSubmit);
  email.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !submitBtn.disabled) handleSubmit();
  });

  // ---- Entrance animation (matching login.js exactly) ----
  fadeSlideIn(hero, { delay: 150, duration: 450, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fromY: 24 });
  fadeSlideIn(card, { delay: 250, duration: 350, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fromY: 16, fromScale: 0.96 });

  return {
    unmount() {
      mobileQuery.removeEventListener('change', applyResponsivePlaceholder);
    }
  };
}
