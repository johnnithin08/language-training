/**
 * Tailwind CSS default color palette (hex values).
 * Use for consistent theming across the app.
 * Shades: 50 (lightest) → 950 (darkest), 500 = midpoint.
 */

const shade = (
  s50: string,
  s100: string,
  s200: string,
  s300: string,
  s400: string,
  s500: string,
  s600: string,
  s700: string,
  s800: string,
  s900: string,
  s950: string
) => ({
  50: s50,
  100: s100,
  200: s200,
  300: s300,
  400: s400,
  500: s500,
  600: s600,
  700: s700,
  800: s800,
  900: s900,
  950: s950,
});

export const colors = {
  // Grays / neutrals
  slate: shade(
    '#f8fafc',
    '#f1f5f9',
    '#e2e8f0',
    '#cbd5e1',
    '#94a3b8',
    '#64748b',
    '#475569',
    '#334155',
    '#1e293b',
    '#0f172a',
    '#020617'
  ),
  gray: shade(
    '#f9fafb',
    '#f3f4f6',
    '#e5e7eb',
    '#d1d5db',
    '#9ca3af',
    '#6b7280',
    '#4b5563',
    '#374151',
    '#1f2937',
    '#111827',
    '#030712'
  ),
  zinc: shade(
    '#fafafa',
    '#f4f4f5',
    '#e4e4e7',
    '#d4d4d8',
    '#a1a1aa',
    '#71717a',
    '#52525b',
    '#3f3f46',
    '#27272a',
    '#18181b',
    '#09090b'
  ),
  neutral: shade(
    '#fafafa',
    '#f5f5f5',
    '#e5e5e5',
    '#d4d4d4',
    '#a3a3a3',
    '#737373',
    '#525252',
    '#404040',
    '#262626',
    '#171717',
    '#0a0a0a'
  ),
  stone: shade(
    '#fafaf9',
    '#f5f5f4',
    '#e7e5e4',
    '#d6d3d1',
    '#a8a29e',
    '#78716c',
    '#57534e',
    '#44403c',
    '#292524',
    '#1c1917',
    '#0c0a09'
  ),

  // Reds
  red: shade(
    '#fef2f2',
    '#fee2e2',
    '#fecaca',
    '#fca5a5',
    '#f87171',
    '#ef4444',
    '#dc2626',
    '#b91c1c',
    '#991b1b',
    '#7f1d1d',
    '#450a0a'
  ),
  rose: shade(
    '#fff1f2',
    '#ffe4e6',
    '#fecdd3',
    '#fda4af',
    '#fb7185',
    '#f43f5e',
    '#e11d48',
    '#be123c',
    '#9f1239',
    '#881337',
    '#4c0519'
  ),

  // Oranges / warm
  orange: shade(
    '#fff7ed',
    '#ffedd5',
    '#fed7aa',
    '#fdba74',
    '#fb923c',
    '#f97316',
    '#ea580c',
    '#c2410c',
    '#9a3412',
    '#7c2d12',
    '#431407'
  ),
  amber: shade(
    '#fffbeb',
    '#fef3c7',
    '#fde68a',
    '#fcd34d',
    '#fbbf24',
    '#f59e0b',
    '#d97706',
    '#b45309',
    '#92400e',
    '#78350f',
    '#451a03'
  ),
  yellow: shade(
    '#fefce8',
    '#fef9c3',
    '#fef08a',
    '#fde047',
    '#facc15',
    '#eab308',
    '#ca8a04',
    '#a16207',
    '#854d0e',
    '#713f12',
    '#422006'
  ),

  // Greens
  lime: shade(
    '#f7fee7',
    '#ecfccb',
    '#d9f99d',
    '#bef264',
    '#a3e635',
    '#84cc16',
    '#65a30d',
    '#4d7c0f',
    '#3f6212',
    '#365314',
    '#1a2e05'
  ),
  green: shade(
    '#f0fdf4',
    '#dcfce7',
    '#bbf7d0',
    '#86efac',
    '#4ade80',
    '#22c55e',
    '#16a34a',
    '#15803d',
    '#166534',
    '#14532d',
    '#052e16'
  ),
  emerald: shade(
    '#ecfdf5',
    '#d1fae5',
    '#a7f3d0',
    '#6ee7b7',
    '#34d399',
    '#10b981',
    '#059669',
    '#047857',
    '#065f46',
    '#064e3b',
    '#022c22'
  ),

  // Teal / cyan / sky
  teal: shade(
    '#f0fdfa',
    '#ccfbf1',
    '#99f6e4',
    '#5eead4',
    '#2dd4bf',
    '#14b8a6',
    '#0d9488',
    '#0f766e',
    '#115e59',
    '#134e4a',
    '#042f2e'
  ),
  cyan: shade(
    '#ecfeff',
    '#cffafe',
    '#a5f3fc',
    '#67e8f9',
    '#22d3ee',
    '#06b6d4',
    '#0891b2',
    '#0e7490',
    '#155e75',
    '#164e63',
    '#083344'
  ),
  sky: shade(
    '#f0f9ff',
    '#e0f2fe',
    '#bae6fd',
    '#7dd3fc',
    '#38bdf8',
    '#0ea5e9',
    '#0284c7',
    '#0369a1',
    '#075985',
    '#0c4a6e',
    '#082f49'
  ),

  // Blues / indigo / violet / purple
  blue: shade(
    '#eff6ff',
    '#dbeafe',
    '#bfdbfe',
    '#93c5fd',
    '#60a5fa',
    '#3b82f6',
    '#2563eb',
    '#1d4ed8',
    '#1e40af',
    '#1e3a8a',
    '#172554'
  ),
  indigo: shade(
    '#eef2ff',
    '#e0e7ff',
    '#c7d2fe',
    '#a5b4fc',
    '#818cf8',
    '#6366f1',
    '#4f46e5',
    '#4338ca',
    '#3730a3',
    '#312e81',
    '#1e1b4b'
  ),
  violet: shade(
    '#f5f3ff',
    '#ede9fe',
    '#ddd6fe',
    '#c4b5fd',
    '#a78bfa',
    '#8b5cf6',
    '#7c3aed',
    '#6d28d9',
    '#5b21b6',
    '#4c1d95',
    '#2e1065'
  ),
  purple: shade(
    '#faf5ff',
    '#f3e8ff',
    '#e9d5ff',
    '#d8b4fe',
    '#c084fc',
    '#a855f7',
    '#9333ea',
    '#7e22ce',
    '#6b21a8',
    '#581c87',
    '#3b0764'
  ),
  fuchsia: shade(
    '#fdf4ff',
    '#fae8ff',
    '#f5d0fe',
    '#f0abfc',
    '#e879f9',
    '#d946ef',
    '#c026d3',
    '#a21caf',
    '#86198f',
    '#701a75',
    '#4a044e'
  ),
  pink: shade(
    '#fdf2f8',
    '#fce7f3',
    '#fbcfe8',
    '#f9a8d4',
    '#f472b6',
    '#ec4899',
    '#db2777',
    '#be185d',
    '#9d174d',
    '#831843',
    '#500724'
  ),
} as const;

/** Base black and white */
export const black = '#000000';
export const white = '#ffffff';

/** Semantic / app-specific aliases (optional – extend as needed) */
export const app = {
  primary: colors.purple[500],
  primaryDark: colors.purple[600],
  backgroundDark: colors.slate[950],
  /** Landing / dark screens gradient */
  backgroundGradient: ['#1a1520', '#2d2638', '#252030'] as const,
  iconGradient: [colors.orange[400], colors.pink[500], colors.purple[500]] as const,
  textPrimary: white,
  textMuted: 'rgba(255,255,255,0.5)',
  buttonPrimary: '#6A4FE2',
  iconOnLight: colors.purple[700],
} as const;

/**
 * Dashboard score-trend card + gifted-charts styling.
 * Custom hex/RGBA (not the Tailwind `colors` scale).
 */
export const scoreTrendChart = {
  accent: '#3dd4c8',
  footerDot: '#4f7cff',
  cardBackground: '#111934',
  cardBorder: '#2a3561',
  /** Horizontal grid lines behind bars */
  rules: 'rgba(148, 163, 184, 0.12)',
  /** X-axis line under labels */
  xAxis: 'rgba(148, 163, 184, 0.25)',
  /**
   * Bar fill: darker bottom → lighter top, oldest→newest shifts purple → mint.
   */
  barGradients: [
    ['#3d2a6e', '#c9a8f5'],
    ['#42297a', '#d2b2fa'],
    ['#472886', '#dbbcff'],
    ['#3f2f7a', '#c8b0f8'],
    ['#2f4a78', '#9fd0ff'],
    ['#1f5c68', '#6fd8e8'],
    ['#18625c', '#5ee8d4'],
    ['#126658', '#52e8c8'],
    ['#0c5f52', '#46e0bc'],
    ['#08584c', '#3ad8b0'],
  ] as const,
} as const;

export type ColorShade = keyof (typeof colors)[keyof typeof colors];
export type ColorName = keyof typeof colors;
