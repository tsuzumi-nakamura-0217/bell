import type { Bell, Template, TemplateInput } from "@/lib/bells";
import { generateId } from "./id";

const MAX_ID_ATTEMPTS = 3;

interface TemplateRow {
  id: string;
  name: string;
  bells: string;
  created_at: number;
  updated_at: number;
}

function toTemplate(row: TemplateRow): Template {
  return {
    id: row.id,
    name: row.name,
    bells: JSON.parse(row.bells) as Bell[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}

export async function insertTemplate(
  db: D1Database,
  input: TemplateInput,
  now: number,
  genId: () => string = generateId,
): Promise<Template> {
  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
    const id = genId();
    try {
      await db
        .prepare("INSERT INTO templates (id, name, bells, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)")
        .bind(id, input.name, JSON.stringify(input.bells), now)
        .run();
      return { id, name: input.name, bells: input.bells, createdAt: now, updatedAt: now };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw new Error(`failed to allocate a unique template id after ${MAX_ID_ATTEMPTS} attempts`);
}

export async function listTemplates(db: D1Database): Promise<Template[]> {
  const { results } = await db
    .prepare("SELECT * FROM templates ORDER BY created_at DESC, id")
    .all<TemplateRow>();
  return results.map(toTemplate);
}

export async function getTemplate(db: D1Database, id: string): Promise<Template | null> {
  const row = await db.prepare("SELECT * FROM templates WHERE id = ?1").bind(id).first<TemplateRow>();
  return row ? toTemplate(row) : null;
}

export async function updateTemplate(
  db: D1Database,
  id: string,
  input: TemplateInput,
  now: number,
): Promise<Template | null> {
  const row = await db
    .prepare("UPDATE templates SET name = ?2, bells = ?3, updated_at = ?4 WHERE id = ?1 RETURNING *")
    .bind(id, input.name, JSON.stringify(input.bells), now)
    .first<TemplateRow>();
  return row ? toTemplate(row) : null;
}

export async function deleteTemplate(db: D1Database, id: string): Promise<boolean> {
  const result = await db.prepare("DELETE FROM templates WHERE id = ?1").bind(id).run();
  return result.meta.changes > 0;
}
