// ============================================================
// main.js — LinguAlphabet V2 bootstrap
//
// Loads bundled + remote lesson data, restores session state, and
// initializes the router against #app, then mounts the first
// implemented onboarding phase (01-authentication).
//
// Build the new product experience on top of `contentStore`/`store.js`
// and the engine modules (assessment.js, recommendations.js,
// lessons.js, db.js, ai.js, player.js), composed from `src/components/*`
// and orchestrated by `router.js`.
// ============================================================
import './styles/tokens.css';
import './styles/layout.css';
import './styles/components.css';
import { getInitialData } from './data.js';
import { supabase, UserState } from './db.js';
import { normalizeTranscriptCollection, loadCachedRemoteLessons, fetchAndMergeRemoteLessons } from './lessons.js';
import { contentStore } from './store.js';
import { initRouter, replace } from './router.js';
import { crossFade } from './animation.js';
import * as LoginScreen from './screens/auth/login.js';

async function boot() {
  const data = getInitialData();
  contentStore.podcasts = data.podcasts;
  contentStore.assessmentQuestions = data.assessmentQuestions || [];
  contentStore.transcripts = normalizeTranscriptCollection(data.transcripts);

  loadCachedRemoteLessons(contentStore);

  UserState.load();

  await supabase.init().catch(() => {});

  fetchAndMergeRemoteLessons(contentStore, supabase).catch(error => {
    if (import.meta.env.DEV) console.warn('Remote lessons unavailable:', error.message);
  });

  initRouter(document.getElementById('app'));

  // 01-authentication/interaction.md: "Background: Opacity 0 -> 1
  // (300ms, ease-out)" — the screen's own root-level fade, owned by the
  // router's mount transition rather than duplicated inside the screen.
  await replace(LoginScreen, {}, {
    transition: (opts) => crossFade({ ...opts, duration: 300 })
  });

  if (import.meta.env.DEV) {
    console.info('[LinguAlphabet V2] Phase 01 (Authentication) mounted.', {
      podcasts: contentStore.podcasts.length,
      hasSession: Boolean(UserState.get('email')) || Boolean(UserState.get('isGuest'))
    });
  }
}

boot();
