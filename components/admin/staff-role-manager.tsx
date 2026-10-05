"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Award,
  BarChart3,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogIn,
  Mail,
  Phone,
  Plane,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { PhoneInput } from "@/components/ui/phone-input";
import { parsePhoneNumber, validatePhoneNumber } from "@/lib/phone-utils";
import { getStoredUser, setSession } from "@/lib/api";
import {
  ALL_PERMISSIONS,
  PERMISSION_CATALOG,
  ROLE_DEFAULT_PERMISSIONS,
  getDefaultPermissionsForRole,
  type AppRole,
  type Permission,
} from "@/lib/permissions";
import {
  StaffBookingItem,
  StaffMember,
  authenticateStaffCredentials,
  createStaffAccount,
  getStoredStaff,
  syncStaffWithBackend,
  updateStaffAccount,
} from "@/lib/staff-management";
import { moveToRecycleBin } from "@/lib/admin-recycle-bin";
import { getStoredBranches } from "@/lib/travel-crm";

interface StaffRoleManagerProps {
  onRecycleBinChange?: () => void;
}

const ROLE_META: Record<
  AppRole,
  {
    label: string;
    badgeBg: string;
    badgeText: string;
    border: string;
    desc: string;
  }
> = {
  SUPER_ADMIN: {
    label: "Super Admin",
    badgeBg: "bg-violet-100",
    badgeText: "text-violet-800",
    border: "border-violet-200",
    desc: "Full platform owner, multi-branch control, recycle bin & unrestricted access",
  },
  ADMIN: {
    label: "Agency Admin",
    badgeBg: "bg-blue-100",
    badgeText: "text-blue-800",
    border: "border-blue-200",
    desc: "Full agency administration, staff & role management, finance, settings & backups",
  },
  MANAGER: {
    label: "Operations Manager",
    badgeBg: "bg-emerald-100",
    badgeText: "text-emerald-800",
    border: "border-emerald-200",
    desc: "Bookings, cancellations, invoicing, payment recording, P&L reports & WhatsApp templates",
  },
  STAFF: {
    label: "Ticketing Staff",
    badgeBg: "bg-amber-100",
    badgeText: "text-amber-800",
    border: "border-amber-200",
    desc: "Daily flight/hotel/visa bookings, customer creation, invoice issuing & WhatsApp alerts",
  },
};

export function StaffRoleManager({ onRecycleBinChange }: StaffRoleManagerProps) {
  const router = useRouter();
  const currentUser = getStoredUser();
  const isCurrentSuperAdmin = currentUser?.role === "SUPER_ADMIN";

  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [subTab, setSubTab] = useState<"directory" | "roles" | "bookings_ledger">("directory");

  // Filters
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | AppRole>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "SUSPENDED" | "INACTIVE">("ALL");
  const [sortBy, setSortBy] = useState<"bookings" | "revenue" | "name" | "recent">("bookings");
  const [ledgerStaffFilter, setLedgerStaffFilter] = useState<string>("ALL");

  // Password visibility per staff ID
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Toast banner
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4500);
  };

  // Branches for dropdown
  const branches = useMemo(() => {
    const b = getStoredBranches();
    return b.length > 0
      ? b
      : [
          { id: "br-1", name: "Dubai Flagship HQ (Sheikh Zayed Rd)" },
          { id: "br-2", name: "Mumbai Corporate Desk (BKC)" },
          { id: "br-3", name: "Abu Dhabi VIP Lounge (Corniche)" },
        ];
  }, []);

  // Modals
  const [viewStaff, setViewStaff] = useState<StaffMember | null>(null);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffMember | null>(null);
  const [deleteReason, setDeleteReason] = useState("Removed from active staff roster by Admin");

  // Add / Edit Form State
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [showFormPassword, setShowFormPassword] = useState(true);
  const [formPhone, setFormPhone] = useState("+971501234567");
  const [formPhoneValid, setFormPhoneValid] = useState(true);
  const [formRole, setFormRole] = useState<AppRole>("STAFF");
  const [formBranchId, setFormBranchId] = useState("br-1");
  const [formDepartment, setFormDepartment] = useState("Flight & GDS Ticketing");
  const [formStatus, setFormStatus] = useState<"ACTIVE" | "INACTIVE" | "SUSPENDED">("ACTIVE");
  const [formNotes, setFormNotes] = useState("");
  const [formCustomPermissions, setFormCustomPermissions] = useState(false);
  const [formPermissions, setFormPermissions] = useState<Permission[]>(
    getDefaultPermissionsForRole("STAFF")
  );
  const [formError, setFormError] = useState("");
  const [savingForm, setSavingForm] = useState(false);

  const loadStaff = async () => {
    setLoading(true);
    try {
      const synced = await syncStaffWithBackend();
      setStaffList(synced);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setStaffList(getStoredStaff());
    void loadStaff();
    const handleUpdate = () => setStaffList(getStoredStaff());
    window.addEventListener("fc:staff-updated", handleUpdate);
    window.addEventListener("fc:recycle-bin-updated", handleUpdate);
    return () => {
      window.removeEventListener("fc:staff-updated", handleUpdate);
      window.removeEventListener("fc:recycle-bin-updated", handleUpdate);
    };
  }, []);

  // Open Create Modal
  const handleOpenCreate = (presetRole: AppRole = "STAFF") => {
    setEditingStaff(null);
    setFormName("");
    setFormEmail("");
    setFormPassword(`Bat@${Math.floor(1000 + Math.random() * 9000)}`);
    setShowFormPassword(true);
    setFormPhone("+971501234567");
    setFormPhoneValid(true);
    setFormRole(presetRole);
    setFormBranchId(branches[0]?.id || "br-1");
    setFormDepartment(
      presetRole === "ADMIN"
        ? "Agency Administration"
        : presetRole === "MANAGER"
        ? "Operations & Escalations"
        : "Flight & Hotel Ticketing"
    );
    setFormStatus("ACTIVE");
    setFormNotes("");
    setFormCustomPermissions(false);
    setFormPermissions(getDefaultPermissionsForRole(presetRole));
    setFormError("");
    setFormModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (member: StaffMember) => {
    setEditingStaff(member);
    setFormName(member.name);
    setFormEmail(member.email);
    setFormPassword(member.password || "");
    setShowFormPassword(true);
    setFormPhone(member.phone || "+971501234567");
    setFormPhoneValid(true);
    setFormRole(member.role);
    setFormBranchId(member.branchId || "br-1");
    setFormDepartment(member.department || "Ticketing & Operations");
    setFormStatus(member.status);
    setFormNotes(member.notes || "");
    setFormCustomPermissions(Boolean(member.customPermissions));
    setFormPermissions(
      member.permissions?.length > 0
        ? [...member.permissions]
        : getDefaultPermissionsForRole(member.role)
    );
    setFormError("");
    setFormModalOpen(true);
  };

  // Handle Role Selection Change in Form
  const handleRoleSelectInForm = (newRole: AppRole) => {
    setFormRole(newRole);
    if (!formCustomPermissions || newRole === "SUPER_ADMIN") {
      setFormPermissions(getDefaultPermissionsForRole(newRole));
    }
  };

  // Toggle single permission in form
  const handleTogglePermission = (perm: Permission) => {
    if (formRole === "SUPER_ADMIN") return;
    setFormCustomPermissions(true);
    setFormPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  // Toggle whole permission group in form
  const handleToggleGroup = (groupPerms: Permission[]) => {
    if (formRole === "SUPER_ADMIN") return;
    setFormCustomPermissions(true);
    const allSelected = groupPerms.every((p) => formPermissions.includes(p));
    if (allSelected) {
      setFormPermissions((prev) => prev.filter((p) => !groupPerms.includes(p)));
    } else {
      setFormPermissions((prev) => Array.from(new Set([...prev, ...groupPerms])));
    }
  };

  // Save Staff (Create or Update)
  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!formName.trim()) {
      setFormError("Full Name is required.");
      return;
    }
    if (!formEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formEmail.trim())) {
      setFormError("Please enter a valid separate Login Email ID.");
      return;
    }
    if (!editingStaff && (!formPassword.trim() || formPassword.trim().length < 6)) {
      setFormError("Login Password must be at least 6 characters.");
      return;
    }
    if (editingStaff && formPassword.trim().length > 0 && formPassword.trim().length < 6) {
      setFormError("New Password must be at least 6 characters.");
      return;
    }

    const parsedPhone = parsePhoneNumber(formPhone);
    const phoneValidation = validatePhoneNumber(parsedPhone.country.iso, parsedPhone.nationalNumber);
    if (!phoneValidation.isValid) {
      setFormError(phoneValidation.error || "Please enter a valid phone number for the selected country code.");
      return;
    }

    const selectedBranch = branches.find((b) => b.id === formBranchId);
    const branchName = selectedBranch?.name || "Dubai Flagship HQ (Sheikh Zayed Rd)";

    setSavingForm(true);
    try {
      if (editingStaff) {
        const updated = await updateStaffAccount(editingStaff.id, {
          name: formName.trim(),
          email: formEmail.trim(),
          password: formPassword.trim() || undefined,
          phone: formPhone.trim(),
          role: formRole,
          permissions: formRole === "SUPER_ADMIN" ? ALL_PERMISSIONS : formPermissions,
          customPermissions: formRole === "SUPER_ADMIN" ? false : formCustomPermissions,
          branchId: formBranchId,
          branchName,
          department: formDepartment.trim(),
          status: formStatus,
          notes: formNotes.trim(),
        });
        setStaffList(getStoredStaff());
        if (viewStaff?.id === updated.id) {
          setViewStaff(updated);
        }
        showToast(
          "success",
          `Updated ${updated.name} (${ROLE_META[updated.role].label}) & synced access permissions.`
        );
      } else {
        const created = await createStaffAccount({
          name: formName.trim(),
          email: formEmail.trim(),
          password: formPassword.trim(),
          phone: formPhone.trim(),
          role: formRole,
          permissions: formRole === "SUPER_ADMIN" ? ALL_PERMISSIONS : formPermissions,
          customPermissions: formRole === "SUPER_ADMIN" ? false : formCustomPermissions,
          branchId: formBranchId,
          branchName,
          department: formDepartment.trim(),
          status: formStatus,
          notes: formNotes.trim(),
        });
        setStaffList(getStoredStaff());
        showToast(
          "success",
          `Created ${ROLE_META[created.role].label} account for ${created.name} (${created.email}).`
        );
      }
      setFormModalOpen(false);
    } catch (err: any) {
      setFormError(err?.message || "Failed to save staff account.");
    } finally {
      setSavingForm(false);
    }
  };

  // Toggle Active / Suspended status
  const handleToggleStatus = async (member: StaffMember) => {
    if (member.id === currentUser?.id || member.email.toLowerCase() === currentUser?.email?.toLowerCase()) {
      showToast("error", "You cannot suspend your own currently logged-in account.");
      return;
    }
    const nextStatus = member.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    try {
      const updated = await updateStaffAccount(member.id, { status: nextStatus });
      setStaffList(getStoredStaff());
      if (viewStaff?.id === member.id) setViewStaff(updated);
      showToast(
        "success",
        `${updated.name} (${updated.email}) is now ${nextStatus === "ACTIVE" ? "ACTIVE & can log in" : "SUSPENDED (login blocked)"}.`
      );
    } catch (err: any) {
      showToast("error", err?.message || "Could not update status.");
    }
  };

  // Confirm Delete to 30-Day Recycle Bin
  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    if (
      deleteTarget.id === currentUser?.id ||
      deleteTarget.email.toLowerCase() === currentUser?.email?.toLowerCase()
    ) {
      showToast("error", "You cannot delete your own active account.");
      setDeleteTarget(null);
      return;
    }

    moveToRecycleBin(
      "STAFF",
      deleteTarget.id,
      `${deleteTarget.name} (${ROLE_META[deleteTarget.role].label})`,
      `Email: ${deleteTarget.email} • Bookings: ${deleteTarget.totalBookings} • Revenue: AED ${deleteTarget.totalRevenue.toLocaleString()}`,
      deleteTarget,
      currentUser?.name ? `${currentUser.name} (${currentUser.role})` : "Super Admin",
      deleteReason.trim() || "Moved to 30-Day Recycle Bin"
    );

    setStaffList(getStoredStaff());
    if (viewStaff?.id === deleteTarget.id) setViewStaff(null);
    setDeleteTarget(null);
    onRecycleBinChange?.();
    showToast(
      "success",
      `Moved ${deleteTarget.name} to the 30-Day Recycle Bin. Their ${deleteTarget.totalBookings} booking records remain intact.`
    );
  };

  // Copy Login Credentials
  const handleCopyCredentials = (member: StaffMember) => {
    const text = `Role: ${ROLE_META[member.role].label}\nLogin Email: ${member.email}\nPassword: ${member.password || "Staff@123"}`;
    navigator.clipboard.writeText(text);
    setCopiedId(member.id);
    setTimeout(() => setCopiedId(null), 2000);
    showToast("success", `Copied login Email ID & Password for ${member.name}.`);
  };

  // Instant Role Session Switch (Test Login as Staff/Manager/Admin)
  const handleQuickLoginAs = (member: StaffMember) => {
    if (member.status !== "ACTIVE") {
      showToast("error", `Cannot log in as ${member.name} because their account is ${member.status}.`);
      return;
    }
    try {
      const session = authenticateStaffCredentials(member.email, member.password || "Staff@123");
      setSession(session);
      showToast("success", `Switched active session to ${member.name} (${member.role}). Redirecting…`);
      setTimeout(() => {
        if (member.role === "SUPER_ADMIN") {
          router.push("/admin");
        } else {
          router.push("/bookings");
        }
      }, 600);
    } catch (err: any) {
      showToast("error", err?.message || "Failed to switch session.");
    }
  };

  // Filtered & Sorted Staff
  const filteredStaff = useMemo(() => {
    return staffList
      .filter((m) => {
        if (roleFilter !== "ALL" && m.role !== roleFilter) return false;
        if (statusFilter !== "ALL" && m.status !== statusFilter) return false;
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          return (
            m.name.toLowerCase().includes(q) ||
            m.email.toLowerCase().includes(q) ||
            m.phone.toLowerCase().includes(q) ||
            m.department.toLowerCase().includes(q) ||
            m.branchName.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "bookings") return b.totalBookings - a.totalBookings || b.totalRevenue - a.totalRevenue;
        if (sortBy === "revenue") return b.totalRevenue - a.totalRevenue || b.totalBookings - a.totalBookings;
        if (sortBy === "name") return a.name.localeCompare(b.name);
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [staffList, roleFilter, statusFilter, search, sortBy]);

  // Aggregate KPIs
  const kpis = useMemo(() => {
    const totalMembers = staffList.length;
    const activeMembers = staffList.filter((m) => m.status === "ACTIVE").length;
    const totalBookings = staffList.reduce((acc, m) => acc + m.totalBookings, 0);
    const totalConfirmed = staffList.reduce((acc, m) => acc + m.confirmedCount + m.completedCount, 0);
    const totalRevenue = staffList.reduce((acc, m) => acc + m.totalRevenue, 0);
    const maxBookings = Math.max(1, ...staffList.map((m) => m.totalBookings));
    const topPerformer = [...staffList].sort(
      (a, b) => b.totalBookings - a.totalBookings || b.totalRevenue - a.totalRevenue
    )[0];

    return {
      totalMembers,
      activeMembers,
      totalBookings,
      totalConfirmed,
      totalRevenue,
      maxBookings,
      topPerformer,
    };
  }, [staffList]);

  // All bookings across staff for the Staff-Wise Booking Attribution Ledger tab
  const allStaffBookings = useMemo(() => {
    const rows: Array<StaffBookingItem & { creatorMember?: StaffMember }> = [];
    const seen = new Set<string>();
    for (const member of staffList) {
      for (const b of member.recentBookings) {
        const key = b.id || b.pnr;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          ...b,
          staffId: member.id,
          staffName: member.name,
          staffEmail: member.email,
          staffRole: member.role,
          creatorMember: member,
        });
      }
    }
    return rows
      .filter((r) => (ledgerStaffFilter === "ALL" ? true : r.staffId === ledgerStaffFilter))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [staffList, ledgerStaffFilter]);

  return (
    <div className="space-y-6">
      {/* TOAST NOTIFICATION */}
      {toast && (
        <div
          className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-bold shadow-sm transition ${
            toast.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {toast.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="rounded-lg p-1 hover:bg-black/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* TOP EXECUTIVE BANNER */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-white via-blue-50/40 to-indigo-50/30 p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-blue-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              Role-Based Access & Staff Booking Intelligence
            </div>
            <h2 className="mt-2 text-xl font-extrabold text-slate-900 sm:text-2xl">
              Staff, Role Management & Booking Performance Tracker
            </h2>
            <p className="mt-1 text-xs sm:text-sm font-medium text-slate-600">
              Add, edit, suspend, or delete staff & admins • Assign granular capability permissions • Separate Email ID & Password login for every role • Track{" "}
              <span className="font-bold text-blue-700">kis staff ne kitna booking kiya</span> in real time.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => void loadStaff()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-blue-600" : ""}`} />
              Sync Live Stats
            </button>
            <button
              type="button"
              onClick={() => handleOpenCreate("STAFF")}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm hover:bg-blue-700 transition"
            >
              <UserPlus className="h-4 w-4" />
              + Add New Staff / Admin
            </button>
          </div>
        </div>

        {/* KPI CARDS */}
        <div className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Total Team & Roles
              </span>
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-600">
                <Users className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-slate-900">{kpis.totalMembers}</span>
              <span className="text-xs font-bold text-emerald-600">
                {kpis.activeMembers} Active Logins
              </span>
            </div>
            <p className="mt-1 text-[11px] font-medium text-slate-500">
              Separate Email ID & Password per role
            </p>
          </div>

          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Total Staff Bookings
              </span>
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
                <Plane className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-slate-900">{kpis.totalBookings}</span>
              <span className="text-xs font-bold text-emerald-600">
                {kpis.totalConfirmed} Confirmed
              </span>
            </div>
            <p className="mt-1 text-[11px] font-medium text-slate-500">
              Every PNR attributed to its creator staff
            </p>
          </div>

          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Team Booking Revenue
              </span>
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-50 text-violet-600">
                <TrendingUp className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-slate-900">
                AED {kpis.totalRevenue.toLocaleString()}
              </span>
            </div>
            <p className="mt-1 text-[11px] font-medium text-slate-500">
              Combined active sales across all staff
            </p>
          </div>

          <div className="rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50/70 to-white p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                Top Booking Performer
              </span>
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-100 text-amber-700">
                <Award className="h-4 w-4" />
              </span>
            </div>
            {kpis.topPerformer ? (
              <>
                <div className="mt-1.5 truncate text-base font-extrabold text-slate-900">
                  {kpis.topPerformer.name}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs font-bold text-amber-700">
                  <span>{kpis.topPerformer.totalBookings} Bookings</span>
                  <span>•</span>
                  <span>AED {kpis.topPerformer.totalRevenue.toLocaleString()}</span>
                </div>
              </>
            ) : (
              <div className="mt-2 text-sm font-bold text-slate-500">No bookings yet</div>
            )}
          </div>
        </div>
      </div>

      {/* SUB-NAVIGATION TABS */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab("directory")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold transition ${
              subTab === "directory"
                ? "bg-blue-600 text-white shadow-xs"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Users className="h-4 w-4" />
            Staff Roster & Booking Counts ({staffList.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab("bookings_ledger")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold transition ${
              subTab === "bookings_ledger"
                ? "bg-blue-600 text-white shadow-xs"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            Kis Staff Ne Kitna Booking Kiya (Detailed Ledger)
          </button>
          <button
            type="button"
            onClick={() => setSubTab("roles")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold transition ${
              subTab === "roles"
                ? "bg-blue-600 text-white shadow-xs"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Shield className="h-4 w-4" />
            Role Access Blueprint (4 Tiers)
          </button>
        </div>

        <div className="text-xs font-semibold text-slate-500">
          Logged in as:{" "}
          <span className="font-extrabold text-slate-900">
            {currentUser?.name || "Garv Kataria"} ({currentUser?.role || "SUPER_ADMIN"})
          </span>
        </div>
      </div>

      {/* TAB 1: STAFF DIRECTORY, CREDENTIALS & BOOKING LEADERBOARD */}
      {subTab === "directory" && (
        <div className="space-y-4">
          {/* FILTER BAR */}
          <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search staff by name, login email ID, phone, branch, or department..."
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-10 pr-4 text-xs font-semibold text-slate-900 outline-none focus:border-blue-500 focus:bg-white"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as "ALL" | AppRole)}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
              >
                <option value="ALL">All Roles</option>
                <option value="SUPER_ADMIN">Super Admin</option>
                <option value="ADMIN">Agency Admin</option>
                <option value="MANAGER">Operations Manager</option>
                <option value="STAFF">Ticketing Staff</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as "ALL" | "ACTIVE" | "SUSPENDED" | "INACTIVE")
                }
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
              >
                <option value="ALL">All Status</option>
                <option value="ACTIVE">Active Only</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="INACTIVE">Inactive</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) =>
                  setSortBy(e.target.value as "bookings" | "revenue" | "name" | "recent")
                }
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
              >
                <option value="bookings">Sort: Most Bookings First</option>
                <option value="revenue">Sort: Highest Revenue First</option>
                <option value="name">Sort: Name (A–Z)</option>
                <option value="recent">Sort: Recently Added</option>
              </select>
            </div>
          </div>

          {/* STAFF TABLE */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3.5">Staff Member & Branch</th>
                    <th className="px-4 py-3.5">Separate Login Credentials</th>
                    <th className="px-4 py-3.5">Role & Access Permissions</th>
                    <th className="px-4 py-3.5">Kitna Booking Kiya (Performance)</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredStaff.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-sm font-semibold text-slate-500">
                        No staff members match your current filters. Click{" "}
                        <button
                          type="button"
                          onClick={() => handleOpenCreate("STAFF")}
                          className="font-extrabold text-blue-600 underline"
                        >
                          + Add New Staff / Admin
                        </button>{" "}
                        to create one.
                      </td>
                    </tr>
                  ) : (
                    filteredStaff.map((member) => {
                      const roleInfo = ROLE_META[member.role] || ROLE_META.STAFF;
                      const showPwd = Boolean(visiblePasswords[member.id]);
                      const pct = Math.min(
                        100,
                        Math.round((member.totalBookings / kpis.maxBookings) * 100)
                      );

                      return (
                        <tr
                          key={member.id}
                          className="transition hover:bg-blue-50/30"
                        >
                          {/* 1. Staff Profile */}
                          <td className="px-4 py-4 align-top">
                            <div className="flex items-start gap-3">
                              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-xs font-extrabold text-white shadow-xs">
                                {member.name
                                  .split(" ")
                                  .map((n) => n[0])
                                  .join("")
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-extrabold text-slate-900 text-sm">
                                    {member.name}
                                  </span>
                                  <span
                                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                                      member.status === "ACTIVE"
                                        ? "bg-emerald-100 text-emerald-800"
                                        : member.status === "SUSPENDED"
                                        ? "bg-rose-100 text-rose-800"
                                        : "bg-slate-200 text-slate-700"
                                    }`}
                                  >
                                    <span
                                      className={`h-1.5 w-1.5 rounded-full ${
                                        member.status === "ACTIVE"
                                          ? "bg-emerald-500"
                                          : member.status === "SUSPENDED"
                                          ? "bg-rose-500"
                                          : "bg-slate-500"
                                      }`}
                                    />
                                    {member.status}
                                  </span>
                                </div>
                                <div className="mt-0.5 text-[11px] font-semibold text-slate-500">
                                  {member.department}
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                  <span className="inline-flex items-center gap-1 font-medium">
                                    <Building2 className="h-3 w-3 text-slate-400" />
                                    {member.branchName}
                                  </span>
                                  <span>•</span>
                                  <span className="inline-flex items-center gap-1 font-mono">
                                    <Phone className="h-3 w-3 text-slate-400" />
                                    {member.phone}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* 2. Separate Login Credentials */}
                          <td className="px-4 py-4 align-top">
                            <div className="space-y-1.5 rounded-xl border border-slate-200/80 bg-slate-50/70 p-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-slate-900">
                                  <Mail className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                                  {member.email}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-600">
                                  <KeyRound className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                  <span>
                                    Pwd:{" "}
                                    <strong className="text-slate-900">
                                      {showPwd ? member.password || "Staff@123" : "••••••••"}
                                    </strong>
                                  </span>
                                </span>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setVisiblePasswords((prev) => ({
                                        ...prev,
                                        [member.id]: !prev[member.id],
                                      }))
                                    }
                                    title={showPwd ? "Hide Password" : "Show Password"}
                                    className="rounded p-1 text-slate-500 hover:bg-slate-200/70 hover:text-slate-800"
                                  >
                                    {showPwd ? (
                                      <EyeOff className="h-3.5 w-3.5" />
                                    ) : (
                                      <Eye className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyCredentials(member)}
                                    title="Copy Email & Password"
                                    className="rounded p-1 text-slate-500 hover:bg-slate-200/70 hover:text-blue-600"
                                  >
                                    {copiedId === member.id ? (
                                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                                    ) : (
                                      <Copy className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                </div>
                              </div>
                              <div className="flex items-center justify-between border-t border-slate-200/60 pt-1.5 text-[10px] text-slate-500">
                                <span>
                                  {member.lastLoginAt
                                    ? `Last login: ${new Date(member.lastLoginAt).toLocaleDateString()}`
                                    : "Never logged in"}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleQuickLoginAs(member)}
                                  className="inline-flex items-center gap-1 font-extrabold text-blue-600 hover:text-blue-800"
                                >
                                  <LogIn className="h-3 w-3" />
                                  Switch Login
                                </button>
                              </div>
                            </div>
                          </td>

                          {/* 3. Role & Access Level */}
                          <td className="px-4 py-4 align-top">
                            <div className="space-y-1.5">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-extrabold ${roleInfo.badgeBg} ${roleInfo.badgeText} ${roleInfo.border}`}
                              >
                                <ShieldCheck className="h-3.5 w-3.5" />
                                {roleInfo.label}
                              </span>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                                  {member.role === "SUPER_ADMIN"
                                    ? "All Platform Capabilities"
                                    : `${member.permissions.length} Capabilities Enabled`}
                                </span>
                                {member.customPermissions && (
                                  <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-extrabold text-indigo-700">
                                    Custom Access Override
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(member)}
                                className="text-[11px] font-bold text-blue-600 hover:underline"
                              >
                                Customize Role & Access →
                              </button>
                            </div>
                          </td>

                          {/* 4. Booking Performance ("Kitna Booking Kiya") */}
                          <td className="px-4 py-4 align-top">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-baseline gap-1.5">
                                  <span className="text-lg font-extrabold text-slate-900">
                                    {member.totalBookings}
                                  </span>
                                  <span className="text-[11px] font-bold text-slate-500">
                                    Bookings Done
                                  </span>
                                </div>
                                <span className="font-mono text-xs font-extrabold text-emerald-700">
                                  AED {member.totalRevenue.toLocaleString()}
                                </span>
                              </div>

                              {/* Progress Bar */}
                              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-blue-600 to-emerald-500 transition-all"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>

                              {/* Status Breakdown Pills */}
                              <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
                                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700 border border-emerald-200/60">
                                  {member.confirmedCount + member.completedCount} Confirmed
                                </span>
                                {member.pendingCount > 0 && (
                                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700 border border-amber-200/60">
                                    {member.pendingCount} Pending
                                  </span>
                                )}
                                {member.cancelledCount > 0 && (
                                  <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-700 border border-rose-200/60">
                                    {member.cancelledCount} Cancelled
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setViewStaff(member)}
                                  className="ml-auto text-[11px] font-extrabold text-blue-600 hover:underline"
                                >
                                  View Bookings →
                                </button>
                              </div>
                            </div>
                          </td>

                          {/* 5. Actions */}
                          <td className="px-4 py-4 align-top text-right">
                            <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setViewStaff(member)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                                title="View 360° Staff Dossier & Bookings"
                              >
                                <Eye className="h-3.5 w-3.5 text-blue-600" />
                                View
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(member)}
                                className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition"
                                title="Edit Staff Credentials, Role & Permissions"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                                Edit & Access
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleStatus(member)}
                                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition ${
                                  member.status === "ACTIVE"
                                    ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                                    : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                                }`}
                                title={
                                  member.status === "ACTIVE"
                                    ? "Suspend Staff Login"
                                    : "Activate Staff Login"
                                }
                              >
                                <Lock className="h-3.5 w-3.5" />
                                {member.status === "ACTIVE" ? "Suspend" : "Activate"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(member)}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition"
                                title="Delete Staff to 30-Day Recycle Bin"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DETAILED STAFF BOOKING ATTRIBUTION LEDGER ("KIS STAFF NE KITNA BOOKING KIYA") */}
      {subTab === "bookings_ledger" && (
        <div className="space-y-4">
          {/* Staff Selector Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <button
              type="button"
              onClick={() => setLedgerStaffFilter("ALL")}
              className={`rounded-2xl border p-4 text-left transition ${
                ledgerStaffFilter === "ALL"
                  ? "border-blue-600 bg-blue-50/60 ring-2 ring-blue-100"
                  : "border-slate-200 bg-white hover:border-blue-300"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-blue-700">
                  All Staff Combined
                </span>
                <Plane className="h-4 w-4 text-blue-600" />
              </div>
              <div className="mt-2 text-2xl font-extrabold text-slate-900">
                {kpis.totalBookings} Bookings
              </div>
              <div className="mt-0.5 text-xs font-bold text-emerald-700">
                Total: AED {kpis.totalRevenue.toLocaleString()}
              </div>
            </button>

            {staffList.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => setLedgerStaffFilter(member.id)}
                className={`rounded-2xl border p-4 text-left transition ${
                  ledgerStaffFilter === member.id
                    ? "border-blue-600 bg-blue-50/60 ring-2 ring-blue-100"
                    : "border-slate-200 bg-white hover:border-blue-300"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-extrabold text-slate-900">
                    {member.name}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold ${
                      ROLE_META[member.role].badgeBg
                    } ${ROLE_META[member.role].badgeText}`}
                  >
                    {member.role}
                  </span>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between">
                  <span className="text-xl font-extrabold text-blue-700">
                    {member.totalBookings} Bookings
                  </span>
                  <span className="font-mono text-xs font-bold text-emerald-700">
                    AED {member.totalRevenue.toLocaleString()}
                  </span>
                </div>
                <div className="mt-1 truncate font-mono text-[11px] text-slate-500">
                  {member.email}
                </div>
              </button>
            ))}
          </div>

          {/* Bookings Attribution Table */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/70 px-5 py-3.5">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  Staff Booking Attribution Log ({allStaffBookings.length} Bookings)
                </h3>
                <p className="text-xs text-slate-500">
                  Complete audit of which staff member created which PNR, customer booking, and revenue amount
                </p>
              </div>
              {ledgerStaffFilter !== "ALL" && (
                <button
                  type="button"
                  onClick={() => setLedgerStaffFilter("ALL")}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50"
                >
                  Show All Staff Bookings
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Booked By (Staff Member)</th>
                    <th className="px-4 py-3">PNR / Booking Ref</th>
                    <th className="px-4 py-3">Customer / Traveller</th>
                    <th className="px-4 py-3">Airline & Route</th>
                    <th className="px-4 py-3">Travel Date</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Booking Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {allStaffBookings.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-10 text-center text-sm font-semibold text-slate-500">
                        No bookings recorded for this staff filter yet.
                      </td>
                    </tr>
                  ) : (
                    allStaffBookings.map((b) => (
                      <tr key={`${b.id}-${b.pnr}`} className="hover:bg-blue-50/20">
                        <td className="px-4 py-3.5">
                          <div className="font-extrabold text-slate-900">{b.staffName}</div>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                            <span className="font-mono">{b.staffEmail}</span>
                            {b.staffRole && (
                              <span
                                className={`rounded px-1.5 py-0.2 text-[9px] font-extrabold ${
                                  ROLE_META[b.staffRole]?.badgeBg || "bg-slate-100"
                                } ${ROLE_META[b.staffRole]?.badgeText || "text-slate-700"}`}
                              >
                                {b.staffRole}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="rounded-md bg-blue-50 px-2 py-1 font-mono text-xs font-extrabold text-blue-800 border border-blue-200/60">
                            {b.pnr}
                          </span>
                          {b.referenceNumber && (
                            <div className="mt-1 font-mono text-[10px] text-slate-500">
                              {b.referenceNumber}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-bold text-slate-900">{b.customerName}</div>
                          {b.customerPhone && (
                            <div className="font-mono text-[11px] text-slate-500">
                              {b.customerPhone}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-bold text-slate-800">
                            {b.airline} ({b.flightNumber})
                          </div>
                          <div className="text-[11px] text-slate-500">{b.route}</div>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs font-semibold text-slate-700">
                          {new Date(b.departureDate).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-extrabold ${
                              b.status === "CONFIRMED" || b.status === "COMPLETED"
                                ? "bg-emerald-100 text-emerald-800"
                                : b.status === "CANCELLED"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {b.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-xs font-extrabold text-slate-900">
                          {b.currency || "AED"} {Number(b.amount || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ROLE & ACCESS MATRIX BLUEPRINT */}
      {subTab === "roles" && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(["SUPER_ADMIN", "ADMIN", "MANAGER", "STAFF"] as AppRole[]).map((r) => {
            const meta = ROLE_META[r];
            const defaultPerms = ROLE_DEFAULT_PERMISSIONS[r];
            const membersWithRole = staffList.filter((m) => m.role === r);

            return (
              <div
                key={r}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1 text-xs font-extrabold ${meta.badgeBg} ${meta.badgeText} ${meta.border}`}
                    >
                      <ShieldCheck className="h-4 w-4" />
                      {meta.label} ({r})
                    </span>
                    <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                      {membersWithRole.length} Assigned
                    </span>
                  </div>

                  <p className="mt-2.5 text-xs font-medium text-slate-600">{meta.desc}</p>

                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                      Default Capabilities ({defaultPerms.length})
                    </div>
                    <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto pr-1">
                      {defaultPerms.map((p) => (
                        <span
                          key={p}
                          className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-700"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3">
                  <div className="text-xs font-semibold text-slate-500">
                    Total Bookings by {meta.label}s:{" "}
                    <strong className="text-slate-900">
                      {membersWithRole.reduce((s, m) => s + m.totalBookings, 0)}
                    </strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenCreate(r)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-extrabold text-white hover:bg-blue-700 transition"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add {meta.label}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: ADD / EDIT STAFF, ROLE, SEPARATE LOGIN & GRANULAR PERMISSIONS */}
      {/* ===================================================================== */}
      {formModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  {editingStaff
                    ? `Edit Staff & Access Permissions — ${editingStaff.name}`
                    : "Add New Staff / Admin Account"}
                </h3>
                <p className="text-xs font-medium text-slate-500">
                  Configure separate Email ID & Password login, role tier, branch assignment, and granular module access
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormModalOpen(false)}
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSaveStaff} className="flex-1 space-y-6 overflow-y-auto p-6">
              {formError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-800">
                  {formError}
                </div>
              )}

              {/* Section 1: Identity & Separate Login Credentials */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                <h4 className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-700">
                  <KeyRound className="h-4 w-4 text-blue-600" />
                  1. Staff Identity & Separate Login Credentials
                </h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">
                      Full Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="e.g. Rohan Sharma"
                      className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-900 outline-none focus:border-blue-600"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">
                      Separate Login Email ID <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      placeholder="e.g. rohan.staff@blueauratravels.com"
                      className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3.5 font-mono text-xs font-semibold text-slate-900 outline-none focus:border-blue-600"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-1 flex items-center justify-between text-xs font-bold text-slate-700">
                      <span>
                        Login Password {editingStaff ? "(Leave blank to keep current)" : "*"}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setFormPassword(`Bat@${Math.floor(1000 + Math.random() * 9000)}`)
                        }
                        className="text-[11px] font-extrabold text-blue-600 hover:underline"
                      >
                        Generate Strong Password
                      </button>
                    </label>
                    <div className="relative">
                      <input
                        type={showFormPassword ? "text" : "password"}
                        value={formPassword}
                        onChange={(e) => setFormPassword(e.target.value)}
                        placeholder={editingStaff ? "Enter new password to reset" : "Minimum 6 characters"}
                        className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-3.5 pr-10 font-mono text-xs font-semibold text-slate-900 outline-none focus:border-blue-600"
                      />
                      <button
                        type="button"
                        onClick={() => setShowFormPassword(!showFormPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                      >
                        {showFormPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <PhoneInput
                      label="Phone / WhatsApp Number"
                      value={formPhone}
                      onChange={(full, valid) => {
                        setFormPhone(full);
                        setFormPhoneValid(valid);
                      }}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Role, Branch & Account Status */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                <h4 className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-700">
                  <Shield className="h-4 w-4 text-blue-600" />
                  2. Role Assignment, Branch & Login Status
                </h4>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  {(["STAFF", "MANAGER", "ADMIN", ...(isCurrentSuperAdmin ? (["SUPER_ADMIN"] as AppRole[]) : [])] as AppRole[]).map(
                    (r) => {
                      const meta = ROLE_META[r];
                      const active = formRole === r;
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => handleRoleSelectInForm(r)}
                          className={`flex flex-col items-start rounded-xl border-2 p-3 text-left transition ${
                            active
                              ? "border-blue-600 bg-blue-50/70 shadow-xs"
                              : "border-slate-200 bg-white hover:border-blue-300"
                          }`}
                        >
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold ${meta.badgeBg} ${meta.badgeText}`}
                          >
                            {meta.label}
                          </span>
                          <span className="mt-1.5 text-[11px] font-medium text-slate-600 line-clamp-2">
                            {meta.desc}
                          </span>
                        </button>
                      );
                    }
                  )}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">
                      Assigned Branch
                    </label>
                    <select
                      value={formBranchId}
                      onChange={(e) => setFormBranchId(e.target.value)}
                      className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900 outline-none focus:border-blue-600"
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">
                      Department / Desk
                    </label>
                    <input
                      type="text"
                      value={formDepartment}
                      onChange={(e) => setFormDepartment(e.target.value)}
                      placeholder="e.g. Corporate Ticketing Desk"
                      className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-900 outline-none focus:border-blue-600"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">
                      Account Login Status
                    </label>
                    <select
                      value={formStatus}
                      onChange={(e) =>
                        setFormStatus(e.target.value as "ACTIVE" | "INACTIVE" | "SUSPENDED")
                      }
                      className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900 outline-none focus:border-blue-600"
                    >
                      <option value="ACTIVE">ACTIVE (Can Log In)</option>
                      <option value="SUSPENDED">SUSPENDED (Login Blocked)</option>
                      <option value="INACTIVE">INACTIVE (Deactivated)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 3: Granular Staff-Based Access Matrix */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h4 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-800">
                      <ShieldCheck className="h-4 w-4 text-blue-600" />
                      3. Granular Staff-Based Access Matrix ({formPermissions.length} Capabilities Active)
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Customize exactly which actions this staff member can perform after logging in
                    </p>
                  </div>

                  {formRole !== "SUPER_ADMIN" && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setFormCustomPermissions(false);
                          setFormPermissions(getDefaultPermissionsForRole(formRole));
                        }}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
                      >
                        Reset to {ROLE_META[formRole].label} Default
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFormCustomPermissions(true);
                          setFormPermissions(
                            ALL_PERMISSIONS.filter((p) => p !== "platform:tenants")
                          );
                        }}
                        className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100"
                      >
                        Grant All Agency Access
                      </button>
                    </div>
                  )}
                </div>

                {formRole === "SUPER_ADMIN" ? (
                  <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 text-xs font-bold text-violet-900">
                    Super Admin holds all {ALL_PERMISSIONS.length} platform & agency permissions unconditionally.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {PERMISSION_CATALOG.map((group) => {
                      const groupKeys = group.items.map((i) => i.key);
                      const checkedCount = groupKeys.filter((k) =>
                        formPermissions.includes(k)
                      ).length;

                      return (
                        <div
                          key={group.group}
                          className="rounded-xl border border-slate-200 bg-slate-50/40 p-3.5"
                        >
                          <div className="mb-2 flex items-center justify-between border-b border-slate-200/70 pb-2">
                            <div>
                              <div className="text-xs font-extrabold text-slate-900">
                                {group.group}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {group.description}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleToggleGroup(groupKeys)}
                              className="rounded bg-white px-2 py-0.5 text-[10px] font-extrabold text-blue-600 border border-slate-200 hover:bg-blue-50"
                            >
                              {checkedCount === groupKeys.length ? "Unselect All" : "Select All"}
                            </button>
                          </div>

                          <div className="space-y-1.5">
                            {group.items.map((item) => {
                              const checked = formPermissions.includes(item.key);
                              return (
                                <label
                                  key={item.key}
                                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg p-1.5 text-xs transition ${
                                    checked ? "bg-blue-50/80 text-slate-900" : "text-slate-600 hover:bg-white"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => handleTogglePermission(item.key)}
                                    className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <div className="flex-1">
                                    <div className="font-bold leading-tight">{item.label}</div>
                                    <div className="text-[10px] text-slate-500">{item.desc}</div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  Internal Admin Notes (Optional)
                </label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="e.g. Authorized for Emirates & Qatar corporate PNR issuance"
                  className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-900 outline-none focus:border-blue-600"
                />
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setFormModalOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingForm}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {savingForm
                    ? "Saving..."
                    : editingStaff
                    ? "Save Staff & Access Changes"
                    : "Create Staff Account & Credentials"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: 360° STAFF DOSSIER & "KIS STAFF NE KITNA BOOKING KIYA" MODAL */}
      {/* ===================================================================== */}
      {viewStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-600 text-sm font-extrabold text-white">
                  {viewStaff.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-extrabold text-slate-900">{viewStaff.name}</h3>
                    <span
                      className={`rounded-lg border px-2.5 py-0.5 text-[11px] font-extrabold ${
                        ROLE_META[viewStaff.role].badgeBg
                      } ${ROLE_META[viewStaff.role].badgeText} ${ROLE_META[viewStaff.role].border}`}
                    >
                      {ROLE_META[viewStaff.role].label}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-slate-500">
                    {viewStaff.email} • {viewStaff.branchName}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const target = viewStaff;
                    setViewStaff(null);
                    handleOpenEdit(target);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-extrabold text-blue-700 hover:bg-blue-100"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Edit Staff & Access
                </button>
                <button
                  type="button"
                  onClick={() => setViewStaff(null)}
                  className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              {/* Performance Summary Strip */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
                  <div className="text-[10px] font-extrabold uppercase text-slate-500">
                    Total Bookings Done
                  </div>
                  <div className="mt-1 text-2xl font-extrabold text-blue-700">
                    {viewStaff.totalBookings}
                  </div>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-3.5">
                  <div className="text-[10px] font-extrabold uppercase text-emerald-700">
                    Confirmed / Completed
                  </div>
                  <div className="mt-1 text-2xl font-extrabold text-emerald-800">
                    {viewStaff.confirmedCount + viewStaff.completedCount}
                  </div>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-3.5">
                  <div className="text-[10px] font-extrabold uppercase text-amber-700">
                    Pending / Quotes
                  </div>
                  <div className="mt-1 text-2xl font-extrabold text-amber-800">
                    {viewStaff.pendingCount}
                  </div>
                </div>
                <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-3.5">
                  <div className="text-[10px] font-extrabold uppercase text-violet-700">
                    Revenue Generated
                  </div>
                  <div className="mt-1 text-xl font-extrabold text-violet-900">
                    AED {viewStaff.totalRevenue.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Login Credentials & Quick Switch */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-blue-200/80 bg-blue-50/40 p-4">
                <div className="space-y-1 text-xs">
                  <div className="font-extrabold text-slate-900">
                    Separate Role Login Credentials
                  </div>
                  <div className="flex flex-wrap items-center gap-4 font-mono text-slate-700">
                    <span>
                      Email ID: <strong>{viewStaff.email}</strong>
                    </span>
                    <span>
                      Password: <strong>{viewStaff.password || "Staff@123"}</strong>
                    </span>
                    <span>
                      Phone: <strong>{viewStaff.phone}</strong>
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyCredentials(viewStaff)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy Credentials
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickLoginAs(viewStaff)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-extrabold text-white hover:bg-blue-700"
                  >
                    <LogIn className="h-3.5 w-3.5" />
                    Log In as {viewStaff.name}
                  </button>
                </div>
              </div>

              {/* Bookings Created by this Staff Member */}
              <div>
                <h4 className="mb-2.5 text-xs font-extrabold uppercase tracking-wider text-slate-700">
                  Bookings Created by {viewStaff.name} ({viewStaff.recentBookings.length})
                </h4>
                {viewStaff.recentBookings.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-xs font-semibold text-slate-500">
                    No bookings recorded under {viewStaff.name} yet.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-extrabold uppercase text-slate-500">
                          <th className="px-3.5 py-2.5">PNR / Ref</th>
                          <th className="px-3.5 py-2.5">Customer</th>
                          <th className="px-3.5 py-2.5">Flight / Route</th>
                          <th className="px-3.5 py-2.5">Departure</th>
                          <th className="px-3.5 py-2.5">Status</th>
                          <th className="px-3.5 py-2.5 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {viewStaff.recentBookings.map((b) => (
                          <tr key={`${b.id}-${b.pnr}`} className="hover:bg-slate-50">
                            <td className="px-3.5 py-2.5 font-mono font-bold text-blue-700">
                              {b.pnr}
                            </td>
                            <td className="px-3.5 py-2.5 font-bold text-slate-900">
                              {b.customerName}
                            </td>
                            <td className="px-3.5 py-2.5 text-slate-700">
                              {b.airline} • {b.route}
                            </td>
                            <td className="px-3.5 py-2.5 font-mono text-slate-600">
                              {new Date(b.departureDate).toLocaleDateString()}
                            </td>
                            <td className="px-3.5 py-2.5">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                                  b.status === "CONFIRMED" || b.status === "COMPLETED"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : b.status === "CANCELLED"
                                    ? "bg-rose-100 text-rose-800"
                                    : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                {b.status}
                              </span>
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-mono font-extrabold text-slate-900">
                              {b.currency || "AED"} {Number(b.amount || 0).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Active Permissions List */}
              <div>
                <h4 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-slate-700">
                  Active Access Permissions ({viewStaff.permissions.length})
                </h4>
                <div className="flex flex-wrap gap-1.5 rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5">
                  {viewStaff.permissions.map((perm) => (
                    <span
                      key={perm}
                      className="rounded-lg border border-blue-200/80 bg-white px-2.5 py-1 font-mono text-[11px] font-bold text-slate-800"
                    >
                      {perm}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: DELETE STAFF TO 30-DAY RECYCLE BIN CONFIRMATION              */}
      {/* ===================================================================== */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-rose-100 text-rose-600">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Move Staff to 30-Day Recycle Bin?
                </h3>
                <p className="text-xs font-medium text-slate-500">
                  {deleteTarget.name} ({deleteTarget.email})
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs font-medium text-amber-900">
              • Login access for <strong>{deleteTarget.email}</strong> will be immediately revoked.
              <br />• All <strong>{deleteTarget.totalBookings} bookings</strong> created by{" "}
              {deleteTarget.name} will remain safely preserved in the ledger.
              <br />• You can restore this staff account anytime within <strong>30 days</strong> from
              the Recycle Bin.
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-xs font-bold text-slate-700">
                Reason for Removal
              </label>
              <input
                type="text"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900 outline-none focus:border-rose-500"
              />
            </div>

            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-rose-700"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Move to 30-Day Recycle Bin
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
