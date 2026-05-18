/**
 * Tokens de design derivados do logo RPX Expert (preto + ciano).
 * Centralizados aqui para reuso futuro pelo mobile (NativeWind) e admin (Tailwind/Shadcn).
 */
export const brandColors = {
  black: '#000000',
  cyan: '#00BCD4',
  cyanDark: '#0097A7',
  cyanLight: '#B2EBF2',
  bgLight: '#FFFFFF',
  bgDark: '#0A0A0A',
  textOnDark: '#FFFFFF',
  textOnLight: '#0A0A0A',
} as const;

export type BrandColorToken = keyof typeof brandColors;
