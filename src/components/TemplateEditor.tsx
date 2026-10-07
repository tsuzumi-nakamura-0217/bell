"use client";

import { useEffect, useRef, useState } from "react";
import { BellPlayer, isAudioSupported } from "@/audio/bell-player";
import { ApiError, createTemplate, deleteTemplate, updateTemplate } from "@/lib/api-client";
import {
  DEFAULT_SOUND,
  MAX_BELLS,
  MAX_COUNT,
  SOUND_IDS,
  SOUND_LABELS,
  templateInputSchema,
  type SoundId,
  type Template,
} from "@/lib/bells";
import { issuesToErrors, newRow, rowsToCandidate, templateToRows, type BellRow, type FormErrors } from "@/lib/editor-form";
import { BellIcon, PlayIcon, PlusIcon, TrashIcon } from "./icons";

const NETWORK_ERROR = "通信に失敗しました。接続を確認してもう一度お試しください。";
const COUNT_OPTIONS = Array.from({ length: MAX_COUNT }, (_, i) => i + 1);

interface TemplateEditorProps {
  initial?: Template;
  onSaved(template: Template): void;
  onCancel(): void;
  onDeleted?(id: string): void;
}

export function TemplateEditor({ initial, onSaved, onCancel, onDeleted }: TemplateEditorProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [rows, setRows] = useState<BellRow[]>(() =>
    initial ? templateToRows(initial.bells) : [newRow(240, 1), newRow(300, 2)],
  );
  const [errors, setErrors] = useState<FormErrors>({ rows: {} });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sound, setSound] = useState<SoundId>(initial?.sound ?? DEFAULT_SOUND);
  const previewRef = useRef<BellPlayer | null>(null);

  // フォームを閉じたら試聴の音も止める
  useEffect(() => () => void previewRef.current?.close(), []);

  async function preview() {
    if (!isAudioSupported()) return;
    if (previewRef.current?.sound !== sound) {
      void previewRef.current?.close();
      previewRef.current = new BellPlayer({ sound });
    }
    const player = previewRef.current;
    try {
      await player.unlock();
      player.cancelAll();
      player.ringNow();
    } catch {
      // 音が出せない環境では何もしない
    }
  }

  function updateRow(index: number, patch: Partial<BellRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    const lastAt = rowsToCandidate(name, rows).bells.at(-1)?.at;
    setRows((current) => [...current, newRow(Number.isFinite(lastAt) ? (lastAt ?? 0) + 60 : 60, 1)]);
  }

  async function save() {
    const parsed = templateInputSchema.safeParse({ ...rowsToCandidate(name, rows), sound });
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error.issues));
      return;
    }
    setErrors({ rows: {} });
    setMessage(null);
    setBusy(true);
    try {
      onSaved(initial ? await updateTemplate(initial.id, parsed.data) : await createTemplate(parsed.data));
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
    onDeleted?.(initial.id);
  }

  return (
    <form
      className="card flex flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex flex-col gap-8 p-5 md:p-6">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-fg-emphasis">テンプレート名</span>
          <input
            className="field w-full"
            value={name}
            maxLength={100}
            placeholder="例：LT大会 5分"
            onChange={(e) => setName(e.target.value)}
            aria-invalid={errors.name ? true : undefined}
          />
          {errors.name && <span className="text-xs text-red-600 dark:text-red-400">{errors.name}</span>}
        </label>

        <div className="flex flex-col gap-2">
          <label htmlFor="template-sound" className="text-sm font-medium text-fg-emphasis">
            音色
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <select
              id="template-sound"
              className="field pr-8"
              value={sound}
              onChange={(e) => setSound(e.target.value as SoundId)}
            >
              {SOUND_IDS.map((id) => (
                <option key={id} value={id}>
                  {SOUND_LABELS[id]}
                </option>
              ))}
            </select>
            <button type="button" className="btn-secondary" onClick={() => void preview()}>
              <PlayIcon />
              試聴
            </button>
          </div>
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-medium text-fg-emphasis">ベル</legend>
          <p className="-mt-1 text-xs text-fg-subtle">最後のベルが終了時刻になります。</p>
          <ul className="divide-y divide-line overflow-hidden rounded-[10px] border border-line">
            {rows.map((row, i) => (
              <li key={row.key} className="flex flex-col gap-1.5 bg-default px-3 py-3 sm:px-4">
                <div className="flex flex-wrap items-center gap-2 text-sm text-fg">
                  <span className="mr-1 inline-flex h-6 min-w-14 items-center justify-center gap-1 rounded-md bg-subtle px-2 text-xs font-medium text-fg-emphasis">
                    <BellIcon className="size-3" />
                    ベル{i + 1}
                  </span>
                  <input
                    className="field w-16 text-right tabular-nums"
                    inputMode="numeric"
                    aria-label={`ベル${i + 1} 分`}
                    value={row.minutes}
                    onChange={(e) => updateRow(i, { minutes: e.target.value })}
                  />
                  <span>分</span>
                  <input
                    className="field w-16 text-right tabular-nums"
                    inputMode="numeric"
                    aria-label={`ベル${i + 1} 秒`}
                    value={row.seconds}
                    onChange={(e) => updateRow(i, { seconds: e.target.value })}
                  />
                  <span>秒に</span>
                  <select
                    className="field pr-8"
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
                    className="btn-minimal ml-auto size-9 px-0!"
                    aria-label={`ベル${i + 1}を削除`}
                    disabled={rows.length === 1}
                    onClick={() => setRows((current) => current.filter((_, j) => j !== i))}
                  >
                    <TrashIcon />
                  </button>
                </div>
                {errors.rows[i] && <span className="text-xs text-red-600 dark:text-red-400">{errors.rows[i]}</span>}
              </li>
            ))}
          </ul>
          <button type="button" className="btn-minimal self-start px-2!" disabled={rows.length >= MAX_BELLS} onClick={addRow}>
            <PlusIcon />
            ベルを追加
          </button>
          {errors.general && <span className="text-xs text-red-600 dark:text-red-400">{errors.general}</span>}
        </fieldset>

        {message && (
          <p
            role="alert"
            className="rounded-[10px] border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          >
            {message}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-b-xl border-t border-line bg-muted px-5 py-4 md:px-6">
        {initial && onDeleted && (
          <button type="button" disabled={busy} onClick={() => void remove()} className="btn-destructive">
            <TrashIcon />
            このテンプレートを削除
          </button>
        )}
        <div className="ml-auto flex gap-2">
          <button type="button" disabled={busy} onClick={onCancel} className="btn-minimal">
            キャンセル
          </button>
          <button type="submit" disabled={busy} className="btn-primary">
            保存
          </button>
        </div>
      </div>
    </form>
  );
}
