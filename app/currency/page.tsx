"use client";

import { useMemo, useState } from "react";
import { AlertCircle, ArrowRight, RefreshCw, Search } from "lucide-react";
import { AppShell } from "@/components/dashboard/app-shell";
import { SectionCard } from "@/components/dashboard/ui";
import { useCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/api";

const QUICK_AMOUNTS = [100, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000];
const POPULAR = ["AED", "INR", "USD", "EUR", "GBP", "PKR", "SAR", "AED"];
const MAX_RATE_DIGITS = 6;

function rateDigits(rate: number): number {
  if (rate >= 1000) return 2;
  if (rate >= 1) return 4;
  if (rate >= 0.01) return MAX_RATE_DIGITS;
  return 8;
}

function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

export default function CurrencyPage() {
  const { display, base, setDisplay, rates, options, refresh, loading, error, offline, convert, rate, money } = useCurrency();

  const [amount, setAmount] = useState("1000");
  const [from, setFrom] = useState(base);
  const [to, setTo] = useState("INR");
  const [query, setQuery] = useState("");

  const value = parseAmount(amount);
  const result = convert(value, to, from);
  const forward = rate(from, to);
  const inverse = rate(to, from);

  const term = query.trim().toLowerCase();
  const tableRows = useMemo(() => {
    return Object.entries(rates?.rates ?? {})
      .map(([code, rateValue]) => ({ code, rate: rateValue }))
      .filter((row) => !term || row.code.toLowerCase().includes(term))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [rates, term]);

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  return (
    <AppShell>
      <div className="space-y-4 pt-2">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-[26px] font-extrabold tracking-tight text-[#071333]">Currency Converter</h1>
            <p className="text-sm text-[#5b6a86]">
              Live rates for {Object.keys(rates?.rates ?? {}).length || "—"} currencies. Amounts are stored in {base} and converted for display.
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="inline-flex h-[38px] items-center gap-2 self-start rounded-lg border border-[#dde7f3] bg-white px-3 text-[13px] font-bold text-[#1c2b4a] transition hover:border-[#1688f9]"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh rates
          </button>
        </div>

        {error ? (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800" role="status">
            <AlertCircle className="h-4 w-4" />
            {error} — showing the last known rates.
          </div>
        ) : null}

        {rates?.stale ? (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800" role="status">
            <AlertCircle className="h-4 w-4" />
            Live sources are unreachable right now. These rates were last updated {formatDate(rates.asOf, true)}.
          </div>
        ) : null}

        {offline && rates ? (
          <div className="flex items-center gap-2 rounded-lg border border-[#dde7f3] bg-[#f5f8fc] px-4 py-3 text-sm font-semibold text-[#3d4d6b]" role="status">
            <AlertCircle className="h-4 w-4" />
            Offline — converting with the rates saved on this device.
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <SectionCard title="Convert" subtitle={`1 ${base} = ${forward ? forward.toFixed(rateDigits(forward)) : "—"} ${to}`}>
            <div className="space-y-4 px-4 pb-5 sm:px-5">
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-[#3d4d6b]" htmlFor="convert-amount">Amount</label>
                <input
                  id="convert-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="h-12 w-full rounded-xl border border-[#dde7f3] px-3 text-[18px] font-bold outline-none focus:border-[#1688f9] focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                <CurrencySelect id="convert-from" label="From" value={from} options={options} onChange={setFrom} />
                <button
                  type="button"
                  onClick={swap}
                  aria-label="Swap currencies"
                  className="mb-1 grid h-10 w-10 place-items-center rounded-lg border border-[#dde7f3] bg-white text-[#1c2b4a] transition hover:border-[#1688f9] hover:text-[#1688f9]"
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
                <CurrencySelect id="convert-to" label="To" value={to} options={options} onChange={setTo} />
              </div>

              <div className="rounded-xl border border-[#dce7f4] bg-[#f5f8fc] p-4">
                <div className="text-[12px] font-bold uppercase tracking-wide text-[#7c8aa3]">{to}</div>
                <div className="mt-1 text-[30px] font-extrabold leading-tight tracking-tight text-[#071333]">{money(result, to)}</div>
                <div className="mt-2 text-[13px] text-[#5b6a86]">
                  {value.toLocaleString("en-US", { maximumFractionDigits: 2 })} {from} = {money(result, to)}
                  {forward ? ` · 1 ${from} = ${forward.toFixed(rateDigits(forward))} ${to}` : ""}
                  {inverse ? ` · 1 ${to} = ${inverse.toFixed(rateDigits(inverse))} ${from}` : ""}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {POPULAR.map((code, index) =>
                  index === POPULAR.length - 1 ? null : (
                    <button
                      key={code}
                      type="button"
                      onClick={() => {
                        setTo(code);
                        setDisplay(code);
                      }}
                      className={`rounded-lg border px-2.5 py-1 text-[12px] font-bold transition ${
                        to === code ? "border-[#1688f9] bg-[#eef6ff] text-[#1688f9]" : "border-[#dde7f3] bg-white text-[#3d4d6b] hover:border-[#1688f9]"
                      }`}
                    >
                      {code}
                    </button>
                  ),
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Quick reference" subtitle={`Common amounts converted from ${base}`}>
            <div className="overflow-x-auto px-4 pb-5 sm:px-5">
              <table className="w-full min-w-[420px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-[#eef3f9] text-left text-[11px] font-bold uppercase tracking-wide text-[#8a97ad]">
                    <th className="py-2 pr-3">Amount ({base})</th>
                    {POPULAR.slice(0, 6).map((code) => (
                      <th key={code} className="py-2 pr-3 text-right">{code}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {QUICK_AMOUNTS.map((quick) => (
                    <tr key={quick} className="border-b border-[#f4f8fc] last:border-0">
                      <td className="py-2 pr-3 font-bold text-[#071333]">{quick.toLocaleString("en-US")}</td>
                      {POPULAR.slice(0, 6).map((code) => (
                        <td key={code} className="py-2 pr-3 text-right text-[#3d4d6b]">
                          {money(convert(quick, code, base), code)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>

        <SectionCard
          title="All rates"
          subtitle={rates ? `Source: ${rates.source} · as of ${formatDate(rates.asOf, true)}` : "Loading rates…"}
        >
          <div className="px-4 pb-4 sm:px-5">
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a97ad]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by code…"
                className="h-10 w-full rounded-lg border border-[#e2eaf5] pl-9 pr-3 text-[13px] outline-none focus:border-[#1688f9] sm:max-w-[280px]"
              />
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-[#eef3f9] text-left text-[11px] font-bold uppercase tracking-wide text-[#8a97ad]">
                    <th className="py-2 pr-3">Code</th>
                    <th className="py-2 pr-3">Currency</th>
                    <th className="py-2 pr-3 text-right">1 {base}</th>
                    <th className="py-2 pr-3 text-right">1 {base} in {display}</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-[#7c8aa3]">No currency matches “{query}”</td>
                    </tr>
                  ) : (
                    tableRows.map((row) => {
                      const name = options.find((option) => option.code === row.code)?.name ?? row.code;
                      const inDisplay = convert(1, display, row.code);
                      return (
                        <tr key={row.code} className="border-b border-[#f4f8fc] last:border-0 hover:bg-[#f8fbff]">
                          <td className="py-2 pr-3 font-extrabold text-[#071333]">{row.code}</td>
                          <td className="py-2 pr-3 text-[#5b6a86]">{name}</td>
                          <td className="py-2 pr-3 text-right text-[#3d4d6b]">{row.rate.toFixed(Math.min(8, rateDigits(row.rate)))}</td>
                          <td className="py-2 pr-3 text-right font-semibold text-[#071333]">{inDisplay.toFixed(Math.min(8, rateDigits(inDisplay)))}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}

function CurrencySelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: Array<{ code: string; name: string }>;
  onChange: (code: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-semibold text-[#3d4d6b]" htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-lg border border-[#dde7f3] bg-white px-2 text-[14px] font-bold outline-none focus:border-[#1688f9]"
      >
        {(options.length ? options : [{ code: "AED", name: "Emirati Dirham" }]).map((option) => (
          <option key={option.code} value={option.code}>
            {option.code} — {option.name}
          </option>
        ))}
      </select>
    </div>
  );
}
