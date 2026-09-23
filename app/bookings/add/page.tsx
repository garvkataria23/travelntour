"use client";

import { AppShell } from "@/components/dashboard/app-shell";
import { ArrowRight, Barcode, Building2, CalendarDays, Clock3, Flag, Lightbulb, Mail, MapPin, Plane, User, Users, MessageCircle, BarChart3, CalendarCheck, Zap, ReceiptText } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { api } from "@/lib/api";

const AIRLINES = ["Air India", "IndiGo", "SpiceJet", "Emirates", "Vistara", "Akasa Air", "Go First"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AddBookingPage() {
  const router = useRouter();
  const [skipAutomation, setSkipAutomation] = useState(false);
  const [generateInvoice, setGenerateInvoice] = useState(false);
  const [invoiceLink, setInvoiceLink] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({
    name: "",
    phone: "",
    email: "",
    pnr: "",
    flightNumber: "",
    airline: "",
    from: "",
    to: "",
    departureDate: "",
    departureTime: "",
    terminal: "",
    amount: "",
    baseFare: "",
    cost: "",
    discount: "",
    taxRate: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(false);

  const set = (key: string) => (value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => { const next = { ...current }; delete next[key]; return next; });
  };

  function validate() {
    const errs: Record<string, string> = {};
    if (!values.name.trim()) errs.name = "Full name is required.";
    if (!/^\d{10}$/.test(values.phone.replace(/[\s-]/g, ""))) errs.phone = "Enter a valid 10-digit WhatsApp number.";
    if (values.email && !EMAIL_RE.test(values.email.trim())) errs.email = "Enter a valid email address.";
    if (values.pnr.trim().length < 3) errs.pnr = "PNR must be at least 3 characters.";
    if (!values.flightNumber.trim()) errs.flightNumber = "Flight number is required.";
    if (!values.airline) errs.airline = "Select an airline.";
    if (!values.from.trim()) errs.from = "Departure city is required.";
    if (!values.to.trim()) errs.to = "Destination city is required.";
    if (!values.departureDate) {
      errs.departureDate = "Pick a departure date.";
    } else if (new Date(`${values.departureDate}T00:00:00`) < startOfToday()) {
      errs.departureDate = "Departure date cannot be in the past.";
    }
    if (!values.departureTime.trim()) errs.departureTime = "Departure time is required.";
    if (values.amount && Number(values.amount) <= 0) errs.amount = "Amount must be greater than 0.";
    if (values.baseFare && Number(values.baseFare) < 0) errs.baseFare = "Base fare cannot be negative.";
    if (values.cost && Number(values.cost) < 0) errs.cost = "Direct cost cannot be negative.";
    if (values.discount && Number(values.discount) < 0) errs.discount = "Discount cannot be negative.";
    if (values.taxRate && (Number(values.taxRate) < 0 || Number(values.taxRate) > 100)) errs.taxRate = "Tax rate must be between 0 and 100.";
    return errs;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSubmitting(true);
    try {
      const result = await api<{ id: string; invoiceNumber?: string | null }>("/bookings", {
        method: "POST",
        body: {
          customer: { name: values.name, phone: values.phone, email: values.email || undefined },
          pnr: values.pnr,
          flightNumber: values.flightNumber,
          airline: values.airline,
          from: values.from,
          to: values.to,
          departureDate: values.departureDate,
          departureTime: values.departureTime || undefined,
          terminal: values.terminal || undefined,
          amount: values.amount ? Number(values.amount) : undefined,
          baseFare: values.baseFare ? Number(values.baseFare) : undefined,
          cost: values.cost ? Number(values.cost) : undefined,
          discount: values.discount ? Number(values.discount) : undefined,
          taxRate: values.taxRate ? Number(values.taxRate) : undefined,
          generateInvoice,
          source: "MANUAL",
          status: "CONFIRMED",
          skipAutomation,
        },
      });
      setCreated(true);
      if (result.invoiceNumber) {
        setInvoiceLink(`/bookings/${result.id}/invoice`);
        setNotice(`Booking created with invoice ${result.invoiceNumber}. Opening print view…`);
        window.setTimeout(() => router.push(`/bookings/${result.id}/invoice`), 1200);
      } else {
        setNotice("Booking created successfully. Redirecting to bookings…");
        window.setTimeout(() => router.push("/bookings"), 1600);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create booking");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="flex flex-col justify-between gap-4 lg:flex-row">
          <div>
            <div className="mb-1 text-sm text-[#405174]"><Link href="/bookings">Bookings</Link> <span className="mx-2">›</span> <b>Add Booking</b></div>
            <h1 className="text-[32px] font-extrabold leading-tight tracking-[-0.04em]">Add New Booking</h1>
            <p className="mt-1 text-base text-[#596782]">Enter the booking details once and let the system handle the rest.</p>
          </div>
          <div className="relative hidden min-h-[150px] flex-1 text-right text-[#6d95d5] lg:block">
            <p className="absolute right-24 top-7 rotate-[-8deg] font-hand text-2xl italic leading-8">One Booking. Many Journeys.<br />Automatically.</p>
            <Plane className="absolute right-0 top-4 h-16 w-16 -rotate-[20deg] fill-[#6f8bb6] stroke-[#6f8bb6]" />
            <div className="absolute right-16 top-[96px] h-px w-64 rotate-[-18deg] border-t-2 border-dashed border-[#9fc3f0]" />
          </div>
        </div>

        <StepBar />

        <div className="grid gap-4 xl:grid-cols-[1fr_338px]">
          <div className="space-y-4">
            <FormCard icon={User} title="Customer Details" subtitle="Enter passenger information and contact details.">
              <div className="grid gap-4 md:grid-cols-3">
                <Input label="Full Name" required icon={User} placeholder="e.g. Rahul Sharma" value={values.name} onChange={set("name")} error={errors.name} />
                <PhoneInput value={values.phone} onChange={set("phone")} error={errors.phone} />
                <Input label="Email" hint="(Optional)" icon={Mail} placeholder="e.g. rahul@gmail.com" value={values.email} onChange={set("email")} error={errors.email} />
              </div>
            </FormCard>

            <FormCard icon={Plane} title="Flight Details" subtitle="Enter the flight and journey information.">
              <div className="grid gap-4 md:grid-cols-3">
                <Input label="PNR / Reference Number" required icon={Barcode} placeholder="e.g. ABC123" value={values.pnr} onChange={set("pnr")} error={errors.pnr} />
                <Input label="Flight Number" required icon={Plane} placeholder="e.g. AI-202" value={values.flightNumber} onChange={set("flightNumber")} error={errors.flightNumber} />
                <SelectInput label="Airline" required placeholder="Select Airline" value={values.airline} onChange={set("airline")} error={errors.airline} />
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Input label="From (Departure)" required icon={MapPin} placeholder="e.g. Mumbai (BOM)" value={values.from} onChange={set("from")} error={errors.from} />
                <Input label="To (Destination)" required icon={MapPin} placeholder="e.g. Delhi (DEL)" value={values.to} onChange={set("to")} error={errors.to} />
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <Input label="Departure Date" required icon={CalendarDays} placeholder="Select date" type="date" value={values.departureDate} onChange={set("departureDate")} error={errors.departureDate} />
                <Input label="Departure Time" required icon={Clock3} placeholder="10:30 AM" value={values.departureTime} onChange={set("departureTime")} error={errors.departureTime} />
                <Input label="Terminal" hint="(Optional)" icon={Building2} placeholder="e.g. Terminal 2" value={values.terminal} onChange={set("terminal")} />
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Input label="Fare Amount" hint="(Optional, in ₹)" icon={BarChart3} placeholder="e.g. 12450" type="number" value={values.amount} onChange={set("amount")} error={errors.amount} />
              </div>
            </FormCard>

            <FormCard icon={ReceiptText} title="Accounting & Invoicing" subtitle="Optional fare breakdown for profit tracking and GST invoicing.">
              <div className="grid gap-4 md:grid-cols-2">
                <Input label="Base Fare" hint="(Gross, before discount)" icon={BarChart3} placeholder="e.g. 12000" type="number" value={values.baseFare} onChange={set("baseFare")} error={errors.baseFare} />
                <Input label="Direct Cost" hint="(Your ticket cost)" icon={BarChart3} placeholder="e.g. 10500" type="number" value={values.cost} onChange={set("cost")} error={errors.cost} />
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Input label="Discount" hint="(₹ off base fare)" icon={BarChart3} placeholder="e.g. 500" type="number" value={values.discount} onChange={set("discount")} error={errors.discount} />
                <Input label="GST Rate" hint="(% default from settings)" icon={BarChart3} placeholder="e.g. 5" type="number" value={values.taxRate} onChange={set("taxRate")} error={errors.taxRate} />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-lg bg-[#f1f7ff] p-4">
                <div><div className="font-bold">Generate invoice</div><div className="text-sm text-[#596782]">Issue this booking with a printable invoice number.</div></div>
                <button type="button" role="switch" aria-checked={generateInvoice} onClick={() => setGenerateInvoice((value) => !value)} className={`relative h-7 w-12 shrink-0 rounded-full transition ${generateInvoice ? "bg-[#1688f9]" : "bg-[#b8c4d8]"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${generateInvoice ? "left-6" : "left-1"}`} /></button>
              </div>
            </FormCard>

            <FormCard icon={Zap} title="Automation Settings" subtitle="Control automatic WhatsApp messages for this booking.">
              <div className="flex items-center justify-between gap-4 rounded-lg bg-[#f1f7ff] p-4">
                <div><div className="font-bold">Skip automation for this booking</div><div className="text-sm text-[#596782]">When on, no confirmation or reminder messages will be sent for this booking.</div></div>
                <button type="button" role="switch" aria-checked={skipAutomation} onClick={() => setSkipAutomation((value) => !value)} className={`relative h-7 w-12 shrink-0 rounded-full transition ${skipAutomation ? "bg-[#1688f9]" : "bg-[#b8c4d8]"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${skipAutomation ? "left-6" : "left-1"}`} /></button>
              </div>
              <p className="mt-3 text-sm text-[#65728a]">Messages are sent automatically based on the active rules in <Link className="font-bold text-[#087df0]" href="/automation">Automation</Link>.</p>
            </FormCard>
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border border-[#dce7f4] bg-white p-3 shadow-sm">
              <div className="overflow-hidden rounded-lg bg-[url('/assets/add-booking-card.png')] bg-cover bg-center px-5 pb-7 pt-[120px] text-white">
                <h3 className="text-xl font-extrabold leading-6">Turn Bookings into<br />Better Journeys</h3>
                <p className="mt-3 text-sm leading-5">Automatic WhatsApp updates<br />for a smoother travel experience.</p>
              </div>
              <div className="mt-5 rounded-lg bg-[#f4f9ff] p-5">
                <h3 className="mb-4 text-lg font-extrabold">What happens next?</h3>
                <Timeline />
              </div>
              <div className="mt-4 flex gap-3 rounded-lg bg-gradient-to-r from-[#e6faed] to-[#e9f8ee] p-4 text-sm">
                <Lightbulb className="h-7 w-7 shrink-0 text-[#14aa4a]" />
                <div><b className="text-[#0d8f39]">Pro Tip</b><p className="mt-1 text-[#49607b]">You only need to enter the details once. Our system takes care of the rest!</p></div>
              </div>
            </div>
          </aside>
        </div>

        {error ? <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p> : null}
        {notice ? <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p> : null}
        {invoiceLink ? <p className="flex flex-wrap items-center gap-3 rounded-lg bg-[#eef6ff] px-4 py-3 text-sm font-medium text-[#087df0]">Invoice generated.<Link href={invoiceLink} className="rounded-lg bg-[#1688f9] px-4 py-2 font-bold text-white">Open Invoice</Link></p> : null}

        <div className="flex items-center justify-between border-t border-[#dce7f4] bg-white/70 py-3">
          <Link href="/bookings" className="rounded-lg border border-[#d6e1ef] bg-white px-9 py-3 font-semibold shadow-sm">Cancel</Link>
          <button className="flex items-center gap-3 rounded-lg bg-[#1688f9] px-10 py-3 font-bold text-white shadow-sm disabled:opacity-60" type="submit" disabled={submitting || created}>{created ? "Created ✓" : submitting ? "Creating..." : "Create Booking"} {submitting || created ? null : <ArrowRight className="h-5 w-5" />}</button>
        </div>
      </form>
    </AppShell>
  );
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function StepBar() {
  const steps = ["Customer Details", "Flight Details", "Automation Settings", "Review & Create"];
  return <div className="flex flex-wrap items-center gap-3 py-2">{steps.map((step, index) => <div key={step} className="flex items-center gap-3"><span className={`grid h-9 w-9 place-items-center rounded-full border text-sm font-bold ${index === 0 ? "border-[#1688f9] bg-[#1688f9] text-white" : "border-[#b7c7dd] bg-white text-[#405174]"}`}>{index + 1}</span><span className="text-sm font-semibold">{step}</span>{index < steps.length - 1 ? <span className="hidden h-px w-16 bg-[#b7c7dd] md:block" /> : null}</div>)}</div>;
}

function FormCard({ icon: Icon, title, subtitle, children }: { icon: typeof User; title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="rounded-lg border border-[#dce7f4] bg-white p-5 shadow-[0_10px_24px_rgba(31,61,105,0.035)]"><div className="mb-5 flex items-start gap-4"><span className="grid h-9 w-9 place-items-center rounded-md bg-[#1688f9] text-white"><Icon className="h-5 w-5" /></span><div><h2 className="text-lg font-extrabold">{title}</h2><p className="text-sm text-[#596782]">{subtitle}</p></div></div>{children}</section>;
}

function Input({ label, icon: Icon, placeholder, required, hint, value, onChange, type = "text", error }: { label: string; icon: typeof User; placeholder: string; required?: boolean; hint?: string; value: string; onChange: (value: string) => void; type?: string; error?: string }) {
  return <label className="block"><span className="mb-2 block text-sm font-semibold">{label} {hint ? <span className="font-normal text-[#596782]">{hint}</span> : null} {required ? <span className="text-red-500">*</span> : null}</span><span className={`flex h-11 items-center gap-3 rounded-md border bg-white px-3 text-[#596782] ${error ? "border-rose-400 ring-4 ring-rose-50" : "border-[#cfdbea] focus-within:border-[#1688f9] focus-within:ring-4 focus-within:ring-blue-100"}`}><Icon className="h-5 w-5" /><input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#6d7890]" placeholder={placeholder} /></span>{error ? <span className="mt-1.5 block text-[13px] font-medium text-rose-600">{error}</span> : null}</label>;
}

function SelectInput({ label, placeholder, required, value, onChange, error }: { label: string; placeholder: string; required?: boolean; value: string; onChange: (value: string) => void; error?: string }) {
  return <label className="block"><span className="mb-2 block text-sm font-semibold">{label} {required ? <span className="text-red-500">*</span> : null}</span><select value={value} onChange={(event) => onChange(event.target.value)} className={`flex h-11 w-full items-center justify-between rounded-md border bg-white px-3 text-sm outline-none ${error ? "border-rose-400 ring-4 ring-rose-50" : "border-[#cfdbea] focus-within:border-[#1688f9]"} ${value ? "" : "text-[#6d7890]"}`}>{!value ? <option value="" disabled>{placeholder}</option> : null}{AIRLINES.map((airline) => <option key={airline} value={airline}>{airline}</option>)}</select>{error ? <span className="mt-1.5 block text-[13px] font-medium text-rose-600">{error}</span> : null}</label>;
}

function PhoneInput({ value, onChange, error }: { value: string; onChange: (value: string) => void; error?: string }) {
  return <label className="block"><span className="mb-2 block text-sm font-semibold">WhatsApp Number <span className="text-red-500">*</span></span><span className={`flex h-11 overflow-hidden rounded-md border bg-white ${error ? "border-rose-400 ring-4 ring-rose-50" : "border-[#cfdbea] focus-within:border-[#1688f9] focus-within:ring-4 focus-within:ring-blue-100"}`}><span className="flex items-center gap-2 border-r border-[#cfdbea] px-3 text-sm"><Flag className="h-4 w-4 text-orange-500" />+91</span><input value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 px-3 text-sm outline-none placeholder:text-[#6d7890]" placeholder="98765 43210" /></span>{error ? <span className="mt-1.5 block text-[13px] font-medium text-rose-600">{error}</span> : null}</label>;
}

function Timeline() {
  const items = [
    [Plane, "Booking confirmation\nsent instantly"],
    [CalendarCheck, "Reminders scheduled\nautomatically"],
    [MessageCircle, "Customer receives updates\non WhatsApp"],
    [BarChart3, "Track delivery and status\nin real-time"]
  ] as const;
  return <div className="relative space-y-6 pl-1 before:absolute before:left-[9px] before:top-3 before:h-[152px] before:w-px before:bg-[#b8d7ff]">{items.map(([Icon, text]) => <div key={text} className="relative grid grid-cols-[26px_32px_1fr] items-start gap-3"><span className="relative z-10 mt-1 h-3 w-3 rounded-full bg-[#1688f9]" /><Icon className="h-5 w-5 text-[#1688f9]" /><p className="whitespace-pre-line text-sm leading-5">{text}</p></div>)}</div>;
}