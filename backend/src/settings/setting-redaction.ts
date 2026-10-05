import type { BusinessSetting } from '@prisma/client';

/**
 * Columns on BusinessSetting that must never reach a caller without SETTINGS_VIEW_SENSITIVE.
 *
 * These are the tenant's banking coordinates and its tax registration. Counter staff need to see
 * that a tax configuration exists; they do not need the bank account number in order to sell a
 * flight ticket, and handing it out turns every STAFF session into access to the company's money.
 */
export const SENSITIVE_SETTING_FIELDS = [
  'bankName',
  'bankAccountName',
  'bankAccountNumber',
  'bankIfscSwift',
  'bankUpiId',
  'gstin',
] as const;

/** Placeholder shown in place of a redacted value, so the UI can explain the absence. */
export const REDACTED_PLACEHOLDER = null;

export function redactSetting<T extends Partial<BusinessSetting>>(
  setting: T,
  mayViewSensitive: boolean,
): T | Record<string, unknown> {
  if (mayViewSensitive) return setting;

  const out: Record<string, unknown> = { ...setting };
  for (const field of SENSITIVE_SETTING_FIELDS) {
    if (out[field] !== undefined && out[field] !== null) {
      out[field] = REDACTED_PLACEHOLDER;
      // Tells the UI the value exists but is hidden, which is different from "not configured".
      out[`${field}Restricted`] = true;
    }
  }
  return out;
}