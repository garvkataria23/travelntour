"use client";

import { getStoredStaff, getStoredStaffBookings, type StaffBookingItem } from "@/lib/staff-management";
import { getStoredUser } from "@/lib/api";

const LOCAL_CUSTOMERS_KEY = "fc_local_customers_v2";
const LOCAL_INVOICES_KEY = "fc_local_invoices_v2";
const LOCAL_EXPENSES_KEY = "fc_local_expenses_v2";
const LOCAL_INCOMES_KEY = "fc_local_incomes_v2";
const LOCAL_TEMPLATES_KEY = "fc_local_templates_v2";
const LOCAL_MESSAGES_KEY = "fc_local_messages_v2";
const LOCAL_SETTINGS_KEY = "fc_local_settings_v2";
const LOCAL_AUTOMATION_KEY = "fc_local_automation_v2";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDateOffset(daysOffset: number): string {
  const d = new Date(Date.now() + daysOffset * 86400000);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

const DEFAULT_CUSTOMERS = [
  {
    id: "cust_1",
    name: "Vikramaditya Singhania",
    phone: "+971504829103",
    email: "vikram.singhania@emiratescorp.ae",
    status: "ACTIVE",
    totalBookings: 4,
    totalSpent: 18450,
    lastBookingDate: isoDateOffset(-2),
    createdAt: new Date(Date.now() - 45 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    version: 1,
  },
  {
    id: "cust_2",
    name: "Sheikh Khalid Al-Mansoor",
    phone: "+971529104821",
    email: "khalid.mansoor@dubaiventures.ae",
    status: "ACTIVE",
    totalBookings: 3,
    totalSpent: 24600,
    lastBookingDate: isoDateOffset(-1),
    createdAt: new Date(Date.now() - 38 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    version: 1,
  },
  {
    id: "cust_3",
    name: "Ananya Deshmukh",
    phone: "+919820419283",
    email: "ananya.deshmukh@gmail.com",
    status: "ACTIVE",
    totalBookings: 2,
    totalSpent: 4930,
    lastBookingDate: isoDateOffset(0),
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
  },
  {
    id: "cust_4",
    name: "Mohammed Al-Hashemi",
    phone: "+971558392011",
    email: "m.alhashemi@adnoc-partner.ae",
    status: "ACTIVE",
    totalBookings: 2,
    totalSpent: 11200,
    lastBookingDate: isoDateOffset(1),
    createdAt: new Date(Date.now() - 25 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
  },
  {
    id: "cust_5",
    name: "Neha & Siddharth Kapoor",
    phone: "+919811223344",
    email: "siddharth.kapoor@techglobal.in",
    status: "ACTIVE",
    totalBookings: 2,
    totalSpent: 8900,
    lastBookingDate: isoDateOffset(2),
    createdAt: new Date(Date.now() - 18 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
  },
  {
    id: "cust_6",
    name: "Fatima Al-Zahra",
    phone: "+971562291044",
    email: "fatima.zahra@sharjahgroup.ae",
    status: "ACTIVE",
    totalBookings: 1,
    totalSpent: 3250,
    lastBookingDate: isoDateOffset(3),
    createdAt: new Date(Date.now() - 12 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
  },
];

const DEFAULT_EXPENSES = [
  {
    id: "exp_1",
    title: "IATA BSP GDS Ticketing Settlement",
    category: "Flight Consolidation",
    amount: 8400,
    currency: "AED",
    date: isoDateOffset(-3),
    notes: "Weekly GDS settlement for Emirates & Qatar Airways PNR blocks",
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  {
    id: "exp_2",
    title: "Meta WhatsApp Cloud API Conversation Credits",
    category: "Marketing & Automation",
    amount: 420,
    currency: "AED",
    date: isoDateOffset(-2),
    notes: "Automated PNR confirmation & 24h boarding reminder dispatches",
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: "exp_3",
    title: "Dubai Marina Branch Office Lease & DEWA",
    category: "Office & Operations",
    amount: 3500,
    currency: "AED",
    date: isoDateOffset(-1),
    notes: "Monthly operational utility & workspace allocation",
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
];

const DEFAULT_INCOMES = [
  {
    id: "inc_1",
    title: "Emirates First Class PNR EK9482 Corporate Settlement",
    source: "Corporate Ticketing",
    category: "TICKET_SALE",
    amount: 14200,
    currency: "AED",
    date: isoDateOffset(-2),
    notes: "Paid via Corporate Bank Transfer — Vikramaditya Singhania",
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: "inc_2",
    title: "Qatar Airways VIP Charter & Visa Handling Commission",
    source: "Airline Commission",
    category: "COMMISSION",
    amount: 6850,
    currency: "AED",
    date: isoDateOffset(-1),
    notes: "Q1 GDS Override & Ancillary Baggage Commission",
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
  {
    id: "inc_3",
    title: "IndiGo & Air India Group Booking Margin",
    source: "Retail Desk",
    category: "TICKET_SALE",
    amount: 4930,
    currency: "AED",
    date: isoDateOffset(0),
    notes: "Settled via Stripe Payment Link",
    createdAt: new Date().toISOString(),
  },
];

const DEFAULT_TEMPLATES = [
  {
    id: "tpl_1",
    name: "Booking Confirmation & E-Ticket",
    type: "BOOKING_CONFIRMATION",
    category: "UTILITY",
    status: "APPROVED",
    language: "en",
    content:
      "Hello {{customerName}}, your flight {{flightNumber}} ({{airline}}) from {{from}} to {{to}} on {{departureDate}} at {{departureTime}} is CONFIRMED! PNR: {{pnr}}. Thank you for flying with FlyConnect.",
    variables: ["customerName", "flightNumber", "airline", "from", "to", "departureDate", "departureTime", "pnr"],
    updatedAt: new Date().toISOString(),
  },
  {
    id: "tpl_2",
    name: "24-Hour Web Check-In & Boarding Reminder",
    type: "REMINDER_24H",
    category: "UTILITY",
    status: "APPROVED",
    language: "en",
    content:
      "Reminder: Hi {{customerName}}, your flight {{flightNumber}} from {{from}} to {{to}} departs tomorrow ({{departureDate}} at {{departureTime}}). PNR: {{pnr}}. Web check-in is now open!",
    variables: ["customerName", "flightNumber", "from", "to", "departureDate", "departureTime", "pnr"],
    updatedAt: new Date().toISOString(),
  },
  {
    id: "tpl_3",
    name: "3-Hour Airport Terminal & Gate Alert",
    type: "REMINDER_3H",
    category: "UTILITY",
    status: "APPROVED",
    language: "en",
    content:
      "Safe travels {{customerName}}! Your flight {{flightNumber}} ({{airline}}) departs in 3 hours at {{departureTime}}. Please proceed to the check-in counter with your passport and PNR {{pnr}}.",
    variables: ["customerName", "flightNumber", "airline", "departureTime", "pnr"],
    updatedAt: new Date().toISOString(),
  },
];

const DEFAULT_MESSAGES = [
  {
    id: "msg_1",
    customerId: "cust_1",
    customerName: "Vikramaditya Singhania",
    customerPhone: "+971504829103",
    type: "BOOKING_CONFIRMATION",
    status: "DELIVERED",
    content:
      "Hello Vikramaditya Singhania, your flight EK-504 (Emirates) from DXB to BOM is CONFIRMED! PNR: EK9482.",
    sentAt: new Date(Date.now() - 3600 * 1000 * 5).toISOString(),
    createdAt: new Date(Date.now() - 3600 * 1000 * 5).toISOString(),
  },
  {
    id: "msg_2",
    customerId: "cust_2",
    customerName: "Sheikh Khalid Al-Mansoor",
    customerPhone: "+971529104821",
    type: "REMINDER_24H",
    status: "READ",
    content:
      "Reminder: Hi Sheikh Khalid Al-Mansoor, your flight QR-1003 from DXB to LHR departs tomorrow. PNR: QR7731.",
    sentAt: new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
    createdAt: new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
  },
  {
    id: "msg_3",
    customerId: "cust_3",
    customerName: "Ananya Deshmukh",
    customerPhone: "+919820419283",
    type: "BOOKING_CONFIRMATION",
    status: "SCHEDULED",
    content:
      "Hello Ananya Deshmukh, your flight 6E-1408 (IndiGo) from DEL to DXB is scheduled. PNR: 6E3319.",
    scheduledAt: new Date(Date.now() + 3600 * 1000 * 4).toISOString(),
    createdAt: new Date(Date.now() - 3600 * 1000).toISOString(),
  },
];

function readStore<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      window.localStorage.setItem(key, JSON.stringify(fallback));
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStore<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage quota errors
  }
}

function toApiBookingRow(b: StaffBookingItem, index: number) {
  const parts = (b.route || "DXB → BOM").split(/→|->|-/).map((s) => s.trim());
  const fromCode = parts[0] || "DXB";
  const toCode = parts[1] || "LHR";
  const depDate = b.departureDate ? b.departureDate.slice(0, 10) : isoDateOffset(index % 4);
  return {
    id: b.id,
    pnr: b.pnr,
    referenceNumber: b.referenceNumber || `REF-${b.pnr}`,
    customerId: `cust_${(index % 6) + 1}`,
    customerName: b.customerName,
    customerPhone: b.customerPhone || "+971504829103",
    flightNumber: b.flightNumber,
    airline: b.airline,
    fromAirport: fromCode,
    fromCity: fromCode,
    toAirport: toCode,
    toCity: toCode,
    departureDate: depDate,
    departureTime: "10:30 AM",
    status: b.status || "CONFIRMED",
    amount: Number(b.amount || 0),
    currency: b.currency || "AED",
    invoiceNumber: `INV-2026-${String(index + 101).padStart(4, "0")}`,
    source: "GDS Direct",
    version: 1,
    createdBy: b.staffId || "staff_super_admin",
    creatorName: b.staffName || "Garv Kataria",
    creatorEmail: b.staffEmail || "admin@flyconnect.com",
    creatorRole: b.staffRole || "SUPER_ADMIN",
    createdAt: b.createdAt || new Date().toISOString(),
    updatedAt: b.createdAt || new Date().toISOString(),
    customer: {
      id: `cust_${(index % 6) + 1}`,
      name: b.customerName,
      phone: b.customerPhone || "+971504829103",
      email: "traveller@flyconnect.com",
    },
  };
}

export function isLocalStaffToken(token?: string | null): boolean {
  if (!token) return false;
  return token.startsWith("fc_staff_tok_");
}

export function handleLocalApiFallback<T>(
  rawPath: string,
  options: { method?: string; body?: any } = {},
): T {
  const method = (options.method || "GET").toUpperCase();
  const [pathname, queryString] = rawPath.split("?");
  const params = new URLSearchParams(queryString || "");
  const cleanPath = pathname.replace(/\/+$/, "") || "/";
  const currentUser = getStoredUser();

  const staffBookings = getStoredStaffBookings();
  const allBookings = staffBookings.map((b, i) => toApiBookingRow(b, i));
  const customers = readStore(LOCAL_CUSTOMERS_KEY, DEFAULT_CUSTOMERS);
  const expenses = readStore(LOCAL_EXPENSES_KEY, DEFAULT_EXPENSES);
  const incomes = readStore(LOCAL_INCOMES_KEY, DEFAULT_INCOMES);
  const templates = readStore(LOCAL_TEMPLATES_KEY, DEFAULT_TEMPLATES);
  const messages = readStore(LOCAL_MESSAGES_KEY, DEFAULT_MESSAGES);

  // 1. /settings
  if (cleanPath === "/settings") {
    const defaultSettings = {
      business: {
        id: currentUser?.businessId || "biz_flyconnect_hq",
        name: "FlyConnect Concierge & Tours LLC",
        email: currentUser?.email || "admin@flyconnect.com",
        phone: "+971501234567",
        timezone: "Asia/Dubai",
        currency: "AED",
      },
      automationEnabled: true,
      reminder7d: true,
      reminder3d: true,
      reminder24h: true,
      reminder3h: true,
      whatsappConnected: true,
      whatsappPhoneId: "10592839104",
      whatsappBusinessId: "99482716253",
    };
    const stored = readStore(LOCAL_SETTINGS_KEY, defaultSettings);
    if (method === "PATCH" || method === "POST" || method === "PUT") {
      const body = options.body || {};
      const next = {
        ...stored,
        ...body,
        business: {
          ...stored.business,
          ...(body.businessName ? { name: body.businessName } : {}),
          ...(body.email ? { email: body.email } : {}),
          ...(body.phone ? { phone: body.phone } : {}),
          ...(body.timezone ? { timezone: body.timezone } : {}),
          ...(body.currency ? { currency: body.currency } : {}),
        },
      };
      writeStore(LOCAL_SETTINGS_KEY, next);
      return next as unknown as T;
    }
    return stored as unknown as T;
  }

  // 2. /automation
  if (cleanPath === "/automation" || cleanPath.startsWith("/automation/")) {
    const defaultAuto = {
      automationEnabled: true,
      reminder7d: true,
      reminder3d: true,
      reminder24h: true,
      reminder3h: true,
      sendBookingConfirmation: true,
      sendCancellationNotice: true,
      sendRescheduleNotice: true,
      stats: {
        scheduledCount: 14,
        sentToday: 28,
        deliveryRate: 99.2,
      },
      rules: [
        { id: "rule_confirm", name: "Instant PNR Confirmation", trigger: "ON_BOOKING_CREATED", enabled: true },
        { id: "rule_24h", name: "24-Hour Web Check-in Alert", trigger: "24H_BEFORE_DEPARTURE", enabled: true },
        { id: "rule_3h", name: "3-Hour Terminal & Gate Reminder", trigger: "3H_BEFORE_DEPARTURE", enabled: true },
      ],
    };
    const stored = readStore(LOCAL_AUTOMATION_KEY, defaultAuto);
    if (method !== "GET") {
      const next = { ...stored, ...(options.body || {}) };
      writeStore(LOCAL_AUTOMATION_KEY, next);
      return next as unknown as T;
    }
    return stored as unknown as T;
  }

  // 3. /bookings/stats
  if (cleanPath === "/bookings/stats") {
    const todayIso = isoDateOffset(0);
    const total = allBookings.length;
    const today = allBookings.filter((b) => b.departureDate === todayIso).length || 2;
    const upcoming = allBookings.filter((b) => b.departureDate >= todayIso && b.status !== "CANCELLED").length;
    const pending = allBookings.filter((b) => b.status === "PENDING").length;
    const cancelled = allBookings.filter((b) => b.status === "CANCELLED").length;
    return { total, today, upcoming, pending, cancelled } as unknown as T;
  }

  // 4. /bookings/airlines
  if (cleanPath === "/bookings/airlines") {
    const counts = new Map<string, number>();
    for (const b of allBookings) {
      const name = b.airline || "Emirates";
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count })) as unknown as T;
  }

  // 5. /bookings/:id/cancel or /bookings/:id/reschedule or /bookings/:id
  if (cleanPath.startsWith("/bookings/")) {
    const parts = cleanPath.split("/").filter(Boolean);
    const id = parts[1];
    const action = parts[2];

    if (action === "cancel" && method === "POST") {
      const updated = staffBookings.map((b) => (b.id === id ? { ...b, status: "CANCELLED" } : b));
      writeStore("fc_staff_bookings_attribution_v2", updated);
      return { id, status: "CANCELLED" } as unknown as T;
    }

    if (action === "reschedule" && method === "POST") {
      const body = options.body || {};
      const updated = staffBookings.map((b) =>
        b.id === id ? { ...b, departureDate: body.departureDate || b.departureDate } : b,
      );
      writeStore("fc_staff_bookings_attribution_v2", updated);
      return { id, departureDate: body.departureDate } as unknown as T;
    }

    const found = allBookings.find((b) => b.id === id) || allBookings[0];
    if (method === "PATCH" || method === "PUT") {
      const body = options.body || {};
      const updated = staffBookings.map((b) =>
        b.id === id
          ? {
              ...b,
              pnr: body.pnr ?? b.pnr,
              status: body.status ?? b.status,
              amount: body.amount !== undefined ? Number(body.amount) : b.amount,
              flightNumber: body.flightNumber ?? b.flightNumber,
              airline: body.airline ?? b.airline,
              departureDate: body.departureDate ?? b.departureDate,
            }
          : b,
      );
      writeStore("fc_staff_bookings_attribution_v2", updated);
      return { ...found, ...body } as unknown as T;
    }

    return found as unknown as T;
  }

  // 6. /bookings (GET list or POST create)
  if (cleanPath === "/bookings") {
    if (method === "POST") {
      const body = options.body || {};
      const newId = `bk_${Date.now()}`;
      const newRow = {
        id: newId,
        pnr: (body.pnr || `PNR${Math.floor(1000 + Math.random() * 9000)}`).toUpperCase(),
        referenceNumber: body.referenceNumber || null,
        flightNumber: body.flightNumber || "EK-500",
        airline: body.airline || "Emirates",
        fromAirport: body.from || body.fromAirport || "DXB",
        fromCity: body.fromCity || body.from || "Dubai",
        toAirport: body.to || body.toAirport || "LHR",
        toCity: body.toCity || body.to || "London",
        departureDate: body.departureDate || isoDateOffset(2),
        departureTime: body.departureTime || "10:30 AM",
        status: body.status || "CONFIRMED",
        amount: Number(body.amount || 1850),
        currency: body.currency || "AED",
        customerName: body.customerName || "Valued Traveller",
        customerPhone: body.customerPhone || "+971500000000",
        createdBy: currentUser?.id || "staff_super_admin",
        creatorName: currentUser?.name || "Garv Kataria",
        creatorEmail: currentUser?.email || "admin@flyconnect.com",
        creatorRole: currentUser?.role || "SUPER_ADMIN",
        createdAt: new Date().toISOString(),
      };
      return newRow as unknown as T;
    }

    let filtered = [...allBookings];
    const search = (params.get("search") || "").toLowerCase().trim();
    const status = params.get("status") || "";
    const airline = params.get("airline") || "";
    const from = params.get("from") || "";
    const to = params.get("to") || "";

    if (search) {
      filtered = filtered.filter(
        (b) =>
          b.pnr.toLowerCase().includes(search) ||
          b.customerName.toLowerCase().includes(search) ||
          (b.flightNumber || "").toLowerCase().includes(search) ||
          (b.airline || "").toLowerCase().includes(search),
      );
    }
    if (status) {
      filtered = filtered.filter((b) => b.status === status);
    }
    if (airline) {
      filtered = filtered.filter((b) => b.airline === airline);
    }
    if (from) {
      filtered = filtered.filter((b) => b.departureDate >= from);
    }
    if (to) {
      filtered = filtered.filter((b) => b.departureDate <= to);
    }

    const page = Math.max(1, Number(params.get("page") || 1));
    const limit = Math.max(1, Number(params.get("limit") || 10));
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const items = filtered.slice((page - 1) * limit, page * limit);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    } as unknown as T;
  }

  // 7. /customers/stats, /customers/:id, /customers
  if (cleanPath === "/customers/stats") {
    return {
      total: customers.length,
      active: customers.filter((c) => c.status === "ACTIVE").length,
      inactive: customers.filter((c) => c.status !== "ACTIVE").length,
      repeatCustomers: customers.filter((c) => (c.totalBookings || 0) > 1).length,
    } as unknown as T;
  }

  if (cleanPath.startsWith("/customers/")) {
    const id = cleanPath.split("/")[2];
    const existing = customers.find((c) => c.id === id) || customers[0];
    if (method === "PATCH" || method === "PUT") {
      const body = options.body || {};
      const updated = customers.map((c) => (c.id === id ? { ...c, ...body, version: (c.version || 1) + 1 } : c));
      writeStore(LOCAL_CUSTOMERS_KEY, updated);
      return { ...existing, ...body } as unknown as T;
    }
    if (method === "DELETE") {
      const updated = customers.filter((c) => c.id !== id);
      writeStore(LOCAL_CUSTOMERS_KEY, updated);
      return { deleted: true } as unknown as T;
    }
    return {
      ...existing,
      bookings: allBookings.slice(0, 3),
      messages: messages.slice(0, 3),
    } as unknown as T;
  }

  if (cleanPath === "/customers") {
    if (method === "POST") {
      const body = options.body || {};
      const created = {
        id: `cust_${Date.now()}`,
        name: body.name || "New Customer",
        phone: body.phone || "+971500000000",
        email: body.email || null,
        status: body.status || "ACTIVE",
        totalBookings: 0,
        totalSpent: 0,
        lastBookingDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };
      writeStore(LOCAL_CUSTOMERS_KEY, [created, ...customers]);
      return created as unknown as T;
    }

    const search = (params.get("search") || "").toLowerCase().trim();
    const status = params.get("status") || "";
    let filtered = [...customers];
    if (search) {
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(search) ||
          c.phone.toLowerCase().includes(search) ||
          (c.email || "").toLowerCase().includes(search),
      );
    }
    if (status) {
      filtered = filtered.filter((c) => c.status === status);
    }
    const page = Math.max(1, Number(params.get("page") || 1));
    const limit = Math.max(1, Number(params.get("limit") || 10));
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return {
      items: filtered.slice((page - 1) * limit, page * limit),
      meta: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
    } as unknown as T;
  }

  // 8. /invoices
  if (cleanPath === "/invoices" || cleanPath.startsWith("/invoices/")) {
    const defaultInvoices = allBookings.map((b, idx) => ({
      id: `inv_${b.id}`,
      invoiceNumber: b.invoiceNumber || `INV-2026-${1001 + idx}`,
      bookingId: b.id,
      pnr: b.pnr,
      customerName: b.customerName,
      customerPhone: b.customerPhone,
      customerEmail: "traveller@flyconnect.com",
      flightNumber: b.flightNumber,
      airline: b.airline,
      route: `${b.fromAirport} → ${b.toAirport}`,
      departureDate: b.departureDate,
      subtotal: b.amount,
      tax: 0,
      discount: 0,
      totalAmount: b.amount,
      amount: b.amount,
      currency: b.currency || "AED",
      paymentStatus: b.status === "CONFIRMED" || b.status === "COMPLETED" ? "PAID" : "UNPAID",
      status: b.status === "CONFIRMED" || b.status === "COMPLETED" ? "PAID" : "PENDING",
      issuedAt: b.createdAt,
      createdAt: b.createdAt,
    }));
    const invoices = readStore(LOCAL_INVOICES_KEY, defaultInvoices);

    if (method === "POST") {
      const body = options.body || {};
      const created = {
        id: `inv_${Date.now()}`,
        invoiceNumber: body.invoiceNumber || `INV-2026-${Math.floor(1000 + Math.random() * 9000)}`,
        customerName: body.customerName || "Valued Customer",
        customerPhone: body.customerPhone || "+971500000000",
        pnr: body.pnr || "PNR100",
        amount: Number(body.amount || body.totalAmount || 1500),
        totalAmount: Number(body.totalAmount || body.amount || 1500),
        currency: body.currency || "AED",
        paymentStatus: body.paymentStatus || "PAID",
        status: body.status || "PAID",
        issuedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      writeStore(LOCAL_INVOICES_KEY, [created, ...invoices]);
      return created as unknown as T;
    }

    if (cleanPath.startsWith("/invoices/")) {
      const id = cleanPath.split("/")[2];
      if (method === "DELETE") {
        writeStore(
          LOCAL_INVOICES_KEY,
          invoices.filter((inv) => inv.id !== id),
        );
        return { deleted: true } as unknown as T;
      }
      if (method === "PATCH" || method === "PUT") {
        const body = options.body || {};
        const updated = invoices.map((inv) => (inv.id === id ? { ...inv, ...body } : inv));
        writeStore(LOCAL_INVOICES_KEY, updated);
        return updated.find((inv) => inv.id === id) as unknown as T;
      }
      return (invoices.find((inv) => inv.id === id) || invoices[0]) as unknown as T;
    }

    return {
      items: invoices,
      meta: {
        total: invoices.length,
        page: 1,
        limit: 50,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      },
    } as unknown as T;
  }

  // 9. /expenses & /expenses/stats
  if (cleanPath === "/expenses/stats") {
    const total = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    return {
      totalAmount: total,
      count: expenses.length,
      thisMonth: total,
      categories: [
        { category: "Flight Consolidation", amount: 8400 },
        { category: "Office & Operations", amount: 3500 },
        { category: "Marketing & Automation", amount: 420 },
      ],
    } as unknown as T;
  }

  if (cleanPath === "/expenses" || cleanPath.startsWith("/expenses/")) {
    if (method === "POST") {
      const body = options.body || {};
      const created = {
        id: `exp_${Date.now()}`,
        title: body.title || body.description || "Operational Expense",
        category: body.category || "Operations",
        amount: Number(body.amount || 0),
        currency: body.currency || "AED",
        date: body.date || isoDateOffset(0),
        notes: body.notes || "",
        createdAt: new Date().toISOString(),
      };
      writeStore(LOCAL_EXPENSES_KEY, [created, ...expenses]);
      return created as unknown as T;
    }
    if (cleanPath.startsWith("/expenses/")) {
      const id = cleanPath.split("/")[2];
      if (method === "DELETE") {
        writeStore(
          LOCAL_EXPENSES_KEY,
          expenses.filter((e) => e.id !== id),
        );
        return { deleted: true } as unknown as T;
      }
      if (method === "PATCH" || method === "PUT") {
        const body = options.body || {};
        const updated = expenses.map((e) => (e.id === id ? { ...e, ...body } : e));
        writeStore(LOCAL_EXPENSES_KEY, updated);
        return updated.find((e) => e.id === id) as unknown as T;
      }
    }
    const totalAmount = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    return {
      items: expenses,
      totalAmount,
      meta: { total: expenses.length, page: 1, limit: 50, totalPages: 1, hasNextPage: false, hasPrevPage: false },
    } as unknown as T;
  }

  // 10. /incomes
  if (cleanPath === "/incomes" || cleanPath.startsWith("/incomes/")) {
    if (method === "POST") {
      const body = options.body || {};
      const created = {
        id: `inc_${Date.now()}`,
        title: body.title || body.source || "Agency Revenue",
        source: body.source || body.category || "Direct Booking",
        category: body.category || "TICKET_SALE",
        amount: Number(body.amount || 0),
        currency: body.currency || "AED",
        date: body.date || isoDateOffset(0),
        notes: body.notes || "",
        createdAt: new Date().toISOString(),
      };
      writeStore(LOCAL_INCOMES_KEY, [created, ...incomes]);
      return created as unknown as T;
    }
    if (cleanPath.startsWith("/incomes/")) {
      const id = cleanPath.split("/")[2];
      if (method === "DELETE") {
        writeStore(
          LOCAL_INCOMES_KEY,
          incomes.filter((inc) => inc.id !== id),
        );
        return { deleted: true } as unknown as T;
      }
      if (method === "PATCH" || method === "PUT") {
        const body = options.body || {};
        const updated = incomes.map((inc) => (inc.id === id ? { ...inc, ...body } : inc));
        writeStore(LOCAL_INCOMES_KEY, updated);
        return updated.find((inc) => inc.id === id) as unknown as T;
      }
    }
    const totalAmount = incomes.reduce((s, inc) => s + Number(inc.amount || 0), 0);
    return {
      items: incomes,
      totalAmount,
      meta: { total: incomes.length, page: 1, limit: 50, totalPages: 1, hasNextPage: false, hasPrevPage: false },
    } as unknown as T;
  }

  // 11. /templates
  if (cleanPath === "/templates" || cleanPath.startsWith("/templates/")) {
    if (method === "POST") {
      const body = options.body || {};
      const created = {
        id: `tpl_${Date.now()}`,
        name: body.name || "Custom WhatsApp Template",
        type: body.type || "CUSTOM",
        category: body.category || "UTILITY",
        status: "APPROVED",
        language: body.language || "en",
        content: body.content || body.body || "",
        variables: body.variables || ["customerName", "pnr"],
        updatedAt: new Date().toISOString(),
      };
      writeStore(LOCAL_TEMPLATES_KEY, [created, ...templates]);
      return created as unknown as T;
    }
    if (cleanPath.startsWith("/templates/")) {
      const parts = cleanPath.split("/").filter(Boolean);
      const id = parts[1];
      if (method === "DELETE") {
        writeStore(
          LOCAL_TEMPLATES_KEY,
          templates.filter((t) => t.id !== id),
        );
        return { deleted: true } as unknown as T;
      }
      if (method === "PATCH" || method === "PUT") {
        const body = options.body || {};
        const statusOverride = parts[2] === "status" ? parts[3] : undefined;
        const updated = templates.map((t) =>
          t.id === id ? { ...t, ...body, ...(statusOverride ? { status: statusOverride } : {}) } : t,
        );
        writeStore(LOCAL_TEMPLATES_KEY, updated);
        return updated.find((t) => t.id === id) as unknown as T;
      }
    }
    return {
      items: templates,
      meta: { total: templates.length, page: 1, limit: 50, totalPages: 1, hasNextPage: false, hasPrevPage: false },
    } as unknown as T;
  }

  // 12. /messages
  if (cleanPath === "/messages" || cleanPath.startsWith("/messages/")) {
    if (method === "POST") {
      const body = options.body || {};
      const cust = customers.find((c) => c.id === body.customerId) || customers[0];
      const created = {
        id: `msg_${Date.now()}`,
        customerId: cust?.id || "cust_1",
        customerName: body.customerName || cust?.name || "Traveller",
        customerPhone: body.phone || cust?.phone || "+971504829103",
        type: body.type || "CUSTOM",
        status: "DELIVERED",
        content: body.text || body.content || "WhatsApp notification dispatched.",
        sentAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      writeStore(LOCAL_MESSAGES_KEY, [created, ...messages]);
      return created as unknown as T;
    }
    if (cleanPath.startsWith("/messages/")) {
      const id = cleanPath.split("/")[2];
      return (messages.find((m) => m.id === id) || messages[0]) as unknown as T;
    }
    return {
      items: messages,
      stats: {
        total: messages.length,
        sent: messages.length,
        delivered: messages.filter((m) => m.status === "DELIVERED" || m.status === "READ").length,
        pending: messages.filter((m) => m.status === "SCHEDULED" || m.status === "PENDING").length,
        failed: 0,
      },
      meta: { total: messages.length, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false },
    } as unknown as T;
  }

  // 13. /reports/*
  if (cleanPath.startsWith("/reports/")) {
    const totalRev = allBookings
      .filter((b) => b.status !== "CANCELLED")
      .reduce((s, b) => s + Number(b.amount || 0), 0);
    const totalExp = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);

    if (cleanPath === "/reports/overview") {
      return {
        bookings: {
          total: allBookings.length,
          today: 2,
          upcoming: allBookings.filter((b) => b.status !== "CANCELLED").length,
          confirmed: allBookings.filter((b) => b.status === "CONFIRMED").length,
          pending: allBookings.filter((b) => b.status === "PENDING").length,
          cancelled: allBookings.filter((b) => b.status === "CANCELLED").length,
        },
        customers: { total: customers.length, active: customers.length },
        messages: {
          total: messages.length,
          sent: messages.length,
          pending: 1,
          failed: 0,
          delivered: messages.length - 1,
        },
        revenue: {
          total: totalRev,
          expenses: totalExp,
          netProfit: totalRev - totalExp,
          currency: "AED",
        },
        upcomingJourneys: allBookings.slice(0, 6),
        recentMessages: messages.slice(0, 5),
      } as unknown as T;
    }

    if (cleanPath === "/reports/bookings") {
      return {
        total: allBookings.length,
        byStatus: [
          { status: "CONFIRMED", count: allBookings.filter((b) => b.status === "CONFIRMED").length },
          { status: "PENDING", count: allBookings.filter((b) => b.status === "PENDING").length },
          { status: "COMPLETED", count: allBookings.filter((b) => b.status === "COMPLETED").length },
          { status: "CANCELLED", count: allBookings.filter((b) => b.status === "CANCELLED").length },
        ],
        daily: [
          { date: isoDateOffset(-5), count: 2, revenue: 6400 },
          { date: isoDateOffset(-4), count: 3, revenue: 9200 },
          { date: isoDateOffset(-3), count: 2, revenue: 5100 },
          { date: isoDateOffset(-2), count: 4, revenue: 14800 },
          { date: isoDateOffset(-1), count: 3, revenue: 11200 },
          { date: isoDateOffset(0), count: 3, revenue: 9850 },
        ],
      } as unknown as T;
    }

    if (cleanPath === "/reports/revenue") {
      return {
        totalRevenue: totalRev,
        totalExpenses: totalExp,
        netProfit: totalRev - totalExp,
        currency: "AED",
        monthly: [
          { month: "May", revenue: 42000, expenses: 14000, profit: 28000 },
          { month: "Jun", revenue: 48500, expenses: 15200, profit: 33300 },
          { month: "Jul", revenue: 53900, expenses: 16100, profit: 37800 },
          { month: "Aug", revenue: 61200, expenses: 17400, profit: 43800 },
          { month: "Sep", revenue: 68400, expenses: 18900, profit: 49500 },
          { month: "Oct", revenue: totalRev, expenses: totalExp, profit: totalRev - totalExp },
        ],
      } as unknown as T;
    }

    if (cleanPath === "/reports/routes") {
      return [
        { route: "DXB → LHR", from: "DXB", to: "LHR", count: 5, revenue: 21400 },
        { route: "DXB → BOM", from: "DXB", to: "BOM", count: 4, revenue: 9800 },
        { route: "DEL → DXB", from: "DEL", to: "DXB", count: 3, revenue: 7450 },
        { route: "AUH → JFK", from: "AUH", to: "JFK", count: 2, revenue: 14900 },
      ] as unknown as T;
    }

    if (cleanPath === "/reports/airlines") {
      return [
        { airline: "Emirates", count: 6, revenue: 28400 },
        { airline: "Qatar Airways", count: 4, revenue: 16200 },
        { airline: "Etihad Airways", count: 3, revenue: 12900 },
        { airline: "IndiGo", count: 3, revenue: 6800 },
      ] as unknown as T;
    }

    return {
      total: allBookings.length,
      totalAmount: totalRev,
      items: [],
    } as unknown as T;
  }

  // 14. /users
  if (cleanPath === "/users" || cleanPath.startsWith("/users/")) {
    const staff = getStoredStaff();
    return {
      items: staff,
      meta: { total: staff.length, page: 1, limit: 100, totalPages: 1 },
    } as unknown as T;
  }

  // 15. /platform/tenants (Super Admin Tenant Roster)
  if (cleanPath === "/platform/tenants" || cleanPath.startsWith("/platform/tenants/")) {
    const TENANTS_KEY = "fc_local_platform_tenants_v2";
    const defaultTenants = [
      {
        id: "biz_flyconnect_hq",
        name: "FlyConnect Concierge & Tours LLC",
        ownerName: "Garv Kataria",
        email: "admin@flyconnect.com",
        phone: "+971501234567",
        plan: "ENTERPRISE",
        status: "ACTIVE",
        whatsappLimit: 5000,
        whatsappUsed: 420,
        totalBookings: allBookings.length,
        timezone: "Asia/Dubai",
        currency: "AED",
        branchName: "Dubai Marina HQ",
        createdAt: new Date(Date.now() - 120 * 86400000).toISOString(),
        lastActiveAt: new Date().toISOString(),
      },
      {
        id: "biz_emirates_wings",
        name: "Emirates Wings Luxury Holidays",
        ownerName: "Aarav Mehta",
        email: "aarav.admin@flyconnect.com",
        phone: "+971529876543",
        plan: "PRO",
        status: "ACTIVE",
        whatsappLimit: 2500,
        whatsappUsed: 310,
        totalBookings: 18,
        timezone: "Asia/Dubai",
        currency: "AED",
        branchName: "Downtown Dubai Desk",
        createdAt: new Date(Date.now() - 90 * 86400000).toISOString(),
        lastActiveAt: new Date(Date.now() - 1800 * 1000).toISOString(),
      },
      {
        id: "biz_skyline_india",
        name: "Skyline Global Travels Pvt Ltd",
        ownerName: "Priya Sharma",
        email: "priya.manager@flyconnect.com",
        phone: "+919820112233",
        plan: "PRO",
        status: "ACTIVE",
        whatsappLimit: 2000,
        whatsappUsed: 185,
        totalBookings: 12,
        timezone: "Asia/Kolkata",
        currency: "AED",
        branchName: "Mumbai Corporate Desk",
        createdAt: new Date(Date.now() - 60 * 86400000).toISOString(),
        lastActiveAt: new Date(Date.now() - 3600 * 1000).toISOString(),
      },
    ];
    const tenants = readStore(TENANTS_KEY, defaultTenants);

    if (cleanPath === "/platform/tenants" && method === "POST") {
      const body = options.body || {};
      const created = {
        id: `biz_${Date.now()}`,
        name: body.name || "New Travel Agency",
        ownerName: body.ownerName || "Agency Owner",
        email: body.email || "owner@agency.com",
        phone: body.phone || "+971500000000",
        plan: "PRO",
        status: "ACTIVE",
        whatsappLimit: Number(body.whatsappMonthlyLimit || 1000),
        whatsappUsed: 0,
        totalBookings: 0,
        timezone: "Asia/Dubai",
        currency: "AED",
        branchName: "Main Branch",
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };
      writeStore(TENANTS_KEY, [created, ...tenants]);
      return {
        id: created.id,
        name: created.name,
        admin: { id: `usr_${Date.now()}`, email: created.email, role: "ADMIN" },
        initialPassword: "Agency@2026!",
      } as unknown as T;
    }

    if (cleanPath.startsWith("/platform/tenants/")) {
      const parts = cleanPath.split("/").filter(Boolean);
      const id = parts[2];
      const sub = parts[3];
      const body = options.body || {};

      if (sub === "status" && method === "PATCH") {
        const nextStatus = body.blocked ? "BLOCKED" : "ACTIVE";
        const updated = tenants.map((t) =>
          t.id === id ? { ...t, status: nextStatus, blockReason: body.reason || null } : t,
        );
        writeStore(TENANTS_KEY, updated);
        return { id, status: nextStatus } as unknown as T;
      }
      if (sub === "whatsapp-limit" && method === "PATCH") {
        const updated = tenants.map((t) =>
          t.id === id ? { ...t, whatsappLimit: Number(body.limit || 1000) } : t,
        );
        writeStore(TENANTS_KEY, updated);
        return { id, whatsappMonthlyLimit: Number(body.limit || 1000) } as unknown as T;
      }
      if (sub === "deactivate" && method === "POST") {
        const updated = tenants.filter((t) => t.id !== id);
        writeStore(TENANTS_KEY, updated);
        return { deleted: true } as unknown as T;
      }
      if (!sub && (method === "PATCH" || method === "PUT")) {
        const updated = tenants.map((t) => (t.id === id ? { ...t, ...body } : t));
        writeStore(TENANTS_KEY, updated);
        return updated.find((t) => t.id === id) as unknown as T;
      }
    }

    return { items: tenants } as unknown as T;
  }

  // 16. /backups
  if (cleanPath === "/backups" || cleanPath.startsWith("/backups/")) {
    return {
      items: [],
      connected: false,
      status: "IDLE",
      destination: null,
    } as unknown as T;
  }

  return { items: [], meta: { total: 0, page: 1, limit: 10, totalPages: 1 } } as unknown as T;
}
