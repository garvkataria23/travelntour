import { clampMoney, money, percentageOf, round, sum, toNumber } from './money';

describe('money', () => {
  describe('toNumber', () => {
    it('coerces the shapes that actually arrive from rows, DTOs and JSON bodies', () => {
      expect(toNumber(12.5)).toBe(12.5);
      expect(toNumber('12.5')).toBe(12.5);
      expect(toNumber(null)).toBe(0);
      expect(toNumber(undefined)).toBe(0);
      expect(toNumber('')).toBe(0);
    });

    it('never returns NaN for junk, so a bad value cannot poison a total', () => {
      expect(toNumber('abc')).toBe(0);
      expect(toNumber(NaN)).toBe(0);
      expect(toNumber(Infinity)).toBe(0);
    });
  });

  describe('money', () => {
    it('rounds to the currency minor unit, half away from zero', () => {
      expect(money(10.005, 'USD')).toBe(10.01);
      expect(money(-10.005, 'USD')).toBe(-10.01);
      expect(money(10.004, 'USD')).toBe(10);
    });

    it('honours zero-decimal currencies', () => {
      expect(money(12450.75, 'AED')).toBe(12451);
      expect(money(12450.75, 'INR')).toBe(12451);
    });

    it('honours three-decimal currencies', () => {
      expect(money(1.2345, 'KWD')).toBe(1.235);
    });

    it('defaults to AED when the currency is unknown', () => {
      expect(money(10.5)).toBe(11);
    });
  });

  describe('round', () => {
    it('rounds to an explicit precision for rates rather than money', () => {
      expect(round(5 / 3, 4)).toBe(1.6667);
      expect(round(18.555, 2)).toBe(18.56);
    });
  });

  describe('sum', () => {
    // This is the whole point of the helper: naive float accumulation drifts visibly at 1,000 rows.
    it('does not accumulate drift over many rows', () => {
      const naive = Array.from({ length: 1000 }, () => 0.1).reduce((a, b) => a + b, 0);
      const correct = sum(Array.from({ length: 1000 }, () => 0.1), 'USD');
      expect(correct).toBe(100);
      // Sanity check that the naive version really is wrong, so this test keeps meaning something.
      expect(naive).not.toBe(100);
    });

    it('handles an empty list', () => {
      expect(sum([], 'USD')).toBe(0);
    });
  });

  describe('percentageOf', () => {
    it('applies a tax rate and rounds to the currency minor unit', () => {
      expect(percentageOf(100, 5, 'USD')).toBe(5);
      expect(percentageOf(99.99, 5, 'USD')).toBe(5);
      expect(percentageOf(1000, 18, 'USD')).toBe(180);
    });

    it('returns zero for a missing or non-positive rate instead of a wrong tax', () => {
      expect(percentageOf(100, 0, 'USD')).toBe(0);
      expect(percentageOf(100, -5, 'USD')).toBe(0);
      expect(percentageOf(100, null, 'USD')).toBe(0);
    });
  });

  describe('clampMoney', () => {
    it('bounds a value into range after rounding', () => {
      expect(clampMoney(500, 0, 100, 'USD')).toBe(100);
      expect(clampMoney(-5, 0, 100, 'USD')).toBe(0);
      expect(clampMoney(42.456, 0, 100, 'USD')).toBe(42.46);
    });
  });
});