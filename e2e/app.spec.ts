import { expect, test } from "@playwright/test";
import { createTemplateViaApi, deleteAllTemplates, openTemplate, sidebar } from "./helpers";

test.beforeEach(async ({ request }) => {
  await deleteAllTemplates(request);
});

test("テンプレートがなければ作成を促し、作成するとすぐタイマー画面になってサイドバーに並ぶ", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("テンプレートを作成してください")).toBeVisible();

  await sidebar(page).getByRole("button", { name: "新規作成" }).click();
  await page.getByLabel("テンプレート名").fill("LT大会 5分");
  await page.getByLabel("ベル2 回数").selectOption("2");
  await page.getByRole("button", { name: "ベルを追加" }).click();
  await page.getByLabel("ベル3 分").fill("7");
  await page.getByLabel("ベル3 秒").fill("0");
  await page.getByLabel("ベル3 回数").selectOption("3");
  await page.getByRole("button", { name: "保存" }).click();

  await expect(page.getByRole("heading", { name: "LT大会 5分" })).toBeVisible();
  await expect(page.getByTestId("clock")).toHaveText("0:00");
  await expect(page.getByTestId("bell-item")).toHaveCount(3);
  await expect(page).toHaveURL(/\/$/);
  await expect(sidebar(page).getByRole("button", { name: "LT大会 5分" })).toHaveAttribute("aria-current", "true");
  await expect(page.getByText("共有URL")).toHaveCount(0);
});

test("入力が不正なら保存せず、該当箇所にエラーを表示する", async ({ page }) => {
  await page.goto("/");
  await sidebar(page).getByRole("button", { name: "新規作成" }).click();
  await page.getByLabel("テンプレート名").fill("   ");
  await page.getByLabel("ベル1 秒").fill("75");
  await page.getByRole("button", { name: "保存" }).click();

  await expect(page.getByText("名前を入力してください")).toBeVisible();
  await expect(page.getByText("時刻を正しく入力してください")).toBeVisible();
  await expect(page.getByTestId("clock")).toHaveCount(0);
});

test("ベルの行を削除できる。最後の1行は削除できない", async ({ page }) => {
  await page.goto("/");
  await sidebar(page).getByRole("button", { name: "新規作成" }).click();
  await page.getByRole("button", { name: "ベル2を削除" }).click();
  await expect(page.getByLabel("ベル2 分")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "ベル1を削除" })).toBeDisabled();
});

test("新規作成をキャンセルすると元のタイマーに戻る", async ({ page, request }) => {
  await createTemplateViaApi(request, { name: "元のテンプレ", bells: [{ at: 60, count: 1 }] });
  await openTemplate(page, "元のテンプレ");
  await sidebar(page).getByRole("button", { name: "新規作成" }).click();
  await page.getByRole("button", { name: "キャンセル" }).click();
  await expect(page.getByRole("heading", { name: "元のテンプレ" })).toBeVisible();
});

test("サイドバーで切り替えられ、再読み込みしても最後に選んだテンプレートが開く", async ({ page, request }) => {
  await createTemplateViaApi(request, { name: "A", bells: [{ at: 60, count: 1 }] });
  await createTemplateViaApi(request, { name: "B", bells: [{ at: 120, count: 2 }] });
  await page.goto("/");
  // 新しい順なので先頭は B
  await expect(page.getByRole("heading", { name: "B", exact: true })).toBeVisible();

  await sidebar(page).getByRole("button", { name: "A", exact: true }).click();
  await expect(page.getByRole("heading", { name: "A", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "A", exact: true })).toBeVisible();
});

test("タイマー実行中に別のテンプレートを選ぶと確認し、キャンセルなら続行、OK なら止めて切り替える", async ({ page, request }) => {
  await createTemplateViaApi(request, { name: "A", bells: [{ at: 60, count: 1 }] });
  await createTemplateViaApi(request, { name: "B", bells: [{ at: 120, count: 1 }] });
  await openTemplate(page, "A");
  await page.getByRole("button", { name: "スタート" }).click();
  await expect(page.getByRole("button", { name: "一時停止" })).toBeVisible();

  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("タイマーを止めて切り替えますか？");
    void dialog.dismiss();
  });
  await sidebar(page).getByRole("button", { name: "B", exact: true }).click();
  await expect(page.getByRole("heading", { name: "A", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "一時停止" })).toBeVisible();

  page.once("dialog", (dialog) => void dialog.accept());
  await sidebar(page).getByRole("button", { name: "B", exact: true }).click();
  await expect(page.getByRole("heading", { name: "B", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "スタート" })).toBeVisible();
});

test("編集して保存するとタイマー画面に戻り、見出しとサイドバーに反映される", async ({ page, request }) => {
  await createTemplateViaApi(request, { name: "編集前", bells: [{ at: 60, count: 1 }] });
  await openTemplate(page, "編集前");
  await page.getByRole("button", { name: "編集", exact: true }).click();
  await expect(page.getByLabel("テンプレート名")).toHaveValue("編集前");
  await expect(page.getByLabel("ベル1 分")).toHaveValue("1");
  await page.getByLabel("テンプレート名").fill("編集後");
  await page.getByRole("button", { name: "保存" }).click();

  await expect(page.getByRole("heading", { name: "編集後" })).toBeVisible();
  await expect(sidebar(page).getByRole("button", { name: "編集後" })).toBeVisible();
  await expect(sidebar(page).getByRole("button", { name: "編集前" })).toHaveCount(0);
});

test("削除を確認すると一覧から消え、残りの先頭が選ばれる", async ({ page, request }) => {
  await createTemplateViaApi(request, { name: "残す", bells: [{ at: 60, count: 1 }] });
  const id = await createTemplateViaApi(request, { name: "消す", bells: [{ at: 60, count: 1 }] });
  await openTemplate(page, "消す");
  await page.getByRole("button", { name: "編集", exact: true }).click();
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("「消す」を本当に削除しますか？");
    void dialog.accept();
  });
  await page.getByRole("button", { name: "このテンプレートを削除" }).click();

  await expect(page.getByRole("heading", { name: "残す" })).toBeVisible();
  await expect(sidebar(page).getByRole("button", { name: "消す" })).toHaveCount(0);
  expect((await request.get(`/api/templates/${id}`)).status()).toBe(404);
});

test("削除の確認でキャンセルすると削除しない", async ({ page, request }) => {
  const id = await createTemplateViaApi(request, { name: "残すもの", bells: [{ at: 60, count: 1 }] });
  await openTemplate(page, "残すもの");
  await page.getByRole("button", { name: "編集", exact: true }).click();
  page.once("dialog", (dialog) => void dialog.dismiss());
  await page.getByRole("button", { name: "このテンプレートを削除" }).click();
  await expect(page.getByLabel("テンプレート名")).toHaveValue("残すもの");
  expect((await request.get(`/api/templates/${id}`)).status()).toBe(200);
});

test("以前のテンプレート個別 URL はトップへ転送する", async ({ page }) => {
  await page.goto("/t/abcdefghij");
  await expect(page).toHaveURL(/\/$/);
});
