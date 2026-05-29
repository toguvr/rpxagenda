/** Formata centavos (inteiro) como moeda BRL. */
export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Converte um valor em reais (ex: "1234.56" ou 1234.56) para centavos inteiros. */
export function reaisToCents(reais: number | string): number {
  const n = typeof reais === 'string' ? Number(reais.replace(',', '.')) : reais;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Converte centavos para o número em reais usado nos inputs (ex: 123456 → 1234.56). */
export function centsToReais(cents: number | null | undefined): number {
  if (cents == null) return 0;
  return cents / 100;
}
