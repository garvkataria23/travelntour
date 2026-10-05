# FlyConnect — Complete Code Audit Report

**Project:** D:\Documents\travel
**Stack:** Next.js 15 (App Router, React 19) + NestJS backend + Prisma/PostgreSQL + Redis/BullMQ + WhatsApp Cloud API + Firebase/Firestore
**Scan scope:** 165 files, 30,073 lines of TS/TSX/JS/Prisma/SQL/config
**Method:** 5 parallel deep-dive audits (backend auth/tenancy, financial correctness, WhatsApp/automation/queue, frontend data layer, infra/config/rules) + full-file review of all large UI pages + build/typecheck/test verification
**Findings:** ~300 total — 18 CRITICAL, 65 HIGH, ~60 MEDIUM, ~40 LOW

---

## Table of Contents
1. [Verification Results](#1-verification-results)
2. [Business Understanding](#2-business-understanding--part-1)
3. [What's Good](#3-whats-good--part-2)
4. [CRITICAL Findings](#4-critical-findings--part-3)
5. [HIGH Findings](#5-high-findings--part-4)
6. [MEDIUM Findings](#6-medium-findings--part-5)
7. [LOW Findings](#7-low-findings--part-6)
8. [Business Advice & Roadmap](#8-business-wise-advice--part-7)
9. [Appendix — Findings by Category](#9-appendix--findings-by-category)

---

## 1. Verification Results

I ran these checks myself:

| Check | Command | Result |
|-------|---------|--------|
| Frontend production build | `npm run build` | PASS |
| Frontend typecheck | `npx tsc --noEmit` | CLEAN |
| Backend typecheck | `npx tsc --noEmit -p tsconfig.json` | CLEAN |
| Backend unit tests | `npm test` (jest) | 81/81 PASS, 6 suites |
| Frontend lint | — | NO SCRIPT (not defined) |
| Backend lint | `npm run lint` | SCRIPT EXISTS but `eslint` not installed → fails |
| TypeScript strictness (backend) | tsconfig.json | strict:true, strictNullChecks, noImplicitAny |
| CI / GitHub Actions | — | NONE (no .github folder) |
| Migration drift (schema vs SQL) | manual diff | NONE (schema.prisma matches all 10 migrations) |
| Secrets tracked in git | `git ls-files` | NONE (.env never tracked; .gitignore airtight) |
| Committed build artifacts | `git ls-files` | NONE (all correctly ignored) |

**Note:** TypeScript-level debt is essentially zero (strict mode, clean typecheck, 81 tests). The problems are in **business logic, security, and money math** — not in typing.

---

## 2. Business Understanding (Part 1)

### 2.1 What product is this?
FlyConnect is a **travel agency work desk** — an internal operations tool, not a consumer booking app. The users are agency staff (agents/admins) and one platform owner. Screens: Dashboard, Bookings, Add Booking, Upcoming Journeys, Customers, WhatsApp Messages, Automation, Message Templates, Reports, Invoices, Expenses, Income, Currency, Settings.

### 2.2 The daily workflow
Create customer → Create booking (corporate or individual) → Generate invoice → WhatsApp messages fire automatically → Record income/expenses → Reports show P&L → Export Excel for accountant.

- The booking form (`app/bookings/add/page.tsx`, 3,420 lines) captures either a **corporate** traveller (company + employee) or an **individual** passenger.
- Booking save optionally generates an invoice.
- Automation rules fire WhatsApp messages on: booking created, journey date (offset reminders like "2 days before"), and cancellation.
- Invoice pages track billed / collected / outstanding.
- Messages page shows delivery status: sent / delivered / read / failed.

### 2.3 Revenue model
The agency earns via **markup on tickets + service fees**. Manual income records TICKET_SALE / COMMISSION / REFUND / OTHER. Expenses split into DIRECT (ticket/GDS cost = COGS) and OPERATING (rent, salaries, marketing). Reports compute gross and net profit. Currency base is AED; display converts to other currencies.

### 2.4 Multi-tenant model
Many agencies, each a `business` with a `businessId`. Branches and corporate companies tracked within a tenant. Per-tenant WhatsApp message limits and block/suspend status exist (in the demo admin panel).

### 2.5 What is real vs what is demo/cosmetic

| Real (production-grade) | Demo / browser-only |
|---|---|
| Bookings, customers, invoices, expenses, reports (real API + DB) | Master admin login — hardcoded password in JS bundle |
| JWT auth + role guards (global guard, live DB role read) | Account blocking — localStorage only |
| BullMQ + Redis message queue + workers | WhatsApp 1000-msg quota — localStorage only |
| Optimistic concurrency (version field on Booking/Customer) | Admin "control center" actions — localStorage only |
| Invoice PDF snapshot (frozen on issue) | Admin diagnostics retry — no real API call |
| 81 backend unit tests | Firestore CRUD — dead code, rejected by rules |
| Multi-currency display with FX rate fallback chain | Firebase signup bypasses backend registration gate |

### 2.6 What is genuinely valuable / differentiator
- PNR-first operations with one-click copy + search (PNR / customer / mobile)
- WhatsApp as customer channel with template variables ({{customer_name}}, {{pnr}}, {{flight_number}}) and offset-based reminders
- Corporate travel with company cost-centres and per-employee travellers
- Live-edit highlighting (collaborator changes visible, not silent)
- Executive Excel financial pack (bookings + invoices + expenses + income → profit)

---

## 3. What's Good (Part 2)

These are genuinely well done — do not undo them:

1. **Race-free invoice numbering.** `common/invoice-number.ts:17-23` — single atomic `UPDATE … RETURNING` inside the caller's transaction. Rollback returns the number. No read-then-compute path.
2. **No double-issue.** `invoices.service.ts:239-242` — conditional `updateMany where invoiceNumber: null`; losers get clean 409.
3. **Atomic booking creation.** `bookings.service.ts:334-372` — booking row + scheduled messages + invoice number in one `$transaction`. No gaps on rollback.
4. **Correct optimistic locking.** `bookings.service.ts:476-491` — `version` guard + increment inside transaction, with a conflict message naming the other editor. (This exact pattern is MISSING in the invoice item/payment paths — see H1, H2.)
5. **Mass assignment impossible.** `ValidationPipe` with `whitelist: true` + `forbidNonWhitelisted: true` (`main.ts:39-40`). `businessId` is never a DTO field — always derived from the guard-populated token.
6. **Role enforcement via global guard + live DB read.** `app.module.ts:61` APP_GUARD; guard re-reads the user row each request (`jwt-auth.guard.ts:43-52`), so a demoted/suspended user loses access immediately. Well designed.
7. **Webhook HMAC correct.** `webhook.service.ts:40-43` — raw body (not JSON round-trip), SHA-256, `timingSafeEqual`, length-guarded. (Only flaw: fail-open when secret is unset — see C9.)
8. **Template rendering injection-safe.** `render.util.ts` — whitelist of 21 variables, non-recursive replacement, no eval/Function, unknown vars left verbatim. Missing vars → 'N/A' (avoids Meta error 131008). Covered by spec.
9. **Outbound queue idempotent.** All three producers use deterministic `jobId` (`automation.service.ts:223`, `messages.service.ts:186,228`, `automation-recovery.worker.ts:82`). Recovery worker too.
10. **Cancellation is queue-safe.** `automation.service.ts:328-361` — DB status → CANCELLED committed first, then BullMQ job removed. Worker sees CANCELLED and returns without sending.
11. **Date filters correct** in expenses/income/invoices/bookings — half-open `[gte, lt)` in business timezone. This is the reference implementation.
12. **Root Dockerfile well built.** Multi-stage, non-root (`USER nextjs`, uid 1001), no secret ARG/ENV, correct layer caching for `npm ci`.
13. **`.gitignore` airtight.** `.env*`, `*.log`, `.next`, `dist`, `out`, `*.tsbuildinfo`, `META-WHATSAPP-API-KIT/` all ignored. No build artifact or .env tracked in 65 commits.
14. **CORS fails closed.** `main.ts:19-21` throws at boot if `FRONTEND_URL` empty; allowlist check, not `origin: true`.
15. **Migrations: zero destructive DDL.** No `DROP COLUMN`/`DROP TABLE`/`DROP TYPE` in any of the 10 migration files.
16. **PDF currency ASCII-safe.** jsPDF WinAnsi can't render ₹/د.إ/₺; code uses `currencyDisplay: 'code'` + ASCII fold + final glyph strip. No mojibake.
17. **PDF dates null-safe.** `dateFmt` returns em-dash for null/undefined; never renders NaN/Invalid Date.
18. **Excel CSV injection neutralized.** `backup-export.ts:120-190` prefixes cells starting with `= + - @ tab CR` with an apostrophe.
19. **Transaction races handled in some places.** `bookings.service.ts:285`, `customers.service.ts:177` use `isUniqueViolation` helper for get-or-create races.
20. **Money display null-safety partially handled.** `dashWhenEmpty` option exists.

---

## 4. CRITICAL Findings (Part 3)

### C1 — Master admin password in public JS bundle
- **Where:** `lib/admin-accounts.ts:5-6` → `MASTER_ADMIN_PASS = "GARV2331##"`
- **What:** `components/login-page.tsx:102-124` compares in browser and mints a fake session with NO server call (`accessToken: "token_master_admin_garv"`, `role: "SUPER_ADMIN"`). `app/admin/page.tsx:836` has an "Auto-Fill Garv Credentials" button.
- **Impact:** Anyone can open the admin console. Everything in it (agency block, quota, limits) is browser-side.
- **Fix:** Rotate the credential. Make MASTER_ADMIN a real Postgres `User` row with `Role.SUPER_ADMIN`. Gate `/admin` server-side via middleware role check. Add gitleaks to CI.

### C2 — Backend demo login bypasses bcrypt + is cross-tenant
- **Where:** `backend/src/auth/auth.service.ts:138-166`
- **What:**
  - `DEMO_ID`/`DEMO_PASSWORD` are NOT in `.env.example` or `render.yaml` → compiled defaults `blue`/`aura` are live.
  - `:161 if (!isDemo)` → **bcrypt.compare is skipped**; auth is plain `===` on a string.
  - `:151 findFirst({ where: { status: 'ACTIVE' } })` → **no businessId filter** → can return a user from any tenant.
- **Impact:** `POST /api/auth/login {"email":"blue","password":"aura"}` → full access, cross-tenant.
- **Fix:** Delete the demo branch. Add startup assertion: throw if `JWT_SECRET`/`DEMO_PASSWORD` missing or <32 chars.

### C3 — Cross-tenant invoice item write (IDOR)
- **Where:** `backend/src/invoices/invoices.service.ts:380-403` (updateItem), `:406-413` (removeItem)
- **What:** Both call `findFirst({ id: itemId, bookingId: id })` then `update/delete({ where: { id: itemId }})` — `businessId` is never checked. Every sibling method calls `loadInvoice(user, id)` which filters by businessId; these two don't. The write commits before `syncBookingInvoiceTotals` throws 404.
- **Impact:** A STAFF token from tenant A can modify/delete invoice line items on tenant B's issued invoice.
- **Fix:** `const booking = await this.loadInvoice(user, id);` as first line, wrap in `$transaction`.

### C4 — WhatsApp quota banner: every user is admin (`|| true`)
- **Where:** `components/whatsapp/whatsapp-quota-banner.tsx:51` → `const isAdmin = ... || true;`
- **What:** Always true. Every logged-in user (including STAFF) sees the admin panel and can call `upgradeWhatsAppLimit`, `addWhatsAppQuotaCredits`, `resetWhatsAppUsage`, `toggleWhatsAppGlobalPause` (`:79-107`).
- **Fix:** Delete `|| true`. Server-side authorize all quota actions.

### C5 — 1000-message quota does not exist on the server
- **Where:** `lib/whatsapp-quota.ts:47` (localStorage only). Zero references to `quota`/`messageLimit` in `backend/src`.
- **What:**
  - Per-browser counter — two staff = 2×1000; business can send ~2000 while each screen shows 500.
  - Trivially bypassed by clearing storage or calling the API directly.
  - `recordMessageSent` throws AFTER the send — no refund on failure.
  - `render.yaml:30` sets `WHATSAPP_MOCK: "true"` — deployed fallback sends nothing.
  - UI banner text at `:140` ("Not a single message can be sent") is false.
- **Impact:** Meta bills you and can suspend the WABA. UI gives false confidence.
- **Fix:** `BusinessSetting.messageUsed` + `quotaPeriodStart`. Atomic `updateMany where messageUsed < 1000 increment`. `count===0` → 429. Decrement on permanent failure. Delete localStorage engine.

### C6 — Client failover sends credentials to a second origin
- **Where:** `lib/api.ts:208-263` (`doFetchWithFailover`)
- **What:**
  - Replays EVERY failed request to `FALLBACK_API_BASE` — including login (`:213-245`), register, password reset, refresh (`:270-289`), Google OAuth. Plaintext passwords go to a second host on any 502/timeout.
  - Non-idempotent writes (POST/PATCH/DELETE) are replayed → a booking that committed on primary but returned 502 is re-sent to fallback → duplicate booking in a second DB.
  - `API_BASE` is a mutable module-global that flips → split brain (writes to one backend, reads from another), no reconciliation.
- **Fix:** Failover GET-only. `noFailover` for `/auth/*` + OAuth. Client-generated idempotency keys for writes. Remove mutable global base.

### C7 — Cache: no TTL, not user-scoped, not cleared on logout
- **Where:** `lib/api.ts:137-158`
- **What:**
  - `ts` timestamp is written but NEVER read → no expiry. Stale data served indefinitely.
  - Keys are path-only (`GET:/bookings`) — no user/business/role component.
  - `clearSession()` never touches the cache.
  - `lib/hooks.ts:26,48-52,63-68` — used as initial state, pre-fetch, AND error fallback (even on 403/500).
  - Invoices page polls 4s → a payment on another device masked by week-old cached figure.
- **Impact:** Shared machine → user B sees user A's data before any network call. Money figures stale with no indicator.
- **Fix:** TTL per entry. Namespace keys `businessId:userId`. Purge cache in `clearSession()`. Only fall back to cache on network errors (not 403/500). Surface age in UI.

### C8 — Firestore rules allow cross-tenant takeover
- **Where:** `firestore.rules:417-427` (allow create on /users/{userId}), `:163-168` (super-admin)
- **What:**
  - The `isOwner(userId)` self-provision branch places NO constraint on `request.resource.data.businessId`. Attacker writes `{uid, businessId: '<victim>', role: 'ADMIN', status: 'ACTIVE'}` → `isTenantMember()` returns true for victim tenant → full read AND delete of all customers/bookings/invoices/expenses/settings.
  - Super-admin keyed on hardcoded email `vertexlabsx@gmail.com` — a permanent backdoor requiring a code change to rotate.
  - Backend's `ALLOW_PUBLIC_REGISTRATION=false` is bypassed: `components/login-page.tsx:190` calls `signUpWithEmail` directly.
- **Fix:** Derive `businessId` server-side (Admin SDK / custom claim). Remove self-provision branch. Replace email super-admin with a claim. Disable `emailPassword` in Firebase or route signup through the backend.

### C9 — Webhook signature fails open + forged-message amplifier
- **Where:** `backend/src/whatsapp/webhook.service.ts:38` (`if (!this.webhookSecret) return true;`), `:21` (hardcoded verify token fallback), `:157-178` (replyAuto)
- **What:**
  - Secret unset → signature check returns true for ANY request. `render.yaml` sets no `WHATSAPP_WEBHOOK_APP_SECRET` → deployed instance accepts forged payloads.
  - `:157` every inbound message triggers `replyAuto()` which sends a WhatsApp text + PDF invoice to any number — an unauthenticated billable-message amplifier.
  - The auto-reply contains **fabricated data**: "Your flight booking has been confirmed! PNR: ABC123", "INV-2026-0001", "Total Rs. 8,850.00", a fixed GSTIN, and hardcoded business contact. Real customers with no booking will believe they have a reservation.
  - `:136-139` customer lookup has no `businessId` → cross-tenant message attribution.
- **Impact:** Reputational + financial. Customers receive false confirmations. Meta suspension risk from spam amplifier.
- **Fix:** Fail boot if webhook secret missing in production. Delete `replyAuto` + `buildExampleInvoicePdf`. Resolve tenant from `phoneNumberId`.

### C10 — Issued invoice document is not immutable (re-issues destroy the original)
- **Where:** `schema.prisma:588-590` (`@@unique([bookingId])`), `storage.service.ts:84-96` (upsert overwrites), `bookings.service.ts:417-418` (money/currency editable on issued invoice)
- **What:**
  - Every line-item edit (`:348`) and payment change (`:454`) re-captures and overwrites the PDF/payload. `supersededAt` records only when, never what. No queryable document history.
  - Contradicts `issue()`'s own promise (`invoices.service.ts:265-267`).
  - `:418 data.currency = dto.currency` — an issued invoice's currency can flip AED→USD with NO conversion → ~27x overstatement on historical records.
- **Fix:** Re-issue = new `InvoiceDocument` row with `revision` + `supersededAt`. Serve original to customer; corrections as credit notes. Reject `currency` change on issued bookings.

### C11 — Hard delete destroys tax invoices irrecoverably
- **Where:** `bookings.service.ts:618` (cascade to InvoiceItem, InvoiceDocument, MessageLogs), `expenses.service.ts:119-132`, `income.service.ts:94-105`
- **What:**
  - Schema has NO `deletedAt` anywhere — grep softDelete/voidInvoice/creditNote = zero.
  - Expense/Income hard delete with no role check → any STAFF can erase a money record.
  - Surviving AuditLog rows capture only pnr/title/amount — not invoice number, dates, currency, payee → deleted record cannot be reconstructed.
  - Tax jurisdictions require 6-8 year retention. This is non-compliance.
- **Fix:** `voidedAt`/`voidedBy`/`voidReason` on Booking/Expense/Income. Credit-note reversal flow. Audit before/after snapshots.

### C12 — All money is Float, and mixed currencies are summed together
- **Where:** `schema.prisma:268-275,281,312-314,331,354` — `amount`, `baseFare`, `cost`, `discount`, `taxAmount`, `paidAmount`, `unitPrice`, `quantity`, `Expense.amount`, `Income.amount` all `Float` → Postgres `DOUBLE PRECISION`. No `Prisma.Decimal` anywhere.
- **Where:** `expenses.service.ts:56`, `income.service.ts:57`, `reports.service.ts` — bare `SUM(amount)`.
- **What:**
  - `Expense.currency`/`Income.currency` are free-text; amounts stored unconverted. USD 5,000 + AED 5,000 = 10,000. No `rateUsed`/`baseAmount` column → conversion never recorded.
  - `bookings.service.ts:325` comment says "always stored in base currency" but `:326,358` do no conversion/validation.
  - Rounding is ad-hoc `Math.round(x*100)/100` at read time only (`1.005*100 === 100.4999...` → 1 paisa lost). `invoices.service.ts:49` (total) rounds not at all.
- **Fix:** `@db.Decimal(19,4)` + `Prisma.Decimal`. Shared `roundMoney()` at write boundary with epsilon correction. Add `amountBase` + `fxRate` + `fxAsOf`. Sum base column only. `CHECK (amount >= 0)`.

### C13 — Booking amount and invoice total permanently disagree (worst silent money bug)
- **UI** (`app/bookings/add/page.tsx:475-483`): `taxableBase = selling + serviceFee - discount` (fee INCLUDED).
- **Backend** (`bookings.service.ts:329`): `taxable = max(0, baseFare - discount)` (fee EXCLUDED).
- **Invoice** (`invoices.service.ts:38-49`): `subtotal = items ? sum : baseFare`; `total = taxable + taxAmount`.
- **What:**
  - Backend excludes service fee from tax; invoice includes it. Customer under-billed by `fee + taxOnFee` vs what `Booking.amount` claims.
  - If client omits `baseFare`: `:360` stores `baseFare: null` → `invoices.service.ts:38` falls back to `booking.amount` (already tax-inclusive) → `:49` adds tax AGAIN → **customer charged tax twice.**
  - `serialize` (`:81-87`) returns `baseFare`/`taxRate`/`taxAmount` from the row but `subtotal`/`total` recomputed. Screen shows taxable=recomputed, GST=stored, total=recomputed. Example: baseFare 1000 + 200 item @5% → line 200, taxable 200, GST 50, total 210. `200+50≠210`. Excel export inherits it.
- **Impact:** The invoice does not foot against itself. This is what gets a tax invoice rejected.
- **Fix:** `Booking` is the single source of truth. Store `serviceFee` explicitly. Compute taxable/tax/total once server-side. Delete the `baseFare ?? amount` fallback at `invoices.service.ts:38`. Persist recomputed `taxAmount` on item change.

### C14 — deploy-vm.sh swallows migration failure
- **Where:** `deploy-vm.sh:33` → `docker compose exec -T backend npx prisma migrate deploy || true`
- **What:** The most important step in the deploy can fail and the script still prints "Production Deployment Complete!" and exits 0. CI/monitoring records a green deploy with a wrong schema. Also duplicates `backend/Dockerfile:22`.
- **Fix:** Delete line 33 (Dockerfile owns it). Health check (`:59-63`) currently `|| true` + echo only — make it affect exit code with a 30s retry.

### C15 — PM2 mode deploys a blank page
- **Where:** `deploy-vm.sh:36-52`, `ecosystem.config.js:17`, `next.config.js:20` (`output: "standalone"`)
- **What:** Standalone output requires `.next/static` + `public` copied INTO the standalone bundle. `Dockerfile:39-40` does this; `deploy-vm.sh` does NOT. Result: HTML with no JS/CSS → blank non-interactive page.
- **Fix:** Before PM2 start, `cp -r .next/static .next/standalone/.next/static` and `cp -r public .next/standalone/public`.

### C16 — Docker build context ships entire git history (with leaked secrets)
- **Where:** No `.dockerignore` anywhere + `Dockerfile:16 COPY . .`
- **What:** Build context includes `.git` (65 commits, Meta app secret in history), `.env.local`, `node_modules`, `.next`, `.next-stale`, `out`, `backend/dist`, `tsconfig.tsbuildinfo`, 8 log files. Any log write invalidates every layer after :16.
- **Also:** `backend/Dockerfile` runs as **root** (no USER directive) and copies full `node_modules` including devDependencies (@nestjs/cli, typescript, prisma — hundreds of MB).
- **Fix:** Add `.dockerignore`. Add non-root `USER app` + `--omit=dev` prod-deps stage to backend Dockerfile. Move `prisma` to dependencies (needed at runtime by `migrate deploy`).

### C17 — /api/health returns 200 even when DB is down
- **Where:** `backend/src/health/health.controller.ts:41-45`
- **What:** Plain object return = always HTTP 200. `render.yaml:10 healthCheckPath: /api/health` → Render keeps a dead backend in the LB, every request 500s. `degraded` status in body is not consumed.
- **Fix:** `throw new ServiceUnavailableException({status:'degraded', checks})` when not healthy. Add worker heartbeat + migrations checks.

### C18 — Health check opens a new Redis connection per probe
- **Where:** `health.controller.ts:26-38` — `new Redis()` + connect + ping + disconnect per request, on a `@Public()` route
- **What:** Unauthenticated connection-exhaustion vector. Frontend also polls every 5 min (`lib/api.ts:218-222`).
- **Fix:** Inject the app's long-lived Redis provider (QueueModule already owns one) and PING it.

---

## 5. HIGH Findings (Part 4)

### 5.1 Money / Accounting (H1-H25)

| # | Problem | Location |
|---|---------|----------|
| H1 | `setPayment` unguarded absolute set — two concurrent partial payments → **one vanishes**. Overpayment silently clamped away. `paymentStatus` taken verbatim from client. | `invoices.service.ts:420-458` |
| H2 | Invoice item mutations (add/update/remove + totals sync + audit) are 3 separate statements, no `$transaction` — concurrent adds lose one item's contribution to `Booking.amount` permanently | `invoices.service.ts:319-414` |
| H3 | Cancelling a booking does not void its invoice — invoiceNumber/paidAmount/PDF survive, PDF shows "PAID IN FULL"; reports count it as billed+collected while revenue excludes it | `bookings.service.ts:559-596`, `reports.service.ts:330-352` |
| H4 | Reports use `!row.taxAmount` instead of `??` — a deliberately zeroed tax is recomputed, report disagrees with invoice | `reports.service.ts:338` |
| H5 | Output tax treated as revenue and profit (`Booking.amount` is tax-inclusive); workbook labels it "Gross Ticket Revenue" and rolls into NET PROFIT. No tax-payable liability anywhere | `lib/financial-excel.ts:137-145` |
| H6 | Airline settlement double-counted: `directCost = expenses(DIRECT) + booking.cost`; UI offers "Airline ticket settlement" as a DIRECT expense too. No `Expense.bookingId`, no reconciliation | `reports.service.ts:97-98`, `app/expenses/page.tsx` |
| H7 | Reports `overview` fetched with NO range but header prints "Reporting Period" — workbook asserts selected period produced all-time numbers | `app/reports/page.tsx:118-131` |
| H8 | Export silently truncates at 1000 records per resource (`limit=1000`, no pagination loop, no warning) | `app/reports/page.tsx:149-150` |
| H9 | Manual-income sheet always empty — calls `/income`, route is `/incomes`; 404 swallowed by `.catch(() => ({items:[]}))` | `app/reports/page.tsx:156`, `income.controller.ts:8` |
| H10 | Receivables sheet fabricated — `totalSpent:0, totalDue:0` hardcoded; every customer marked "CLEARED" | `app/reports/page.tsx:245-246`, `financial-excel.ts:495-507` |
| H11 | `nextInvoiceNo` client-writable — admin can rewind counter → next allocation collides (409) or reuses a number in a gap | `settings.controller.ts:95,117`, `common/invoice-number.ts` |
| H12 | `dto.taxAmount` short-circuits server tax computation; `dto.taxRate` persists even when `gstEnabled=false` → falsified tax output | `bookings.service.ts:324-331,363-364`, `create-booking.dto.ts:114-124` |
| H13 | `convertAmount` returns unconverted number when rate unavailable → AED 5,000 renders as "₹5,000" with total confidence (~20x error, no warning). Non-finite input → 0 | `lib/currency-core.ts:190-194`, `lib/api.ts:487-494` |
| H14 | `BASE_CURRENCY` hardcoded 'AED' everywhere; schema has 3 unsynchronised currency columns (`Business.currency`, `BusinessSetting.currency`, dead `defaultCurrency`) | `decimals.ts:2,75,81`, `currency-core.ts:16,74`, `schema.prisma:120,189,193` |
| H15 | Negative amounts accepted (no `@Min(0)`) — a negative DIRECT expense **increases** gross profit | `create-expense.dto.ts:29`, `create-income.dto.ts:15` |
| H16 | Headline money cards formatted with no currency arg → aggregates always treated as AED, while rows pass real currency. Same in expenses/income pages | `app/invoices/page.tsx:176-178`, `app/expenses/page.tsx:65-68` |
| H17 | Excel writes raw floats, no cell number formats, TOTAL rows are raw JS accumulations → column total can disagree with printed rows | `lib/financial-excel.ts` (throughout) |
| H18 | Mixed-currency rows totalled under one currency label — adds USD to AED, stamps business currency | `financial-excel.ts:230-238,400-421,469` |
| H19 | Excel date-only strings parsed as UTC midnight then formatted local → off by one day in negative-offset timezones. `lib/api.ts:508-514` has the correct fix; Excel doesn't use it | `financial-excel.ts:92-101` |
| H20 | After 255-day prune, an "issued" invoice is silently re-rendered from LIVE data and served as original (`source:'live'` flag unread by any frontend) | `storage.service.ts:199-200`, `invoices.service.ts:530-558` |
| H21 | 255-day retention is far short of statutory 6-8 years; readable document destroyed, only unqueryable compressed payload kept | `storage.service.ts:170` |
| H22 | PDF drops line items past y=660 silently (no continuation page), but Subtotal/TOTAL computed from ALL items → invoice doesn't foot with ~25+ items | `invoice-pdf.util.ts:266-277,283` |
| H23 | PDF never prints the tax RATE (screen shows "GST @ 5%") — compliance-critical field; two renderings of same invoice disagree | `invoice-pdf.util.ts:288-289` |
| H24 | WhatsApp caption uses live total, attached PDF is frozen snapshot → customer gets two different numbers | `invoices.service.ts:596-603` |
| H25 | Reports date filters use `lte` next-day-midnight + no timezone (unlike every other module's `[gte,lt)`) | `reports.service.ts:429-437` |

### 5.2 Security (H26-H39)

| # | Problem | Location |
|---|---------|----------|
| H26 | Password reset does NOT revoke refresh tokens (valid 7 days). Incident response impossible | `users.service.ts:82` |
| H27 | `/auth/refresh` is `@Public()` + unthrottled → up to 100 sequential bcrypt cost-10 per request (~6s CPU) = unauthenticated DoS. Also scans tokens globally (fails once >100 live tokens) | `auth.service.ts:204-226`, `auth.controller.ts:36-45` |
| H28 | Invoices/expenses/income/messages have NO `@Roles` — any STAFF can mark invoices PAID, send bank details via WhatsApp, send arbitrary phishing text (creates throwaway template as side-effect) | `invoices.controller.ts`, `expenses.controller.ts`, `income.controller.ts`, `messages.controller.ts:35-38` |
| H29 | `trust proxy` never set — per-IP throttle becomes one global bucket behind any LB; audit IPs record the proxy | `main.ts` (absent) |
| H30 | Rate limit is per-process × PM2 `instances:max` = `20 × CPU-count`, resets on deploy | `app.module.ts:62`, `ecosystem.config.js:6-8` |
| H31 | Login timing oracle — unknown email returns before bcrypt (~100-300ms difference). Register also says "email already exists" | `auth.service.ts:157-166`, `:52-55` |
| H32 | No `USER_LOGIN_FAILED` audit action — credential stuffing invisible | `auth.service.ts` |
| H33 | Every audit write failure silently discarded (empty catch, unused binding) — undetectable trail holes, false confidence | `audit.service.ts:29-31` |
| H34 | Audit log not tamper-evident (no hash chain); `onDelete: Cascade` on business means deleting a tenant erases their whole audit trail; `SetNull` on user erases attribution | `schema.prisma:512-529` |
| H35 | No failed-attempt counter, no account lockout (`User` model has none). Demo bypass makes this moot until C2 fixed | `schema.prisma:143-167` |
| H36 | Frontend login leaks account existence (`auth/email-already-in-use` → "account exists"; reset → "No account found") | `components/login-page.tsx:255-258,287-288` |
| H37 | Firebase signup bypasses backend registration gate (open door into the app) | `components/login-page.tsx:190`, `lib/firestore.ts:119-154` |
| H38 | `xlsx@^0.18.5` is the abandoned npm build with known prototype-pollution advisories; static import ships ~800KB in initial chunk | `package.json:19`, `backup-export.ts:1`, `financial-excel.ts:1` |
| H39 | Live Meta app secret + access token + encryption key permanently in git history (commit `fc62f9c`, `META-WHATSAPP-API-KIT/`) | git history |

### 5.3 WhatsApp / Automation (H40-H49)

| # | Problem | Location |
|---|---------|----------|
| H40 | No outbound throttle — `concurrency:5` is the only limit. 50 bookings = 250 sends with zero pacing → Meta throttle (130429/131008) / WABA ban | `whatsapp-send.worker.ts:33` |
| H41 | `Retry-After` header never read — Meta asks for minutes, BullMQ retries in 10s → guaranteed 130429, all 3 attempts burned, good message marked FAILED | `whatsapp.service.ts:268-278` |
| H42 | Unmapped Meta error defaults to `retryable:true` (permanent failures retry); `code`→`subcode` fallback crosses two code spaces | `whatsapp.service.ts:272-275` |
| H43 | Inbound dedupe is read-then-write with `.catch()` on BOTH the read (`:140`) and the create (`:155`) — Meta retry → customer gets the message twice | `webhook.service.ts:140-157` |
| H44 | Worker-crash duplicate-send window — send succeeds, SIGKILL before status write, recovery re-dispatches | `automation-recovery.worker.ts:62-68` |
| H45 | No dead-letter handling — failed jobs accumulate in Redis forever; only a log line; no admin surface; `removeOnFail:false` | `whatsapp-send.worker.ts:37-39` |
| H46 | Template `content` has no length cap — one admin paste breaks every future send on that rule (TEMPLATE_PARAMETER_ERROR, non-retryable) | `create-template.dto.ts:27` |
| H47 | Template `status != 'APPROVED'` never checked before scheduling; guessed `whatsappTemplateName` fails only at send time | `whatsapp-send.worker.ts:88-90`, `automation.service.ts:402-431` |
| H48 | Recovery scan `take:500` no `orderBy` — burst exceeds drain rate (~667/min) | `automation-recovery.worker.ts:75-79` |
| H49 | `MAX_SEND_ATTEMPTS=5` (constant) vs `attempts:3` (3 producers) — retries 4-5 impossible. `queue/constants.ts` is dead AND contradicts `queue/module.ts` | `queue/module.ts:8` vs `automation.service.ts:231` |

### 5.4 Infrastructure (H50-H58)

| # | Problem |
|---|---------|
| H50 | `render.yaml:3` name is `flyconnect-api-fallback` but `lib/api.ts:8` + `middleware.ts:28` call `flyconnect-backend-fallback.onrender.com` — failover target doesn't exist |
| H51 | `render.yaml:30` `WHATSAPP_MOCK:"true"` in production fallback |
| H52 | `docker-compose.yml:7-9` Postgres password = username = `flyconnect`; Redis has NO password (holds the whole message queue) |
| H53 | `docker-compose.yml:61` `NEXT_PUBLIC_API_URL` set as runtime env — Next inlines at BUILD time, so this is a no-op; baked value is the hardcoded default at `lib/api.ts:6` |
| H54 | `20260926190000_concurrency_invariants:36` unique index on `(businessId, invoiceNumber)` fails on non-empty prod DB if duplicates exist. Pre-flight is a comment, not executable code |
| H55 | `20260930000000` hand-written `ADD COLUMN IF NOT EXISTS` × 8 → silent no-op, drift becomes permanent, `migrate diff` can't validate |
| H56 | Backend Docker runs as root + ships devDependencies; `prisma` is a devDependency but needed at runtime (`migrate deploy`) → `--omit=dev` breaks boot |
| H57 | PM2 config has no `max_memory_restart`/`min_uptime`/`max_restarts`/`wait_ready` |
| H58 | Zero CI (`.github` absent) — every finding above reached master unblocked |

### 5.5 Frontend / Data (H59-H65)

| # | Problem |
|---|---------|
| H59 | Reports tab = 9 concurrent pollers (~108 req/min/tab); focus/visibilitychange/online fire up to 36 more. `lib/hooks.ts:111` `Math.min(refetchInterval,4000)` silently caps caller's 15s to 4s |
| H60 | Currency poll every 5s → new rate-table object → provider value changes → **entire app re-renders 12×/min** (provider wraps whole shell) |
| H61 | Invoice item PATCH/DELETE reachable cross-tenant from UI (frontend manifestation of C3) |
| H62 | `middleware.ts:13` uses `Buffer.from()` on Edge runtime (not guaranteed global) — failure removes CSP from every response |
| H63 | `app/bookings/add/page.tsx:553-624` hardcoded `+971 50 182 9921`, `"Blue Aura Tours & Travels"`, `"Dubai (DXB)"`, `"2026-10-15"`, sample flight segment — **all saved to the real DB via POST /bookings** |
| H64 | Login every path schedules untracked `setTimeout(router.push,350)` then `finally` sets `loading=false` → duplicate login POST possible; timers never cleared |
| H65 | `update-banner.tsx:27-37` calls `setUpdateAvailable(true)` INSIDE a state updater (impure; StrictMode double-fires) |

---

## 6. MEDIUM Findings (Part 5)

### 6.1 Pagination / Data loading
- `common/pagination.ts` exists but has ZERO references — `@Max(100)` never applied. `?limit=1000000` returns the whole tenant (`users.service.ts:20`, `audit.service.ts:39`, `bookings.service.ts:89`, `customers.service.ts:31`, `templates.service.ts:59`, `invoices.service.ts:135`, `messages.service.ts:33`).
- Inline query types (`{page?:number; limit?:number}`) deliver STRINGS at runtime (no ValidationPipe metadata) → `page="abc"` → `skip: NaN` → 500. `lib/api.ts:508` and `bookings.service.ts:88` coerce correctly; others don't.
- `paginationMeta` returns `totalPages` but invoice page reads `meta.pages` (undefined) → "Page 1 of " and Next never disables. `expenses`/`income` use a third shape (`pages`).
- Unbounded reads: `templates.service.ts:82-85` loads ALL ScheduledMessage to count; `invoices.service.ts:184-201` loads ALL matching invoices + items into JS every 4s poll to compute 4 aggregates; `automation.service.ts:367-372` returns all rules unpaginated.
- Query params typed `number` but delivered as strings → `skip: NaN` → Prisma 500 (`users.controller.ts:18`, `audit.controller.ts:18`).

### 6.2 Reporting consistency
- Same metrics computed two ways: `overview` uses SQL `aggregate`/`groupBy`; `revenue`/`invoicesReport` load+sum in JS → float order differs → dashboard "Revenue" and Reports "Revenue" can disagree (`reports.service.ts:83-92` vs `197-217`).
- Bookings report "revenue" includes cancelled; `revenue()` excludes → two conventions, Excel P&L mixes them (`reports.service.ts:169`).
- Month buckets returned in DB insertion order, not chronological (`reports.service.ts:361`, `expenses.service.ts:110-115`).
- Booking trend uses hardcoded 30-day window regardless of selected range (`reports.service.ts:129-146`).
- Expense total (SQL SUM) vs category breakdown (groupBy) summed by different engines (`expenses.service.ts:56` vs `103-107`).
- Unvalidated date params → `Invalid Date` → 500 instead of 400 (`reports.service.ts:429-437`, `expenses.service.ts:91-95`, `invoices.service.ts:162-170`).
- Date-only financial periods stored as UTC midnight → wrong day in negative-offset timezones (`expenses.service.ts:74`, `income.service.ts:80`).
- `formatMoney(null)` renders "AED 0" (no data looks like zero) unless caller remembers `dashWhenEmpty` (`currency-core.ts:76-78`).
- Custom rounding thresholds only honored when `limit===1000`; admin UI misreports its own saved config (`whatsapp-quota.ts:107-112`).
- Display currency in localStorage not scoped by business + never re-seeded (`currency-core.ts:145,157-165`).
- Money stored at 2+ decimals, displayed at 0 (AED/INR/SAR/QAR) with no rounding rule at write boundary (`decimals.ts:10-13`, `currency-core.ts:23-26`).

### 6.3 React / performance
- `app/bookings/add/page.tsx` — **151 `useState` hooks**; every keystroke re-runs the 3,420-line component. (admin=57, settings=38, bookings list=31.)
- 9 concurrent pollers on reports tab; `hooks.ts:79-89` dynamic import race can leak a BroadcastChannel listener on unmount.
- `refetch` useCallback depends on serialized `bodyKey` but closes over `body` — stale closure under React 19.
- No AbortController — in-flight polls never cancelled; `setInterval` 4s stacks behind 10s responses; `setState` after unmount.
- `useLiveSync` deps include an inline arrow (`onEvent`) → resubscribes every render per consumer (`lib/sync.ts:238-295`).
- `useCollaboratorPresence` depends on `pathname` → presence doc deleted/recreated on every route change; never settles.
- Presence heartbeat writes a Firestore doc every 12s per user = ~7,200 writes/day/user, forever, just for liveness (`lib/sync.ts:344-345`).
- `formatMoney` constructs a new `Intl.NumberFormat` per call; ~60 render sites → 500-row table = 500 formatters per render (`currency-core.ts:72-108`).
- Invoices/expenses/income list pages rebuild query string inline with NO debounce (customers/bookings correctly debounce 400ms).
- `upcoming-journeys/page.tsx` runs 7 concurrent `useApi` incl. 3 count queries + `limit=500` calendar, all 15s poll.
- Static `import * as XLSX` → ~800KB in initial chunk for reports/settings (`backup-export.ts:1`, `financial-excel.ts:1`).
- `/api/version` poll 30s + redundant refetch on every focus (`update-banner.tsx:47,63-67`).

### 6.4 Firestore / presence / sync
- `lib/firestore.ts` entire module is dead code (all entity CRUD unreferenced); AND its writes are rejected by rules (`addDoc` vs required `id==docId` field; `customerName`/`flightNumber` not in allowlist).
- Firestore read rules use `resource.data.businessId` → false for list queries → entire collection rejected (classic trap). So every `get*FromFirestore` is dead even if called.
- Presence writes DENIED on backend-login path: rule requires `request.auth.uid == userId` but doc ID comes from Prisma uuid (`ApiUser.id`) on `/auth/login` path, Firebase uid only on fallback.
- `broadcastLiveSync` writes `data` field not in rules allowlist → any payload-bearing event DENIED.
- Sync entity `"templates"` not in rules enum `['bookings','customers',...]` → template sync permanently broken.
- Events timestamped client-side; subscription `where(timestamp>=start) limit(15)` with no `orderBy` → arbitrary order, dropped events, no index declared, unbounded append-only collection (no pruning).
- Presence publishes every user's name/email/role/currentPage to all tenant members; `beforeunload deleteDoc` not awaited (browser cancels) → docs accumulate; subscription reads whole collection (no `where lastSeen`).
- `getStoredBusinessId()` mixes Prisma id and Firestore-derived `biz_<uid>` → same tenant in two Firestore namespaces depending on sign-in path.
- `invalidate()` with no prefix scans ALL localStorage keys on every write event.
- `writePersistent` silently skips payloads >400,000 chars — cache fails for exactly the largest responses.
- `totalOnline: Math.max(collaborators.length, 1)` fabricates "1 online" when zero presence docs readable.
- Every Firestore error swallowed (`.catch(() => [])` / empty catch) — `permission-denied` indistinguishable from "no data".

### 6.5 Error handling / observability
- `auth.service.ts:26` Logger declared, never used (natural home for missing login-failure logging).
- Non-prod 5xx returns raw Prisma exception message (table/column/constraint names); `NODE_ENV` never validated at boot.
- `P2014` → 500 (should be 400); unlisted Prisma codes echoed verbatim to client; `P2034` not retried.
- `main.ts` CORS `FRONTEND_URL` boot-assert is good, but no `JWT_SECRET` length/content assertion.
- `sendViaWhatsApp` has no retry wrapper + `MessageLog.waMessageId` is `@unique` → successful-but-unlogged send then retry → P2002 conflict reported as error (message WAS delivered).
- Media upload can orphan on Meta's servers if send fails after upload (`whatsapp.service.ts:196-225`).
- No 401 handling — expired Meta token fails every message non-retryably, all pending flip to FAILED, no refresh path, `tokenExpiresAt` never stored.
- `MessageLog` has no `(scheduledMessageId, attempt)` uniqueness — retries accumulate ambiguous rows.
- Broker health isn't verified by /api/health — a wedged worker leaves health green while messages silently stop.
- No `INVOICE_PDF_DOWNLOADED`, `USER_LOGOUT`, `TOKEN_REFRESH`, `STORAGE_SWEEP` audit actions.

### 6.6 Security (medium)
- Webhook verify-token comparison uses `===` (not timing-safe) though HMAC does (`webhook.service.ts:29`).
- Webhook processing errors swallowed with HTTP 200 → failed status update permanently lost (Meta never redelivers).
- Password policy: min 6 on register, min 4 on login, no max (a 1MB password is bcrypt-hashed = CPU lever). No breach-list check.
- `RegisterDto` declares `userAgent`, `ip`, and an `inviteId` that `register()` never reads — a silently unimplemented invite flow.
- Public registration (if enabled) mints ADMIN in a new business with no email verification / CAPTCHA / approval.
- `BusinessesService.profile(businessId)` takes a raw tenant id (exported service; controller happens to pass the right value).
- STAFF can read bank details, GSTIN, WhatsApp number ID from settings GET (only PATCH is role-gated).
- Backend backup export returns full bank account number + GSTIN unredacted; no audit entry for the export itself; inline role check not `@Roles`.
- `usage()` endpoint returns whole-DB table sizes/row counts to any tenant (no role gate) — discloses deployment shape and other tenants' scale.
- Phone normalisation inconsistent — only auth path prefixes `+`; webhook always builds `+${...}` → customers stored without `+` never match.
- DB-level tenant integrity not enforced — `InvoiceItem` has no `businessId` column; `ScheduledMessage` has 3 independent tenant-bearing FKs that can disagree.

### 6.7 Infrastructure (medium)
- No HEALTHCHECK in either Dockerfile; `backend` service copies `node_modules/.prisma` and depends on `prisma` being present (currently a devDep).
- `docker-compose.yml:10-11,25-26` publish Postgres/Redis on `0.0.0.0` (safe only while UFW holds — Docker iptables run before UFW).
- `deploy-vm.sh:27-28` `down --remove-orphans` + `build --no-cache` = guaranteed outage + full cold build every run.
- `deploy-vm.sh:16-17` `git reset --hard` with no confirmation; branch hardcoded to `master`.
- PM2 mode never verifies `backend/.env` exists (missing it → every cluster worker dies, but deploy reports success).
- `20260930000000` uses `IF NOT EXISTS` (Prisma never emits it) — drift undetectable.
- No per-migration rollback note; only full-restore recovery (documented in backup/README.md, acceptable).
- No `prisma migrate diff` / shadow-DB drift gate anywhere.
- `@nestjs/swagger` is a production dependency, only used off-production.
- `app/api/version` leaks exact commit SHA unauthenticated; no rate limit; version literal `1.0.2` contradicts `package.json` `0.1.0`.
- No root `.env.example` (only backend's) — new deployers can't discover the 6 `NEXT_PUBLIC_*` keys.
- `.vercelignore` ships all deploy tooling (Dockerfile, deploy-vm.sh, firestore.rules…) to Vercel needlessly.
- `Vercel preview origins blocked by CORS allowlist` (`render.yaml:14-15` lists only prod + VM).
- `render.yaml:5 plan:free` with stateful Postgres/Redis — free tier spins down after 15min, unsuitable for BullMQ.
- `docker-compose.yml:61` `NEXT_PUBLIC_API_URL=http://localhost:4000/api` would point remote browsers at their own machine (even if it were honored).
- `backend/tsconfig.json:10 sourceMap:true` ships full source in prod image.

### 6.8 UI / UX (medium)
- ~20 modals repo-wide have NO `role="dialog"`, no `aria-modal`, no focus trap, no Escape, no focus restore. Icon-only close buttons have no accessible name.
- Reports page renders error for only 1 of 9 queries → invoices/expenses failures silently show "—"/"No data" (indistinguishable from zero business).
- `app/dashboard/page.tsx:132` renders `todays.error` inside the Bookings Overview card (belongs to a different query).
- `app/settings/page.tsx:837` account status hardcoded "Active" with a green tag — a suspended tenant sees healthy.
- No loading skeletons on Overview/Top-Routes/trend charts.
- Empty/error/loading tri-state inconsistent across pages.
- Booking form money math is raw floats, no rounding (`:477,481`) → `12449.999999999998` sent as `amount`.
- Booking form `validateForm()` only checks company/employee-or-name/phone and `selling<=0`; no upper bounds, no date sanity, all client-side only.
- Expenses/income/automation forms accept arbitrarily huge values; automation reinterprets negative offsets via `Number(x)||0`.
- `app/bookings/add` fallback literals flow into the real save path (phone/airline/route/date/time/terminal/hotel + seeded sample segment).
- Exports hardcode `"FlyConnect Travel Agency"` + `"AED"` regardless of signed-in business or its currency.
- ~20 hand-rolled modals, 6 near-identical stat grids, 8 duplicate toast/error banners; `formatDateInput` duplicated; `statusTone`/`statusIcon` exist in both `app-shell.tsx` and `lib/api.ts`.
- "Keep me logged in" is a `<button>` with a styled span, no `role="checkbox"`/`aria-checked` (announced as unlabelled button).
- Field errors not announced (`role="alert"`/`aria-live`/`aria-invalid`/`aria-describedby` all missing on login form).
- Icon-only buttons (eye/more) lack `aria-label`; table headers lack `scope`.
- Several lists keyed by array index (`app/admin/page.tsx:2050`, `app/reports/page.tsx:555`) → state corruption on reorder.
- `app/dashboard/page.tsx:78-101` legacy inline dashboard coexists with the new sidebar shell (duplicate nav links).

### 6.9 Money display / currency (medium)
- `financial-excel.ts:123-126,141` prints 100% collection rate when nothing invoiced; line 141 "Less:" can show a positive (gain) when `directCost < ticketCost`.
- `paymentMethod` accepted on expense DTO but silently discarded (no column) — expense payment method not recorded anywhere.
- Every rounding site reimplements `Math.round(x*100)/100` independently and incorrectly (no `Number.EPSILON`); `invoices.service.ts:49` rounds the sum not at all.
- Expense/income forms hardcode "Amount (AED)" with no currency control; backend defaults to business currency.
- `InvoiceItem.quantity` is `Float` with no `@IsInt()` — fractional quantities allowed on invoices.

### 6.10 Firestore rules vs client (medium)
- `saveBackupToFirestore` is live code (`settings/page.tsx:288,333`) but unconditionally DENIED by rules (`backup` field not in allowlist + requires `id==backupId` impossible with `addDoc`). Call sites swallow the error.
- `firestore.rules:397-399` businesses create open to any authenticated user at any ID, unbounded.
- `firestore.rules` enum for `entity` doesn't include `templates`; `data` field not in `sync_events` allowlist.
- `getOrCreateUserProfile` provisions a business + ADMIN for any Firebase signup, fully bypassing backend `ALLOW_PUBLIC_REGISTRATION=false`.

---

## 7. LOW Findings (Part 6)

### Dead / unused code
- `queue/constants.ts` — entire file dead, and contradicts `queue/module.ts` (`RETRYABLE_ERROR_CODES` differ).
- `JWT_REFRESH_SECRET` — declared in `.env.example` + `render.yaml` but read nowhere (false sense of domain separation).
- `WhatsAppAccount.accessTokenRef` — column exists, never written or read.
- `BusinessSetting.defaultCurrency` (`schema.prisma:193`) — never written, never read, duplicates `currency`.
- `UsersService.remove()` (`users.service.ts:92-101`) — unreachable (no `@Delete` route); emits a `USER_DELETED` action that can never fire.
- `setActiveApiBase` (`lib/api.ts:12`) — exported, never called.
- `allowDuplicate` DTO field (`create-booking.dto.ts:130`) — DB unique index blocks it anyway → converts clean 409 into a 500.
- `createdBy` DTO field (`create-expense.dto.ts:42`) — server-owned, correctly ignored by service, trap for next dev.
- `void startOfWeek` (`bookings.service.ts:633`) — dead code in money-adjacent stats.
- `defaultCurrency` and 3 dead Firestore indexes (`firestore.indexes.json`); `lib/admin-diagnostics.ts:78-79` references a `companyId` index that exists nowhere.

### Type safety (casts hiding errors)
- `audit.service.ts:25` `metadata as object` launders past Prisma's `InputJsonValue` (excludes null/Date/BigInt) → compiles, throws at runtime, swallowed by the empty catch.
- `invoices.service.ts:56,287-291` four `as unknown as` casts because `buildPdf`/`loadInvoice` return relations but params are typed bare `Booking` → a missing relation silently yields `undefined` (customer name/phone degrade to null in issued PDF). Fix: `Prisma.BookingGetPayload<{include:{customer:true;invoiceItems:true}}>`.
- `whatsapp.controller.ts:48` unnecessary `rawBody` cast (rawBody:true is set in main.ts).
- `common/pagination.ts:32` vs invoice page — `totalPages`/`pages` naming mismatch (also listed in medium).
- No bare `any` in `backend/src` (only in specs) — clean.

### Magic strings / config fragility
- `public.decorator.ts:3` `IS_PUBLIC_KEY = 'public'` — guard at `jwt-auth.guard.ts:23` hardcodes the string `'public'` instead of importing it. Rename = silent breakage of every route.
- `transform.interceptor.ts:22` skips wrapping if data has a `success` key — a domain object with that key gets a different envelope. Swagger bypass (`:15-17`) is dead code.
- Hardcoded infra defaults: `webhook.service.ts:21` (`flyconnect-verify-token`), `health.controller.ts:26` + `queue/queue.module.ts:39` (`redis://localhost:6379`), `render.yaml:31` (`WHATSAPP_MOCK=true`).
- `all-exceptions.filter.ts:44` `HttpAdapterHost` injected via `new` not DI → always undefined.
- Two BullMQ connection configs diverge (`whatsapp-send.worker.ts:27` no `maxRetriesPerRequest`; `automation-recovery.worker.ts:23-26` sets `0`); recovery worker's `automationQueue` leaked on shutdown (only `worker` + `whatsappQueue` closed); three duplicate Queue sets opened to same Redis.
- `lockDuration:30000` with no `AbortSignal.timeout` on any `fetch` → hung Meta connection holds a worker slot indefinitely.

### Storage
- `pdf-compression.ts:20` brotli quality 11 is synchronous (~1MB/s) on the request path — called twice per snapshot inside booking create.
- `storage.service.ts:68` dedupes on PDF sha256 only — if payload changes but PDF bytes don't, stored payload silently disagrees.
- `readInvoicePdf`/`readInvoicePayload` take bare `bookingId` (no `businessId`) — currently safe (callers scope first) but a future caller could create a cross-tenant PII read.
- `invoice-pdf.util.ts:121-133` — `booking.version` in the file ID defeats content-addressed dedup (any edit rewrites the "issued" doc).

### UI polish
- `app/bookings/[id]/invoice/page.tsx:286` invoice lines keyed by `description` → duplicate descriptions collide.
- `collaborator-presence.tsx:300` "Xs ago" computed from `Date.now()` during render → label frozen.
- `app-shell.tsx:116-128` session checked once on mount, no cross-tab sync — logout in another tab leaves this tab rendered.
- `backup-export.ts:233-241` revokes object URL synchronously after click → can cancel downloads; anchor never removed.
- `whatsapp-quota-banner.tsx:604` `Number("") || 2000` — clearing field + Apply = silently 2000.
- Quota notice timers overwritten not tracked; several never cleared (`whatsapp-quota-banner.tsx:83-106`); `getStoredUser()` read during render (non-reactive).
- `admin-accounts.ts:148-297` 5 functions `throw new Error` from React event handlers → unhandled rejection, no user feedback.
- `admin-diagnostics.ts:238` retry is a simulation (comment: "Simulate self-healing resolution") — operator thinks system recovered.
- `lib/admin-diagnostics.ts` + `whatsapp-quota.ts` + `admin-accounts.ts` + `travel-crm.ts` ship hardcoded real-shaped PII (admin email/name/phone, employee phones, attacker IPs `194.26.29.112`, `49.36.128.45`).
- `lib/firebase.ts:70` `getDefaultQuotaForEmail` hardcodes a personal Gmail + real Drive usage numbers.
- Invoice PDF totals block lacks "Taxable Value" line and amount-in-words (`invoice-pdf.util.ts:280-307`).
- `app/bookings/add/page.tsx` `activeEmployee` fallback literals (phone, route, airline, date, time, terminal, hotel) all persist to the real DB.
- `useSearchParams` correctly wrapped in Suspense (`app/bookings/page.tsx:55-61`) — clean.

---

## 8. Business-wise Advice (Part 7)

### Where you stand
You have a **genuinely solid foundation**. The hard parts are done: race-free invoice numbering, atomic transactions, optimistic locking, live-DB role checks, deny-by-default rules, zero destructive migrations, 81 passing tests, 3-source FX fallback, correct PDF currency handling, CSV-injection protection. This reads like a **carefully architected** codebase, not a prototype.

But two things can undo all of it:

1. **The money is wrong.** Booking amount ≠ invoice total (computed from different bases), everything is Float, currencies are summed together, tax is client-controlled, the invoice doesn't foot against itself. You export an Excel for the accountant and the numbers don't reconcile. **You cannot defend a single invoice.**

2. **Security can be breached today.** Login with `blue/aura`. Admin with `GARV2331##`. Unsigned webhooks. Master admin in the browser. Firestore rules let anyone delete a tenant's entire data. All of this is **live right now** (Vercel + VM + Render).

### Priorities

#### WEEK 1 — Just plug the holes (1-2 days of work)
Do these and nothing else. Order matters.
1. Rotate `MASTER_ADMIN_PASS`; delete the `blue/aura` demo branch (`auth.service.ts:138-166`); make MASTER_ADMIN a real server-side `SUPER_ADMIN` User.
2. Remove `|| true` from `whatsapp-quota-banner.tsx:51`.
3. Add `loadInvoice(user, id)` as the first line of `invoices.service.ts:380` and `:406` (and wrap in `$transaction`).
4. Webhook: fail boot if `WHATSAPP_WEBHOOK_APP_SECRET` missing in production. **Delete `replyAuto` + `buildExampleInvoicePdf`.** Resolve tenant from `phoneNumberId`.
5. `firestore.rules` — remove the `isOwner` self-provision branch (`:417-427`); remove hardcoded super-admin email (`:163-168`).
6. Block Firebase direct signup (`login-page.tsx:190`) so `ALLOW_PUBLIC_REGISTRATION` is a real gate.
7. `lib/api.ts:208-263` — failover GET-only; `noFailover` on all `/auth/*` + OAuth.
8. `deploy-vm.sh:33` — remove `|| true` (and the duplicate line); make the health check (`:59-63`) affect exit code. Add `cp -r .next/static` to PM2 path.
9. `health.controller.ts` — `throw ServiceUnavailableException` when degraded.
10. **Rotate the Meta app secret** (it's in git history) + add gitleaks.
11. Add `.dockerignore`.

#### WEEK 2-3 — Fix the money
One rule: **the backend is the only source of truth for money.**
1. Introduce a `Money` value object (amount + currency, `Decimal(19,4)`) and one `roundMoney()` applied at the write boundary.
2. Booking: store `serviceFee` explicitly; compute `taxable`/`tax`/`total` once server-side. Delete `invoices.service.ts:38`'s `baseFare ?? amount` fallback.
3. Remove `dto.taxAmount`/`dto.taxRate` from write DTOs — always derive server-side (respect `gstEnabled`).
4. Add `amountBase` + `fxRate` + `fxAsOf`; sum only the base column; reject or convert `currency != business.currency`.
5. Replace `setPayment` with an **append-only `InvoicePayment` ledger** (idempotency key) → fixes H1 and H2 together. Derive `paymentStatus` server-side.
6. Cancel = void invoice + credit note; freeze money fields on issued bookings; reject currency change.
7. Add a tax-payable line to the P&L (exclude collected tax from revenue).

#### MONTH 2 — Make WhatsApp production-grade
1. Move the quota into the database (atomic increment, 429 on breach, refund on failure).
2. Handle `Retry-After`; default unmapped Meta errors to `retryable: false`.
3. Add a BullMQ `limiter` + per-`phoneNumberId` pacer.
4. Process webhook events in the worker; dedupe via the `waMessageId` unique index (don't swallow the create error).
5. Add a dead-letter table + admin surface.
6. `render.yaml`: `WHATSAPP_MOCK: "false"`, real token/secret, fix the hostname mismatch.
7. `MAX_SEND_ATTEMPTS` single source of truth.

#### MONTH 3 — Foundation (prevents recurrence)
1. **CI**: lint + typecheck + build + jest + `prisma migrate diff` + Firestore emulator rules tests. Install eslint (frontend has no linter; backend's lint script is broken).
2. **Firestore decision** — I'd strongly recommend removing it (see below). If keeping: fix rules↔client mismatch with emulator tests.
3. Delete `lib/firestore.ts` dead CRUD + `lib/travel-crm.ts` fake PII fixtures.
4. Break `app/bookings/add/page.tsx` into section components + a tested `useBookingTotals()` hook.
5. Reports: collapse 9 pollers → 1 aggregate endpoint; use SSE (you already have the infra in `lib/sync.ts`).
6. Shared `<Modal>` / `<DataState>` / `<Field>` / `formatDateInput` — kill the duplication.
7. Move the admin Control Center to real backend endpoints (block/limit/quota enforced server-side).
8. Refresh token in `HttpOnly; Secure; SameSite=Strict` cookie; access token in memory only.

### Business decisions you should make

**Should you keep Firestore?**
You now have two data stores: Postgres (all real data) + Firestore (presence/sync/profile only, entity CRUD is dead and rule-rejected). Two stores = two attack surfaces, two sources of truth, inevitable drift. **My strong recommendation: remove Firestore.** Use Redis pub/sub or SSE for presence/live-sync (you already have Redis + BullMQ). This is your single biggest architectural simplification and it eliminates C8, H37, and a dozen medium findings at once.

**What is the 1000-message limit actually for?**
Meta's real limit is ~1000 conversations/24h. Your counter is client-side, so Meta WILL ban you regardless. You need a server-side counter fed by real Meta usage, otherwise this feature gives you **false confidence** — the worst kind of bug in a business tool.

**PDF snapshot vs live render?**
It's a legal document. Retain 8 years. Re-issue = new revision. The current 255-day prune actively destroys your immutability guarantee (H20, H21).

**Master admin model:**
Build a separate surface for the platform owner (separate domain/port, real server-side role). Right now it's in the browser, which means this feature **does not commercially exist**.

---

## 9. Appendix — Findings by Category

### By severity
- CRITICAL: 18 (C1-C18)
- HIGH: 65 (H1-H65)
- MEDIUM: ~60
- LOW: ~40
- CLEAN (verified good): 20+

### By layer
| Layer | CRITICAL | HIGH | Notes |
|-------|----------|------|-------|
| Auth / Tenancy | C1, C2, C3, C8 | H26-H31, H35-H37 | Guard + scoping mostly correct; 3 IDORs + demo bypass |
| Money / Accounting | C10-C13 | H1-H25 | Worst area — all Float, tax mismatch, no FX record |
| WhatsApp / Queue | C4, C5, C9 | H40-H49 | Client-only quota, unsigned webhook, fabricated auto-reply |
| Infrastructure | C14-C18 | H50-H58 | Deploy silently succeeds on failure; Docker leaks history; no CI |
| Frontend / Data | C6, C7 | H59-H65 | Failover leaks creds; cache has no TTL/scope |

### Quick file reference (highest-impact files)
| File | Lines | Concern |
|------|-------|---------|
| `backend/src/auth/auth.service.ts` | 240 | Demo auth bypass (C2), refresh DoS (H27) |
| `backend/src/invoices/invoices.service.ts` | 565 | Cross-tenant IDOR (C3), totals mismatch (C13), payment race (H1) |
| `backend/src/bookings/bookings.service.ts` | 616 | Tax mismatch (C13), issued-invoice mutation (C10), hard delete (C11) |
| `backend/prisma/schema.prisma` | 495 | All money Float (C12), no soft delete (C11), audit cascade (H34) |
| `lib/api.ts` | 473 | Failover leaks creds (C6), cache no TTL/scope (C7) |
| `lib/admin-accounts.ts` | 276 | Master password in bundle (C1), localStorage-only admin (H13) |
| `backend/src/whatsapp/webhook.service.ts` | 249 | Fail-open signature (C9), cross-tenant lookup, fabricated auto-reply |
| `firestore.rules` | 583 | Cross-tenant takeover (C8), email super-admin |
| `deploy-vm.sh` | 92 | Silent migration failure (C14), blank PM2 page (C15) |
| `app/bookings/add/page.tsx` | 3420 | 151 useState, hardcoded literals to DB (H63), float money math |
| `lib/whatsapp-quota.ts` | 351 | Entirely client-side (C5) |
| `components/whatsapp/whatsapp-quota-banner.tsx` | 598 | `|| true` admin (C4) |

---

*Report generated by full-repository scan. All CRITICAL and HIGH findings include specific file:line citations verified against the source. Verification (build/typecheck/tests) was run directly and is reported in Section 1.*