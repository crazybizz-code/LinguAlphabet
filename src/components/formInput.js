// ============================================================
// components/formInput.js — labeled text input with a leading icon
// See styles/components.css for the visual language (.ds-input*).
// ============================================================

// iconSvg: raw inline SVG markup (leading icon). type: native input type.
// Returns { el, input, setError(message|null) } so callers can wire
// validation without querying the DOM back out.
export function FormInput({ id, label, type = 'text', placeholder = '', iconSvg = '', autocomplete = '' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'ds-input-group';

  if (label) {
    const labelEl = document.createElement('label');
    labelEl.className = 'ds-input-label';
    labelEl.htmlFor = id;
    labelEl.textContent = label;
    wrap.appendChild(labelEl);
  }

  const field = document.createElement('div');
  field.className = 'ds-input-field';

  if (iconSvg) {
    const icon = document.createElement('span');
    icon.className = 'ds-input-icon';
    icon.innerHTML = iconSvg;
    icon.setAttribute('aria-hidden', 'true');
    field.appendChild(icon);
  }

  const input = document.createElement('input');
  input.className = 'ds-input';
  input.id = id;
  input.type = type;
  input.placeholder = placeholder;
  if (autocomplete) input.autocomplete = autocomplete;
  field.appendChild(input);

  wrap.appendChild(field);

  const errorEl = document.createElement('p');
  errorEl.className = 'ds-input-error hidden';
  wrap.appendChild(errorEl);

  function setError(message) {
    field.classList.toggle('is-error', Boolean(message));
    if (message) {
      errorEl.textContent = message;
      errorEl.classList.remove('hidden');
    } else {
      errorEl.textContent = '';
      errorEl.classList.add('hidden');
    }
  }

  return { el: wrap, input, setError };
}
