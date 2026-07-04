// ============================================================
// main.js — LinguAlphabet V2 bootstrap
//
// This is an infrastructure-only entry point. It loads bundled +
// remote lesson data and restores the user/session state, but does
// NOT mount any product UI — the V1 onboarding/dashboard/navigation
// experience has been removed as part of the V2 product reset.
//
// Build the new product experience on top of `store` and the
// engine modules (assessment.js, recommendations.js, lessons.js,
// db.js, ai.js, player.js).
// ============================================================
import './style.css';
import { getInitialData } from './data.js';
import { supabase, UserState } from './db.js';
import { normalizeTranscriptCollection, loadCachedRemoteLessons, fetchAndMergeRemoteLessons } from './lessons.js';

export const store = {
  podcasts: [],
  transcripts: {},
  assessmentQuestions: []
};

async function boot() {
  const data = getInitialData();
  store.podcasts = data.podcasts;
  store.assessmentQuestions = data.assessmentQuestions || [];
  store.transcripts = normalizeTranscriptCollection(data.transcripts);

  loadCachedRemoteLessons(store);

  UserState.load();

  await supabase.init().catch(() => {});

  fetchAndMergeRemoteLessons(store, supabase).catch(error => {
    if (import.meta.env.DEV) console.warn('Remote lessons unavailable:', error.message);
  });

  if (import.meta.env.DEV) {
    console.info('[LinguAlphabet V2] Clean foundation booted — no product UI mounted yet.', {
      podcasts: store.podcasts.length,
      hasSession: Boolean(UserState.get('email')) || Boolean(UserState.get('isGuest'))
    });
  }
}

boot();
