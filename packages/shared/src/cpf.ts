/**
 * Validador de CPF (PT-BR). Aceita string com ou sem máscara; ignora não-dígitos.
 * Implementa o algoritmo oficial dos dois dígitos verificadores.
 */
export function isValidCpf(input: string): boolean {
  const digits = input.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  // Rejeita sequências repetidas (000..., 111..., etc), tecnicamente válidas no checksum mas inválidas.
  if (/^(\d)\1+$/.test(digits)) return false;

  const calcCheckDigit = (slice: string, weightStart: number): number => {
    let sum = 0;
    for (let i = 0; i < slice.length; i++) {
      sum += Number(slice[i]) * (weightStart - i);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  const d1 = calcCheckDigit(digits.slice(0, 9), 10);
  const d2 = calcCheckDigit(digits.slice(0, 10), 11);
  return d1 === Number(digits[9]) && d2 === Number(digits[10]);
}

/** Devolve só dígitos. */
export function normalizeCpf(input: string): string {
  return input.replace(/\D/g, '');
}
