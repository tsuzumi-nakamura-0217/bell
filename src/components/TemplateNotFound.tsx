"use client";

import Link from "next/link";
import { useState } from "react";
import { removeRecent } from "@/lib/recent";

export function TemplateNotFound({ id }: { id: string }) {
  const [removed, setRemoved] = useState(false);
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-16">
      <h1 className="text-xl font-bold">このテンプレートは見つかりません</h1>
      <p className="text-zinc-600 dark:text-zinc-400">削除された可能性があります。</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/" className="rounded bg-zinc-900 px-4 py-2 text-white dark:bg-white dark:text-zinc-900">
          トップへ
        </Link>
        <button
          type="button"
          disabled={removed}
          onClick={() => {
            removeRecent(id);
            setRemoved(true);
          }}
          className="rounded border border-zinc-300 px-4 py-2 disabled:opacity-50 dark:border-zinc-600"
        >
          {removed ? "一覧から外しました" : "最近使った一覧から外す"}
        </button>
      </div>
    </main>
  );
}
