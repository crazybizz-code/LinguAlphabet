// ============================================================
// main.js — LinguAlphabet V2 bootstrap
//
// Loads bundled + remote lesson data, restores session state, and
// initializes the router against #app. It does NOT mount any screen
// yet — screen implementation is a separate, approved-per-screen step.
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
import { initRouter } from './router.js';

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

  if (import.meta.env.DEV) {
    console.info('[LinguAlphabet V2] Architecture booted — router ready, no screen registered yet.', {
      podcasts: contentStore.podcasts.length,
      hasSession: Boolean(UserState.get('email')) || Boolean(UserState.get('isGuest'))
    });
  }
}

boot();
