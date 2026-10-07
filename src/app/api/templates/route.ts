import { getDb } from "@/server/db";
import { createTemplateHandler, withErrorHandling } from "@/server/handlers";

export async function POST(req: Request) {
  return withErrorHandling(() => createTemplateHandler(getDb(), req));
}
