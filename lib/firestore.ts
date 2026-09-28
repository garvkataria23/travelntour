import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

// Collection references matching firestore.rules
export const COLLECTIONS = {
  BUSINESSES: "businesses",
  USERS: "users",
  CUSTOMERS: "customers",
  BOOKINGS: "bookings",
  INVOICES: "invoices",
  EXPENSES: "expenses",
  INCOME: "income",
  BACKUPS: "backups",
} as const;

export interface FirestoreBusiness {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  timezone: string;
  currency: string;
  createdAt?: Timestamp | Date;
  updatedAt?: Timestamp | Date;
}

export interface FirestoreUser {
  uid: string;
  businessId: string;
  email: string;
  name: string;
  role: "ADMIN" | "STAFF" | "SUPER_ADMIN";
  status: "ACTIVE" | "INACTIVE";
  createdAt?: Timestamp | Date;
  updatedAt?: Timestamp | Date;
}

export interface FirestoreCustomer {
  id?: string;
  businessId: string;
  name: string;
  email?: string;
  phone: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt?: Timestamp | Date;
  updatedAt?: Timestamp | Date;
}

export interface FirestoreBooking {
  id?: string;
  businessId: string;
  customerId: string;
  customerName?: string;
  pnr: string;
  airline: string;
  flightNumber?: string;
  fromAirport: string;
  toAirport: string;
  departureDate: string;
  departureTime?: string;
  status: "CONFIRMED" | "PENDING" | "COMPLETED" | "CANCELLED";
  amount: number;
  currency: string;
  createdAt?: Timestamp | Date;
  updatedAt?: Timestamp | Date;
}

export interface FirestoreInvoice {
  id?: string;
  businessId: string;
  bookingId: string;
  invoiceNumber: string;
  amount: number;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
  createdAt?: Timestamp | Date;
  updatedAt?: Timestamp | Date;
}

export interface FirestoreExpense {
  id?: string;
  businessId: string;
  title: string;
  amount: number;
  category: "DIRECT" | "OPERATING" | string;
  date: string;
  createdAt?: Timestamp | Date;
  updatedAt?: Timestamp | Date;
}

export interface FirestoreIncome {
  id?: string;
  businessId: string;
  title: string;
  amount: number;
  category: "TICKET_SALE" | "COMMISSION" | "REFUND" | "OTHER";
  date: string;
  createdAt?: Timestamp | Date;
  updatedAt?: Timestamp | Date;
}

// -------------------------------------------------------------
// User & Business Profiles
// -------------------------------------------------------------

export async function getOrCreateUserProfile(user: { uid: string; email: string | null; displayName: string | null }): Promise<FirestoreUser> {
  const userDocRef = doc(db, COLLECTIONS.USERS, user.uid);
  const snap = await getDoc(userDocRef);

  if (snap.exists()) {
    return snap.data() as FirestoreUser;
  }

  // Auto-provision tenant business for new signups
  const businessId = `biz_${user.uid.slice(0, 16)}`;
  const bizRef = doc(db, COLLECTIONS.BUSINESSES, businessId);
  const bizData: FirestoreBusiness = {
    id: businessId,
    name: user.displayName ? `${user.displayName}'s Travel Agency` : "My Travel Agency",
    email: user.email || "",
    timezone: "Asia/Kolkata",
    currency: "AED",
    createdAt: serverTimestamp() as unknown as Timestamp,
    updatedAt: serverTimestamp() as unknown as Timestamp,
  };
  await setDoc(bizRef, bizData);

  const newUser: FirestoreUser = {
    uid: user.uid,
    businessId,
    email: user.email || "",
    name: user.displayName || user.email?.split("@")[0] || "Travel Agent",
    role: "ADMIN",
    status: "ACTIVE",
    createdAt: serverTimestamp() as unknown as Timestamp,
    updatedAt: serverTimestamp() as unknown as Timestamp,
  };
  await setDoc(userDocRef, newUser);

  return newUser;
}

export async function getFirestoreUser(uid: string): Promise<FirestoreUser | null> {
  const userDocRef = doc(db, COLLECTIONS.USERS, uid);
  const snap = await getDoc(userDocRef);
  return snap.exists() ? (snap.data() as FirestoreUser) : null;
}

// -------------------------------------------------------------
// Customer Operations
// -------------------------------------------------------------

export async function addCustomerToFirestore(data: Omit<FirestoreCustomer, "id">) {
  const colRef = collection(db, COLLECTIONS.CUSTOMERS);
  const docRef = await addDoc(colRef, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getCustomersFromFirestore(businessId: string): Promise<FirestoreCustomer[]> {
  const q = query(
    collection(db, COLLECTIONS.CUSTOMERS),
    where("businessId", "==", businessId),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreCustomer));
}

// -------------------------------------------------------------
// Booking Operations
// -------------------------------------------------------------

export async function addBookingToFirestore(data: Omit<FirestoreBooking, "id">) {
  const colRef = collection(db, COLLECTIONS.BOOKINGS);
  const docRef = await addDoc(colRef, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getBookingsFromFirestore(businessId: string): Promise<FirestoreBooking[]> {
  const q = query(
    collection(db, COLLECTIONS.BOOKINGS),
    where("businessId", "==", businessId),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreBooking));
}

// -------------------------------------------------------------
// Invoice Operations
// -------------------------------------------------------------

export async function addInvoiceToFirestore(data: Omit<FirestoreInvoice, "id">) {
  const colRef = collection(db, COLLECTIONS.INVOICES);
  const docRef = await addDoc(colRef, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getInvoicesFromFirestore(businessId: string): Promise<FirestoreInvoice[]> {
  const q = query(
    collection(db, COLLECTIONS.INVOICES),
    where("businessId", "==", businessId),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreInvoice));
}

// -------------------------------------------------------------
// Financial Operations (Income & Expenses)
// -------------------------------------------------------------

export async function addExpenseToFirestore(data: Omit<FirestoreExpense, "id">) {
  const colRef = collection(db, COLLECTIONS.EXPENSES);
  const docRef = await addDoc(colRef, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getExpensesFromFirestore(businessId: string): Promise<FirestoreExpense[]> {
  const q = query(
    collection(db, COLLECTIONS.EXPENSES),
    where("businessId", "==", businessId),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreExpense));
}

export async function addIncomeToFirestore(data: Omit<FirestoreIncome, "id">) {
  const colRef = collection(db, COLLECTIONS.INCOME);
  const docRef = await addDoc(colRef, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getIncomeFromFirestore(businessId: string): Promise<FirestoreIncome[]> {
  const q = query(
    collection(db, COLLECTIONS.INCOME),
    where("businessId", "==", businessId),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreIncome));
}

// -------------------------------------------------------------
// Backup Snapshots
// -------------------------------------------------------------

export async function saveBackupToFirestore(businessId: string, backupData: Record<string, unknown>) {
  const colRef = collection(db, COLLECTIONS.BACKUPS);
  const docRef = await addDoc(colRef, {
    businessId,
    backup: backupData,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}
