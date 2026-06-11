// ============================================================================
// FUEL — Design System (single source of truth for the mobile customer app)
// Sand canvas · Ink structure · Lime signature accent.
// Rules: never pure black, never red/orange as the *primary* brand color.
// ============================================================================

export const FUEL = {
  // Core
  sand: '#F4F1E9',        // main background / canvas
  sandBorder: '#E6E1D4',  // subtle 1px borders on sand
  ink: '#15140F',         // headers, hero, bottom nav, dark sections, primary text
  inkSoft: '#26251D',     // secondary dark
  lime: '#C7F24E',        // signature accent — CTAs, highlights, active states
  limeDeep: '#A6D62E',    // accent text/icon on light backgrounds
  white: '#FFFFFF',
  muted: '#6B6A5E',       // secondary / muted text

  // Macros
  protein: '#E2603F',
  carbs: '#D69A35',
  fat: '#5E97B8',

  // Diet dots
  veg: '#3FA34D',
  nonVeg: '#C0392B',

  // Status
  success: '#3FA34D',
  warning: '#D69A35',
  error: '#C0392B',

  // Light tints (for chip/badge backgrounds on sand)
  limeTint: '#EAF2DD',
  proteinTint: '#F7E6E0',
  carbsTint: '#F5ECD9',
  fatTint: '#E4EEF4',
} as const;

// Radii — snap every borderRadius to one of these (true circles excepted).
export const RADIUS = { xs: 6, sm: 10, md: 14, lg: 20, pill: 999 } as const;

// Spacing — padding/margin/gap scale.
export const SPACE = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const;

// Typography — loaded in app/_layout.tsx via @expo-google-fonts.
export const FONT = {
  display: 'Anton_400Regular',                 // headings / prices / CTAs (uppercase)
  body: 'HankenGrotesk_400Regular',            // body / descriptions
  bodyMedium: 'HankenGrotesk_500Medium',
  bodySemibold: 'HankenGrotesk_600SemiBold',
  bodyBold: 'HankenGrotesk_700Bold',
  bodyExtrabold: 'HankenGrotesk_800ExtraBold',
} as const;

// ============================================================================
// CANONICAL FITNESS GOALS — single source of truth used EVERYWHERE
// (home goal selector, side-drawer menu, AI Picks, Budget/Build meal builder,
//  combo builder, checkout). Never hardcode goals in a screen — import this.
// Backend AI guidelines must stay in sync (server.py GOAL_GUIDELINES).
// ============================================================================
export const GOALS = [
  { key: 'fat_loss',      label: 'Fat Loss',       shortLabel: 'Fat Loss',  icon: 'trending-down',    color: '#C0392B', desc: 'Low cal, lean protein focus' },
  { key: 'muscle_gain',   label: 'Muscle Gain',    shortLabel: 'Muscle',    icon: 'barbell',          color: '#3FA34D', desc: 'High protein, moderate carbs' },
  { key: 'maintenance',   label: 'Maintenance',    shortLabel: 'Maintain',  icon: 'swap-horizontal',  color: '#D69A35', desc: 'Balanced macros, good variety' },
  { key: 'beginner',      label: 'Beginner',       shortLabel: 'Beginner',  icon: 'ribbon',           color: '#5E97B8', desc: 'Easy to digest, moderate cal' },
  { key: 'recomposition', label: 'Recomposition',  shortLabel: 'Recomp',    icon: 'sync',             color: '#8E6FB8', desc: 'Build muscle + lose fat together' },
  { key: 'lean_bulk',     label: 'Lean Bulk',      shortLabel: 'Lean Bulk', icon: 'trending-up',      color: '#E2603F', desc: 'Slight surplus, minimal fat gain' },
] as const;

export type GoalKey = typeof GOALS[number]['key'];
export const getGoal = (key?: string) => GOALS.find(g => g.key === key);

export default FUEL;
