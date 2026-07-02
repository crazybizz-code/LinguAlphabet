// ============================================================
// auth.js — Authentication module barrel.
//
// Re-exports the focused auth-* modules below so existing imports
// (`from './auth.js'`) keep working unchanged. Implementation lives in:
//   - auth-ui.js         Tuto mascot, panel switching, field interactions
//   - auth-session.js    Splash cold-start routing, Google OAuth
//   - auth-validation.js Email/name/password rules, strength scoring
// ============================================================
export * from './auth-ui.js';
export * from './auth-session.js';
export * from './auth-validation.js';
