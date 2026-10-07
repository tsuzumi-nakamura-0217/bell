import { expect, test } from "@playwright/test";
import { createTemplateViaApi } from "./helpers";

test("開いたテンプレートが最近使った一覧に出て、一覧から外せる（サーバーからは消えない）", async ({ page, request }) => {
  const id = await createTemplateViaApi(request, { name: "最近のテンプレ", bells: [{ at: 60, count: 1 }] });
  await page.goto("/");
  await expect(page.getByText("まだありません")).toBeVisible();

  await page.goto(`/t/${id}`);
  await expect(page.getByRole("heading", { name: "最近のテンプレ" })).toBeVisible();
  await page.goto("/");
  const item = page.getByRole("listitem").filter({ hasText: "最近のテンプレ" });
  await expect(item).toBeVisible();

  await item.getByRole("button", { name: "一覧から外す" }).click();
  await expect(page.getByText("最近のテンプレ")).toHaveCount(0);
  expect((await request.get(`/api/templates/${id}`)).status()).toBe(200);
});

test("トップから新規作成ページへ移動できる", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "新しいテンプレートを作る" }).click();
  await expect(page).toHaveURL(/\/new$/);
});
