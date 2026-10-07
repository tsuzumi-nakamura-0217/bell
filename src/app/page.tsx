import { BellApp } from "@/components/BellApp";
import { getDb } from "@/server/db";
import { listTemplates } from "@/server/templates-repo";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const templates = await listTemplates(getDb());
  return <BellApp initialTemplates={templates} />;
}
