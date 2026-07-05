// ============================================================
// components/card.js — shared Card primitive (floating surface)
// See styles/components.css for the visual language (.ds-card).
// ============================================================

export function Card({ className = '', children = [] } = {}) {
  const card = document.createElement('div');
  card.className = className ? `ds-card ${className}` : 'ds-card';
  children.filter(Boolean).forEach(child => card.appendChild(child));
  return card;
}
