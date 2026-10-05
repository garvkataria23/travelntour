import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Firebase configuration for traveltourism-32d7d
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyBMyrFUiBrIvOGNHfO0uATegHJd5C88VQ8",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "traveltourism-32d7d.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "traveltourism-32d7d",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "traveltourism-32d7d.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "75010608480",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:75010608480:web:559e5da4ecf0c7bcd76205",
  measurementId: "G-970PMDXGM4",
};

// Initialize Firebase App (singleton pattern for Next.js SSR/client)
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Standard Authentication Provider (Non-sensitive: profile, email, openid only)
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// REMOVED: `googleDriveProvider` and the `drive.file` / `drive.metadata.readonly` scopes.
//
// Backups run server-side against a Google *service account* (backend/src/backup). Requesting Drive
// scopes in the browser put a personal-account access token in client JavaScript, where any XSS or
// an open DevTools could read it, and where it only ever worked if a human clicked a button - so
// there was never a real schedule. `signInWithGoogle` below deliberately keeps using the
// non-sensitive `googleProvider` (profile, email, openid only).

export const formatStorageBytes = (bytes: number): string => {
  if (!bytes || isNaN(bytes) || bytes <= 0) return "0 MB";
  if (bytes >= 1024 * 1024 * 1024 * 1024) {
    return (bytes / (1024 * 1024 * 1024 * 1024)).toFixed(2) + " TB";
  }
  if (bytes >= 1024 * 1024 * 1024) {
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  }
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
};

/**
 * REMOVED: `getDefaultQuotaForEmail()`.
 *
 * It returned a hardcoded 5 TB Google One plan for a specific personal Gmail address (including
 * invented per-service usage figures) and a fabricated 15 GB baseline for everyone else, with
 * `source: "default"` — which the UI then rendered as "Google Drive connected" with a quota.
 *
 * Nothing about a Drive account can be known without asking Drive. The backup destination is now a
 * service account on the server (backend/src/backup), and its real status is reported by
 * `GET /backups/destination` plus `POST /backups/destination/verify`, which actually contacts
 * Google. If no quota is available, the UI says so rather than inventing one.
 */

/**
 * REMOVED: `fetchDriveQuota()` and the `DriveStorageQuota` type.
 *
 * It read the *user's personal* Drive quota with a browser-held bearer token. Beyond exposing that
 * token, the quota was the wrong thing to show: it described the operator's own Google account, not
 * the backup destination. The destination is a service-account Drive folder, whose real status comes
 * from `GET /backups/destination` and `POST /backups/destination/verify`, which actually contact
 * Google. When no quota is available the UI reports that rather than inventing one.
 */

/**
 * Sign in using Google OAuth Popup and return user and OAuth access token.
 */
export async function signInWithGoogle(provider: GoogleAuthProvider = googleProvider) {
  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  return {
    user: result.user,
    accessToken: credential?.accessToken ?? null,
  };
}

/**
 * REMOVED: browser-side Google Drive OAuth (`getGDriveAuth`, `connectGoogleDrive`,
 * `disconnectGoogleDrive`).
 *
 * Why it had to go:
 *
 *   - The access token lived in the browser. Anyone with an XSS, or anyone opening DevTools, could
 *     read it and read or write the folder holding every tenant's data.
 *   - It could only run when a human clicked a button, so there was no schedule and therefore no
 *     real backup.
 *   - It targeted the *user's personal* Drive, so the archive's survival depended on one individual
 *     account staying alive.
 *   - `disconnectGoogleDrive()` was an empty function: it revoked nothing, so the Google grant
 *     outlived every "disconnect" the UI ever displayed.
 *
 * Backups now go through a Google *service account* on the server (backend/src/backup), with the
 * credential never leaving the host and the schedule running unattended.
 */

/**
 * Sign in using Email and Password.
 */
export async function signInWithEmail(email: string, pass: string) {
  const result = await signInWithEmailAndPassword(auth, email, pass);
  return result.user;
}

/**
 * Register a new user with Email and Password.
 */
export async function signUpWithEmail(email: string, pass: string) {
  const result = await createUserWithEmailAndPassword(auth, email, pass);
  return result.user;
}

/**
 * Sign out the current user.
 */
export async function logOut() {
  await signOut(auth);
}

/**
 * Send password reset email to a user.
 */
export async function resetPassword(email: string) {
  await sendPasswordResetEmail(auth, email);
}

/**
 * Get the current user's Firebase ID token for secure API calls.
 */
export async function getCurrentUserIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

/**
 * Subscribe to authentication state changes.
 */
export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export default app;
