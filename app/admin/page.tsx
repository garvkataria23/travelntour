"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Ban,
  Bell,
  Building,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Database,
  Eye,
  FileCode,
  Flame,
  Globe,
  HelpCircle,
  KeyRound,
  Layers,
  Lock,
  MapPin,
  MessageCircle,
  MessageSquare,
  PauseCircle,
  Pencil,
  Phone,
  PlayCircle,
  Plus,
  Power,
  RefreshCw,
  Search,
  Server,
  Settings2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Terminal,
  Trash2,
  Unlock,
  UploadCloud,
  UserCheck,
  Users,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import {
  AdminAccount,
  getAdminAccounts,
  isAccountBlocked,
  isMasterAdminCredentials,
  MASTER_ADMIN_ID,
  MASTER_ADMIN_PASS,
  saveAdminAccounts,
  toggleAccountStatus,
  updateAccountWhatsAppLimit,
  updateAdminAccount,
  addNewAccount,
  deleteAccount,
} from "@/lib/admin-accounts";
import {
  clearAllDiagnostics,
  clearResolvedDiagnostics,
  DiagnosticCategory,
  DiagnosticSeverity,
  getDiagnosticErrors,
  logDiagnosticError,
  resolveDiagnosticError,
  retryDiagnosticAction,
  simulateDiagnosticError,
  SystemDiagnosticError,
  unresolveDiagnosticError,
} from "@/lib/admin-diagnostics";
import {
  addWhatsAppQuotaCredits,
  evaluateQuotaStatus,
  getStoredQuota,
  resetWhatsAppUsage,
  setSimulationUsage,
  setWhatsAppCustomLimits,
  setWhatsAppUsageCount,
  toggleWhatsAppGlobalPause,
  WhatsAppQuotaConfig,
} from "@/lib/whatsapp-quota";
import {
  Branch,
  Company,
  deleteBranch,
  deleteCompany,
  getStoredBranches,
  getStoredCompanies,
  INITIAL_BRANCHES,
  INITIAL_COMPANIES,
  saveBranch,
  saveCompany,
} from "@/lib/travel-crm";
import { clearSession, getStoredUser, hasActiveSession, setSession, ApiUser } from "@/lib/api";

type AdminTab = "accounts" | "branches" | "whatsapp" | "diagnostics" | "system";

export default function MasterAdminPage() {
  const router = useRouter();

  // Authentication State
  const [currentUser, setCurrentUser] = useState<ApiUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Login Form State (when not authenticated as Super Admin)
  const [loginId, setLoginId] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Active Tab
  const [activeTab, setActiveTab] = useState<AdminTab>("accounts");

  // Accounts Data
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [accountSearch, setAccountSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState<"ALL" | "ACTIVE" | "BLOCKED" | "SUSPENDED">("ALL");

  // Block Modal
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [targetAccount, setTargetAccount] = useState<AdminAccount | null>(null);
  const [blockReason, setBlockReason] = useState("");

  // Edit Agency Modal (SAB PROPER EDITABLE)
  const [editAccModalOpen, setEditAccModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AdminAccount | null>(null);
  const [editAccName, setEditAccName] = useState("");
  const [editAccOwner, setEditAccOwner] = useState("");
  const [editAccEmail, setEditAccEmail] = useState("");
  const [editAccPhone, setEditAccPhone] = useState("");
  const [editAccPlan, setEditAccPlan] = useState<"ENTERPRISE" | "PROFESSIONAL" | "STARTER">("ENTERPRISE");
  const [editAccBranch, setEditAccBranch] = useState("Dubai Flagship Headquarters");
  const [editAccCurrency, setEditAccCurrency] = useState("AED");
  const [editAccStatus, setEditAccStatus] = useState<"ACTIVE" | "BLOCKED" | "SUSPENDED">("ACTIVE");
  const [editAccNotes, setEditAccNotes] = useState("");

  // Dedicated Quota Modal Box (REPLACES BROWSER PROMPT)
  const [quotaModalOpen, setQuotaModalOpen] = useState(false);
  const [targetQuotaAccount, setTargetQuotaAccount] = useState<AdminAccount | null>(null);
  const [quotaModalLimitInput, setQuotaModalLimitInput] = useState<string>("1000");
  const [quotaModalWarningInput, setQuotaModalWarningInput] = useState<string>("800");
  const [quotaModalCriticalInput, setQuotaModalCriticalInput] = useState<string>("950");
  const [quotaModalResetUsage, setQuotaModalResetUsage] = useState(false);

  // New Agency Modal
  const [newAccModalOpen, setNewAccModalOpen] = useState(false);
  const [newAccName, setNewAccName] = useState("");
  const [newAccOwner, setNewAccOwner] = useState("");
  const [newAccEmail, setNewAccEmail] = useState("");
  const [newAccPhone, setNewAccPhone] = useState("");
  const [newAccPlan, setNewAccPlan] = useState<"ENTERPRISE" | "PROFESSIONAL" | "STARTER">("PROFESSIONAL");
  const [newAccLimit, setNewAccLimit] = useState(1000);

  // Branches & Corporate Companies Data (KAUNSE BRANCH MEIN KITNE COMPANY)
  const [branches, setBranches] = useState<Branch[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>("ALL");
  const [companySearchQuery, setCompanySearchQuery] = useState<string>("");

  // Edit Corporate Company Modal (COMPANY NAME CHANGE DROP DOWN MEIN CHANGE NAME)
  const [editCompModalOpen, setEditCompModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [editCompName, setEditCompName] = useState("");
  const [editCompCode, setEditCompCode] = useState("");
  const [editCompBranchId, setEditCompBranchId] = useState("");
  const [editCompIndustry, setEditCompIndustry] = useState("");
  const [editCompContact, setEditCompContact] = useState("");
  const [editCompEmail, setEditCompEmail] = useState("");
  const [editCompPhone, setEditCompPhone] = useState("");
  const [editCompAddress, setEditCompAddress] = useState("");
  const [editCompCreditLimit, setEditCompCreditLimit] = useState<number>(150000);
  const [editCompPaymentTerms, setEditCompPaymentTerms] = useState("Net 30 Days");
  const [editCompCostCenter, setEditCompCostCenter] = useState("");
  const [editCompStatus, setEditCompStatus] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");

  // New Corporate Company Modal
  const [newCompModalOpen, setNewCompModalOpen] = useState(false);
  const [newCompName, setNewCompName] = useState("");
  const [newCompCode, setNewCompCode] = useState("");
  const [newCompBranchId, setNewCompBranchId] = useState("branch-dxb");
  const [newCompIndustry, setNewCompIndustry] = useState("Corporate Services");
  const [newCompContact, setNewCompContact] = useState("");
  const [newCompEmail, setNewCompEmail] = useState("");
  const [newCompPhone, setNewCompPhone] = useState("");
  const [newCompAddress, setNewCompAddress] = useState("");
  const [newCompCreditLimit, setNewCompCreditLimit] = useState<number>(100000);

  // New Regional Branch Modal
  const [newBranchModalOpen, setNewBranchModalOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchCode, setNewBranchCode] = useState("");
  const [newBranchCity, setNewBranchCity] = useState("");
  const [newBranchCountry, setNewBranchCountry] = useState("");
  const [newBranchAddress, setNewBranchAddress] = useState("");
  const [newBranchManager, setNewBranchManager] = useState("");
  const [newBranchPhone, setNewBranchPhone] = useState("");
  const [newBranchEmail, setNewBranchEmail] = useState("");

  // WhatsApp Quota Master Tab State
  const [quota, setQuota] = useState<WhatsAppQuotaConfig>(getStoredQuota());
  const [customLimitInput, setCustomLimitInput] = useState<string>("1000");
  const [customWarningInput, setCustomWarningInput] = useState<string>("800");
  const [customCriticalInput, setCustomCriticalInput] = useState<string>("950");
  const [quotaFeedback, setQuotaFeedback] = useState<string>("");
  const [killSwitchReason, setKillSwitchReason] = useState("");

  // Diagnostics Data
  const [diagnostics, setDiagnostics] = useState<SystemDiagnosticError[]>([]);
  const [diagCategoryFilter, setDiagCategoryFilter] = useState<string>("ALL");
  const [diagSeverityFilter, setDiagSeverityFilter] = useState<string>("ALL");
  const [diagStatusFilter, setDiagStatusFilter] = useState<"ALL" | "UNRESOLVED" | "RESOLVED">("ALL");
  const [diagSearch, setDiagSearch] = useState("");
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const [selectedError, setSelectedError] = useState<SystemDiagnosticError | null>(null);
  const [retryActionMsg, setRetryActionMsg] = useState<{ id: string; text: string } | null>(null);

  // Toast Notice State
  const [toastMsg, setToastMsg] = useState<string>("");
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 4500);
  };

  // Synchronize Auth on Mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const user = getStoredUser();
      if (user && user.role === "SUPER_ADMIN") {
        setCurrentUser(user);
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
      setCheckingAuth(false);
    }
  }, []);

  // Reload all datasets
  const refreshData = () => {
    setAccounts(getAdminAccounts());
    setBranches(getStoredBranches());
    setCompanies(getStoredCompanies());
    setDiagnostics(getDiagnosticErrors());
    const q = getStoredQuota();
    setQuota(q);
    setCustomLimitInput(q.limit.toString());
    setCustomWarningInput(q.warningThreshold.toString());
    setCustomCriticalInput(q.criticalThreshold.toString());
  };

  useEffect(() => {
    refreshData();

    const handleQuota = () => setQuota(getStoredQuota());
    const handleAccounts = () => setAccounts(getAdminAccounts());
    const handleDiag = () => setDiagnostics(getDiagnosticErrors());
    const handleBranches = () => setBranches(getStoredBranches());
    const handleCompanies = () => setCompanies(getStoredCompanies());

    window.addEventListener("fc:whatsapp-quota-updated", handleQuota);
    window.addEventListener("fc:admin-accounts-updated", handleAccounts);
    window.addEventListener("fc:account-status-changed", handleAccounts);
    window.addEventListener("fc:diagnostics-updated", handleDiag);
    window.addEventListener("fc:branches-updated", handleBranches);
    window.addEventListener("fc:companies-updated", handleCompanies);

    return () => {
      window.removeEventListener("fc:whatsapp-quota-updated", handleQuota);
      window.removeEventListener("fc:admin-accounts-updated", handleAccounts);
      window.removeEventListener("fc:account-status-changed", handleAccounts);
      window.removeEventListener("fc:diagnostics-updated", handleDiag);
      window.removeEventListener("fc:branches-updated", handleBranches);
      window.removeEventListener("fc:companies-updated", handleCompanies);
    };
  }, []);

  // Handle Master Admin Login
  const handleMasterLogin = (e: FormEvent) => {
    e.preventDefault();
    setLoginErr("");
    setLoginLoading(true);

    if (isMasterAdminCredentials(loginId, loginPass)) {
      const superUser: ApiUser = {
        id: "usr_master_admin_garv",
        name: "Garv Kataria (Master Admin)",
        email: "admin@blueauratravel.com",
        role: "SUPER_ADMIN",
        businessId: "biz_blueaura",
      };

      setSession(
        {
          accessToken: "token_master_admin_garv",
          refreshToken: "refresh_master_admin_garv",
          user: superUser,
        },
        true
      );

      if (typeof window !== "undefined") {
        window.localStorage.setItem("fc_business_id", "biz_blueaura");
        window.localStorage.setItem("fc_is_master_admin", "1");
      }

      setCurrentUser(superUser);
      setIsAuthenticated(true);
      setLoginLoading(false);
      refreshData();
    } else {
      setLoginErr("Invalid Master Admin ID or Password. Please verify credentials.");
      setLoginLoading(false);
    }
  };

  const fillMasterCredentials = () => {
    setLoginId(MASTER_ADMIN_ID);
    setLoginPass(MASTER_ADMIN_PASS);
    setLoginErr("");
  };

  const handleLogout = () => {
    clearSession();
    setIsAuthenticated(false);
    setCurrentUser(null);
    router.replace("/");
  };

  // Quota Status Evaluation
  const quotaStatus = useMemo(() => evaluateQuotaStatus(quota), [quota]);

  // Filtered Accounts
  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      if (accountFilter !== "ALL" && acc.status !== accountFilter) return false;
      if (accountSearch.trim()) {
        const q = accountSearch.toLowerCase();
        return (
          acc.name.toLowerCase().includes(q) ||
          acc.ownerName.toLowerCase().includes(q) ||
          acc.email.toLowerCase().includes(q) ||
          acc.id.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [accounts, accountFilter, accountSearch]);

  // Filtered Diagnostics
  const filteredDiagnostics = useMemo(() => {
    return diagnostics.filter((diag) => {
      if (diagCategoryFilter !== "ALL" && diag.category !== diagCategoryFilter) return false;
      if (diagSeverityFilter !== "ALL" && diag.severity !== diagSeverityFilter) return false;
      if (diagStatusFilter === "UNRESOLVED" && diag.resolved) return false;
      if (diagStatusFilter === "RESOLVED" && !diag.resolved) return false;
      if (diagSearch.trim()) {
        const q = diagSearch.toLowerCase();
        return (
          diag.title.toLowerCase().includes(q) ||
          diag.message.toLowerCase().includes(q) ||
          diag.errorCode.toLowerCase().includes(q) ||
          (diag.accountName && diag.accountName.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [diagnostics, diagCategoryFilter, diagSeverityFilter, diagStatusFilter, diagSearch]);

  // Map Branches to their Company Counts ("KAUNSE BRANCH MEIN KITNE COMPANY")
  const branchCompanyCounts = useMemo(() => {
    const map: Record<string, number> = {};
    branches.forEach((b) => {
      map[b.id] = 0;
    });
    companies.forEach((c) => {
      if (c.branchId) {
        map[c.branchId] = (map[c.branchId] || 0) + 1;
      }
    });
    return map;
  }, [branches, companies]);

  // Filtered Corporate Companies
  const filteredCompanies = useMemo(() => {
    return companies.filter((comp) => {
      if (selectedBranchFilter !== "ALL" && comp.branchId !== selectedBranchFilter) return false;
      if (companySearchQuery.trim()) {
        const q = companySearchQuery.toLowerCase();
        return (
          comp.name.toLowerCase().includes(q) ||
          comp.code.toLowerCase().includes(q) ||
          comp.contactPerson.toLowerCase().includes(q) ||
          (comp.branchName && comp.branchName.toLowerCase().includes(q)) ||
          comp.industry.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [companies, selectedBranchFilter, companySearchQuery]);

  // Stats Counters
  const unresolvedErrorsCount = useMemo(() => diagnostics.filter((d) => !d.resolved).length, [diagnostics]);
  const criticalErrorsCount = useMemo(() => diagnostics.filter((d) => !d.resolved && d.severity === "CRITICAL").length, [diagnostics]);
  const activeTenantsCount = useMemo(() => accounts.filter((a) => a.status === "ACTIVE").length, [accounts]);
  const blockedTenantsCount = useMemo(() => accounts.filter((a) => a.status === "BLOCKED" || a.status === "SUSPENDED").length, [accounts]);

  // =========================================================================
  // ACTIONS: EDIT AGENCY / TENANT
  // =========================================================================
  const openEditAgencyDialog = (acc: AdminAccount) => {
    setEditingAccount(acc);
    setEditAccName(acc.name);
    setEditAccOwner(acc.ownerName);
    setEditAccEmail(acc.email);
    setEditAccPhone(acc.phone);
    setEditAccPlan(acc.plan);
    setEditAccBranch(acc.branchName || "Dubai Flagship Headquarters");
    setEditAccCurrency(acc.currency || "AED");
    setEditAccStatus(acc.status);
    setEditAccNotes(acc.notes || "");
    setEditAccModalOpen(true);
  };

  const handleSaveAgency = (e: FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;

    try {
      updateAdminAccount(editingAccount.id, {
        name: editAccName.trim(),
        ownerName: editAccOwner.trim(),
        email: editAccEmail.trim(),
        phone: editAccPhone.trim(),
        plan: editAccPlan,
        branchName: editAccBranch,
        currency: editAccCurrency,
        status: editAccStatus,
        notes: editAccNotes.trim(),
      });

      setEditAccModalOpen(false);
      setEditingAccount(null);
      setAccounts(getAdminAccounts());
      showToast(`Agency "${editAccName}" details updated successfully!`);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  // =========================================================================
  // ACTIONS: PROPER QUOTA MODAL BOX (REPLACES BROWSER PROMPT)
  // =========================================================================
  const openQuotaBoxDialog = (acc: AdminAccount) => {
    setTargetQuotaAccount(acc);
    setQuotaModalLimitInput(acc.whatsappLimit.toString());
    setQuotaModalWarningInput(Math.round(acc.whatsappLimit * 0.8).toString());
    setQuotaModalCriticalInput(Math.round(acc.whatsappLimit * 0.95).toString());
    setQuotaModalResetUsage(false);
    setQuotaModalOpen(true);
  };

  const handleSaveAccountQuotaBox = () => {
    if (!targetQuotaAccount) return;
    const limitNum = parseInt(quotaModalLimitInput, 10);
    const warningNum = parseInt(quotaModalWarningInput, 10);
    const criticalNum = parseInt(quotaModalCriticalInput, 10);

    if (isNaN(limitNum) || limitNum < 10) {
      alert("WhatsApp Limit must be a valid number of at least 10 messages.");
      return;
    }

    try {
      updateAccountWhatsAppLimit(targetQuotaAccount.id, limitNum, "Garv Kataria (Master Admin)");

      if (quotaModalResetUsage) {
        resetWhatsAppUsage("Garv Kataria (Master Admin)");
      }

      setQuotaModalOpen(false);
      setTargetQuotaAccount(null);
      setAccounts(getAdminAccounts());
      setQuota(getStoredQuota());
      showToast(`WhatsApp Limit for "${targetQuotaAccount.name}" set to ${limitNum.toLocaleString()} messages!`);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  // =========================================================================
  // ACTIONS: EDIT CORPORATE COMPANY (RENAME & MOVE BRANCH)
  // =========================================================================
  const openEditCompanyDialog = (company: Company) => {
    setEditingCompany(company);
    setEditCompName(company.name);
    setEditCompCode(company.code);
    setEditCompBranchId(company.branchId || "branch-dxb");
    setEditCompIndustry(company.industry);
    setEditCompContact(company.contactPerson);
    setEditCompEmail(company.email);
    setEditCompPhone(company.phone);
    setEditCompAddress(company.address);
    setEditCompCreditLimit(company.creditLimit);
    setEditCompPaymentTerms(company.paymentTerms);
    setEditCompCostCenter(company.defaultCostCenter);
    setEditCompStatus(company.status || "ACTIVE");
    setEditCompModalOpen(true);
  };

  const handleSaveCompany = (e: FormEvent) => {
    e.preventDefault();
    if (!editingCompany) return;

    const matchedBranch = branches.find((b) => b.id === editCompBranchId);
    const branchName = matchedBranch ? matchedBranch.name : editingCompany.branchName;

    const updated: Company = {
      ...editingCompany,
      name: editCompName.trim(),
      code: editCompCode.trim().toUpperCase(),
      branchId: editCompBranchId,
      branchName,
      industry: editCompIndustry.trim(),
      contactPerson: editCompContact.trim(),
      email: editCompEmail.trim(),
      phone: editCompPhone.trim(),
      address: editCompAddress.trim(),
      creditLimit: Number(editCompCreditLimit) || 100000,
      paymentTerms: editCompPaymentTerms,
      defaultCostCenter: editCompCostCenter.trim() || "CC-CORP",
      status: editCompStatus,
    };

    saveCompany(updated);
    setEditCompModalOpen(false);
    setEditingCompany(null);
    setCompanies(getStoredCompanies());
    showToast(`Company renamed to "${updated.name}"! Updated in booking dropdowns across CRM.`);
  };

  // Create New Corporate Company
  const handleCreateCompany = (e: FormEvent) => {
    e.preventDefault();
    if (!newCompName.trim()) {
      alert("Company Name is required.");
      return;
    }

    const matchedBranch = branches.find((b) => b.id === newCompBranchId);
    const newId = `comp-${Date.now().toString(36)}`;
    const created: Company = {
      id: newId,
      name: newCompName.trim(),
      code: newCompCode.trim().toUpperCase() || `CORP-${newId.slice(-4).toUpperCase()}`,
      branchId: newCompBranchId,
      branchName: matchedBranch?.name || "Dubai Flagship Headquarters",
      industry: newCompIndustry.trim() || "Corporate Services",
      contactPerson: newCompContact.trim() || "Corporate Travel Lead",
      email: newCompEmail.trim() || "traveldesk@client.com",
      phone: newCompPhone.trim() || "+971 4 000 0000",
      address: newCompAddress.trim() || "Corporate Office, UAE",
      creditLimit: Number(newCompCreditLimit) || 100000,
      outstandingBalance: 0,
      paymentTerms: "Net 30 Days",
      defaultCostCenter: "CC-CORP-01",
      totalBookings: 0,
      activeEmployees: 10,
      monthlySpend: 0,
      lastBookingDate: new Date().toISOString().split("T")[0],
      status: "ACTIVE",
    };

    saveCompany(created);
    setNewCompModalOpen(false);
    setNewCompName("");
    setNewCompCode("");
    setNewCompContact("");
    setNewCompEmail("");
    setNewCompPhone("");
    setNewCompAddress("");
    setCompanies(getStoredCompanies());
    showToast(`New company "${created.name}" created and mapped to ${created.branchName}!`);
  };

  // Create New Regional Branch
  const handleCreateBranch = (e: FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim() || !newBranchCity.trim()) {
      alert("Branch Name and City are required.");
      return;
    }

    const newId = `branch-${Date.now().toString(36)}`;
    const created: Branch = {
      id: newId,
      name: newBranchName.trim(),
      code: newBranchCode.trim().toUpperCase() || `BR-${newBranchCity.slice(0, 3).toUpperCase()}`,
      city: newBranchCity.trim(),
      country: newBranchCountry.trim() || "International",
      address: newBranchAddress.trim() || "Regional Business Center",
      managerName: newBranchManager.trim() || "Branch Manager",
      managerEmail: newBranchEmail.trim() || "branch@blueauratravel.com",
      phone: newBranchPhone.trim() || "+971 50 000 0000",
      status: "ACTIVE",
      notes: "Configured via Master Admin Control Center",
    };

    saveBranch(created);
    setNewBranchModalOpen(false);
    setNewBranchName("");
    setNewBranchCode("");
    setNewBranchCity("");
    setNewBranchCountry("");
    setNewBranchAddress("");
    setNewBranchManager("");
    setNewBranchPhone("");
    setNewBranchEmail("");
    setBranches(getStoredBranches());
    showToast(`New branch "${created.name}" registered successfully!`);
  };

  // Delete Company
  const handleDeleteCompany = (id: string, name: string) => {
    if (confirm(`Are you sure you want to remove "${name}" from the corporate registry?`)) {
      deleteCompany(id);
      setCompanies(getStoredCompanies());
      showToast(`Company "${name}" removed from registry.`);
    }
  };

  // Action: Open Block Modal
  const openBlockDialog = (acc: AdminAccount) => {
    setTargetAccount(acc);
    setBlockReason(acc.blockReason || "");
    setBlockModalOpen(true);
  };

  const handleConfirmAccountStatus = (status: "ACTIVE" | "BLOCKED" | "SUSPENDED") => {
    if (!targetAccount) return;
    try {
      toggleAccountStatus(targetAccount.id, status, blockReason, "Garv Kataria (Master Admin)");
      setBlockModalOpen(false);
      setTargetAccount(null);
      setAccounts(getAdminAccounts());
      showToast(`Account status updated to ${status}.`);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  // Save Custom Global WhatsApp Limits
  const handleSaveCustomLimits = () => {
    const limitNum = parseInt(customLimitInput, 10);
    const warningNum = parseInt(customWarningInput, 10);
    const criticalNum = parseInt(customCriticalInput, 10);

    if (isNaN(limitNum) || limitNum < 10) {
      setQuotaFeedback("Limit must be a valid number of at least 10 messages.");
      return;
    }

    setWhatsAppCustomLimits(limitNum, warningNum, criticalNum);
    setQuotaFeedback(`WhatsApp limit updated to ${limitNum.toLocaleString()} messages successfully.`);
    setTimeout(() => setQuotaFeedback(""), 4000);
  };

  const handleAddCredits = (credits: number) => {
    addWhatsAppQuotaCredits(credits);
    setQuotaFeedback(`+${credits.toLocaleString()} credits added immediately!`);
    setTimeout(() => setQuotaFeedback(""), 4000);
  };

  const handleResetUsage = () => {
    if (confirm("Reset current usage counter back to 0 messages?")) {
      resetWhatsAppUsage();
      setQuotaFeedback("Usage counter reset to 0 messages.");
      setTimeout(() => setQuotaFeedback(""), 4000);
    }
  };

  const handleToggleKillSwitch = () => {
    const isCurrentlyPaused = Boolean(quota.isGloballyPaused);
    const newPaused = !isCurrentlyPaused;
    toggleWhatsAppGlobalPause(newPaused, killSwitchReason || "Master Admin Emergency Maintenance");
    setKillSwitchReason("");
    setQuotaFeedback(
      newPaused
        ? "EMERGENCY KILL SWITCH ACTIVATED — All outbound WhatsApp dispatch paused!"
        : "WhatsApp messaging resumed successfully."
    );
    setTimeout(() => setQuotaFeedback(""), 4000);
  };

  // Create New Agency
  const handleCreateAccount = (e: FormEvent) => {
    e.preventDefault();
    if (!newAccName.trim() || !newAccEmail.trim()) {
      alert("Agency name and email are required.");
      return;
    }
    addNewAccount({
      name: newAccName.trim(),
      ownerName: newAccOwner.trim() || "Agency Admin",
      email: newAccEmail.trim(),
      phone: newAccPhone.trim() || "+91 98000 00000",
      plan: newAccPlan,
      status: "ACTIVE",
      whatsappLimit: newAccLimit,
      notes: "Registered via Master Admin Control Center",
    });
    setNewAccModalOpen(false);
    setNewAccName("");
    setNewAccOwner("");
    setNewAccEmail("");
    setNewAccPhone("");
    setAccounts(getAdminAccounts());
    showToast(`New agency "${newAccName}" registered successfully!`);
  };

  // Retry Diagnostic
  const handleRetryDiagnostic = async (id: string) => {
    setRetryActionMsg({ id, text: "Dispatching self-healing retry..." });
    const res = await retryDiagnosticAction(id);
    setRetryActionMsg({ id, text: res.message });
    setDiagnostics(getDiagnosticErrors());
    setTimeout(() => setRetryActionMsg(null), 4000);
  };

  // If loading session
  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-amber-500 mx-auto mb-3" />
          <p className="text-sm font-semibold tracking-wide text-slate-400">Verifying Master Admin authorization...</p>
        </div>
      </div>
    );
  }

  // If NOT Authenticated as Super Admin
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-slate-100">
        <div className="w-full max-w-md rounded-3xl border border-amber-500/30 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-md">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="relative mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-600 to-amber-400 text-slate-950 shadow-lg shadow-amber-500/20">
              <Shield className="h-9 w-9 stroke-[2.2]" />
              <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-950 text-[11px] font-black text-amber-400 border border-amber-500/40">
                ★
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">
              Master Admin Control Center
            </h1>
            <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-amber-400/90">
              Blue Aura Tours & Travels · Platform Security
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Restricted area for platform owner Garv Kataria. Enter your master credentials to proceed.
            </p>
          </div>

          <form onSubmit={handleMasterLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Master Login ID
              </label>
              <div className="flex h-12 items-center rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-400/20">
                <KeyRound className="h-4 w-4 text-slate-400 mr-2.5 shrink-0" />
                <input
                  type="text"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  placeholder="TRAVELNTOUR"
                  className="w-full bg-transparent text-sm font-semibold tracking-wide text-white outline-none placeholder:text-slate-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Master Password
              </label>
              <div className="flex h-12 items-center rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-400/20">
                <Lock className="h-4 w-4 text-slate-400 mr-2.5 shrink-0" />
                <input
                  type="password"
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-slate-500"
                  required
                />
              </div>
            </div>

            {loginErr ? (
              <div className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-950/50 p-3 text-xs font-semibold text-rose-300">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{loginErr}</span>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loginLoading}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-sm font-extrabold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:from-amber-400 hover:to-amber-500 active:scale-[0.99] disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4" />
              {loginLoading ? "Verifying..." : "Unlock Control Center"}
            </button>
          </form>

          {/* Quick Credential Fill Helper */}
          <div className="mt-6 pt-5 border-t border-slate-800 text-center">
            <button
              type="button"
              onClick={fillMasterCredentials}
              className="inline-flex items-center gap-2 text-xs font-bold text-amber-400 hover:text-amber-300 underline underline-offset-4"
            >
              <span>Auto-Fill Garv Credentials ({MASTER_ADMIN_ID} / {MASTER_ADMIN_PASS})</span>
            </button>
            <div className="mt-4">
              <Link
                href="/dashboard"
                className="text-xs text-slate-500 hover:text-slate-400 flex items-center justify-center gap-1"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Return to Agency CRM
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated Master Admin Control Center View
  return (
    <div className="min-h-screen bg-[#070e1f] text-slate-100 pb-16 selection:bg-amber-500 selection:text-slate-950">
      {/* Toast Notification */}
      {toastMsg ? (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-2xl border border-emerald-500/40 bg-emerald-950/95 px-5 py-3 text-xs font-bold text-emerald-200 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      ) : null}

      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-[#070e1f]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-amber-400 text-slate-950 shadow-md shadow-amber-500/20">
              <Shield className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-black tracking-tight text-white">
                  Blue Aura <span className="text-amber-400">Master Admin</span>
                </span>
                <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-black uppercase text-amber-400">
                  Control Center
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-400">
                Logged in as <b>Garv Kataria</b> (Super Admin) · ID: <b>{MASTER_ADMIN_ID}</b>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700 hover:text-white"
            >
              <span>Agency CRM Dashboard</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" />
            </Link>

            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 px-3 py-1.5 text-xs font-bold text-rose-400 transition hover:bg-rose-500/20 hover:text-rose-300"
            >
              <Power className="h-3.5 w-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Emergency Global Pause Banner if Active */}
      {quota.isGloballyPaused ? (
        <div className="border-b border-rose-600 bg-rose-950 px-4 py-2.5 text-center text-xs font-bold text-rose-200 flex items-center justify-center gap-2">
          <AlertOctagon className="h-4 w-4 text-rose-400 animate-pulse" />
          <span>
            GLOBAL WHATSAPP DISPATCH KILL SWITCH IS ACTIVE: Outbound messaging paused across all agencies!
          </span>
          <button
            onClick={handleToggleKillSwitch}
            className="ml-3 rounded bg-rose-800 hover:bg-rose-700 px-2 py-0.5 text-[11px] font-extrabold text-white"
          >
            Resume Dispatch
          </button>
        </div>
      ) : null}

      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        {/* Executive KPI Ribbon */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* KPI 1: Tenants */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Agencies</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Users className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-black text-white">{accounts.length}</span>
              <span className="text-xs font-bold text-emerald-400">{activeTenantsCount} Active</span>
              {blockedTenantsCount > 0 ? (
                <span className="text-xs font-bold text-rose-400">· {blockedTenantsCount} Blocked</span>
              ) : null}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">B2B & B2C corporate tenant accounts</p>
          </div>

          {/* KPI 2: Branches & Companies */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Branches & Clients</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Building2 className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-black text-white">{branches.length}</span>
              <span className="text-xs font-bold text-amber-400">Branches</span>
              <span className="text-xs text-slate-400">· {companies.length} Companies</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Mapped B2B corporate network</p>
          </div>

          {/* KPI 3: WhatsApp Messages */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">WhatsApp Usage</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <MessageSquare className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-black text-white">{quota.used.toLocaleString()}</span>
              <span className="text-xs font-semibold text-slate-400">/ {quota.limit.toLocaleString()}</span>
              <span
                className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${
                  quotaStatus.isBlocked
                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                    : quotaStatus.isCritical
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                }`}
              >
                {quotaStatus.percent}%
              </span>
            </div>
            <div className="mt-2.5 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  quotaStatus.isBlocked ? "bg-rose-500" : quotaStatus.isCritical ? "bg-amber-500" : "bg-emerald-500"
                }`}
                style={{ width: `${Math.min(100, quotaStatus.percent)}%` }}
              />
            </div>
          </div>

          {/* KPI 4: Error Alerts */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Diagnostic Alerts</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <AlertTriangle className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-black text-white">{unresolvedErrorsCount}</span>
              <span className="text-xs font-bold text-rose-400">{criticalErrorsCount} Critical</span>
              <span className="text-xs text-slate-400">· {diagnostics.length} total logged</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Live API, auth, database & quota issues</p>
          </div>
        </section>

        {/* Navigation Tabs */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <nav className="flex flex-wrap gap-1 sm:gap-2">
            <button
              onClick={() => setActiveTab("accounts")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                activeTab === "accounts"
                  ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Users className="h-4 w-4" />
              <span>Agencies & Accounts</span>
              <span className="rounded-full bg-black/20 px-1.5 py-0.2 text-[10px]">
                {accounts.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("branches")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                activeTab === "branches"
                  ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Building2 className="h-4 w-4" />
              <span>Branches & Corporate Companies</span>
              <span className="rounded-full bg-black/20 px-1.5 py-0.2 text-[10px]">
                {branches.length} Branches · {companies.length} Co.
              </span>
            </button>

            <button
              onClick={() => setActiveTab("whatsapp")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                activeTab === "whatsapp"
                  ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <MessageSquare className="h-4 w-4" />
              <span>WhatsApp Limits Master</span>
              <span className="rounded-full bg-black/20 px-1.5 py-0.2 text-[10px]">
                {quota.limit.toLocaleString()}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("diagnostics")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                activeTab === "diagnostics"
                  ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <AlertTriangle className="h-4 w-4" />
              <span>Live Error Hub</span>
              {unresolvedErrorsCount > 0 ? (
                <span className="rounded-full bg-rose-500 text-white px-1.5 py-0.2 text-[10px] font-black">
                  {unresolvedErrorsCount}
                </span>
              ) : null}
            </button>

            <button
              onClick={() => setActiveTab("system")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                activeTab === "system"
                  ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Server className="h-4 w-4" />
              <span>System & Logs</span>
            </button>
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={refreshData}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition"
              title="Refresh all data"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: ACCOUNTS & ACCESS CONTROL ("ACCOUNT BLOCK KARNA HAI") */}
        {/* ========================================================================= */}
        {activeTab === "accounts" ? (
          <section className="mt-6 space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-amber-400" />
                  Tenant & Agency Management
                </h2>
                <p className="text-xs text-slate-400">
                  Manage agency licenses, block access with custom reasons, edit names & details, and configure WhatsApp quotas.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setNewAccModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-3.5 py-2 text-xs font-extrabold text-slate-950 shadow-md shadow-amber-500/20 hover:from-amber-400 hover:to-amber-500 transition"
                >
                  <Plus className="h-4 w-4" />
                  <span>Register New Agency</span>
                </button>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-3">
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 min-w-[240px] max-w-md">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  placeholder="Search by agency name, owner, or email..."
                  className="w-full bg-transparent text-xs font-medium text-white outline-none placeholder:text-slate-500"
                />
              </div>

              <div className="flex items-center gap-1.5">
                {(["ALL", "ACTIVE", "BLOCKED", "SUSPENDED"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setAccountFilter(mode)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                      accountFilter === mode
                        ? "bg-slate-700 text-white"
                        : "text-slate-400 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* Accounts Table */}
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 bg-slate-900/80 text-slate-400">
                    <tr>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider">Agency / Business</th>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider">Contact & Admin</th>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider">Plan & Branch</th>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider">WhatsApp Quota</th>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider text-right">Master Controls</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredAccounts.map((acc) => {
                      const isBlocked = acc.status === "BLOCKED" || acc.status === "SUSPENDED";
                      return (
                        <tr key={acc.id} className="transition hover:bg-slate-800/30">
                          {/* Agency */}
                          <td className="px-4 py-3.5">
                            <div className="font-extrabold text-white text-sm">{acc.name}</div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              ID: <span className="font-mono text-slate-300">{acc.id}</span>
                            </div>
                            {acc.notes ? (
                              <div className="text-[10px] text-slate-500 italic mt-0.5 line-clamp-1">{acc.notes}</div>
                            ) : null}
                          </td>

                          {/* Contact */}
                          <td className="px-4 py-3.5">
                            <div className="font-semibold text-slate-200">{acc.ownerName}</div>
                            <div className="text-[11px] text-slate-400">{acc.email}</div>
                            <div className="text-[11px] text-slate-400">{acc.phone}</div>
                          </td>

                          {/* Plan & Branch */}
                          <td className="px-4 py-3.5">
                            <span className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 text-[11px] font-bold text-blue-400">
                              {acc.plan}
                            </span>
                            <div className="text-[11px] text-slate-300 font-medium mt-1">
                              {acc.branchName || "Dubai Headquarters"}
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5">{acc.totalBookings} bookings</div>
                          </td>

                          {/* WhatsApp */}
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1.5 font-bold text-slate-200">
                              <MessageSquare className="h-3.5 w-3.5 text-emerald-400" />
                              <span>{acc.whatsappLimit.toLocaleString()} msgs</span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              Used: {acc.whatsappUsed.toLocaleString()} msgs
                            </div>
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3.5">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${
                                acc.status === "ACTIVE"
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                  : "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  acc.status === "ACTIVE" ? "bg-emerald-400" : "bg-rose-400"
                                }`}
                              />
                              {acc.status}
                            </span>
                            {isBlocked && acc.blockReason ? (
                              <div className="mt-1 max-w-[200px] text-[10px] text-rose-300 font-medium truncate" title={acc.blockReason}>
                                {acc.blockReason}
                              </div>
                            ) : null}
                          </td>

                          {/* Access Controls */}
                          <td className="px-4 py-3.5 text-right space-x-2">
                            {/* Edit Agency Details Button */}
                            <button
                              onClick={() => openEditAgencyDialog(acc)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition"
                              title="Edit Agency details, name, plan, branch"
                            >
                              <Pencil className="h-3.5 w-3.5 text-blue-400" />
                              <span>Edit</span>
                            </button>

                            {/* Proper Quota Modal Box Button (REPLACES WINDOW.PROMPT) */}
                            <button
                              onClick={() => openQuotaBoxDialog(acc)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-2.5 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-900/60 hover:text-white transition shadow-sm"
                              title="Open Quota Box to adjust limits and credits"
                            >
                              <Sliders className="h-3.5 w-3.5 text-emerald-400" />
                              <span>Quota</span>
                            </button>

                            {/* Block / Unblock Toggle */}
                            {isBlocked ? (
                              <button
                                onClick={() => handleConfirmAccountStatus("ACTIVE")}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 text-xs font-bold text-emerald-400 hover:bg-emerald-500/20 transition"
                              >
                                <Unlock className="h-3.5 w-3.5" />
                                <span>Unblock</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => openBlockDialog(acc)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 px-3 py-1.5 text-xs font-bold text-rose-400 hover:bg-rose-500/20 transition"
                              >
                                <Ban className="h-3.5 w-3.5" />
                                <span>Block</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null}

        {/* ========================================================================= */}
        {/* TAB 2: BRANCHES & CORPORATE COMPANIES ("KAUNSE BRANCH MEIN KITNE COMPANY") */}
        {/* ========================================================================= */}
        {activeTab === "branches" ? (
          <section className="mt-6 space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-amber-400" />
                  Branches & Corporate Companies Manager
                </h2>
                <p className="text-xs text-slate-400">
                  Assign corporate companies to regional branches, rename companies, customize dropdown options, and configure corporate terms.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setNewBranchModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition"
                >
                  <Plus className="h-4 w-4 text-amber-400" />
                  <span>Add Branch</span>
                </button>

                <button
                  onClick={() => setNewCompModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-3.5 py-2 text-xs font-extrabold text-slate-950 shadow-md shadow-amber-500/20 hover:from-amber-400 hover:to-amber-500 transition"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Corporate Company</span>
                </button>
              </div>
            </div>

            {/* Ribbon: Regional Branches Overview ("KAUNSE BRANCH MEIN KITNE COMPANY") */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Regional Branches Network ({branches.length} Active Hubs)
                </span>
                <span className="text-xs text-amber-400 font-medium">
                  Click any branch to filter associated corporate clients
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {branches.map((b) => {
                  const compCount = branchCompanyCounts[b.id] || 0;
                  const isSelected = selectedBranchFilter === b.id;

                  return (
                    <div
                      key={b.id}
                      onClick={() => setSelectedBranchFilter(isSelected ? "ALL" : b.id)}
                      className={`cursor-pointer rounded-2xl border p-5 transition relative overflow-hidden ${
                        isSelected
                          ? "border-amber-400 bg-amber-950/20 shadow-lg shadow-amber-500/10 ring-2 ring-amber-400/30"
                          : "border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900/90"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Building className="h-5 w-5" />
                          </span>
                          <div>
                            <h3 className="text-sm font-extrabold text-white">{b.name}</h3>
                            <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5">
                              <MapPin className="h-3 w-3 text-slate-500" />
                              <span>{b.city}, {b.country}</span>
                            </div>
                          </div>
                        </div>

                        {/* KAUNSE BRANCH MEIN KITNE COMPANY BADGE */}
                        <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-2.5 py-1 text-xs font-black text-amber-300 shrink-0">
                          {compCount} {compCount === 1 ? "Company" : "Companies"}
                        </span>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                        <span>Lead: <b className="text-slate-200">{b.managerName}</b></span>
                        <span>{b.phone}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Corporate Companies Filter Bar & Search */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-3">
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 min-w-[240px] max-w-md">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={companySearchQuery}
                  onChange={(e) => setCompanySearchQuery(e.target.value)}
                  placeholder="Search corporate company name, code, or contact..."
                  className="w-full bg-transparent text-xs font-medium text-white outline-none placeholder:text-slate-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-400">Branch Filter:</span>
                <button
                  onClick={() => setSelectedBranchFilter("ALL")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                    selectedBranchFilter === "ALL" ? "bg-amber-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:text-white"
                  }`}
                >
                  All Branches ({companies.length})
                </button>
                {branches.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setSelectedBranchFilter(b.id)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                      selectedBranchFilter === b.id ? "bg-amber-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:text-white"
                    }`}
                  >
                    {b.city} ({branchCompanyCounts[b.id] || 0})
                  </button>
                ))}
              </div>
            </div>

            {/* Corporate Companies Table */}
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 bg-slate-900/80 text-slate-400">
                    <tr>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider">Company Name & Code</th>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider">Assigned Branch</th>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider">Industry & Cost Center</th>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider">Contact & Billing</th>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider">Credit Terms</th>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredCompanies.map((c) => (
                      <tr key={c.id} className="transition hover:bg-slate-800/30">
                        {/* Company Name */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-white text-sm">{c.name}</span>
                            <span className="rounded bg-slate-800 border border-slate-700 px-1.5 py-0.2 font-mono text-[10px] text-amber-400 font-bold">
                              {c.code}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{c.address}</div>
                        </td>

                        {/* Branch */}
                        <td className="px-4 py-3.5">
                          <span className="inline-flex items-center gap-1 rounded-lg bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 text-xs font-bold text-blue-300">
                            <Building2 className="h-3.5 w-3.5 text-blue-400" />
                            {c.branchName || "Dubai Flagship Headquarters"}
                          </span>
                        </td>

                        {/* Industry */}
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-slate-200">{c.industry}</div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">{c.defaultCostCenter}</div>
                        </td>

                        {/* Contact */}
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-slate-200">{c.contactPerson}</div>
                          <div className="text-[11px] text-slate-400">{c.email}</div>
                          <div className="text-[11px] text-slate-400">{c.phone}</div>
                        </td>

                        {/* Credit */}
                        <td className="px-4 py-3.5">
                          <div className="font-bold text-slate-200">Limit: {c.creditLimit.toLocaleString()} AED</div>
                          <div className="text-[11px] text-amber-400 mt-0.5">{c.paymentTerms}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">Bookings: {c.totalBookings}</div>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5 text-right space-x-2">
                          {/* 1-Click Rename & Edit Company Button */}
                          <button
                            onClick={() => openEditCompanyDialog(c)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/20 transition"
                            title="Rename company or edit branch and credit terms"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            <span>Rename / Edit</span>
                          </button>

                          {/* Delete Button */}
                          <button
                            onClick={() => handleDeleteCompany(c.id, c.name)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs font-semibold text-slate-400 hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-400 transition"
                            title="Remove company"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null}

        {/* ========================================================================= */}
        {/* TAB 3: WHATSAPP QUOTA MASTER ("WHATSAPP LIMIT MEIN SET KAR SAKTA HU") */}
        {/* ========================================================================= */}
        {activeTab === "whatsapp" ? (
          <section className="mt-6 space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-emerald-400" />
                  WhatsApp Quota & Limits Master Controller
                </h2>
                <p className="text-xs text-slate-400">
                  You have full authority to set custom WhatsApp limits, add instant credits, adjust usage counters, or pause all sending.
                </p>
              </div>

              {quotaFeedback ? (
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/60 px-4 py-2 text-xs font-bold text-emerald-300">
                  {quotaFeedback}
                </div>
              ) : null}
            </div>

            {/* Quota Progress & Status Card */}
            <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-6 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Current Quota State</span>
                  <div className="mt-1 flex items-baseline gap-3">
                    <span className="text-3xl font-black text-white">{quota.used.toLocaleString()}</span>
                    <span className="text-sm font-semibold text-slate-400">/ {quota.limit.toLocaleString()} messages used</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-3.5 py-1 text-xs font-black uppercase tracking-wider ${
                      quotaStatus.isBlocked
                        ? "bg-rose-500 text-white"
                        : quotaStatus.isCritical
                        ? "bg-amber-500 text-slate-950"
                        : quotaStatus.isWarning
                        ? "bg-yellow-500 text-slate-950"
                        : "bg-emerald-500 text-slate-950"
                    }`}
                  >
                    {quotaStatus.status} ({quotaStatus.percent}%)
                  </span>
                </div>
              </div>

              <div className="mt-4 h-3 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    quotaStatus.isBlocked ? "bg-rose-500" : quotaStatus.isCritical ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                  style={{ width: `${Math.min(100, quotaStatus.percent)}%` }}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between text-xs text-slate-400">
                <span>Remaining: <b className="text-white">{quotaStatus.remaining.toLocaleString()}</b></span>
                <span>Warning at: <b className="text-amber-400">{quota.warningThreshold.toLocaleString()} (80%)</b></span>
                <span>Critical at: <b className="text-rose-400">{quota.criticalThreshold.toLocaleString()} (95%)</b></span>
                <span>Hard Stop: <b className="text-rose-500">{quota.limit.toLocaleString()} (100%)</b></span>
              </div>
            </div>

            {/* Quota Management Controls Grid */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Card 1: Set Custom Limits & Thresholds */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-amber-400" />
                  Set Custom Quota Limit
                </h3>
                <p className="text-xs text-slate-400">
                  Update the maximum WhatsApp messages allowed before the 1,000 hard stop kicks in.
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">Max Message Limit</label>
                    <input
                      type="number"
                      value={customLimitInput}
                      onChange={(e) => setCustomLimitInput(e.target.value)}
                      placeholder="e.g. 1000, 2500, 5000"
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-sm font-bold text-white outline-none focus:border-amber-400"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">Warning Threshold</label>
                      <input
                        type="number"
                        value={customWarningInput}
                        onChange={(e) => setCustomWarningInput(e.target.value)}
                        placeholder="e.g. 800"
                        className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-white outline-none focus:border-amber-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">Critical Threshold</label>
                      <input
                        type="number"
                        value={customCriticalInput}
                        onChange={(e) => setCustomCriticalInput(e.target.value)}
                        placeholder="e.g. 950"
                        className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-white outline-none focus:border-amber-400"
                      />
                    </div>
                  </div>

                  {/* Preset quick buttons */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <span className="text-xs text-slate-400 self-center">Presets:</span>
                    {[1000, 2000, 5000, 10000, 25000].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setCustomLimitInput(preset.toString());
                          setCustomWarningInput(Math.round(preset * 0.8).toString());
                          setCustomCriticalInput(Math.round(preset * 0.95).toString());
                        }}
                        className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-bold text-slate-300 hover:border-amber-400 hover:text-white transition"
                      >
                        {preset.toLocaleString()}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={handleSaveCustomLimits}
                    className="w-full rounded-xl bg-amber-500 py-2.5 text-xs font-extrabold text-slate-950 shadow-md shadow-amber-500/20 hover:bg-amber-400 transition"
                  >
                    Apply New Quota Settings
                  </button>
                </div>
              </div>

              {/* Card 2: Instant Credits & Usage Control */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <Zap className="h-4 w-4 text-emerald-400" />
                  Instant Credits & Usage Counter
                </h3>
                <p className="text-xs text-slate-400">
                  Quickly add credits without calculating math or reset current usage counter for testing.
                </p>

                {/* Instant Credits */}
                <div>
                  <span className="block text-xs font-bold text-slate-300 mb-2">Add Instant Quota Extension:</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[250, 500, 1000, 5000].map((credits) => (
                      <button
                        key={credits}
                        onClick={() => handleAddCredits(credits)}
                        className="rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-2.5 text-center transition hover:bg-emerald-900/50"
                      >
                        <div className="text-sm font-black text-emerald-400">+{credits.toLocaleString()}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">Credits</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Simulation and Reset */}
                <div className="pt-2 border-t border-slate-800">
                  <span className="block text-xs font-bold text-slate-300 mb-2">Simulate Usage State (Testing):</span>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: "Normal (250)", val: 250 },
                      { label: "Warning (800)", val: 800 },
                      { label: "Critical (950)", val: 950 },
                      { label: "Locked (1000)", val: 1000 },
                    ].map((sim) => (
                      <button
                        key={sim.label}
                        onClick={() => setSimulationUsage(sim.val)}
                        className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-center text-[10px] font-bold text-slate-300 hover:text-white hover:border-slate-500 transition"
                      >
                        {sim.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <button
                    onClick={handleResetUsage}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-white transition"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Reset Usage to 0</span>
                  </button>

                  <span className="text-[11px] text-slate-400 italic">
                    Monthly quota cycles
                  </span>
                </div>
              </div>
            </div>

            {/* Emergency Global Kill Switch */}
            <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <AlertOctagon className="h-5 w-5 text-rose-400" />
                    <h3 className="text-sm font-black text-rose-300 uppercase tracking-wide">
                      Emergency Global WhatsApp Kill Switch
                    </h3>
                  </div>
                  <p className="mt-1 text-xs text-rose-200/70 max-w-xl">
                    In the event of Meta API outages, spam attack, or billing emergency, activate this kill switch to freeze all outbound WhatsApp messages across all tenant agencies instantly.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleToggleKillSwitch}
                    className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-black uppercase tracking-wider transition ${
                      quota.isGloballyPaused
                        ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                        : "bg-rose-600 text-white hover:bg-rose-500 shadow-lg shadow-rose-600/30"
                    }`}
                  >
                    <Power className="h-4 w-4" />
                    <span>{quota.isGloballyPaused ? "Resume Dispatch" : "Activate Kill Switch"}</span>
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {/* ========================================================================= */}
        {/* TAB 4: LIVE ERROR HUB & DIAGNOSTICS */}
        {/* ========================================================================= */}
        {activeTab === "diagnostics" ? (
          <section className="mt-6 space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-rose-400" />
                  Live Error Hub & System Diagnostics
                </h2>
                <p className="text-xs text-slate-400">
                  Real-time monitor of WhatsApp delivery errors, rate limits, authentication blocks, and database performance issues.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => simulateDiagnosticError("WHATSAPP")}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/20 transition"
                  title="Simulate realistic error event"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Simulate WhatsApp Error</span>
                </button>

                <button
                  onClick={() => {
                    clearResolvedDiagnostics();
                    setDiagnostics(getDiagnosticErrors());
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition"
                >
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Clear Resolved</span>
                </button>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-3">
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 min-w-[240px] max-w-md">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={diagSearch}
                  onChange={(e) => setDiagSearch(e.target.value)}
                  placeholder="Search errors by code, message or agency..."
                  className="w-full bg-transparent text-xs font-medium text-white outline-none placeholder:text-slate-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={diagCategoryFilter}
                  onChange={(e) => setDiagCategoryFilter(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-bold text-slate-300 outline-none"
                >
                  <option value="ALL">All Categories</option>
                  <option value="WHATSAPP">WhatsApp</option>
                  <option value="AUTH">Authentication</option>
                  <option value="DATABASE">Database</option>
                  <option value="BILLING">Billing</option>
                  <option value="NETWORK">Network</option>
                </select>

                <select
                  value={diagSeverityFilter}
                  onChange={(e) => setDiagSeverityFilter(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-bold text-slate-300 outline-none"
                >
                  <option value="ALL">All Severities</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="ERROR">Error</option>
                  <option value="WARNING">Warning</option>
                </select>

                <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950 p-0.5">
                  {(["ALL", "UNRESOLVED", "RESOLVED"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setDiagStatusFilter(s)}
                      className={`rounded px-2 py-0.5 text-[11px] font-bold transition ${
                        diagStatusFilter === s ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Error Diagnostics Cards List */}
            <div className="space-y-3">
              {filteredDiagnostics.length === 0 ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-12 text-center">
                  <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400 mb-3 stroke-[1.5]" />
                  <h3 className="text-base font-bold text-white">All Clear! No Matching Issues Found</h3>
                  <p className="mt-1 text-xs text-slate-400">All services and API dispatches are executing normally.</p>
                </div>
              ) : (
                filteredDiagnostics.map((err) => {
                  const isCrit = err.severity === "CRITICAL";
                  const isErr = err.severity === "ERROR";
                  const isWarn = err.severity === "WARNING";

                  return (
                    <div
                      key={err.id}
                      className={`rounded-2xl border p-4 transition ${
                        err.resolved
                          ? "border-slate-800 bg-slate-900/20 opacity-70"
                          : isCrit
                          ? "border-rose-500/40 bg-rose-950/20 shadow-md shadow-rose-950/30"
                          : isErr
                          ? "border-amber-500/30 bg-slate-900/60"
                          : "border-slate-800 bg-slate-900/40"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <span
                            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                              isCrit
                                ? "bg-rose-500 text-white"
                                : isErr
                                ? "bg-amber-500 text-slate-950"
                                : isWarn
                                ? "bg-yellow-500 text-slate-950"
                                : "bg-blue-500 text-white"
                            }`}
                          >
                            <AlertTriangle className="h-4 w-4" />
                          </span>

                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-black text-white">{err.errorCode}</span>
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-black uppercase ${
                                  isCrit
                                    ? "bg-rose-500/20 text-rose-300"
                                    : isErr
                                    ? "bg-amber-500/20 text-amber-300"
                                    : "bg-yellow-500/20 text-yellow-300"
                                }`}
                              >
                                {err.severity}
                              </span>
                              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">
                                {err.category}
                              </span>
                              {err.accountName ? (
                                <span className="text-[11px] text-slate-400">· {err.accountName}</span>
                              ) : null}
                            </div>

                            <h4 className="mt-1 text-sm font-bold text-slate-100">{err.title}</h4>
                            <p className="mt-0.5 text-xs text-slate-300 leading-relaxed">{err.message}</p>

                            {err.recommendedFix ? (
                              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
                                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                                <span>Recommended Fix: {err.recommendedFix}</span>
                              </div>
                            ) : null}

                            {retryActionMsg?.id === err.id ? (
                              <div className="mt-2 text-xs font-bold text-amber-300 animate-pulse">
                                {retryActionMsg.text}
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex flex-row sm:flex-col items-end gap-2 shrink-0">
                          <span className="text-[10px] text-slate-400">
                            {new Date(err.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>

                          <div className="flex items-center gap-1.5">
                            {err.canRetry && !err.resolved ? (
                              <button
                                onClick={() => handleRetryDiagnostic(err.id)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition"
                              >
                                <RefreshCw className="h-3 w-3" />
                                <span>Retry</span>
                              </button>
                            ) : null}

                            <button
                              onClick={() => {
                                setSelectedError(err);
                                setInspectModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition"
                            >
                              <Eye className="h-3 w-3" />
                              <span>Inspect</span>
                            </button>

                            <button
                              onClick={() => {
                                if (err.resolved) {
                                  unresolveDiagnosticError(err.id);
                                } else {
                                  resolveDiagnosticError(err.id);
                                }
                                setDiagnostics(getDiagnosticErrors());
                              }}
                              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                                err.resolved
                                  ? "bg-slate-800 text-slate-400 hover:text-white"
                                  : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20"
                              }`}
                            >
                              {err.resolved ? "Unresolve" : "Mark Resolved"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        ) : null}

        {/* ========================================================================= */}
        {/* TAB 5: SYSTEM HEALTH & AUDIT TRAIL */}
        {/* ========================================================================= */}
        {activeTab === "system" ? (
          <section className="mt-6 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Server className="h-5 w-5 text-amber-400" />
                System Infrastructure & Security Logs
              </h2>
              <p className="text-xs text-slate-400">
                Live gateway status, database ping, environment telemetry, and Master Admin security audit trail.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase">Vercel Edge</span>
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                </div>
                <div className="mt-2 text-base font-extrabold text-white">Production V2</div>
                <p className="mt-1 text-[11px] text-slate-400">Latency: 28ms · Zero cold-starts</p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase">Meta WhatsApp API</span>
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                </div>
                <div className="mt-2 text-base font-extrabold text-white">v19.0 Cloud API</div>
                <p className="mt-1 text-[11px] text-slate-400">Webhook Status: Healthy (200 OK)</p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase">Cloud Firestore</span>
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                </div>
                <div className="mt-2 text-base font-extrabold text-white">traveltourism-32d7d</div>
                <p className="mt-1 text-[11px] text-slate-400">Security Rules: Enforced & Active</p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase">Master Auth Guard</span>
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                </div>
                <div className="mt-2 text-base font-extrabold text-white">{MASTER_ADMIN_ID}</div>
                <p className="mt-1 text-[11px] text-slate-400">Role: SUPER_ADMIN verified</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 space-y-4">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                <Terminal className="h-4 w-4 text-slate-400" />
                Master Admin Action Audit Log
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 text-slate-400">
                    <tr>
                      <th className="py-2.5 font-bold uppercase">Timestamp</th>
                      <th className="py-2.5 font-bold uppercase">Action</th>
                      <th className="py-2.5 font-bold uppercase">Admin User</th>
                      <th className="py-2.5 font-bold uppercase">Target / Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50 text-slate-300">
                    <tr>
                      <td className="py-2 text-[11px] text-slate-400">Just now</td>
                      <td className="py-2 font-bold text-amber-400">CONTROL_CENTER_LOGIN</td>
                      <td className="py-2 text-slate-300">Garv Kataria (Super Admin)</td>
                      <td className="py-2 text-slate-400">Authenticated with TRAVELNTOUR credentials</td>
                    </tr>
                    {quota.history.map((h, i) => (
                      <tr key={i}>
                        <td className="py-2 text-[11px] text-slate-400">
                          {new Date(h.date).toLocaleDateString()} {new Date(h.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="py-2 font-bold text-emerald-400">QUOTA_LIMIT_UPDATE</td>
                        <td className="py-2 text-slate-300">{h.upgradedBy}</td>
                        <td className="py-2 text-slate-400">
                          Changed from {h.oldLimit.toLocaleString()} → {h.newLimit.toLocaleString()} ({h.notes || "Limit upgraded"})
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null}
      </main>

      {/* ========================================================================= */}
      {/* MODAL 1: PROPER WHATSAPP QUOTA BOX DIALOG (REPLACES BROWSER PROMPT) */}
      {/* ========================================================================= */}
      {quotaModalOpen && targetQuotaAccount ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-3xl border border-emerald-500/40 bg-slate-900 p-6 shadow-2xl text-slate-100 animate-in fade-in zoom-in-95">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <MessageSquare className="h-6 w-6 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">Set WhatsApp Messaging Quota</h3>
                  <p className="text-xs text-slate-400">
                    Agency: <b className="text-white">{targetQuotaAccount.name}</b> · ID: <span className="font-mono text-emerald-400">{targetQuotaAccount.id}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setQuotaModalOpen(false)}
                className="text-slate-400 hover:text-white rounded-lg p-1.5 hover:bg-slate-800 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Current State Info Box */}
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950 p-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Current Assigned Limit:</span>
                <span className="font-mono font-black text-white text-sm">{targetQuotaAccount.whatsappLimit.toLocaleString()} msgs</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-xs">
                <span className="text-slate-400">Messages Used:</span>
                <span className="font-bold text-amber-400">{targetQuotaAccount.whatsappUsed.toLocaleString()} msgs</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-xs">
                <span className="text-slate-400">Remaining Before Hard Stop:</span>
                <span className="font-bold text-emerald-400">
                  {Math.max(0, targetQuotaAccount.whatsappLimit - targetQuotaAccount.whatsappUsed).toLocaleString()} msgs
                </span>
              </div>
            </div>

            {/* Inputs: PROPER TEXT BOX FOR WHATSAPP QUOTA */}
            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-200 mb-1.5">
                  New WhatsApp Quota Limit (Total Allowed Messages)
                </label>
                <div className="flex items-center rounded-xl border border-emerald-500/50 bg-slate-800/90 px-4 py-2.5 focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-400/20">
                  <MessageCircle className="h-5 w-5 text-emerald-400 mr-2.5 shrink-0" />
                  <input
                    type="number"
                    value={quotaModalLimitInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setQuotaModalLimitInput(val);
                      const num = parseInt(val, 10);
                      if (!isNaN(num) && num > 0) {
                        setQuotaModalWarningInput(Math.round(num * 0.8).toString());
                        setQuotaModalCriticalInput(Math.round(num * 0.95).toString());
                      }
                    }}
                    placeholder="e.g. 1000, 2500, 5000"
                    className="w-full bg-transparent text-base font-extrabold text-white outline-none"
                    autoFocus
                  />
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">msgs</span>
                </div>
              </div>

              {/* Quick Limit Preset Chips */}
              <div>
                <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">
                  Quick Limit Presets:
                </span>
                <div className="flex flex-wrap gap-2">
                  {[1000, 2500, 5000, 10000, 25000, 50000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setQuotaModalLimitInput(preset.toString());
                        setQuotaModalWarningInput(Math.round(preset * 0.8).toString());
                        setQuotaModalCriticalInput(Math.round(preset * 0.95).toString());
                      }}
                      className={`rounded-lg border px-3 py-1 text-xs font-bold transition ${
                        quotaModalLimitInput === preset.toString()
                          ? "border-emerald-400 bg-emerald-500/20 text-emerald-300"
                          : "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600 hover:text-white"
                      }`}
                    >
                      {preset.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Instant Credit Additions */}
              <div>
                <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">
                  Instant Top-Up Credits:
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {[250, 500, 1000, 2500].map((credits) => (
                    <button
                      key={credits}
                      type="button"
                      onClick={() => {
                        const currentVal = parseInt(quotaModalLimitInput, 10) || targetQuotaAccount.whatsappLimit;
                        const nextVal = currentVal + credits;
                        setQuotaModalLimitInput(nextVal.toString());
                        setQuotaModalWarningInput(Math.round(nextVal * 0.8).toString());
                        setQuotaModalCriticalInput(Math.round(nextVal * 0.95).toString());
                      }}
                      className="rounded-xl border border-emerald-500/30 bg-emerald-950/40 py-2 text-center text-xs font-black text-emerald-400 hover:bg-emerald-900/60 transition"
                    >
                      +{credits.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Warning & Critical Thresholds */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">Warning Alert (80%)</label>
                  <input
                    type="number"
                    value={quotaModalWarningInput}
                    onChange={(e) => setQuotaModalWarningInput(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-white outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">Critical Stop (95%)</label>
                  <input
                    type="number"
                    value={quotaModalCriticalInput}
                    onChange={(e) => setQuotaModalCriticalInput(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-white outline-none focus:border-rose-400"
                  />
                </div>
              </div>

              {/* Reset Usage Checkbox */}
              <div className="pt-2">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={quotaModalResetUsage}
                    onChange={(e) => setQuotaModalResetUsage(e.target.checked)}
                    className="h-4 w-4 rounded accent-emerald-500 cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-slate-300">
                    Reset current usage counter back to 0 messages for this cycle
                  </span>
                </label>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="mt-6 flex justify-end gap-2.5 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setQuotaModalOpen(false)}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAccountQuotaBox}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-5 py-2.5 text-xs font-black text-slate-950 shadow-lg shadow-emerald-500/20 hover:from-emerald-400 hover:to-emerald-500 transition"
              >
                <Check className="h-4 w-4 stroke-[3]" />
                <span>Save & Apply Quota</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ========================================================================= */}
      {/* MODAL 2: EDIT AGENCY DETAILS (SAB PROPER EDITABLE) */}
      {/* ========================================================================= */}
      {editAccModalOpen && editingAccount ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl text-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <Pencil className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Edit Agency Profile</h3>
                  <p className="text-xs text-slate-400">ID: {editingAccount.id}</p>
                </div>
              </div>
              <button onClick={() => setEditAccModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAgency} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">Agency Name</label>
                <input
                  type="text"
                  required
                  value={editAccName}
                  onChange={(e) => setEditAccName(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Primary Owner / Admin</label>
                  <input
                    type="text"
                    required
                    value={editAccOwner}
                    onChange={(e) => setEditAccOwner(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Contact Phone</label>
                  <input
                    type="text"
                    value={editAccPhone}
                    onChange={(e) => setEditAccPhone(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Admin Email Address</label>
                <input
                  type="email"
                  required
                  value={editAccEmail}
                  onChange={(e) => setEditAccEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Plan</label>
                  <select
                    value={editAccPlan}
                    onChange={(e) => setEditAccPlan(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400 font-bold"
                  >
                    <option value="STARTER">STARTER</option>
                    <option value="PROFESSIONAL">PROFESSIONAL</option>
                    <option value="ENTERPRISE">ENTERPRISE</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">Currency</label>
                  <select
                    value={editAccCurrency}
                    onChange={(e) => setEditAccCurrency(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400 font-bold"
                  >
                    <option value="AED">AED (د.إ)</option>
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">Account Status</label>
                  <select
                    value={editAccStatus}
                    onChange={(e) => setEditAccStatus(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400 font-bold"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="BLOCKED">BLOCKED</option>
                    <option value="SUSPENDED">SUSPENDED</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Assigned Regional Branch</label>
                <select
                  value={editAccBranch}
                  onChange={(e) => setEditAccBranch(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.name} ({b.city})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Internal Notes</label>
                <textarea
                  value={editAccNotes}
                  onChange={(e) => setEditAccNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2.5 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditAccModalOpen(false)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-extrabold text-slate-950 hover:bg-amber-400 shadow-md shadow-amber-500/20"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ========================================================================= */}
      {/* MODAL 3: EDIT CORPORATE COMPANY (RENAME & MOVE BRANCH) */}
      {/* ========================================================================= */}
      {editCompModalOpen && editingCompany ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="w-full max-w-xl rounded-3xl border border-amber-500/40 bg-slate-900 p-6 shadow-2xl text-slate-100 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Building2 className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Customize Corporate Client</h3>
                  <p className="text-xs text-slate-400">
                    Changes here immediately reflect in Add Booking dropdowns across the CRM.
                  </p>
                </div>
              </div>
              <button onClick={() => setEditCompModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCompany} className="mt-4 space-y-4 text-xs">
              {/* COMPANY NAME CHANGE */}
              <div>
                <label className="block font-bold text-slate-200 mb-1">
                  Company Name <span className="text-amber-400">(Dropdown Display Name)</span>
                </label>
                <input
                  type="text"
                  required
                  value={editCompName}
                  onChange={(e) => setEditCompName(e.target.value)}
                  className="w-full rounded-xl border border-amber-500/50 bg-slate-800 p-2.5 text-sm text-white outline-none focus:border-amber-400 font-extrabold"
                  placeholder="e.g. Apex Global Logistics LLC"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Company Code</label>
                  <input
                    type="text"
                    required
                    value={editCompCode}
                    onChange={(e) => setEditCompCode(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400 font-mono font-bold"
                  />
                </div>

                {/* MOVE BRANCH */}
                <div>
                  <label className="block font-bold text-slate-300 mb-1">
                    Assigned Regional Branch <span className="text-amber-400">★</span>
                  </label>
                  <select
                    value={editCompBranchId}
                    onChange={(e) => setEditCompBranchId(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400 font-bold"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.city})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Industry Sector</label>
                  <input
                    type="text"
                    value={editCompIndustry}
                    onChange={(e) => setEditCompIndustry(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Default Cost Center</label>
                  <input
                    type="text"
                    value={editCompCostCenter}
                    onChange={(e) => setEditCompCostCenter(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Corporate Contact Person</label>
                  <input
                    type="text"
                    value={editCompContact}
                    onChange={(e) => setEditCompContact(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Contact Phone</label>
                  <input
                    type="text"
                    value={editCompPhone}
                    onChange={(e) => setEditCompPhone(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Billing Email Address</label>
                <input
                  type="email"
                  value={editCompEmail}
                  onChange={(e) => setEditCompEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Office Address</label>
                <input
                  type="text"
                  value={editCompAddress}
                  onChange={(e) => setEditCompAddress(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Credit Limit</label>
                  <input
                    type="number"
                    value={editCompCreditLimit}
                    onChange={(e) => setEditCompCreditLimit(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Payment Terms</label>
                  <select
                    value={editCompPaymentTerms}
                    onChange={(e) => setEditCompPaymentTerms(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400 font-semibold"
                  >
                    <option value="Net 15 Days">Net 15 Days</option>
                    <option value="Net 30 Days">Net 30 Days</option>
                    <option value="Net 45 Days">Net 45 Days</option>
                    <option value="Prepaid / Immediate">Prepaid</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Status</label>
                  <select
                    value={editCompStatus}
                    onChange={(e) => setEditCompStatus(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400 font-bold"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2.5 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditCompModalOpen(false)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-extrabold text-slate-950 hover:bg-amber-400 shadow-md shadow-amber-500/20"
                >
                  Save & Update Dropdowns
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ========================================================================= */}
      {/* MODAL 4: ADD CORPORATE COMPANY */}
      {/* ========================================================================= */}
      {newCompModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl text-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">Add New Corporate Company</h3>
              </div>
              <button onClick={() => setNewCompModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCompany} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">Company Name</label>
                <input
                  type="text"
                  required
                  value={newCompName}
                  onChange={(e) => setNewCompName(e.target.value)}
                  placeholder="e.g. Al Futtaim Group Travel Desk"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Company Code</label>
                  <input
                    type="text"
                    value={newCompCode}
                    onChange={(e) => setNewCompCode(e.target.value)}
                    placeholder="AFG-DXB"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Assign to Branch</label>
                  <select
                    value={newCompBranchId}
                    onChange={(e) => setNewCompBranchId(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400 font-bold"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.city})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={newCompContact}
                    onChange={(e) => setNewCompContact(e.target.value)}
                    placeholder="e.g. Tariq Mansoor"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Contact Phone</label>
                  <input
                    type="text"
                    value={newCompPhone}
                    onChange={(e) => setNewCompPhone(e.target.value)}
                    placeholder="+971 4 000 0000"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Billing Email</label>
                <input
                  type="email"
                  value={newCompEmail}
                  onChange={(e) => setNewCompEmail(e.target.value)}
                  placeholder="billing@company.com"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Credit Limit (AED / INR)</label>
                <input
                  type="number"
                  value={newCompCreditLimit}
                  onChange={(e) => setNewCompCreditLimit(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400 font-bold"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2.5 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setNewCompModalOpen(false)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-extrabold text-slate-950 hover:bg-amber-400"
                >
                  Create Company
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ========================================================================= */}
      {/* MODAL 5: ADD REGIONAL BRANCH */}
      {/* ========================================================================= */}
      {newBranchModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl text-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Building className="h-5 w-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">Add New Regional Branch</h3>
              </div>
              <button onClick={() => setNewBranchModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBranch} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">Branch Hub Name</label>
                <input
                  type="text"
                  required
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder="e.g. Bangalore South Hub"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">City</label>
                  <input
                    type="text"
                    required
                    value={newBranchCity}
                    onChange={(e) => setNewBranchCity(e.target.value)}
                    placeholder="e.g. Bengaluru"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Country</label>
                  <input
                    type="text"
                    value={newBranchCountry}
                    onChange={(e) => setNewBranchCountry(e.target.value)}
                    placeholder="e.g. India"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Branch Manager</label>
                  <input
                    type="text"
                    value={newBranchManager}
                    onChange={(e) => setNewBranchManager(e.target.value)}
                    placeholder="e.g. Rajesh Nair"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Branch Phone</label>
                  <input
                    type="text"
                    value={newBranchPhone}
                    onChange={(e) => setNewBranchPhone(e.target.value)}
                    placeholder="+91 80 0000 0000"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Branch Address</label>
                <input
                  type="text"
                  value={newBranchAddress}
                  onChange={(e) => setNewBranchAddress(e.target.value)}
                  placeholder="e.g. UB City, Vittal Mallya Rd, Bengaluru"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2.5 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setNewBranchModalOpen(false)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-extrabold text-slate-950 hover:bg-amber-400"
                >
                  Add Branch Hub
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ========================================================================= */}
      {/* MODAL 6: BLOCK / UNBLOCK DIALOG */}
      {/* ========================================================================= */}
      {blockModalOpen && targetAccount ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-3xl border border-rose-500/30 bg-slate-900 p-6 shadow-2xl text-slate-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                <Ban className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Block Agency Account</h3>
                <p className="text-xs text-slate-400">Suspend portal access for {targetAccount.name}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              When blocked, users from <b>{targetAccount.name}</b> will be locked out immediately upon login or next action, and shown your suspension notice.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Reason for Suspension (Visible to Tenant)
              </label>
              <textarea
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder="e.g. Overdue payment for Invoice #INV-2026-099 or violation of WhatsApp usage policies."
                rows={3}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-xs text-white outline-none focus:border-rose-400"
              />
            </div>

            <div className="mt-6 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setBlockModalOpen(false)}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConfirmAccountStatus("BLOCKED")}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-500 transition shadow-md shadow-rose-600/30"
              >
                Confirm Block
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ========================================================================= */}
      {/* MODAL 7: REGISTER NEW AGENCY */}
      {/* ========================================================================= */}
      {newAccModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">Register New Agency Partner</h3>
              </div>
              <button onClick={() => setNewAccModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">Agency Name</label>
                <input
                  type="text"
                  required
                  value={newAccName}
                  onChange={(e) => setNewAccName(e.target.value)}
                  placeholder="e.g. Royal Mirage Travel & Tourism"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Owner / Primary Admin</label>
                  <input
                    type="text"
                    value={newAccOwner}
                    onChange={(e) => setNewAccOwner(e.target.value)}
                    placeholder="e.g. Rajesh Kumar"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Contact Phone</label>
                  <input
                    type="text"
                    value={newAccPhone}
                    onChange={(e) => setNewAccPhone(e.target.value)}
                    placeholder="+971 50 000 0000"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Agency Email Address</label>
                <input
                  type="email"
                  required
                  value={newAccEmail}
                  onChange={(e) => setNewAccEmail(e.target.value)}
                  placeholder="admin@royalmiragetravel.com"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">License Plan</label>
                  <select
                    value={newAccPlan}
                    onChange={(e) => setNewAccPlan(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400 font-bold"
                  >
                    <option value="STARTER">STARTER</option>
                    <option value="PROFESSIONAL">PROFESSIONAL</option>
                    <option value="ENTERPRISE">ENTERPRISE</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Initial WhatsApp Limit</label>
                  <input
                    type="number"
                    value={newAccLimit}
                    onChange={(e) => setNewAccLimit(parseInt(e.target.value, 10) || 1000)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white outline-none focus:border-amber-400 font-bold"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNewAccModalOpen(false)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-extrabold text-slate-950 hover:bg-amber-400 shadow-md shadow-amber-500/20"
                >
                  Register Agency
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ========================================================================= */}
      {/* MODAL 8: ERROR INSPECTION & STACK TRACE */}
      {/* ========================================================================= */}
      {inspectModalOpen && selectedError ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl text-slate-100 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FileCode className="h-5 w-5 text-amber-400" />
                <div>
                  <h3 className="text-base font-bold text-white">{selectedError.title}</h3>
                  <p className="text-xs font-mono text-amber-400">{selectedError.errorCode}</p>
                </div>
              </div>
              <button onClick={() => setInspectModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <div>
                  <span className="text-slate-500 block uppercase font-bold text-[10px]">Subsystem</span>
                  <span className="font-semibold text-slate-200">{selectedError.subsystem}</span>
                </div>
                <div>
                  <span className="text-slate-500 block uppercase font-bold text-[10px]">Affected Agency</span>
                  <span className="font-semibold text-slate-200">{selectedError.accountName || "System-wide"}</span>
                </div>
                <div>
                  <span className="text-slate-500 block uppercase font-bold text-[10px]">Severity</span>
                  <span className="font-bold text-rose-400">{selectedError.severity}</span>
                </div>
                <div>
                  <span className="text-slate-500 block uppercase font-bold text-[10px]">Timestamp</span>
                  <span className="font-mono text-slate-300">{new Date(selectedError.timestamp).toLocaleString()}</span>
                </div>
              </div>

              <div>
                <span className="text-slate-400 block font-bold mb-1">Message</span>
                <p className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-slate-200">
                  {selectedError.message}
                </p>
              </div>

              {selectedError.details ? (
                <div>
                  <span className="text-slate-400 block font-bold mb-1">Payload / Details JSON</span>
                  <pre className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 font-mono text-[11px] text-amber-300 overflow-x-auto">
                    {selectedError.details}
                  </pre>
                </div>
              ) : null}

              {selectedError.stackTrace ? (
                <div>
                  <span className="text-slate-400 block font-bold mb-1">Stack Trace</span>
                  <pre className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 font-mono text-[11px] text-slate-400 overflow-x-auto">
                    {selectedError.stackTrace}
                  </pre>
                </div>
              ) : null}

              {selectedError.recommendedFix ? (
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300">
                  <span className="block font-bold text-xs uppercase text-emerald-400 mb-0.5">Admin Resolution Guide</span>
                  <span>{selectedError.recommendedFix}</span>
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setInspectModalOpen(false)}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
