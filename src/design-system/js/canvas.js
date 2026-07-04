/**
 * Meridian · Conversation Canvas
 * ---------------------------------------------------------------
 * The stage every scene is performed on. Provides three slots —
 * header, stage, dock — and declares itself a CSS container so
 * every Meridian component inside adapts to its width.
 *
 * Density: 'focus' (Discovery, Assessment) · 'wide' (Dashboard,
 * Learning Brain) · 'default'.
 */

/**
 * @param {{
 *   density?: 'default' | 'focus' | 'wide',
 *   scroll?: boolean,   // stage scrolls inside a fixed-height shell
 *   label?: string,     // accessible region label
 * }} [options]
 * @returns {{ el: HTMLElement, header: HTMLElement, stage: HTMLElement,
 *            dock: HTMLElement, scrollToEnd: () => void }}
 */
export function createCanvas({ density = 'default', scroll = false, label = '' } = {}) {
  const root = document.createElement('main');
  root.className = 'la-canvas';
  if (density === 'focus') root.classList.add('la-canvas--focus');
  if (density === 'wide') root.classList.add('la-canvas--wide');
  if (scroll) root.classList.add('la-canvas--scroll');
  if (label) root.setAttribute('aria-label', label);

  const inner = document.createElement('div');
  inner.className = 'la-canvas__inner';

  const header = document.createElement('div');
  header.className = 'la-canvas__header';

  const stage = document.createElement('div');
  stage.className = 'la-canvas__stage';

  const dock = document.createElement('div');
  dock.className = 'la-canvas__dock';

  inner.append(header, stage, dock);
  root.appendChild(inner);

  return {
    el: root,
    header,
    stage,
    dock,
    scrollToEnd() {
      stage.scrollTo({ top: stage.scrollHeight, behavior: 'smooth' });
    },
  };
}
