import { expect, test } from "@playwright/test";
import { createTemplateViaApi } from "./helpers";

test("編集して保存するとタイマー画面に戻り、変更が反映される", async ({ page, request }) => {
  const id = await createTemplateViaApi(request, { name: "編集前", bells: [{ at: 60, count: 1 }] });
  await page.goto(`/t/${id}/edit`);
  await expect(page.getByLabel("テンプレート名")).toHaveValue("編集前");
  await expect(page.getByLabel("ベル1 分")).toHaveValue("1");
  await page.getByLabel("テンプレート名").fill("編集後");
  await page.getByRole("button", { name: "保存" }).click();

  await expect(page).toHaveURL(new RegExp(`/t/${id}$`));
  await expect(page.getByRole("heading", { name: "編集後" })).toBeVisible();
});

test("削除を確認すると削除してトップへ戻り、URL を開くと「見つかりません」になる", async ({ page, request }) => {
  const id = await createTemplateViaApi(request, { name: "消すもの", bells: [{ at: 60, count: 1 }] });
  await page.goto(`/t/${id}/edit`);
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("「消すもの」を本当に削除しますか？");
    void dialog.accept();
  });
  await page.getByRole("button", { name: "このテンプレートを削除" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto(`/t/${id}`);
  await expect(page.getByText("このテンプレートは見つかりません")).toBeVisible();
  await page.goto(`/t/${id}/edit`);
  await expect(page.getByText("このテンプレートは見つかりません")).toBeVisible();
});

test("削除の確認でキャンセルすると削除しない", async ({ page, request }) => {
  const id = await createTemplateViaApi(request, { name: "残すもの", bells: [{ at: 60, count: 1 }] });
  await page.goto(`/t/${id}/edit`);
  page.once("dialog", (dialog) => void dialog.dismiss());
  await page.getByRole("button", { name: "このテンプレートを削除" }).click();
  await expect(page).toHaveURL(new RegExp(`/t/${id}/edit$`));
  expect((await request.get(`/api/templates/${id}`)).status()).toBe(200);
});
