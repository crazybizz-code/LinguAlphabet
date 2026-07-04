// ============================================================
// auth-validation.js — Pure auth-form validation (no DOM, no network).
// Email/name/password rules and the live password-strength scorer used by
// Login, Register and Forgot Password. Kept dependency-free so these rules
// are trivial to unit test in isolation from the screens that use them.
// ============================================================

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

// The one function here that touches the DOM — but only elements handed to
// it, never queries `document` itself, so it stays free of screen coupling.
export function renderPasswordStrength(password, meterEl, labelEl) {
  const { level, label } = getPasswordStrength(password);
  if (meterEl) meterEl.dataset.level = String(level);
  if (labelEl) {
    labelEl.textContent = label;
    labelEl.dataset.level = String(level);
  }
}
