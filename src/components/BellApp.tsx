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
import { BellIcon, ClockIcon, MenuIcon, PlusIcon } from "./icons";
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
    <div data-hydrated={hydrated ? "true" : "false"} className="flex min-h-screen flex-1 flex-col bg-default md:flex-row">
      {!fullscreen && (
        <div className="flex h-14 items-center gap-3 border-b border-line bg-muted px-4 md:hidden">
          <Brand />
          <span className="flex-1" />
          <button
            type="button"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen((open) => !open)}
            className="btn-secondary px-3!"
          >
            <MenuIcon />
            テンプレート一覧
          </button>
        </div>
      )}

      {!fullscreen && (
        <nav
          aria-label="テンプレート一覧"
          className={`${sidebarOpen ? "flex" : "hidden"} w-full shrink-0 flex-col gap-4 border-b border-line bg-muted px-3 py-4 md:sticky md:top-0 md:flex md:h-screen md:w-60 md:border-r md:border-b-0`}
        >
          <div className="hidden px-2 pt-1 md:block">
            <Brand />
          </div>
          <button type="button" onClick={startCreate} className="btn-primary w-full">
            <PlusIcon />
            新規作成
          </button>
          <div className="flex min-h-0 flex-col gap-1">
            <p className="px-2 pb-1 text-xs font-medium text-fg-muted">テンプレート</p>
            {templates.length === 0 && <p className="px-2 text-sm text-fg-muted">まだありません</p>}
            <ul className="flex flex-col gap-0.5 overflow-y-auto">
              {templates.map((t) => {
                const current = t.id === selectedId && view.kind !== "create";
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      aria-current={current ? "true" : undefined}
                      onClick={() => select(t.id)}
                      className={`flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-left text-sm transition-colors ${
                        current
                          ? "bg-emphasis font-medium text-fg-emphasis"
                          : "text-fg hover:bg-subtle hover:text-fg-emphasis"
                      }`}
                    >
                      <ClockIcon className={`size-4 shrink-0 ${current ? "text-fg-emphasis" : "text-fg-subtle"}`} />
                      <span className="truncate">{t.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        {view.kind === "create" && (
          <EditorPanel title="新しいテンプレート" description="ベルを鳴らす時刻と回数を設定します。">
            <TemplateEditor onSaved={onSaved} onCancel={() => setView({ kind: "timer" })} />
          </EditorPanel>
        )}
        {view.kind === "edit" && selected && (
          <EditorPanel title="テンプレートを編集" description="変更はこのテンプレートを使う全員に反映されます。">
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
          <div className="flex flex-1 p-4 md:p-8">
            <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line-emphasis p-8 text-center">
              <div className="mb-2 flex size-16 items-center justify-center rounded-full bg-emphasis text-fg-emphasis">
                <BellIcon className="size-7" />
              </div>
              <p className="font-semibold tracking-tight text-xl text-fg-emphasis">テンプレートを作成してください</p>
              <p className="max-w-sm text-sm text-fg-subtle">
                「新規作成」から、ベルを鳴らす時刻と回数を設定できます。
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Brand() {
  return (
    <span className="flex items-center gap-2 font-semibold tracking-tight text-lg text-fg-emphasis">
      <span className="flex size-7 items-center justify-center rounded-md bg-inverted text-fg-inverted">
        <BellIcon className="size-4" />
      </span>
      ベルタイマー
    </span>
  );
}

function EditorPanel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold tracking-tight text-xl text-fg-emphasis md:text-2xl">{title}</h1>
        <p className="text-sm text-fg-subtle">{description}</p>
      </header>
      {children}
    </div>
  );
}
