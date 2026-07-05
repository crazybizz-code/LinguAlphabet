// ============================================================
// screens/auth/signup.js — Authentication V1: Sign Up
//
// Mirrors login.js's structure/components/CSS exactly per explicit
// instruction ("match existing Login UI, reuse the same components,
// do not redesign") — no shared abstraction extracted between the two
// screens, by explicit instruction not to refactor.
//
// No design.png/prompt.md exists for this screen (confirmed: not in
// the Design Handoff at all) — layout/components/styling are 1:1
// reused from 01-authentication's approved Login screen; only copy
// and field set differ since this is a different form.
//
// Supabase wiring: calls the same supabase.signUp() already
// implemented in db.js. No real project credentials are configured
// yet (by instruction, deferred to a separate approved step) — until
// then this correctly surfaces "Supabase not configured" through the
// same error-banner path Sign In already uses, not a special stub.
// ============================================================

import './login.css';
import { Button, setButtonLoading } from '../../components/button.js';
import { Card } from '../../components/card.js';
import { MascotHero } from '../../components/mascotHero.js';
import { FormInput } from '../../components/formInput.js';
import { SocialButton } from '../../components/socialButton.js';
import { supabase, UserState } from '../../db.js';
import { fadeSlideIn, shake, slidePush, prefersReducedMotion } from '../../animation.js';
import { replace } from '../../router.js';
import * as LoginScreen from './login.js';
import * as Phase02 from '../onboarding/tutoWelcome.js';

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
    <h1 class="auth-headline">Join us!</h1>
    <p class="auth-subheadline">Start your English journey with your AI coach.</p>
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
  headingDesktop.textContent = 'Sign Up';

  const headingMobile = document.createElement('p');
  headingMobile.className = 'auth-card-heading-mobile ds-hide-desktop';
  headingMobile.textContent = 'Create your account to continue';

  const email = FormInput({
    id: 'signup-email',
    label: 'Email address',
    type: 'email',
    placeholder: 'Enter your email',
    iconSvg: MAIL_ICON,
    autocomplete: 'email'
  });

  const password = FormInput({
    id: 'signup-password',
    label: 'Password',
    type: 'password',
    placeholder: 'Create a password',
    iconSvg: LOCK_ICON,
    autocomplete: 'new-password'
  });

  const confirmPassword = FormInput({
    id: 'signup-confirm-password',
    label: 'Confirm password',
    type: 'password',
    placeholder: 'Re-enter your password',
    iconSvg: LOCK_ICON,
    autocomplete: 'new-password'
  });

  email.el.querySelector('.ds-input-label')?.classList.add('ds-hide-mobile');
  password.el.querySelector('.ds-input-label')?.classList.add('ds-hide-mobile');
  confirmPassword.el.querySelector('.ds-input-label')?.classList.add('ds-hide-mobile');

  const mobileQuery = window.matchMedia('(max-width: 767px)');
  function applyResponsivePlaceholders() {
    const isMobile = mobileQuery.matches;
    email.input.placeholder = isMobile ? 'Email address' : 'Enter your email';
    password.input.placeholder = isMobile ? 'Password' : 'Create a password';
    confirmPassword.input.placeholder = isMobile ? 'Confirm password' : 'Re-enter your password';
  }
  applyResponsivePlaceholders();
  mobileQuery.addEventListener('change', applyResponsivePlaceholders);

  function makeEyeToggle(forInput) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'auth-eye-toggle';
    btn.innerHTML = EYE_ICON;
    btn.setAttribute('aria-label', 'Show password');
    btn.addEventListener('click', () => {
      const showing = forInput.input.type === 'text';
      forInput.input.type = showing ? 'password' : 'text';
      btn.innerHTML = showing ? EYE_ICON : EYE_OFF_ICON;
      btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    });
    return btn;
  }
  password.el.querySelector('.ds-input-field').appendChild(makeEyeToggle(password));
  confirmPassword.el.querySelector('.ds-input-field').appendChild(makeEyeToggle(confirmPassword));

  const errorBanner = document.createElement('p');
  errorBanner.className = 'auth-error-banner hidden';
  errorBanner.setAttribute('role', 'alert');

  const submitBtn = Button({ label: 'Sign Up', variant: 'primary', block: true, arrow: true, disabled: true });

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

  const loginRow = document.createElement('p');
  loginRow.className = 'auth-signup-row';
  loginRow.innerHTML = `Already have an account? <button type="button" class="auth-link-btn" id="signup-to-login">Sign In</button>`;

  card.append(
    headingDesktop, headingMobile,
    email.el, password.el, confirmPassword.el,
    errorBanner, submitBtn,
    divider, ssoDesktop, ssoMobile,
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
    const passwordValid = password.input.value.length >= 8;
    const confirmValid = confirmPassword.input.value.length > 0 && confirmPassword.input.value === password.input.value;
    submitBtn.disabled = !(emailValid && passwordValid && confirmValid);
    return { emailValid, passwordValid, confirmValid };
  }

  email.input.addEventListener('input', () => { email.setError(null); validate(); });
  password.input.addEventListener('input', () => { password.setError(null); validate(); });
  confirmPassword.input.addEventListener('input', () => { confirmPassword.setError(null); validate(); });

  function showFormError(message) {
    errorBanner.textContent = message;
    errorBanner.classList.remove('hidden');
    shake(card);
  }

  function clearFormError() {
    errorBanner.classList.add('hidden');
  }

  function handleSsoStub(provider) {
    showFormError(`${provider} sign-up isn't wired up yet — no OAuth backend exists for it in this project.`);
  }

  card.querySelector('#signup-to-login')?.addEventListener('click', () => {
    replace(LoginScreen, {});
  });

  // ---- Submit ----
  async function handleSubmit() {
    const { emailValid, passwordValid, confirmValid } = validate();
    if (!emailValid) {
      email.setError('Enter a valid email address.');
    }
    if (!passwordValid) {
      password.setError('Password must be at least 8 characters.');
    }
    if (passwordValid && !confirmValid) {
      confirmPassword.setError('Passwords do not match.');
    }
    if (!emailValid || !passwordValid || !confirmValid) {
      showFormError('Please fix the highlighted fields.');
      return;
    }

    clearFormError();
    setButtonLoading(submitBtn, true);

    try {
      await supabase.signUp(email.input.value.trim(), password.input.value);
      UserState.update({ userId: supabase.currentUser?.id, email: email.input.value.trim(), isGuest: false });

      card.style.transition = 'opacity 150ms ease';
      card.style.opacity = '0';

      setTimeout(() => {
        replace(Phase02, {}, { transition: slidePush });
      }, prefersReducedMotion() ? 0 : 150);
    } catch (err) {
      setButtonLoading(submitBtn, false);
      showFormError(err.message || 'Could not create your account.');
    }
  }

  submitBtn.addEventListener('click', handleSubmit);
  confirmPassword.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !submitBtn.disabled) handleSubmit();
  });

  // ---- Entrance animation (matching login.js exactly) ----
  fadeSlideIn(hero, { delay: 150, duration: 450, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fromY: 24 });
  fadeSlideIn(card, { delay: 250, duration: 350, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fromY: 16, fromScale: 0.96 });

  return {
    unmount() {
      mobileQuery.removeEventListener('change', applyResponsivePlaceholders);
    }
  };
}
