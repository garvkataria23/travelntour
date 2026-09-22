"use client";

import Link from "next/link";
import { AppShell } from "@/components/dashboard/app-shell";
import { StatCard } from "@/components/dashboard/ui";
import { useApi } from "@/lib/hooks";
import { api } from "@/lib/api";
import { CheckCircle2, ChevronRight, Clock3, Edit, HelpCircle, Lightbulb, MoreHorizontal, Plane, Plus, Settings, Trash2, Users, X } from "lucide-react";
import { FormEvent, useState } from "react";

interface AutomationRule {
  id: string;
  name: string;
  description: string | null;
  triggerType: string;
  messageType: string;
  offsetMinutes: number;
  active: boolean;
  template: { id: string; name: string; content: string; whatsappTemplateName: string | null } | null;
}

interface RulesResponse {
  items: AutomationRule[];
  stats: { activeRules: number; inactiveRules: number; messagesSent: number; successRate: number; failed: number };
}

interface TemplatePick {
  id: string;
  name: string;
  content: string;
  status: string;
}

interface TemplatePickList {
  items: TemplatePick[];
}

const TYPE_LABELS: Record<string, string> = {
  BOOKING_CONFIRMATION: "Booking Confirmation",
  REMINDER_48H: "48h Reminder",
  REMINDER_24H: "24h Reminder",
  JOURNEY_DAY: "Journey Day Reminder",
  BOOKING_CANCELLATION: "Booking Cancellation",
  CUSTOM: "Custom Message",
};

const TONE_LABELS: Record<string, string> = {
  BOOKING_CONFIRMATION: "green",
  REMINDER_48H: "blue",
  REMINDER_24H: "purple",
  JOURNEY_DAY: "orange",
  BOOKING_CANCELLATION: "rose",
  CUSTOM: "blue",
};

const TRIGGER_OPTIONS = [
  { value: "BOOKING_CREATED", label: "When booking created" },
  { value: "JOURNEY_DATE", label: "Based on journey date" },
  { value: "BOOKING_CANCELLED", label: "When booking cancelled" },
];

const MESSAGE_TYPE_OPTIONS = [
  { value: "BOOKING_CONFIRMATION", label: "Booking Confirmation" },
  { value: "REMINDER_48H", label: "48h Reminder" },
  { value: "REMINDER_24H", label: "24h Reminder" },
  { value: "JOURNEY_DAY", label: "Journey Day Reminder" },
  { value: "BOOKING_CANCELLATION", label: "Booking Cancellation" },
  { value: "CUSTOM", label: "Custom Message" },
];

function triggerLabel(triggerType: string): string {
  return TRIGGER_OPTIONS.find((t) => t.value === triggerType)?.label ?? triggerType;
}

function offsetLabel(offsetMinutes: number): string {
  if (offsetMinutes === 0) return "Immediately";
  const abs = Math.abs(offsetMinutes);
  const when = offsetMinutes > 0 ? "after" : "before";
  if (abs % 1440 === 0) {
    const days = Math.round(abs / 1440);
    return `${days} day${days === 1 ? "" : "s"} ${when}`;
  }
  const hours = Math.round(abs / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ${when}`;
}

function ruleBody(rule: AutomationRule): string {
  if (rule.description) return rule.description;
  const label = (TYPE_LABELS[rule.messageType] ?? rule.messageType).toLowerCase();
  if (rule.offsetMinutes === 0) return `Send ${label} immediately.`;
  return `Send ${label} ${offsetLabel(rule.offsetMinutes)}.`;
}

function XIcon() { return <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-current text-xl font-bold">×</span>; }

export default function AutomationPage() {
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editRule, setEditRule] = useState<AutomationRule | null>(null);
  const [deleteRule, setDeleteRule] = useState<AutomationRule | null>(null);
  const [menuRow, setMenuRow] = useState<string | null>(null);
  const rules = useApi<RulesResponse>("/automation/rules");

  const stats = rules.data?.stats;

  const statCards = [
    { title: "Active Rules", value: stats ? String(stats.activeRules) : "—", icon: Settings, tone: "green", delta: "Automated messaging enabled", sub: "" },
    { title: "Messages Sent", value: stats ? String(stats.messagesSent) : "—", icon: Clock3, tone: "blue", delta: "This month", sub: "" },
    { title: "Success Rate", value: stats ? `${stats.successRate}%` : "—", icon: Users, tone: "purple", delta: "Messages delivered", sub: "" },
    { title: "Inactive Rules", value: stats ? String(stats.inactiveRules) : "—", icon: Clock3, tone: "orange", delta: "Not sending messages", sub: "" },
  ];

  const isActive = (rule: AutomationRule) => pending[rule.id] ?? rule.active;

  async function toggleRule(rule: AutomationRule) {
    setActionError("");
    const next = !isActive(rule);
    setPending((current) => ({ ...current, [rule.id]: next }));
    try {
      await api(`/automation/rules/${rule.id}/toggle`, { method: "POST" });
      rules.refetch();
      setPending((current) => { const rest = { ...current }; delete rest[rule.id]; return rest; });
    } catch (err) {
      setPending((current) => { const rest = { ...current }; delete rest[rule.id]; return rest; });
      setActionError(err instanceof Error ? err.message : "Unable to toggle rule");
    }
  }

  const ruleItems = (rules.data?.items ?? [])
    .filter((rule) => (tab === "all" ? true : tab === "active" ? rule.active : !rule.active))
    .map((rule) => ({ rule, tone: TONE_LABELS[rule.messageType] ?? "blue" }));

  const tabCount = (which: string) => which === "all" ? (rules.data?.items.length ?? "—") : which === "active" ? (stats?.activeRules ?? "—") : (stats?.inactiveRules ?? "—");

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex flex-col justify-between gap-4 pt-2 sm:flex-row sm:items-start">
          <div><h1 className="text-[34px] font-extrabold tracking-[-0.04em]">Automation</h1><p className="text-base text-[#596782]">Set up and manage automatic WhatsApp messages for your bookings.</p></div>
          <button onClick={() => setCreateOpen(true)} className="flex h-[50px] items-center gap-3 rounded-lg bg-[#1688f9] px-7 font-bold text-white"><Plus className="h-5 w-5" />Create New Rule</button>
        </div>
        {rules.error ? <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{rules.error}</p> : null}
        {actionError ? <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{actionError}</p> : null}
        {notice ? <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p> : null}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{statCards.map((stat) => <StatCard key={stat.title} {...stat} />)}</div>
        <div className="grid gap-4 xl:grid-cols-[1fr_275px]">
          <section>
            <div className="mb-4 flex gap-8 border-b border-[#d6e1ef]">
              {["all", "active", "inactive"].map((t) => <button key={t} onClick={() => setTab(t)} className={`px-6 py-3 capitalize ${tab === t ? "border-b-2 border-[#1688f9] font-bold text-[#087df0]" : "text-[#596782]"}`}>{t} ({tabCount(t)})</button>)}
            </div>
            {rules.loading && ruleItems.length === 0 ? <p className="rounded-lg bg-white px-4 py-8 text-center text-[#596782]">Loading rules...</p> : null}
            {!rules.loading && ruleItems.length === 0 ? <p className="rounded-lg bg-white px-4 py-8 text-center text-[#596782]">No automation rules found.</p> : null}
            <div className="space-y-2">{ruleItems.map(({ rule, tone }) => <article key={rule.id} className="grid gap-4 rounded-xl border border-[#dce7f4] bg-white p-4 shadow-sm lg:grid-cols-[1fr_300px_138px]">
              <div className="flex gap-5">
                <span className={`grid h-16 w-16 shrink-0 place-items-center rounded-full ${tone === "green" ? "bg-green-100 text-green-600" : tone === "blue" ? "bg-blue-100 text-blue-600" : tone === "purple" ? "bg-purple-100 text-purple-600" : tone === "orange" ? "bg-orange-100 text-orange-500" : "bg-rose-100 text-rose-500"}`}>{rule.messageType === "BOOKING_CONFIRMATION" ? <Plane className="h-8 w-8" /> : rule.messageType === "BOOKING_CANCELLATION" ? <XIcon /> : <Settings className="h-8 w-8" />}</span>
                <div><h2 className="text-lg font-extrabold">{rule.name} <span className={`ml-2 rounded-full px-3 py-1 text-sm ${isActive(rule) ? "bg-[#d9f7e8] text-[#00a451]" : "bg-[#e8edf5] text-[#596782]"}`}>{isActive(rule) ? "Active" : "Inactive"}</span></h2><p className="mt-1 text-[#596782]">{ruleBody(rule)}</p><div className="mt-3 flex flex-wrap gap-2">{[triggerLabel(rule.triggerType), `Template: ${rule.template?.name ?? "—"}`].map((chip) => <span key={chip} className="rounded-full bg-[#e9eff8] px-3 py-1 text-sm font-medium text-[#31415f]">{chip}</span>)}</div></div>
              </div>
              <div className="rounded-lg border border-[#dce7f4] bg-[#f6faff] p-3 text-sm whitespace-pre-line">{rule.template?.content ?? ""}<Link href="/message-templates" className="mt-2 block text-right font-bold text-[#087df0]">View Template →</Link></div>
              <div className="flex items-start justify-between gap-3 lg:flex-col lg:items-center">
                <button onClick={() => toggleRule(rule)} disabled={pending[rule.id] !== undefined} aria-label="Toggle rule" className={`relative h-7 w-14 rounded-full transition ${isActive(rule) ? "bg-[#17bf6b]" : "bg-[#b8c4d8]"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${isActive(rule) ? "left-8" : "left-1"}`} /></button>
                <div className="relative">
                  <button onClick={() => setMenuRow(menuRow === rule.id ? null : rule.id)} className="grid h-9 w-11 place-items-center rounded-lg border border-[#d6e1ef]"><MoreHorizontal className="h-4 w-4" /></button>
                  {menuRow === rule.id ? <><div className="fixed inset-0 z-10" onClick={() => setMenuRow(null)} /><div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-[#d6e1ef] bg-white py-1 shadow-lg"><button onClick={() => { setMenuRow(null); setEditRule(rule); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-blue-50"><Edit className="h-4 w-4" /> Edit rule</button><button onClick={() => { setMenuRow(null); setDeleteRule(rule); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /> Delete rule</button></div></> : null}
                </div>
              </div>
            </article>)}</div>
          </section>
          <aside className="space-y-4">
            <div className="rounded-xl border border-[#dce7f4] bg-white p-5 shadow-sm"><h2 className="mb-5 flex items-center gap-3 text-lg font-extrabold"><Settings className="h-6 w-6 text-[#087df0]" />How Automation Works</h2><div className="space-y-5">{["Create a booking|Enter customer and flight details", "Rules are triggered|System checks active automation rules", "Messages are scheduled|Messages are queued at the right time", "Customer receives messages|Automatic WhatsApp updates"].map((s, i) => { const [a, b] = s.split("|"); return <div key={a} className="flex gap-4"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#1688f9] text-sm font-bold text-white">{i + 1}</span><p><b>{a}</b><br /><span className="text-sm text-[#596782]">{b}</span></p></div>; })}<div className="mt-6 rounded-lg bg-[#e8f9ef] p-4"><p className="font-bold text-[#00a451]"><CheckCircle2 className="mr-2 inline h-5 w-5" />Fully Automated</p><p className="mt-1 text-sm text-[#596782]">Once you create a booking, the system handles the rest!</p></div></div></div>
            <div className="rounded-xl border border-[#dce7f4] bg-white p-5 shadow-sm"><h2 className="mb-4 flex items-center gap-3 text-lg font-extrabold"><HelpCircle className="h-6 w-6 text-[#087df0]" />Need Help?</h2>
              <Link href="/message-templates" className="flex items-center justify-between py-3 text-sm text-[#31415f]">Create message templates<ChevronRight className="h-4 w-4" /></Link>
              <Link href="/whatsapp-messages" className="flex items-center justify-between py-3 text-sm text-[#31415f]">Track sent messages and delivery status<ChevronRight className="h-4 w-4" /></Link>
              <Link href="/reports" className="flex items-center justify-between py-3 text-sm text-[#31415f]">View booking reports<ChevronRight className="h-4 w-4" /></Link>
              <Link href="/customers" className="flex items-center justify-between py-3 text-sm text-[#31415f]">Manage customers<ChevronRight className="h-4 w-4" /></Link>
            </div>
            <div className="rounded-xl bg-gradient-to-br from-purple-50 to-blue-50 p-5"><p className="font-bold text-purple-700"><Lightbulb className="mr-2 inline h-6 w-6" />Pro Tip</p><p className="mt-2 text-sm text-[#596782]">Use template variables like {'{{customer_name}}'}, {'{{pnr}}'}, {'{{flight_number}}'} to personalize messages automatically.</p></div>
          </aside>
        </div>
      </div>

      {createOpen ? <RuleFormModal mode="create" rule={null} onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); rules.refetch(); setNotice("Automation rule created."); }} /> : null}
      {editRule ? <RuleFormModal mode="edit" rule={editRule} onClose={() => setEditRule(null)} onSaved={() => { setEditRule(null); rules.refetch(); setNotice("Automation rule updated."); }} /> : null}
      {deleteRule ? <DeleteRuleDialog rule={deleteRule} onClose={() => setDeleteRule(null)} onDeleted={() => { setDeleteRule(null); rules.refetch(); setNotice("Automation rule deleted."); }} /> : null}
    </AppShell>
  );
}

function parseOffset(offsetMinutes: number): { dir: "before" | "after"; unit: "minutes" | "hours" | "days"; value: string } {
  const abs = Math.abs(offsetMinutes);
  const dir: "before" | "after" = offsetMinutes < 0 ? "before" : "after";
  if (abs > 0 && abs % 1440 === 0) return { dir, unit: "days", value: String(abs / 1440) };
  if (abs > 0 && abs % 60 === 0) return { dir, unit: "hours", value: String(abs / 60) };
  return { dir, unit: "minutes", value: String(abs) };
}

function RuleFormModal({ mode, rule, onClose, onSaved }: { mode: "create" | "edit"; rule: AutomationRule | null; onClose: () => void; onSaved: () => void }) {
  const templates = useApi<TemplatePickList>("/templates?limit=200");
  const initial = parseOffset(rule?.offsetMinutes ?? 0);
  const [form, setForm] = useState({
    name: rule?.name ?? "",
    description: rule?.description ?? "",
    triggerType: rule?.triggerType ?? "BOOKING_CREATED",
    messageType: rule?.messageType ?? "BOOKING_CONFIRMATION",
    templateId: rule?.template?.id ?? "",
    active: rule?.active ?? true,
    offsetDir: initial.dir,
    offsetUnit: initial.unit,
    offsetValue: initial.value,
  });
  const [mError, setMError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedTemplate = (templates.data?.items ?? []).find((t) => t.id === form.templateId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMError("");
    if (!form.name.trim()) { setMError("Rule name is required."); return; }
    if (!form.templateId) { setMError("Select a message template."); return; }
    const value = Number(form.offsetValue) || 0;
    const mult = form.offsetUnit === "days" ? 1440 : form.offsetUnit === "hours" ? 60 : 1;
    const offsetMinutesValue = (form.offsetDir === "before" ? -1 : 1) * value * mult;
    setSubmitting(true);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        triggerType: form.triggerType,
        messageType: form.messageType,
        templateId: form.templateId,
        offsetMinutes: offsetMinutesValue,
        active: form.active,
      };
      if (mode === "edit") {
        await api(`/automation/rules/${rule?.id}`, { method: "PATCH", body });
      } else {
        await api("/automation/rules", { method: "POST", body });
      }
      onSaved();
    } catch (err) {
      setMError(err instanceof Error ? err.message : "Unable to save rule");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-extrabold">{mode === "edit" ? "Edit Automation Rule" : "Create Automation Rule"}</h2><button onClick={onClose} aria-label="Close"><X className="h-5 w-5 text-[#596782]" /></button></div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <RuleField label="Rule Name" required>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. 24 Hour Reminder" className="h-11 w-full rounded-md border border-[#cfdbea] px-3 text-sm outline-none focus:border-[#1688f9]" />
          </RuleField>
          <RuleField label="Trigger">
            <select value={form.triggerType} onChange={(e) => setForm((f) => ({ ...f, triggerType: e.target.value }))} className="h-11 w-full rounded-md border border-[#cfdbea] px-3 text-sm outline-none focus:border-[#1688f9]">{TRIGGER_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
          </RuleField>
          <RuleField label="Message Type">
            <select value={form.messageType} onChange={(e) => setForm((f) => ({ ...f, messageType: e.target.value }))} className="h-11 w-full rounded-md border border-[#cfdbea] px-3 text-sm outline-none focus:border-[#1688f9]">{MESSAGE_TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
          </RuleField>
          <RuleField label="Send Time">
            <div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-2">
              <select value={form.offsetDir} onChange={(e) => setForm((f) => ({ ...f, offsetDir: e.target.value as "before" | "after" }))} className="h-11 rounded-md border border-[#cfdbea] px-3 text-sm outline-none focus:border-[#1688f9]"><option value="after">After</option><option value="before">Before</option></select>
              <input type="number" min={0} value={form.offsetValue} onChange={(e) => setForm((f) => ({ ...f, offsetValue: e.target.value }))} className="h-11 rounded-md border border-[#cfdbea] px-3 text-sm outline-none focus:border-[#1688f9]" placeholder="0" />
              <select value={form.offsetUnit} onChange={(e) => setForm((f) => ({ ...f, offsetUnit: e.target.value as "minutes" | "hours" | "days" }))} className="h-11 rounded-md border border-[#cfdbea] px-3 text-sm outline-none focus:border-[#1688f9]"><option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option></select>
              <button type="button" onClick={() => setForm((f) => ({ ...f, offsetValue: "0", offsetDir: "after" }))} className="h-11 rounded-md border border-[#cfdbea] text-sm font-semibold">Immediately</button>
            </div>
            <p className="mt-1.5 text-xs text-[#596782]">Negative (Before) = relative to departure date, e.g. 2 days before.</p>
          </RuleField>
          <RuleField label="Message Template" required>
            <select value={form.templateId} onChange={(e) => setForm((f) => ({ ...f, templateId: e.target.value }))} className="h-11 w-full rounded-md border border-[#cfdbea] px-3 text-sm outline-none focus:border-[#1688f9]"><option value="">{templates.loading ? "Loading templates..." : "Select a template..."}</option>{(templates.data?.items ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            {selectedTemplate ? <div className="mt-2 rounded-lg border border-[#dce7f4] bg-[#f6faff] p-3 text-sm whitespace-pre-line">{selectedTemplate.content}</div> : null}
          </RuleField>
          <label className="flex items-center justify-between rounded-lg bg-[#f1f7ff] p-4"><span className="text-sm font-semibold">Rule active</span><button type="button" role="switch" aria-checked={form.active} onClick={() => setForm((f) => ({ ...f, active: !f.active }))} className={`relative h-7 w-14 rounded-full transition ${form.active ? "bg-[#17bf6b]" : "bg-[#b8c4d8]"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${form.active ? "left-8" : "left-1"}`} /></button></label>
          {mError ? <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{mError}</p> : null}
          <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={onClose} className="rounded-lg border border-[#d6e1ef] px-6 py-2.5 font-semibold">Cancel</button><button disabled={submitting} className="rounded-lg bg-[#1688f9] px-6 py-2.5 font-bold text-white disabled:opacity-60">{submitting ? "Saving..." : mode === "edit" ? "Save Changes" : "Create Rule"}</button></div>
        </form>
      </div>
    </div>
  );
}

function RuleField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-sm font-semibold">{label} {required ? <span className="text-red-500">*</span> : null}</span>{children}</label>;
}

function DeleteRuleDialog({ rule, onClose, onDeleted }: { rule: AutomationRule; onClose: () => void; onDeleted: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [dError, setDError] = useState("");

  async function handleDelete() {
    setSubmitting(true);
    setDError("");
    try {
      await api(`/automation/rules/${rule.id}`, { method: "DELETE" });
      onDeleted();
    } catch (err) {
      setDError(err instanceof Error ? err.message : "Unable to delete rule");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-rose-100 text-rose-600"><Trash2 className="h-5 w-5" /></div>
        <h2 className="text-lg font-extrabold">Delete automation rule?</h2>
        <p className="mt-1 text-sm text-[#596782]">This will remove <b>{rule.name}</b>. Scheduled messages already queued are not affected.</p>
        {dError ? <p className="mt-3 rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{dError}</p> : null}
        <div className="mt-5 flex justify-end gap-3"><button onClick={onClose} className="rounded-lg border border-[#d6e1ef] px-6 py-2.5 font-semibold">Cancel</button><button onClick={handleDelete} disabled={submitting} className="rounded-lg bg-rose-600 px-6 py-2.5 font-bold text-white disabled:opacity-60">{submitting ? "Deleting..." : "Delete"}</button></div>
      </div>
    </div>
  );
}