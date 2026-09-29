import * as XLSX from "xlsx";

export interface BusinessBackupPayload {
  version: string;
  exportedAt: string;
  businessId: string;
  stats: {
    customers: number;
    bookings: number;
    invoices: number;
    expenses: number;
    income: number;
  };
  data: {
    customers: Array<Record<string, unknown>>;
    bookings: Array<Record<string, unknown>>;
    invoices: Array<Record<string, unknown>>;
    expenses: Array<Record<string, unknown>>;
    income: Array<Record<string, unknown>>;
  };
}

/**
 * Safely format Firestore timestamps or dates into ISO strings
 */
function formatTimestamp(val: unknown): string {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "object" && val !== null) {
    const obj = val as Record<string, unknown>;
    if (typeof obj.toDate === "function") {
      try {
        return (obj.toDate as () => Date)().toISOString();
      } catch {
        // ignore
      }
    }
    if (typeof obj.seconds === "number") {
      return new Date(obj.seconds * 1000).toISOString();
    }
  }
  return String(val);
}

/**
 * Generate a multi-sheet Microsoft Excel (.xlsx) Blob from agency backup data
 */
export function generateExcelBackup(backupData: BusinessBackupPayload): Blob {
  const wb = XLSX.utils.book_new();

  // 1. Summary Sheet
  const summaryRows = [
    { Property: "FlyConnect Agency Backup", Value: "System Summary" },
    { Property: "Business Tenant ID", Value: backupData.businessId || "N/A" },
    { Property: "Export Timestamp", Value: backupData.exportedAt || new Date().toISOString() },
    { Property: "Total Customers", Value: backupData.stats?.customers ?? backupData.data.customers.length },
    { Property: "Total Bookings", Value: backupData.stats?.bookings ?? backupData.data.bookings.length },
    { Property: "Total Invoices", Value: backupData.stats?.invoices ?? backupData.data.invoices.length },
    { Property: "Total Income Records", Value: backupData.stats?.income ?? backupData.data.income.length },
    { Property: "Total Expense Records", Value: backupData.stats?.expenses ?? backupData.data.expenses.length },
    { Property: "Backup File Version", Value: backupData.version || "1.0" },
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  wsSummary["!cols"] = [{ wch: 26 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  // 2. Bookings Sheet
  const bookingRows = backupData.data.bookings.map((b) => ({
    "Booking ID": b.id || "",
    "PNR": b.pnr || "",
    "Customer Name": b.customerName || "",
    "Customer ID": b.customerId || "",
    "Airline": b.airline || "",
    "Flight Number": b.flightNumber || "",
    "From Airport": b.fromAirport || "",
    "To Airport": b.toAirport || "",
    "Departure Date": b.departureDate || "",
    "Departure Time": b.departureTime || "",
    "Status": b.status || "",
    "Amount (Selling)": b.amount ?? 0,
    "Cost (COGS)": b.cost ?? 0,
    "Gross Margin": Number(b.amount ?? 0) - Number(b.cost ?? 0),
    "Currency": b.currency || "AED",
    "Created Date": formatTimestamp(b.createdAt),
    "Updated Date": formatTimestamp(b.updatedAt),
  }));
  const wsBookings = XLSX.utils.json_to_sheet(bookingRows.length ? bookingRows : [{ "Status": "No bookings recorded" }]);
  wsBookings["!cols"] = [
    { wch: 22 }, // Booking ID
    { wch: 10 }, // PNR
    { wch: 24 }, // Customer Name
    { wch: 20 }, // Customer ID
    { wch: 18 }, // Airline
    { wch: 14 }, // Flight Number
    { wch: 14 }, // From
    { wch: 14 }, // To
    { wch: 16 }, // Dep Date
    { wch: 16 }, // Dep Time
    { wch: 14 }, // Status
    { wch: 16 }, // Amount
    { wch: 14 }, // Cost
    { wch: 14 }, // Gross Margin
    { wch: 10 }, // Currency
    { wch: 24 }, // Created Date
    { wch: 24 }, // Updated Date
  ];
  XLSX.utils.book_append_sheet(wb, wsBookings, "Bookings");

  // 3. Customers Sheet
  const customerRows = backupData.data.customers.map((c) => ({
    "Customer ID": c.id || "",
    "Name": c.name || "",
    "Phone": c.phone || "",
    "Email": c.email || "",
    "Status": c.status || "ACTIVE",
    "Created Date": formatTimestamp(c.createdAt),
    "Updated Date": formatTimestamp(c.updatedAt),
  }));
  const wsCustomers = XLSX.utils.json_to_sheet(customerRows.length ? customerRows : [{ "Status": "No customers recorded" }]);
  wsCustomers["!cols"] = [
    { wch: 22 },
    { wch: 24 },
    { wch: 18 },
    { wch: 28 },
    { wch: 14 },
    { wch: 24 },
    { wch: 24 },
  ];
  XLSX.utils.book_append_sheet(wb, wsCustomers, "Customers");

  // 4. Invoices Sheet
  const invoiceRows = backupData.data.invoices.map((inv) => {
    const total = Number(inv.total ?? inv.amount ?? 0);
    const paid = Number(inv.paidAmount ?? (inv.paymentStatus === "PAID" ? total : 0));
    const due = Math.max(0, total - paid);
    return {
      "Invoice #": inv.invoiceNumber || inv.id || "",
      "Customer": inv.customerName || "",
      "Phone": inv.customerPhone || "",
      "PNR": inv.pnr || "",
      "Route": inv.fromCity && inv.toCity ? `${inv.fromCity} → ${inv.toCity}` : "",
      "Issued Date": formatTimestamp(inv.invoiceIssuedAt || inv.createdAt),
      "Currency": inv.currency || "AED",
      "Subtotal": Number(inv.subtotal ?? total),
      "Discount": Number(inv.discount ?? 0),
      "Tax Amount": Number(inv.taxAmount ?? 0),
      "Total Amount": total,
      "Paid Amount": paid,
      "Amount Due": due,
      "Payment Status": inv.paymentStatus || (due === 0 && total > 0 ? "PAID" : "UNPAID"),
      "Booking ID": inv.bookingId || inv.id || "",
    };
  });
  const wsInvoices = XLSX.utils.json_to_sheet(invoiceRows.length ? invoiceRows : [{ "Status": "No invoices recorded" }]);
  wsInvoices["!cols"] = [
    { wch: 18 }, // Invoice #
    { wch: 22 }, // Customer
    { wch: 16 }, // Phone
    { wch: 12 }, // PNR
    { wch: 20 }, // Route
    { wch: 20 }, // Issued Date
    { wch: 10 }, // Currency
    { wch: 14 }, // Subtotal
    { wch: 12 }, // Discount
    { wch: 12 }, // Tax Amount
    { wch: 14 }, // Total Amount
    { wch: 14 }, // Paid Amount
    { wch: 14 }, // Amount Due
    { wch: 16 }, // Payment Status
    { wch: 24 }, // Booking ID
  ];
  XLSX.utils.book_append_sheet(wb, wsInvoices, "Invoices");

  // 5. Income Sheet
  const incomeRows = backupData.data.income.map((inc) => ({
    "Income ID": inc.id || "",
    "Title / Description": inc.title || "",
    "Category": inc.category || "OTHER",
    "Amount": inc.amount ?? 0,
    "Currency": inc.currency || "AED",
    "Reference": inc.reference || "",
    "Note": inc.note || "",
    "Date Received": formatTimestamp(inc.receivedOn || inc.date || inc.createdAt),
  }));
  const wsIncome = XLSX.utils.json_to_sheet(incomeRows.length ? incomeRows : [{ "Status": "No income recorded" }]);
  wsIncome["!cols"] = [
    { wch: 22 },
    { wch: 28 },
    { wch: 16 },
    { wch: 14 },
    { wch: 10 },
    { wch: 18 },
    { wch: 26 },
    { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, wsIncome, "Income");

  // 6. Expenses Sheet
  const expenseRows = backupData.data.expenses.map((exp) => ({
    "Expense ID": exp.id || "",
    "Title / Description": exp.title || "",
    "Category": exp.category || "OPERATING",
    "Amount": exp.amount ?? 0,
    "Currency": exp.currency || "AED",
    "Payable To": exp.payableTo || "",
    "Description": exp.description || "",
    "Date Incurred": formatTimestamp(exp.incurredOn || exp.date || exp.createdAt),
  }));
  const wsExpenses = XLSX.utils.json_to_sheet(expenseRows.length ? expenseRows : [{ "Status": "No expenses recorded" }]);
  wsExpenses["!cols"] = [
    { wch: 22 },
    { wch: 28 },
    { wch: 16 },
    { wch: 14 },
    { wch: 10 },
    { wch: 20 },
    { wch: 26 },
    { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, wsExpenses, "Expenses");

  // Generate binary XLSX buffer
  const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([excelBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/**
 * Triggers a browser download of a given blob
 */
export function triggerFileDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
