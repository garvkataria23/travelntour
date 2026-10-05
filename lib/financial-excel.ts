import * as XLSX from "xlsx";

export interface FinancialReportData {
  businessName?: string;
  currency: string;
  from?: string;
  to?: string;
  generatedAt?: string;
  stats: {
    totalBookings: number;
    revenue: number;
    manualIncome: number;
    totalIncome: number;
    ticketCost: number;
    directCost: number;
    operatingCost: number;
    grossProfit: number;
    netProfit: number;
    invoiced: number;
    collected: number;
    outstanding: number;
  };
  bookings: Array<{
    id: string;
    pnr: string;
    customerName: string;
    airline: string;
    flightNumber: string;
    fromAirport: string;
    toAirport: string;
    departureDate: string;
    status: string;
    source: string;
    amount: number;
    cost: number;
    currency: string;
    createdAt: string;
    paymentStatus?: string;
  }>;
  invoices: Array<{
    invoiceNumber: string;
    invoiceIssuedAt: string;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    pnr: string;
    airline: string;
    flightNumber: string;
    route: string;
    departureDate: string;
    currency: string;
    subtotal: number;
    discount: number;
    taxRate: number;
    taxAmount: number;
    total: number;
    paidAmount: number;
    due: number;
    paymentStatus: string;
  }>;
  expenses: Array<{
    id: string;
    category: "DIRECT" | "OPERATING" | string;
    title: string;
    amount: number;
    currency: string;
    payableTo?: string | null;
    description?: string | null;
    incurredOn: string;
  }>;
  income: Array<{
    id: string;
    category: string;
    title: string;
    amount: number;
    currency: string;
    reference?: string | null;
    note?: string | null;
    receivedOn: string;
  }>;
  customers?: Array<{
    id: string;
    name: string;
    phone: string;
    email?: string;
    bookingsCount: number;
    totalSpent: number;
    totalDue: number;
  }>;
}

function formatDate(val: string | Date | undefined): string {
  if (!val) return "—";
  try {
    if (typeof val === "string") {
      const match = val.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match) {
        const [, year, month, day] = match;
        const d = new Date(Number(year), Number(month) - 1, Number(day));
        return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      }
    }
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return String(val);
  }
}

/**
 * Generates an executive multi-tab Excel workbook (.xlsx) tailored for Travel & Tourism Agencies
 */
export function generateFinancialReportExcel(data: FinancialReportData): Blob {
  const wb = XLSX.utils.book_new();
  const curr = data.currency || "AED";
  const business = data.businessName || "FlyConnect Travel Agency";
  const period = data.from || data.to ? `${formatDate(data.from)} to ${formatDate(data.to)}` : "All Time Records";

  // ----------------------------------------------------
  // 1. Executive P&L & Financial Summary Sheet
  // ----------------------------------------------------
  const grossMarginPct =
    data.stats.totalIncome > 0
      ? Math.round((data.stats.grossProfit / data.stats.totalIncome) * 1000) / 10
      : 0;
  const netMarginPct =
    data.stats.totalIncome > 0
      ? Math.round((data.stats.netProfit / data.stats.totalIncome) * 1000) / 10
      : 0;
  const collectionRate =
    data.stats.invoiced > 0
      ? Math.round((data.stats.collected / data.stats.invoiced) * 1000) / 10
      : 0;
  const directSupplierCost = Math.max(0, data.stats.directCost - data.stats.ticketCost);

  const summarySheetData: Array<Array<string | number>> = [
    ["FLYCONNECT TRAVEL AGENCY - EXECUTIVE FINANCIAL STATEMENT"],
    ["Agency Name:", business],
    ["Reporting Period:", period],
    ["Base Currency:", curr],
    ["Statement Generated:", new Date().toLocaleString()],
    [],
    ["1. MANAGERIAL PROFIT & LOSS STATEMENT", ""],
    ["Line Item", `Amount (${curr})`, "% of Total Revenue"],
    ["Gross Ticket Revenue (Airfare & Bookings)", data.stats.revenue, "100%"],
    ["Ancillary & Other Revenue (Commissions, Visas, Tours)", data.stats.manualIncome, "-"],
    ["TOTAL GROSS REVENUE", data.stats.totalIncome, "100.0%"],
    ["Less: Ticket Net Cost (Aviation COGS)", -data.stats.ticketCost, "-"],
    ["Less: Direct Supplier Expenses (Hotels, Consolidators, Visas)", -directSupplierCost, "-"],
    ["TOTAL COST OF GOODS SOLD (DIRECT COGS)", -data.stats.directCost, "-"],
    ["GROSS PROFIT (GROSS MARGIN)", data.stats.grossProfit, `${grossMarginPct}%`],
    ["Less: Operating Overheads (Rent, Salaries, Software, Marketing)", -data.stats.operatingCost, "-"],
    ["NET PROFIT", data.stats.netProfit, `${netMarginPct}%`],
    [],
    ["2. RECEIVABLES & CASH FLOW SUMMARY", ""],
    ["Total Invoiced Amount (Gross Billing)", data.stats.invoiced],
    ["Total Cash Collected (Cleared)", data.stats.collected],
    ["Accounts Receivable (Outstanding Customer Due)", data.stats.outstanding],
    ["Collection Realization Rate", `${collectionRate}%`],
    [],
    ["3. OPERATIONAL METRICS", ""],
    ["Total Flight & Package Bookings", data.stats.totalBookings],
    ["Total Invoices Issued", data.invoices.length],
    ["Active Expense Records", data.expenses.length],
    ["Active Direct Revenue Records", data.income.length],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summarySheetData);
  wsSummary["!cols"] = [{ wch: 46 }, { wch: 22 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Financial P&L");

  // ----------------------------------------------------
  // 2. Invoices & Receivables Register Sheet
  // ----------------------------------------------------
  const invoiceHeaders = [
    "Invoice #",
    "Issued Date",
    "Customer Name",
    "Phone Number",
    "Email",
    "PNR",
    "Airline & Flight",
    "Sector / Route",
    "Travel Date",
    "Currency",
    "Subtotal",
    "Discount",
    "Tax Rate %",
    "Tax Amount",
    "Total Invoiced",
    "Amount Paid",
    "Balance Due",
    "Payment Status",
  ];

  let sumBilled = 0;
  let sumPaid = 0;
  let sumDue = 0;

  const invoiceRows = data.invoices.map((inv) => {
    sumBilled += inv.total || 0;
    sumPaid += inv.paidAmount || 0;
    sumDue += inv.due || 0;
    return [
      inv.invoiceNumber || "—",
      formatDate(inv.invoiceIssuedAt),
      inv.customerName || "—",
      inv.customerPhone || "—",
      inv.customerEmail || "",
      inv.pnr || "—",
      `${inv.airline || ""} ${inv.flightNumber || ""}`.trim() || "—",
      inv.route || "—",
      formatDate(inv.departureDate),
      inv.currency || curr,
      inv.subtotal,
      inv.discount,
      inv.taxRate || 0,
      inv.taxAmount,
      inv.total,
      inv.paidAmount,
      inv.due,
      inv.paymentStatus,
    ];
  });

  // Append Total Row
  if (invoiceRows.length > 0) {
    invoiceRows.push([
      "TOTAL",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      curr,
      "",
      "",
      "",
      "",
      sumBilled,
      sumPaid,
      sumDue,
      sumDue === 0 ? "FULLY COLLECTED" : "OUTSTANDING DUES",
    ]);
  }

  const wsInvoices = XLSX.utils.aoa_to_sheet([invoiceHeaders, ...invoiceRows]);
  wsInvoices["!cols"] = [
    { wch: 16 }, // Invoice #
    { wch: 14 }, // Date
    { wch: 22 }, // Customer
    { wch: 16 }, // Phone
    { wch: 22 }, // Email
    { wch: 12 }, // PNR
    { wch: 18 }, // Flight
    { wch: 24 }, // Route
    { wch: 14 }, // Departure Date
    { wch: 10 }, // Currency
    { wch: 13 }, // Subtotal
    { wch: 11 }, // Discount
    { wch: 11 }, // Tax %
    { wch: 13 }, // Tax Amt
    { wch: 15 }, // Total
    { wch: 14 }, // Paid
    { wch: 14 }, // Due
    { wch: 15 }, // Status
  ];
  XLSX.utils.book_append_sheet(wb, wsInvoices, "Invoices Register");

  // ----------------------------------------------------
  // 3. Bookings & Margin Analysis Sheet
  // ----------------------------------------------------
  const bookingHeaders = [
    "Booking ID",
    "PNR",
    "Booking Date",
    "Departure Date",
    "Customer Name",
    "Airline",
    "Flight #",
    "From",
    "To",
    "Status",
    "Source",
    `Selling Price (${curr})`,
    `Cost Price COGS (${curr})`,
    `Gross Margin (${curr})`,
    "Margin %",
    "Payment Status",
  ];

  let sumSale = 0;
  let sumCost = 0;

  const bookingRows = data.bookings.map((b) => {
    const sale = b.amount || 0;
    const cost = b.cost || 0;
    const margin = sale - cost;
    const marginPct = sale > 0 ? Math.round((margin / sale) * 1000) / 10 : 0;
    sumSale += sale;
    sumCost += cost;
    return [
      b.id,
      b.pnr,
      formatDate(b.createdAt),
      formatDate(b.departureDate),
      b.customerName || "—",
      b.airline || "—",
      b.flightNumber || "—",
      b.fromAirport || "—",
      b.toAirport || "—",
      b.status,
      b.source,
      sale,
      cost,
      margin,
      `${marginPct}%`,
      b.paymentStatus || "—",
    ];
  });

  if (bookingRows.length > 0) {
    const totalMargin = sumSale - sumCost;
    const totalMarginPct = sumSale > 0 ? Math.round((totalMargin / sumSale) * 1000) / 10 : 0;
    bookingRows.push([
      "TOTAL",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      sumSale,
      sumCost,
      totalMargin,
      `${totalMarginPct}%`,
      "",
    ]);
  }

  const wsBookings = XLSX.utils.aoa_to_sheet([bookingHeaders, ...bookingRows]);
  wsBookings["!cols"] = [
    { wch: 22 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 22 },
    { wch: 16 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 13 },
    { wch: 12 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 12 },
    { wch: 15 },
  ];
  XLSX.utils.book_append_sheet(wb, wsBookings, "Bookings & Margins");

  // ----------------------------------------------------
  // 4. Expenses Ledger (Direct COGS & Operating OPEX)
  // ----------------------------------------------------
  const expenseHeaders = [
    "Expense ID",
    "Incurred Date",
    "Category",
    "Title / Service",
    "Payable To / Vendor",
    "Currency",
    "Amount",
    "Description",
  ];

  let sumDirectExp = 0;
  let sumOpexExp = 0;

  const expenseRows = data.expenses.map((e) => {
    if (e.category === "DIRECT") sumDirectExp += e.amount || 0;
    else sumOpexExp += e.amount || 0;
    return [
      e.id,
      formatDate(e.incurredOn),
      e.category === "DIRECT" ? "DIRECT (COGS)" : "OPERATING (OPEX)",
      e.title,
      e.payableTo || "—",
      e.currency || curr,
      e.amount,
      e.description || "",
    ];
  });

  if (expenseRows.length > 0) {
    expenseRows.push([
      "TOTAL DIRECT COGS",
      "",
      "DIRECT (COGS)",
      "",
      "",
      curr,
      sumDirectExp,
      "",
    ]);
    expenseRows.push([
      "TOTAL OPERATING OPEX",
      "",
      "OPERATING (OPEX)",
      "",
      "",
      curr,
      sumOpexExp,
      "",
    ]);
    expenseRows.push([
      "GRAND TOTAL EXPENSES",
      "",
      "",
      "",
      "",
      curr,
      sumDirectExp + sumOpexExp,
      "",
    ]);
  }

  const wsExpenses = XLSX.utils.aoa_to_sheet([expenseHeaders, ...expenseRows]);
  wsExpenses["!cols"] = [
    { wch: 22 },
    { wch: 14 },
    { wch: 18 },
    { wch: 26 },
    { wch: 22 },
    { wch: 10 },
    { wch: 15 },
    { wch: 28 },
  ];
  XLSX.utils.book_append_sheet(wb, wsExpenses, "Expenses Ledger");

  // ----------------------------------------------------
  // 5. Ancillary & Other Incomes
  // ----------------------------------------------------
  const incomeHeaders = [
    "Income ID",
    "Received Date",
    "Category",
    "Title / Revenue Head",
    "Reference #",
    "Currency",
    "Amount",
    "Notes",
  ];

  let sumIncome = 0;
  const incomeRows = data.income.map((inc) => {
    sumIncome += inc.amount || 0;
    return [
      inc.id,
      formatDate(inc.receivedOn),
      inc.category,
      inc.title,
      inc.reference || "—",
      inc.currency || curr,
      inc.amount,
      inc.note || "",
    ];
  });

  if (incomeRows.length > 0) {
    incomeRows.push(["TOTAL ANCILLARY INCOME", "", "", "", "", curr, sumIncome, ""]);
  }

  const wsIncome = XLSX.utils.aoa_to_sheet([incomeHeaders, ...incomeRows]);
  wsIncome["!cols"] = [
    { wch: 22 },
    { wch: 14 },
    { wch: 16 },
    { wch: 26 },
    { wch: 18 },
    { wch: 10 },
    { wch: 15 },
    { wch: 26 },
  ];
  XLSX.utils.book_append_sheet(wb, wsIncome, "Ancillary Incomes");

  // ----------------------------------------------------
  // 6. Customer Accounts Ledger
  // ----------------------------------------------------
  if (data.customers && data.customers.length > 0) {
    const custHeaders = [
      "Customer ID",
      "Customer Name",
      "Phone",
      "Email",
      "Lifetime Bookings",
      `Total Spent (${curr})`,
      `Outstanding Balance (${curr})`,
      "Account Status",
    ];
    const custRows = data.customers.map((c) => [
      c.id,
      c.name,
      c.phone,
      c.email || "—",
      c.bookingsCount,
      c.totalSpent,
      c.totalDue,
      c.totalDue > 0 ? "OUTSTANDING DUE" : "CLEARED",
    ]);

    const wsCust = XLSX.utils.aoa_to_sheet([custHeaders, ...custRows]);
    wsCust["!cols"] = [
      { wch: 22 },
      { wch: 24 },
      { wch: 18 },
      { wch: 26 },
      { wch: 18 },
      { wch: 18 },
      { wch: 22 },
      { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, wsCust, "Customer Directory");
  }

  const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([excelBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/**
 * Generates an accountant-grade Excel register (.xlsx) specifically for the Invoices List page
 */
export function generateInvoicesRegisterExcel(
  invoices: Array<{
    invoiceNumber?: string | null;
    invoiceIssuedAt?: string | null;
    customerName?: string | null;
    customerPhone?: string | null;
    pnr: string;
    airline?: string | null;
    flightNumber?: string | null;
    fromCity?: string | null;
    toCity?: string | null;
    departureDate: string;
    departureTime?: string | null;
    currency: string;
    subtotal: number;
    discount?: number | null;
    taxAmount?: number | null;
    total: number;
    paidAmount: number;
    due: number;
    paymentStatus: string;
  }>,
  currency = "AED",
  businessName = "FlyConnect Travel Agency",
): Blob {
  const wb = XLSX.utils.book_new();

  const headers = [
    "Invoice #",
    "Issued Date",
    "Customer Name",
    "Phone",
    "PNR",
    "Flight",
    "Sector / Route",
    "Departure Date",
    "Departure Time",
    "Currency",
    "Subtotal",
    "Discount",
    "Tax Amount",
    "Total Invoiced",
    "Amount Paid",
    "Balance Due",
    "Payment Status",
  ];

  let sumTotal = 0;
  let sumPaid = 0;
  let sumDue = 0;

  const rows = invoices.map((inv) => {
    sumTotal += inv.total || 0;
    sumPaid += inv.paidAmount || 0;
    sumDue += inv.due || 0;
    return [
      inv.invoiceNumber || "—",
      formatDate(inv.invoiceIssuedAt || undefined),
      inv.customerName || "—",
      inv.customerPhone || "—",
      inv.pnr || "—",
      `${inv.airline || ""} ${inv.flightNumber || ""}`.trim() || "—",
      `${inv.fromCity || "—"} → ${inv.toCity || "—"}`,
      formatDate(inv.departureDate),
      inv.departureTime || "—",
      inv.currency || currency,
      inv.subtotal || 0,
      inv.discount || 0,
      inv.taxAmount || 0,
      inv.total || 0,
      inv.paidAmount || 0,
      inv.due || 0,
      inv.paymentStatus || "UNPAID",
    ];
  });

  if (rows.length > 0) {
    rows.push([
      "TOTAL",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      currency,
      "",
      "",
      "",
      sumTotal,
      sumPaid,
      sumDue,
      sumDue === 0 ? "FULLY SETTLED" : "OUTSTANDING BALANCE",
    ]);
  }

  const sheetData = [
    [`${businessName.toUpperCase()} - INVOICES & RECEIVABLES REGISTER`],
    [`Exported on: ${new Date().toLocaleString()}`],
    [],
    headers,
    ...rows,
  ];

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws["!cols"] = [
    { wch: 16 },
    { wch: 14 },
    { wch: 22 },
    { wch: 16 },
    { wch: 12 },
    { wch: 16 },
    { wch: 24 },
    { wch: 14 },
    { wch: 14 },
    { wch: 10 },
    { wch: 13 },
    { wch: 11 },
    { wch: 12 },
    { wch: 15 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Invoices Register");

  const buffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
