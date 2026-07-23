import type { ReactNode } from "react";
import type { VocabularyExplanation } from "@/lib/tuto-chat/askVocabulary";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">{label}</p>
      <div className="mt-1 text-sm leading-relaxed text-text-primary">{children}</div>
    </div>
  );
}

function ChipList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span key={item} className="rounded-full bg-bg-muted px-2.5 py-1 text-xs font-semibold text-text-secondary">
          {item}
        </span>
      ))}
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="list-disc space-y-1 pl-4">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/**
 * Renders the structured VocabularyExplanation (src/ai/features/vocabulary)
 * as a single scrollable card — the polished counterpart to the raw JSON
 * the API returns. Reuses DictionaryOverlay's exact "uppercase caption +
 * value" section style so this reads as the same product, not a bolted-on
 * new visual language.
 */
export function VocabularyCard({ explanation }: { explanation: VocabularyExplanation }) {
  const { vocabularyItem, examples, grammarNotes, followUpPractice, suggestedNextAction } = explanation;

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-border bg-bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        {vocabularyItem.pronunciation && <span className="text-sm text-text-tertiary">{vocabularyItem.pronunciation}</span>}
        {vocabularyItem.partOfSpeech && (
          <span className="rounded-full bg-bg-muted px-2.5 py-1 text-xs font-semibold text-text-secondary">
            {vocabularyItem.partOfSpeech}
          </span>
        )}
        {vocabularyItem.cefrLevel && (
          <span className="rounded-full border border-border px-2.5 py-1 text-xs font-bold text-primary">
            {vocabularyItem.cefrLevel}
          </span>
        )}
      </div>

      <Field label="Meaning">{vocabularyItem.meaning}</Field>
      <Field label="In simple words">{vocabularyItem.simpleExplanation}</Field>
      <Field label="Uzbek">{vocabularyItem.uzbekTranslation}</Field>

      {examples.length > 0 && (
        <Field label="Examples">
          <div className="flex flex-col gap-2">
            {examples.map((example) => (
              <div key={example.sentence} className="rounded-2xl border border-border bg-bg-muted p-3">
                <p className="italic leading-relaxed text-text-secondary">&ldquo;{example.sentence}&rdquo;</p>
                {example.note && <p className="mt-1 text-xs text-text-tertiary">{example.note}</p>}
              </div>
            ))}
          </div>
        </Field>
      )}

      {vocabularyItem.collocations.length > 0 && (
        <Field label="Often used with">
          <ChipList items={vocabularyItem.collocations} />
        </Field>
      )}

      {(vocabularyItem.synonyms.length > 0 || vocabularyItem.antonyms.length > 0) && (
        <div className="grid grid-cols-2 gap-4">
          {vocabularyItem.synonyms.length > 0 && (
            <Field label="Synonyms">
              <ChipList items={vocabularyItem.synonyms} />
            </Field>
          )}
          {vocabularyItem.antonyms.length > 0 && (
            <Field label="Antonyms">
              <ChipList items={vocabularyItem.antonyms} />
            </Field>
          )}
        </div>
      )}

      {grammarNotes.length > 0 && (
        <Field label="Grammar notes">
          <BulletList items={grammarNotes} />
        </Field>
      )}

      {vocabularyItem.commonMistakes.length > 0 && (
        <Field label="Common mistakes">
          <BulletList items={vocabularyItem.commonMistakes} />
        </Field>
      )}

      {vocabularyItem.memoryTips.length > 0 && (
        <Field label="Memory tip">
          <BulletList items={vocabularyItem.memoryTips} />
        </Field>
      )}

      {(followUpPractice || suggestedNextAction) && (
        <div className="rounded-2xl bg-primary-lighter p-4">
          {followUpPractice && <p className="text-sm leading-relaxed text-text-primary">{followUpPractice}</p>}
          {suggestedNextAction && <p className="mt-1 text-xs font-semibold text-primary-dark">{suggestedNextAction}</p>}
        </div>
      )}
    </div>
  );
}
