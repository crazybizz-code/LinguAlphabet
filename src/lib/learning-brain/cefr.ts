import type { CefrLevel } from "@/types/content";

export const CEFR_ORDER: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

export function cefrIndex(level: string): number {
  return CEFR_ORDER.indexOf(level as CefrLevel);
}

export function cefrDistance(a: string, b: string): number {
  const indexA = cefrIndex(a);
  const indexB = cefrIndex(b);
  if (indexA === -1 || indexB === -1) return CEFR_ORDER.length;
  return Math.abs(indexA - indexB);
}

export function nextCefrLevel(level: CefrLevel): CefrLevel {
  const index = cefrIndex(level);
  if (index === -1) return level;
  return CEFR_ORDER[Math.min(index + 1, CEFR_ORDER.length - 1)];
}
