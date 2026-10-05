/**
 * Backend Phone Utility: Country dial codes, exact digit calculations, validation, and normalization.
 */

export interface CountryPhoneRule {
  iso: string;
  country: string;
  dialCode: string;
  minDigits: number;
  maxDigits: number;
}

export const COUNTRY_PHONE_RULES: CountryPhoneRule[] = [
  // Middle East & GCC
  { iso: 'AE', country: 'United Arab Emirates', dialCode: '+971', minDigits: 9, maxDigits: 9 },
  { iso: 'SA', country: 'Saudi Arabia', dialCode: '+966', minDigits: 9, maxDigits: 9 },
  { iso: 'QA', country: 'Qatar', dialCode: '+974', minDigits: 8, maxDigits: 8 },
  { iso: 'OM', country: 'Oman', dialCode: '+968', minDigits: 8, maxDigits: 8 },
  { iso: 'KW', country: 'Kuwait', dialCode: '+965', minDigits: 8, maxDigits: 8 },
  { iso: 'BH', country: 'Bahrain', dialCode: '+973', minDigits: 8, maxDigits: 8 },
  { iso: 'JO', country: 'Jordan', dialCode: '+962', minDigits: 9, maxDigits: 9 },
  { iso: 'LB', country: 'Lebanon', dialCode: '+961', minDigits: 7, maxDigits: 8 },
  { iso: 'IQ', country: 'Iraq', dialCode: '+964', minDigits: 10, maxDigits: 10 },
  { iso: 'EG', country: 'Egypt', dialCode: '+20', minDigits: 10, maxDigits: 10 },
  { iso: 'TR', country: 'Turkey', dialCode: '+90', minDigits: 10, maxDigits: 10 },

  // South Asia
  { iso: 'IN', country: 'India', dialCode: '+91', minDigits: 10, maxDigits: 10 },
  { iso: 'PK', country: 'Pakistan', dialCode: '+92', minDigits: 10, maxDigits: 10 },
  { iso: 'BD', country: 'Bangladesh', dialCode: '+880', minDigits: 10, maxDigits: 10 },
  { iso: 'LK', country: 'Sri Lanka', dialCode: '+94', minDigits: 9, maxDigits: 9 },
  { iso: 'NP', country: 'Nepal', dialCode: '+977', minDigits: 10, maxDigits: 10 },
  { iso: 'MV', country: 'Maldives', dialCode: '+960', minDigits: 7, maxDigits: 7 },

  // North America & Europe
  { iso: 'US', country: 'United States', dialCode: '+1', minDigits: 10, maxDigits: 10 },
  { iso: 'CA', country: 'Canada', dialCode: '+1', minDigits: 10, maxDigits: 10 },
  { iso: 'GB', country: 'United Kingdom', dialCode: '+44', minDigits: 10, maxDigits: 10 },
  { iso: 'DE', country: 'Germany', dialCode: '+49', minDigits: 10, maxDigits: 11 },
  { iso: 'FR', country: 'France', dialCode: '+33', minDigits: 9, maxDigits: 9 },
  { iso: 'IT', country: 'Italy', dialCode: '+39', minDigits: 9, maxDigits: 10 },
  { iso: 'ES', country: 'Spain', dialCode: '+34', minDigits: 9, maxDigits: 9 },
  { iso: 'NL', country: 'Netherlands', dialCode: '+31', minDigits: 9, maxDigits: 9 },
  { iso: 'CH', country: 'Switzerland', dialCode: '+41', minDigits: 9, maxDigits: 9 },
  { iso: 'SE', country: 'Sweden', dialCode: '+46', minDigits: 9, maxDigits: 9 },
  { iso: 'NO', country: 'Norway', dialCode: '+47', minDigits: 8, maxDigits: 8 },
  { iso: 'DK', country: 'Denmark', dialCode: '+45', minDigits: 8, maxDigits: 8 },
  { iso: 'IE', country: 'Ireland', dialCode: '+353', minDigits: 9, maxDigits: 9 },
  { iso: 'RU', country: 'Russia', dialCode: '+7', minDigits: 10, maxDigits: 10 },

  // Asia Pacific
  { iso: 'PH', country: 'Philippines', dialCode: '+63', minDigits: 10, maxDigits: 10 },
  { iso: 'SG', country: 'Singapore', dialCode: '+65', minDigits: 8, maxDigits: 8 },
  { iso: 'MY', country: 'Malaysia', dialCode: '+60', minDigits: 9, maxDigits: 10 },
  { iso: 'TH', country: 'Thailand', dialCode: '+66', minDigits: 9, maxDigits: 9 },
  { iso: 'ID', country: 'Indonesia', dialCode: '+62', minDigits: 9, maxDigits: 12 },
  { iso: 'VN', country: 'Vietnam', dialCode: '+84', minDigits: 9, maxDigits: 9 },
  { iso: 'AU', country: 'Australia', dialCode: '+61', minDigits: 9, maxDigits: 9 },
  { iso: 'NZ', country: 'New Zealand', dialCode: '+64', minDigits: 8, maxDigits: 10 },
  { iso: 'CN', country: 'China', dialCode: '+86', minDigits: 11, maxDigits: 11 },
  { iso: 'HK', country: 'Hong Kong', dialCode: '+852', minDigits: 8, maxDigits: 8 },
  { iso: 'JP', country: 'Japan', dialCode: '+81', minDigits: 10, maxDigits: 10 },
  { iso: 'KR', country: 'South Korea', dialCode: '+82', minDigits: 9, maxDigits: 10 },

  // Africa & Others
  { iso: 'ZA', country: 'South Africa', dialCode: '+27', minDigits: 9, maxDigits: 9 },
  { iso: 'NG', country: 'Nigeria', dialCode: '+234', minDigits: 10, maxDigits: 10 },
  { iso: 'KE', country: 'Kenya', dialCode: '+254', minDigits: 9, maxDigits: 9 },
  { iso: 'MU', country: 'Mauritius', dialCode: '+230', minDigits: 8, maxDigits: 8 },
  { iso: 'BR', country: 'Brazil', dialCode: '+55', minDigits: 10, maxDigits: 11 },
];

/** Sort longest dial codes first to avoid ambiguous prefix matches */
const SORTED_RULES = [...COUNTRY_PHONE_RULES].sort(
  (a, b) => b.dialCode.length - a.dialCode.length
);

export function matchCountryPhoneRule(input: string): { rule: CountryPhoneRule; nationalDigits: string } | null {
  const clean = input.trim();
  const digitsOnly = clean.replace(/\D/g, '');

  if (clean.startsWith('+')) {
    for (const rule of SORTED_RULES) {
      if (clean.startsWith(rule.dialCode)) {
        let national = clean.slice(rule.dialCode.length).replace(/\D/g, '');
        if (national.startsWith('0') && national.length > rule.minDigits) {
          national = national.slice(1);
        }
        return { rule, nationalDigits: national };
      }
    }
  }

  // Without leading '+'
  for (const rule of SORTED_RULES) {
    const rawDial = rule.dialCode.replace('+', '');
    if (digitsOnly.startsWith(rawDial)) {
      let national = digitsOnly.slice(rawDial.length);
      if (national.startsWith('0') && national.length > rule.minDigits) {
        national = national.slice(1);
      }
      if (national.length >= rule.minDigits - 1 && national.length <= rule.maxDigits + 1) {
        return { rule, nationalDigits: national };
      }
    }
  }

  return null;
}

export function validateAndNormalizePhone(
  rawInput: string,
  defaultDialCode = '+971'
): { isValid: boolean; normalized: string; error?: string; rule?: CountryPhoneRule } {
  if (!rawInput || !rawInput.trim()) {
    return { isValid: false, normalized: '', error: 'Phone number is required' };
  }

  const trimmed = rawInput.trim();
  let match = matchCountryPhoneRule(trimmed);

  // If no country prefix was detected, apply defaultDialCode (e.g. +971 for UAE or +91 for India)
  if (!match) {
    const defaultRule = SORTED_RULES.find((r) => r.dialCode === defaultDialCode) || SORTED_RULES[0];
    let national = trimmed.replace(/\D/g, '');
    if (national.startsWith('0') && national.length > defaultRule.minDigits) {
      national = national.slice(1);
    }
    match = { rule: defaultRule, nationalDigits: national };
  }

  const { rule, nationalDigits } = match;
  const len = nationalDigits.length;

  if (rule.minDigits === rule.maxDigits) {
    if (len !== rule.minDigits) {
      return {
        isValid: false,
        normalized: `${rule.dialCode}${nationalDigits}`,
        error: `Phone number for ${rule.country} (${rule.dialCode}) must be exactly ${rule.minDigits} digits (received ${len}).`,
        rule,
      };
    }
  } else {
    if (len < rule.minDigits || len > rule.maxDigits) {
      return {
        isValid: false,
        normalized: `${rule.dialCode}${nationalDigits}`,
        error: `Phone number for ${rule.country} (${rule.dialCode}) must be between ${rule.minDigits} and ${rule.maxDigits} digits (received ${len}).`,
        rule,
      };
    }
  }

  return {
    isValid: true,
    normalized: `${rule.dialCode}${nationalDigits}`,
    rule,
  };
}
