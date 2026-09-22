const AIRPORT_CITY: Record<string, { code: string; city: string }> = {
  BOM: { code: 'BOM', city: 'Mumbai' },
  DEL: { code: 'DEL', city: 'Delhi' },
  BLR: { code: 'BLR', city: 'Bangalore' },
  HYD: { code: 'HYD', city: 'Hyderabad' },
  GOI: { code: 'GOI', city: 'Goa' },
  MAA: { code: 'MAA', city: 'Chennai' },
  CCU: { code: 'CCU', city: 'Kolkata' },
  AMD: { code: 'AMD', city: 'Ahmedabad' },
  COK: { code: 'COK', city: 'Kochi' },
  DXB: { code: 'DXB', city: 'Dubai' },
  SIN: { code: 'SIN', city: 'Singapore' },
  LHR: { code: 'LHR', city: 'London' },
  JFK: { code: 'JFK', city: 'New York' },
};

export interface ParsedAirport {
  code: string;
  city: string;
}

/**
 * Accepts "Mumbai (BOM)", "BOM", "bom", "Mumbai BOM" and returns
 * { code: "BOM", city: "Mumbai" }. Falls back to the raw input.
 */
export function parseAirportInput(input: string): ParsedAirport {
  const raw = input.trim();
  if (!raw) return { code: '', city: '' };

  const paren = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (paren) {
    const city = paren[1].trim();
    const code = paren[2].trim().toUpperCase();
    return { code, city: city || AIRPORT_CITY[code]?.city || code };
  }

  const codeOnly = raw.toUpperCase();
  if (AIRPORT_CITY[codeOnly]) {
    return { code: codeOnly, city: AIRPORT_CITY[codeOnly].city };
  }

  const codeMatch = raw.match(/\b([A-Z]{3})\b/);
  if (codeMatch) {
    const code = codeMatch[1];
    return { code, city: AIRPORT_CITY[code]?.city || raw.replace(/\b[A-Z]{3}\b/g, '').trim() || code };
  }

  return { code: raw.slice(0, 3).toUpperCase(), city: raw };
}

const PHONE_REGEX = /^\+?[0-9]{7,15}$/;

export function normalizePhone(input: string): string {
  return input.replace(/[\s\-().]/g, '');
}

export function isValidPhone(input: string): boolean {
  return PHONE_REGEX.test(normalizePhone(input));
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}
