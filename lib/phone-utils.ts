/**
 * Phone number utilities: Country dial codes, digit lengths, validation and formatting.
 * Enforces that phone numbers strictly adhere to country-specific national digit counts.
 */

export interface CountryPhoneMetadata {
  iso: string;
  country: string;
  dialCode: string;
  flag: string;
  minDigits: number;
  maxDigits: number;
  placeholder: string;
}

export const POPULAR_COUNTRY_CODES = [
  "AE", // UAE
  "IN", // India
  "SA", // Saudi Arabia
  "QA", // Qatar
  "OM", // Oman
  "KW", // Kuwait
  "BH", // Bahrain
  "GB", // UK
  "US", // USA
  "PK", // Pakistan
  "BD", // Bangladesh
  "PH", // Philippines
  "LK", // Sri Lanka
  "NP", // Nepal
  "CA", // Canada
  "AU", // Australia
  "SG", // Singapore
  "MY", // Malaysia
  "EG", // Egypt
  "TR", // Turkey
];

export const COUNTRY_PHONE_LIST: CountryPhoneMetadata[] = [
  // Middle East & GCC
  { iso: "AE", country: "United Arab Emirates", dialCode: "+971", flag: "🇦🇪", minDigits: 9, maxDigits: 9, placeholder: "50 123 4567" },
  { iso: "SA", country: "Saudi Arabia", dialCode: "+966", flag: "🇸🇦", minDigits: 9, maxDigits: 9, placeholder: "50 123 4567" },
  { iso: "QA", country: "Qatar", dialCode: "+974", flag: "🇶🇦", minDigits: 8, maxDigits: 8, placeholder: "3312 3456" },
  { iso: "OM", country: "Oman", dialCode: "+968", flag: "🇴🇲", minDigits: 8, maxDigits: 8, placeholder: "9123 4567" },
  { iso: "KW", country: "Kuwait", dialCode: "+965", flag: "🇰🇼", minDigits: 8, maxDigits: 8, placeholder: "9123 4567" },
  { iso: "BH", country: "Bahrain", dialCode: "+973", flag: "🇧🇭", minDigits: 8, maxDigits: 8, placeholder: "3912 3456" },
  { iso: "JO", country: "Jordan", dialCode: "+962", flag: "🇯🇴", minDigits: 9, maxDigits: 9, placeholder: "7 9012 3456" },
  { iso: "LB", country: "Lebanon", dialCode: "+961", flag: "🇱🇧", minDigits: 7, maxDigits: 8, placeholder: "70 123 456" },
  { iso: "IQ", country: "Iraq", dialCode: "+964", flag: "🇮🇶", minDigits: 10, maxDigits: 10, placeholder: "790 123 4567" },
  { iso: "EG", country: "Egypt", dialCode: "+20", flag: "🇪🇬", minDigits: 10, maxDigits: 10, placeholder: "10 1234 5678" },
  { iso: "TR", country: "Turkey", dialCode: "+90", flag: "🇹🇷", minDigits: 10, maxDigits: 10, placeholder: "501 234 5678" },

  // South Asia
  { iso: "IN", country: "India", dialCode: "+91", flag: "🇮🇳", minDigits: 10, maxDigits: 10, placeholder: "98765 43210" },
  { iso: "PK", country: "Pakistan", dialCode: "+92", flag: "🇵🇰", minDigits: 10, maxDigits: 10, placeholder: "300 1234567" },
  { iso: "BD", country: "Bangladesh", dialCode: "+880", flag: "🇧🇩", minDigits: 10, maxDigits: 10, placeholder: "1712 345678" },
  { iso: "LK", country: "Sri Lanka", dialCode: "+94", flag: "🇱🇰", minDigits: 9, maxDigits: 9, placeholder: "71 234 5678" },
  { iso: "NP", country: "Nepal", dialCode: "+977", flag: "🇳🇵", minDigits: 10, maxDigits: 10, placeholder: "984 1234567" },
  { iso: "MV", country: "Maldives", dialCode: "+960", flag: "🇲🇻", minDigits: 7, maxDigits: 7, placeholder: "791 2345" },

  // North America & Europe
  { iso: "US", country: "United States", dialCode: "+1", flag: "🇺🇸", minDigits: 10, maxDigits: 10, placeholder: "202 555 0123" },
  { iso: "CA", country: "Canada", dialCode: "+1", flag: "🇨🇦", minDigits: 10, maxDigits: 10, placeholder: "416 555 0123" },
  { iso: "GB", country: "United Kingdom", dialCode: "+44", flag: "🇬🇧", minDigits: 10, maxDigits: 10, placeholder: "7911 123456" },
  { iso: "DE", country: "Germany", dialCode: "+49", flag: "🇩🇪", minDigits: 10, maxDigits: 11, placeholder: "151 23456789" },
  { iso: "FR", country: "France", dialCode: "+33", flag: "🇫🇷", minDigits: 9, maxDigits: 9, placeholder: "6 12 34 56 78" },
  { iso: "IT", country: "Italy", dialCode: "+39", flag: "🇮🇹", minDigits: 9, maxDigits: 10, placeholder: "312 345 6789" },
  { iso: "ES", country: "Spain", dialCode: "+34", flag: "🇪🇸", minDigits: 9, maxDigits: 9, placeholder: "612 34 56 78" },
  { iso: "NL", country: "Netherlands", dialCode: "+31", flag: "🇳🇱", minDigits: 9, maxDigits: 9, placeholder: "6 12345678" },
  { iso: "CH", country: "Switzerland", dialCode: "+41", flag: "🇨🇭", minDigits: 9, maxDigits: 9, placeholder: "78 123 45 67" },
  { iso: "SE", country: "Sweden", dialCode: "+46", flag: "🇸🇪", minDigits: 9, maxDigits: 9, placeholder: "70 123 45 67" },
  { iso: "NO", country: "Norway", dialCode: "+47", flag: "🇳🇴", minDigits: 8, maxDigits: 8, placeholder: "412 34 567" },
  { iso: "DK", country: "Denmark", dialCode: "+45", flag: "🇩🇰", minDigits: 8, maxDigits: 8, placeholder: "20 12 34 56" },
  { iso: "IE", country: "Ireland", dialCode: "+353", flag: "🇮🇪", minDigits: 9, maxDigits: 9, placeholder: "85 123 4567" },
  { iso: "RU", country: "Russia", dialCode: "+7", flag: "🇷🇺", minDigits: 10, maxDigits: 10, placeholder: "912 345 6789" },

  // Asia Pacific
  { iso: "PH", country: "Philippines", dialCode: "+63", flag: "🇵🇭", minDigits: 10, maxDigits: 10, placeholder: "917 123 4567" },
  { iso: "SG", country: "Singapore", dialCode: "+65", flag: "🇸🇬", minDigits: 8, maxDigits: 8, placeholder: "8123 4567" },
  { iso: "MY", country: "Malaysia", dialCode: "+60", flag: "🇲🇾", minDigits: 9, maxDigits: 10, placeholder: "12 345 6789" },
  { iso: "TH", country: "Thailand", dialCode: "+66", flag: "🇹🇭", minDigits: 9, maxDigits: 9, placeholder: "81 234 5678" },
  { iso: "ID", country: "Indonesia", dialCode: "+62", flag: "🇮🇩", minDigits: 9, maxDigits: 12, placeholder: "812 3456 7890" },
  { iso: "VN", country: "Vietnam", dialCode: "+84", flag: "🇻🇳", minDigits: 9, maxDigits: 9, placeholder: "91 234 5678" },
  { iso: "AU", country: "Australia", dialCode: "+61", flag: "🇦🇺", minDigits: 9, maxDigits: 9, placeholder: "412 345 678" },
  { iso: "NZ", country: "New Zealand", dialCode: "+64", flag: "🇳🇿", minDigits: 8, maxDigits: 10, placeholder: "21 123 4567" },
  { iso: "CN", country: "China", dialCode: "+86", flag: "🇨🇳", minDigits: 11, maxDigits: 11, placeholder: "138 0013 8000" },
  { iso: "HK", country: "Hong Kong", dialCode: "+852", flag: "🇭🇰", minDigits: 8, maxDigits: 8, placeholder: "9123 4567" },
  { iso: "JP", country: "Japan", dialCode: "+81", flag: "🇯🇵", minDigits: 10, maxDigits: 10, placeholder: "90 1234 5678" },
  { iso: "KR", country: "South Korea", dialCode: "+82", flag: "🇰🇷", minDigits: 9, maxDigits: 10, placeholder: "10 1234 5678" },

  // Africa & Others
  { iso: "ZA", country: "South Africa", dialCode: "+27", flag: "🇿🇦", minDigits: 9, maxDigits: 9, placeholder: "71 234 5678" },
  { iso: "NG", country: "Nigeria", dialCode: "+234", flag: "🇳🇬", minDigits: 10, maxDigits: 10, placeholder: "802 123 4567" },
  { iso: "KE", country: "Kenya", dialCode: "+254", flag: "🇰🇪", minDigits: 9, maxDigits: 9, placeholder: "712 345678" },
  { iso: "MU", country: "Mauritius", dialCode: "+230", flag: "🇲🇺", minDigits: 8, maxDigits: 8, placeholder: "5251 2345" },
  { iso: "BR", country: "Brazil", dialCode: "+55", flag: "🇧🇷", minDigits: 10, maxDigits: 11, placeholder: "11 91234 5678" },
];

/** Index by ISO code */
const ISO_MAP = new Map<string, CountryPhoneMetadata>(
  COUNTRY_PHONE_LIST.map((c) => [c.iso.toUpperCase(), c])
);

/**
 * Dial codes sorted by longest dialCode first so that "+971" is matched before "+9"
 * and "+880" before "+88".
 */
const SORTED_DIAL_CODES = [...COUNTRY_PHONE_LIST].sort(
  (a, b) => b.dialCode.length - a.dialCode.length
);

export function getCountryByIso(iso: string): CountryPhoneMetadata {
  return ISO_MAP.get(iso.toUpperCase()) || COUNTRY_PHONE_LIST[0]; // fallback UAE
}

export function getCountryByDialCode(dialCode: string): CountryPhoneMetadata {
  const clean = dialCode.startsWith("+") ? dialCode : `+${dialCode}`;
  const found = SORTED_DIAL_CODES.find((c) => c.dialCode === clean);
  return found || COUNTRY_PHONE_LIST[0];
}

/**
 * Strips formatting, non-digits, and removes single leading trunk zero if applicable.
 */
export function sanitizeNationalDigits(raw: string, country: CountryPhoneMetadata): string {
  let digits = raw.replace(/\D/g, "");
  // If user entered e.g. 0501234567 for UAE (10 digits starting with 0), strip the leading 0
  if (digits.startsWith("0") && digits.length > country.minDigits) {
    digits = digits.slice(1);
  }
  // Enforce country max digits strictly
  if (digits.length > country.maxDigits) {
    digits = digits.slice(0, country.maxDigits);
  }
  return digits;
}

/**
 * Parse an existing string (which may or may not have country code, spaces, or plus)
 * into its dial code, national number, and metadata.
 */
export function parsePhoneNumber(
  fullPhone: string | null | undefined,
  fallbackIso: string = "AE"
): {
  country: CountryPhoneMetadata;
  dialCode: string;
  nationalNumber: string;
  rawDigits: string;
} {
  const defaultCountry = getCountryByIso(fallbackIso);
  if (!fullPhone || !fullPhone.trim()) {
    return {
      country: defaultCountry,
      dialCode: defaultCountry.dialCode,
      nationalNumber: "",
      rawDigits: "",
    };
  }

  const trimmed = fullPhone.trim();
  const digitsOnly = trimmed.replace(/\D/g, "");

  // 1. If it starts with '+', match known dial codes (longest first)
  if (trimmed.startsWith("+")) {
    for (const c of SORTED_DIAL_CODES) {
      if (trimmed.startsWith(c.dialCode)) {
        const remaining = trimmed.slice(c.dialCode.length);
        const national = sanitizeNationalDigits(remaining, c);
        return {
          country: c,
          dialCode: c.dialCode,
          nationalNumber: national,
          rawDigits: `${c.dialCode.replace("+", "")}${national}`,
        };
      }
    }
  }

  // 2. Check if raw digits start with a known dial code (without +)
  for (const c of SORTED_DIAL_CODES) {
    const rawCode = c.dialCode.replace("+", "");
    if (digitsOnly.startsWith(rawCode)) {
      const rest = digitsOnly.slice(rawCode.length);
      // Verify rest length makes sense for this country
      if (rest.length >= c.minDigits - 1 && rest.length <= c.maxDigits + 1) {
        const national = sanitizeNationalDigits(rest, c);
        return {
          country: c,
          dialCode: c.dialCode,
          nationalNumber: national,
          rawDigits: `${rawCode}${national}`,
        };
      }
    }
  }

  // 3. Fallback: Treat the whole string as the national number under defaultCountry
  const national = sanitizeNationalDigits(digitsOnly, defaultCountry);
  return {
    country: defaultCountry,
    dialCode: defaultCountry.dialCode,
    nationalNumber: national,
    rawDigits: `${defaultCountry.dialCode.replace("+", "")}${national}`,
  };
}

export interface PhoneValidationResult {
  isValid: boolean;
  error?: string;
  e164: string;
  expectedLength: string;
  currentLength: number;
  country: CountryPhoneMetadata;
}

/**
 * Validates whether the given national number satisfies the exact calculated digit requirements
 * for the selected country.
 */
export function validatePhoneNumber(
  dialCodeOrIso: string,
  nationalNumber: string
): PhoneValidationResult {
  let country: CountryPhoneMetadata;
  if (dialCodeOrIso.startsWith("+") || /^\d+$/.test(dialCodeOrIso)) {
    country = getCountryByDialCode(dialCodeOrIso);
  } else {
    country = getCountryByIso(dialCodeOrIso);
  }

  const digits = sanitizeNationalDigits(nationalNumber, country);
  const currentLength = digits.length;
  const isExact = country.minDigits === country.maxDigits;
  const expectedLength = isExact
    ? `${country.minDigits} digits`
    : `${country.minDigits}-${country.maxDigits} digits`;

  if (currentLength === 0) {
    return {
      isValid: false,
      error: `Phone number is required.`,
      e164: "",
      expectedLength,
      currentLength: 0,
      country,
    };
  }

  if (isExact) {
    if (currentLength !== country.minDigits) {
      return {
        isValid: false,
        error: `Phone number for ${country.country} (${country.dialCode}) must be exactly ${country.minDigits} digits (currently ${currentLength}).`,
        e164: `${country.dialCode}${digits}`,
        expectedLength,
        currentLength,
        country,
      };
    }
  } else {
    if (currentLength < country.minDigits || currentLength > country.maxDigits) {
      return {
        isValid: false,
        error: `Phone number for ${country.country} (${country.dialCode}) must be between ${country.minDigits} and ${country.maxDigits} digits (currently ${currentLength}).`,
        e164: `${country.dialCode}${digits}`,
        expectedLength,
        currentLength,
        country,
      };
    }
  }

  return {
    isValid: true,
    e164: `${country.dialCode}${digits}`,
    expectedLength,
    currentLength,
    country,
  };
}

/**
 * Format any phone string nicely for UI display (e.g. "+971 50 123 4567" or "+91 98765 43210").
 */
export function formatPhoneDisplay(raw: string | null | undefined): string {
  if (!raw || !raw.trim()) return "—";
  const { country, dialCode, nationalNumber } = parsePhoneNumber(raw);
  if (!nationalNumber) return raw;

  // Pretty spacing based on country digits
  if (country.iso === "AE" && nationalNumber.length === 9) {
    return `${dialCode} ${nationalNumber.slice(0, 2)} ${nationalNumber.slice(2, 5)} ${nationalNumber.slice(5)}`;
  }
  if (country.iso === "IN" && nationalNumber.length === 10) {
    return `${dialCode} ${nationalNumber.slice(0, 5)} ${nationalNumber.slice(5)}`;
  }
  if (country.iso === "US" && nationalNumber.length === 10) {
    return `${dialCode} (${nationalNumber.slice(0, 3)}) ${nationalNumber.slice(3, 6)}-${nationalNumber.slice(6)}`;
  }
  if (country.iso === "SA" && nationalNumber.length === 9) {
    return `${dialCode} ${nationalNumber.slice(0, 2)} ${nationalNumber.slice(2, 5)} ${nationalNumber.slice(5)}`;
  }
  if (country.iso === "GB" && nationalNumber.length === 10) {
    return `${dialCode} ${nationalNumber.slice(0, 4)} ${nationalNumber.slice(4)}`;
  }

  // General chunking: 3 or 4 digits
  if (nationalNumber.length <= 8) {
    return `${dialCode} ${nationalNumber.slice(0, 4)} ${nationalNumber.slice(4)}`;
  }
  return `${dialCode} ${nationalNumber.slice(0, 3)} ${nationalNumber.slice(3, 6)} ${nationalNumber.slice(6)}`;
}
