/**
 * Meridian · Conversation Bubble
 * ---------------------------------------------------------------
 * One conversational turn. Speaker-agnostic API so Discovery
 * Session, Assessment, Learning Brain and Dashboard reviews all
 * render turns the same way.
 */

/**
 * @param {{
 *   speaker?: 'tuto' | 'learner',
 *   text?: string | string[],       // paragraphs
 *   html?: string,                  // pre-sanitized rich content
 *   name?: string,
 *   time?: string,
 *   typing?: boolean,               // typing indicator instead of text
 *   streaming?: boolean,            // live caret while text arrives
 * }} [options]
 * @returns {{ el: HTMLElement, setText: (t: string) => void,
 *            setStreaming: (on: boolean) => void }}
 */
export function createBubble({
  speaker = 'tuto',
  text = '',
  html = '',
  name = speaker === 'tuto' ? 'Tuto' : 'You',
  time = '',
  typing = false,
  streaming = false,
} = {}) {
  const root = document.createElement('article');
  root.className = `la-bubble la-bubble--${speaker}`;
  if (streaming) root.classList.add('la-bubble--streaming');

  const avatar = document.createElement('span');
  avatar.className = 'la-bubble__avatar';
  avatar.setAttribute('aria-hidden', 'true');

  const body = document.createElement('div');
  body.className = 'la-bubble__body';

  if (typing) {
    body.innerHTML =
      '<span class="la-bubble__typing" role="status" aria-label="Tuto is typing"><i></i><i></i><i></i></span>';
  } else if (html) {
    body.innerHTML = html;
  } else {
    const paragraphs = Array.isArray(text) ? text : [text];
    paragraphs.forEach((t) => {
      const p = document.createElement('p');
      p.textContent = t;
      body.appendChild(p);
    });
  }

  const meta = document.createElement('footer');
  meta.className = 'la-bubble__meta';
  meta.innerHTML =
    `<span class="la-bubble__name">${name}</span>` +
    (time ? `<time>${time}</time>` : '');

  root.append(avatar, body, meta);

  return {
    el: root,
    setText(t) {
      body.innerHTML = '';
      const p = document.createElement('p');
      p.textContent = t;
      body.appendChild(p);
    },
    setStreaming(on) {
      root.classList.toggle('la-bubble--streaming', on);
    },
  };
}
