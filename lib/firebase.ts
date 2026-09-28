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

// Google Drive Provider (Non-sensitive: email, profile, openid to prevent unverified app warnings)
export const googleDriveProvider = new GoogleAuthProvider();
googleDriveProvider.setCustomParameters({ prompt: "select_account" });

export interface DriveStorageQuota {
  limit: number;
  usage: number;
  usageInDrive?: number;
  percent: number;
  formattedUsed: string;
  formattedTotal: string;
  formattedFree: string;
}

/**
 * Fetch Google Drive storage quota using the user's OAuth access token.
 */
export async function fetchDriveQuota(accessToken: string): Promise<DriveStorageQuota | null> {
  try {
    const res = await fetch("https://www.googleapis.com/drive/v3/about?fields=storageQuota,user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!res.ok) {
      console.warn("Drive about API returned status", res.status);
      return null;
    }
    const data = await res.json();
    const sq = data.storageQuota;
    if (!sq) return null;

    const limit = sq.limit ? Number(sq.limit) : 15 * 1024 * 1024 * 1024;
    const usage = sq.usage ? Number(sq.usage) : 0;
    const usageInDrive = sq.usageInDrive ? Number(sq.usageInDrive) : 0;
    const free = Math.max(0, limit - usage);
    const percent = limit > 0 ? Math.min(100, Math.round((usage / limit) * 100)) : 0;

    const formatBytes = (bytes: number) => {
      if (bytes >= 1024 * 1024 * 1024) {
        return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
      }
      return (bytes / (1024 * 1024)).toFixed(0) + " MB";
    };

    return {
      limit,
      usage,
      usageInDrive,
      percent,
      formattedUsed: formatBytes(usage),
      formattedTotal: formatBytes(limit),
      formattedFree: formatBytes(free),
    };
  } catch (err) {
    console.error("Failed to fetch drive quota:", err);
    return null;
  }
}

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
 * Secondary isolated Firebase Auth instance specifically for Google Drive OAuth
 * so connecting Google Drive never overwrites or interferes with the user's primary login session!
 */
export function getGDriveAuth() {
  const gdriveApp =
    getApps().find((a) => a.name === "gdrive") ||
    initializeApp(firebaseConfig, "gdrive");
  return getAuth(gdriveApp);
}

/**
 * Connect Google Drive via popup without modifying the primary application session.
 */
export async function connectGoogleDrive(): Promise<{ user: User; accessToken: string | null }> {
  const gAuth = getGDriveAuth();
  const result = await signInWithPopup(gAuth, googleDriveProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  return {
    user: result.user,
    accessToken: credential?.accessToken ?? null,
  };
}

/**
 * Disconnect Google Drive without logging the user out of FlyConnect.
 */
export async function disconnectGoogleDrive(): Promise<void> {
  try {
    const gAuth = getGDriveAuth();
    await signOut(gAuth);
  } catch {
    // ignore
  }
}

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
