# BlueAura Tourism — Proposal vs Delivered Software Audit

Date: 23 Sep 2026
Source checked: `app/`, `components/`, `backend/src/`, `backend/prisma/schema.prisma`

## Status Legend
- ✅ **Implemented** — feature fully working in UI + backend
- ⚠️ **Partial** — core part working, some promised detail/sub-feature missing
- ❌ **Not implemented** — no code exists for it

---

## Feature-by-Feature Status

| # | Proposal Feature | Status | Details / Evidence |
|---|---|---|---|
| 1 | Dashboard & Business Overview | ✅ | `app/dashboard/page.tsx` + `reports/overview` — bookings, today/upcoming journeys, messages, reminders, revenue, gross/net profit, expense breakdown, recent activity (audit log). Live 30s refresh. |
| 2 | Booking Management | ✅ | Create ✅, view ✅, search/filter ✅ (PNR/status/airline/date), cancel ✅, CSV export ✅, **edit ✅ and reschedule ✅** (Edit modal + Reschedule modal wired into detail modal & row menu, `app/bookings/page.tsx` → `PATCH /bookings/:id` + `POST /bookings/:id/reschedule`) |
| 3 | Customer CRM | ✅ | `app/customers/[id]/page.tsx` — profile, contact, status, member-since, booking list, travel history timeline, message activity, total spent/upcoming trips. List page + add/edit customer present. |
| 4 | Upcoming Journeys | ✅ | `app/upcoming-journeys/page.tsx` — date-based view, calendar with journey marks, today/tomorrow/week/month/custom filters, cancel journey, add booking. |
| 5 | WhatsApp Automation | ✅ | `backend/src/whatsapp/` — automated booking confirmation, 48h/24h reminders, journey-day reminder, cancellation messages; BullMQ queue (`whatsapp-send.worker.ts`), automation recovery worker, webhook handler. |
| 6 | Automation Rules | ✅ | `app/automation/page.tsx` + `automation.service.ts` — triggers (BOOKING_CREATED, JOURNEY_DATE, BOOKING_CANCELLED), offset minutes, active/inactive toggle, template binding, create/edit/delete. |
| 7 | Message Templates | ✅ | `app/message-templates/page.tsx` — create/edit/delete, categories, status (Active/Draft/Approved/etc.), live preview, variables extraction, WhatsApp template name, **send test message**. |
| 8 | WhatsApp Message Tracking | ✅ | `app/whatsapp-messages/page.tsx` + webhook — statuses SCHEDULED → PROCESSING → SENT → DELIVERED → READ / FAILED / CANCELLED; retry failed; timeline view; logs; filters + export. |
| 9 | Invoice Generation | ✅ | `backend/src/invoices/` (jsPDF server-side) + `app/bookings/[id]/invoice/page.tsx` — printable invoice, auto invoice number (`BusinessSetting.invoicePrefix`+next), customer/booking details, **multiple line items** ✅ (Add/Edit/Delete via `/invoices/:id/items`), discount, GST, taxable value, total, **payment status (UNPAID/PARTIAL/PAID + partial amount)** ✅, business GSTIN/prefix/next-number settings. |
| 10 | Invoice Management | ✅ | `app/invoices/page.tsx` — dedicated history page ✅, stat cards (issued/total billed/collected/outstanding, status counts), search by invoice no/PNR/customer/flight ✅, payment-status filter ✅, pagination, **batch PDF download** ✅ (select-all on page + per-row checkboxes → "Download PDFs", plus "Download All"), per-invoice link to detail page. |
| 11 | WhatsApp Invoice Delivery | ✅ | `whatsapp.service.ts` `sendDocument()` — uploads invoice PDF to Meta `/media` then sends `type: 'document'`; `POST /invoices/:id/send` sends `Invoice-BA-xxxxx.pdf` to customer phone; respects `WHATSAPP_MOCK`; message + audit logged. |
| 12 | Accounts & Finance | ✅ | Revenue = derived from booking amounts (non-cancelled) ✅; expenses module ✅ with Direct/Operating split; gross/net profit computed in reports ✅; **manual income entry** ✅ (`/income` page + `Income` model — TICKET_SALE/COMMISSION/REFUND/OTHER, `POST /incomes`, date/search filters, delete); **invoice payment status / collection tracking** ✅ (paidAmount, outstanding on invoice); overview now reports `manualIncome` + `totalIncome`, and gross/net profit include manual income ✅. |
| 13 | Expense Management | ✅ | `app/expenses/page.tsx` + `expenses.service.ts` — direct cost (COGS/tickets) vs operating (rent, salaries, marketing, operational), title, note, payable-to, date, search, stats, delete, **date-range filter UI** ✅. |
| 14 | Reports & Analytics | ✅ | `app/reports/page.tsx` — Overview, Bookings, Revenue, Customers, Communication, **Expenses** ✅, **Invoicing** ✅, Routes, Airlines; date-range filtering on bookings/revenue/messages/expenses/invoices ✅ (`/reports/expenses`, `/reports/invoices` with by-status + billing/collections monthly trend); CSV export; delivery/read rates; profit breakdown in Overview. |

---

## Summary

| Status | Count |
|---|---|
| ✅ Implemented | **14** |
| ⚠️ Partial | **0** |
| ❌ Not implemented | **0** |

## Gap List (kya nahi hai — future scope)

1. **Branch/Multi-branch** — proposal me Single/Multi-branch plan, par schema me `Business` single-tenant hai; branch concept nahi hai (deferred by decision).
2. **Batch ZIP download of invoices** — abhi multi-select download har invoice ke liye alag file save karta hai; ek compressed ZIP bundle nahi. (`jszip` wale client-side bundle ka option hai)

## Already-Done Extras (beyond proposal — good for cred)

- Global search (PNR / customer name / phone) — `Ctrl+K`
- Notifications bell (pending/failed messages)
- Audit log / recent activity tracking
- GST tax + invoice number auto-series configuration in Settings
- Booking CSV export, Messages CSV export, Reports CSV export
- Login/auth + staff role model, business timezone/currency settings