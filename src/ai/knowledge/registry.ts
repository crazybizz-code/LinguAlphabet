import type { CefrLevel } from "@/ai/context";
import { GRAMMAR_UNITS } from "./grammar";
import { VOCABULARY_ENTRIES } from "./vocabulary";
import { TEACHING_ASSETS } from "./assets";
import type { GrammarUnit, KnowledgeDomain, KnowledgeVocabularyEntry, TeachingAsset } from "./types";

/**
 * Read-only lookups over the static content in ./grammar.ts, ./vocabulary.ts,
 * and ./assets.ts (Sprint 8) — plain object/array access, not a pluggable
 * registry like src/ai/providers or src/ai/tools, since this content isn't
 * registered from multiple sources; it's a fixed library. This is the
 * seam a future feature (or, per the brief, a future RAG/memory layer)
 * would call through instead of reaching into the Records directly.
 */

export function getGrammarUnit(id: string): GrammarUnit | null {
  return GRAMMAR_UNITS[id] ?? null;
}

export function listGrammarUnits(): GrammarUnit[] {
  return Object.values(GRAMMAR_UNITS);
}

export function listGrammarUnitsByLevel(level: CefrLevel): GrammarUnit[] {
  return listGrammarUnits().filter((unit) => unit.cefrLevels.includes(level));
}

export function getVocabularyEntry(word: string): KnowledgeVocabularyEntry | null {
  return VOCABULARY_ENTRIES[word.trim().toLowerCase()] ?? null;
}

export function listVocabularyEntries(): KnowledgeVocabularyEntry[] {
  return Object.values(VOCABULARY_ENTRIES);
}

export function getTeachingAsset(id: string): TeachingAsset | null {
  return TEACHING_ASSETS[id] ?? null;
}

export function listTeachingAssetsByDomain(domain: KnowledgeDomain): TeachingAsset[] {
  return Object.values(TEACHING_ASSETS).filter((asset) => asset.domain === domain);
}

export function listTeachingAssetsByType<T extends TeachingAsset["type"]>(
  type: T,
): Extract<TeachingAsset, { type: T }>[] {
  return Object.values(TEACHING_ASSETS).filter(
    (asset): asset is Extract<TeachingAsset, { type: T }> => asset.type === type,
  );
}

/** Resolves a GrammarUnit's `exerciseIds` into the actual asset records — the concrete reuse path from unit to exercise. */
export function getExercisesForGrammarUnit(unitId: string): TeachingAsset[] {
  const unit = getGrammarUnit(unitId);
  if (!unit) return [];
  return unit.exerciseIds.map((id) => TEACHING_ASSETS[id]).filter((asset): asset is TeachingAsset => asset != null);
}

/** The reverse lookup — every asset that references a given vocabulary word, regardless of which conversation first introduced it. */
export function getAssetsForVocabularyWord(word: string): TeachingAsset[] {
  const normalized = word.trim().toLowerCase();
  return Object.values(TEACHING_ASSETS).filter((asset) =>
    asset.relatedVocabularyWords.some((related) => related.toLowerCase() === normalized),
  );
}

/** Every asset that references a given grammar unit — the reverse of exerciseIds, useful beyond just a unit's own declared exercises. */
export function getAssetsForGrammarUnit(unitId: string): TeachingAsset[] {
  return Object.values(TEACHING_ASSETS).filter((asset) => asset.relatedGrammarUnitIds.includes(unitId));
}
