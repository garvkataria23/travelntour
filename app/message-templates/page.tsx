"use client";

import { AppShell } from "@/components/dashboard/app-shell";
import { Pagination, StatCard } from "@/components/dashboard/ui";
import { useApi } from "@/lib/hooks";
import { api, formatDate } from "@/lib/api";
import { BarChart3, Clock3, Edit, Eye, FileText, MessageCircle, MoreHorizontal, Plus, Search, Send, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface TemplateMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TemplateItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  content: string;
  status: string;
  whatsappTemplateName?: string | null;
  language?: string | null;
  updatedAt: string;
  variables?: string[];
  _count?: { messages: number };
}

interface TemplateList {
  items: TemplateItem[];
  stats: { activeTemplates: number; draftTemplates: number; messagesSent: number; deliveryRate: number };
  meta: TemplateMeta;
}

interface CustomerItem {
  id: string;
  name: string;
  phone: string;
}

interface CustomerList {
  items: CustomerItem[];
}

const CATEGORY_ICON: Record<string, string> = {
  BOOKING: "✈️",
  REMINDER: "◷",
  FEEDBACK: "👍",
  MARKETING: "🎁",
  GENERAL: "▤",
};

const CATEGORY_LABELS: Record<string, string> = {
  BOOKING: "Booking",
  REMINDER: "Reminder",
  FEEDBACK: "Feedback",
  MARKETING: "Marketing",
  GENERAL: "General",
};

const CATEGORY_OPTIONS = ["BOOKING", "REMINDER", "FEEDBACK", "MARKETING", "GENERAL"];

const STATUS_OPTIONS = ["ACTIVE", "DRAFT", "PENDING", "APPROVED", "REJECTED"];

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  DRAFT: "Draft",
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

const STATUS_PILL: Record<string, string> = {
  ACTIVE: "bg-[#d9f7e8] text-[#00a451]",
  DRAFT: "bg-[#e8edf5] text-[#596782]",
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-blue-100 text-blue-700",
  REJECTED: "bg-rose-100 text-rose-600",
};

const SAMPLE_VALUES: Record<string, string> = {
  customer_name: "Rahul Sharma",
  pnr: "ABC123",
  reference_number: "REF-456789",
  flight_number: "AI-202",
  airline: "Air India",
  from: "Mumbai",
  from_airport: "BOM",
  from_city: "Mumbai",
  to: "Delhi",
  to_airport: "DEL",
  to_city: "Delhi",
  date: "28 Sep 2026",
  time: "10:30 AM",
  journey_date: "28 Sep 2026",
  journey_time: "10:30 AM",
  terminal: "T2",
  amount: "₹12,450",
  currency: "INR",
  airport_from: "Chhatrapati Shivaji Maharaj Intl (BOM)",
  airport_to: "Indira Gandhi Intl (DEL)",
};

function extractVariables(content: string): string[] {
  const found = new Set<string>();
  for (const m of content.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)) {
    found.add(String(m[1]).toLowerCase());
  }
  return [...found];
}

function renderPreview(content: string, extra?: Record<string, string>): string {
  return content.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (match, raw: string) => {
    const name = String(raw).toLowerCase();
    if (extra && extra[name]) return extra[name];
    return SAMPLE_VALUES[name] ?? match;
  });
}

export default function MessageTemplatesPage() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [categorySel, setCategorySel] = useState("");
  const [statusSel, setStatusSel] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateItem | null>(null);
  const [viewing, setViewing] = useState<TemplateItem | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TemplateItem | null>(null);
  const [testOpen, setTestOpen] = useState<TemplateItem | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [asideTab, setAsideTab] = useState<"preview" | "variables">("preview");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (query) p.set("search", query);
    if (categorySel) p.set("category", categorySel);
    if (statusSel) p.set("status", statusSel);
    p.set("page", String(page));
    p.set("limit", "20");
    return p;
  }, [query, categorySel, statusSel, page]);

  const list = useApi<TemplateList>(`/templates?${params.toString()}`);
  const customers = useApi<CustomerList>("/customers?limit=200");

  const items = list.data?.items ?? [];
  const meta = list.data?.meta;

  const selected = items.find((t) => t.id === selectedId) ?? items[0] ?? null;
  const asideVars = useMemo(() => selected ? (selected.variables?.length ? selected.variables : extractVariables(selected.content)) : [], [selected]);

  useEffect(() => {
    if (items.length && !items.find((t) => t.id === selectedId)) {
      setSelectedId(items[0].id);
    }
  }, [items, selectedId]);

  function showNotice(msg: string) {
    setNotice(msg);
    window.setTimeout(() => setNotice(""), 4000);
  }

  function closeFilter() {
    setSearch("");
    setQuery("");
    setCategorySel("");
    setStatusSel("");
    setPage(1);
  }

  async function applyStatus(template: TemplateItem, target: string) {
    setActionError("");
    try {
      await api(`/templates/${template.id}/status/${target}`, { method: "PATCH" });
      list.refetch();
      showNotice(`${template.name} → ${STATUS_LABELS[target] ?? target}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to update template status");
    }
  }

  async function onDelete() {
    if (!confirmDelete) return;
    setActionError("");
    try {
      await api(`/templates/${confirmDelete.id}`, { method: "DELETE" });
      if (selectedId === confirmDelete.id) setSelectedId(null);
      setConfirmDelete(null);
      list.refetch();
      showNotice(`${confirmDelete.name} deleted`);
    } catch (err) {
      setConfirmDelete(null);
      setActionError(err instanceof Error ? err.message : "Unable to delete template");
    }
  }

  async function onSave(payload: { name: string; description?: string; category?: string; content: string; whatsappTemplateName?: string; language?: string; status?: string }) {
    setActionError("");
    try {
      if (editing) {
        await api(`/templates/${editing.id}`, { method: "PATCH", body: payload });
        showNotice(`${payload.name} updated`);
      } else {
        await api("/templates", { method: "POST", body: payload });
        showNotice(`${payload.name} created`);
      }
      setCreateOpen(false);
      setEditing(null);
      list.refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to save template");
      throw err;
    }
  }

  const stats = list.data?.stats;
  const statCards = [
    { title: "Active Templates", value: stats ? String(stats.activeTemplates) : "—", icon: MessageCircle, tone: "green", delta: "", sub: "" },
    { title: "Draft Templates", value: stats ? String(stats.draftTemplates) : "—", icon: FileText, tone: "purple", delta: "", sub: "" },
    { title: "Messages Sent", value: stats ? String(stats.messagesSent) : "—", icon: Clock3, tone: "orange", delta: "", sub: "" },
    { title: "Delivery Rate", value: stats ? `${stats.deliveryRate}%` : "—", icon: BarChart3, tone: "blue", delta: "", sub: "" },
  ];

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex flex-col justify-between gap-4 pt-2 sm:flex-row sm:items-start">
          <div>
            <h1 className="text-[34px] font-extrabold tracking-[-0.04em]">Message Templates</h1>
            <p className="text-base text-[#596782]">Create and manage your WhatsApp message templates. Use variables to personalize messages automatically.</p>
          </div>
          <button onClick={() => { setEditing(null); setCreateOpen(true); }} className="flex h-[50px] items-center gap-3 rounded-lg bg-[#1688f9] px-7 font-bold text-white"><Plus className="h-5 w-5" />Create Template</button>
        </div>

        {list.error ? <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{list.error}</p> : null}
        {actionError ? <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{actionError}</p> : null}
        {notice ? <p className="rounded-lg bg-[#e9fbf1] px-4 py-3 text-sm font-medium text-[#00a451]">{notice}</p> : null}

        <div className="grid gap-3 xl:grid-cols-[1fr_335px]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{statCards.map((stat) => <StatCard key={stat.title} {...stat} />)}</div>
            <section className="overflow-hidden rounded-xl border border-[#dce7f4] bg-white shadow-sm">
              <div className="grid gap-3 p-3 md:grid-cols-[1.5fr_.7fr_.7fr_.42fr_.45fr] md:items-center">
                <div className="flex h-11 items-center gap-3 rounded-lg border border-[#d6e1ef] px-3"><Search className="h-5 w-5 text-[#405174]" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 outline-none" placeholder="Search templates..." /></div>
                <select value={categorySel} onChange={(event) => { setCategorySel(event.target.value); setPage(1); }} className="h-11 rounded-lg border border-[#d6e1ef] bg-white px-3 text-sm text-[#405174] outline-none">
                  <option value="">All Categories</option>
                  {CATEGORY_OPTIONS.map((cat) => <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>)}
                </select>
                <select value={statusSel} onChange={(event) => { setStatusSel(event.target.value); setPage(1); }} className="h-11 rounded-lg border border-[#d6e1ef] bg-white px-3 text-sm text-[#405174] outline-none">
                  <option value="">All Status</option>
                  {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
                </select>
                <button onClick={closeFilter} className="h-11 rounded-lg border border-[#d6e1ef] font-semibold text-[#405174]">Reset</button>
                <button onClick={() => { setEditing(null); setCreateOpen(true); }} className="flex h-11 items-center justify-center gap-2 rounded-lg bg-[#1688f9] font-bold text-white"><Plus className="h-4 w-4" />New</button>
              </div>
              <div className="overflow-x-auto"><table className="w-full min-w-[830px] text-left text-sm"><thead className="bg-[#f4f7fb]"><tr><th>Template Name</th><th>Category</th><th>Status</th><th>Last Updated</th><th>Messages Sent</th><th>Actions</th></tr></thead><tbody className="divide-y divide-[#e5edf6]">
                {list.loading && items.length === 0 ? <tr><td colSpan={6} className="px-5 py-8 text-center text-[#596782]">Loading templates...</td></tr> : null}
                {!list.loading && items.length === 0 ? <tr><td colSpan={6} className="px-5 py-8 text-center text-[#596782]">No templates found.</td></tr> : null}
                {items.map((t) => (
                  <tr key={t.id} onClick={() => setSelectedId(t.id)} className={`cursor-pointer hover:bg-blue-50/30 ${selectedId === t.id ? "bg-blue-50/50" : ""}`}>
                    <td><div className="flex items-center gap-3"><span className={`grid h-11 w-11 place-items-center rounded-xl text-lg ${CATEGORY_TONE(t.category)}`}>{CATEGORY_ICON[t.category] ?? "▤"}</span><div><b>{t.name}</b><div className="max-w-[220px] truncate text-[#526282]">{t.description || (t.content.length > 50 ? `${t.content.slice(0, 50)}…` : t.content)}</div></div></div></td>
                    <td><CategoryPill value={CATEGORY_LABELS[t.category] ?? t.category} /></td>
                    <td><StatusPill value={t.status} onToggle={t.status === "ACTIVE" || t.status === "DRAFT" ? () => applyStatus(t, t.status === "ACTIVE" ? "DRAFT" : "ACTIVE") : undefined} /></td>
                    <td>{formatDate(t.updatedAt)}</td>
                    <td>{String(t._count?.messages ?? 0)}</td>
                    <td>
                      <div className="flex gap-3">
                        <button onClick={() => setViewing(t)} className="grid h-10 w-10 place-items-center rounded-lg border border-[#d4dfed]" title="Preview"><Eye className="h-4 w-4" /></button>
                        <button onClick={() => { setEditing(t); setCreateOpen(true); }} className="grid h-10 w-10 place-items-center rounded-lg border border-[#d4dfed]" title="Edit"><Edit className="h-4 w-4" /></button>
                        <div className="relative">
                          <button onClick={() => setMenuId(menuId === t.id ? null : t.id)} className="grid h-10 w-10 place-items-center rounded-lg border border-[#d4dfed]" title="More"><MoreHorizontal className="h-4 w-4" /></button>
                          {menuId === t.id ? (
                            <div className="absolute right-0 top-11 z-20 w-44 overflow-hidden rounded-lg border border-[#dce7f4] bg-white py-1 text-left shadow-lg">
                              <button onClick={() => { setMenuId(null); setViewing(t); }} className="flex w-full items-center gap-2 px-4 py-2 hover:bg-[#f4f7fb]"><Eye className="h-4 w-4 text-[#405174]" />Preview</button>
                              <button onClick={() => { setMenuId(null); setEditing(t); setCreateOpen(true); }} className="flex w-full items-center gap-2 px-4 py-2 hover:bg-[#f4f7fb]"><Edit className="h-4 w-4 text-[#405174]" />Edit</button>
                              <button onClick={() => { setMenuId(null); applyStatus(t, t.status === "ACTIVE" ? "DRAFT" : "ACTIVE"); }} className="flex w-full items-center gap-2 px-4 py-2 hover:bg-[#f4f7fb]"><MessageCircle className="h-4 w-4 text-[#405174]" />{t.status === "ACTIVE" ? "Set to Draft" : "Set Active"}</button>
                              <button onClick={() => { setMenuId(null); setConfirmDelete(t); }} className="flex w-full items-center gap-2 px-4 py-2 text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" />Delete</button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody></table></div>
              {meta ? <div className="border-t border-[#e5edf6] px-5 py-5"><Pagination total={meta.total} page={meta.page} limit={meta.limit} onPageChange={setPage} /></div> : null}
            </section>
          </div>

          <aside className="h-fit rounded-xl border border-[#dce7f4] bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-extrabold">Template Preview</h2>{selected ? <StatusPill value={selected.status} /> : <span className="rounded-full bg-[#e8edf5] px-3 py-1 text-sm font-bold text-[#596782]">—</span>}</div>
            {selected ? (
              <>
                <select value={selected.id} onChange={(event) => setSelectedId(event.target.value)} className="mb-4 flex h-10 w-full items-center rounded-lg border border-[#d6e1ef] bg-white px-3 text-sm outline-none">{items.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                <div className="mb-2 rounded-lg bg-[#f8fbff] p-4">
                  <div>
                    <div className="mb-2 flex items-center gap-2 text-sm font-bold text-[#405174]">{selected.description || "Preview"}</div>
                    <span className="text-xs text-[#596782]">Updated {formatDate(selected.updatedAt)} · {String(selected._count?.messages ?? 0)} sent</span>
                  </div>
                  <div className="mt-3 flex border-b border-[#d6e1ef]">
                    <button onClick={() => setAsideTab("preview")} className={`${asideTab === "preview" ? "border-b-2 border-[#1688f9] font-bold text-[#087df0]" : "text-[#596782]"} px-3 py-3`}>Preview</button>
                    <button onClick={() => setAsideTab("variables")} className={`${asideTab === "variables" ? "border-b-2 border-[#1688f9] font-bold text-[#087df0]" : "text-[#596782]"} px-3 py-3`}>Variables</button>
                  </div>
                  <div className="bg-[#f8fbff] p-4">
                    {asideTab === "preview" ? <div className="rounded-xl bg-[#d9ffd0] p-5 shadow-sm"><p className="whitespace-pre-wrap break-words">{renderPreview(selected.content)}</p><div className="mt-2 text-right text-sm text-[#596782]">10:32 AM ✓✓</div></div>
                    : asideVars.length ? <div className="flex flex-wrap gap-2">{asideVars.map((v) => <span key={v} className="rounded-md bg-[#e0efff] px-3 py-1 text-sm font-bold text-[#087df0]">{v}</span>)}</div>
                    : <p className="py-4 text-center text-sm text-[#596782]">No variables used</p>}
                  </div>
                </div>
                <button onClick={() => { setEditing(selected); setCreateOpen(true); }} className="mt-3 flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-[#1688f9] font-bold text-[#071333]"><Edit className="h-5 w-5 text-[#087df0]" />Edit Template</button>
                <button onClick={() => setTestOpen(selected)} className="mt-3 flex h-12 w-full items-center justify-center gap-3 rounded-lg bg-[#1688f9] font-bold text-white"><Send className="h-5 w-5" />Send Test Message</button>
              </>
            ) : <p className="py-8 text-center text-sm text-[#596782]">No template selected</p>}
          </aside>
        </div>
      </div>

      {createOpen ? <TemplateModal template={editing} onClose={() => { setCreateOpen(false); setEditing(null); }} onSave={onSave} /> : null}
      {viewing ? <PreviewModal template={viewing} onClose={() => setViewing(null)} onEdit={(t) => { setViewing(null); setEditing(t); setCreateOpen(true); }} onSendTest={(t) => { setViewing(null); setTestOpen(t); }} /> : null}
      {testOpen ? <TestModal template={testOpen} customers={customers.data?.items ?? []} onClose={() => setTestOpen(null)} onDone={(msg) => { setTestOpen(null); showNotice(msg); }} /> : null}
      {confirmDelete ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-extrabold">Delete template?</h3>
            <p className="mt-2 text-sm text-[#596782]">"{confirmDelete.name}" ko permanently delete karein? Isse koi bhi automation rule toot sakta hai.</p>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setConfirmDelete(null)} className="h-11 rounded-lg border border-[#d6e1ef] px-5 font-semibold">Cancel</button>
              <button onClick={onDelete} className="h-11 rounded-lg bg-rose-600 px-5 font-bold text-white">Delete</button>
            </div>
          </div>
        </div>
      ) : null}
      {menuId ? <div className="fixed inset-0 z-10" onClick={() => setMenuId(null)} /> : null}
    </AppShell>
  );
}

function CATEGORY_TONE(category: string): string {
  if (category === "BOOKING") return "bg-blue-100 text-blue-600";
  if (category === "REMINDER") return "bg-purple-100 text-purple-700";
  if (category === "FEEDBACK") return "bg-orange-100 text-orange-500";
  if (category === "MARKETING") return "bg-purple-100 text-purple-700";
  return "bg-slate-100 text-slate-500";
}

function StatusPill({ value, onToggle }: { value: string; onToggle?: () => void }) {
  const cls = STATUS_PILL[value] ?? STATUS_PILL.DRAFT;
  return <button onClick={onToggle} disabled={!onToggle} title={onToggle ? "Click to toggle Active/Draft" : undefined} className={`rounded-md px-3 py-1 text-sm font-bold ${cls}`}>● {STATUS_LABELS[value] ?? value}</button>;
}

function CategoryPill({ value }: { value: string }) {
  const color = value === "Booking" || value === "Reminder" ? "bg-[#e0efff] text-[#087df0]" : value === "Feedback" ? "bg-[#fff0df] text-[#fb8500]" : value === "Marketing" ? "bg-purple-100 text-purple-700" : "bg-[#e8edf5] text-[#596782]";
  return <span className={`rounded-md px-3 py-1 text-sm ${color}`}>{value}</span>;
}

function TemplateModal({ template, onClose, onSave }: { template: TemplateItem | null; onClose: () => void; onSave: (payload: { name: string; description?: string; category?: string; content: string; whatsappTemplateName?: string; language?: string; status?: string }) => Promise<void> }) {
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [category, setCategory] = useState(template?.category ?? "GENERAL");
  const [content, setContent] = useState(template?.content ?? "");
  const [whatsappTemplateName, setWhatsappTemplateName] = useState(template?.whatsappTemplateName ?? "");
  const [language, setLanguage] = useState(template?.language ?? "en");
  const [status, setStatus] = useState(template?.status ?? "DRAFT");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const variables = useMemo(() => extractVariables(content), [content]);
  const preview = useMemo(() => renderPreview(content), [content]);

  async function submit() {
    setError("");
    if (name.trim().length < 2) { setError("Template name min 2 characters"); return; }
    if (!content.trim()) { setError("Template content cannot be empty"); return; }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), description: description.trim() || undefined, category, content: content.trim(), whatsappTemplateName: whatsappTemplateName.trim() || undefined, language: language.trim() || undefined, status });
    } catch {
      /* error surfaced via actionError in parent */
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">{template ? `Edit ${template.name}` : "Create Template"}</h3>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg border border-[#d6e1ef]"><X className="h-4 w-4" /></button>
        </div>
        {error ? <p className="mb-3 rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="text-sm font-semibold text-[#405174]">Name*</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Booking Confirmation" className="mt-1 h-11 w-full rounded-lg border border-[#d6e1ef] px-3 outline-none focus:border-[#1688f9]" /></label>
          <label className="block"><span className="text-sm font-semibold text-[#405174]">Category</span><select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-[#d6e1ef] bg-white px-3 outline-none">{[...CATEGORY_OPTIONS].map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}</select></label>
          <label className="block sm:col-span-2"><span className="text-sm font-semibold text-[#405174]">Description</span><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description of this template" className="mt-1 h-11 w-full rounded-lg border border-[#d6e1ef] px-3 outline-none focus:border-[#1688f9]" /></label>
          <label className="block sm:col-span-2"><span className="text-sm font-semibold text-[#405174]">Content*</span><textarea value={content} onChange={(e) => setContent(e.target.value)} rows={5} placeholder={"Hi {{customer_name}} 👋\n\nYour flight booking has been confirmed! ✈️\n{{pnr}} · {{flight_number}} · {{from}} → {{to}}\nDate: {{date}} at {{time}}"} className="mt-1 w-full rounded-lg border border-[#d6e1ef] p-3 outline-none focus:border-[#1688f9]" /><div className="mt-1 text-xs text-[#596782]">Use {"{{variable}}"} like {"{{customer_name}}, {{pnr}}, {{date}}"}</div></label>
          <label className="block"><span className="text-sm font-semibold text-[#405174]">WhatsApp Template Name</span><input value={whatsappTemplateName} onChange={(e) => setWhatsappTemplateName(e.target.value)} placeholder="Optional (for WhatsApp Business API)" className="mt-1 h-11 w-full rounded-lg border border-[#d6e1ef] px-3 outline-none focus:border-[#1688f9]" /></label>
          <label className="block"><span className="text-sm font-semibold text-[#405174]">Language</span><input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="en" className="mt-1 h-11 w-full rounded-lg border border-[#d6e1ef] px-3 outline-none focus:border-[#1688f9]" /></label>
          <label className="block"><span className="text-sm font-semibold text-[#405174]">Status</span><select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-[#d6e1ef] bg-white px-3 outline-none">{[["DRAFT", "Draft"], ["ACTIVE", "Active"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        </div>
        {variables.length ? <p className="mt-3 rounded-lg bg-[#f4f7fb] px-3 py-2 text-sm text-[#405174]"><b className="font-bold">Extracted variables:</b> {variables.join(", ")}</p> : null}
        <div className="mt-3 rounded-xl bg-[#f8fbff] p-4"><div className="mb-2 text-xs font-bold uppercase tracking-wide text-[#596782]">Live Preview</div><div className="rounded-xl bg-[#d9ffd0] p-5 shadow-sm"><p className="whitespace-pre-wrap break-words">{preview}</p><div className="mt-2 text-right text-sm text-[#596782]">10:32 AM ✓✓</div></div></div>
        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onClose} className="h-11 rounded-lg border border-[#d6e1ef] px-5 font-semibold">Cancel</button>
          <button onClick={submit} disabled={saving} className="h-11 rounded-lg bg-[#1688f9] px-6 font-bold text-white disabled:opacity-60">{saving ? "Saving..." : template ? "Save Changes" : "Create Template"}</button>
        </div>
      </div>
    </div>
  );
}

function PreviewModal({ template, onClose, onEdit, onSendTest }: { template: TemplateItem; onClose: () => void; onEdit: (t: TemplateItem) => void; onSendTest: (t: TemplateItem) => void }) {
  const variables = useMemo(() => template.variables?.length ? template.variables : extractVariables(template.content), [template]);
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-4">
      <div className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div><h3 className="text-lg font-extrabold">{template.name}</h3><p className="text-sm text-[#596782]">{CATEGORY_LABELS[template.category] ?? template.category} · {STATUS_LABELS[template.status] ?? template.status}{template.description ? ` · ${template.description}` : ""} · Sent {String(template._count?.messages ?? 0)}</p></div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg border border-[#d6e1ef]"><X className="h-4 w-4" /></button>
        </div>
        <div className="rounded-xl bg-[#f8fbff] p-4">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-[#596782]">Preview</div>
          <div className="rounded-xl bg-[#d9ffd0] p-5 shadow-sm"><p className="whitespace-pre-wrap break-words">{renderPreview(template.content)}</p><div className="mt-2 text-right text-sm text-[#596782]">10:32 AM ✓✓</div></div>
        </div>
        <div className="mt-3 rounded-xl bg-[#f8fbff] p-4"><div className="mb-2 text-xs font-bold uppercase tracking-wide text-[#596782]">Variables</div>{variables.length ? <div className="flex flex-wrap gap-2">{variables.map((v) => <span key={v} className="rounded-md bg-[#e0efff] px-3 py-1 text-sm font-bold text-[#087df0]">{v}</span>)}</div> : <p className="text-sm text-[#596782]">No variables used</p>}</div>
        <div className="mt-5 flex justify-end gap-3">
          <button onClick={() => onSendTest(template)} className="flex h-11 items-center gap-2 rounded-lg border border-[#1688f9] px-5 font-bold text-[#087df0]"><Send className="h-4 w-4" />Send Test</button>
          <button onClick={() => onEdit(template)} className="flex h-11 items-center gap-2 rounded-lg border border-[#1688f9] px-5 font-bold text-[#087df0]"><Edit className="h-4 w-4" />Edit</button>
          <button onClick={onClose} className="h-11 rounded-lg bg-[#1688f9] px-5 font-bold text-white">Close</button>
        </div>
      </div>
    </div>
  );
}

function TestModal({ template, customers, onClose, onDone }: { template: TemplateItem; customers: CustomerItem[]; onClose: () => void; onDone: (msg: string) => void }) {
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");

  useEffect(() => {
    if (!customerId && customers.length) setCustomerId(customers[0].id);
  }, [customers, customerId]);

  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const customer = customers.find((c) => c.id === customerId);
  const rendered = renderPreview(template.content, customer ? { customer_name: customer.name } : undefined);

  async function send() {
    setError("");
    if (!customerId) { setError("Koi customer select karein"); return; }
    setSending(true);
    try {
      await api("/messages", { method: "POST", body: { customerId, text: rendered } });
      onDone(`Test message sent to ${customer?.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send test message");
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-extrabold">Send Test Message</h3><button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg border border-[#d6e1ef]"><X className="h-4 w-4" /></button></div>
        <p className="mb-3 text-sm text-[#596782]">Template "{template.name}" ko kisi customer ko bhejein — message directly customer ke WhatsApp par jayega.</p>
        {error ? <p className="mb-3 rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p> : null}
        <label className="block"><span className="text-sm font-semibold text-[#405174]">Customer</span><select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-[#d6e1ef] bg-white px-3 outline-none">{customers.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}</select></label>
        <div className="mt-3 rounded-xl bg-[#f8fbff] p-4"><div className="mb-2 text-xs font-bold uppercase tracking-wide text-[#596782]">Will be sent</div><div className="rounded-xl bg-[#d9ffd0] p-5 shadow-sm"><p className="whitespace-pre-wrap break-words">{rendered}</p><div className="mt-2 text-right text-sm text-[#596782]">10:32 AM ✓✓</div></div></div>
        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onClose} className="h-11 rounded-lg border border-[#d6e1ef] px-5 font-semibold">Cancel</button>
          <button onClick={send} disabled={sending} className="flex h-11 items-center gap-2 rounded-lg bg-[#1688f9] px-6 font-bold text-white disabled:opacity-60"><Send className="h-4 w-4" />{sending ? "Sending..." : "Send"}</button>
        </div>
      </div>
    </div>
  );
}