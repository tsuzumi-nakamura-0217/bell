"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Template } from "@/lib/bells";
import {
  loadSelectedId,
  pickSelectedId,
  removeFromList,
  saveSelectedId,
  upsertIntoList,
} from "@/lib/template-list";
import { TemplateEditor } from "./TemplateEditor";
import { TimerView } from "./TimerView";

type View = { kind: "timer" } | { kind: "create" } | { kind: "edit" };

const SWITCH_CONFIRM = "タイマーを止めて切り替えますか？";

export function BellApp({ initialTemplates }: { initialTemplates: Template[] }) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [selectedId, setSelectedId] = useState(() => pickSelectedId(initialTemplates, null));
  const [view, setView] = useState<View>({ kind: "timer" });
  const [hydrated, setHydrated] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const runningRef = useRef(false);

  const selected = templates.find((t) => t.id === selectedId) ?? null;

  // 最後に選んだテンプレートは localStorage にしかないので、マウント後に反映する
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedId((current) => pickSelectedId(initialTemplates, loadSelectedId() ?? current));
    setHydrated(true);
  }, [initialTemplates]);

  useEffect(() => {
    if (hydrated) saveSelectedId(selectedId);
  }, [hydrated, selectedId]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const onRunningChange = useCallback((running: boolean) => {
    runningRef.current = running;
  }, []);

  /** タイマー実行中なら確認する。続けてよければ true */
  function confirmLeaveTimer(): boolean {
    return !runningRef.current || window.confirm(SWITCH_CONFIRM);
  }

  function select(id: string) {
    setSidebarOpen(false);
    if (id === selectedId && view.kind === "timer") return;
    if (view.kind === "timer" && !confirmLeaveTimer()) return;
    setSelectedId(id);
    setView({ kind: "timer" });
  }

  function startCreate() {
    setSidebarOpen(false);
    if (view.kind === "timer" && !confirmLeaveTimer()) return;
    setView({ kind: "create" });
  }

  function startEdit() {
    if (!confirmLeaveTimer()) return;
    setView({ kind: "edit" });
  }

  function onSaved(template: Template) {
    setTemplates((list) => upsertIntoList(list, template));
    setSelectedId(template.id);
    setView({ kind: "timer" });
  }

  function onDeleted(id: string) {
    const rest = removeFromList(templates, id);
    setTemplates(rest);
    setSelectedId(pickSelectedId(rest, null));
    setView({ kind: "timer" });
  }

  return (
    <div data-hydrated={hydrated ? "true" : "false"} className="flex min-h-screen flex-1 flex-col md:flex-row">
      {!fullscreen && (
        <div className="flex items-center gap-3 border-b border-zinc-200 px-4 py-2 md:hidden dark:border-zinc-800">
          <button
            type="button"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen((open) => !open)}
            className="rounded border border-zinc-300 px-3 py-1 text-sm dark:border-zinc-600"
          >
            テンプレート一覧
          </button>
          <span className="truncate text-sm text-zinc-500">{selected?.name}</span>
        </div>
      )}

      {!fullscreen && (
        <nav
          aria-label="テンプレート一覧"
          className={`${sidebarOpen ? "flex" : "hidden"} w-full shrink-0 flex-col gap-3 border-zinc-200 bg-zinc-50 p-4 md:flex md:w-64 md:border-r dark:border-zinc-800 dark:bg-zinc-900`}
        >
          <p className="font-bold">ベルタイマー</p>
          <button
            type="button"
            onClick={startCreate}
            className="rounded bg-zinc-900 px-3 py-2 text-sm font-semibold text-white dark:bg-white dark:text-zinc-900"
          >
            ＋ 新規作成
          </button>
          <ul className="flex flex-col gap-1">
            {templates.map((t) => {
              const current = t.id === selectedId && view.kind !== "create";
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    aria-current={current ? "true" : undefined}
                    onClick={() => select(t.id)}
                    className={`w-full truncate rounded px-3 py-2 text-left text-sm ${
                      current
                        ? "bg-zinc-900 font-semibold text-white dark:bg-white dark:text-zinc-900"
                        : "hover:bg-zinc-200 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {t.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        {view.kind === "create" && (
          <EditorPanel title="新しいテンプレート">
            <TemplateEditor onSaved={onSaved} onCancel={() => setView({ kind: "timer" })} />
          </EditorPanel>
        )}
        {view.kind === "edit" && selected && (
          <EditorPanel title="テンプレートを編集">
            <TemplateEditor
              key={selected.id}
              initial={selected}
              onSaved={onSaved}
              onCancel={() => setView({ kind: "timer" })}
              onDeleted={onDeleted}
            />
          </EditorPanel>
        )}
        {view.kind === "timer" && selected && (
          <TimerView
            key={`${selected.id}:${selected.updatedAt}`}
            template={selected}
            onEdit={startEdit}
            onRunningChange={onRunningChange}
          />
        )}
        {view.kind === "timer" && !selected && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <p className="text-lg">テンプレートを作成してください</p>
            <p className="text-sm text-zinc-500">左の「＋ 新規作成」から、ベルを鳴らす時刻と回数を設定できます。</p>
          </div>
        )}
      </main>
    </div>
  );
}

function EditorPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-bold">{title}</h1>
      {children}
    </div>
  );
}
