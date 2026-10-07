import { getDb } from "@/server/db";
import { createTemplateHandler, listTemplatesHandler, withErrorHandling } from "@/server/handlers";

export async function GET() {
  return withErrorHandling(() => listTemplatesHandler(getDb()));
}

export async function POST(req: Request) {
  return withErrorHandling(() => createTemplateHandler(getDb(), req));
}
