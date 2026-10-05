"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  COUNTRY_PHONE_LIST,
  CountryPhoneMetadata,
  POPULAR_COUNTRY_CODES,
  getCountryByDialCode,
  getCountryByIso,
  parsePhoneNumber,
  sanitizeNationalDigits,
  validatePhoneNumber,
} from "@/lib/phone-utils";
import { Check, ChevronDown, Info } from "lucide-react";

export interface PhoneInputProps {
  label?: string;
  value?: string;
  onChange: (e164Value: string, isValid: boolean, error?: string) => void;
  defaultCountry?: string; // ISO code, e.g. 'AE'
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  error?: string;
  id?: string;
  autoFocus?: boolean;
  showDigitCounter?: boolean;
  variant?: "light" | "dark";
}

export function PhoneInput({
  label,
  value = "",
  onChange,
  defaultCountry = "AE",
  required = false,
  disabled = false,
  placeholder,
  className = "",
  error,
  id,
  autoFocus = false,
  showDigitCounter = true,
  variant = "light",
}: PhoneInputProps) {
  const generatedId = useId();
  const inputId = id || generatedId;

  // Split incoming value into dial code & national number
  const parsed = useMemo(() => {
    return parsePhoneNumber(value, defaultCountry);
  }, [value, defaultCountry]);

  const [selectedIso, setSelectedIso] = useState<string>(parsed.country.iso);
  const [nationalDigits, setNationalDigits] = useState<string>(parsed.nationalNumber);

  // Sync internal state when external `value` prop changes
  useEffect(() => {
    const nextParsed = parsePhoneNumber(value, defaultCountry);
    setSelectedIso(nextParsed.country.iso);
    setNationalDigits(nextParsed.nationalNumber);
  }, [value, defaultCountry]);

  const country = useMemo(() => getCountryByIso(selectedIso), [selectedIso]);

  // Popular and remaining countries lists
  const { popularCountries, otherCountries } = useMemo(() => {
    const popularSet = new Set(POPULAR_COUNTRY_CODES);
    const popular = COUNTRY_PHONE_LIST.filter((c) => popularSet.has(c.iso));
    const others = COUNTRY_PHONE_LIST.filter((c) => !popularSet.has(c.iso));
    return { popularCountries: popular, otherCountries: others };
  }, []);

  // Calculate digit validation
  const validation = useMemo(() => {
    return validatePhoneNumber(country.iso, nationalDigits);
  }, [country.iso, nationalDigits]);

  const currentLen = nationalDigits.length;
  const isExact = country.minDigits === country.maxDigits;
  const isComplete = isExact
    ? currentLen === country.minDigits
    : currentLen >= country.minDigits && currentLen <= country.maxDigits;

  const handleCountryChange = (iso: string) => {
    const newCountry = getCountryByIso(iso);
    setSelectedIso(iso);
    // Re-sanitize digits under the new country's constraints
    const sanitized = sanitizeNationalDigits(nationalDigits, newCountry);
    setNationalDigits(sanitized);

    const valResult = validatePhoneNumber(iso, sanitized);
    onChange(sanitized ? `${newCountry.dialCode}${sanitized}` : "", valResult.isValid, valResult.error);
  };

  const handleInputChange = (raw: string) => {
    // If user pasted a full number with a plus or another country's dial code
    if (raw.trim().startsWith("+")) {
      const parsedPaste = parsePhoneNumber(raw.trim(), country.iso);
      setSelectedIso(parsedPaste.country.iso);
      setNationalDigits(parsedPaste.nationalNumber);
      const valResult = validatePhoneNumber(parsedPaste.country.iso, parsedPaste.nationalNumber);
      onChange(
        parsedPaste.nationalNumber ? `${parsedPaste.country.dialCode}${parsedPaste.nationalNumber}` : "",
        valResult.isValid,
        valResult.error
      );
      return;
    }

    // Otherwise strictly extract digits and enforce country max length
    const cleaned = sanitizeNationalDigits(raw, country);
    setNationalDigits(cleaned);

    const valResult = validatePhoneNumber(country.iso, cleaned);
    onChange(cleaned ? `${country.dialCode}${cleaned}` : "", valResult.isValid, valResult.error);
  };

  const isDark = variant === "dark";

  return (
    <div className={`space-y-1 ${className}`}>
      {label ? (
        <label htmlFor={inputId} className="mb-1 block text-xs font-bold text-slate-700">
          {label} {required ? <span className="text-rose-500">*</span> : null}
        </label>
      ) : null}
      <div
        className={`flex items-center rounded-xl border transition-all ${
          error
            ? isDark
              ? "border-rose-500 bg-rose-950/20 ring-1 ring-rose-500"
              : "border-rose-400 bg-rose-50/20 ring-1 ring-rose-300"
            : isComplete && currentLen > 0
            ? isDark
              ? "border-emerald-500 focus-within:border-emerald-400 focus-within:ring-1 focus-within:ring-emerald-400"
              : "border-emerald-400 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-400"
            : isDark
            ? "border-slate-700 bg-slate-800 focus-within:border-amber-400 focus-within:ring-1 focus-within:ring-amber-400"
            : "border-[#cfdbea] bg-white focus-within:border-[#1688f9] focus-within:ring-1 focus-within:ring-[#1688f9]"
        } ${disabled ? "opacity-60 pointer-events-none" : ""}`}
      >
        {/* Country Dial Code Selector */}
        <div
          className={`relative flex items-center border-r px-2.5 py-1.5 transition rounded-l-xl ${
            isDark
              ? "border-slate-700 bg-slate-900/60 hover:bg-slate-900"
              : "border-[#cfdbea] bg-slate-50/80 hover:bg-slate-100"
          }`}
        >
          <span className="text-base mr-1.5 select-none" aria-hidden="true">
            {country.flag}
          </span>
          <span
            className={`text-xs font-black tracking-tight mr-1 ${
              isDark ? "text-white" : "text-slate-800"
            }`}
          >
            {country.dialCode}
          </span>
          <ChevronDown
            className={`h-3 w-3 pointer-events-none ${
              isDark ? "text-slate-400" : "text-slate-400"
            }`}
          />
          <select
            value={selectedIso}
            onChange={(e) => handleCountryChange(e.target.value)}
            disabled={disabled}
            className={`absolute inset-0 w-full h-full opacity-0 cursor-pointer text-xs ${
              isDark ? "bg-slate-900 text-white" : "bg-white text-slate-900"
            }`}
            aria-label="Select Country Code"
          >
            <optgroup label="Popular Countries">
              {popularCountries.map((c) => (
                <option key={c.iso} value={c.iso} className={isDark ? "bg-slate-900 text-white" : "bg-white text-slate-900"}>
                  {c.flag} {c.country} ({c.dialCode}) — {c.minDigits === c.maxDigits ? `${c.minDigits} digits` : `${c.minDigits}-${c.maxDigits} digits`}
                </option>
              ))}
            </optgroup>
            <optgroup label="All Countries">
              {otherCountries.map((c) => (
                <option key={c.iso} value={c.iso} className={isDark ? "bg-slate-900 text-white" : "bg-white text-slate-900"}>
                  {c.flag} {c.country} ({c.dialCode}) — {c.minDigits === c.maxDigits ? `${c.minDigits} digits` : `${c.minDigits}-${c.maxDigits} digits`}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        {/* National Number Input */}
        <div className="relative flex-1 flex items-center">
          <input
            id={inputId}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            disabled={disabled}
            required={required}
            autoFocus={autoFocus}
            maxLength={country.maxDigits}
            value={nationalDigits}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder={placeholder || country.placeholder}
            className={`h-11 w-full bg-transparent px-3 text-sm font-semibold outline-none ${
              isDark
                ? "text-white placeholder:text-slate-500"
                : "text-slate-900 placeholder:text-slate-400"
            }`}
          />

          {/* Real-time Digit Requirement Counter */}
          {showDigitCounter && (
            <div className="pr-3 select-none flex items-center gap-1">
              {isComplete && currentLen > 0 ? (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                    isDark
                      ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800"
                      : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  <Check className="h-2.5 w-2.5" />
                  {currentLen} digits
                </span>
              ) : (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    currentLen > 0
                      ? isDark
                        ? "text-amber-400 bg-amber-950/60"
                        : "text-amber-700 bg-amber-50"
                      : isDark
                      ? "text-slate-500 bg-slate-800/80"
                      : "text-slate-400 bg-slate-100"
                  }`}
                >
                  {currentLen}/{country.maxDigits} digits
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Validation error / guidance */}
      {error ? (
        <span className="block text-[12px] font-medium text-rose-600 animate-in fade-in">
          {error}
        </span>
      ) : nationalDigits.length > 0 && !validation.isValid ? (
        <span className="block text-[11px] font-medium text-amber-700">
          <Info className="inline h-3 w-3 mr-1" />
          {validation.error}
        </span>
      ) : null}
    </div>
  );
}
