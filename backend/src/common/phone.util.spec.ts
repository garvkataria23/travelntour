import { validateAndNormalizePhone } from './phone.util';

describe('Phone Utility (Country code & digit calculation)', () => {
  it('correctly matches and validates UAE (+971) 9-digit numbers', () => {
    const valid = validateAndNormalizePhone('+971501234567');
    expect(valid.isValid).toBe(true);
    expect(valid.normalized).toBe('+971501234567');
    expect(valid.rule?.iso).toBe('AE');

    // With spaces and leading trunk 0
    const withZero = validateAndNormalizePhone('+971 050 123 4567');
    expect(withZero.isValid).toBe(true);
    expect(withZero.normalized).toBe('+971501234567');

    // Invalid lengths for UAE (must be exactly 9 digits)
    const tooShort = validateAndNormalizePhone('+9715012345'); // 8 digits
    expect(tooShort.isValid).toBe(false);
    expect(tooShort.error).toContain('must be exactly 9 digits');

    const tooLong = validateAndNormalizePhone('+9715012345678'); // 10 digits
    expect(tooLong.isValid).toBe(false);
    expect(tooLong.error).toContain('must be exactly 9 digits');
  });

  it('correctly matches and validates India (+91) 10-digit numbers', () => {
    const valid = validateAndNormalizePhone('+91 98765 43210');
    expect(valid.isValid).toBe(true);
    expect(valid.normalized).toBe('+919876543210');
    expect(valid.rule?.iso).toBe('IN');

    // With leading 0
    const withZero = validateAndNormalizePhone('+91 09876543210');
    expect(withZero.isValid).toBe(true);
    expect(withZero.normalized).toBe('+919876543210');

    // 9 digits should fail for India
    const invalid = validateAndNormalizePhone('+91 987654321');
    expect(invalid.isValid).toBe(false);
    expect(invalid.error).toContain('must be exactly 10 digits');
  });

  it('correctly validates Saudi Arabia (+966) 9-digit numbers', () => {
    const valid = validateAndNormalizePhone('+966501234567');
    expect(valid.isValid).toBe(true);
    expect(valid.normalized).toBe('+966501234567');

    const invalid = validateAndNormalizePhone('+96650123456'); // 8 digits
    expect(invalid.isValid).toBe(false);
    expect(invalid.error).toContain('must be exactly 9 digits');
  });

  it('correctly validates Qatar (+974), Kuwait (+965), and Oman (+968) 8-digit numbers', () => {
    const qatar = validateAndNormalizePhone('+974 3312 3456');
    expect(qatar.isValid).toBe(true);
    expect(qatar.normalized).toBe('+97433123456');

    const kuwait = validateAndNormalizePhone('+965 9123 4567');
    expect(kuwait.isValid).toBe(true);
    expect(kuwait.normalized).toBe('+96591234567');

    const oman = validateAndNormalizePhone('+968 9123 4567');
    expect(oman.isValid).toBe(true);
    expect(oman.normalized).toBe('+96891234567');

    // 9 digits should fail for Qatar
    const qatarTooLong = validateAndNormalizePhone('+974 3312 34567');
    expect(qatarTooLong.isValid).toBe(false);
    expect(qatarTooLong.error).toContain('must be exactly 8 digits');
  });

  it('correctly validates UK (+44) and US (+1) 10-digit numbers', () => {
    const uk = validateAndNormalizePhone('+44 7911 123456');
    expect(uk.isValid).toBe(true);
    expect(uk.normalized).toBe('+447911123456');

    const us = validateAndNormalizePhone('+1 (202) 555-0123');
    expect(us.isValid).toBe(true);
    expect(us.normalized).toBe('+12025550123');
  });

  it('falls back to default dial code when no + is provided', () => {
    // 9 digits for UAE (+971 default)
    const uae = validateAndNormalizePhone('501234567', '+971');
    expect(uae.isValid).toBe(true);
    expect(uae.normalized).toBe('+971501234567');

    // 10 digits for India (+91 default)
    const ind = validateAndNormalizePhone('9876543210', '+91');
    expect(ind.isValid).toBe(true);
    expect(ind.normalized).toBe('+919876543210');
  });
});
