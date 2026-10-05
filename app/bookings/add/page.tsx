"use client";

import { AppShell } from "@/components/dashboard/app-shell";
import {
  ArrowRight,
  Barcode,
  Building,
  Building2,
  CalendarCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Copy,
  CreditCard,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Flag,
  Heart,
  HelpCircle,
  History,
  Lightbulb,
  Luggage,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plane,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  Users,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useCurrency } from "@/lib/currency";
import { PhoneInput } from "@/components/ui/phone-input";
import { formatPhoneDisplay, parsePhoneNumber, validatePhoneNumber } from "@/lib/phone-utils";
import { recordBookingByCurrentStaff } from "@/lib/staff-management";
import {
  AIRLINES,
  Company,
  Customer,
  Employee,
  FlightSegment,
  HotelStay,
  INITIAL_COMPANIES,
  INITIAL_CUSTOMERS,
  INITIAL_EMPLOYEES,
  SUPPLIERS,
  ServiceCategory,
  generateBookingReference,
  getStoredCompanies,
  getStoredCustomers,
  getStoredEmployees,
  saveCompany,
  saveCrmBooking,
  saveCustomer,
  saveEmployee,
} from "@/lib/travel-crm";

const SERVICE_OPTIONS: Array<{ id: ServiceCategory; label: string; icon: typeof Plane; desc: string }> = [
  { id: "FLIGHT", label: "Flight", icon: Plane, desc: "One Way, Round Trip, Multi-City" },
  { id: "HOTEL", label: "Hotel", icon: Building, desc: "Global hotels & luxury resorts" },
  { id: "VISA", label: "Visa Application", icon: FileCheck2, desc: "Tourist, Business & Residence visas" },
  { id: "FLIGHT_HOTEL", label: "Flight + Hotel", icon: Luggage, desc: "Bundled flight & hotel stays" },
  { id: "FLIGHT_VISA", label: "Flight + Visa", icon: Plane, desc: "Airline ticketing & visa processing" },
  { id: "HOTEL_VISA", label: "Hotel + Visa", icon: Building, desc: "Accommodation & visa documentation" },
  { id: "FLIGHT_HOTEL_VISA", label: "Flight + Hotel + Visa", icon: Sparkles, desc: "Complete end-to-end travel bundle" },
  { id: "HOLIDAY_PACKAGE", label: "Holiday / Tour Package", icon: Luggage, desc: "Curated holiday itineraries" },
  { id: "HONEYMOON_PACKAGE", label: "Honeymoon Package", icon: Heart, desc: "Luxury romantic suites & candlelight setups" },
  { id: "GROUP_TOUR", label: "Group Tour", icon: Users, desc: "Corporate, family & group manifests" },
  { id: "AIRPORT_TRANSFER", label: "Airport Transfer / Transport", icon: Building2, desc: "Sedan, SUV & luxury chauffeurs" },
  { id: "TRAVEL_INSURANCE", label: "Travel Insurance", icon: ShieldCheck, desc: "Comprehensive worldwide cover" },
  { id: "MICE", label: "MICE / Corporate Group", icon: Building2, desc: "Meetings, incentives & conferences" },
  { id: "OTHER", label: "Other Travel Service", icon: HelpCircle, desc: "Custom bespoke concierge services" },
];

const VISA_TYPES = [
  "Tourist Visa",
  "Visit Visa (30 / 60 Days)",
  "Business / Commercial Visa",
  "Transit Visa",
  "Employment / Work Visa",
  "Residence / Golden Visa",
  "Family Visa",
  "Other",
];

const VISA_STATUS_OPTIONS = [
  "Documents Pending",
  "Documents Received",
  "Application Prepared",
  "Submitted",
  "Under Processing",
  "Additional Documents Required",
  "Approved",
  "Rejected",
  "Cancelled",
  "Expired",
];

const DEFAULT_DOC_CHECKLIST = [
  "Passport (Valid 6+ Months)",
  "Passport Photo (White Background)",
  "Emirates ID / Resident Visa",
  "Previous Visa Copies",
  "Flight Reservation",
  "Hotel Confirmation",
  "Bank Statement (Last 6 Months)",
  "Employment / NOC Letter",
  "Invitation Letter",
  "Travel Insurance",
  "Other Relevant Documents",
];

const HONEYMOON_EXTRAS = [
  "Honeymoon Bed Decoration",
  "Complimentary Room Upgrade (Subject to availability)",
  "Romantic Candlelight Dinner by the Beach",
  "Private Luxury Airport Transfer",
  "Couple Sunset Cruise / Excursion",
  "Complimentary Wine & Cake Setup",
  "Couple Spa Treatment",
];

export default function AddBookingPage() {
  const router = useRouter();
  const { base, display, options: currencyOptions, money: formatMoney } = useCurrency();

  // Booking Reference
  const [bookingRef, setBookingRef] = useState("");
  useEffect(() => {
    setBookingRef(generateBookingReference());
  }, []);

  // Step 1: Booking For (Corporate vs Individual)
  const [bookingFor, setBookingFor] = useState<"CORPORATE" | "INDIVIDUAL">("CORPORATE");

  // Corporate Roster
  const [companies, setCompanies] = useState<Company[]>(() => getStoredCompanies());
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("comp-1");
  const [companySearch, setCompanySearch] = useState("");
  const [companyOpen, setCompanyOpen] = useState(false);

  useEffect(() => {
    const handleCompaniesSync = () => {
      const stored = getStoredCompanies();
      setCompanies(stored);
    };
    handleCompaniesSync();
    window.addEventListener("fc:companies-updated", handleCompaniesSync);
    return () => window.removeEventListener("fc:companies-updated", handleCompaniesSync);
  }, []);

  // Employees Roster
  const [employees, setEmployees] = useState<Employee[]>(INITIAL_EMPLOYEES);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("emp-101");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeeOpen, setEmployeeOpen] = useState(false);

  // Individual Customers
  const [customers, setCustomers] = useState<Customer[]>(INITIAL_CUSTOMERS);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("cust-1");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerOpen, setCustomerOpen] = useState(false);

  // Individual Passenger Fields
  const [paxName, setPaxName] = useState("Rahul Sharma");
  const [paxPhone, setPaxPhone] = useState("+971 50 123 4567");
  const [paxEmail, setPaxEmail] = useState("rahul.sharma@gmail.com");
  const [paxNationality, setPaxNationality] = useState("India");
  const [paxPassport, setPaxPassport] = useState("M9283710");
  const [paxPassportExpiry, setPaxPassportExpiry] = useState("2029-06-25");
  const [paxDob, setPaxDob] = useState("1991-04-12");
  const [paxGender, setPaxGender] = useState("Male");
  const [paxCount, setPaxCount] = useState("2");

  // Service Category Selector
  const [service, setService] = useState<ServiceCategory>("FLIGHT");

  // Flight Fields
  const [tripType, setTripType] = useState<"ONE_WAY" | "ROUND_TRIP" | "MULTI_CITY">("ONE_WAY");
  const [flightFrom, setFlightFrom] = useState("");
  const [flightTo, setFlightTo] = useState("");
  const [flightDepDate, setFlightDepDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [flightDepTime, setFlightDepTime] = useState("");
  const [flightRetDate, setFlightRetDate] = useState("");
  const [flightRetTime, setFlightRetTime] = useState("");
  const [flightAirline, setFlightAirline] = useState("");
  const [flightNumber, setFlightNumber] = useState("");
  const [flightPnr, setFlightPnr] = useState("");
  const [flightTicketNo, setFlightTicketNo] = useState("");
  const [flightCabin, setFlightCabin] = useState("Economy");
  const [flightAdults, setFlightAdults] = useState("1");
  const [flightChildren, setFlightChildren] = useState("0");
  const [flightInfants, setFlightInfants] = useState("0");
  const [flightTerminal, setFlightTerminal] = useState("");
  const [flightSegments, setFlightSegments] = useState<FlightSegment[]>([]);

  // Hotel Fields
  const [hotels, setHotels] = useState<HotelStay[]>([]);

  // Visa Fields
  const [visaType, setVisaType] = useState("Tourist Visa");
  const [visaCountry, setVisaCountry] = useState("");
  const [visaNationality, setVisaNationality] = useState("");
  const [visaPassportNo, setVisaPassportNo] = useState("");
  const [visaPassportExpiry, setVisaPassportExpiry] = useState("");
  const [visaAppDate, setVisaAppDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [visaTravelDate, setVisaTravelDate] = useState("");
  const [visaExpectedDate, setVisaExpectedDate] = useState("");
  const [visaValidity, setVisaValidity] = useState("");
  const [visaEntryType, setVisaEntryType] = useState("Single Entry");
  const [visaRefNo, setVisaRefNo] = useState("");
  const [visaStatus, setVisaStatus] = useState("Under Processing");
  const [visaCheckedDocs, setVisaCheckedDocs] = useState<string[]>([]);

  // Holiday Package Fields
  const [pkgName, setPkgName] = useState("");
  const [pkgDestination, setPkgDestination] = useState("");
  const [pkgStartDate, setPkgStartDate] = useState("");
  const [pkgEndDate, setPkgEndDate] = useState("");
  const [pkgType, setPkgType] = useState("Standard");
  const [pkgIncludes, setPkgIncludes] = useState<string[]>([]);
  const [pkgItinerary, setPkgItinerary] = useState("");

  // Honeymoon Package Fields
  const [hmDestination, setHmDestination] = useState("");
  const [hmStartDate, setHmStartDate] = useState("");
  const [hmEndDate, setHmEndDate] = useState("");
  const [hmDuration, setHmDuration] = useState("");
  const [hmHotel, setHmHotel] = useState("");
  const [hmRoomType, setHmRoomType] = useState("");
  const [hmMealPlan, setHmMealPlan] = useState("");
  const [hmTransfers, setHmTransfers] = useState("");
  const [hmSelectedExtras, setHmSelectedExtras] = useState<string[]>([]);

  // Group Tour Fields
  const [grpName, setGrpName] = useState("");
  const [grpDestination, setGrpDestination] = useState("");
  const [grpStartDate, setGrpStartDate] = useState("");
  const [grpEndDate, setGrpEndDate] = useState("");
  const [grpTotalPax, setGrpTotalPax] = useState("");
  const [grpType, setGrpType] = useState("Corporate");
  const [grpLeader, setGrpLeader] = useState("");
  const [grpLeaderPhone, setGrpLeaderPhone] = useState("");
  const [grpRoomingNotes, setGrpRoomingNotes] = useState("");

  // MICE Fields
  const [miceEvent, setMiceEvent] = useState("");
  const [micePurpose, setMicePurpose] = useState("Corporate Event");
  const [micePax, setMicePax] = useState("");
  const [miceDates, setMiceDates] = useState("");
  const [miceDestination, setMiceDestination] = useState("");
  const [miceApprovalNo, setMiceApprovalNo] = useState("");
  const [miceRequirements, setMiceRequirements] = useState("");

  // Transfer Fields
  const [trPickup, setTrPickup] = useState("");
  const [trDrop, setTrDrop] = useState("");
  const [trDate, setTrDate] = useState("");
  const [trTime, setTrTime] = useState("");
  const [trVehicle, setTrVehicle] = useState("");
  const [trPax, setTrPax] = useState("1");

  // Insurance Fields
  const [insProvider, setInsProvider] = useState("");
  const [insPolicyNo, setInsPolicyNo] = useState("");
  const [insCoverageStart, setInsCoverageStart] = useState("");
  const [insCoverageEnd, setInsCoverageEnd] = useState("");
  const [insAmount, setInsAmount] = useState("");

  // Custom / Other Service Fields
  const [customServiceName, setCustomServiceName] = useState("");
  const [customSupplier, setCustomSupplier] = useState("");
  const [customDate, setCustomDate] = useState("");
  const [customRef, setCustomRef] = useState("");
  const [customNotes, setCustomNotes] = useState("");

  // Financials & Billing
  const [bookingCurrency, setBookingCurrency] = useState(base || "AED");
  useEffect(() => {
    if (base && !bookingCurrency) setBookingCurrency(base);
  }, [base, bookingCurrency]);
  const [sellingPrice, setSellingPrice] = useState("");
  const [supplierCost, setSupplierCost] = useState("");
  const [serviceFee, setServiceFee] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [taxRate, setTaxRate] = useState("5");
  const [amountPaid, setAmountPaid] = useState("0");
  const [paymentStatus, setPaymentStatus] = useState("PENDING");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [paymentRef, setPaymentRef] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [costCenter, setCostCenter] = useState("");
  const [bookingStatus, setBookingStatus] = useState("CONFIRMED");

  // Supplier Details
  const [supplierName, setSupplierName] = useState("");
  const [supplierReference, setSupplierReference] = useState("");
  const [supplierPaymentStatus, setSupplierPaymentStatus] = useState("Pending");
  const [supplierConfirmation, setSupplierConfirmation] = useState("");

  // Notes
  const [customerNotes, setCustomerNotes] = useState("");
  const [staffNotes, setStaffNotes] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");

  // Automation & Toggles
  const [skipAutomation, setSkipAutomation] = useState(false);
  const [generateInvoice, setGenerateInvoice] = useState(true);
  const [copiedRef, setCopiedRef] = useState(false);

  // Modals
  const [showAddCompanyModal, setShowAddCompanyModal] = useState(false);
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [showCompanyProfileModal, setShowCompanyProfileModal] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [modalAction, setModalAction] = useState<"SAVE" | "INVOICE" | "VOUCHER" | "DRAFT">("SAVE");

  // Submission States
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [created, setCreated] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  // Load Initial Data from Storage
  useEffect(() => {
    setCompanies(getStoredCompanies());
    setEmployees(getStoredEmployees());
    setCustomers(getStoredCustomers());
  }, []);

  // Sync selected company
  const activeCompany = useMemo(() => {
    return companies.find((c) => c.id === selectedCompanyId) || companies[0];
  }, [companies, selectedCompanyId]);

  // Filter employees for selected company
  const companyEmployees = useMemo(() => {
    return employees.filter((e) => e.companyId === selectedCompanyId);
  }, [employees, selectedCompanyId]);

  // Sync selected employee
  const activeEmployee = useMemo(() => {
    const found = companyEmployees.find((e) => e.id === selectedEmployeeId);
    return found || companyEmployees[0] || null;
  }, [companyEmployees, selectedEmployeeId]);

  // Auto-fill employee details into visa/flight if corporate
  useEffect(() => {
    if (bookingFor === "CORPORATE" && activeEmployee) {
      setVisaNationality(activeEmployee.nationality || "");
      setVisaPassportNo(activeEmployee.passportNumber || "");
      setVisaPassportExpiry(activeEmployee.passportExpiry || "");
    }
  }, [bookingFor, activeEmployee]);

  // Auto-fill cost center from company default
  useEffect(() => {
    if (activeCompany) {
      setCostCenter(activeCompany.defaultCostCenter || "");
    }
  }, [activeCompany]);

  // Sync customer details when selecting individual customer
  const activeCustomer = useMemo(() => {
    return customers.find((c) => c.id === selectedCustomerId) || customers[0];
  }, [customers, selectedCustomerId]);

  const handleSelectCustomer = (c: Customer) => {
    setSelectedCustomerId(c.id);
    setPaxName(c.name);
    setPaxPhone(c.phone);
    setPaxEmail(c.email);
    setPaxNationality(c.nationality);
    setPaxPassport(c.passportNumber);
    setPaxPassportExpiry(c.passportExpiry);
    setPaxDob(c.dob);
    setPaxGender(c.gender);
    setPaxCount(String(c.numberOfTravellers || 1));
    setCustomerOpen(false);
  };

  // Financial Calculations
  const numSelling = Number(sellingPrice) || 0;
  const numCost = Number(supplierCost) || 0;
  const numFee = Number(serviceFee) || 0;
  const numDiscount = Number(discount) || 0;
  const numTaxRate = Number(taxRate) || 0;

  const calculatedTax = useMemo(() => {
    const taxableBase = Math.max(0, numSelling + numFee - numDiscount);
    return (taxableBase * numTaxRate) / 100;
  }, [numSelling, numFee, numDiscount, numTaxRate]);

  const calculatedTotal = useMemo(() => {
    return Math.max(0, numSelling + numFee - numDiscount + calculatedTax);
  }, [numSelling, numFee, numDiscount, calculatedTax]);

  const calculatedProfit = useMemo(() => {
    return Math.max(0, numSelling + numFee - numDiscount - numCost);
  }, [numSelling, numFee, numDiscount, numCost]);

  const calculatedMarginPercent = useMemo(() => {
    if (numSelling <= 0) return 0;
    return Math.round((calculatedProfit / (numSelling + numFee)) * 100);
  }, [calculatedProfit, numSelling, numFee]);

  const numPaid = Number(amountPaid) || 0;
  const calculatedBalanceDue = useMemo(() => {
    return Math.max(0, calculatedTotal - numPaid);
  }, [calculatedTotal, numPaid]);

  // Copy reference
  const handleCopyRef = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(bookingRef);
      setCopiedRef(true);
      setTimeout(() => setCopiedRef(false), 2000);
    }
  };

  // Form Validation
  const validateForm = (): boolean => {
    setError("");
    if (bookingFor === "CORPORATE") {
      if (!selectedCompanyId) {
        setError("Please select a Corporate Company.");
        return false;
      }
      if (!activeEmployee && companyEmployees.length > 0) {
        setError("Please select a Corporate Employee / Traveller.");
        return false;
      }
    } else {
      if (!paxName.trim()) {
        setError("Passenger Full Name is required for Individual booking.");
        return false;
      }
      if (!paxPhone.trim()) {
        setError("Passenger Phone / WhatsApp number is required.");
        return false;
      }
      const parsed = parsePhoneNumber(paxPhone);
      const phoneVal = validatePhoneNumber(parsed.country.iso, parsed.nationalNumber);
      if (!phoneVal.isValid) {
        setError(phoneVal.error || "Please enter a valid phone number according to country code.");
        return false;
      }
    }

    if (numSelling <= 0) {
      setError(`Please enter a valid Selling Price in ${bookingCurrency || "AED"}.`);
      return false;
    }
    return true;
  };

  // Trigger Pre-Submission Summary
  const handleInitiateSave = (action: "SAVE" | "INVOICE" | "VOUCHER" | "DRAFT") => {
    if (action !== "DRAFT" && !validateForm()) return;
    setModalAction(action);
    setShowSummaryModal(true);
  };

  // Final Commit
  const handleConfirmSave = async () => {
    setShowSummaryModal(false);
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    setNotice("");

    const travellerName =
      bookingFor === "CORPORATE" ? activeEmployee?.name || "Corporate Traveller" : paxName;
    const travellerPhone =
      bookingFor === "CORPORATE" ? activeEmployee?.phone || "+971 50 182 9921" : paxPhone;
    const travellerEmail =
      bookingFor === "CORPORATE" ? activeEmployee?.email || undefined : paxEmail || undefined;

    // Build CRM Record
    const crmRecord = {
      id: `crm-${Date.now()}`,
      bookingRef,
      bookingFor,
      companyId: bookingFor === "CORPORATE" ? activeCompany?.id : undefined,
      companyName: bookingFor === "CORPORATE" ? activeCompany?.name : undefined,
      employeeId: bookingFor === "CORPORATE" ? activeEmployee?.id : undefined,
      employeeName: bookingFor === "CORPORATE" ? activeEmployee?.name : undefined,
      customerId: bookingFor === "INDIVIDUAL" ? selectedCustomerId : undefined,
      customerName: travellerName,
      serviceCategory: service,
      travelDate: flightDepDate || "2026-10-15",
      destination:
        service === "HOTEL"
          ? hotels[0]?.destination || "Dubai"
          : service === "VISA"
          ? visaCountry
          : flightTo,
      totalSelling: calculatedTotal,
      totalCost: numCost,
      serviceFee: numFee,
      discount: numDiscount,
      taxRate: numTaxRate,
      taxAmount: calculatedTax,
      netProfit: calculatedProfit,
      paidAmount: numPaid,
      balanceDue: calculatedBalanceDue,
      paymentStatus,
      bookingStatus: modalAction === "DRAFT" ? "QUOTATION" : bookingStatus,
      notes: customerNotes,
      createdAt: new Date().toISOString(),
    };

    try {
      // 1. Synchronize to Backend PostgreSQL API (POST /api/bookings) FIRST.
      //    The local CRM write used to happen before this call, so a failed API call left a
      //    phantom record in localStorage that the UI then reported as saved.
      const apiPayload = {
        customer: {
          name: travellerName,
          phone: travellerPhone,
          email: travellerEmail,
        },
        pnr: flightPnr.trim() || bookingRef.replace("BAT-2026-", "PNR"),
        referenceNumber: bookingRef,
        flightNumber:
          service === "FLIGHT" || service === "FLIGHT_HOTEL" || service === "FLIGHT_VISA" || service === "FLIGHT_HOTEL_VISA"
            ? flightNumber
            : `BAT-${service.slice(0, 4)}`,
        airline:
          service === "FLIGHT" || service === "FLIGHT_HOTEL" || service === "FLIGHT_VISA" || service === "FLIGHT_HOTEL_VISA"
            ? flightAirline
            : "Blue Aura Tours & Travels",
        from: flightFrom || "Dubai (DXB)",
        to:
          service === "HOTEL"
            ? hotels[0]?.destination || "London (LHR)"
            : service === "VISA"
            ? visaCountry
            : flightTo || "London (LHR)",
        departureDate: flightDepDate || "2026-10-15",
        departureTime: flightDepTime || "09:00",
        terminal: flightTerminal || "T3",
        amount: calculatedTotal,
        currency: bookingCurrency || base || "AED",
        baseFare: numSelling,
        cost: numCost,
        discount: numDiscount,
        taxRate: numTaxRate,
        generateInvoice: modalAction === "INVOICE" || generateInvoice,
        source: bookingFor === "CORPORATE" ? "DIRECT" : "MANUAL",
        status: modalAction === "DRAFT" ? "PENDING" : "CONFIRMED",
        skipAutomation: modalAction === "DRAFT" ? true : skipAutomation,
      };

      let resultId = crmRecord.id;
      let invoiceNum: string | null = null;

      try {
        const result = await api<{ id: string; invoiceNumber?: string | null }>("/bookings", {
          method: "POST",
          body: apiPayload,
        });
        if (result?.id) resultId = result.id;
        if (result?.invoiceNumber) invoiceNum = result.invoiceNumber;
      } catch (apiErr: any) {
        // If backend returned a validation error (400/409), surface it; if offline/hybrid session, persist in local CRM & staff attribution
        if (apiErr?.status && apiErr.status >= 400 && apiErr.status < 500 && apiErr.status !== 401) {
          throw apiErr;
        }
      }

      // 2. Mirror record into CRM cache and Staff Booking Attribution Engine ("kis staff ne kitna booking kiya")
      saveCrmBooking(crmRecord);
      recordBookingByCurrentStaff({
        id: resultId,
        pnr: apiPayload.pnr,
        referenceNumber: bookingRef,
        flightNumber: apiPayload.flightNumber,
        airline: apiPayload.airline,
        route: `${apiPayload.from} → ${apiPayload.to}`,
        departureDate: apiPayload.departureDate,
        status: apiPayload.status,
        amount: apiPayload.amount,
        currency: apiPayload.currency,
        customerName: travellerName,
        customerPhone: travellerPhone,
      });

      setCreated(true);

      if (modalAction === "INVOICE" && invoiceNum) {
        setNotice(`Booking saved with Corporate Invoice #${invoiceNum}. Opening Invoice view…`);
        setTimeout(() => router.push(`/bookings/${resultId}/invoice`), 1400);
      } else if (modalAction === "VOUCHER") {
        setNotice("Booking saved & attributed to your staff account! Generating voucher…");
        setTimeout(() => router.push("/bookings"), 1500);
      } else if (modalAction === "DRAFT") {
        setNotice("Draft quote saved & attributed to your staff account in CRM.");
        setTimeout(() => router.push("/bookings"), 1500);
      } else {
        setNotice("Booking successfully created & attributed to your staff account! Redirecting…");
        setTimeout(() => router.push("/bookings"), 1500);
      }
    } catch (err: unknown) {
      console.error("Booking creation failed:", err);
      setError(
        err instanceof Error
          ? `Booking was NOT saved: ${err.message}. Please verify details and retry.`
          : "Booking was NOT saved. Please verify details and retry.",
      );
      setNotice("");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6 pb-20">
        {/* TOP TITLE & BREADCRUMB */}
        <div className="flex flex-col justify-between gap-4 border-b border-slate-200/80 pb-5 md:flex-row md:items-center">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-slate-500">
              <Link href="/bookings" className="text-slate-600 hover:text-blue-600 transition">
                Bookings
              </Link>
              <span>›</span>
              <span className="text-blue-600 font-bold">Add Booking</span>
              <span>›</span>
              <span className="rounded bg-blue-50 px-2 py-0.5 font-mono text-blue-700 font-bold">
                {bookingFor === "CORPORATE" ? "B2B Corporate Travel" : "B2C Individual Travel"}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              Add New Booking — Blue Aura Travel CRM
            </h1>
            <p className="mt-1 text-sm text-slate-500 font-medium">
              Luxury & Budget Travel • Flights • Hotels • Visa • Honeymoon • Group Tours
            </p>
          </div>

          {/* Reference Badge & Actions */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50/70 px-3.5 py-2">
              <div className="text-left">
                <div className="text-[10px] font-bold uppercase tracking-wider text-blue-800">
                  Booking Reference
                </div>
                <div className="font-mono text-sm font-extrabold text-blue-900 tracking-wide">
                  {bookingRef}
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopyRef}
                title="Copy Reference"
                className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-100 transition"
              >
                {copiedRef ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* STEP 1: PROMINENT BOOKING FOR SELECTOR */}
        <div className="rounded-2xl border-2 border-blue-500/20 bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white">
                1
              </span>
              <h2 className="text-base font-extrabold text-slate-900 uppercase tracking-wider">
                Booking For <span className="text-rose-500">*</span>
              </h2>
            </div>
            <span className="text-xs font-semibold text-slate-500">
              Select Corporate / B2B or Individual / B2C
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {/* Corporate Option */}
            <button
              type="button"
              data-booking-for="CORPORATE"
              onClick={() => setBookingFor("CORPORATE")}
              className={`flex items-start gap-4 rounded-xl border-2 p-4 text-left transition ${
                bookingFor === "CORPORATE"
                  ? "border-blue-600 bg-white shadow-md shadow-blue-500/10 ring-4 ring-blue-100/70"
                  : "border-slate-200 bg-white/80 hover:border-blue-300"
              }`}
            >
              <div
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${
                  bookingFor === "CORPORATE" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-slate-900 text-base">Corporate / Company</span>
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-800">
                    B2B Travel Partner
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                  Book for corporate partner employees with stored passports, visa histories, PO approvals,
                  and monthly consolidated billing.
                </p>
              </div>
            </button>

            {/* Individual Option */}
            <button
              type="button"
              data-booking-for="INDIVIDUAL"
              onClick={() => setBookingFor("INDIVIDUAL")}
              className={`flex items-start gap-4 rounded-xl border-2 p-4 text-left transition ${
                bookingFor === "INDIVIDUAL"
                  ? "border-blue-600 bg-white shadow-md shadow-blue-500/10 ring-4 ring-blue-100/70"
                  : "border-slate-200 bg-white/80 hover:border-blue-300"
              }`}
            >
              <div
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${
                  bookingFor === "INDIVIDUAL" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                <User className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-slate-900 text-base">Individual Customer</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                    B2C Retail
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                  Book directly for individual travellers, families, vacationers, or walk-in clients with instant
                  receipts and tickets.
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* MAIN TWO-COLUMN WORKFLOW GRID */}
        <div className="grid gap-6 xl:grid-cols-[1fr_360px] 2xl:grid-cols-[1fr_400px]">
          <div className="space-y-6 min-w-0">
            {/* CORPORATE SELECTION SECTION */}
            {bookingFor === "CORPORATE" ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-blue-600" />
                    <h3 className="font-extrabold text-slate-900 text-lg">
                      Corporate Account & Traveller Selection
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddCompanyModal(true)}
                      className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add New Company
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddEmployeeModal(true)}
                      className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 transition"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add New Employee
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {/* Searchable Corporate Company Dropdown */}
                  <div className="relative">
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                      Company / Corporate Account <span className="text-rose-500">*</span>
                    </label>
                    <div
                      data-test="company-dropdown-trigger"
                      onClick={() => setCompanyOpen(!companyOpen)}
                      className="flex h-11 cursor-pointer items-center justify-between rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-800 hover:border-blue-400 focus:border-blue-600"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Building2 className="h-4 w-4 text-blue-600 shrink-0" />
                        <span className="truncate">{activeCompany?.name || "Select Company"}</span>
                      </div>
                      <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                    </div>

                    {companyOpen && (
                      <div className="absolute z-40 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-2xl">
                        <div className="mb-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                          <Search className="h-3.5 w-3.5 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Search company by name or code..."
                            value={companySearch}
                            onChange={(e) => setCompanySearch(e.target.value)}
                            className="w-full bg-transparent text-xs outline-none"
                            autoFocus
                          />
                        </div>
                        {companies
                          .filter(
                            (c) =>
                              c.name.toLowerCase().includes(companySearch.toLowerCase()) ||
                              c.code.toLowerCase().includes(companySearch.toLowerCase())
                          )
                          .map((c) => (
                            <div
                              key={c.id}
                              data-test-company-id={c.id}
                              onClick={() => {
                                setSelectedCompanyId(c.id);
                                setCompanyOpen(false);
                                const compEmps = employees.filter((e) => e.companyId === c.id);
                                if (compEmps.length > 0) setSelectedEmployeeId(compEmps[0].id);
                              }}
                              className={`flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-xs transition ${
                                selectedCompanyId === c.id
                                  ? "bg-blue-600 font-bold text-white"
                                  : "text-slate-700 hover:bg-blue-50"
                              }`}
                            >
                              <div>
                                <div className="font-bold">{c.name}</div>
                                <div
                                  className={`text-[11px] ${
                                    selectedCompanyId === c.id ? "text-blue-100" : "text-slate-400"
                                  }`}
                                >
                                  {c.code} • {c.industry}
                                </div>
                              </div>
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${
                                  selectedCompanyId === c.id
                                    ? "bg-blue-700 text-white"
                                    : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {c.activeEmployees} Pax
                              </span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>

                  {/* Searchable Corporate Employee Dropdown */}
                  <div className="relative">
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                      Employee / Traveller <span className="text-rose-500">*</span>
                    </label>
                    <div
                      data-test="employee-dropdown-trigger"
                      onClick={() => setEmployeeOpen(!employeeOpen)}
                      className="flex h-11 cursor-pointer items-center justify-between rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-800 hover:border-blue-400 focus:border-blue-600"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <User className="h-4 w-4 text-blue-600 shrink-0" />
                        <span className="truncate">
                          {activeEmployee
                            ? `${activeEmployee.name} (${activeEmployee.designation})`
                            : "Select Employee"}
                        </span>
                      </div>
                      <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                    </div>

                    {employeeOpen && (
                      <div className="absolute z-40 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-2xl">
                        <div className="mb-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                          <Search className="h-3.5 w-3.5 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Search employee by name, ID or passport..."
                            value={employeeSearch}
                            onChange={(e) => setEmployeeSearch(e.target.value)}
                            className="w-full bg-transparent text-xs outline-none"
                            autoFocus
                          />
                        </div>
                        {companyEmployees.length === 0 ? (
                          <div className="p-3 text-center text-xs text-slate-500">
                            No employees listed for this company.{" "}
                            <button
                              type="button"
                              onClick={() => setShowAddEmployeeModal(true)}
                              className="text-blue-600 font-bold underline"
                            >
                              Add one now
                            </button>
                          </div>
                        ) : (
                          companyEmployees
                            .filter(
                              (e) =>
                                e.name.toLowerCase().includes(employeeSearch.toLowerCase()) ||
                                e.employeeId.toLowerCase().includes(employeeSearch.toLowerCase()) ||
                                e.passportNumber.toLowerCase().includes(employeeSearch.toLowerCase())
                            )
                            .map((e) => (
                              <div
                                key={e.id}
                                data-test-employee-id={e.id}
                                onClick={() => {
                                  setSelectedEmployeeId(e.id);
                                  setEmployeeOpen(false);
                                }}
                                className={`flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-xs transition ${
                                  selectedEmployeeId === e.id
                                    ? "bg-blue-600 font-bold text-white"
                                    : "text-slate-700 hover:bg-blue-50"
                                }`}
                              >
                                <div>
                                  <div className="font-bold">{e.name}</div>
                                  <div
                                    className={`text-[11px] ${
                                      selectedEmployeeId === e.id ? "text-blue-100" : "text-slate-400"
                                    }`}
                                  >
                                    {e.designation} • Dept: {e.department}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="font-mono text-[11px] font-bold">
                                    Passport: {e.passportNumber}
                                  </div>
                                  <div
                                    className={`text-[10px] ${
                                      selectedEmployeeId === e.id ? "text-blue-200" : "text-slate-400"
                                    }`}
                                  >
                                    Exp: {e.passportExpiry}
                                  </div>
                                </div>
                              </div>
                            ))
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* COMPANY SUMMARY PANEL */}
                {activeCompany && (
                  <div className="mt-4 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50/50 via-indigo-50/20 to-white p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-100/60 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-blue-950 text-sm">{activeCompany.name}</span>
                        <span className="rounded bg-blue-100 px-2 py-0.5 font-mono text-[11px] font-bold text-blue-800">
                          {activeCompany.code}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowCompanyProfileModal(true)}
                        className="text-xs font-bold text-blue-600 hover:text-blue-800 transition"
                      >
                        [ View Full Company Account ]
                      </button>
                    </div>

                    <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                      <div>
                        <span className="block text-[10px] font-semibold uppercase text-slate-400">
                          Total Bookings
                        </span>
                        <span className="font-bold text-slate-800">{activeCompany.totalBookings} Completed</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-semibold uppercase text-slate-400">
                          Active Employees
                        </span>
                        <span className="font-bold text-slate-800">{activeCompany.activeEmployees} Enrolled</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-semibold uppercase text-slate-400">
                          Outstanding Due
                        </span>
                        <span className="font-bold text-rose-600">
                          {formatMoney(activeCompany.outstandingBalance)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-semibold uppercase text-slate-400">
                          Monthly Spend
                        </span>
                        <span className="font-bold text-emerald-600">
                          {formatMoney(activeCompany.monthlySpend)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-semibold uppercase text-slate-400">
                          Payment Terms
                        </span>
                        <span className="font-bold text-slate-700">{activeCompany.paymentTerms}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* EMPLOYEE TRAVEL HISTORY PANEL */}
                {activeEmployee && (
                  <div className="mt-4 rounded-xl border border-indigo-100 bg-white p-3.5 shadow-xs">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-2">
                        <History className="h-4 w-4 text-indigo-600" />
                        <span className="font-extrabold text-slate-900 text-xs uppercase tracking-wider">
                          Employee Travel History — {activeEmployee.name}
                        </span>
                      </div>
                      <span className="rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                        {activeEmployee.nationality} • {activeEmployee.passportNumber} (Exp:{" "}
                        {activeEmployee.passportExpiry})
                      </span>
                    </div>

                    <div className="mt-2.5 grid gap-3 sm:grid-cols-3 text-xs">
                      {/* Previous Flights */}
                      <div className="rounded-lg bg-slate-50 p-2.5">
                        <div className="font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
                          <Plane className="h-3.5 w-3.5 text-blue-600" /> Previous Flights
                        </div>
                        {activeEmployee.previousFlights.length === 0 ? (
                          <div className="text-[11px] text-slate-400">No previous flight history.</div>
                        ) : (
                          <div className="space-y-1">
                            {activeEmployee.previousFlights.slice(0, 2).map((fl, i) => (
                              <div key={i} className="flex justify-between text-[11px]">
                                <span className="font-bold text-slate-800">{fl.route}</span>
                                <span className="font-mono text-slate-500">
                                  {fl.airline} • {fl.date}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Previous Visas */}
                      <div className="rounded-lg bg-slate-50 p-2.5">
                        <div className="font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
                          <FileCheck2 className="h-3.5 w-3.5 text-emerald-600" /> Previous Visas
                        </div>
                        {activeEmployee.previousVisas.length === 0 ? (
                          <div className="text-[11px] text-slate-400">No previous visa records.</div>
                        ) : (
                          <div className="space-y-1">
                            {activeEmployee.previousVisas.slice(0, 2).map((vs, i) => (
                              <div key={i} className="flex justify-between text-[11px]">
                                <span className="font-bold text-slate-800">{vs.country}</span>
                                <span className="rounded bg-emerald-100 px-1 text-[10px] font-bold text-emerald-800">
                                  {vs.status}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Previous Hotels & Upcoming */}
                      <div className="rounded-lg bg-slate-50 p-2.5">
                        <div className="font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
                          <Building className="h-3.5 w-3.5 text-purple-600" /> Previous Hotels / Upcoming
                        </div>
                        {activeEmployee.upcomingTravel.length > 0 ? (
                          <div className="text-[11px] text-blue-700 font-bold">
                            Upcoming: {activeEmployee.upcomingTravel[0].route} ({activeEmployee.upcomingTravel[0].date})
                          </div>
                        ) : activeEmployee.previousHotels.length > 0 ? (
                          <div className="text-[11px] text-slate-700 font-medium">
                            {activeEmployee.previousHotels[0].name} ({activeEmployee.previousHotels[0].nights} nights)
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-400">No previous hotel records.</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* INDIVIDUAL CUSTOMER WORKFLOW */
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <User className="h-5 w-5 text-emerald-600" />
                    <h3 className="font-extrabold text-slate-900 text-lg">Individual Customer Details</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Select Existing Customer Dropdown */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setCustomerOpen(!customerOpen)}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
                      >
                        <Search className="h-3.5 w-3.5" /> Select Existing Customer
                      </button>

                      {customerOpen && (
                        <div className="absolute right-0 z-40 mt-1 max-h-64 w-72 overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                          <input
                            type="text"
                            placeholder="Search customer..."
                            value={customerSearch}
                            onChange={(e) => setCustomerSearch(e.target.value)}
                            className="mb-2 w-full rounded border border-slate-200 p-1.5 text-xs outline-none"
                            autoFocus
                          />
                          {customers
                            .filter((c) => c.name.toLowerCase().includes(customerSearch.toLowerCase()))
                            .map((c) => (
                              <div
                                key={c.id}
                                onClick={() => handleSelectCustomer(c)}
                                className="cursor-pointer rounded-lg p-2 text-xs hover:bg-blue-50 transition"
                              >
                                <div className="font-bold text-slate-900">{c.name}</div>
                                <div className="text-slate-500 text-[11px]">
                                  {formatPhoneDisplay(c.phone)} • {c.nationality}
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowAddCustomerModal(true)}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add New Customer
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">
                      Customer Full Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={paxName}
                      onChange={(e) => setPaxName(e.target.value)}
                      placeholder="e.g. Rahul Sharma"
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium focus:border-blue-600 outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">
                      Mobile / WhatsApp Number <span className="text-rose-500">*</span>
                    </label>
                    <PhoneInput
                      value={paxPhone}
                      onChange={(e164) => setPaxPhone(e164)}
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Email Address</label>
                    <input
                      type="email"
                      value={paxEmail}
                      onChange={(e) => setPaxEmail(e.target.value)}
                      placeholder="e.g. rahul@example.com"
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium focus:border-blue-600 outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Nationality</label>
                    <input
                      type="text"
                      value={paxNationality}
                      onChange={(e) => setPaxNationality(e.target.value)}
                      placeholder="e.g. India / United Kingdom"
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium focus:border-blue-600 outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Passport Number</label>
                    <input
                      type="text"
                      value={paxPassport}
                      onChange={(e) => setPaxPassport(e.target.value)}
                      placeholder="e.g. M9283710"
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium font-mono focus:border-blue-600 outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Passport Expiry</label>
                    <input
                      type="date"
                      value={paxPassportExpiry}
                      onChange={(e) => setPaxPassportExpiry(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium focus:border-blue-600 outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Date of Birth</label>
                    <input
                      type="date"
                      value={paxDob}
                      onChange={(e) => setPaxDob(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium focus:border-blue-600 outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Gender</label>
                    <select
                      value={paxGender}
                      onChange={(e) => setPaxGender(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium focus:border-blue-600 outline-none"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Couple">Couple</option>
                      <option value="Family">Family</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Number of Travellers</label>
                    <input
                      type="number"
                      min="1"
                      value={paxCount}
                      onChange={(e) => setPaxCount(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium focus:border-blue-600 outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: SERVICE / CATEGORY SELECTOR (PROGRESSIVE DISCLOSURE) */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white">
                    2
                  </span>
                  <h3 className="font-extrabold text-slate-900 text-lg">
                    Service / Booking Category <span className="text-rose-500">*</span>
                  </h3>
                </div>
                <span className="text-xs text-slate-500 font-medium hidden sm:inline">
                  Dynamic form automatically displays relevant service sections
                </span>
              </div>

              {/* Service Grid Buttons */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {SERVICE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const isSelected = service === opt.id;
                  return (
                    <button
                      key={opt.id}
                      data-service={opt.id}
                      type="button"
                      onClick={() => setService(opt.id)}
                      className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition ${
                        isSelected
                          ? "border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-500/20 font-bold"
                          : "border-slate-200 bg-slate-50/70 text-slate-700 hover:border-blue-300 hover:bg-white"
                      }`}
                    >
                      <Icon className={`h-5 w-5 ${isSelected ? "text-white" : "text-blue-600"}`} />
                      <span className="mt-1 text-xs font-semibold leading-tight">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* FLIGHT DETAILS SECTION */}
            {(service === "FLIGHT" ||
              service === "FLIGHT_HOTEL" ||
              service === "FLIGHT_VISA" ||
              service === "FLIGHT_HOTEL_VISA" ||
              service === "GROUP_TOUR" ||
              service === "MICE") && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Plane className="h-5 w-5 text-blue-600" />
                    <h3 className="font-extrabold text-slate-900 text-lg">Flight Booking Details</h3>
                  </div>

                  {/* Trip Type Selector */}
                  <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setTripType("ONE_WAY")}
                      className={`rounded px-3 py-1 transition ${
                        tripType === "ONE_WAY" ? "bg-white text-blue-600 shadow-xs" : "text-slate-600"
                      }`}
                    >
                      One Way
                    </button>
                    <button
                      type="button"
                      onClick={() => setTripType("ROUND_TRIP")}
                      className={`rounded px-3 py-1 transition ${
                        tripType === "ROUND_TRIP" ? "bg-white text-blue-600 shadow-xs" : "text-slate-600"
                      }`}
                    >
                      Round Trip
                    </button>
                    <button
                      type="button"
                      onClick={() => setTripType("MULTI_CITY")}
                      className={`rounded px-3 py-1 transition ${
                        tripType === "MULTI_CITY" ? "bg-white text-blue-600 shadow-xs" : "text-slate-600"
                      }`}
                    >
                      Multi City
                    </button>
                  </div>
                </div>

                {tripType === "MULTI_CITY" ? (
                  /* Multi-City Flight Segments */
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                        Multi-City Flight Segments ({flightSegments.length} Segments)
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setFlightSegments([
                            ...flightSegments,
                            {
                              id: `seg-${Date.now()}`,
                              from: "New York (JFK)",
                              to: "Dubai (DXB)",
                              date: "2026-10-25",
                              departureTime: "21:00",
                              arrivalTime: "18:30",
                              airline: "Emirates",
                              flightNumber: "EK-202",
                              pnr: "BAT999",
                              cost: 3900,
                              sellingPrice: 4700,
                            },
                          ])
                        }
                        className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 hover:bg-blue-100"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add Flight Segment
                      </button>
                    </div>

                    {flightSegments.map((seg, idx) => (
                      <div
                        key={seg.id}
                        className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-xs space-y-3"
                      >
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                          <span className="font-extrabold text-blue-900">
                            Segment #{idx + 1}: {seg.from} → {seg.to}
                          </span>
                          {flightSegments.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setFlightSegments(flightSegments.filter((s) => s.id !== seg.id))
                              }
                              className="text-rose-600 font-bold hover:text-rose-800"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-4">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600">From</label>
                            <input
                              type="text"
                              value={seg.from}
                              onChange={(e) => {
                                const next = [...flightSegments];
                                next[idx].from = e.target.value;
                                setFlightSegments(next);
                              }}
                              className="w-full rounded border border-slate-300 p-1.5 font-medium outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600">To</label>
                            <input
                              type="text"
                              value={seg.to}
                              onChange={(e) => {
                                const next = [...flightSegments];
                                next[idx].to = e.target.value;
                                setFlightSegments(next);
                              }}
                              className="w-full rounded border border-slate-300 p-1.5 font-medium outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600">Date</label>
                            <input
                              type="date"
                              value={seg.date}
                              onChange={(e) => {
                                const next = [...flightSegments];
                                next[idx].date = e.target.value;
                                setFlightSegments(next);
                              }}
                              className="w-full rounded border border-slate-300 p-1.5 font-medium outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600">Airline & Flight #</label>
                            <input
                              type="text"
                              value={`${seg.airline} ${seg.flightNumber}`}
                              onChange={(e) => {
                                const next = [...flightSegments];
                                next[idx].flightNumber = e.target.value;
                                setFlightSegments(next);
                              }}
                              className="w-full rounded border border-slate-300 p-1.5 font-medium outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* One-Way or Round-Trip Route */
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-bold text-slate-700">
                          Departure Airport / Origin <span className="text-rose-500">*</span>
                        </label>
                        <div className="flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 focus-within:border-blue-600">
                          <MapPin className="h-4 w-4 text-blue-600 shrink-0" />
                          <input
                            type="text"
                            value={flightFrom}
                            onChange={(e) => setFlightFrom(e.target.value)}
                            placeholder="e.g. Dubai (DXB)"
                            className="w-full text-sm font-medium outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-bold text-slate-700">
                          Arrival Airport / Destination <span className="text-rose-500">*</span>
                        </label>
                        <div className="flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 focus-within:border-blue-600">
                          <MapPin className="h-4 w-4 text-blue-600 shrink-0" />
                          <input
                            type="text"
                            value={flightTo}
                            onChange={(e) => setFlightTo(e.target.value)}
                            placeholder="e.g. London Heathrow (LHR)"
                            className="w-full text-sm font-medium outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
                      <div>
                        <label className="mb-1 block text-xs font-bold text-slate-700">
                          Departure Date <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="date"
                          value={flightDepDate}
                          onChange={(e) => setFlightDepDate(e.target.value)}
                          className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-blue-600"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-bold text-slate-700">Departure Time</label>
                        <input
                          type="time"
                          value={flightDepTime}
                          onChange={(e) => setFlightDepTime(e.target.value)}
                          className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-blue-600"
                        />
                      </div>

                      {tripType === "ROUND_TRIP" && (
                        <>
                          <div>
                            <label className="mb-1 block text-xs font-bold text-slate-700">
                              Return Date <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="date"
                              value={flightRetDate}
                              onChange={(e) => setFlightRetDate(e.target.value)}
                              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-blue-600"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-bold text-slate-700">Return Time</label>
                            <input
                              type="time"
                              value={flightRetTime}
                              onChange={(e) => setFlightRetTime(e.target.value)}
                              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-blue-600"
                            />
                          </div>
                        </>
                      )}

                      <div>
                        <label className="mb-1 block text-xs font-bold text-slate-700">Terminal</label>
                        <input
                          type="text"
                          value={flightTerminal}
                          onChange={(e) => setFlightTerminal(e.target.value)}
                          placeholder="e.g. Terminal 3"
                          className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-blue-600"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-bold text-slate-700">Cabin Class</label>
                        <select
                          value={flightCabin}
                          onChange={(e) => setFlightCabin(e.target.value)}
                          className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-blue-600"
                        >
                          <option value="Economy">Economy</option>
                          <option value="Premium Economy">Premium Economy</option>
                          <option value="Business">Business</option>
                          <option value="First">First Class</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-4">
                      <div>
                        <label className="mb-1 block text-xs font-bold text-slate-700">Airline</label>
                        <select
                          value={flightAirline}
                          onChange={(e) => setFlightAirline(e.target.value)}
                          className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-blue-600"
                        >
                          {AIRLINES.map((a) => (
                            <option key={a} value={a}>
                              {a}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-bold text-slate-700">Flight Number</label>
                        <input
                          type="text"
                          value={flightNumber}
                          onChange={(e) => setFlightNumber(e.target.value)}
                          placeholder="e.g. EK-001"
                          className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-blue-600"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-bold text-slate-700">Airline PNR</label>
                        <input
                          type="text"
                          value={flightPnr}
                          onChange={(e) => setFlightPnr(e.target.value)}
                          placeholder="e.g. BAT891"
                          className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium font-mono uppercase outline-none focus:border-blue-600"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-bold text-slate-700">E-Ticket Number</label>
                        <input
                          type="text"
                          value={flightTicketNo}
                          onChange={(e) => setFlightTicketNo(e.target.value)}
                          placeholder="e.g. 176-9281048201"
                          className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium font-mono outline-none focus:border-blue-600"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* HOTEL DETAILS SECTION */}
            {(service === "HOTEL" ||
              service === "FLIGHT_HOTEL" ||
              service === "HOTEL_VISA" ||
              service === "FLIGHT_HOTEL_VISA" ||
              service === "GROUP_TOUR" ||
              service === "MICE") && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Building className="h-5 w-5 text-purple-600" />
                    <h3 className="font-extrabold text-slate-900 text-lg">Hotel Accommodation</h3>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setHotels([
                        ...hotels,
                        {
                          id: `hotel-${Date.now()}`,
                          destination: "Paris, France",
                          hotelName: "Four Seasons Hotel George V",
                          checkIn: "2026-10-20",
                          checkOut: "2026-10-25",
                          rooms: 1,
                          adults: 1,
                          children: 0,
                          roomType: "Deluxe King Room",
                          mealPlan: "Breakfast",
                          confirmationNumber: "FS-PAR-9921",
                          supplier: "WebBeds Middle East",
                          cost: 4100,
                          sellingPrice: 4900,
                          cancellationPolicy: "Non-refundable 7 days prior",
                        },
                      ])
                    }
                    className="flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-bold text-purple-700 hover:bg-purple-100 transition"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Hotel Stay
                  </button>
                </div>

                <div className="space-y-4">
                  {hotels.map((h, idx) => (
                    <div
                      key={h.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <span className="font-extrabold text-slate-900 text-xs uppercase tracking-wider">
                          Hotel Stay #{idx + 1}: {h.hotelName || "Hotel Details"}
                        </span>
                        {hotels.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setHotels(hotels.filter((item) => item.id !== h.id))}
                            className="text-rose-600 font-bold hover:text-rose-800 text-xs"
                          >
                            Remove Hotel
                          </button>
                        )}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 text-xs">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600">Destination *</label>
                          <input
                            type="text"
                            value={h.destination}
                            onChange={(e) => {
                              const next = [...hotels];
                              next[idx].destination = e.target.value;
                              setHotels(next);
                            }}
                            placeholder="e.g. London, UK"
                            className="w-full rounded border border-slate-300 p-2 font-medium outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600">Hotel Name *</label>
                          <input
                            type="text"
                            value={h.hotelName}
                            onChange={(e) => {
                              const next = [...hotels];
                              next[idx].hotelName = e.target.value;
                              setHotels(next);
                            }}
                            placeholder="e.g. The Langham London"
                            className="w-full rounded border border-slate-300 p-2 font-medium outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600">Check-in Date *</label>
                          <input
                            type="date"
                            value={h.checkIn}
                            onChange={(e) => {
                              const next = [...hotels];
                              next[idx].checkIn = e.target.value;
                              setHotels(next);
                            }}
                            className="w-full rounded border border-slate-300 p-2 font-medium outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600">Check-out Date *</label>
                          <input
                            type="date"
                            value={h.checkOut}
                            onChange={(e) => {
                              const next = [...hotels];
                              next[idx].checkOut = e.target.value;
                              setHotels(next);
                            }}
                            className="w-full rounded border border-slate-300 p-2 font-medium outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600">Room Type</label>
                          <select
                            value={h.roomType}
                            onChange={(e) => {
                              const next = [...hotels];
                              next[idx].roomType = e.target.value;
                              setHotels(next);
                            }}
                            className="w-full rounded border border-slate-300 p-2 font-medium outline-none"
                          >
                            <option value="Single">Single</option>
                            <option value="Double">Double</option>
                            <option value="Twin">Twin</option>
                            <option value="Triple">Triple</option>
                            <option value="Family">Family Suite</option>
                            <option value="Executive Suite">Executive Suite</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600">Meal Plan</label>
                          <select
                            value={h.mealPlan}
                            onChange={(e) => {
                              const next = [...hotels];
                              next[idx].mealPlan = e.target.value;
                              setHotels(next);
                            }}
                            className="w-full rounded border border-slate-300 p-2 font-medium outline-none"
                          >
                            <option value="Room Only">Room Only</option>
                            <option value="Breakfast">Bed & Breakfast</option>
                            <option value="Half Board">Half Board</option>
                            <option value="Full Board">Full Board</option>
                            <option value="All Inclusive">All Inclusive</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600">Confirmation #</label>
                          <input
                            type="text"
                            value={h.confirmationNumber}
                            onChange={(e) => {
                              const next = [...hotels];
                              next[idx].confirmationNumber = e.target.value;
                              setHotels(next);
                            }}
                            placeholder="e.g. LNG-2026-8812"
                            className="w-full rounded border border-slate-300 p-2 font-medium font-mono outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600">Hotel Supplier</label>
                          <input
                            type="text"
                            value={h.supplier}
                            onChange={(e) => {
                              const next = [...hotels];
                              next[idx].supplier = e.target.value;
                              setHotels(next);
                            }}
                            placeholder="e.g. Bedsonline / WebBeds"
                            className="w-full rounded border border-slate-300 p-2 font-medium outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* VISA BOOKING & APPLICATION SECTION */}
            {(service === "VISA" ||
              service === "FLIGHT_VISA" ||
              service === "HOTEL_VISA" ||
              service === "FLIGHT_HOTEL_VISA" ||
              service === "GROUP_TOUR" ||
              service === "MICE") && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <FileCheck2 className="h-5 w-5 text-emerald-600" />
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-lg">
                        Visa Application & Document Workflow
                      </h3>
                      <p className="text-xs text-slate-500">
                        Tracks embassy appointments, biometric requirements, and client documents checklist.
                      </p>
                    </div>
                  </div>

                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-200">
                    Status: {visaStatus}
                  </span>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Visa Type</label>
                    <select
                      value={visaType}
                      onChange={(e) => setVisaType(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-blue-600"
                    >
                      {VISA_TYPES.map((vt) => (
                        <option key={vt} value={vt}>
                          {vt}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">
                      Destination / Country <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={visaCountry}
                      onChange={(e) => setVisaCountry(e.target.value)}
                      placeholder="e.g. United Kingdom / Schengen / USA"
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-blue-600"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Nationality</label>
                    <input
                      type="text"
                      value={visaNationality}
                      onChange={(e) => setVisaNationality(e.target.value)}
                      placeholder="e.g. United Arab Emirates"
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-blue-600"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Passport Number</label>
                    <input
                      type="text"
                      value={visaPassportNo}
                      onChange={(e) => setVisaPassportNo(e.target.value)}
                      placeholder="e.g. E9918234"
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-mono font-medium outline-none focus:border-blue-600"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Passport Expiry</label>
                    <input
                      type="date"
                      value={visaPassportExpiry}
                      onChange={(e) => setVisaPassportExpiry(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-blue-600"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Application Date</label>
                    <input
                      type="date"
                      value={visaAppDate}
                      onChange={(e) => setVisaAppDate(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-blue-600"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Expected Travel Date</label>
                    <input
                      type="date"
                      value={visaTravelDate}
                      onChange={(e) => setVisaTravelDate(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-blue-600"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Visa Processing Status</label>
                    <select
                      value={visaStatus}
                      onChange={(e) => setVisaStatus(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-blue-600"
                    >
                      {VISA_STATUS_OPTIONS.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Embassy Reference #</label>
                    <input
                      type="text"
                      value={visaRefNo}
                      onChange={(e) => setVisaRefNo(e.target.value)}
                      placeholder="e.g. VFS-UK-99214"
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-mono font-medium outline-none focus:border-blue-600"
                    />
                  </div>
                </div>

                {/* REQUIRED DOCUMENTS CHECKLIST */}
                <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
                  <div className="mb-2.5 flex items-center justify-between">
                    <span className="text-xs font-extrabold text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" /> Required Documents Checklist
                    </span>
                    <span className="text-[11px] font-bold text-emerald-800">
                      {visaCheckedDocs.length} of {DEFAULT_DOC_CHECKLIST.length} Collected
                    </span>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {DEFAULT_DOC_CHECKLIST.map((doc) => {
                      const checked = visaCheckedDocs.includes(doc);
                      return (
                        <label
                          key={doc}
                          className="flex cursor-pointer items-center gap-2 rounded-lg bg-white p-2 text-xs font-medium text-slate-800 shadow-2xs border border-emerald-100 hover:border-emerald-300"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setVisaCheckedDocs([...visaCheckedDocs, doc]);
                              } else {
                                setVisaCheckedDocs(visaCheckedDocs.filter((d) => d !== doc));
                              }
                            }}
                            className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="truncate">{doc}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* HONEYMOON PACKAGE DETAILS */}
            {service === "HONEYMOON_PACKAGE" && (
              <div className="rounded-2xl border border-rose-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2 border-b border-rose-100 pb-3">
                  <Heart className="h-5 w-5 text-rose-500" />
                  <h3 className="font-extrabold text-slate-900 text-lg">Honeymoon Package Details</h3>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Honeymoon Destination *</label>
                    <input
                      type="text"
                      value={hmDestination}
                      onChange={(e) => setHmDestination(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-rose-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Duration</label>
                    <input
                      type="text"
                      value={hmDuration}
                      onChange={(e) => setHmDuration(e.target.value)}
                      placeholder="e.g. 5 Nights / 6 Days"
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-rose-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Resort / Hotel</label>
                    <input
                      type="text"
                      value={hmHotel}
                      onChange={(e) => setHmHotel(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-rose-500"
                    />
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50/40 p-4">
                  <span className="text-xs font-extrabold text-rose-950 uppercase tracking-wider mb-2 block">
                    Special Romantic Arrangements & Inclusions
                  </span>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {HONEYMOON_EXTRAS.map((extra) => {
                      const checked = hmSelectedExtras.includes(extra);
                      return (
                        <label
                          key={extra}
                          className="flex cursor-pointer items-center gap-2 rounded-lg bg-white p-2.5 text-xs font-medium text-slate-800 shadow-2xs border border-rose-100 hover:border-rose-300"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) setHmSelectedExtras([...hmSelectedExtras, extra]);
                              else setHmSelectedExtras(hmSelectedExtras.filter((x) => x !== extra));
                            }}
                            className="h-4 w-4 rounded text-rose-600 focus:ring-rose-500"
                          />
                          <span>{extra}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* GROUP TOUR DETAILS */}
            {service === "GROUP_TOUR" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
                  <Users className="h-5 w-5 text-indigo-600" />
                  <h3 className="font-extrabold text-slate-900 text-lg">Group Tour Management</h3>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Group Name *</label>
                    <input
                      type="text"
                      value={grpName}
                      onChange={(e) => setGrpName(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-indigo-600"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Group Type</label>
                    <select
                      value={grpType}
                      onChange={(e) => setGrpType(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-indigo-600"
                    >
                      <option value="Corporate">Corporate Group</option>
                      <option value="Family">Family Reunion</option>
                      <option value="Friends">Friends Tour</option>
                      <option value="School / College">School / College</option>
                      <option value="Religious">Religious / Pilgrimage</option>
                      <option value="MICE">MICE Delegation</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Total Travellers</label>
                    <input
                      type="number"
                      value={grpTotalPax}
                      onChange={(e) => setGrpTotalPax(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-indigo-600"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Rooming List & Special Requirements
                  </label>
                  <textarea
                    rows={2}
                    value={grpRoomingNotes}
                    onChange={(e) => setGrpRoomingNotes(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-xs font-medium outline-none focus:border-indigo-600"
                  />
                </div>
              </div>
            )}

            {/* MICE CORPORATE GROUP TRAVEL */}
            {service === "MICE" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
                  <Building2 className="h-5 w-5 text-blue-700" />
                  <h3 className="font-extrabold text-slate-900 text-lg">MICE / Corporate Group Travel</h3>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Event / Project Name *</label>
                    <input
                      type="text"
                      value={miceEvent}
                      onChange={(e) => setMiceEvent(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Purpose</label>
                    <select
                      value={micePurpose}
                      onChange={(e) => setMicePurpose(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-blue-600"
                    >
                      <option value="Meeting">Executive Meeting</option>
                      <option value="Incentive">Incentive Trip</option>
                      <option value="Conference">Annual Conference</option>
                      <option value="Exhibition">Trade Exhibition</option>
                      <option value="Corporate Event">Corporate Gala</option>
                      <option value="Business Delegation">Government Delegation</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Company PO / Approval #</label>
                    <input
                      type="text"
                      value={miceApprovalNo}
                      onChange={(e) => setMiceApprovalNo(e.target.value)}
                      placeholder="e.g. PO-CORP-2026-8819"
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium font-mono outline-none focus:border-blue-600"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* HOLIDAY / TOUR PACKAGE */}
            {service === "HOLIDAY_PACKAGE" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
                  <Luggage className="h-5 w-5 text-amber-600" />
                  <h3 className="font-extrabold text-slate-900 text-lg">Holiday Package Specifications</h3>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Package Name *</label>
                    <input
                      type="text"
                      value={pkgName}
                      onChange={(e) => setPkgName(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-amber-600"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Destination *</label>
                    <input
                      type="text"
                      value={pkgDestination}
                      onChange={(e) => setPkgDestination(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-amber-600"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Package Tier</label>
                    <select
                      value={pkgType}
                      onChange={(e) => setPkgType(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-amber-600"
                    >
                      <option value="Budget">Budget</option>
                      <option value="Standard">Standard</option>
                      <option value="Premium">Premium</option>
                      <option value="Luxury">Luxury</option>
                      <option value="Customized">Customized</option>
                    </select>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="mb-1 block text-xs font-bold text-slate-700">Itinerary Overview</label>
                  <textarea
                    rows={3}
                    value={pkgItinerary}
                    onChange={(e) => setPkgItinerary(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-xs font-mono outline-none focus:border-amber-600"
                  />
                </div>
              </div>
            )}

            {/* AIRPORT TRANSFER / TRANSPORT */}
            {service === "AIRPORT_TRANSFER" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
                  <Building2 className="h-5 w-5 text-cyan-600" />
                  <h3 className="font-extrabold text-slate-900 text-lg">Airport Chauffeur & Transfers</h3>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Pickup Location</label>
                    <input
                      type="text"
                      value={trPickup}
                      onChange={(e) => setTrPickup(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-cyan-600"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Drop Location</label>
                    <input
                      type="text"
                      value={trDrop}
                      onChange={(e) => setTrDrop(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-cyan-600"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Pickup Date & Time</label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={trDate}
                        onChange={(e) => setTrDate(e.target.value)}
                        className="h-10 w-full rounded-lg border border-slate-300 px-2.5 text-xs font-medium outline-none"
                      />
                      <input
                        type="time"
                        value={trTime}
                        onChange={(e) => setTrTime(e.target.value)}
                        className="h-10 w-full rounded-lg border border-slate-300 px-2.5 text-xs font-medium outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Vehicle Type</label>
                    <select
                      value={trVehicle}
                      onChange={(e) => setTrVehicle(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-cyan-600"
                    >
                      <option value="Sedan">Sedan (Executive Lexus / Camry)</option>
                      <option value="SUV">SUV (Land Cruiser / Tahoe)</option>
                      <option value="Van">Executive Van (Mercedes V-Class)</option>
                      <option value="Bus">Luxury Coach (30-50 Pax)</option>
                      <option value="Luxury Vehicle">Ultra Luxury (Mercedes S-Class / BMW 7)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* TRAVEL INSURANCE */}
            {service === "TRAVEL_INSURANCE" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  <h3 className="font-extrabold text-slate-900 text-lg">Travel Insurance Policy</h3>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Insurance Provider</label>
                    <input
                      type="text"
                      value={insProvider}
                      onChange={(e) => setInsProvider(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Policy Number</label>
                    <input
                      type="text"
                      value={insPolicyNo}
                      onChange={(e) => setInsPolicyNo(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-mono font-medium outline-none focus:border-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Coverage Amount</label>
                    <input
                      type="text"
                      value={insAmount}
                      onChange={(e) => setInsAmount(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* OTHER / CUSTOM TRAVEL SERVICE */}
            {service === "OTHER" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
                  <HelpCircle className="h-5 w-5 text-indigo-600" />
                  <h3 className="font-extrabold text-slate-900 text-lg">Custom Travel Service Details</h3>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Service Name / Title</label>
                    <input
                      type="text"
                      value={customServiceName}
                      onChange={(e) => setCustomServiceName(e.target.value)}
                      placeholder="e.g. VIP Meet & Greet / Helicopter Tour / Luxury Yacht"
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-indigo-600"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Vendor / Supplier</label>
                    <input
                      type="text"
                      value={customSupplier}
                      onChange={(e) => setCustomSupplier(e.target.value)}
                      placeholder="e.g. Marhaba Services / Local Tour Operator"
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-indigo-600"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Service Date</label>
                    <input
                      type="date"
                      value={customDate}
                      onChange={(e) => setCustomDate(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium outline-none focus:border-indigo-600"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Confirmation / Voucher Ref #</label>
                    <input
                      type="text"
                      value={customRef}
                      onChange={(e) => setCustomRef(e.target.value)}
                      placeholder="e.g. VCH-99214"
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-mono font-medium outline-none focus:border-indigo-600"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="mb-1 block text-xs font-bold text-slate-700">Detailed Scope & Instructions</label>
                  <textarea
                    rows={3}
                    value={customNotes}
                    onChange={(e) => setCustomNotes(e.target.value)}
                    placeholder="Enter special arrangements, client requests, vendor contact info..."
                    className="w-full rounded-lg border border-slate-300 p-3 text-xs font-medium outline-none focus:border-indigo-600"
                  />
                </div>
              </div>
            )}

            {/* FINANCIALS & CORPORATE BILLING SECTION */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-blue-600" />
                  <h3 className="font-extrabold text-slate-900 text-lg">Financials & Billing Breakdown</h3>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1">
                    <label className="text-xs font-bold text-slate-600">Booking Currency:</label>
                    <select
                      value={bookingCurrency}
                      onChange={(e) => setBookingCurrency(e.target.value)}
                      className="bg-transparent text-xs font-black text-slate-900 outline-none cursor-pointer"
                    >
                      {currencyOptions.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code} - {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-800">
                    Net Profit: {formatMoney(calculatedProfit)} ({calculatedMarginPercent}% Margin)
                  </span>
                </div>
              </div>

              {/* Price Breakdown Grid */}
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Selling Price ({bookingCurrency}) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(e.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Supplier / Net Cost ({bookingCurrency})
                  </label>
                  <input
                    type="number"
                    value={supplierCost}
                    onChange={(e) => setSupplierCost(e.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-700 outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">Service Fee / Commission ({bookingCurrency})</label>
                  <input
                    type="number"
                    value={serviceFee}
                    onChange={(e) => setServiceFee(e.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-700 outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">Discount ({bookingCurrency})</label>
                  <input
                    type="number"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-700 outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">Tax / VAT (%)</label>
                  <input
                    type="number"
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-700 outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">Amount Paid ({bookingCurrency})</label>
                  <input
                    type="number"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">Balance Due ({bookingCurrency})</label>
                  <div
                    className={`flex h-10 items-center rounded-lg border px-3 text-sm font-extrabold ${
                      calculatedBalanceDue > 0
                        ? "border-rose-300 bg-rose-50 text-rose-700"
                        : "border-emerald-300 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {bookingCurrency} {calculatedBalanceDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              {/* CORPORATE BILLING INFORMATION */}
              {bookingFor === "CORPORATE" && (
                <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-blue-950 flex items-center gap-1.5">
                      <Building2 className="h-4 w-4 text-blue-700" /> Corporate Account Billing
                    </span>
                    <span className="text-[11px] font-bold text-blue-800">
                      Invoiced to: {activeCompany?.name}
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3 text-xs">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600">
                        PO / Billing Reference <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={poNumber}
                        onChange={(e) => setPoNumber(e.target.value)}
                        placeholder="e.g. PO-AGL-8821"
                        className="w-full rounded border border-slate-300 p-2 font-mono font-bold outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600">Cost Center</label>
                      <input
                        type="text"
                        value={costCenter}
                        onChange={(e) => setCostCenter(e.target.value)}
                        placeholder="e.g. CC-LOG-01"
                        className="w-full rounded border border-slate-300 p-2 font-mono font-bold outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600">Payment Status</label>
                      <select
                        value={paymentStatus}
                        onChange={(e) => setPaymentStatus(e.target.value)}
                        className="w-full rounded border border-slate-300 p-2 font-bold outline-none"
                      >
                        <option value="PAID">Paid</option>
                        <option value="PARTIALLY_PAID">Partially Paid</option>
                        <option value="UNPAID">Unpaid (Net 30 Days Credit)</option>
                        <option value="REFUND_PENDING">Refund Pending</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* SUPPLIER & PROFITABILITY DETAILS */}
              <div className="mt-4 border-t border-slate-100 pt-4">
                <span className="block text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-2">
                  Supplier & Fulfillment Details
                </span>
                <div className="grid gap-3 sm:grid-cols-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600">Supplier Name</label>
                    <select
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      className="w-full rounded border border-slate-300 p-2 font-medium outline-none"
                    >
                      {SUPPLIERS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600">Supplier Reference #</label>
                    <input
                      type="text"
                      value={supplierReference}
                      onChange={(e) => setSupplierReference(e.target.value)}
                      placeholder="e.g. EK-B2B-89104"
                      className="w-full rounded border border-slate-300 p-2 font-mono outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600">Supplier Payment Status</label>
                    <select
                      value={supplierPaymentStatus}
                      onChange={(e) => setSupplierPaymentStatus(e.target.value)}
                      className="w-full rounded border border-slate-300 p-2 font-medium outline-none"
                    >
                      <option value="Account Credit">Account Credit</option>
                      <option value="Paid">Paid via Corporate Card</option>
                      <option value="Pending">Payment Pending</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* NOTES & INSTRUCTIONS */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <h3 className="font-extrabold text-slate-900 text-lg border-b border-slate-100 pb-3">
                Booking Notes & Staff Instructions
              </h3>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Customer / Passenger Notes (Printed on Itinerary)
                  </label>
                  <textarea
                    rows={2}
                    value={customerNotes}
                    onChange={(e) => setCustomerNotes(e.target.value)}
                    placeholder="Notes visible to client..."
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-xs font-medium outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    Internal Staff Notes <span className="text-[10px] text-amber-600 font-normal">(Confidential)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={staffNotes}
                    onChange={(e) => setStaffNotes(e.target.value)}
                    placeholder="Private staff notes, commissions, supplier terms..."
                    className="w-full rounded-lg border border-amber-200 bg-amber-50/30 p-2.5 text-xs font-medium outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>

            {/* AUTOMATION & NOTIFICATIONS */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-500" /> Automated WhatsApp Notifications
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Automatically sends instant itinerary, travel updates and journey day reminders.
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-600">
                    {skipAutomation ? "Automation Disabled" : "Automation Active"}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!skipAutomation}
                    onClick={() => setSkipAutomation(!skipAutomation)}
                    className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                      !skipAutomation ? "bg-blue-600" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
                        !skipAutomation ? "left-6" : "left-1"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT SIDEBAR: LIVE BOARDING PASS & PREVIEW */}
          <aside className="space-y-6 lg:sticky lg:top-6 self-start min-w-0">
            {/* Live Boarding Pass / Ticket Preview */}
            <div className="overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-b from-white to-blue-50/50 p-5 shadow-lg shadow-blue-500/5">
              <div className="flex items-center justify-between border-b border-dashed border-blue-200 pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-xs shadow-sm">
                    BAT
                  </div>
                  <div>
                    <div className="text-xs font-extrabold text-blue-950 uppercase tracking-wider">
                      {bookingFor === "CORPORATE" ? activeCompany?.name || "Corporate Account" : "Blue Aura Tours"}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500">{bookingRef}</div>
                  </div>
                </div>

                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-800">
                  {bookingStatus}
                </span>
              </div>

              {/* Service Route / Title */}
              <div className="my-4 flex items-center justify-between">
                <div className="max-w-[45%]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Origin</span>
                  <div className="truncate text-base font-extrabold text-slate-900">
                    {flightFrom.split(" ")[0]}
                  </div>
                </div>
                <div className="flex flex-col items-center px-2">
                  <Plane className="h-4 w-4 text-blue-600 rotate-90" />
                  <span className="text-[10px] font-bold text-blue-600 mt-0.5">{flightDepTime}</span>
                </div>
                <div className="max-w-[45%] text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Destination</span>
                  <div className="truncate text-base font-extrabold text-slate-900">
                    {flightTo.split(" ")[0]}
                  </div>
                </div>
              </div>

              {/* Passenger & Details */}
              <div className="grid grid-cols-2 gap-2.5 rounded-xl bg-blue-50/70 p-3 text-xs">
                <div>
                  <span className="block text-[10px] font-bold uppercase text-slate-400">Passenger / Traveller</span>
                  <span className="font-extrabold text-slate-900 truncate block">
                    {bookingFor === "CORPORATE" ? activeEmployee?.name || "Corporate Traveller" : paxName}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase text-slate-400">Service</span>
                  <span className="font-bold text-blue-700 truncate block">
                    {SERVICE_OPTIONS.find((s) => s.id === service)?.label || service}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase text-slate-400">Travel Date</span>
                  <span className="font-semibold text-slate-800">{flightDepDate}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase text-slate-400">Airline / Supplier</span>
                  <span className="font-semibold text-slate-800 truncate block">{flightAirline}</span>
                </div>
              </div>

              {/* Total Price Banner */}
              <div className="mt-3 flex items-center justify-between rounded-xl bg-gradient-to-r from-blue-900 to-indigo-950 p-3 text-white">
                <div>
                  <div className="text-[10px] uppercase font-bold text-blue-200">Total Booking Price</div>
                  <div className="text-lg font-extrabold">{formatMoney(calculatedTotal)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase font-bold text-emerald-300">Est. Profit</div>
                  <div className="text-sm font-extrabold text-emerald-400">{formatMoney(calculatedProfit)}</div>
                </div>
              </div>

              {/* Barcode Strip */}
              <div className="mt-4 flex flex-col items-center justify-center border-t border-dashed border-blue-200 pt-3">
                <div className="flex h-7 items-center gap-1 opacity-75">
                  {[4, 2, 6, 2, 4, 8, 3, 5, 2, 6, 4, 2, 5, 3, 7, 2, 4, 3, 6, 2].map((w, idx) => (
                    <div key={idx} className="bg-slate-800 h-full" style={{ width: `${w}px` }} />
                  ))}
                </div>
                <div className="mt-1 font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase">
                  {bookingRef} • BLUE AURA CRM VERIFIED
                </div>
              </div>
            </div>

            {/* WHAT HAPPENS NEXT TIMELINE */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h4 className="font-extrabold text-slate-900 text-sm mb-3">Booking Execution Flow</h4>
              <div className="space-y-4 text-xs">
                <div className="flex items-start gap-3">
                  <div className="grid h-6 w-6 place-items-center rounded-full bg-blue-100 text-blue-700 font-bold shrink-0">
                    1
                  </div>
                  <div>
                    <div className="font-bold text-slate-800">Synchronized CRM Record</div>
                    <p className="text-slate-500 text-[11px]">
                      Saved to corporate account ledger and employee profile.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="grid h-6 w-6 place-items-center rounded-full bg-blue-100 text-blue-700 font-bold shrink-0">
                    2
                  </div>
                  <div>
                    <div className="font-bold text-slate-800">Invoice & Accounting Sync</div>
                    <p className="text-slate-500 text-[11px]">
                      Generates official Tax Invoice with VAT details and PO number.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="grid h-6 w-6 place-items-center rounded-full bg-blue-100 text-blue-700 font-bold shrink-0">
                    3
                  </div>
                  <div>
                    <div className="font-bold text-slate-800">WhatsApp Notification</div>
                    <p className="text-slate-500 text-[11px]">
                      Instant confirmation and reminder delivered via WhatsApp API.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>

        {/* ERROR / NOTICE MESSAGES */}
        {error && (
          <div data-test="error-banner" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
            {notice}
          </div>
        )}

        {/* BOTTOM ACTION BAR */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <Link
            href="/bookings"
            className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 transition"
          >
            Cancel
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleInitiateSave("DRAFT")}
              disabled={submitting}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
            >
              Save as Draft
            </button>

            <button
              type="button"
              onClick={() => handleInitiateSave("VOUCHER")}
              disabled={submitting}
              className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-2.5 text-xs font-bold text-purple-700 hover:bg-purple-100 transition"
            >
              Save & Generate Voucher
            </button>

            <button
              type="button"
              onClick={() => handleInitiateSave("INVOICE")}
              disabled={submitting}
              className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition"
            >
              Save & Generate Invoice
            </button>

            <button
              data-test="initiate-save-btn"
              type="button"
              onClick={() => handleInitiateSave("SAVE")}
              disabled={submitting || created}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {created ? "Created ✓" : submitting ? "Saving..." : "Save Booking"}
              {!submitting && !created && <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* BOOKING SUMMARY CONFIRMATION MODAL */}
        {showSummaryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150">
              <div className="bg-gradient-to-r from-blue-900 to-indigo-950 p-5 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-blue-300" />
                    <h3 className="font-extrabold text-lg">Booking Summary Confirmation</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSummaryModal(false)}
                    className="rounded-lg p-1 text-blue-200 hover:bg-white/10"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="mt-1 font-mono text-xs text-blue-200">Ref: {bookingRef}</div>
              </div>

              <div className="p-5 space-y-4 text-xs">
                <div className="rounded-xl bg-slate-50 p-4 space-y-2.5">
                  <div className="flex justify-between">
                    <span className="font-bold text-slate-500">Booking For:</span>
                    <span className="font-extrabold text-blue-700">
                      {bookingFor === "CORPORATE" ? "Corporate / B2B" : "Individual / B2C"}
                    </span>
                  </div>

                  {bookingFor === "CORPORATE" && (
                    <div className="flex justify-between">
                      <span className="font-bold text-slate-500">Corporate Company:</span>
                      <span className="font-extrabold text-slate-900">{activeCompany?.name}</span>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <span className="font-bold text-slate-500">Traveller Name:</span>
                    <span className="font-extrabold text-slate-900">
                      {bookingFor === "CORPORATE" ? activeEmployee?.name : paxName}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="font-bold text-slate-500">Service Category:</span>
                    <span className="font-bold text-slate-800">
                      {SERVICE_OPTIONS.find((s) => s.id === service)?.label || service}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="font-bold text-slate-500">Travel Date:</span>
                    <span className="font-medium text-slate-800">{flightDepDate}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="font-bold text-slate-500">Destination:</span>
                    <span className="font-medium text-slate-800">
                      {service === "HOTEL"
                        ? hotels[0]?.destination
                        : service === "VISA"
                        ? visaCountry
                        : flightTo}
                    </span>
                  </div>

                  <div className="border-t border-slate-200 pt-2 flex justify-between">
                    <span className="font-bold text-slate-600">Total Selling Amount:</span>
                    <span className="text-sm font-extrabold text-blue-900">
                      {formatMoney(calculatedTotal)}
                    </span>
                  </div>

                  <div className="flex justify-between text-emerald-700">
                    <span className="font-bold">Estimated Profit Margin:</span>
                    <span className="font-extrabold">
                      {formatMoney(calculatedProfit)} ({calculatedMarginPercent}%)
                    </span>
                  </div>

                  <div className="flex justify-between text-rose-700">
                    <span className="font-bold">Balance Due:</span>
                    <span className="font-extrabold">{formatMoney(calculatedBalanceDue)}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="font-bold text-slate-500">Status:</span>
                    <span className="font-bold uppercase text-blue-600">
                      {modalAction === "DRAFT" ? "QUOTATION DRAFT" : bookingStatus}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowSummaryModal(false)}
                    className="rounded-xl border border-slate-300 px-4 py-2 font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Edit Details
                  </button>
                  <button
                    data-test="confirm-save-modal-btn"
                    type="button"
                    onClick={handleConfirmSave}
                    disabled={submitting}
                    className="rounded-xl bg-blue-600 px-5 py-2 font-extrabold text-white shadow-md shadow-blue-500/20 hover:bg-blue-700"
                  >
                    {submitting ? "Processing..." : "Confirm & Save Booking"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: ADD NEW COMPANY */}
        {showAddCompanyModal && (
          <AddCompanyModal
            onClose={() => setShowAddCompanyModal(false)}
            onSave={(newComp) => {
              saveCompany(newComp);
              setCompanies(getStoredCompanies());
              setSelectedCompanyId(newComp.id);
              setShowAddCompanyModal(false);
            }}
          />
        )}

        {/* MODAL: ADD NEW EMPLOYEE */}
        {showAddEmployeeModal && (
          <AddEmployeeModal
            companyId={selectedCompanyId}
            companyName={activeCompany?.name || "Corporate Partner"}
            onClose={() => setShowAddEmployeeModal(false)}
            onSave={(newEmp) => {
              saveEmployee(newEmp);
              setEmployees(getStoredEmployees());
              setSelectedEmployeeId(newEmp.id);
              setShowAddEmployeeModal(false);
            }}
          />
        )}

        {/* MODAL: ADD NEW CUSTOMER */}
        {showAddCustomerModal && (
          <AddCustomerModal
            onClose={() => setShowAddCustomerModal(false)}
            onSave={(newCust) => {
              saveCustomer(newCust);
              setCustomers(getStoredCustomers());
              handleSelectCustomer(newCust);
              setShowAddCustomerModal(false);
            }}
          />
        )}

        {/* MODAL: COMPANY PROFILE VIEW */}
        {showCompanyProfileModal && activeCompany && (
          <CompanyProfileModal
            company={activeCompany}
            onClose={() => setShowCompanyProfileModal(false)}
            formatMoney={formatMoney}
          />
        )}
      </div>
    </AppShell>
  );
}

// INLINE MODAL COMPONENT: ADD NEW COMPANY
function AddCompanyModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (comp: Company) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [industry, setIndustry] = useState("");
  const [address, setAddress] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [creditLimit, setCreditLimit] = useState("100000");
  const [paymentTerms, setPaymentTerms] = useState("Net 30 Days");
  const [costCenter, setCostCenter] = useState("CC-CORP-01");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const newComp: Company = {
      id: `comp-${Date.now()}`,
      name: name.trim(),
      code: code.trim().toUpperCase() || `BAT-${name.slice(0, 3).toUpperCase()}`,
      industry: industry.trim() || "Corporate Client",
      address: address.trim() || "Dubai, UAE",
      contactPerson: contactPerson.trim() || "Account Manager",
      email: email.trim() || "accounts@client.ae",
      phone: phone.trim() || "+971 4 000 0000",
      creditLimit: Number(creditLimit) || 100000,
      outstandingBalance: 0,
      paymentTerms,
      defaultCostCenter: costCenter,
      totalBookings: 0,
      activeEmployees: 1,
      monthlySpend: 0,
      lastBookingDate: new Date().toISOString().split("T")[0],
    };
    onSave(newComp);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            <h3 className="font-extrabold text-slate-900 text-lg">Add New Corporate Account</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="mb-1 block font-bold text-slate-700">Company Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Al Wasl Holding Group"
              className="h-9 w-full rounded-lg border border-slate-300 px-3 font-medium outline-none focus:border-blue-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-bold text-slate-700">Company Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. AWH-DXB"
                className="h-9 w-full rounded-lg border border-slate-300 px-3 font-mono font-bold outline-none uppercase"
              />
            </div>
            <div>
              <label className="mb-1 block font-bold text-slate-700">Industry</label>
              <input
                type="text"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="e.g. Investment / Real Estate"
                className="h-9 w-full rounded-lg border border-slate-300 px-3 font-medium outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block font-bold text-slate-700">Contact Person</label>
              <input
                type="text"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="e.g. Tariq Al Nuaimi"
                className="h-9 w-full rounded-lg border border-slate-300 px-3 font-medium outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block font-bold text-slate-700">Contact Phone</label>
              <PhoneInput
                value={phone}
                onChange={(e164) => setPhone(e164)}
              />
            </div>
            <div>
              <label className="mb-1 block font-bold text-slate-700">Billing Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="finance@company.ae"
                className="h-9 w-full rounded-lg border border-slate-300 px-3 font-medium outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block font-bold text-slate-700">Credit Limit (AED)</label>
              <input
                type="number"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-300 px-3 font-bold outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block font-bold text-slate-700">Payment Terms</label>
              <select
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-300 px-2 font-medium outline-none"
              >
                <option value="Net 15 Days">Net 15 Days</option>
                <option value="Net 30 Days">Net 30 Days</option>
                <option value="Net 45 Days">Net 45 Days</option>
                <option value="Prepaid">Prepaid</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block font-bold text-slate-700">Cost Center</label>
              <input
                type="text"
                value={costCenter}
                onChange={(e) => setCostCenter(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-300 px-3 font-mono font-bold outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 font-bold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-5 py-2 font-bold text-white shadow-sm hover:bg-blue-700"
            >
              Save Company
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// INLINE MODAL COMPONENT: ADD NEW EMPLOYEE
function AddEmployeeModal({
  companyId,
  companyName,
  onClose,
  onSave,
}: {
  companyId: string;
  companyName: string;
  onClose: () => void;
  onSave: (emp: Employee) => void;
}) {
  const [name, setName] = useState("");
  const [empId, setEmpId] = useState("");
  const [dept, setDept] = useState("Operations");
  const [designation, setDesignation] = useState("Manager");
  const [passportNumber, setPassportNumber] = useState("");
  const [passportExpiry, setPassportExpiry] = useState("2030-01-01");
  const [nationality, setNationality] = useState("United Arab Emirates");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("1990-01-01");
  const [gender, setGender] = useState("Male");
  const [visaDetails, setVisaDetails] = useState("UAE Resident Visa (Valid)");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (phone.trim()) {
      const parsed = parsePhoneNumber(phone);
      const val = validatePhoneNumber(parsed.country.iso, parsed.nationalNumber);
      if (!val.isValid) {
        alert(val.error || "Please enter a valid phone number according to country code.");
        return;
      }
    }
    const newEmp: Employee = {
      id: `emp-${Date.now()}`,
      companyId,
      name: name.trim(),
      employeeId: empId.trim() || `EMP-${Math.floor(1000 + Math.random() * 9000)}`,
      department: dept.trim() || "General",
      designation: designation.trim() || "Staff",
      passportNumber: passportNumber.trim() || "E9910291",
      passportExpiry,
      nationality: nationality.trim() || "United Arab Emirates",
      phone: phone.trim() || "+971500000000",
      email: email.trim() || `${name.toLowerCase().replace(/\s+/g, ".")}@corporate.ae`,
      dob,
      gender,
      visaDetails,
      previousFlights: [],
      previousHotels: [],
      previousVisas: [],
      upcomingTravel: [],
      outstandingPayments: 0,
    };
    onSave(newEmp);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-extrabold text-slate-900 text-lg">Add New Corporate Employee</h3>
            <p className="text-xs text-blue-600 font-bold">{companyName}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="mb-1 block font-bold text-slate-700">Full Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mohammed Al Hashmi"
              className="h-9 w-full rounded-lg border border-slate-300 px-3 font-medium outline-none focus:border-blue-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-bold text-slate-700">Employee ID</label>
              <input
                type="text"
                value={empId}
                onChange={(e) => setEmpId(e.target.value)}
                placeholder="e.g. EMP-9921"
                className="h-9 w-full rounded-lg border border-slate-300 px-3 font-mono font-bold outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block font-bold text-slate-700">Department</label>
              <input
                type="text"
                value={dept}
                onChange={(e) => setDept(e.target.value)}
                placeholder="e.g. Procurement / Executive"
                className="h-9 w-full rounded-lg border border-slate-300 px-3 font-medium outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-bold text-slate-700">Designation</label>
              <input
                type="text"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                placeholder="e.g. VP / Director"
                className="h-9 w-full rounded-lg border border-slate-300 px-3 font-medium outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block font-bold text-slate-700">Nationality</label>
              <input
                type="text"
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-300 px-3 font-medium outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-bold text-slate-700">Passport Number</label>
              <input
                type="text"
                value={passportNumber}
                onChange={(e) => setPassportNumber(e.target.value)}
                placeholder="e.g. E9918234"
                className="h-9 w-full rounded-lg border border-slate-300 px-3 font-mono font-bold outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block font-bold text-slate-700">Passport Expiry</label>
              <input
                type="date"
                value={passportExpiry}
                onChange={(e) => setPassportExpiry(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-300 px-3 font-medium outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-bold text-slate-700">Mobile Number</label>
              <PhoneInput
                value={phone}
                onChange={(e164) => setPhone(e164)}
              />
            </div>
            <div>
              <label className="mb-1 block font-bold text-slate-700">Corporate Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="employee@company.ae"
                className="h-9 w-full rounded-lg border border-slate-300 px-3 font-medium outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 font-bold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-5 py-2 font-bold text-white shadow-sm hover:bg-blue-700"
            >
              Save Employee
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// INLINE MODAL COMPONENT: ADD NEW CUSTOMER
function AddCustomerModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (cust: Customer) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [nationality, setNationality] = useState("India");
  const [passportNumber, setPassportNumber] = useState("");
  const [passportExpiry, setPassportExpiry] = useState("2030-01-01");
  const [dob, setDob] = useState("1992-01-01");
  const [gender, setGender] = useState("Male");
  const [paxCount, setPaxCount] = useState(1);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (phone.trim()) {
      const parsed = parsePhoneNumber(phone);
      const val = validatePhoneNumber(parsed.country.iso, parsed.nationalNumber);
      if (!val.isValid) {
        alert(val.error || "Please enter a valid phone number according to country code.");
        return;
      }
    }
    const newCust: Customer = {
      id: `cust-${Date.now()}`,
      name: name.trim(),
      phone: phone.trim() || "+971501234567",
      email: email.trim() || `${name.toLowerCase().replace(/\s+/g, ".")}@gmail.com`,
      nationality,
      passportNumber: passportNumber.trim() || "M8819201",
      passportExpiry,
      dob,
      gender,
      numberOfTravellers: paxCount,
    };
    onSave(newCust);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-extrabold text-slate-900 text-lg">Add New Individual Customer</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="mb-1 block font-bold text-slate-700">Full Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Priya Sharma"
              className="h-9 w-full rounded-lg border border-slate-300 px-3 font-medium outline-none focus:border-blue-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-bold text-slate-700">Phone / WhatsApp</label>
              <PhoneInput
                value={phone}
                onChange={(e164) => setPhone(e164)}
              />
            </div>
            <div>
              <label className="mb-1 block font-bold text-slate-700">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="customer@email.com"
                className="h-9 w-full rounded-lg border border-slate-300 px-3 font-medium outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-bold text-slate-700">Nationality</label>
              <input
                type="text"
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-300 px-3 font-medium outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block font-bold text-slate-700">Passport Number</label>
              <input
                type="text"
                value={passportNumber}
                onChange={(e) => setPassportNumber(e.target.value)}
                placeholder="e.g. M8819201"
                className="h-9 w-full rounded-lg border border-slate-300 px-3 font-mono font-bold outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 font-bold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-emerald-600 px-5 py-2 font-bold text-white shadow-sm hover:bg-emerald-700"
            >
              Save Customer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// INLINE MODAL COMPONENT: COMPANY PROFILE VIEW
function CompanyProfileModal({
  company,
  onClose,
  formatMoney,
}: {
  company: Company;
  onClose: () => void;
  formatMoney: (val: number) => string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-extrabold text-slate-900 text-lg">{company.name}</h3>
            <span className="font-mono text-xs font-bold text-blue-600">{company.code}</span>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3">
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400">Industry</span>
              <div className="font-bold text-slate-800">{company.industry}</div>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400">Contact Officer</span>
              <div className="font-bold text-slate-800">{company.contactPerson}</div>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400">Billing Email</span>
              <div className="font-medium text-slate-800">{company.email}</div>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400">Phone</span>
              <div className="font-medium text-slate-800">{formatPhoneDisplay(company.phone)}</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-slate-200 p-2.5">
              <span className="text-[10px] font-bold uppercase text-slate-400">Credit Limit</span>
              <div className="text-sm font-extrabold text-slate-900">{formatMoney(company.creditLimit)}</div>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-2.5">
              <span className="text-[10px] font-bold uppercase text-rose-500">Outstanding Due</span>
              <div className="text-sm font-extrabold text-rose-700">
                {formatMoney(company.outstandingBalance)}
              </div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-2.5">
              <span className="text-[10px] font-bold uppercase text-emerald-600">Monthly Volume</span>
              <div className="text-sm font-extrabold text-emerald-800">
                {formatMoney(company.monthlySpend)}
              </div>
            </div>
          </div>

          <div className="text-slate-500 text-[11px] leading-relaxed pt-2">
            Registered Address: {company.address}
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
          >
            Close Profile
          </button>
        </div>
      </div>
    </div>
  );
}