import { expect, type APIRequestContext, type Page } from "@playwright/test";

type TemplateInput = { name: string; bells: { at: number; count: number }[] };

export async function createTemplateViaApi(request: APIRequestContext, input: TemplateInput): Promise<string> {
  const res = await request.post("/api/templates", { data: input });
  expect(res.status()).toBe(201);
  const { id } = (await res.json()) as { id: string };
  return id;
}

/** ローカル D1 はテスト間で共有されるので、各テストの前に空にする */
export async function deleteAllTemplates(request: APIRequestContext): Promise<void> {
  const res = await request.get("/api/templates");
  expect(res.status()).toBe(200);
  for (const { id } of (await res.json()) as { id: string }[]) {
    expect((await request.delete(`/api/templates/${id}`)).status()).toBe(204);
  }
}

export function sidebar(page: Page) {
  return page.getByRole("navigation", { name: "テンプレート一覧" });
}

/** トップを開き、サイドバーからテンプレートを選んでタイマーの準備ができるまで待つ */
export async function openTemplate(page: Page, name: string): Promise<void> {
  await page.goto("/");
  await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
  await sidebar(page).getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "スタート" })).toBeEnabled();
}
