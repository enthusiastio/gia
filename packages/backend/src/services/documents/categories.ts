export const DOCUMENT_CATEGORIES = [
  'genotype_calls',
  'derived_phenotype_states',
  'observed_biomarkers',
  'integrated_state_per_axis',
  'personal_protocol',
  'family_history_clinical',
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  genotype_calls: 'Genotype calls',
  derived_phenotype_states: 'Derived phenotype states',
  observed_biomarkers: 'Observed biomarkers, longitudinal',
  integrated_state_per_axis: 'Integrated state per axis',
  personal_protocol: 'Personal protocol',
  family_history_clinical: 'Family history & clinical context',
};

/**
 * Short, stable and always relevant: injected in full on every message rather
 * than retrieved, so the model never answers without them in view.
 */
export const PINNED_CATEGORIES: DocumentCategory[] = [
  'integrated_state_per_axis',
  'personal_protocol',
  'family_history_clinical',
];

/** Bulky and question-dependent: reached through similarity search. */
export const SEARCHABLE_CATEGORIES: DocumentCategory[] = [
  'genotype_calls',
  'derived_phenotype_states',
  'observed_biomarkers',
];

export function isDocumentCategory(value: unknown): value is DocumentCategory {
  return typeof value === 'string' && (DOCUMENT_CATEGORIES as readonly string[]).includes(value);
}

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category as DocumentCategory] ?? category;
}
