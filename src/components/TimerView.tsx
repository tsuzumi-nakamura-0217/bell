"use client";

import { useEffect, useState } from "react";
import { useTimer } from "@/hooks/use-timer";
import type { Template } from "@/lib/bells";
import { endMs, nextBell } from "@/lib/schedule";
import { formatClock } from "@/lib/time";

type ClockMode = "elapsed" | "remaining";

function isTextInput(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

interface TimerViewProps {
  template: Template;
  onEdit(): void;
  /** 実行中かどうかが変わるたびに呼ぶ（テンプレート切り替え時の確認に使う） */
  onRunningChange(running: boolean): void;
}

export function TimerView({ template, onEdit, onRunningChange }: TimerViewProps) {
  const { bells } = template;
  const { timer, elapsed, overtime, ready, audioSupported, toggle, reset, ringNow } = useTimer(bells);
  const [mode, setMode] = useState<ClockMode>("elapsed");
  const end = endMs(bells);

  const running = timer.phase === "running";
  useEffect(() => {
    onRunningChange(running);
  }, [running, onRunningChange]);
  useEffect(() => () => onRunningChange(false), [onRunningChange]);

  // スペースキーでスタート／一時停止。フォーカス中のボタンが作動しないよう keyup も止める。
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isTextInput(e.target)) return;
      e.preventDefault();
      if (!e.repeat) toggle();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTextInput(e.target)) e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [toggle]);

  const clockText = overtime
    ? `+${formatClock((elapsed - end) / 1000)}`
    : mode === "elapsed"
      ? formatClock(elapsed / 1000)
      : formatClock(Math.ceil((end - elapsed) / 1000));

  const next = nextBell(bells, elapsed);
  const nextText = next
    ? `次のベル ${formatClock(next.bell.at)}（${next.bell.count}回）まで ${formatClock(Math.ceil((next.bell.at * 1000 - elapsed) / 1000))}`
    : "終了時刻を過ぎました";

  const toggleLabel = timer.phase === "running" ? "一時停止" : timer.phase === "paused" ? "再開" : "スタート";

  function toggleFullscreen() {
    const action = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
    action.catch(() => {});
  }

  return (
    <section
      data-testid="timer-root"
      data-overtime={overtime ? "true" : "false"}
      className={`flex min-h-screen flex-1 flex-col gap-6 px-4 py-6 transition-colors ${
        overtime ? "bg-red-600 text-white" : "bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100"
      }`}
    >
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 text-xl font-bold">{template.name}</h1>
        <button type="button" onClick={onEdit} className="rounded border border-current px-3 py-1 text-sm">
          編集
        </button>
        <button type="button" onClick={toggleFullscreen} className="rounded border border-current px-3 py-1 text-sm">
          全画面
        </button>
      </header>

      {!audioSupported && (
        <p role="alert" className="rounded bg-yellow-100 p-3 text-sm text-yellow-900">
          このブラウザでは音を鳴らせません（タイマーは使えます）。
        </p>
      )}

      <section className="flex flex-1 flex-col items-center justify-center gap-4">
        <span data-testid="clock-mode" className="text-sm opacity-70">
          {overtime ? "超過時間" : mode === "elapsed" ? "経過時間" : "残り時間"}
        </span>
        <button
          type="button"
          data-testid="clock"
          aria-label="表示を切り替え"
          onClick={() => setMode((m) => (m === "elapsed" ? "remaining" : "elapsed"))}
          className="font-mono text-[min(22vw,14rem)] leading-none font-bold tabular-nums"
        >
          {clockText}
        </button>
        <p data-testid="next-bell" className="text-lg">
          {nextText}
        </p>
      </section>

      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          disabled={!ready}
          onClick={toggle}
          className={`min-w-32 rounded px-6 py-3 text-lg font-semibold disabled:opacity-50 ${
            overtime ? "bg-white text-red-700" : "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
          }`}
        >
          {toggleLabel}
        </button>
        <button type="button" disabled={!ready} onClick={reset} className="rounded border border-current px-6 py-3 text-lg">
          リセット
        </button>
        <button type="button" disabled={!ready} onClick={ringNow} className="rounded border border-current px-6 py-3 text-lg">
          ベルを鳴らす
        </button>
      </div>

      <ol className="mx-auto flex w-full max-w-md flex-col gap-1">
        {bells.map((bell, i) => {
          const done = bell.at * 1000 <= elapsed;
          return (
            <li
              key={bell.at}
              data-testid="bell-item"
              data-done={done ? "true" : "false"}
              className={`grid grid-cols-[4rem_1fr_2.5rem] items-center gap-3 rounded px-3 py-1 ${done ? "opacity-40" : ""}`}
            >
              <span className="font-mono tabular-nums">{formatClock(bell.at)}</span>
              <span className="text-right">{"🔔".repeat(bell.count)}</span>
              <span className="text-right text-sm">{i === bells.length - 1 ? "終了" : ""}</span>
            </li>
          );
        })}
      </ol>

      <p className="text-center text-xs opacity-60">スペースキーでスタート／一時停止</p>
    </section>
  );
}
