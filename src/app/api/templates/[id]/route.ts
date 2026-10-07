import { getDb } from "@/server/db";
import { deleteTemplateHandler, getTemplateHandler, updateTemplateHandler, withErrorHandling } from "@/server/handlers";

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Context) {
  const { id } = await params;
  return withErrorHandling(() => getTemplateHandler(getDb(), id));
}

export async function PUT(req: Request, { params }: Context) {
  const { id } = await params;
  return withErrorHandling(() => updateTemplateHandler(getDb(), id, req));
}

export async function DELETE(_req: Request, { params }: Context) {
  const { id } = await params;
  return withErrorHandling(() => deleteTemplateHandler(getDb(), id));
}
