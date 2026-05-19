import { isValidCpf, normalizeCpf } from '@rpx/shared';

describe('CPF (shared helper, exercitado pelo módulo patients)', () => {
  describe('isValidCpf', () => {
    it.each([
      ['111.444.777-35', true],
      ['11144477735', true],
      ['529.982.247-25', true],
      ['52998224725', true],
      ['123.456.789-00', false],
      ['111.111.111-11', false],
      ['000.000.000-00', false],
      ['abc', false],
      ['', false],
      ['123', false],
    ])('"%s" -> %s', (input, expected) => {
      expect(isValidCpf(input)).toBe(expected);
    });
  });

  it('normalizeCpf remove pontuação e mantém só dígitos', () => {
    expect(normalizeCpf('111.444.777-35')).toBe('11144477735');
    expect(normalizeCpf('  529 982-247.25  ')).toBe('52998224725');
  });
});
