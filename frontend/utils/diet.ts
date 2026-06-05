// Shared diet-tag helpers for the customer app (Phase 1 — multi-tag diet types)
export const DIET_TAGS = ['veg', 'non-veg', 'vegan', 'eggetarian', 'jain', 'keto', 'high-protein'] as const;

export const DIET_LABEL: Record<string, string> = {
  'veg': 'Veg',
  'non-veg': 'Non-Veg',
  'vegan': 'Vegan',
  'eggetarian': 'Eggetarian',
  'jain': 'Jain',
  'keto': 'Keto',
  'high-protein': 'High Protein',
};

// All diet tags a product carries (falls back to the legacy single diet_type)
export const dietTagsOf = (p: any): string[] =>
  ((p?.diet_types && p.diet_types.length ? p.diet_types : [p?.diet_type]) as string[]).filter(Boolean);

// AND semantics: a product matches only if it carries ALL selected tags
export const matchesDiet = (p: any, selected: string[]): boolean => {
  if (!selected || selected.length === 0) return true;
  const tags = dietTagsOf(p);
  return selected.every((t) => tags.includes(t));
};

// OR semantics — used to suggest the "nearest options" when an AND combo is empty
export const matchesAnyDiet = (p: any, selected: string[]): boolean => {
  if (!selected || selected.length === 0) return true;
  const tags = dietTagsOf(p);
  return selected.some((t) => tags.includes(t));
};

export const toggleDietTag = (arr: string[], tag: string): string[] =>
  arr.includes(tag) ? arr.filter((t) => t !== tag) : [...arr, tag];
