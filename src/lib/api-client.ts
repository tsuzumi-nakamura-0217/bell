import type { Template, TemplateInput } from "./bells";

export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`API request failed with status ${status}`);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json" } });
  if (!res.ok) throw new ApiError(res.status);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function createTemplate(input: TemplateInput): Promise<{ id: string }> {
  return request("/api/templates", { method: "POST", body: JSON.stringify(input) });
}

export function updateTemplate(id: string, input: TemplateInput): Promise<Template> {
  return request(`/api/templates/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input) });
}

export function deleteTemplate(id: string): Promise<void> {
  return request(`/api/templates/${encodeURIComponent(id)}`, { method: "DELETE" });
}
