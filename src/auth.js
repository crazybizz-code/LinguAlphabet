// ============================================================
// auth.js — Authentication module barrel.
//
// Re-exports the focused auth-* modules below so existing imports
// (`from './auth.js'`) keep working unchanged. Implementation lives in:
//   - auth-ui.js         Screen/overlay presentation: Tuto mascot, panel
//                        switching, Splash/Loading/Success overlays, field
//                        interactions, the runAuthFlow orchestrator
//   - auth-session.js    Cold-start session routing, Google OAuth
//   - auth-validation.js Email/name/password rules, strength scoring
//   - auth-guest.js      Guest usage-metering infrastructure
// ============================================================
export * from './auth-ui.js';
export * from './auth-session.js';
export * from './auth-validation.js';
export * from './auth-guest.js';
