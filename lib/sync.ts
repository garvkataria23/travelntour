"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { getStoredUser, invalidateCache, baseOf } from "@/lib/api";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

export type SyncEntity =
  | "bookings"
  | "customers"
  | "invoices"
  | "expenses"
  | "income"
  | "templates"
  | "settings"
  | "general";

export type SyncAction = "CREATE" | "UPDATE" | "DELETE" | "STATUS_CHANGE";

export interface LiveSyncAuthor {
  id?: string;
  name: string;
  email: string;
  color?: string;
}

export interface LiveSyncEvent {
  id: string;
  businessId?: string;
  entity: SyncEntity;
  action: SyncAction;
  entityId?: string;
  entityTitle?: string;
  author: LiveSyncAuthor;
  timestamp: number;
  data?: Record<string, unknown>;
}

export interface CollaboratorUser {
  userId: string;
  name: string;
  email: string;
  role: string;
  color: string;
  currentPage: string;
  lastSeen: number;
  isSelf?: boolean;
}

// User avatar colors (Google Sheets multiplayer palette)
const COLLABORATOR_COLORS = [
  "#10b981", // Emerald
  "#0284c7", // Sky Blue
  "#8b5cf6", // Violet
  "#d97706", // Amber
  "#f43f5e", // Rose
  "#0d9488", // Teal
  "#6366f1", // Indigo
  "#ec4899", // Pink
];

export function getCollaboratorColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % COLLABORATOR_COLORS.length;
  return COLLABORATOR_COLORS[index];
}

// In-memory event listeners
const eventListeners = new Set<(event: LiveSyncEvent) => void>();

// Multi-tab broadcast channel
let broadcastChannel: BroadcastChannel | null = null;
if (typeof window !== "undefined" && "BroadcastChannel" in window) {
  try {
    broadcastChannel = new BroadcastChannel("flyconnect_live_sync_v2");
    broadcastChannel.onmessage = (msgEvent) => {
      const data = msgEvent.data;
      if (data && data.type === "SYNC_EVENT" && data.payload) {
        handleIncomingEvent(data.payload as LiveSyncEvent, false);
      }
    };
  } catch {
    // BroadcastChannel unsupported or restricted
  }
}

// Internal dispatcher that notifies subscribers and invalidates cache
function handleIncomingEvent(event: LiveSyncEvent, forwardToBroadcast = true) {
  // 1. Invalidate matching API caches immediately
  try {
    const base = `/${event.entity}`;
    invalidateCache(base);
    invalidateCache("/reports/overview");
  } catch {
    // non-blocking
  }

  // 2. Notify all in-memory subscribers
  eventListeners.forEach((listener) => {
    try {
      listener(event);
    } catch (err) {
      console.error("Error in sync event listener:", err);
    }
  });

  // 3. Dispatch DOM event for any non-react listeners
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("fc-live-sync-event", { detail: event }));
  }

  // 4. Forward to BroadcastChannel for other open tabs
  if (forwardToBroadcast && broadcastChannel) {
    try {
      broadcastChannel.postMessage({ type: "SYNC_EVENT", payload: event });
    } catch {
      // non-blocking
    }
  }
}

/**
 * Publish a real-time mutation event to all active users (both local tabs & remote team members).
 * This provides the live spreadsheet "multi-user sync" experience.
 */
export async function broadcastLiveSync(params: {
  entity: SyncEntity;
  action: SyncAction;
  entityId?: string;
  entityTitle?: string;
  data?: Record<string, unknown>;
  author?: LiveSyncAuthor;
}): Promise<void> {
  if (typeof window === "undefined") return;

  const stored = getStoredUser();
  const author: LiveSyncAuthor = params.author || {
    id: stored?.id || "anon",
    name: stored?.name || "Colleague",
    email: stored?.email || "",
    color: getCollaboratorColor(stored?.name || stored?.email || "User"),
  };

  const event: LiveSyncEvent = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    entity: params.entity,
    action: params.action,
    entityId: params.entityId,
    entityTitle: params.entityTitle,
    author,
    timestamp: Date.now(),
    data: params.data,
  };

  // 1. Instantly process locally (0ms) and broadcast to other open tabs
  handleIncomingEvent(event, true);

  // 2. Broadcast across devices to remote colleagues via Firestore
  try {
    const businessId = (stored as any)?.businessId || "default";
    const eventDoc = doc(collection(db, "businesses", businessId, "sync_events"), event.id);
    await setDoc(eventDoc, {
      id: event.id,
      businessId,
      entity: event.entity,
      action: event.action,
      entityId: event.entityId || event.id,
      authorName: author.name || "Colleague",
      authorEmail: author.email || "staff@flyconnect.app",
      timestamp: event.timestamp,
      createdAt: serverTimestamp(),
    });
  } catch {
    // If Firestore rules or offline, local multi-tab sync already succeeded
  }
}

/**
 * Subscribe to live sync events. Automatically cleans up on unmount.
 */
export function subscribeToLiveSync(callback: (event: LiveSyncEvent) => void): () => void {
  eventListeners.add(callback);
  return () => {
    eventListeners.delete(callback);
  };
}

/**
 * React Hook: Listen to live mutations for a specific entity or all entities.
 * Triggers callback immediately when User A, User B, or anyone edits/adds/deletes.
 */
export function useLiveSync(
  entityFilter?: SyncEntity | SyncEntity[],
  onEvent?: (event: LiveSyncEvent) => void
) {
  const [lastEvent, setLastEvent] = useState<LiveSyncEvent | null>(null);

  useEffect(() => {
    const filters = entityFilter ? (Array.isArray(entityFilter) ? entityFilter : [entityFilter]) : null;

    const unsubscribe = subscribeToLiveSync((event) => {
      if (!filters || filters.includes(event.entity) || event.entity === "general") {
        setLastEvent(event);
        if (onEvent) {
          onEvent(event);
        }
      }
    });

    return unsubscribe;
  }, [entityFilter, onEvent]);

  return lastEvent;
}

/**
 * React Hook: Active Highlights (Google Sheets cell edit flash).
 * Returns a Set of entity IDs that were updated in the last 3.5 seconds.
 */
export function useLiveHighlights(entity?: SyncEntity) {
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useLiveSync(entity, (event) => {
    if (event.entityId) {
      const id = event.entityId;
      setHighlightedIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });

      // Clear previous timer if any
      const existing = timersRef.current.get(id);
      if (existing) clearTimeout(existing);

      // Remove highlight after 3.5 seconds
      const t = setTimeout(() => {
        setHighlightedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        timersRef.current.delete(id);
      }, 3500);

      timersRef.current.set(id, t);
    }
  });

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  return highlightedIds;
}

/**
 * React Hook: Live Collaborator Presence (Google Sheets avatar bubbles at top).
 * Tracks which staff and colleagues are currently online and viewing FlyConnect.
 */
export function useCollaboratorPresence(currentPage: string) {
  const [collaborators, setCollaborators] = useState<CollaboratorUser[]>([]);
  const [isConnected, setIsConnected] = useState(true);
  const storedUser = typeof window !== "undefined" ? getStoredUser() : null;

  useEffect(() => {
    if (typeof window === "undefined" || !storedUser?.id) return;

    const userId = storedUser.id;
    const businessId = (storedUser as any)?.businessId || "default";
    const userColor = getCollaboratorColor(storedUser.name || storedUser.email);

    const presenceDocRef = doc(db, "businesses", businessId, "presence", userId);

    // Heartbeat function to update presence
    const sendHeartbeat = async () => {
      try {
        await setDoc(
          presenceDocRef,
          {
            userId,
            businessId,
            name: storedUser.name || "Staff Member",
            email: storedUser.email || "staff@flyconnect.app",
            role: storedUser.role || "STAFF",
            color: userColor,
            currentPage,
            lastSeen: Date.now(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        setIsConnected(true);
      } catch {
        // Fallback or offline
      }
    };

    // Send initial heartbeat
    sendHeartbeat();

    // Heartbeat interval every 12 seconds
    const heartbeatInterval = setInterval(sendHeartbeat, 12000);

    // Clean up on window unload
    const handleBeforeUnload = () => {
      try {
        deleteDoc(presenceDocRef);
      } catch {
        // best effort
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Listen to all active collaborators in the business via Firestore real-time listener
    let unsubscribeFirestore: (() => void) | null = null;
    try {
      const q = collection(db, "businesses", businessId, "presence");
      unsubscribeFirestore = onSnapshot(
        q,
        (snapshot) => {
          const now = Date.now();
          const active: CollaboratorUser[] = [];

          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            // Consider active if seen in the last 35 seconds
            const lastSeen = data.lastSeen || 0;
            if (now - lastSeen < 35000) {
              active.push({
                userId: data.userId || docSnap.id,
                name: data.name || "Colleague",
                email: data.email || "",
                role: data.role || "STAFF",
                color: data.color || getCollaboratorColor(data.name || "User"),
                currentPage: data.currentPage || "/",
                lastSeen,
                isSelf: data.userId === userId,
              });
            }
          });

          // Sort self first, then by name
          active.sort((a, b) => (a.isSelf ? -1 : b.isSelf ? 1 : a.name.localeCompare(b.name)));
          setCollaborators(active);
        },
        () => {
          // If Firestore permissions or network fails, show at least self
          setCollaborators([
            {
              userId,
              name: storedUser.name || "You",
              email: storedUser.email || "",
              role: storedUser.role || "ADMIN",
              color: userColor,
              currentPage,
              lastSeen: Date.now(),
              isSelf: true,
            },
          ]);
        }
      );
    } catch {
      // offline fallback
    }

    // Also listen to remote Firestore sync events (cross-device real-time push)
    let unsubscribeEvents: (() => void) | null = null;
    try {
      const eventsCol = collection(db, "businesses", businessId, "sync_events");
      const sessionStart = Date.now() - 5000;
      const eventsQuery = query(eventsCol, where("timestamp", ">=", sessionStart), limit(15));
      unsubscribeEvents = onSnapshot(eventsQuery, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
            const docData = change.doc.data();
            const authorEmail = (docData.authorEmail || docData.author?.email || "") as string;
            // Only process events initiated by other users to prevent echo loops
            if (authorEmail !== storedUser.email) {
              const eventData: LiveSyncEvent = {
                id: docData.id,
                businessId: docData.businessId,
                entity: docData.entity,
                action: docData.action,
                entityId: docData.entityId,
                author: {
                  id: authorEmail,
                  name: docData.authorName || docData.author?.name || "Colleague",
                  email: authorEmail,
                  color: getCollaboratorColor(docData.authorName || authorEmail || "User"),
                },
                timestamp: docData.timestamp,
              };
              handleIncomingEvent(eventData, false);
            }
          }
        });
      });
    } catch {
      // non-blocking
    }

    return () => {
      clearInterval(heartbeatInterval);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (unsubscribeFirestore) unsubscribeFirestore();
      if (unsubscribeEvents) unsubscribeEvents();
      try {
        deleteDoc(presenceDocRef);
      } catch {
        // ignore
      }
    };
  }, [currentPage, storedUser?.id, storedUser?.email, storedUser?.name, storedUser?.role]);

  return { collaborators, isConnected, totalOnline: Math.max(collaborators.length, 1) };
}
