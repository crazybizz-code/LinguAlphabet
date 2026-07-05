// ============================================================
// components/toast.js — transient bottom toast
// See styles/components.css for the visual language (.ds-toast).
// ============================================================

let toastEl = null;
let hideTimer = null;

function ensureToastEl() {
  if (toastEl) return toastEl;
  toastEl = document.createElement('div');
  toastEl.className = 'ds-toast';
  document.body.appendChild(toastEl);
  return toastEl;
}

export function showToast(message, { duration = 2500 } = {}) {
  const el = ensureToastEl();
  el.textContent = message;
  el.classList.add('is-visible');

  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => el.classList.remove('is-visible'), duration);
}
