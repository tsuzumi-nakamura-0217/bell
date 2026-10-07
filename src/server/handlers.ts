import { templateInputSchema, type TemplateInput } from "@/lib/bells";
import { deleteTemplate, getTemplate, insertTemplate, listTemplates, updateTemplate } from "./templates-repo";

const notFound = () => Response.json({ error: "not_found" }, { status: 404 });

type ParsedInput = { ok: true; input: TemplateInput } | { ok: false; response: Response };

async function parseInput(req: Request): Promise<ParsedInput> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { ok: false, response: Response.json({ error: "invalid_json" }, { status: 400 }) };
  }
  const result = templateInputSchema.safeParse(body);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.filter((p) => typeof p !== "symbol"),
      message: issue.message,
    }));
    return { ok: false, response: Response.json({ error: "invalid", issues }, { status: 400 }) };
  }
  return { ok: true, input: result.data };
}

export async function createTemplateHandler(db: D1Database, req: Request, now = Date.now()): Promise<Response> {
  const parsed = await parseInput(req);
  if (!parsed.ok) return parsed.response;
  const template = await insertTemplate(db, parsed.input, now);
  return Response.json(template, { status: 201 });
}

export async function listTemplatesHandler(db: D1Database): Promise<Response> {
  return Response.json(await listTemplates(db));
}

export async function getTemplateHandler(db: D1Database, id: string): Promise<Response> {
  const template = await getTemplate(db, id);
  return template ? Response.json(template) : notFound();
}

export async function updateTemplateHandler(
  db: D1Database,
  id: string,
  req: Request,
  now = Date.now(),
): Promise<Response> {
  const parsed = await parseInput(req);
  if (!parsed.ok) return parsed.response;
  const template = await updateTemplate(db, id, parsed.input, now);
  return template ? Response.json(template) : notFound();
}

export async function deleteTemplateHandler(db: D1Database, id: string): Promise<Response> {
  return (await deleteTemplate(db, id)) ? new Response(null, { status: 204 }) : notFound();
}

export async function withErrorHandling(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    console.error("[api] unhandled error", error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
