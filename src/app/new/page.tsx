import Link from "next/link";
import { TemplateEditor } from "@/components/TemplateEditor";

export default function NewTemplatePage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <Link href="/" className="text-sm underline">
        ← トップへ
      </Link>
      <h1 className="text-2xl font-bold">新しいテンプレート</h1>
      <TemplateEditor />
    </main>
  );
}
