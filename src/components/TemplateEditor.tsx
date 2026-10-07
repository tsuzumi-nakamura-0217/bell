"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, createTemplate, deleteTemplate, updateTemplate } from "@/lib/api-client";
import { MAX_BELLS, MAX_COUNT, templateInputSchema, type Template } from "@/lib/bells";
import { issuesToErrors, newRow, rowsToCandidate, templateToRows, type BellRow, type FormErrors } from "@/lib/editor-form";
import { removeRecent, touchRecent } from "@/lib/recent";

const NETWORK_ERROR = "通信に失敗しました。接続を確認してもう一度お試しください。";
const COUNT_OPTIONS = Array.from({ length: MAX_COUNT }, (_, i) => i + 1);
const inputClass = "rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600 dark:bg-zinc-900";

export function TemplateEditor({ initial }: { initial?: Template }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [rows, setRows] = useState<BellRow[]>(() =>
    initial ? templateToRows(initial.bells) : [newRow(240, 1), newRow(300, 2)],
  );
  const [errors, setErrors] = useState<FormErrors>({ rows: {} });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  function updateRow(index: number, patch: Partial<BellRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    const lastAt = rowsToCandidate(name, rows).bells.at(-1)?.at;
    setRows((current) => [...current, newRow(Number.isFinite(lastAt) ? (lastAt ?? 0) + 60 : 60, 1)]);
  }

  async function save() {
    const parsed = templateInputSchema.safeParse(rowsToCandidate(name, rows));
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error.issues));
      return;
    }
    setErrors({ rows: {} });
    setMessage(null);
    setBusy(true);
    try {
      if (initial) {
        await updateTemplate(initial.id, parsed.data);
        touchRecent({ id: initial.id, name: parsed.data.name });
        router.push(`/t/${initial.id}`);
      } else {
        const { id } = await createTemplate(parsed.data);
        touchRecent({ id, name: parsed.data.name });
        setCreatedId(id);
      }
    } catch (error) {
      setMessage(
        error instanceof ApiError && error.status === 404
          ? "このテンプレートは削除されています。"
          : NETWORK_ERROR,
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!initial) return;
    const ok = window.confirm(`「${initial.name}」を本当に削除しますか？（共有している全員が使えなくなります）`);
    if (!ok) return;
    setMessage(null);
    setBusy(true);
    try {
      await deleteTemplate(initial.id);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) {
        setMessage(NETWORK_ERROR);
        setBusy(false);
        return;
      }
    }
    removeRecent(initial.id);
    router.push("/");
  }

  if (createdId) {
    return <ShareResult id={createdId} />;
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="font-semibold">テンプレート名</span>
        <input
          className={inputClass}
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={errors.name ? true : undefined}
        />
        {errors.name && <span className="text-sm text-red-600">{errors.name}</span>}
      </label>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-semibold">ベル（最後のベルが終了時刻）</legend>
        {rows.map((row, i) => (
          <div key={row.key} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-14 text-sm text-zinc-500">ベル{i + 1}</span>
              <input
                className={`${inputClass} w-16 text-right`}
                inputMode="numeric"
                aria-label={`ベル${i + 1} 分`}
                value={row.minutes}
                onChange={(e) => updateRow(i, { minutes: e.target.value })}
              />
              <span>分</span>
              <input
                className={`${inputClass} w-16 text-right`}
                inputMode="numeric"
                aria-label={`ベル${i + 1} 秒`}
                value={row.seconds}
                onChange={(e) => updateRow(i, { seconds: e.target.value })}
              />
              <span>秒に</span>
              <select
                className={inputClass}
                aria-label={`ベル${i + 1} 回数`}
                value={row.count}
                onChange={(e) => updateRow(i, { count: Number(e.target.value) })}
              >
                {COUNT_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}回
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="rounded px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
                aria-label={`ベル${i + 1}を削除`}
                disabled={rows.length === 1}
                onClick={() => setRows((current) => current.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
            {errors.rows[i] && <span className="ml-16 text-sm text-red-600">{errors.rows[i]}</span>}
          </div>
        ))}
        <button
          type="button"
          className="self-start rounded border border-zinc-300 px-3 py-1 text-sm disabled:opacity-40 dark:border-zinc-600"
          disabled={rows.length >= MAX_BELLS}
          onClick={addRow}
        >
          ベルを追加
        </button>
        {errors.general && <span className="text-sm text-red-600">{errors.general}</span>}
      </fieldset>

      {message && (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-zinc-900 px-5 py-2 font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
        >
          保存
        </button>
        {initial && (
          <>
            <Link href={`/t/${initial.id}`} className="text-sm underline">
              保存せずに戻る
            </Link>
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              className="ml-auto rounded border border-red-300 px-3 py-2 text-sm text-red-700 disabled:opacity-50"
            >
              このテンプレートを削除
            </button>
          </>
        )}
      </div>
    </form>
  );
}

function ShareResult({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? `/t/${id}` : `${window.location.origin}/t/${id}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="font-semibold">テンプレートを保存しました。このURLを共有してください。</p>
      <div className="flex gap-2">
        <input
          readOnly
          data-testid="share-url"
          aria-label="共有URL"
          value={url}
          className={`${inputClass} flex-1`}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button type="button" onClick={() => void copy()} className="rounded border border-zinc-300 px-3 dark:border-zinc-600">
          {copied ? "コピーしました" : "コピー"}
        </button>
      </div>
      <Link
        href={`/t/${id}`}
        className="self-start rounded bg-zinc-900 px-5 py-2 font-semibold text-white dark:bg-white dark:text-zinc-900"
      >
        タイマーを開く
      </Link>
    </div>
  );
}
