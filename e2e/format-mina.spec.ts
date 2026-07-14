import { test, expect } from '@playwright/test';
import { formatMina, parseNanomina } from '../src/utils/formatters';

/**
 * Unit tests for #69 — formatMina must keep full precision for large amounts
 * (a plain Number loses precision above 2^53 nanomina) and must never throw on
 * missing/invalid input. These are pure functions, so no browser is needed.
 */
test.describe('formatMina (#69)', () => {
  test('keeps full precision above 2^53 nanomina (Number would round)', () => {
    // 20,000,000.000000001 MINA — the trailing 1 is lost by Number(x)/1e9.
    expect(formatMina('20000000000000001')).toBe('20,000,000.000000001');
    // 2^53 + 1 nanomina — the +1 survives BigInt but not Number.
    expect(formatMina('9007199254740993')).toBe('9,007,199.254740993');
  });

  test('matches the previous format for common amounts', () => {
    expect(formatMina('0')).toBe('0.00');
    expect(formatMina('1000000000')).toBe('1.00');
    expect(formatMina('1500000000')).toBe('1.50');
    expect(formatMina('10000000')).toBe('0.01');
    expect(formatMina('1234500000')).toBe('1.2345');
  });

  test('returns a placeholder instead of throwing on invalid input', () => {
    const bad: Array<string | number | null | undefined> = [
      null,
      undefined,
      '',
      '  ',
      'abc',
      '1.5', // non-integer nanomina string
      1.5, // non-integer number
      NaN,
    ];
    for (const value of bad) {
      expect(formatMina(value)).toBe('—');
    }
  });

  test('parseNanomina accepts valid integers and rejects the rest', () => {
    expect(parseNanomina('42')).toBe(42n);
    expect(parseNanomina(42)).toBe(42n);
    expect(parseNanomina(7n)).toBe(7n);
    expect(parseNanomina(null)).toBeNull();
    expect(parseNanomina('12.3')).toBeNull();
    expect(parseNanomina('nope')).toBeNull();
  });
});
