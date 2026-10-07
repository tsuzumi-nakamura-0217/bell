export const RECENT_KEY = "bell:recent";
export const RECENT_LIMIT = 20;

export interface RecentEntry {
  id: string;
  name: string;
  lastOpenedAt: number;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): KeyValueStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isEntry(value: unknown): value is RecentEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.name === "string" && typeof v.lastOpenedAt === "number";
}

export function loadRecent(storage: KeyValueStorage | null = browserStorage()): RecentEntry[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isEntry)
      .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
      .slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

function save(entries: RecentEntry[], storage: KeyValueStorage | null): void {
  if (!storage) return;
  try {
    storage.setItem(RECENT_KEY, JSON.stringify(entries));
  } catch {
    // 容量超過やアクセス拒否は無視する
  }
}

export function touchRecent(
  entry: { id: string; name: string },
  now: number = Date.now(),
  storage: KeyValueStorage | null = browserStorage(),
): RecentEntry[] {
  const next = [
    { id: entry.id, name: entry.name, lastOpenedAt: now },
    ...loadRecent(storage).filter((e) => e.id !== entry.id),
  ].slice(0, RECENT_LIMIT);
  save(next, storage);
  return next;
}

export function removeRecent(id: string, storage: KeyValueStorage | null = browserStorage()): RecentEntry[] {
  const next = loadRecent(storage).filter((e) => e.id !== id);
  save(next, storage);
  return next;
}
