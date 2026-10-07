import type { Template } from "./bells";

export const SELECTED_KEY = "bell:selected";

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function byNewest(a: Template, b: Template): number {
  return b.createdAt - a.createdAt || a.id.localeCompare(b.id);
}

/** 記憶している id が一覧にあればそれを、なければ先頭を選ぶ。 */
export function pickSelectedId(list: readonly Template[], remembered: string | null): string | null {
  if (remembered && list.some((t) => t.id === remembered)) return remembered;
  return list[0]?.id ?? null;
}

/** 同じ id は置き換え、新しいものは作成日の新しい順の位置に入れる。 */
export function upsertIntoList(list: readonly Template[], template: Template): Template[] {
  if (list.some((t) => t.id === template.id)) {
    return list.map((t) => (t.id === template.id ? template : t));
  }
  return [...list, template].sort(byNewest);
}

export function removeFromList(list: readonly Template[], id: string): Template[] {
  return list.filter((t) => t.id !== id);
}

function browserStorage(): KeyValueStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadSelectedId(storage: KeyValueStorage | null = browserStorage()): string | null {
  try {
    return storage?.getItem(SELECTED_KEY) ?? null;
  } catch {
    return null;
  }
}

export function saveSelectedId(id: string | null, storage: KeyValueStorage | null = browserStorage()): void {
  try {
    if (id === null) storage?.removeItem(SELECTED_KEY);
    else storage?.setItem(SELECTED_KEY, id);
  } catch {
    // 容量超過やアクセス拒否は無視する
  }
}
