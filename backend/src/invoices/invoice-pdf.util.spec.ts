import { toLatin1 } from './invoice-pdf.util';

describe('toLatin1', () => {
  it('leaves plain ASCII and Latin-1 text untouched', () => {
    expect(toLatin1('AED 1,000')).toBe('AED 1,000');
    expect(toLatin1('Café naïve')).toBe('Café naïve');
  });

  it('normalises space-like characters instead of dropping them', () => {
    // Guards a regression where U+202F was deleted, gluing "AED" and "1,000" together.
    expect(toLatin1('AED\u00A01,000')).toBe('AED 1,000');
    expect(toLatin1('AED\u202F1,000')).toBe('AED 1,000');
  });

  it('folds typographic punctuation to ASCII', () => {
    expect(toLatin1('1\u20132 range')).toBe('1-2 range');
    expect(toLatin1('Bolt\u2014Ltd')).toBe('Bolt-Ltd');
    expect(toLatin1('Mr. O\u2019Brien\u2019s')).toBe("Mr. O'Brien's");
    expect(toLatin1('1\u20262 days')).toBe('1...2 days');
    expect(toLatin1('A \u00D7 B')).toBe('A x B');
  });

  it('strips currency symbols outside WinAnsi', () => {
    // The rupee sign is U+20B9 and would render as a blank in jsPDF's built-in fonts.
    expect(toLatin1('\u20B91,000 AED')).toBe('1,000 AED');
  });
});
