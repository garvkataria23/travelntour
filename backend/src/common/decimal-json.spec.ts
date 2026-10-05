import { Prisma } from '@prisma/client';
import { toPlainJson } from './decimal-json';

describe('toPlainJson', () => {
  const d = (v: string) => new Prisma.Decimal(v);

  it('converts a Decimal to a JSON number, not a string', () => {
    // The reason this module exists: Decimal.js toJSON() returns a string, so an unconverted
    // amount reached the client as "1234.50" and broke client-side sums.
    const result = toPlainJson({ total: d('1234.50') });
    expect(result.total).toBe(1234.5);
    expect(typeof result.total).toBe('number');
    expect(JSON.stringify(result)).toBe('{"total":1234.5}');
  });

  it('preserves precision for values JS floats cannot represent exactly', () => {
    // 0.1 + 0.2 style drift: the whole point of Decimal storage.
    const result = toPlainJson({ a: d('0.1'), b: d('0.2') });
    expect(result.a).toBe(0.1);
    expect(result.b).toBe(0.2);
  });

  it('walks nested objects and arrays', () => {
    const result = toPlainJson({
      items: [{ amount: d('10.25') }, { amount: d('20.5') }],
      meta: { total: d('30.75') },
    });
    expect(result.items).toEqual([{ amount: 10.25 }, { amount: 20.5 }]);
    expect(result.meta.total).toBe(30.75);
  });

  it('leaves Date values as Date so they still serialise to ISO strings', () => {
    const when = new Date('2026-10-01T00:00:00.000Z');
    const result = toPlainJson({ createdAt: when });
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(JSON.parse(JSON.stringify(result)).createdAt).toBe('2026-10-01T00:00:00.000Z');
  });

  it('passes through primitives, null and undefined unchanged', () => {
    expect(toPlainJson(null)).toBeNull();
    expect(toPlainJson(undefined)).toBeUndefined();
    expect(toPlainJson(42)).toBe(42);
    expect(toPlainJson('x')).toBe('x');
    expect(toPlainJson(true)).toBe(true);
  });

  it('converts BigInt, which JSON.stringify would throw on', () => {
    expect(toPlainJson({ id: 10n })).toEqual({ id: 10 });
  });

  it('handles negative and zero decimals', () => {
    expect(toPlainJson({ a: d('-42.5'), b: d('0') })).toEqual({ a: -42.5, b: 0 });
  });

  it('does not mistake a plain object with a toString for a Decimal', () => {
    const result = toPlainJson({ name: { toString: () => 'nope' } });
    expect(result.name).toEqual({ toString: expect.any(Function) });
  });
});