"use client";

import { useEffect, useState } from "react";
import { useTimer } from "@/hooks/use-timer";
import type { Template } from "@/lib/bells";
import { endMs, nextBell } from "@/lib/schedule";
import { formatClock } from "@/lib/time";
import { BellIcon, MaximizeIcon, PauseIcon, PencilIcon, PlayIcon, RotateIcon } from "./icons";

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

  const card = overtime ? "rounded-xl border border-white/25 bg-white/5" : "card";
  const secondary = overtime
    ? "btn border border-white/40 text-white hover:bg-white/10"
    : "btn-secondary";
  const primary = overtime ? "btn bg-white text-red-700 hover:bg-red-50" : "btn-primary";

  return (
    <section
      data-testid="timer-root"
      data-overtime={overtime ? "true" : "false"}
      className={`flex min-h-screen flex-1 flex-col transition-colors ${
        overtime ? "bg-red-600 text-white" : "bg-default text-fg"
      }`}
    >
      <header
        className={`flex flex-wrap items-center gap-3 border-b px-4 py-5 md:px-8 ${
          overtime ? "border-white/25" : "border-line"
        }`}
      >
        <div className="min-w-0 flex-1">
          <h1 className={`truncate font-semibold tracking-tight text-xl md:text-2xl ${overtime ? "" : "text-fg-emphasis"}`}>{template.name}</h1>
          <p className={`text-sm ${overtime ? "text-white/80" : "text-fg-subtle"}`}>
            ベル{bells.length}つ・終了 {formatClock(end / 1000)}
          </p>
        </div>
        <button type="button" onClick={onEdit} className={secondary}>
          <PencilIcon />
          編集
        </button>
        <button type="button" onClick={toggleFullscreen} className={secondary}>
          <MaximizeIcon />
          全画面
        </button>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-4 md:p-8">
        {!audioSupported && (
          <p
            role="alert"
            className="rounded-[10px] border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
          >
            このブラウザでは音を鳴らせません（タイマーは使えます）。
          </p>
        )}

        <div className={`${card} flex flex-col items-center justify-center gap-6 px-4 py-10 md:flex-1 md:py-14`}>
          <span
            data-testid="clock-mode"
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
              overtime ? "bg-white text-red-700" : "bg-subtle text-fg-emphasis"
            }`}
          >
            {overtime ? "超過時間" : mode === "elapsed" ? "経過時間" : "残り時間"}
          </span>
          <button
            type="button"
            data-testid="clock"
            aria-label="表示を切り替え"
            title="クリックで経過時間／残り時間を切り替え"
            onClick={() => setMode((m) => (m === "elapsed" ? "remaining" : "elapsed"))}
            className={`rounded-xl px-4 text-[min(18vw,12rem)] leading-none font-semibold tracking-tight tabular-nums ${
              overtime ? "" : "text-fg-emphasis"
            }`}
          >
            {clockText}
          </button>
          <p data-testid="next-bell" className={`text-base md:text-lg ${overtime ? "text-white/90" : "text-fg-subtle"}`}>
            {nextText}
          </p>

          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" disabled={!ready} onClick={toggle} className={`${primary} btn-lg min-w-36`}>
              {running ? <PauseIcon /> : <PlayIcon />}
              {toggleLabel}
            </button>
            <button type="button" disabled={!ready} onClick={reset} className={`${secondary} btn-lg`}>
              <RotateIcon />
              リセット
            </button>
            <button type="button" disabled={!ready} onClick={ringNow} className={`${secondary} btn-lg`}>
              <BellIcon />
              ベルを鳴らす
            </button>
          </div>

          <p className={`text-xs ${overtime ? "text-white/70" : "text-fg-muted"}`}>
            <kbd
              className={`rounded border px-1.5 py-0.5 font-sans text-[11px] ${
                overtime ? "border-white/40" : "border-line bg-muted text-fg-subtle"
              }`}
            >
              Space
            </kbd>{" "}
            でスタート／一時停止
          </p>
        </div>

        <div className={card}>
          <div className={`border-b px-4 py-3 md:px-5 ${overtime ? "border-white/25" : "border-line"}`}>
            <h2 className={`text-sm font-medium ${overtime ? "" : "text-fg-emphasis"}`}>スケジュール</h2>
          </div>
          <ol className={`divide-y ${overtime ? "divide-white/15" : "divide-line"}`}>
            {bells.map((bell, i) => {
              const done = bell.at * 1000 <= elapsed;
              const last = i === bells.length - 1;
              return (
                <li
                  key={bell.at}
                  data-testid="bell-item"
                  data-done={done ? "true" : "false"}
                  className={`flex items-center gap-4 px-4 py-3 transition-opacity md:px-5 ${done ? "opacity-40" : ""}`}
                >
                  <span className={`w-14 font-medium tabular-nums ${overtime ? "" : "text-fg-emphasis"}`}>
                    {formatClock(bell.at)}
                  </span>
                  <span className="flex flex-1 items-center gap-1">
                    <span className="sr-only">{bell.count}回</span>
                    {Array.from({ length: bell.count }, (_, k) => (
                      <BellIcon key={k} className={`size-4 ${overtime ? "" : "text-fg-subtle"}`} />
                    ))}
                  </span>
                  {last && (
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                        overtime ? "bg-white text-red-700" : "bg-inverted text-fg-inverted"
                      }`}
                    >
                      終了
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
