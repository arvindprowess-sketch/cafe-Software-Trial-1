// ============================================================================
// Phase 3 — client-side goal-fit helper (mirrors backend goal_fit_for_product).
// Flags/sorts dishes that fit the user's fitness goal using per-100g nutrition.
// ============================================================================
export type GoalFit = { fits: boolean; score: number; reason: string };

export function goalFitForProduct(p: any, goal?: string): GoalFit {
  const cal = Number(p?.calories_per_100g) || 0;
  const pro = Number(p?.protein_per_100g) || 0;
  const pd = cal > 0 ? (pro / cal) * 100 : 0; // protein per 100 kcal
  const g = goal || 'maintenance';
  let fits = false;
  let score = 0;
  let reason = 'Balanced macros';
  if (g === 'fat_loss') {
    fits = pd >= 8 && cal <= 220;
    score = pd * 3 - cal / 50;
    reason = 'High protein, lower calorie';
  } else if (g === 'muscle_gain' || g === 'lean_bulk') {
    fits = pro >= 12;
    score = pro * 2 + cal / 100;
    reason = 'Protein-rich, energy-dense';
  } else if (g === 'recomposition') {
    fits = pd >= 8;
    score = pd * 3;
    reason = 'Very high protein density';
  } else {
    fits = pd >= 5;
    score = pd + pro / 10;
    reason = 'Balanced macros';
  }
  return { fits, score: Math.round(score * 100) / 100, reason };
}

// Sort a product list so goal-fitting dishes come first (then by score).
export function sortByGoalFit<T>(products: T[], goal?: string): T[] {
  return [...products].sort((a: any, b: any) => {
    const fa = goalFitForProduct(a, goal);
    const fb = goalFitForProduct(b, goal);
    if (fa.fits !== fb.fits) return fa.fits ? -1 : 1;
    return fb.score - fa.score;
  });
}

export const ACTIVITY_LEVELS = [
  { key: 'sedentary', label: 'Sedentary', desc: 'Little / no exercise' },
  { key: 'light', label: 'Light', desc: '1–3 days / week' },
  { key: 'moderate', label: 'Moderate', desc: '3–5 days / week' },
  { key: 'active', label: 'Active', desc: '6–7 days / week' },
  { key: 'very_active', label: 'Very Active', desc: 'Hard daily / physical job' },
];

export const GENDERS = [
  { key: 'male', label: 'Male' },
  { key: 'female', label: 'Female' },
  { key: 'other', label: 'Other' },
];
