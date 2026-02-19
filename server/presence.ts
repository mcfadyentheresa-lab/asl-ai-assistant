interface PresenceEntry {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
  profileImageUrl: string | null;
  lastSeen: number;
  visible: boolean;
}

const presenceMap = new Map<string, PresenceEntry>();

const TIMEOUT_MS = 60_000;

export function heartbeat(
  userId: string,
  firstName: string | null,
  lastName: string | null,
  role: string | null,
  profileImageUrl: string | null
) {
  const existing = presenceMap.get(userId);
  presenceMap.set(userId, {
    userId,
    firstName,
    lastName,
    role,
    profileImageUrl,
    lastSeen: Date.now(),
    visible: existing?.visible ?? true,
  });
}

export function setVisibility(userId: string, visible: boolean) {
  const entry = presenceMap.get(userId);
  if (entry) {
    entry.visible = visible;
  }
}

export function getVisibility(userId: string): boolean {
  const entry = presenceMap.get(userId);
  return entry?.visible ?? true;
}

export function removePresence(userId: string) {
  presenceMap.delete(userId);
}

export function getOnlineUsers() {
  const now = Date.now();
  const online: {
    userId: string;
    firstName: string | null;
    lastName: string | null;
    role: string | null;
    profileImageUrl: string | null;
  }[] = [];

  const keys = Array.from(presenceMap.keys());
  for (const id of keys) {
    const entry = presenceMap.get(id)!;
    if (now - entry.lastSeen > TIMEOUT_MS) {
      presenceMap.delete(id);
      continue;
    }
    if (entry.visible) {
      online.push({
        userId: entry.userId,
        firstName: entry.firstName,
        lastName: entry.lastName,
        role: entry.role,
        profileImageUrl: entry.profileImageUrl,
      });
    }
  }

  return online;
}
