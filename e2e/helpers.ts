import { expect, type APIRequestContext } from "@playwright/test";

export async function createTemplateViaApi(
  request: APIRequestContext,
  input: { name: string; bells: { at: number; count: number }[] },
): Promise<string> {
  const res = await request.post("/api/templates", { data: input });
  expect(res.status()).toBe(201);
  const { id } = (await res.json()) as { id: string };
  return id;
}
