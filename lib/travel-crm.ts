/**
 * Blue Aura Tours & Travels - Corporate & Travel CRM Core Data Engine
 * "Luxury & Budget Travel | Flights | Hotels | Visa | Honeymoon | Group Tours"
 */

export type BookingType = "CORPORATE" | "INDIVIDUAL";

export type ServiceCategory =
  | "FLIGHT"
  | "HOTEL"
  | "VISA"
  | "FLIGHT_HOTEL"
  | "FLIGHT_VISA"
  | "HOTEL_VISA"
  | "FLIGHT_HOTEL_VISA"
  | "HOLIDAY_PACKAGE"
  | "HONEYMOON_PACKAGE"
  | "GROUP_TOUR"
  | "AIRPORT_TRANSFER"
  | "TRAVEL_INSURANCE"
  | "MICE"
  | "OTHER";

export interface Company {
  id: string;
  name: string;
  code: string;
  industry: string;
  address: string;
  contactPerson: string;
  email: string;
  phone: string;
  creditLimit: number;
  outstandingBalance: number;
  paymentTerms: string;
  defaultCostCenter: string;
  totalBookings: number;
  activeEmployees: number;
  monthlySpend: number;
  lastBookingDate: string;
  branchId?: string;
  branchName?: string;
  status?: "ACTIVE" | "INACTIVE";
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  city: string;
  country: string;
  address: string;
  managerName: string;
  managerEmail: string;
  phone: string;
  status: "ACTIVE" | "INACTIVE";
  notes?: string;
}

export interface EmployeeTravelHistory {
  previousFlights: Array<{ route: string; airline: string; date: string; pnr: string; flightNo: string }>;
  previousHotels: Array<{ name: string; destination: string; date: string; nights: number }>;
  previousVisas: Array<{ country: string; visaType: string; status: string; expiry: string; refNo: string }>;
  upcomingTravel: Array<{ service: string; route: string; date: string; ref: string }>;
  outstandingPayments: number;
}

export interface Employee extends EmployeeTravelHistory {
  id: string;
  companyId: string;
  name: string;
  email: string;
  phone: string;
  employeeId: string;
  department: string;
  designation: string;
  passportNumber: string;
  passportExpiry: string;
  nationality: string;
  dob: string;
  gender: string;
  visaDetails?: string;
  storedDocuments?: Array<{ type: string; name: string; url?: string; issueDate?: string }>;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  nationality: string;
  passportNumber: string;
  dob: string;
  gender: string;
  passportExpiry: string;
  numberOfTravellers: number;
}

export interface FlightSegment {
  id: string;
  from: string;
  to: string;
  date: string;
  departureTime: string;
  arrivalTime: string;
  airline: string;
  flightNumber: string;
  pnr: string;
  cost: number;
  sellingPrice: number;
}

export interface HotelStay {
  id: string;
  destination: string;
  hotelName: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  adults: number;
  children: number;
  roomType: string;
  mealPlan: string;
  confirmationNumber: string;
  supplier: string;
  cost: number;
  sellingPrice: number;
  cancellationPolicy?: string;
}

export interface TravelCrmRecord {
  id: string;
  bookingRef: string;
  bookingFor: BookingType;
  companyId?: string;
  companyName?: string;
  employeeId?: string;
  employeeName?: string;
  customerId?: string;
  customerName?: string;
  serviceCategory: ServiceCategory;
  travelDate: string;
  destination: string;
  totalSelling: number;
  totalCost: number;
  serviceFee: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  netProfit: number;
  paidAmount: number;
  balanceDue: number;
  paymentStatus: string;
  bookingStatus: string;
  notes?: string;
  createdAt: string;
}

export const INITIAL_BRANCHES: Branch[] = [
  {
    id: "branch-dxb",
    name: "Dubai Flagship Headquarters",
    code: "DXB-HQ",
    city: "Dubai",
    country: "United Arab Emirates",
    address: "Level 14, Rolex Tower, Sheikh Zayed Road, Trade Centre 1, Dubai",
    managerName: "Garv Kataria (Owner)",
    managerEmail: "admin@blueauratravel.com",
    phone: "+971 50 123 4567",
    status: "ACTIVE",
    notes: "Main operating headquarters managing GCC corporate accounts, flight ticketing, and luxury VIP itineraries.",
  },
  {
    id: "branch-bom",
    name: "Mumbai Corporate Operations Hub",
    code: "BOM-CORP",
    city: "Mumbai",
    country: "India",
    address: "One BKC, 7th Floor, Bandra Kurla Complex, Mumbai, Maharashtra 400051",
    managerName: "Rahul Sharma (Branch VP)",
    managerEmail: "mumbai.ops@blueauratravel.com",
    phone: "+91 98111 22334",
    status: "ACTIVE",
    notes: "Handles corporate accounts, Indian MNC travel desks, flights, group conferences, and international visas.",
  },
  {
    id: "branch-del",
    name: "Delhi NCR Northern Operations",
    code: "DEL-NORTH",
    city: "New Delhi",
    country: "India",
    address: "Statesman House, Barakhamba Road, Connaught Place, New Delhi 110001",
    managerName: "Priya Verma (Regional Lead)",
    managerEmail: "delhi.desk@blueauratravel.com",
    phone: "+91 98222 33445",
    status: "ACTIVE",
    notes: "North India corporate delegations, Embassy visa submissions, and MICE logistics.",
  },
];

export const INITIAL_COMPANIES: Company[] = [
  {
    id: "comp-1",
    name: "Apex Global Logistics LLC",
    code: "AGL-DXB",
    industry: "Logistics & Freight Forwarding",
    address: "DAFZA Building 4W, Office 302, Dubai Airport Freezone, UAE",
    contactPerson: "Tariq Al Hashemi",
    email: "billing@apexlogistics.ae",
    phone: "+971 4 299 1200",
    creditLimit: 150000,
    outstandingBalance: 18450,
    paymentTerms: "Net 30 Days",
    defaultCostCenter: "CC-LOG-01",
    totalBookings: 42,
    activeEmployees: 35,
    monthlySpend: 64200,
    lastBookingDate: "2026-09-24",
    branchId: "branch-dxb",
    branchName: "Dubai Flagship Headquarters",
    status: "ACTIVE",
  },
  {
    id: "comp-2",
    name: "Al Mansoor Trading & Contracting Co.",
    code: "MTC-UAE",
    industry: "Engineering & MEP Construction",
    address: "Churchill Tower 18th Floor, Business Bay, Dubai, UAE",
    contactPerson: "Mansoor Al Falasi",
    email: "travel@almansoor.ae",
    phone: "+971 4 338 5600",
    creditLimit: 200000,
    outstandingBalance: 32900,
    paymentTerms: "Net 45 Days",
    defaultCostCenter: "CC-ENG-04",
    totalBookings: 68,
    activeEmployees: 52,
    monthlySpend: 89500,
    lastBookingDate: "2026-09-28",
    branchId: "branch-dxb",
    branchName: "Dubai Flagship Headquarters",
    status: "ACTIVE",
  },
  {
    id: "comp-3",
    name: "Horizon Technologies FZ-LLC",
    code: "HTECH-DIFC",
    industry: "Cloud Infrastructure & FinTech",
    address: "DIFC Gate Precinct 4, Level 5, Dubai, UAE",
    contactPerson: "Sarah Jenkins",
    email: "procurement@horizontech.ae",
    phone: "+971 4 401 9800",
    creditLimit: 120000,
    outstandingBalance: 7800,
    paymentTerms: "Net 15 Days",
    defaultCostCenter: "CC-TECH-09",
    totalBookings: 31,
    activeEmployees: 28,
    monthlySpend: 47600,
    lastBookingDate: "2026-09-29",
    branchId: "branch-dxb",
    branchName: "Dubai Flagship Headquarters",
    status: "ACTIVE",
  },
  {
    id: "comp-4",
    name: "Crestline Energy Middle East",
    code: "CEME-AUH",
    industry: "Energy Solutions & Offshore Services",
    address: "Al Sila Tower, Level 21, Abu Dhabi Global Market Square, UAE",
    contactPerson: "Khalid Al Suwaidi",
    email: "corporate.travel@crestline.ae",
    phone: "+971 2 612 8800",
    creditLimit: 350000,
    outstandingBalance: 46200,
    paymentTerms: "Net 30 Days",
    defaultCostCenter: "CC-OPS-02",
    totalBookings: 84,
    activeEmployees: 64,
    monthlySpend: 118400,
    lastBookingDate: "2026-09-27",
    branchId: "branch-dxb",
    branchName: "Dubai Flagship Headquarters",
    status: "ACTIVE",
  },
  {
    id: "comp-5",
    name: "Elysian Hospitality & Real Estate",
    code: "ELYS-DXB",
    industry: "Luxury Hotels & Prime Real Estate",
    address: "Golden Mile Galleria Building 2, Palm Jumeirah, Dubai, UAE",
    contactPerson: "Elena Rostova",
    email: "accounts@elysianproperties.ae",
    phone: "+971 4 582 3100",
    creditLimit: 250000,
    outstandingBalance: 24800,
    paymentTerms: "Net 30 Days",
    defaultCostCenter: "CC-RES-07",
    totalBookings: 56,
    activeEmployees: 41,
    monthlySpend: 79200,
    lastBookingDate: "2026-09-26",
    branchId: "branch-dxb",
    branchName: "Dubai Flagship Headquarters",
    status: "ACTIVE",
  },
  {
    id: "comp-6",
    name: "Vanguard Financial Services Ltd",
    code: "VFS-DIFC",
    industry: "Private Equity & Wealth Management",
    address: "Index Tower, Suite 1402, DIFC, Dubai, UAE",
    contactPerson: "David Sterling",
    email: "operations@vanguardfs.ae",
    phone: "+971 4 428 7700",
    creditLimit: 300000,
    outstandingBalance: 12500,
    paymentTerms: "Net 30 Days",
    defaultCostCenter: "CC-FIN-03",
    totalBookings: 39,
    activeEmployees: 24,
    monthlySpend: 92300,
    lastBookingDate: "2026-09-25",
    branchId: "branch-dxb",
    branchName: "Dubai Flagship Headquarters",
    status: "ACTIVE",
  },
  {
    id: "comp-7",
    name: "Tata Consultancy Services - Global Travel Desk",
    code: "TCS-MUM",
    industry: "IT Services & Consulting",
    address: "TCS Banyan Park, Andheri East, Mumbai, Maharashtra 400069",
    contactPerson: "Amitabh Sen",
    email: "travel.admin@tcs.com",
    phone: "+91 22 6778 9999",
    creditLimit: 500000,
    outstandingBalance: 42000,
    paymentTerms: "Net 30 Days",
    defaultCostCenter: "CC-TCS-01",
    totalBookings: 112,
    activeEmployees: 140,
    monthlySpend: 185000,
    lastBookingDate: "2026-09-30",
    branchId: "branch-bom",
    branchName: "Mumbai Corporate Operations Hub",
    status: "ACTIVE",
  },
  {
    id: "comp-8",
    name: "Reliance Retail & Enterprise Ventures",
    code: "RIL-BOM",
    industry: "Conglomerate & Retail",
    address: "Reliance Corporate Park, Ghansoli, Navi Mumbai 400701",
    contactPerson: "Kavita Deshmukh",
    email: "corporate.desk@ril.com",
    phone: "+91 22 4477 0000",
    creditLimit: 750000,
    outstandingBalance: 68400,
    paymentTerms: "Net 45 Days",
    defaultCostCenter: "CC-RIL-09",
    totalBookings: 89,
    activeEmployees: 95,
    monthlySpend: 142000,
    lastBookingDate: "2026-09-29",
    branchId: "branch-bom",
    branchName: "Mumbai Corporate Operations Hub",
    status: "ACTIVE",
  },
  {
    id: "comp-9",
    name: "Mahindra Luxury Leisure & MICE",
    code: "MM-MUM",
    industry: "Automotive & Hospitality",
    address: "Mahindra Towers, Dr. G. M. Bhosale Marg, Worli, Mumbai 400018",
    contactPerson: "Siddharth Rao",
    email: "travel@mahindra.com",
    phone: "+91 22 2490 1441",
    creditLimit: 300000,
    outstandingBalance: 21500,
    paymentTerms: "Net 30 Days",
    defaultCostCenter: "CC-MM-03",
    totalBookings: 54,
    activeEmployees: 48,
    monthlySpend: 88000,
    lastBookingDate: "2026-09-27",
    branchId: "branch-bom",
    branchName: "Mumbai Corporate Operations Hub",
    status: "ACTIVE",
  },
  {
    id: "comp-10",
    name: "Bharti Airtel Enterprise Mobility",
    code: "AIRTEL-DEL",
    industry: "Telecommunications & Cloud",
    address: "Airtel Centre, Plot 16, Udyog Vihar Phase IV, Gurugram, NCR",
    contactPerson: "Vikas Malhotra",
    email: "enterprise.travel@airtel.com",
    phone: "+91 124 422 2222",
    creditLimit: 400000,
    outstandingBalance: 31000,
    paymentTerms: "Net 30 Days",
    defaultCostCenter: "CC-AIR-02",
    totalBookings: 76,
    activeEmployees: 82,
    monthlySpend: 114000,
    lastBookingDate: "2026-09-28",
    branchId: "branch-del",
    branchName: "Delhi NCR Northern Operations",
    status: "ACTIVE",
  },
  {
    id: "comp-11",
    name: "Zomato & Blinkit Executive Travel",
    code: "ZOM-NCR",
    industry: "Quick Commerce & FoodTech",
    address: "Ground Floor, Tower E, Pioneer Square, Sector 62, Gurugram 122098",
    contactPerson: "Ananya Kapoor",
    email: "traveldesk@zomato.com",
    phone: "+91 124 678 9000",
    creditLimit: 250000,
    outstandingBalance: 15800,
    paymentTerms: "Net 15 Days",
    defaultCostCenter: "CC-ZOM-05",
    totalBookings: 63,
    activeEmployees: 60,
    monthlySpend: 92000,
    lastBookingDate: "2026-09-29",
    branchId: "branch-del",
    branchName: "Delhi NCR Northern Operations",
    status: "ACTIVE",
  },
];

export const INITIAL_EMPLOYEES: Employee[] = [
  // Apex Global Logistics
  {
    id: "emp-101",
    companyId: "comp-1",
    name: "Tariq Al Hashemi",
    email: "tariq.hashemi@apexlogistics.ae",
    phone: "+971 50 182 9921",
    employeeId: "AGL-0012",
    department: "Executive Management",
    designation: "VP Operations",
    passportNumber: "E9918234",
    passportExpiry: "2031-01-10",
    nationality: "United Arab Emirates",
    dob: "1984-06-15",
    gender: "Male",
    visaDetails: "UAE National (No Visa Required for GCC/EU)",
    previousFlights: [
      { route: "DXB → LHR", airline: "Emirates", flightNo: "EK-001", date: "2026-08-12", pnr: "AGL77A" },
      { route: "LHR → DXB", airline: "Emirates", flightNo: "EK-004", date: "2026-08-18", pnr: "AGL77B" },
      { route: "DXB → SIN", airline: "Singapore Airlines", flightNo: "SQ-495", date: "2026-06-04", pnr: "SQ881P" },
    ],
    previousHotels: [
      { name: "The Langham London", destination: "London, UK", date: "2026-08-12", nights: 6 },
      { name: "Marina Bay Sands", destination: "Singapore", date: "2026-06-04", nights: 4 },
    ],
    previousVisas: [
      { country: "United Kingdom", visaType: "Business / Standard Visitor", status: "Approved", expiry: "2028-08-01", refNo: "UK-VIS-99120" },
    ],
    upcomingTravel: [
      { service: "Flight", route: "DXB → FRA (Frankfurt)", date: "2026-10-15", ref: "BAT-2026-9012" },
    ],
    outstandingPayments: 0,
  },
  {
    id: "emp-102",
    companyId: "comp-1",
    name: "Farhan Akhtar",
    email: "farhan.akhtar@apexlogistics.ae",
    phone: "+971 55 423 8812",
    employeeId: "AGL-0048",
    department: "Supply Chain",
    designation: "Fleet Logistics Lead",
    passportNumber: "PK7718293",
    passportExpiry: "2027-09-14",
    nationality: "Pakistan",
    dob: "1990-11-20",
    gender: "Male",
    visaDetails: "UAE Resident Visa (Valid 2028-02-15)",
    previousFlights: [
      { route: "DXB → KHI", airline: "FlyDubai", flightNo: "FZ-331", date: "2026-07-10", pnr: "FZ991K" },
      { route: "DXB → JED", airline: "Saudia", flightNo: "SV-582", date: "2026-05-19", pnr: "SV441T" },
    ],
    previousHotels: [
      { name: "Jeddah Hilton", destination: "Jeddah, Saudi Arabia", date: "2026-05-19", nights: 3 },
    ],
    previousVisas: [
      { country: "Saudi Arabia", visaType: "Commercial Visit Visa", status: "Approved", expiry: "2027-05-10", refNo: "KSA-B2B-3810" },
    ],
    upcomingTravel: [],
    outstandingPayments: 0,
  },
  {
    id: "emp-103",
    companyId: "comp-1",
    name: "Maria Santos",
    email: "maria.santos@apexlogistics.ae",
    phone: "+971 52 761 0039",
    employeeId: "AGL-0083",
    department: "Customs Clearance",
    designation: "Compliance Specialist",
    passportNumber: "P8829104",
    passportExpiry: "2028-03-22",
    nationality: "Philippines",
    dob: "1993-04-08",
    gender: "Female",
    visaDetails: "UAE Employment Residence (Valid 2027-11-01)",
    previousFlights: [
      { route: "DXB → MNL", airline: "Emirates", flightNo: "EK-332", date: "2026-04-14", pnr: "EKMNL8" },
    ],
    previousHotels: [],
    previousVisas: [],
    upcomingTravel: [],
    outstandingPayments: 0,
  },

  // Al Mansoor Trading & Contracting
  {
    id: "emp-201",
    companyId: "comp-2",
    name: "Mansoor Al Falasi",
    email: "mansoor@almansoor.ae",
    phone: "+971 50 445 2201",
    employeeId: "MTC-0001",
    department: "Board of Directors",
    designation: "Managing Director",
    passportNumber: "E8102947",
    passportExpiry: "2032-04-19",
    nationality: "United Arab Emirates",
    dob: "1978-02-12",
    gender: "Male",
    visaDetails: "UAE Citizen",
    previousFlights: [
      { route: "DXB → CDG (Paris)", airline: "Emirates", flightNo: "EK-073", date: "2026-07-20", pnr: "PAR88M" },
      { route: "CDG → DXB", airline: "Emirates", flightNo: "EK-076", date: "2026-07-28", pnr: "PAR88N" },
    ],
    previousHotels: [
      { name: "Four Seasons Hotel George V", destination: "Paris, France", date: "2026-07-20", nights: 8 },
    ],
    previousVisas: [],
    upcomingTravel: [
      { service: "Flight + Hotel", route: "DXB → IST (Istanbul)", date: "2026-10-22", ref: "BAT-2026-7811" },
    ],
    outstandingPayments: 0,
  },
  {
    id: "emp-202",
    companyId: "comp-2",
    name: "Suresh Pillai",
    email: "suresh.p@almansoor.ae",
    phone: "+971 56 319 8847",
    employeeId: "MTC-0045",
    department: "Civil Engineering",
    designation: "Senior Project Director",
    passportNumber: "U9182371",
    passportExpiry: "2029-10-05",
    nationality: "India",
    dob: "1982-08-30",
    gender: "Male",
    visaDetails: "UAE Golden Visa (10 Years - Valid 2033)",
    previousFlights: [
      { route: "DXB → BOM (Mumbai)", airline: "Air India", flightNo: "AI-996", date: "2026-06-15", pnr: "AIBOM4" },
      { route: "DXB → DOH (Doha)", airline: "Qatar Airways", flightNo: "QR-1003", date: "2026-04-02", pnr: "QRDOH2" },
    ],
    previousHotels: [
      { name: "The St. Regis Doha", destination: "Doha, Qatar", date: "2026-04-02", nights: 3 },
    ],
    previousVisas: [
      { country: "Qatar", visaType: "GCC Resident Entry", status: "Approved", expiry: "2026-05-02", refNo: "QTR-99128" },
    ],
    upcomingTravel: [],
    outstandingPayments: 0,
  },

  // Horizon Technologies
  {
    id: "emp-301",
    companyId: "comp-3",
    name: "Dr. Sarah Jenkins",
    email: "sarah.jenkins@horizontech.ae",
    phone: "+971 58 912 3341",
    employeeId: "HT-0010",
    department: "Executive Leadership",
    designation: "VP Product & AI",
    passportNumber: "UK982341029",
    passportExpiry: "2029-08-15",
    nationality: "United Kingdom",
    dob: "1986-03-24",
    gender: "Female",
    visaDetails: "UAE Green Visa (Valid 2029-09-01)",
    previousFlights: [
      { route: "DXB → LHR", airline: "British Airways", flightNo: "BA-108", date: "2026-08-01", pnr: "BA771X" },
      { route: "DXB → SFO (San Francisco)", airline: "Emirates", flightNo: "EK-225", date: "2026-05-10", pnr: "EKSFO9" },
    ],
    previousHotels: [
      { name: "Palace Hotel San Francisco", destination: "San Francisco, USA", date: "2026-05-10", nights: 7 },
    ],
    previousVisas: [
      { country: "United States", visaType: "B1/B2 Business", status: "Approved", expiry: "2032-04-10", refNo: "US-B1B2-8812" },
    ],
    upcomingTravel: [
      { service: "Flight + Hotel + Visa", route: "DXB → NRT (Tokyo)", date: "2026-11-05", ref: "BAT-2026-4401" },
    ],
    outstandingPayments: 0,
  },
  {
    id: "emp-302",
    companyId: "comp-3",
    name: "Rahul Verma",
    email: "rahul.verma@horizontech.ae",
    phone: "+971 50 782 1194",
    employeeId: "HT-0042",
    department: "Cloud Engineering",
    designation: "Principal Cloud Architect",
    passportNumber: "Z6192841",
    passportExpiry: "2028-11-20",
    nationality: "India",
    dob: "1989-10-14",
    gender: "Male",
    visaDetails: "UAE Golden Visa (Specialist/Engineer)",
    previousFlights: [
      { route: "DXB → BLR (Bengaluru)", airline: "IndiGo", flightNo: "6E-1486", date: "2026-07-02", pnr: "IND6E2" },
      { route: "DXB → SIN", airline: "Emirates", flightNo: "EK-354", date: "2026-03-18", pnr: "EKSIN4" },
    ],
    previousHotels: [
      { name: "Parkroyal Collection Marina Bay", destination: "Singapore", date: "2026-03-18", nights: 5 },
    ],
    previousVisas: [
      { country: "Singapore", visaType: "e-Visa Business", status: "Approved", expiry: "2026-04-18", refNo: "SGP-EV-2210" },
    ],
    upcomingTravel: [],
    outstandingPayments: 0,
  },
  {
    id: "emp-303",
    companyId: "comp-3",
    name: "Alexandre Dubois",
    email: "alexandre.dubois@horizontech.ae",
    phone: "+971 54 883 1920",
    employeeId: "HT-0028",
    department: "Commercial & Sales",
    designation: "Regional Sales Director EMEA",
    passportNumber: "21FB88291",
    passportExpiry: "2027-05-12",
    nationality: "France",
    dob: "1985-09-17",
    gender: "Male",
    visaDetails: "UAE Residence Visa (Valid 2027-08-30)",
    previousFlights: [
      { route: "DXB → GVA (Geneva)", airline: "Emirates", flightNo: "EK-089", date: "2026-06-11", pnr: "EKGVA1" },
    ],
    previousHotels: [],
    previousVisas: [],
    upcomingTravel: [],
    outstandingPayments: 0,
  },

  // Crestline Energy Middle East
  {
    id: "emp-401",
    companyId: "comp-4",
    name: "Khalid Al Suwaidi",
    email: "khalid.suwaidi@crestline.ae",
    phone: "+971 50 621 9904",
    employeeId: "CEME-0015",
    department: "Corporate Procurement",
    designation: "VP Procurement & Logistics",
    passportNumber: "E7740192",
    passportExpiry: "2030-12-08",
    nationality: "United Arab Emirates",
    dob: "1980-05-19",
    gender: "Male",
    visaDetails: "UAE Citizen",
    previousFlights: [
      { route: "AUH → LHR", airline: "Etihad Airways", flightNo: "EY-019", date: "2026-08-14", pnr: "EYLHR8" },
      { route: "AUH → IAH (Houston)", airline: "Qatar Airways", flightNo: "QR-713", date: "2026-04-20", pnr: "QRIH7" },
    ],
    previousHotels: [
      { name: "The Post Oak Hotel Uptown", destination: "Houston, USA", date: "2026-04-20", nights: 6 },
    ],
    previousVisas: [
      { country: "United States", visaType: "B1/B2 Business", status: "Approved", expiry: "2031-10-15", refNo: "US-VIS-3910" },
    ],
    upcomingTravel: [],
    outstandingPayments: 0,
  },

  // Elysian Hospitality
  {
    id: "emp-501",
    companyId: "comp-5",
    name: "Elena Rostova",
    email: "elena.rostova@elysianproperties.ae",
    phone: "+971 52 489 1238",
    employeeId: "ELYS-0008",
    department: "Finance & Accounting",
    designation: "Finance Director",
    passportNumber: "RU78912048",
    passportExpiry: "2028-07-29",
    nationality: "Cyprus",
    dob: "1987-12-03",
    gender: "Female",
    visaDetails: "EU Passport / UAE Golden Visa",
    previousFlights: [
      { route: "DXB → ATH (Athens)", airline: "Emirates", flightNo: "EK-209", date: "2026-07-04", pnr: "EKATH3" },
    ],
    previousHotels: [
      { name: "Hotel Grande Bretagne", destination: "Athens, Greece", date: "2026-07-04", nights: 5 },
    ],
    previousVisas: [],
    upcomingTravel: [],
    outstandingPayments: 0,
  },

  // Vanguard Financial Services
  {
    id: "emp-601",
    companyId: "comp-6",
    name: "David Sterling",
    email: "david.sterling@vanguardfs.ae",
    phone: "+971 55 901 4488",
    employeeId: "VFS-0002",
    department: "Executive Committee",
    designation: "Senior Managing Director",
    passportNumber: "UK19840291",
    passportExpiry: "2030-03-14",
    nationality: "United Kingdom",
    dob: "1975-01-28",
    gender: "Male",
    visaDetails: "UAE Golden Investor Visa (10 Years)",
    previousFlights: [
      { route: "DXB → JFK (New York)", airline: "Emirates", flightNo: "EK-201", date: "2026-06-08", pnr: "EKJFK1" },
      { route: "DXB → ZRH (Zurich)", airline: "Swiss", flightNo: "LX-243", date: "2026-03-12", pnr: "LXZRH9" },
    ],
    previousHotels: [
      { name: "The St. Regis New York", destination: "New York, USA", date: "2026-06-08", nights: 6 },
      { name: "Baur au Lac", destination: "Zurich, Switzerland", date: "2026-03-12", nights: 4 },
    ],
    previousVisas: [],
    upcomingTravel: [],
    outstandingPayments: 0,
  },
];

export const INITIAL_CUSTOMERS: Customer[] = [
  {
    id: "cust-1",
    name: "Rahul Sharma",
    phone: "+91 90828 64488",
    email: "rahul.sharma@gmail.com",
    nationality: "India",
    passportNumber: "M9283710",
    dob: "1991-04-12",
    gender: "Male",
    passportExpiry: "2029-06-25",
    numberOfTravellers: 2,
  },
  {
    id: "cust-2",
    name: "Fatima Al Mansoori",
    phone: "+971 50 892 1100",
    email: "fatima.mansoori@outlook.com",
    nationality: "United Arab Emirates",
    passportNumber: "E9182301",
    dob: "1994-09-18",
    gender: "Female",
    passportExpiry: "2031-11-14",
    numberOfTravellers: 4,
  },
  {
    id: "cust-3",
    name: "Michael Henderson",
    phone: "+971 55 781 2290",
    email: "m.henderson@icloud.com",
    nationality: "United Kingdom",
    passportNumber: "UK8829104",
    dob: "1988-12-05",
    gender: "Male",
    passportExpiry: "2028-01-30",
    numberOfTravellers: 2,
  },
  {
    id: "cust-4",
    name: "Pooja & Rohan Kapur",
    phone: "+971 52 664 1908",
    email: "rohan.kapur@gmail.com",
    nationality: "India",
    passportNumber: "N4410982",
    dob: "1995-07-22",
    gender: "Couple",
    passportExpiry: "2030-05-18",
    numberOfTravellers: 2,
  },
];

export const AIRLINES = [
  "Emirates",
  "FlyDubai",
  "Etihad Airways",
  "Air Arabia",
  "Air India",
  "IndiGo",
  "Qatar Airways",
  "Saudi Airlines",
  "Singapore Airlines",
  "British Airways",
  "Lufthansa",
  "Turkish Airlines",
  "Oman Air",
  "Vistara",
  "Akasa Air",
];

export const SUPPLIERS = [
  "Emirates Airlines",
  "FlyDubai Wholesale",
  "Amadeus GDS",
  "Sabre Global",
  "Bedsonline B2B",
  "WebBeds Middle East",
  "Hotelbeds",
  "VFS Global UAE",
  "BLS International",
  "Amer Center Dubai",
  "Rayna Tours DMC",
  "Dnata Travel Services",
  "Orient Tours DMC",
  "Allianz Global Assistance",
];

const STORAGE_KEYS = {
  COMPANIES: "bat_crm_companies_v1",
  EMPLOYEES: "bat_crm_employees_v1",
  CUSTOMERS: "bat_crm_customers_v1",
  BOOKINGS: "bat_crm_bookings_v1",
  BRANCHES: "bat_crm_branches_v1",
};

export function getStoredBranches(): Branch[] {
  if (typeof window === "undefined") return INITIAL_BRANCHES;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.BRANCHES);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.BRANCHES, JSON.stringify(INITIAL_BRANCHES));
      return INITIAL_BRANCHES;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_BRANCHES;
  } catch {
    return INITIAL_BRANCHES;
  }
}

export function saveBranch(branch: Branch): void {
  if (typeof window === "undefined") return;
  const list = getStoredBranches();
  const index = list.findIndex((b) => b.id === branch.id);
  if (index >= 0) {
    list[index] = branch;
  } else {
    list.push(branch);
  }
  localStorage.setItem(STORAGE_KEYS.BRANCHES, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent("fc:branches-updated", { detail: list }));
}

export function deleteBranch(branchId: string): void {
  if (typeof window === "undefined") return;
  const list = getStoredBranches().filter((b) => b.id !== branchId);
  localStorage.setItem(STORAGE_KEYS.BRANCHES, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent("fc:branches-updated", { detail: list }));
}

export function getStoredCompanies(): Company[] {
  if (typeof window === "undefined") return INITIAL_COMPANIES;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.COMPANIES);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.COMPANIES, JSON.stringify(INITIAL_COMPANIES));
      return INITIAL_COMPANIES;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_COMPANIES;
  } catch {
    return INITIAL_COMPANIES;
  }
}

export function saveCompany(company: Company): void {
  if (typeof window === "undefined") return;
  const list = getStoredCompanies();
  const index = list.findIndex((c) => c.id === company.id);
  if (index >= 0) {
    list[index] = company;
  } else {
    list.push(company);
  }
  localStorage.setItem(STORAGE_KEYS.COMPANIES, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent("fc:companies-updated", { detail: list }));
}

export function deleteCompany(companyId: string): void {
  if (typeof window === "undefined") return;
  const list = getStoredCompanies().filter((c) => c.id !== companyId);
  localStorage.setItem(STORAGE_KEYS.COMPANIES, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent("fc:companies-updated", { detail: list }));
}

export function getStoredEmployees(companyId?: string): Employee[] {
  if (typeof window === "undefined") {
    return companyId ? INITIAL_EMPLOYEES.filter((e) => e.companyId === companyId) : INITIAL_EMPLOYEES;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.EMPLOYEES);
    let list: Employee[] = INITIAL_EMPLOYEES;
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(INITIAL_EMPLOYEES));
    } else {
      list = JSON.parse(raw);
    }
    return companyId ? list.filter((e) => e.companyId === companyId) : list;
  } catch {
    return companyId ? INITIAL_EMPLOYEES.filter((e) => e.companyId === companyId) : INITIAL_EMPLOYEES;
  }
}

export function saveEmployee(employee: Employee): void {
  if (typeof window === "undefined") return;
  const list = getStoredEmployees();
  const index = list.findIndex((e) => e.id === employee.id);
  if (index >= 0) {
    list[index] = employee;
  } else {
    list.unshift(employee);
  }
  localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(list));
}

export function getStoredCustomers(): Customer[] {
  if (typeof window === "undefined") return INITIAL_CUSTOMERS;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CUSTOMERS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(INITIAL_CUSTOMERS));
      return INITIAL_CUSTOMERS;
    }
    const parsed: Customer[] = JSON.parse(raw);
    let migrated = false;
    const updated = parsed.map((c) => {
      if (
        (c.id === "cust-1" || c.name === "Rahul Sharma") &&
        (c.phone === "+971 50 123 4567" || c.phone === "+971501234567")
      ) {
        migrated = true;
        return { ...c, phone: "+91 90828 64488" };
      }
      return c;
    });
    if (migrated) {
      localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(updated));
    }
    return updated;
  } catch {
    return INITIAL_CUSTOMERS;
  }
}

export function saveCustomer(customer: Customer): void {
  if (typeof window === "undefined") return;
  const list = getStoredCustomers();
  const index = list.findIndex((c) => c.id === customer.id);
  if (index >= 0) {
    list[index] = customer;
  } else {
    list.unshift(customer);
  }
  localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(list));
}

export function getStoredCrmBookings(): TravelCrmRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.BOOKINGS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCrmBooking(record: TravelCrmRecord): void {
  if (typeof window === "undefined") return;
  const list = getStoredCrmBookings();
  list.unshift(record);
  localStorage.setItem(STORAGE_KEYS.BOOKINGS, JSON.stringify(list));

  // If corporate employee, update employee history and company stats
  if (record.bookingFor === "CORPORATE" && record.employeeId && record.companyId) {
    const employees = getStoredEmployees();
    const emp = employees.find((e) => e.id === record.employeeId);
    if (emp) {
      emp.previousFlights.unshift({
        route: record.destination || "DXB Route",
        airline: "Emirates / Blue Aura",
        flightNo: "BAT-FLT",
        date: record.travelDate,
        pnr: record.bookingRef.replace("BAT-", ""),
      });
      saveEmployee(emp);
    }

    const companies = getStoredCompanies();
    const comp = companies.find((c) => c.id === record.companyId);
    if (comp) {
      comp.totalBookings += 1;
      comp.monthlySpend += record.totalSelling;
      comp.lastBookingDate = record.travelDate;
      if (record.balanceDue > 0) {
        comp.outstandingBalance += record.balanceDue;
      }
      saveCompany(comp);
    }
  }
}

export function generateBookingReference(): string {
  const year = new Date().getFullYear();
  const randomNum = Math.floor(100000 + Math.random() * 900000);
  return `BAT-${year}-${randomNum}`;
}
