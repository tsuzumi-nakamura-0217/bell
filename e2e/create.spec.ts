import { expect, test } from "@playwright/test";

test("テンプレートを作成すると共有URLが表示され、開くとタイマー画面になる", async ({ page }) => {
  await page.goto("/new");
  await page.getByLabel("テンプレート名").fill("LT大会 5分");
  await page.getByLabel("ベル1 分").fill("4");
  await page.getByLabel("ベル1 秒").fill("0");
  await page.getByLabel("ベル2 分").fill("5");
  await page.getByLabel("ベル2 秒").fill("0");
  await page.getByLabel("ベル2 回数").selectOption("2");
  await page.getByRole("button", { name: "ベルを追加" }).click();
  await page.getByLabel("ベル3 分").fill("7");
  await page.getByLabel("ベル3 秒").fill("0");
  await page.getByLabel("ベル3 回数").selectOption("3");
  await page.getByRole("button", { name: "保存" }).click();

  const shareUrl = page.getByTestId("share-url");
  await expect(shareUrl).toHaveValue(/\/t\/[a-z0-9]{10}$/);

  await page.getByRole("link", { name: "タイマーを開く" }).click();
  await expect(page.getByRole("heading", { name: "LT大会 5分" })).toBeVisible();
});

test("入力が不正なら保存せず、該当箇所にエラーを表示する", async ({ page }) => {
  await page.goto("/new");
  await page.getByLabel("テンプレート名").fill("   ");
  await page.getByLabel("ベル1 秒").fill("75");
  await page.getByRole("button", { name: "保存" }).click();

  await expect(page.getByText("名前を入力してください")).toBeVisible();
  await expect(page.getByText("時刻を正しく入力してください")).toBeVisible();
  await expect(page.getByTestId("share-url")).toHaveCount(0);
});

test("ベルの行を削除できる。最後の1行は削除できない", async ({ page }) => {
  await page.goto("/new");
  await page.getByRole("button", { name: "ベル2を削除" }).click();
  await expect(page.getByLabel("ベル2 分")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "ベル1を削除" })).toBeDisabled();
});
