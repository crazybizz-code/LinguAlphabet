export * from "./types";
export * from "./performance";
export * from "./registry";

// EXAMPLE_LEARNER_PROFILES / EXAMPLE_GRAMMAR_MISTAKE_RECORDS (./profiles.ts)
// are intentionally not re-exported here, same reasoning as
// src/ai/knowledge/index.ts: callers go through ./registry.ts's
// functions, not the raw Record, so the storage shape (a real per-learner
// store, eventually) can change later without touching a call site.
