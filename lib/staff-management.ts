"use client";

import { api, getStoredUser, setSession, type ApiSession, type ApiUser } from "@/lib/api";
import {
  ALL_PERMISSIONS,
  getDefaultPermissionsForRole,
  type AppRole,
  type Permission,
} from "@/lib/permissions";

export interface StaffBookingItem {
  id: string;
  pnr: string;
  referenceNumber?: string | null;
  flightNumber: string;
  airline: string;
  route: string;
  departureDate: string;
  status: "CONFIRMED" | "PENDING" | "CANCELLED" | "COMPLETED" | string;
  amount: number;
  currency: string;
  customerName: string;
  customerPhone?: string;
  createdAt: string;
  staffId?: string;
  staffName?: string;
  staffEmail?: string;
  staffRole?: AppRole;
}

export interface StaffMember {
  id: string;
  businessId: string;
  name: string;
  email: string;
  password?: string;
  phone: string;
  role: AppRole;
  permissions: Permission[];
  customPermissions: boolean;
  branchId: string;
  branchName: string;
  department: string;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  lastLoginAt?: string | null;
  createdAt: string;
  notes?: string;
  totalBookings: number;
  confirmedCount: number;
  pendingCount: number;
  cancelledCount: number;
  completedCount: number;
  totalRevenue: number;
  recentBookings: StaffBookingItem[];
}

const STAFF_STORAGE_KEY = "fc_staff_directory_v2";
const STAFF_BOOKINGS_KEY = "fc_staff_bookings_attribution_v2";

export const INITIAL_STAFF_BOOKINGS: StaffBookingItem[] = [
  {
    id: "sb-101",
    pnr: "EK942L",
    referenceNumber: "BAT-2026-8841",
    flightNumber: "EK-501",
    airline: "Emirates",
    route: "Dubai (DXB) → London (LHR)",
    departureDate: "2026-10-18",
    status: "CONFIRMED",
    amount: 4850,
    currency: "AED",
    customerName: "Sheikh Khalid Al-Qasimi",
    customerPhone: "+971504428190",
    createdAt: "2026-10-01T09:15:00.000Z",
    staffId: "staff-rohan",
    staffName: "Rohan Sharma",
    staffEmail: "rohan.staff@blueauratravels.com",
    staffRole: "STAFF",
  },
  {
    id: "sb-102",
    pnr: "QR771M",
    referenceNumber: "BAT-2026-8842",
    flightNumber: "QR-105",
    airline: "Qatar Airways",
    route: "Dubai (DXB) → Zurich (ZRH)",
    departureDate: "2026-10-20",
    status: "CONFIRMED",
    amount: 6200,
    currency: "AED",
    customerName: "Vikramaditya Singhania",
    customerPhone: "+919820114422",
    createdAt: "2026-10-02T11:30:00.000Z",
    staffId: "staff-rohan",
    staffName: "Rohan Sharma",
    staffEmail: "rohan.staff@blueauratravels.com",
    staffRole: "STAFF",
  },
  {
    id: "sb-103",
    pnr: "EY310K",
    referenceNumber: "BAT-2026-8845",
    flightNumber: "EY-19",
    airline: "Etihad Airways",
    route: "Abu Dhabi (AUH) → Paris (CDG)",
    departureDate: "2026-10-22",
    status: "COMPLETED",
    amount: 5400,
    currency: "AED",
    customerName: "Elena Rostova",
    customerPhone: "+971529910344",
    createdAt: "2026-10-02T15:40:00.000Z",
    staffId: "staff-rohan",
    staffName: "Rohan Sharma",
    staffEmail: "rohan.staff@blueauratravels.com",
    staffRole: "STAFF",
  },
  {
    id: "sb-104",
    pnr: "SQ492A",
    referenceNumber: "BAT-2026-8849",
    flightNumber: "SQ-495",
    airline: "Singapore Airlines",
    route: "Dubai (DXB) → Singapore (SIN)",
    departureDate: "2026-10-25",
    status: "CONFIRMED",
    amount: 7890,
    currency: "AED",
    customerName: "Aisha Al-Mansoori",
    customerPhone: "+971558123900",
    createdAt: "2026-10-03T10:20:00.000Z",
    staffId: "staff-fatima",
    staffName: "Fatima Al-Mansoor",
    staffEmail: "fatima.staff@blueauratravels.com",
    staffRole: "STAFF",
  },
  {
    id: "sb-105",
    pnr: "FZ819P",
    referenceNumber: "BAT-2026-8852",
    flightNumber: "FZ-731",
    airline: "flydubai",
    route: "Dubai (DXB) → Tbilisi (TBS)",
    departureDate: "2026-10-27",
    status: "PENDING",
    amount: 2450,
    currency: "AED",
    customerName: "Nikhil Kamath",
    customerPhone: "+919845099112",
    createdAt: "2026-10-03T14:05:00.000Z",
    staffId: "staff-fatima",
    staffName: "Fatima Al-Mansoor",
    staffEmail: "fatima.staff@blueauratravels.com",
    staffRole: "STAFF",
  },
  {
    id: "sb-106",
    pnr: "BA108X",
    referenceNumber: "BAT-2026-8856",
    flightNumber: "BA-108",
    airline: "British Airways",
    route: "Dubai (DXB) → London (LHR)",
    departureDate: "2026-10-28",
    status: "CONFIRMED",
    amount: 9100,
    currency: "AED",
    customerName: "Marcus Vance",
    customerPhone: "+447700900412",
    createdAt: "2026-10-04T08:45:00.000Z",
    staffId: "staff-zoya",
    staffName: "Zoya Khan",
    staffEmail: "manager@blueauratravels.com",
    staffRole: "MANAGER",
  },
  {
    id: "sb-107",
    pnr: "AI996D",
    referenceNumber: "BAT-2026-8860",
    flightNumber: "AI-996",
    airline: "Air India",
    route: "Dubai (DXB) → Mumbai (BOM)",
    departureDate: "2026-10-29",
    status: "CONFIRMED",
    amount: 1680,
    currency: "AED",
    customerName: "Rajeshwar Rao",
    customerPhone: "+919821044812",
    createdAt: "2026-10-04T12:10:00.000Z",
    staffId: "staff-kabir",
    staffName: "Kabir Verma",
    staffEmail: "kabir.staff@blueauratravels.com",
    staffRole: "STAFF",
  },
  {
    id: "sb-108",
    pnr: "LH631Z",
    referenceNumber: "BAT-2026-8864",
    flightNumber: "LH-631",
    airline: "Lufthansa",
    route: "Dubai (DXB) → Frankfurt (FRA)",
    departureDate: "2026-11-02",
    status: "CONFIRMED",
    amount: 11400,
    currency: "AED",
    customerName: "Garv Kataria VIP Group",
    customerPhone: "+971509988776",
    createdAt: "2026-10-04T16:30:00.000Z",
    staffId: "staff-aarav",
    staffName: "Aarav Mehta",
    staffEmail: "admin@blueauratravels.com",
    staffRole: "ADMIN",
  },
  {
    id: "sb-109",
    pnr: "EK201V",
    referenceNumber: "BAT-2026-8869",
    flightNumber: "EK-201",
    airline: "Emirates",
    route: "Dubai (DXB) → New York (JFK)",
    departureDate: "2026-11-05",
    status: "CONFIRMED",
    amount: 18500,
    currency: "AED",
    customerName: "Apex Global Executive Charter",
    customerPhone: "+971501122334",
    createdAt: "2026-10-04T19:00:00.000Z",
    staffId: "staff-superadmin",
    staffName: "Garv Kataria",
    staffEmail: "garv@blueauratravels.com",
    staffRole: "SUPER_ADMIN",
  },
];

export const INITIAL_STAFF_MEMBERS: Omit<
  StaffMember,
  "totalBookings" | "confirmedCount" | "pendingCount" | "cancelledCount" | "completedCount" | "totalRevenue" | "recentBookings"
>[] = [
  {
    id: "staff-superadmin",
    businessId: "biz-blue-aura",
    name: "Garv Kataria",
    email: "garv@blueauratravels.com",
    password: "Admin@123",
    phone: "+971509988776",
    role: "SUPER_ADMIN",
    permissions: ALL_PERMISSIONS,
    customPermissions: false,
    branchId: "br-1",
    branchName: "Dubai Flagship HQ (Sheikh Zayed Rd)",
    department: "Executive Board & Platform Root",
    status: "ACTIVE",
    lastLoginAt: new Date().toISOString(),
    createdAt: "2026-01-01T08:00:00.000Z",
    notes: "Master Super Admin with unrestricted platform & multi-branch authority.",
  },
  {
    id: "staff-aarav",
    businessId: "biz-blue-aura",
    name: "Aarav Mehta",
    email: "admin@blueauratravels.com",
    password: "Admin@123",
    phone: "+971504128899",
    role: "ADMIN",
    permissions: getDefaultPermissionsForRole("ADMIN"),
    customPermissions: false,
    branchId: "br-1",
    branchName: "Dubai Flagship HQ (Sheikh Zayed Rd)",
    department: "Agency Administration & Finance",
    status: "ACTIVE",
    lastLoginAt: "2026-10-04T18:10:00.000Z",
    createdAt: "2026-01-15T09:00:00.000Z",
    notes: "Agency Admin managing staff access, billing, and B2B corporate contracts.",
  },
  {
    id: "staff-zoya",
    businessId: "biz-blue-aura",
    name: "Zoya Khan",
    email: "manager@blueauratravels.com",
    password: "Manager@123",
    phone: "+971528839100",
    role: "MANAGER",
    permissions: getDefaultPermissionsForRole("MANAGER"),
    customPermissions: false,
    branchId: "br-1",
    branchName: "Dubai Flagship HQ (Sheikh Zayed Rd)",
    department: "Corporate Ticketing & Escalations",
    status: "ACTIVE",
    lastLoginAt: "2026-10-04T15:25:00.000Z",
    createdAt: "2026-02-10T10:00:00.000Z",
    notes: "Operations Manager overseeing daily ticketing, refunds, and financial reports.",
  },
  {
    id: "staff-rohan",
    businessId: "biz-blue-aura",
    name: "Rohan Sharma",
    email: "rohan.staff@blueauratravels.com",
    password: "Staff@123",
    phone: "+919820445511",
    role: "STAFF",
    permissions: getDefaultPermissionsForRole("STAFF"),
    customPermissions: false,
    branchId: "br-2",
    branchName: "Mumbai Corporate Desk (BKC)",
    department: "Flight & GDS Ticketing",
    status: "ACTIVE",
    lastLoginAt: "2026-10-04T14:40:00.000Z",
    createdAt: "2026-03-05T09:30:00.000Z",
    notes: "Senior Ticketing Executive handling Emirates, Qatar, and Etihad corporate PNRs.",
  },
  {
    id: "staff-fatima",
    businessId: "biz-blue-aura",
    name: "Fatima Al-Mansoor",
    email: "fatima.staff@blueauratravels.com",
    password: "Staff@123",
    phone: "+971553319082",
    role: "STAFF",
    permissions: [
      ...getDefaultPermissionsForRole("STAFF"),
      "booking:cancel",
      "invoice:record-payment",
    ],
    customPermissions: true,
    branchId: "br-3",
    branchName: "Abu Dhabi VIP Lounge (Corniche)",
    department: "VIP Concierge & Visa Desk",
    status: "ACTIVE",
    lastLoginAt: "2026-10-04T13:15:00.000Z",
    createdAt: "2026-04-12T11:00:00.000Z",
    notes: "Granted custom access to record invoice payments & cancel bookings for VIP clients.",
  },
  {
    id: "staff-kabir",
    businessId: "biz-blue-aura",
    name: "Kabir Verma",
    email: "kabir.staff@blueauratravels.com",
    password: "Staff@123",
    phone: "+919811223399",
    role: "STAFF",
    permissions: getDefaultPermissionsForRole("STAFF"),
    customPermissions: false,
    branchId: "br-2",
    branchName: "Mumbai Corporate Desk (BKC)",
    department: "Holiday Packages & Group Tours",
    status: "ACTIVE",
    lastLoginAt: "2026-10-04T12:15:00.000Z",
    createdAt: "2026-05-20T09:00:00.000Z",
    notes: "Handles holiday packages, hotel vouchers, and MICE group manifests.",
  },
];

export function getStoredStaffBookings(): StaffBookingItem[] {
  if (typeof window === "undefined") return INITIAL_STAFF_BOOKINGS;
  try {
    const raw = window.localStorage.getItem(STAFF_BOOKINGS_KEY);
    if (!raw) {
      window.localStorage.setItem(STAFF_BOOKINGS_KEY, JSON.stringify(INITIAL_STAFF_BOOKINGS));
      return INITIAL_STAFF_BOOKINGS;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return INITIAL_STAFF_BOOKINGS;
    return parsed;
  } catch {
    return INITIAL_STAFF_BOOKINGS;
  }
}

export function saveStoredStaffBookings(bookings: StaffBookingItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STAFF_BOOKINGS_KEY, JSON.stringify(bookings));
    window.dispatchEvent(new CustomEvent("fc:staff-updated"));
  } catch (err) {
    console.error("Failed to save staff bookings:", err);
  }
}

function computeStaffStats(
  member: Omit<
    StaffMember,
    "totalBookings" | "confirmedCount" | "pendingCount" | "cancelledCount" | "completedCount" | "totalRevenue" | "recentBookings"
  > &
    Partial<Pick<StaffMember, "recentBookings">>,
  allBookings: StaffBookingItem[],
): StaffMember {
  const emailLower = member.email.toLowerCase();
  const matched = allBookings.filter(
    (b) =>
      b.staffId === member.id ||
      (b.staffEmail && b.staffEmail.toLowerCase() === emailLower) ||
      (b.staffName && b.staffName.toLowerCase() === member.name.toLowerCase())
  );

  // Merge with any API-provided recentBookings avoiding duplicate IDs or PNRs
  const map = new Map<string, StaffBookingItem>();
  for (const b of matched) {
    map.set(b.id || b.pnr, b);
  }
  if (Array.isArray(member.recentBookings)) {
    for (const b of member.recentBookings) {
      if (!map.has(b.id || b.pnr)) {
        map.set(b.id || b.pnr, b);
      }
    }
  }

  const combined = Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  let confirmedCount = 0;
  let pendingCount = 0;
  let cancelledCount = 0;
  let completedCount = 0;
  let totalRevenue = 0;

  for (const b of combined) {
    const st = (b.status || "CONFIRMED").toUpperCase();
    if (st === "CONFIRMED") confirmedCount++;
    else if (st === "PENDING" || st === "QUOTATION") pendingCount++;
    else if (st === "CANCELLED") cancelledCount++;
    else if (st === "COMPLETED") completedCount++;

    if (st !== "CANCELLED") {
      totalRevenue += Number(b.amount || 0);
    }
  }

  return {
    ...member,
    permissions:
      member.role === "SUPER_ADMIN"
        ? ALL_PERMISSIONS
        : Array.isArray(member.permissions) && (member.permissions.length > 0 || member.customPermissions)
        ? member.permissions
        : getDefaultPermissionsForRole(member.role),
    totalBookings: combined.length,
    confirmedCount,
    pendingCount,
    cancelledCount,
    completedCount,
    totalRevenue,
    recentBookings: combined,
  };
}

export function getStoredStaff(): StaffMember[] {
  const allBookings = getStoredStaffBookings();
  if (typeof window === "undefined") {
    return INITIAL_STAFF_MEMBERS.map((m) => computeStaffStats(m, allBookings));
  }
  try {
    const raw = window.localStorage.getItem(STAFF_STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(INITIAL_STAFF_MEMBERS));
      return INITIAL_STAFF_MEMBERS.map((m) => computeStaffStats(m, allBookings));
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      window.localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(INITIAL_STAFF_MEMBERS));
      return INITIAL_STAFF_MEMBERS.map((m) => computeStaffStats(m, allBookings));
    }
    return parsed.map((m) => computeStaffStats(m, allBookings));
  } catch {
    return INITIAL_STAFF_MEMBERS.map((m) => computeStaffStats(m, allBookings));
  }
}

export function saveStaffRegistry(members: StaffMember[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(members));
    window.dispatchEvent(new CustomEvent("fc:staff-updated", { detail: members }));
  } catch (err) {
    console.error("Failed to save staff registry:", err);
  }
}

/**
 * Synchronizes staff and booking attributions with the backend API (/users and /bookings)
 * while preserving granular custom permissions, branch metadata, and passwords for hybrid login.
 */
export async function syncStaffWithBackend(): Promise<StaffMember[]> {
  const localStaff = getStoredStaff();
  const localBookings = getStoredStaffBookings();

  try {
    const [usersRes, bookingsRes] = await Promise.allSettled([
      api<{ items: Array<any> }>("/users?limit=100"),
      api<{ items: Array<any> }>("/bookings?limit=500"),
    ]);

    let updatedBookings = [...localBookings];

    if (bookingsRes.status === "fulfilled" && Array.isArray(bookingsRes.value?.items)) {
      const byId = new Map<string, StaffBookingItem>();
      for (const lb of updatedBookings) {
        byId.set(lb.id, lb);
      }
      for (const b of bookingsRes.value.items) {
        const existing = byId.get(b.id);
        byId.set(b.id, {
          id: b.id,
          pnr: b.pnr || existing?.pnr || "PNR",
          referenceNumber: b.referenceNumber ?? existing?.referenceNumber ?? null,
          flightNumber: b.flightNumber || existing?.flightNumber || "FLIGHT",
          airline: b.airline || existing?.airline || "Airline",
          route:
            b.fromCity && b.toCity
              ? `${b.fromCity} → ${b.toCity}`
              : existing?.route || "Direct Route",
          departureDate: b.departureDate || existing?.departureDate || new Date().toISOString(),
          status: b.status || existing?.status || "CONFIRMED",
          amount: Number(b.amount ?? existing?.amount ?? 0),
          currency: b.currency || existing?.currency || "AED",
          customerName: b.customerName || existing?.customerName || "Traveller",
          customerPhone: b.customerPhone || existing?.customerPhone || "",
          createdAt: b.createdAt || existing?.createdAt || new Date().toISOString(),
          staffId: b.createdBy || existing?.staffId,
          staffName: b.creatorName || existing?.staffName,
          staffEmail: b.creatorEmail || existing?.staffEmail,
          staffRole: (b.creatorRole as AppRole) || existing?.staffRole,
        });
      }
      updatedBookings = Array.from(byId.values());
      saveStoredStaffBookings(updatedBookings);
    }

    if (usersRes.status === "fulfilled" && Array.isArray(usersRes.value?.items)) {
      const mergedByEmail = new Map<string, StaffMember>();
      for (const ls of localStaff) {
        mergedByEmail.set(ls.email.toLowerCase(), ls);
      }

      for (const apiUser of usersRes.value.items) {
        const key = String(apiUser.email || "").toLowerCase();
        if (!key) continue;
        const existing = mergedByEmail.get(key);
        const role = ((apiUser.role || existing?.role || "STAFF") as string).toUpperCase() as AppRole;

        // Also merge any recentBookings from /users response
        if (Array.isArray(apiUser.recentBookings)) {
          for (const rb of apiUser.recentBookings) {
            if (!updatedBookings.some((ub) => ub.id === rb.id || ub.pnr === rb.pnr)) {
              updatedBookings.push({
                ...rb,
                staffId: apiUser.id,
                staffName: apiUser.name,
                staffEmail: apiUser.email,
                staffRole: role,
              });
            }
          }
        }

        const mergedBase: StaffMember = computeStaffStats(
          {
            id: apiUser.id || existing?.id || `staff-${Date.now()}`,
            businessId: existing?.businessId || "biz-blue-aura",
            name: apiUser.name || existing?.name || "Team Member",
            email: apiUser.email,
            password: existing?.password || "Staff@123",
            phone: apiUser.phone || existing?.phone || "+971500000000",
            role,
            permissions: existing?.customPermissions
              ? existing.permissions
              : getDefaultPermissionsForRole(role),
            customPermissions: existing?.customPermissions ?? false,
            branchId: existing?.branchId || "br-1",
            branchName: existing?.branchName || "Dubai Flagship HQ (Sheikh Zayed Rd)",
            department: existing?.department || (role === "ADMIN" ? "Agency Administration" : role === "MANAGER" ? "Operations Management" : "Travel & Ticketing Desk"),
            status: (apiUser.status as "ACTIVE" | "INACTIVE" | "SUSPENDED") || existing?.status || "ACTIVE",
            lastLoginAt: apiUser.lastLoginAt || existing?.lastLoginAt || null,
            createdAt: apiUser.createdAt || existing?.createdAt || new Date().toISOString(),
            notes: existing?.notes || "",
            recentBookings: apiUser.recentBookings || existing?.recentBookings || [],
          },
          updatedBookings,
        );
        mergedByEmail.set(key, mergedBase);
      }

      const finalList = Array.from(mergedByEmail.values());
      saveStoredStaffBookings(updatedBookings);
      saveStaffRegistry(finalList);
      return finalList;
    }
  } catch {
    // Offline or non-admin user: return local staff computed with local bookings
  }

  return getStoredStaff();
}

export interface CreateStaffInput {
  name: string;
  email: string;
  password: string;
  phone: string;
  role: AppRole;
  permissions?: Permission[];
  customPermissions?: boolean;
  branchId?: string;
  branchName?: string;
  department?: string;
  status?: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  notes?: string;
}

export async function createStaffAccount(input: CreateStaffInput): Promise<StaffMember> {
  const currentList = getStoredStaff();
  const normalizedEmail = input.email.trim().toLowerCase();

  if (currentList.some((m) => m.email.toLowerCase() === normalizedEmail)) {
    throw new Error("A staff or admin account with this Email ID already exists.");
  }

  let serverUserId: string | null = null;
  // Attempt to create on backend API if reachable
  try {
    const cleanPhone = input.phone.replace(/[^\d+]/g, "");
    const backendRole = input.role === "SUPER_ADMIN" ? "ADMIN" : input.role;
    const created = await api<{ id: string }>("/users", {
      method: "POST",
      body: {
        name: input.name.trim(),
        email: normalizedEmail,
        phone: cleanPhone || undefined,
        password: input.password,
        role: backendRole,
      },
    });
    if (created?.id) {
      serverUserId = created.id;
    }
  } catch (err: any) {
    if (err?.code === "EMAIL_IN_USE") {
      throw new Error("A user with this Email ID already exists on the server.");
    }
    // Otherwise continue and provision in hybrid staff store so UI works seamlessly
  }

  const effectivePermissions =
    input.role === "SUPER_ADMIN"
      ? ALL_PERMISSIONS
      : input.permissions && input.permissions.length > 0
      ? input.permissions
      : getDefaultPermissionsForRole(input.role);

  const newMember = computeStaffStats(
    {
      id: serverUserId || `staff-${Date.now().toString(36)}`,
      businessId: "biz-blue-aura",
      name: input.name.trim(),
      email: normalizedEmail,
      password: input.password,
      phone: input.phone.trim(),
      role: input.role,
      permissions: effectivePermissions,
      customPermissions: Boolean(input.customPermissions),
      branchId: input.branchId || "br-1",
      branchName: input.branchName || "Dubai Flagship HQ (Sheikh Zayed Rd)",
      department:
        input.department?.trim() ||
        (input.role === "SUPER_ADMIN"
          ? "Executive Board"
          : input.role === "ADMIN"
          ? "Agency Administration"
          : input.role === "MANAGER"
          ? "Operations Management"
          : "Ticketing & Reservations"),
      status: input.status || "ACTIVE",
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      notes: input.notes?.trim() || "",
    },
    getStoredStaffBookings(),
  );

  const nextList = [newMember, ...currentList];
  saveStaffRegistry(nextList);
  return newMember;
}

export interface UpdateStaffInput {
  name?: string;
  email?: string;
  password?: string;
  phone?: string;
  role?: AppRole;
  permissions?: Permission[];
  customPermissions?: boolean;
  branchId?: string;
  branchName?: string;
  department?: string;
  status?: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  notes?: string;
}

export async function updateStaffAccount(id: string, updates: UpdateStaffInput): Promise<StaffMember> {
  const currentList = getStoredStaff();
  const idx = currentList.findIndex((m) => m.id === id);
  if (idx === -1) {
    throw new Error("Staff member not found.");
  }

  const target = currentList[idx];
  const nextEmail = updates.email ? updates.email.trim().toLowerCase() : target.email.toLowerCase();

  if (
    nextEmail !== target.email.toLowerCase() &&
    currentList.some((m) => m.id !== id && m.email.toLowerCase() === nextEmail)
  ) {
    throw new Error("Another team member is already using this Email ID.");
  }

  // Try syncing to backend API if reachable
  try {
    const cleanPhone = (updates.phone ?? target.phone).replace(/[^\d+]/g, "");
    const nextRole = updates.role ?? target.role;
    const backendRole = nextRole === "SUPER_ADMIN" ? "ADMIN" : nextRole;
    const backendStatus =
      (updates.status ?? target.status) === "ACTIVE" ? "ACTIVE" : "INACTIVE";

    await api(`/users/${id}`, {
      method: "PATCH",
      body: {
        name: updates.name?.trim() ?? target.name,
        email: nextEmail,
        phone: cleanPhone || undefined,
        role: backendRole,
        status: backendStatus,
        ...(updates.password && updates.password.trim().length >= 6
          ? { password: updates.password.trim() }
          : {}),
      },
    });
  } catch {
    // Continue with local registry update if user is local-only or backend is offline
  }

  const nextRole = updates.role ?? target.role;
  const nextCustomPermissions =
    updates.customPermissions !== undefined ? updates.customPermissions : target.customPermissions;

  const nextPermissions =
    nextRole === "SUPER_ADMIN"
      ? ALL_PERMISSIONS
      : updates.permissions !== undefined
      ? updates.permissions
      : nextCustomPermissions
      ? target.permissions
      : getDefaultPermissionsForRole(nextRole);

  const updatedMember = computeStaffStats(
    {
      ...target,
      name: updates.name !== undefined ? updates.name.trim() : target.name,
      email: nextEmail,
      password:
        updates.password && updates.password.trim().length > 0
          ? updates.password.trim()
          : target.password,
      phone: updates.phone !== undefined ? updates.phone.trim() : target.phone,
      role: nextRole,
      permissions: nextPermissions,
      customPermissions: nextCustomPermissions,
      branchId: updates.branchId ?? target.branchId,
      branchName: updates.branchName ?? target.branchName,
      department: updates.department !== undefined ? updates.department.trim() : target.department,
      status: updates.status ?? target.status,
      notes: updates.notes !== undefined ? updates.notes.trim() : target.notes,
    },
    getStoredStaffBookings(),
  );

  const nextList = [...currentList];
  nextList[idx] = updatedMember;
  saveStaffRegistry(nextList);

  // If the updated staff member is currently logged in, live-update their session permissions & role!
  const activeUser = getStoredUser();
  if (
    activeUser &&
    (activeUser.id === updatedMember.id ||
      activeUser.email.toLowerCase() === updatedMember.email.toLowerCase())
  ) {
    if (typeof window !== "undefined") {
      const updatedSessionUser: ApiUser & { customPermissions?: boolean } = {
        ...activeUser,
        name: updatedMember.name,
        email: updatedMember.email,
        phone: updatedMember.phone,
        role: updatedMember.role,
        permissions: updatedMember.permissions,
        customPermissions: updatedMember.customPermissions,
      };
      window.localStorage.setItem("fc_user", JSON.stringify(updatedSessionUser));
      window.dispatchEvent(new CustomEvent("fc:session-changed"));
    }
  }

  return updatedMember;
}

export function removeStaffFromActiveRegistry(id: string): StaffMember | null {
  const currentList = getStoredStaff();
  const target = currentList.find((m) => m.id === id);
  if (!target) return null;

  const remaining = currentList.filter((m) => m.id !== id);
  saveStaffRegistry(remaining);

  // Also try deactivating on backend asynchronously
  api(`/users/${id}`, { method: "DELETE" }).catch(() => {});

  return target;
}

export function restoreStaffToActiveRegistry(member: StaffMember): void {
  const currentList = getStoredStaff();
  const filtered = currentList.filter(
    (m) => m.id !== member.id && m.email.toLowerCase() !== member.email.toLowerCase()
  );
  const restored: StaffMember = computeStaffStats(
    {
      ...member,
      status: "ACTIVE",
    },
    getStoredStaffBookings(),
  );
  saveStaffRegistry([restored, ...filtered]);
}

/**
 * Authenticates a staff member, manager, admin, or super admin using their separate Email ID & Password.
 */
export function authenticateStaffCredentials(email: string, password: string): ApiSession {
  const normalizedEmail = email.trim().toLowerCase();
  const staffList = getStoredStaff();
  const match = staffList.find((m) => m.email.toLowerCase() === normalizedEmail);

  if (!match) {
    throw new Error("Invalid email or password. Please check your staff login credentials.");
  }

  if (match.status !== "ACTIVE") {
    throw new Error(
      `Your account (${match.email}) is currently ${match.status}. Please contact Super Admin.`
    );
  }

  const expectedPassword = match.password || "Staff@123";
  if (password !== expectedPassword) {
    throw new Error("Invalid email or password. Please verify your password.");
  }

  // Update lastLoginAt in registry
  const nowIso = new Date().toISOString();
  const updatedList = staffList.map((m) =>
    m.id === match.id ? { ...m, lastLoginAt: nowIso } : m
  );
  saveStaffRegistry(updatedList);

  const effectivePermissions =
    match.role === "SUPER_ADMIN"
      ? ALL_PERMISSIONS
      : match.permissions && match.permissions.length > 0
      ? match.permissions
      : getDefaultPermissionsForRole(match.role);

  const session: ApiSession = {
    accessToken: `staff_jwt_${match.id}_${Date.now()}`,
    refreshToken: `staff_ref_${match.id}_${Date.now()}`,
    session: `staff_sess_${match.id}_${Date.now()}`,
    user: {
      id: match.id,
      name: match.name,
      email: match.email,
      role: match.role,
      phone: match.phone,
      businessId: match.businessId || "biz-blue-aura",
      permissions: effectivePermissions,
    },
  };

  return session;
}

/**
 * Enriches a backend login session with any custom staff permissions and updates lastLoginAt in the staff directory.
 */
export function hydrateSessionWithStaffPermissions(session: ApiSession): ApiSession {
  if (!session?.user) return session;
  const staffList = getStoredStaff();
  const emailLower = session.user.email.toLowerCase();
  const match = staffList.find(
    (m) => m.id === session.user.id || m.email.toLowerCase() === emailLower
  );

  const nowIso = new Date().toISOString();
  if (match) {
    if (match.status !== "ACTIVE") {
      throw new Error(
        `Your account (${match.email}) has been ${match.status} by the administrator.`
      );
    }
    const updatedList = staffList.map((m) =>
      m.id === match.id ? { ...m, lastLoginAt: nowIso } : m
    );
    saveStaffRegistry(updatedList);

    const role = (match.role || session.user.role || "STAFF") as AppRole;
    const effectivePermissions =
      role === "SUPER_ADMIN"
        ? ALL_PERMISSIONS
        : match.customPermissions && Array.isArray(match.permissions)
        ? match.permissions
        : Array.isArray(session.user.permissions) && session.user.permissions.length > 0
        ? (session.user.permissions as Permission[])
        : getDefaultPermissionsForRole(role);

    return {
      ...session,
      user: {
        ...session.user,
        role,
        permissions: effectivePermissions,
      },
    };
  }

  // If the backend user wasn't in our local staff directory yet, add them automatically!
  const role = (session.user.role || "STAFF") as AppRole;
  const effectivePermissions =
    role === "SUPER_ADMIN"
      ? ALL_PERMISSIONS
      : Array.isArray(session.user.permissions) && session.user.permissions.length > 0
      ? (session.user.permissions as Permission[])
      : getDefaultPermissionsForRole(role);

  const autoEntry = computeStaffStats(
    {
      id: session.user.id,
      businessId: session.user.businessId || "biz-blue-aura",
      name: session.user.name,
      email: session.user.email,
      Phone: session.user.phone || "+971500000000",
      phone: session.user.phone || "+971500000000",
      role,
      permissions: effectivePermissions,
      customPermissions: false,
      branchId: "br-1",
      branchName: "Dubai Flagship HQ (Sheikh Zayed Rd)",
      department: role === "SUPER_ADMIN" ? "Executive Board" : role === "ADMIN" ? "Administration" : "Operations",
      status: "ACTIVE",
      lastLoginAt: nowIso,
      createdAt: nowIso,
    } as any,
    getStoredStaffBookings(),
  );
  saveStaffRegistry([autoEntry, ...staffList]);

  return {
    ...session,
    user: {
      ...session.user,
      role,
      permissions: effectivePermissions,
    },
  };
}

/**
 * Records a booking under the currently logged-in staff member so Super Admin/Admin
 * can track exact booking counts & revenue per staff ("kis staff ne kitna booking kiya").
 */
export function recordBookingByCurrentStaff(booking: {
  id: string;
  pnr: string;
  referenceNumber?: string | null;
  flightNumber: string;
  airline: string;
  route: string;
  departureDate: string;
  status: string;
  amount: number;
  currency: string;
  customerName: string;
  customerPhone?: string;
}): StaffBookingItem {
  const user = getStoredUser();
  const staffList = getStoredStaff();
  const matchedStaff = user
    ? staffList.find(
        (m) => m.id === user.id || m.email.toLowerCase() === user.email.toLowerCase()
      )
    : staffList[0];

  const item: StaffBookingItem = {
    id: booking.id,
    pnr: booking.pnr,
    referenceNumber: booking.referenceNumber ?? null,
    flightNumber: booking.flightNumber,
    airline: booking.airline,
    route: booking.route,
    departureDate: booking.departureDate,
    status: booking.status || "CONFIRMED",
    amount: Number(booking.amount || 0),
    currency: booking.currency || "AED",
    customerName: booking.customerName,
    customerPhone: booking.customerPhone || "",
    createdAt: new Date().toISOString(),
    staffId: matchedStaff?.id || user?.id || "staff-superadmin",
    staffName: matchedStaff?.name || user?.name || "Garv Kataria",
    staffEmail: matchedStaff?.email || user?.email || "garv@blueauratravels.com",
    staffRole: (matchedStaff?.role || user?.role || "SUPER_ADMIN") as AppRole,
  };

  const currentBookings = getStoredStaffBookings();
  const filtered = currentBookings.filter((b) => b.id !== item.id && b.pnr !== item.pnr);
  saveStoredStaffBookings([item, ...filtered]);

  // Trigger staff stats recomputation
  saveStaffRegistry(getStoredStaff());
  return item;
}
