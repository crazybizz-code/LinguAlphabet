export * from "./types";
export * from "./registry";

// GRAMMAR_UNITS / VOCABULARY_ENTRIES / TEACHING_ASSETS are intentionally
// not re-exported here — every caller should go through ./registry.ts's
// functions, not the raw Records, so the storage shape (still a plain
// object today) can change later without touching a call site. See
// docs/ai-architecture.md's "Tuto Knowledge Base" section.
