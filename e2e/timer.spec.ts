import { expect, test } from "@playwright/test";
import { createTemplateViaApi, deleteAllTemplates, openTemplate } from "./helpers";

test.beforeEach(async ({ page, request }) => {
  await deleteAllTemplates(request);
  await page.clock.install();
});

test("スタートすると時間が進み、ベル時刻を過ぎたものは済みになり、終了後は超過表示になる", async ({ page, request }) => {
  await createTemplateViaApi(request, {
    name: "短い発表",
    bells: [{ at: 2, count: 1 }, { at: 4, count: 2 }],
  });
  await openTemplate(page, "短い発表");
  await expect(page.getByTestId("clock")).toHaveText("0:00");
  await expect(page.getByTestId("next-bell")).toContainText("0:02");

  await page.getByRole("button", { name: "スタート" }).click();
  await page.clock.runFor(2500);
  await expect(page.getByTestId("clock")).toHaveText("0:02");
  await expect(page.getByTestId("bell-item").nth(0)).toHaveAttribute("data-done", "true");
  await expect(page.getByTestId("bell-item").nth(1)).toHaveAttribute("data-done", "false");

  await page.clock.runFor(3000);
  await expect(page.getByTestId("timer-root")).toHaveAttribute("data-overtime", "true");
  await expect(page.getByTestId("clock")).toHaveText("+0:01");
  await expect(page.getByTestId("next-bell")).toHaveText("終了時刻を過ぎました");
});

test("一時停止中は時間が進まず、リセットで 0 に戻る", async ({ page, request }) => {
  await createTemplateViaApi(request, { name: "停止テスト", bells: [{ at: 60, count: 1 }] });
  await openTemplate(page, "停止テスト");
  await page.getByRole("button", { name: "スタート" }).click();
  await page.clock.runFor(3000);
  await page.getByRole("button", { name: "一時停止" }).click();
  await page.clock.runFor(10_000);
  await expect(page.getByTestId("clock")).toHaveText("0:03");
  await page.getByRole("button", { name: "リセット" }).click();
  await expect(page.getByTestId("clock")).toHaveText("0:00");
  await expect(page.getByRole("button", { name: "スタート" })).toBeVisible();
});

test("残り時間表示に切り替えられる", async ({ page, request }) => {
  await createTemplateViaApi(request, { name: "残り時間", bells: [{ at: 90, count: 1 }] });
  await openTemplate(page, "残り時間");
  await page.getByTestId("clock").click();
  await expect(page.getByTestId("clock-mode")).toHaveText("残り時間");
  await expect(page.getByTestId("clock")).toHaveText("1:30");
});

test("スペースキー: ボタンにフォーカスがあっても、スタート／一時停止が1回だけ切り替わる", async ({ page, request }) => {
  await createTemplateViaApi(request, { name: "キー操作", bells: [{ at: 60, count: 1 }] });
  await openTemplate(page, "キー操作");
  // サイドバーのボタンからフォーカスを外し、ページ本体にある状態からキー操作を始める
  await page.locator("body").focus();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "一時停止" })).toBeVisible();
  await page.clock.runFor(3000);

  // スタートボタン（今は「一時停止」）にフォーカスがある状態: 1回だけ切り替わって一時停止になる
  await page.getByRole("button", { name: "一時停止" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "再開" })).toBeVisible();
  await expect(page.getByTestId("clock")).toHaveText("0:03");

  // リセットボタンにフォーカスがある状態: リセットされず、再開する
  await page.getByRole("button", { name: "リセット" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "一時停止" })).toBeVisible();
  await expect(page.getByTestId("clock")).toHaveText("0:03");
  await page.clock.runFor(2000);
  await expect(page.getByTestId("clock")).toHaveText("0:05");
});

test("ベルを待つあいだは無音の音声をループ再生し（iPhone の画面ロック対策）、一時停止で止める", async ({ page, request }) => {
  // 無音の audio 要素は DOM に置かないので、play() を横取りして要素を覚えておく
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      (window as unknown as { keepAlive: HTMLMediaElement }).keepAlive = this;
      return play.call(this);
    };
  });
  await createTemplateViaApi(request, { name: "ロック対策", bells: [{ at: 60, count: 1 }] });
  await openTemplate(page, "ロック対策");
  const keepAlive = () =>
    page.evaluate(() => {
      const el = (window as unknown as { keepAlive?: HTMLMediaElement }).keepAlive;
      return {
        playing: el ? !el.paused : false,
        loop: el?.loop ?? false,
        title: navigator.mediaSession.metadata?.title,
        playbackState: navigator.mediaSession.playbackState,
      };
    });

  await page.getByRole("button", { name: "スタート" }).click();
  await expect(page.getByRole("button", { name: "一時停止" })).toBeVisible();
  expect(await keepAlive()).toEqual({ playing: true, loop: true, title: "ロック対策", playbackState: "playing" });

  await page.getByRole("button", { name: "一時停止" }).click();
  await expect(page.getByRole("button", { name: "再開" })).toBeVisible();
  expect(await keepAlive()).toMatchObject({ playing: false, playbackState: "paused" });
});
