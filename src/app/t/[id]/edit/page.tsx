import Link from "next/link";
import { TemplateEditor } from "@/components/TemplateEditor";
import { TemplateNotFound } from "@/components/TemplateNotFound";
import { getDb } from "@/server/db";
import { getTemplate } from "@/server/templates-repo";

export const dynamic = "force-dynamic";

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const template = await getTemplate(getDb(), id);
  if (!template) return <TemplateNotFound id={id} />;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <Link href={`/t/${id}`} className="text-sm underline">
        ← タイマーへ
      </Link>
      <h1 className="text-2xl font-bold">テンプレートを編集</h1>
      <TemplateEditor initial={template} />
    </main>
  );
}
