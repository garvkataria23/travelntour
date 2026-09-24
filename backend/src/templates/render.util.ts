import { TemplateContext } from './templates.service';

const VALID_VARIABLES = new Set([
  'customer_name',
  'pnr',
  'reference_number',
  'flight_number',
  'airline',
  'from',
  'from_airport',
  'from_city',
  'to',
  'to_airport',
  'to_city',
  'date',
  'time',
  'journey_date',
  'journey_time',
  'terminal',
  'amount',
  'currency',
  'airport_from',
  'airport_to',
]);

const VARIABLE_FALLBACKS: Record<string, string> = {
  terminal: 'the designated terminal',
};

export function extractVariables(content: string): string[] {
  const matches = content.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi);
  const found = new Set<string>();
  for (const m of matches) {
    const name = m[1].toLowerCase();
    if (VALID_VARIABLES.has(name)) found.add(name);
  }
  return [...found];
}

/**
 * Replaces {{variable}} placeholders with booking/customer data.
 * Only whitelisted variables are resolved; anything else is left untouched.
 * Missing values fall back to empty string or a safe fallback.
 */
export function renderTemplateContent(
  content: string,
  context: Partial<TemplateContext>,
): string {
  return content.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (match, rawName: string) => {
    const name = String(rawName).toLowerCase();
    if (!VALID_VARIABLES.has(name)) return match;
    const value = context[name as keyof TemplateContext];
    if (value === undefined || value === null) {
      return VARIABLE_FALLBACKS[name] ?? '';
    }
    return String(value);
  });
}

/** Value used for WhatsApp template component previews ({{1}}, {{2}}...). */
export function templateBodyValues(
  variables: string[],
  context: Partial<TemplateContext>,
): string[] {
  const dedupe = [...new Set(variables)];
  return dedupe.map((v) => {
    const value = context[v as keyof TemplateContext];
    // Meta treats empty-string body params as MISSING (error 131008) — always send a non-empty value.
    if (value === undefined || value === null || String(value).trim() === '') {
      return VARIABLE_FALLBACKS[v] ?? 'N/A';
    }
    return String(value);
  });
}