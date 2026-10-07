import Link from "next/link";
import { RecentList } from "@/components/RecentList";

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-10 px-4 py-12">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold">ベルタイマー</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          発表の時間管理用タイマーです。好きな時刻に、好きな回数のベルを鳴らせます。
        </p>
        <Link
          href="/new"
          className="self-start rounded bg-zinc-900 px-5 py-3 font-semibold text-white dark:bg-white dark:text-zinc-900"
        >
          新しいテンプレートを作る
        </Link>
      </header>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">最近使ったテンプレート</h2>
        <RecentList />
      </section>
    </main>
  );
}
