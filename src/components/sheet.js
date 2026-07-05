// ============================================================
// components/sheet.js — overlay primitive (centered dialog on
// desktop, bottom sheet on phone — see the @media block in
// styles/components.css for exactly where that switches over).
// ============================================================

export function Sheet({ content, onDismiss } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'ds-sheet-overlay';

  const sheet = document.createElement('div');
  sheet.className = 'ds-sheet';
  if (content) sheet.appendChild(content);
  overlay.appendChild(sheet);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  function open() {
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('is-open'));
  }

  function close() {
    overlay.classList.remove('is-open');
    setTimeout(() => {
      overlay.remove();
      onDismiss?.();
    }, 250); // matches --dur-normal in styles/tokens.css
  }

  return { el: overlay, open, close };
}
