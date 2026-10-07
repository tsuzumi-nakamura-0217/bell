import { TemplateNotFound } from "@/components/TemplateNotFound";
import { TimerView } from "@/components/TimerView";
import { getDb } from "@/server/db";
import { getTemplate } from "@/server/templates-repo";

export const dynamic = "force-dynamic";

export default async function TimerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const template = await getTemplate(getDb(), id);
  if (!template) return <TemplateNotFound id={id} />;
  return <TimerView template={template} />;
}
