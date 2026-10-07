"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadRecent, removeRecent, type RecentEntry } from "@/lib/recent";

export function RecentList() {
  // localStorage はブラウザでしか読めないので、マウント後に読み込む
  const [entries, setEntries] = useState<RecentEntry[] | null>(null);

  useEffect(() => {
    // サーバーとの描画差（ハイドレーション不一致）を避けるため、意図的にマウント後に一度だけ読む
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEntries(loadRecent());
  }, []);

  if (entries === null) return null;
  if (entries.length === 0) {
    return <p className="text-zinc-500">まだありません。テンプレートを作るか、共有URLを開くとここに表示されます。</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-center gap-3 py-3">
          <Link href={`/t/${entry.id}`} className="flex-1 font-medium underline-offset-4 hover:underline">
            {entry.name}
          </Link>
          <button
            type="button"
            onClick={() => setEntries(removeRecent(entry.id))}
            className="rounded px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            一覧から外す
          </button>
        </li>
      ))}
    </ul>
  );
}
