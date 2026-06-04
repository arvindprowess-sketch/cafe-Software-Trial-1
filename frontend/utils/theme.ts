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

// Typography — loaded in app/_layout.tsx via @expo-google-fonts.
export const FONT = {
  display: 'Anton_400Regular',                 // headings / prices / CTAs (uppercase)
  body: 'HankenGrotesk_400Regular',            // body / descriptions
  bodyMedium: 'HankenGrotesk_500Medium',
  bodySemibold: 'HankenGrotesk_600SemiBold',
  bodyBold: 'HankenGrotesk_700Bold',
  bodyExtrabold: 'HankenGrotesk_800ExtraBold',
} as const;

// The four goal-first ordering options shown on the home screen.
export const GOALS = [
  { key: 'fat_loss', label: 'Fat Loss', icon: 'trending-down' },
  { key: 'muscle_gain', label: 'Muscle Gain', icon: 'barbell' },
  { key: 'maintenance', label: 'Maintenance', icon: 'swap-horizontal' },
  { key: 'beginner', label: 'Beginner', icon: 'ribbon' },
] as const;

export default FUEL;
