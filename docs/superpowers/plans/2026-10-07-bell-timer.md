# ベルタイマー Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 発表会向けに、任意の時刻に指定回数のベルを鳴らすタイマーを作る。ベル設定はテンプレートとして D1 に保存し、共有 URL で誰でも使用・編集・削除できるようにする。

**Architecture:** Next.js（App Router）を `@opennextjs/cloudflare` で Cloudflare Workers に載せる。API は Route Handlers が D1 バインディングを直接使う。ドメインロジック（スキーマ、タイマー状態、ベル予約計算、最近使った一覧）は React から独立した純粋 TypeScript にして Vitest でテストする。D1 を扱うハンドラーは Workers ランタイム上（`@cloudflare/vitest-pool-workers`）でテストする。画面は Playwright で E2E テストする。

**Tech Stack:** Next.js 16.4 / React 19 / TypeScript / Tailwind CSS v4 / @opennextjs/cloudflare 1.20 / wrangler 4 / Cloudflare D1 / zod 4 / Vitest 4.1 / @cloudflare/vitest-pool-workers 0.22 / Playwright

**Spec:** `docs/superpowers/specs/2026-10-07-bell-timer-design.md`

## Global Constraints

- Node.js 22（`node -v` → v22.x）。パッケージマネージャーは npm
- `next@16.4.x`、`@opennextjs/cloudflare@^1.20.9`、`wrangler@^4.148.0`、`zod@^4.6.5`
- `vitest@^4.1.0`（`@cloudflare/vitest-pool-workers@0.22` の peer 要件。vitest 5 は入れない）
- Workers の `compatibility_date` は `"2026-08-01"`、`compatibility_flags` に `nodejs_compat` を含める
- D1 バインディング名は `DB`、データベース名は `bell-db`
- UI 文言はすべて日本語
- テンプレート名: 前後の空白を除いて 1〜100 文字
- ベル: 1〜20 個。`at` は整数 1〜18000 秒で重複不可。`count` は整数 1〜5
- ID: `[a-z0-9]` 10 文字。主キー衝突時は最大 3 回まで再生成
- 複数回のベルは 350ms 間隔で鳴らす
- localStorage キー `bell:recent`。`lastOpenedAt` の降順で最大 20 件
- 認証なし。URL を知っていれば誰でも取得・更新・削除できる
- コミットメッセージの末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` を付ける

## Review Focus

1. **スタートの二重クリック**: スタートを素早く 2 回押しても、ベルの予約は 1 回分だけになる（予約が二重になると、すべてのベルが倍の回数鳴る）→ Task 4 の `TimerController` テスト「toggle の多重呼び出し」
2. **ボタンにフォーカスがある状態でスペースキーを押す**: タイマーのスタート／一時停止が 1 回だけ切り替わる。フォーカス中のボタン（リセットなど）は誤って作動しない → Task 9 の E2E「スペースキー」
3. **タイマー画面から離れる**: 予約済みのベルがすべて止まり、別のページで鳴り出さない → Task 4 の `TimerController.dispose` テストと Task 5 の `BellPlayer.close` テスト
4. **複数回ベルの途中で一時停止して再開する**: 残りの打音だけが鳴り、鳴り終わった打音は繰り返さない → Task 3 の `planStrikes` テスト
5. **編集フォームへの不正な入力**（秒に 75、空欄、文字、空白だけの名前）: クラッシュや NaN 保存にならず、該当行にエラーが出る。API に不正な JSON を送ると 500 ではなく 400 を返す → Task 2 のフォーム変換テスト、Task 6 の API テスト

---

## File Structure

```
migrations/0001_create_templates.sql   D1 スキーマ
wrangler.jsonc                         Workers / D1 / assets 設定
open-next.config.ts                    OpenNext 設定（キャッシュ override なし）
next.config.ts                         initOpenNextCloudflareForDev を呼ぶ
vitest.config.ts                       単体テスト（node 環境、src/**/*.test.ts）
vitest.workers.config.ts               API テスト（Workers ランタイム、test/api/**）
playwright.config.ts                   E2E（e2e/**）
cloudflare-env.d.ts                    `wrangler types` の生成物（コミットする）

src/lib/time.ts            秒 → "m:ss" / "h:mm:ss" 表示
src/lib/bells.ts           zod スキーマと型（Bell, TemplateInput, Template）
src/lib/editor-form.ts     編集フォームの行 ⇄ 入力値の変換、zod エラー → 行ごとのエラー
src/lib/timer.ts           タイマー状態（純粋関数）
src/lib/schedule.ts        打音予約の計算、終了時刻、次のベル
src/lib/timer-controller.ts タイマー状態＋音の予約を束ねるコントローラー（React 非依存）
src/lib/recent.ts          最近使ったテンプレート（localStorage）
src/lib/api-client.ts      ブラウザから API を呼ぶ fetch ラッパー
src/audio/bell-player.ts   Web Audio による卓上ベル音の合成と予約・取り消し
src/lib/wake-lock.ts       Wake Lock API の薄いラッパー

src/server/id.ts            ID 生成
src/server/templates-repo.ts D1 CRUD
src/server/handlers.ts      Request → Response の API ロジック（Next 非依存）
src/server/db.ts            getCloudflareContext から D1 を取り出す

src/app/api/templates/route.ts        POST
src/app/api/templates/[id]/route.ts   GET / PUT / DELETE
src/app/page.tsx                      トップ
src/app/new/page.tsx                  新規作成
src/app/t/[id]/page.tsx               タイマー
src/app/t/[id]/edit/page.tsx          編集

src/hooks/use-timer.ts                TimerController を React に繋ぐ（rAF 更新、Wake Lock）
src/components/TemplateEditor.tsx
src/components/TimerView.tsx
src/components/TemplateNotFound.tsx
src/components/RecentList.tsx

test/api/*.ts      Workers ランタイムで動く API テスト
e2e/*.spec.ts      Playwright
```

---

### Task 1: プロジェクトの雛形と時刻フォーマット

**Files:**
- Create: Next.js の雛形一式（create-next-app）、`wrangler.jsonc`、`open-next.config.ts`、`public/_headers`、`vitest.config.ts`、`cloudflare-env.d.ts`（生成）
- Modify: `next.config.ts`、`package.json`（scripts）、`.gitignore`、`tsconfig.json`
- Create: `src/lib/time.ts`
- Test: `src/lib/time.test.ts`

**Interfaces:**
- Produces: `formatClock(totalSeconds: number): string`。`@/*` → `src/*` のエイリアス。npm scripts の `dev` `build` `test` `test:api` `test:e2e` `preview` `deploy` `cf-typegen` `db:migrate:local` `db:migrate:remote`

- [ ] **Step 1: Next.js の雛形を一時ディレクトリに作ってリポジトリ直下へ移す**

リポジトリ直下に `docs/` があり、create-next-app が空でないディレクトリを拒否するため、一時ディレクトリを経由する。

```bash
cd /Users/nakamuratuzumi/Github_tsuzumi-nakamura-0217/bell
npx --yes create-next-app@16.4.0 .scaffold --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --turbopack --disable-git --skip-install --yes
rsync -a .scaffold/ ./
rm -rf .scaffold
npm install
```

Expected: `package.json`、`src/app/page.tsx`、`next.config.ts`、`tsconfig.json` ができる。`npm install` が成功する。

- [ ] **Step 2: Cloudflare 関連とテスト関連の依存を入れる**

```bash
npm install @opennextjs/cloudflare@^1.20.9 zod@^4.6.5
npm install -D wrangler@^4.148.0 vitest@^4.1.0 @cloudflare/vitest-pool-workers@^0.22.0 @playwright/test
npx playwright install chromium
```

Expected: いずれもエラーなく完了する。`npm ls vitest` が 4.x を表示する。

- [ ] **Step 3: `wrangler.jsonc` を作る**

`database_id` はデプロイ時（Task 11）に本物の値に差し替える。ローカル開発とテストではダミー値のまま動く。

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "bell",
  "main": ".open-next/worker.js",
  "compatibility_date": "2026-08-01",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "bell-db",
      "database_id": "00000000-0000-0000-0000-000000000000",
      "migrations_dir": "migrations"
    }
  ],
  "observability": { "enabled": true }
}
```

- [ ] **Step 4: `open-next.config.ts`、`next.config.ts`、`public/_headers` を作る**

`open-next.config.ts`（ISR を使わないので incremental cache の override は付けない）:

```ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});
```

`next.config.ts`（全体を置き換える）:

```ts
import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {};

export default nextConfig;

initOpenNextCloudflareForDev();
```

`public/_headers`:

```
/_next/static/*
  Cache-Control: public,max-age=31536000,immutable
```

- [ ] **Step 5: `package.json` の scripts を設定する**

`scripts` を次のとおりにする（create-next-app が作った `dev` `build` `start` `lint` は残し、残りを追加する）:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run --config vitest.config.ts",
    "test:api": "vitest run --config vitest.workers.config.ts",
    "test:e2e": "playwright test",
    "preview": "opennextjs-cloudflare build && opennextjs-cloudflare preview",
    "deploy": "opennextjs-cloudflare build && opennextjs-cloudflare deploy",
    "cf-typegen": "wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts",
    "db:migrate:local": "wrangler d1 migrations apply bell-db --local",
    "db:migrate:remote": "wrangler d1 migrations apply bell-db --remote"
  }
}
```

`create-next-app` が作った `dev` や `lint` の中身が上と違う場合（`next dev --turbopack` など）は、そちらを残してよい。

- [ ] **Step 6: `.gitignore` と `tsconfig.json` を調整する**

`.gitignore` の末尾に追加する:

```
# cloudflare
.open-next
.wrangler
.dev.vars

# playwright
/test-results
/playwright-report
/blob-report
/playwright/.cache
```

`tsconfig.json` の `"exclude"` を `["node_modules", "test"]` にする。`test/` 配下は Workers 専用の型（`cloudflare:test`）を使うため、Next のビルド時の型チェックから外す。

- [ ] **Step 7: Cloudflare の型を生成する**

```bash
npm run cf-typegen
```

Expected: `cloudflare-env.d.ts` ができ、`interface CloudflareEnv` に `DB: D1Database;` が含まれる。

- [ ] **Step 8: `vitest.config.ts` を作る**

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 9: 失敗するテストを書く**

`src/lib/time.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatClock } from "./time";

describe("formatClock", () => {
  it("1時間未満は m:ss", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(5)).toBe("0:05");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(900)).toBe("15:00");
  });

  it("1時間以上は h:mm:ss", () => {
    expect(formatClock(3600)).toBe("1:00:00");
    expect(formatClock(3725)).toBe("1:02:05");
  });

  it("小数は切り捨て、負数は 0 として扱う", () => {
    expect(formatClock(59.9)).toBe("0:59");
    expect(formatClock(-3)).toBe("0:00");
  });
});
```

- [ ] **Step 10: テストが失敗することを確認する**

Run: `npm test`
Expected: FAIL（`./time` が見つからない）

- [ ] **Step 11: 実装する**

`src/lib/time.ts`:

```ts
/** 秒数を "m:ss"（1時間以上は "h:mm:ss"）に整形する。小数は切り捨て、負数は 0 扱い。 */
export function formatClock(totalSeconds: number): string {
  const total = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`;
  }
  return `${minutes}:${seconds}`;
}
```

- [ ] **Step 12: テストとビルドが通ることを確認する**

Run: `npm test && npm run build`
Expected: テストは PASS。`next build` が成功する。

- [ ] **Step 13: コミットする**

```bash
git add -A
git commit -m "chore: scaffold Next.js on Cloudflare Workers with D1 and Vitest

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: テンプレートのスキーマと編集フォームの変換

**Files:**
- Create: `src/lib/bells.ts`、`src/lib/editor-form.ts`
- Test: `src/lib/bells.test.ts`、`src/lib/editor-form.test.ts`

**Interfaces:**
- Produces（`src/lib/bells.ts`）:
  - `MAX_BELLS = 20`、`MAX_AT_SECONDS = 18000`、`MAX_COUNT = 5`
  - `bellSchema`、`templateInputSchema`（zod。検証後に `bells` を `at` の昇順に並べ替える）
  - `type Bell = { at: number; count: number }`
  - `type TemplateInput = { name: string; bells: Bell[] }`
  - `interface Template extends TemplateInput { id: string; createdAt: number; updatedAt: number }`
- Produces（`src/lib/editor-form.ts`）:
  - `interface BellRow { key: string; minutes: string; seconds: string; count: number }`
  - `newRow(atSeconds: number, count: number): BellRow`
  - `templateToRows(bells: readonly Bell[]): BellRow[]`
  - `rowsToCandidate(name: string, rows: readonly BellRow[]): { name: string; bells: { at: number; count: number }[] }`
  - `interface FormErrors { name?: string; rows: Record<number, string>; general?: string }`
  - `issuesToErrors(issues: readonly { path: readonly PropertyKey[]; message: string }[]): FormErrors`

- [ ] **Step 1: スキーマの失敗するテストを書く**

`src/lib/bells.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { templateInputSchema } from "./bells";

const valid = { name: "LT大会", bells: [{ at: 300, count: 2 }, { at: 240, count: 1 }] };

describe("templateInputSchema", () => {
  it("正しい入力を受け付け、ベルを時刻順に並べ替え、名前の前後の空白を除く", () => {
    const r = templateInputSchema.parse({ ...valid, name: "  LT大会  " });
    expect(r.name).toBe("LT大会");
    expect(r.bells).toEqual([{ at: 240, count: 1 }, { at: 300, count: 2 }]);
  });

  it("名前: 空白のみ・101文字は不可、100文字は可", () => {
    expect(templateInputSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
    expect(templateInputSchema.safeParse({ ...valid, name: "あ".repeat(101) }).success).toBe(false);
    expect(templateInputSchema.safeParse({ ...valid, name: "あ".repeat(100) }).success).toBe(true);
  });

  it("ベルの個数: 0個と21個は不可、20個は可", () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ at: i + 1, count: 1 }));
    expect(templateInputSchema.safeParse({ ...valid, bells: [] }).success).toBe(false);
    expect(templateInputSchema.safeParse({ ...valid, bells: many(21) }).success).toBe(false);
    expect(templateInputSchema.safeParse({ ...valid, bells: many(20) }).success).toBe(true);
  });

  it("at: 0・18001・小数・NaN は不可、1 と 18000 は可", () => {
    for (const at of [0, 18001, 1.5, Number.NaN]) {
      expect(templateInputSchema.safeParse({ ...valid, bells: [{ at, count: 1 }] }).success).toBe(false);
    }
    for (const at of [1, 18000]) {
      expect(templateInputSchema.safeParse({ ...valid, bells: [{ at, count: 1 }] }).success).toBe(true);
    }
  });

  it("count: 0 と 6 は不可、1 と 5 は可", () => {
    for (const count of [0, 6]) {
      expect(templateInputSchema.safeParse({ ...valid, bells: [{ at: 1, count }] }).success).toBe(false);
    }
    for (const count of [1, 5]) {
      expect(templateInputSchema.safeParse({ ...valid, bells: [{ at: 1, count }] }).success).toBe(true);
    }
  });

  it("時刻の重複は不可で、2つ目の行（元の並び順）にエラーが付く", () => {
    const r = templateInputSchema.safeParse({
      ...valid,
      bells: [{ at: 60, count: 1 }, { at: 120, count: 1 }, { at: 60, count: 2 }],
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path)).toContainEqual(["bells", 2, "at"]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm test -- src/lib/bells.test.ts`
Expected: FAIL（`./bells` が見つからない）

- [ ] **Step 3: スキーマを実装する**

`src/lib/bells.ts`:

```ts
import { z } from "zod";

export const MAX_BELLS = 20;
export const MAX_AT_SECONDS = 18000;
export const MAX_COUNT = 5;

export const bellSchema = z.object({
  at: z
    .number({ error: "時刻を正しく入力してください" })
    .int({ error: "時刻を正しく入力してください" })
    .min(1, { error: "時刻は1秒以上にしてください" })
    .max(MAX_AT_SECONDS, { error: "時刻は5時間以内にしてください" }),
  count: z
    .number({ error: "回数は1〜5回です" })
    .int({ error: "回数は1〜5回です" })
    .min(1, { error: "回数は1〜5回です" })
    .max(MAX_COUNT, { error: "回数は1〜5回です" }),
});

export const templateInputSchema = z.object({
  name: z
    .string({ error: "名前を入力してください" })
    .trim()
    .min(1, { error: "名前を入力してください" })
    .max(100, { error: "名前は100文字以内にしてください" }),
  bells: z
    .array(bellSchema)
    .min(1, { error: "ベルを1つ以上設定してください" })
    .max(MAX_BELLS, { error: `ベルは${MAX_BELLS}個までです` })
    .superRefine((bells, ctx) => {
      const seen = new Set<number>();
      bells.forEach((bell, index) => {
        if (seen.has(bell.at)) {
          ctx.addIssue({ code: "custom", message: "同じ時刻のベルがあります", path: [index, "at"] });
        }
        seen.add(bell.at);
      });
    })
    .transform((bells) => [...bells].sort((a, b) => a.at - b.at)),
});

export type Bell = z.output<typeof bellSchema>;
export type TemplateInput = z.output<typeof templateInputSchema>;

export interface Template extends TemplateInput {
  id: string;
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **Step 4: スキーマのテストが通ることを確認する**

Run: `npm test -- src/lib/bells.test.ts`
Expected: PASS

- [ ] **Step 5: フォーム変換の失敗するテストを書く**

`src/lib/editor-form.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { templateInputSchema } from "./bells";
import { issuesToErrors, newRow, rowsToCandidate, templateToRows, type BellRow } from "./editor-form";

const row = (minutes: string, seconds: string, count = 1): BellRow => ({ key: `${minutes}:${seconds}`, minutes, seconds, count });

describe("rowsToCandidate", () => {
  it("分と秒を秒数に変換する。空欄は 0 として扱う", () => {
    expect(rowsToCandidate("x", [row("4", "30", 2), row("", "45"), row("5", "")]).bells).toEqual([
      { at: 270, count: 2 },
      { at: 45, count: 1 },
      { at: 300, count: 1 },
    ]);
  });

  it("秒が 60 以上・数字以外・負数は NaN にしてスキーマで弾かれるようにする", () => {
    for (const r of [row("1", "75"), row("a", "0"), row("1", "-5"), row("1.5", "0")]) {
      const at = rowsToCandidate("x", [r]).bells[0].at;
      expect(Number.isNaN(at)).toBe(true);
    }
  });
});

describe("templateToRows / newRow", () => {
  it("秒数を分と秒の文字列に分解する", () => {
    const rows = templateToRows([{ at: 270, count: 2 }]);
    expect(rows[0]).toMatchObject({ minutes: "4", seconds: "30", count: 2 });
  });

  it("各行の key は一意", () => {
    expect(newRow(60, 1).key).not.toBe(newRow(60, 1).key);
  });
});

describe("issuesToErrors", () => {
  it("名前・行・その他のエラーに振り分ける。同じ行は最初のメッセージを残す", () => {
    const r = templateInputSchema.safeParse(
      rowsToCandidate("   ", [row("1", "0"), row("1", "75"), row("1", "0")]),
    );
    expect(r.success).toBe(false);
    const errors = issuesToErrors(r.error!.issues);
    expect(errors.name).toBe("名前を入力してください");
    expect(errors.rows[1]).toBe("時刻を正しく入力してください");
    expect(errors.general).toBeUndefined();
  });

  it("ベルが 0 個のときは general に入る", () => {
    const r = templateInputSchema.safeParse(rowsToCandidate("x", []));
    expect(issuesToErrors(r.error!.issues).general).toBe("ベルを1つ以上設定してください");
  });
});
```

- [ ] **Step 6: テストが失敗することを確認する**

Run: `npm test -- src/lib/editor-form.test.ts`
Expected: FAIL（`./editor-form` が見つからない）

- [ ] **Step 7: 実装する**

`src/lib/editor-form.ts`:

```ts
import type { Bell } from "./bells";

export interface BellRow {
  key: string;
  minutes: string;
  seconds: string;
  count: number;
}

export interface FormErrors {
  name?: string;
  rows: Record<number, string>;
  general?: string;
}

let keySeq = 0;

export function newRow(atSeconds: number, count: number): BellRow {
  keySeq += 1;
  return {
    key: `row-${keySeq}`,
    minutes: String(Math.floor(atSeconds / 60)),
    seconds: String(atSeconds % 60),
    count,
  };
}

export function templateToRows(bells: readonly Bell[]): BellRow[] {
  return bells.map((bell) => newRow(bell.at, bell.count));
}

/** 空欄は 0、0 以上の整数以外は NaN。 */
function parsePart(value: string): number {
  const trimmed = value.trim();
  if (trimmed === "") return 0;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

function rowToSeconds(row: BellRow): number {
  const minutes = parsePart(row.minutes);
  const seconds = parsePart(row.seconds);
  if (seconds > 59) return Number.NaN;
  return minutes * 60 + seconds;
}

/** フォームの状態を templateInputSchema に渡せる形に変換する（検証はしない）。 */
export function rowsToCandidate(name: string, rows: readonly BellRow[]) {
  return {
    name,
    bells: rows.map((row) => ({ at: rowToSeconds(row), count: row.count })),
  };
}

export function issuesToErrors(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): FormErrors {
  const errors: FormErrors = { rows: {} };
  for (const issue of issues) {
    const [head, index] = issue.path;
    if (head === "name") {
      errors.name ??= issue.message;
    } else if (head === "bells" && typeof index === "number") {
      errors.rows[index] ??= issue.message;
    } else {
      errors.general ??= issue.message;
    }
  }
  return errors;
}
```

- [ ] **Step 8: テストが通ることを確認する**

Run: `npm test`
Expected: すべて PASS

- [ ] **Step 9: コミットする**

```bash
git add src/lib/bells.ts src/lib/bells.test.ts src/lib/editor-form.ts src/lib/editor-form.test.ts
git commit -m "feat: add template schema and editor form conversion

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: タイマーの状態とベル予約の計算

**Files:**
- Create: `src/lib/timer.ts`、`src/lib/schedule.ts`
- Test: `src/lib/timer.test.ts`、`src/lib/schedule.test.ts`

**Interfaces:**
- Consumes: `Bell`（Task 2）
- Produces（`src/lib/timer.ts`）:
  - `type TimerPhase = "idle" | "running" | "paused"`
  - `interface TimerState { readonly phase: TimerPhase; readonly accumulatedMs: number; readonly startedAt: number | null }`
  - `initialTimer: TimerState`
  - `startTimer(s: TimerState, now: number): TimerState`
  - `pauseTimer(s: TimerState, now: number): TimerState`
  - `resetTimer(): TimerState`
  - `elapsedMs(s: TimerState, now: number): number`
  - `isOvertime(s: TimerState, now: number, endAtMs: number): boolean`
- Produces（`src/lib/schedule.ts`）:
  - `STRIKE_INTERVAL_MS = 350`
  - `interface Strike { bellIndex: number; atMs: number; delayMs: number }`
  - `planStrikes(bells: readonly Bell[], elapsed: number): Strike[]`
  - `endMs(bells: readonly Bell[]): number`
  - `nextBell(bells: readonly Bell[], elapsed: number): { bell: Bell; index: number } | null`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/timer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { elapsedMs, initialTimer, isOvertime, pauseTimer, resetTimer, startTimer } from "./timer";

describe("timer", () => {
  it("開始から現在時刻までの差を経過時間とする", () => {
    const s = startTimer(initialTimer, 1000);
    expect(s.phase).toBe("running");
    expect(elapsedMs(s, 4500)).toBe(3500);
  });

  it("一時停止中の時間は経過時間に含めない", () => {
    let s = startTimer(initialTimer, 0);
    s = pauseTimer(s, 2000);
    expect(s.phase).toBe("paused");
    expect(elapsedMs(s, 9000)).toBe(2000);
    s = startTimer(s, 10_000);
    expect(elapsedMs(s, 11_000)).toBe(3000);
  });

  it("実行中の startTimer、実行中以外の pauseTimer は何もしない", () => {
    const running = startTimer(initialTimer, 0);
    expect(startTimer(running, 500)).toBe(running);
    expect(pauseTimer(initialTimer, 500)).toBe(initialTimer);
  });

  it("現在時刻が開始時刻より前でも経過時間は減らない", () => {
    const s = startTimer({ phase: "paused", accumulatedMs: 1000, startedAt: null }, 5000);
    expect(elapsedMs(s, 4000)).toBe(1000);
  });

  it("resetTimer で待機状態に戻る", () => {
    expect(resetTimer()).toEqual({ phase: "idle", accumulatedMs: 0, startedAt: null });
  });

  it("終了時刻以降は超過。待機中は超過にしない。一時停止中も超過は保つ", () => {
    const s = startTimer(initialTimer, 0);
    expect(isOvertime(s, 4999, 5000)).toBe(false);
    expect(isOvertime(s, 5000, 5000)).toBe(true);
    expect(isOvertime(pauseTimer(s, 6000), 99_999, 5000)).toBe(true);
    expect(isOvertime(initialTimer, 99_999, 0)).toBe(false);
  });
});
```

`src/lib/schedule.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { endMs, nextBell, planStrikes, STRIKE_INTERVAL_MS } from "./schedule";

const bells = [
  { at: 240, count: 1 },
  { at: 300, count: 3 },
];

describe("planStrikes", () => {
  it("開始時はすべての打音を予約し、複数回ベルは 350ms 間隔にする", () => {
    expect(planStrikes(bells, 0)).toEqual([
      { bellIndex: 0, atMs: 240_000, delayMs: 240_000 },
      { bellIndex: 1, atMs: 300_000, delayMs: 300_000 },
      { bellIndex: 1, atMs: 300_000 + STRIKE_INTERVAL_MS, delayMs: 300_000 + STRIKE_INTERVAL_MS },
      { bellIndex: 1, atMs: 300_000 + 2 * STRIKE_INTERVAL_MS, delayMs: 300_000 + 2 * STRIKE_INTERVAL_MS },
    ]);
  });

  it("再開時は過ぎたベルを除き、残り時間を delay にする", () => {
    expect(planStrikes(bells, 250_000).map((s) => [s.bellIndex, s.delayMs])).toEqual([
      [1, 50_000],
      [1, 50_350],
      [1, 50_700],
    ]);
  });

  it("複数回ベルの途中で再開すると、残りの打音だけを予約する", () => {
    expect(planStrikes(bells, 300_400).map((s) => s.atMs)).toEqual([300_700]);
  });

  it("ちょうど打音の時刻で再開した場合、その打音は鳴ったものとして除く", () => {
    expect(planStrikes(bells, 240_000).map((s) => s.atMs)[0]).toBe(300_000);
  });

  it("すべて過ぎていれば空", () => {
    expect(planStrikes(bells, 400_000)).toEqual([]);
  });
});

describe("endMs / nextBell", () => {
  it("終了時刻は最後のベルの時刻", () => {
    expect(endMs(bells)).toBe(300_000);
    expect(endMs([{ at: 90, count: 1 }, { at: 30, count: 1 }])).toBe(90_000);
  });

  it("次のベルは、経過時間より後の最初のベル", () => {
    expect(nextBell(bells, 0)).toEqual({ bell: bells[0], index: 0 });
    expect(nextBell(bells, 240_000)).toEqual({ bell: bells[1], index: 1 });
    expect(nextBell(bells, 300_000)).toBeNull();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm test -- src/lib/timer.test.ts src/lib/schedule.test.ts`
Expected: FAIL（モジュールが見つからない）

- [ ] **Step 3: 実装する**

`src/lib/timer.ts`:

```ts
export type TimerPhase = "idle" | "running" | "paused";

export interface TimerState {
  readonly phase: TimerPhase;
  /** 直近の開始より前に積み上がった経過時間 */
  readonly accumulatedMs: number;
  /** 実行中のときの開始時刻（時計の値）。実行中以外は null */
  readonly startedAt: number | null;
}

export const initialTimer: TimerState = { phase: "idle", accumulatedMs: 0, startedAt: null };

export function startTimer(state: TimerState, now: number): TimerState {
  if (state.phase === "running") return state;
  return { phase: "running", accumulatedMs: state.accumulatedMs, startedAt: now };
}

export function pauseTimer(state: TimerState, now: number): TimerState {
  if (state.phase !== "running") return state;
  return { phase: "paused", accumulatedMs: elapsedMs(state, now), startedAt: null };
}

export function resetTimer(): TimerState {
  return initialTimer;
}

export function elapsedMs(state: TimerState, now: number): number {
  if (state.phase !== "running" || state.startedAt === null) return state.accumulatedMs;
  return state.accumulatedMs + Math.max(0, now - state.startedAt);
}

export function isOvertime(state: TimerState, now: number, endAtMs: number): boolean {
  return state.phase !== "idle" && elapsedMs(state, now) >= endAtMs;
}
```

`src/lib/schedule.ts`:

```ts
import type { Bell } from "./bells";

export const STRIKE_INTERVAL_MS = 350;

export interface Strike {
  bellIndex: number;
  /** タイマー開始からの打音時刻 */
  atMs: number;
  /** 経過時間 elapsed から打音までの待ち時間 */
  delayMs: number;
}

/** elapsed より後に鳴るべき打音を、時刻順に返す。 */
export function planStrikes(bells: readonly Bell[], elapsed: number): Strike[] {
  const strikes: Strike[] = [];
  bells.forEach((bell, bellIndex) => {
    for (let k = 0; k < bell.count; k++) {
      const atMs = bell.at * 1000 + k * STRIKE_INTERVAL_MS;
      if (atMs > elapsed) strikes.push({ bellIndex, atMs, delayMs: atMs - elapsed });
    }
  });
  return strikes.sort((a, b) => a.atMs - b.atMs);
}

export function endMs(bells: readonly Bell[]): number {
  return Math.max(...bells.map((bell) => bell.at)) * 1000;
}

export function nextBell(bells: readonly Bell[], elapsed: number): { bell: Bell; index: number } | null {
  const index = bells.findIndex((bell) => bell.at * 1000 > elapsed);
  return index === -1 ? null : { bell: bells[index], index };
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test`
Expected: すべて PASS

- [ ] **Step 5: コミットする**

```bash
git add src/lib/timer.ts src/lib/timer.test.ts src/lib/schedule.ts src/lib/schedule.test.ts
git commit -m "feat: add timer state and bell strike planning

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: TimerController（タイマー状態と音の予約をまとめる）

**Files:**
- Create: `src/lib/timer-controller.ts`
- Test: `src/lib/timer-controller.test.ts`

**Interfaces:**
- Consumes: `Bell`（Task 2）、`initialTimer` `startTimer` `pauseTimer` `resetTimer` `TimerState`（Task 3）、`planStrikes`（Task 3）
- Produces:
  - `interface StrikePlayer { unlock(): Promise<void>; scheduleDelays(delaysMs: readonly number[]): void; ringNow(): void; cancelAll(): void; close(): Promise<void> }`
  - `class TimerController`
    - `constructor(bells: readonly Bell[], player: StrikePlayer | null, clock?: () => number)`（clock の既定値は `() => performance.now()`）
    - `getState(): TimerState`
    - `subscribe(listener: () => void): () => void`
    - `toggle(): Promise<void>`（停止中なら開始・再開、実行中なら一時停止）
    - `reset(): void`
    - `ringNow(): Promise<void>`
    - `dispose(): Promise<void>`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/timer-controller.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { TimerController, type StrikePlayer } from "./timer-controller";

const bells = [
  { at: 2, count: 1 },
  { at: 4, count: 2 },
];

function fakePlayer() {
  let releaseUnlock: () => void = () => {};
  const player = {
    unlock: vi.fn(() => new Promise<void>((resolve) => { releaseUnlock = resolve; })),
    scheduleDelays: vi.fn(),
    ringNow: vi.fn(),
    cancelAll: vi.fn(),
    close: vi.fn(async () => {}),
  } satisfies StrikePlayer;
  return { player, releaseUnlock: () => releaseUnlock() };
}

function fakeClock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe("TimerController", () => {
  it("開始時に unlock してから全打音を予約し、running にする", async () => {
    const { player, releaseUnlock } = fakePlayer();
    const clock = fakeClock();
    const c = new TimerController(bells, player, clock.now);
    const p = c.toggle();
    releaseUnlock();
    await p;
    expect(player.scheduleDelays).toHaveBeenCalledWith([2000, 4000, 4350]);
    expect(c.getState().phase).toBe("running");
  });

  it("toggle の多重呼び出し（スタートの二重クリック）でも予約は1回だけ", async () => {
    const { player, releaseUnlock } = fakePlayer();
    const c = new TimerController(bells, player, fakeClock().now);
    const p1 = c.toggle();
    const p2 = c.toggle();
    releaseUnlock();
    await Promise.all([p1, p2]);
    expect(player.scheduleDelays).toHaveBeenCalledTimes(1);
    expect(c.getState().phase).toBe("running");
  });

  it("一時停止で予約を取り消し、再開時は残りの打音だけを予約する", async () => {
    const { player, releaseUnlock } = fakePlayer();
    const clock = fakeClock();
    const c = new TimerController(bells, player, clock.now);
    let p = c.toggle(); releaseUnlock(); await p;
    clock.advance(3000);
    await c.toggle();
    expect(player.cancelAll).toHaveBeenCalledTimes(1);
    expect(c.getState()).toMatchObject({ phase: "paused", accumulatedMs: 3000 });
    clock.advance(10_000);
    p = c.toggle(); releaseUnlock(); await p;
    expect(player.scheduleDelays).toHaveBeenLastCalledWith([1000, 1350]);
  });

  it("reset で予約を取り消し、待機状態に戻す", async () => {
    const { player, releaseUnlock } = fakePlayer();
    const c = new TimerController(bells, player, fakeClock().now);
    const p = c.toggle(); releaseUnlock(); await p;
    c.reset();
    expect(player.cancelAll).toHaveBeenCalled();
    expect(c.getState().phase).toBe("idle");
  });

  it("unlock が失敗してもタイマーは動く", async () => {
    const { player } = fakePlayer();
    player.unlock.mockRejectedValueOnce(new Error("blocked"));
    const c = new TimerController(bells, player, fakeClock().now);
    await c.toggle();
    expect(c.getState().phase).toBe("running");
  });

  it("player が null（音が使えない環境）でもタイマーは動く", async () => {
    const c = new TimerController(bells, null, fakeClock().now);
    await c.toggle();
    expect(c.getState().phase).toBe("running");
  });

  it("状態が変わると subscribe したリスナーを呼ぶ。解除後は呼ばない", async () => {
    const c = new TimerController(bells, null, fakeClock().now);
    const listener = vi.fn();
    const unsubscribe = c.subscribe(listener);
    await c.toggle();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    c.reset();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("dispose で予約を取り消して音を閉じ、その後の toggle は何もしない", async () => {
    const { player } = fakePlayer();
    const c = new TimerController(bells, player, fakeClock().now);
    await c.dispose();
    expect(player.cancelAll).toHaveBeenCalled();
    expect(player.close).toHaveBeenCalled();
    await c.toggle();
    expect(player.scheduleDelays).not.toHaveBeenCalled();
  });

  it("unlock を待っている間に dispose されたら、予約しない", async () => {
    const { player, releaseUnlock } = fakePlayer();
    const c = new TimerController(bells, player, fakeClock().now);
    const p = c.toggle();
    await c.dispose();
    releaseUnlock();
    await p;
    expect(player.scheduleDelays).not.toHaveBeenCalled();
  });

  it("ringNow で unlock してから1回鳴らす", async () => {
    const { player, releaseUnlock } = fakePlayer();
    const c = new TimerController(bells, player, fakeClock().now);
    const p = c.ringNow(); releaseUnlock(); await p;
    expect(player.ringNow).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm test -- src/lib/timer-controller.test.ts`
Expected: FAIL（`./timer-controller` が見つからない）

- [ ] **Step 3: 実装する**

`src/lib/timer-controller.ts`:

```ts
import type { Bell } from "./bells";
import { planStrikes } from "./schedule";
import { initialTimer, pauseTimer, resetTimer, startTimer, type TimerState } from "./timer";

export interface StrikePlayer {
  unlock(): Promise<void>;
  scheduleDelays(delaysMs: readonly number[]): void;
  ringNow(): void;
  cancelAll(): void;
  close(): Promise<void>;
}

export class TimerController {
  private state: TimerState = initialTimer;
  private starting = false;
  private disposed = false;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly bells: readonly Bell[],
    private readonly player: StrikePlayer | null,
    private readonly clock: () => number = () => performance.now(),
  ) {}

  getState(): TimerState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async toggle(): Promise<void> {
    if (this.disposed || this.starting) return;
    if (this.state.phase === "running") {
      this.player?.cancelAll();
      this.setState(pauseTimer(this.state, this.clock()));
      return;
    }
    this.starting = true;
    try {
      await this.unlockSafely();
      if (this.disposed) return;
      const now = this.clock();
      this.player?.scheduleDelays(planStrikes(this.bells, this.state.accumulatedMs).map((s) => s.delayMs));
      this.setState(startTimer(this.state, now));
    } finally {
      this.starting = false;
    }
  }

  reset(): void {
    if (this.disposed) return;
    this.player?.cancelAll();
    this.setState(resetTimer());
  }

  async ringNow(): Promise<void> {
    if (this.disposed) return;
    await this.unlockSafely();
    if (!this.disposed) this.player?.ringNow();
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.listeners.clear();
    this.player?.cancelAll();
    await this.player?.close();
  }

  private async unlockSafely(): Promise<void> {
    try {
      await this.player?.unlock();
    } catch {
      // 音が出せなくてもタイマーは動かす
    }
  }

  private setState(next: TimerState): void {
    if (next === this.state) return;
    this.state = next;
    for (const listener of this.listeners) listener();
  }
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test`
Expected: すべて PASS

- [ ] **Step 5: コミットする**

```bash
git add src/lib/timer-controller.ts src/lib/timer-controller.test.ts
git commit -m "feat: add TimerController coordinating timer state and bell scheduling

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: ベル音（Web Audio）、Wake Lock、最近使った一覧

**Files:**
- Create: `src/audio/bell-player.ts`、`src/lib/wake-lock.ts`、`src/lib/recent.ts`
- Test: `src/audio/bell-player.test.ts`、`src/lib/recent.test.ts`

**Interfaces:**
- Consumes: `StrikePlayer`（Task 4）
- Produces（`src/audio/bell-player.ts`）:
  - `isAudioSupported(): boolean`
  - `class BellPlayer implements StrikePlayer`。`constructor(createContext?: () => AudioContext)`
- Produces（`src/lib/wake-lock.ts`）:
  - `createWakeLock(): { acquire(): Promise<void>; release(): Promise<void>; onVisibilityChange(): void }`
- Produces（`src/lib/recent.ts`）:
  - `RECENT_KEY = "bell:recent"`、`RECENT_LIMIT = 20`
  - `interface RecentEntry { id: string; name: string; lastOpenedAt: number }`
  - `interface KeyValueStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }`
  - `loadRecent(storage?: KeyValueStorage | null): RecentEntry[]`
  - `touchRecent(entry: { id: string; name: string }, now?: number, storage?: KeyValueStorage | null): RecentEntry[]`
  - `removeRecent(id: string, storage?: KeyValueStorage | null): RecentEntry[]`

- [ ] **Step 1: BellPlayer の失敗するテストを書く**

`src/audio/bell-player.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { BellPlayer } from "./bell-player";

function fakeContext() {
  const oscillators: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const node = () => ({ connect: vi.fn((target: unknown) => target), disconnect: vi.fn() });
  const ctx = {
    currentTime: 10,
    state: "suspended" as AudioContextState,
    destination: {},
    resume: vi.fn(async () => { ctx.state = "running"; }),
    close: vi.fn(async () => {}),
    createGain: () => ({ ...node(), gain: param() }),
    createOscillator: () => {
      const osc = { ...node(), type: "sine", frequency: param(), start: vi.fn(), stop: vi.fn(), onended: null };
      oscillators.push(osc);
      return osc;
    },
  };
  return { ctx, oscillators, create: vi.fn(() => ctx as unknown as AudioContext) };
}

describe("BellPlayer", () => {
  it("unlock で AudioContext を作り、suspended なら resume する", async () => {
    const f = fakeContext();
    const player = new BellPlayer(f.create);
    await player.unlock();
    await player.unlock();
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.ctx.resume).toHaveBeenCalledTimes(1);
  });

  it("unlock 前の scheduleDelays・ringNow は何もしない", () => {
    const f = fakeContext();
    const player = new BellPlayer(f.create);
    player.scheduleDelays([0]);
    player.ringNow();
    expect(f.oscillators).toHaveLength(0);
  });

  it("scheduleDelays は currentTime を基準に各打音を開始する", async () => {
    const f = fakeContext();
    const player = new BellPlayer(f.create);
    await player.unlock();
    player.scheduleDelays([0, 1500]);
    const starts = f.oscillators.map((o) => o.start.mock.calls[0][0]);
    expect(new Set(starts)).toEqual(new Set([10, 11.5]));
    expect(f.oscillators).toHaveLength(8); // 4つの倍音 × 2打音
  });

  it("cancelAll で予約済みの全打音を止め、以後は二重に止めない", async () => {
    const f = fakeContext();
    const player = new BellPlayer(f.create);
    await player.unlock();
    player.scheduleDelays([1000, 2000]);
    player.cancelAll();
    expect(f.oscillators.every((o) => o.stop.mock.calls.length === 2)).toBe(true); // 予約時の stop(when) と取り消しの stop()
    player.cancelAll();
    expect(f.oscillators.every((o) => o.stop.mock.calls.length === 2)).toBe(true);
  });

  it("close で全打音を止めて AudioContext を閉じる", async () => {
    const f = fakeContext();
    const player = new BellPlayer(f.create);
    await player.unlock();
    player.scheduleDelays([1000]);
    await player.close();
    expect(f.ctx.close).toHaveBeenCalled();
    expect(f.oscillators.every((o) => o.stop.mock.calls.length === 2)).toBe(true);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm test -- src/audio/bell-player.test.ts`
Expected: FAIL（`./bell-player` が見つからない）

- [ ] **Step 3: BellPlayer を実装する**

`src/audio/bell-player.ts`:

```ts
import type { StrikePlayer } from "@/lib/timer-controller";

/** 卓上ベル風の倍音構成（基音に対する周波数比と相対音量） */
const PARTIALS = [
  { ratio: 1, gain: 1 },
  { ratio: 2.0, gain: 0.35 },
  { ratio: 2.76, gain: 0.3 },
  { ratio: 5.4, gain: 0.12 },
] as const;
const FUNDAMENTAL_HZ = 1760;
const DECAY_SECONDS = 1.6;
const PEAK_GAIN = 0.5;

export function isAudioSupported(): boolean {
  return typeof window !== "undefined" && typeof window.AudioContext === "function";
}

export class BellPlayer implements StrikePlayer {
  private ctx: AudioContext | null = null;
  private readonly active = new Set<OscillatorNode>();

  constructor(private readonly createContext: () => AudioContext = () => new AudioContext()) {}

  async unlock(): Promise<void> {
    this.ctx ??= this.createContext();
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  scheduleDelays(delaysMs: readonly number[]): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const base = ctx.currentTime;
    for (const delay of delaysMs) this.strikeAt(ctx, base + delay / 1000);
  }

  ringNow(): void {
    if (this.ctx) this.strikeAt(this.ctx, this.ctx.currentTime);
  }

  cancelAll(): void {
    for (const osc of this.active) {
      osc.onended = null;
      try {
        osc.stop();
      } catch {
        // すでに停止済み
      }
      osc.disconnect();
    }
    this.active.clear();
  }

  async close(): Promise<void> {
    this.cancelAll();
    const ctx = this.ctx;
    this.ctx = null;
    await ctx?.close();
  }

  private strikeAt(ctx: AudioContext, when: number): void {
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, when);
    master.gain.exponentialRampToValueAtTime(PEAK_GAIN, when + 0.005);
    master.gain.exponentialRampToValueAtTime(0.0001, when + DECAY_SECONDS);
    master.connect(ctx.destination);

    for (const partial of PARTIALS) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = FUNDAMENTAL_HZ * partial.ratio;
      const gain = ctx.createGain();
      gain.gain.value = partial.gain;
      osc.connect(gain).connect(master);
      osc.start(when);
      osc.stop(when + DECAY_SECONDS);
      this.active.add(osc);
      osc.onended = () => {
        this.active.delete(osc);
        osc.disconnect();
      };
    }
  }
}
```

- [ ] **Step 4: BellPlayer のテストが通ることを確認する**

Run: `npm test -- src/audio/bell-player.test.ts`
Expected: PASS

- [ ] **Step 5: 最近使った一覧の失敗するテストを書く**

`src/lib/recent.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loadRecent, RECENT_KEY, RECENT_LIMIT, removeRecent, touchRecent, type KeyValueStorage } from "./recent";

function memoryStorage(initial?: string): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(RECENT_KEY, initial);
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe("recent", () => {
  it("touchRecent で先頭に追加し、同じ id は名前と時刻を更新して重複させない", () => {
    const s = memoryStorage();
    touchRecent({ id: "a", name: "A" }, 1, s);
    touchRecent({ id: "b", name: "B" }, 2, s);
    touchRecent({ id: "a", name: "A2" }, 3, s);
    expect(loadRecent(s)).toEqual([
      { id: "a", name: "A2", lastOpenedAt: 3 },
      { id: "b", name: "B", lastOpenedAt: 2 },
    ]);
  });

  it(`最大 ${RECENT_LIMIT} 件で、古いものから落とす`, () => {
    const s = memoryStorage();
    for (let i = 0; i < RECENT_LIMIT + 5; i++) touchRecent({ id: `id${i}`, name: `n${i}` }, i, s);
    const list = loadRecent(s);
    expect(list).toHaveLength(RECENT_LIMIT);
    expect(list[0].id).toBe(`id${RECENT_LIMIT + 4}`);
    expect(list.at(-1)?.id).toBe("id5");
  });

  it("removeRecent で指定した id だけ消す", () => {
    const s = memoryStorage();
    touchRecent({ id: "a", name: "A" }, 1, s);
    touchRecent({ id: "b", name: "B" }, 2, s);
    removeRecent("a", s);
    expect(loadRecent(s).map((e) => e.id)).toEqual(["b"]);
  });

  it("壊れたデータ・型の違う要素は無視する", () => {
    expect(loadRecent(memoryStorage("{not json"))).toEqual([]);
    expect(loadRecent(memoryStorage('{"a":1}'))).toEqual([]);
    expect(
      loadRecent(memoryStorage('[{"id":"a","name":"A","lastOpenedAt":1},{"id":2},null]')),
    ).toEqual([{ id: "a", name: "A", lastOpenedAt: 1 }]);
  });

  it("storage が null や、例外を投げる場合も落ちない", () => {
    const throwing: KeyValueStorage = {
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("denied"); },
    };
    expect(loadRecent(null)).toEqual([]);
    expect(loadRecent(throwing)).toEqual([]);
    expect(touchRecent({ id: "a", name: "A" }, 1, throwing)).toEqual([{ id: "a", name: "A", lastOpenedAt: 1 }]);
    expect(removeRecent("a", throwing)).toEqual([]);
  });
});
```

- [ ] **Step 6: テストが失敗することを確認する**

Run: `npm test -- src/lib/recent.test.ts`
Expected: FAIL（`./recent` が見つからない）

- [ ] **Step 7: 最近使った一覧と Wake Lock を実装する**

`src/lib/recent.ts`:

```ts
export const RECENT_KEY = "bell:recent";
export const RECENT_LIMIT = 20;

export interface RecentEntry {
  id: string;
  name: string;
  lastOpenedAt: number;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): KeyValueStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isEntry(value: unknown): value is RecentEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.name === "string" && typeof v.lastOpenedAt === "number";
}

export function loadRecent(storage: KeyValueStorage | null = browserStorage()): RecentEntry[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isEntry)
      .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
      .slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

function save(entries: RecentEntry[], storage: KeyValueStorage | null): void {
  if (!storage) return;
  try {
    storage.setItem(RECENT_KEY, JSON.stringify(entries));
  } catch {
    // 容量超過やアクセス拒否は無視する
  }
}

export function touchRecent(
  entry: { id: string; name: string },
  now: number = Date.now(),
  storage: KeyValueStorage | null = browserStorage(),
): RecentEntry[] {
  const next = [
    { id: entry.id, name: entry.name, lastOpenedAt: now },
    ...loadRecent(storage).filter((e) => e.id !== entry.id),
  ].slice(0, RECENT_LIMIT);
  save(next, storage);
  return next;
}

export function removeRecent(id: string, storage: KeyValueStorage | null = browserStorage()): RecentEntry[] {
  const next = loadRecent(storage).filter((e) => e.id !== id);
  save(next, storage);
  return next;
}
```

`src/lib/wake-lock.ts`（ブラウザ API の薄いラッパーなので単体テストは書かず、手動確認とする）:

```ts
/** 画面スリープ防止。未対応環境や拒否された場合は何もしない。 */
export function createWakeLock() {
  let sentinel: WakeLockSentinel | null = null;
  let wanted = false;

  async function acquire(): Promise<void> {
    wanted = true;
    if (sentinel || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    try {
      const lock = await navigator.wakeLock.request("screen");
      if (!wanted) {
        await lock.release();
        return;
      }
      sentinel = lock;
      lock.addEventListener("release", () => {
        if (sentinel === lock) sentinel = null;
      });
    } catch {
      sentinel = null;
    }
  }

  async function release(): Promise<void> {
    wanted = false;
    const lock = sentinel;
    sentinel = null;
    try {
      await lock?.release();
    } catch {
      // すでに解放済み
    }
  }

  /** タブが再表示されたら取り直す（非表示になるとブラウザが自動で解放するため） */
  function onVisibilityChange(): void {
    if (wanted && document.visibilityState === "visible") void acquire();
  }

  return { acquire, release, onVisibilityChange };
}
```

- [ ] **Step 8: テストと型チェックが通ることを確認する**

Run: `npm test && npx tsc --noEmit`
Expected: テストはすべて PASS。型エラーなし。

- [ ] **Step 9: コミットする**

```bash
git add src/audio src/lib/recent.ts src/lib/recent.test.ts src/lib/wake-lock.ts
git commit -m "feat: add Web Audio bell player, wake lock and recent templates storage

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: D1 スキーマと API

**Files:**
- Create: `migrations/0001_create_templates.sql`、`src/server/id.ts`、`src/server/templates-repo.ts`、`src/server/handlers.ts`、`src/server/db.ts`、`src/app/api/templates/route.ts`、`src/app/api/templates/[id]/route.ts`、`vitest.workers.config.ts`、`test/api/apply-migrations.ts`、`test/api/env.d.ts`、`test/tsconfig.json`
- Test: `test/api/templates.test.ts`、`src/server/id.test.ts`

**Interfaces:**
- Consumes: `templateInputSchema` `Template` `TemplateInput` `Bell`（Task 2）
- Produces:
  - `generateId(length?: number): string`
  - `insertTemplate(db: D1Database, input: TemplateInput, now: number, genId?: () => string): Promise<Template>`
  - `getTemplate(db: D1Database, id: string): Promise<Template | null>`
  - `updateTemplate(db: D1Database, id: string, input: TemplateInput, now: number): Promise<Template | null>`
  - `deleteTemplate(db: D1Database, id: string): Promise<boolean>`
  - `createTemplateHandler(db, req: Request, now?: number): Promise<Response>`、`getTemplateHandler(db, id)`、`updateTemplateHandler(db, id, req, now?)`、`deleteTemplateHandler(db, id)`、`withErrorHandling(fn: () => Promise<Response>): Promise<Response>`
  - `getDb(): D1Database`
  - HTTP: `POST /api/templates` → 201 `{ id }`、`GET|PUT /api/templates/[id]` → 200 `Template`、`DELETE` → 204。エラー時は 400 `{ error: "invalid_json" }` または `{ error: "invalid", issues: { path, message }[] }`、404 `{ error: "not_found" }`、500 `{ error: "internal" }`

- [ ] **Step 1: マイグレーションを書く**

`migrations/0001_create_templates.sql`:

```sql
CREATE TABLE templates (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  bells      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

- [ ] **Step 2: Workers 用のテスト環境を作る**

`vitest.workers.config.ts`:

```ts
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations(fileURLToPath(new URL("./migrations", import.meta.url)));
  return {
    plugins: [
      cloudflareTest({
        miniflare: {
          compatibilityDate: "2026-08-01",
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: ["DB"],
          bindings: { TEST_MIGRATIONS: migrations },
        },
      }),
    ],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    test: {
      include: ["test/api/**/*.test.ts"],
      setupFiles: ["./test/api/apply-migrations.ts"],
    },
  };
});
```

`test/api/apply-migrations.ts`:

```ts
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
```

`test/api/env.d.ts`:

```ts
import type { D1Migration } from "cloudflare:test";

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
```

`test/tsconfig.json`（エディタ補完用。ビルドからは Task 1 で除外済み）:

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "types": ["@cloudflare/vitest-pool-workers/types"]
  },
  "include": ["./**/*.ts", "../src/**/*.ts", "../cloudflare-env.d.ts"],
  "exclude": []
}
```

- [ ] **Step 3: ID 生成の失敗するテストを書く**

`src/server/id.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { generateId } from "./id";

describe("generateId", () => {
  it("[a-z0-9] の10文字を返す", () => {
    for (let i = 0; i < 200; i++) expect(generateId()).toMatch(/^[a-z0-9]{10}$/);
  });

  it("毎回異なる値を返す", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateId()));
    expect(ids.size).toBe(1000);
  });
});
```

- [ ] **Step 4: API の失敗するテストを書く**

`test/api/templates.test.ts`:

```ts
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createTemplateHandler,
  deleteTemplateHandler,
  getTemplateHandler,
  updateTemplateHandler,
  withErrorHandling,
} from "@/server/handlers";
import { insertTemplate } from "@/server/templates-repo";

const db = env.DB;
const valid = { name: "LT大会", bells: [{ at: 300, count: 2 }, { at: 240, count: 1 }] };

function jsonRequest(method: string, body: unknown): Request {
  return new Request("http://localhost/api/templates", {
    method,
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(async () => {
  await db.exec("DELETE FROM templates");
});

describe("POST /api/templates", () => {
  it("201 と id を返し、保存されたテンプレートはベルが時刻順", async () => {
    const res = await createTemplateHandler(db, jsonRequest("POST", valid), 1000);
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect(id).toMatch(/^[a-z0-9]{10}$/);

    const got = await getTemplateHandler(db, id);
    expect(await got.json()).toEqual({
      id,
      name: "LT大会",
      bells: [{ at: 240, count: 1 }, { at: 300, count: 2 }],
      createdAt: 1000,
      updatedAt: 1000,
    });
  });

  it("不正な入力は 400 と issues を返す", async () => {
    const res = await createTemplateHandler(db, jsonRequest("POST", { name: "", bells: [] }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues: { path: unknown[]; message: string }[] };
    expect(body.error).toBe("invalid");
    expect(body.issues.map((i) => i.path[0])).toEqual(expect.arrayContaining(["name", "bells"]));
  });

  it("JSON として読めない本文は 400 invalid_json", async () => {
    const res = await createTemplateHandler(db, jsonRequest("POST", "{oops"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_json" });
  });
});

describe("insertTemplate", () => {
  it("ID が衝突したら作り直す", async () => {
    await insertTemplate(db, valid, 1, () => "dupdupdup1");
    const ids = ["dupdupdup1", "dupdupdup1", "freshid001"];
    const created = await insertTemplate(db, valid, 2, () => ids.shift()!);
    expect(created.id).toBe("freshid001");
  });

  it("3回続けて衝突したらエラー", async () => {
    await insertTemplate(db, valid, 1, () => "dupdupdup1");
    await expect(insertTemplate(db, valid, 2, () => "dupdupdup1")).rejects.toThrow();
  });
});

describe("GET /api/templates/[id]", () => {
  it("存在しない id は 404", async () => {
    const res = await getTemplateHandler(db, "nope000000");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});

describe("PUT /api/templates/[id]", () => {
  it("上書きし、updatedAt だけ更新する", async () => {
    const created = await insertTemplate(db, valid, 1000);
    const res = await updateTemplateHandler(
      db,
      created.id,
      jsonRequest("PUT", { name: "改名", bells: [{ at: 60, count: 3 }] }),
      2000,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: created.id,
      name: "改名",
      bells: [{ at: 60, count: 3 }],
      createdAt: 1000,
      updatedAt: 2000,
    });
  });

  it("存在しない id は 404、不正な入力は 400", async () => {
    expect((await updateTemplateHandler(db, "nope000000", jsonRequest("PUT", valid))).status).toBe(404);
    const created = await insertTemplate(db, valid, 1);
    expect((await updateTemplateHandler(db, created.id, jsonRequest("PUT", { name: "x" }))).status).toBe(400);
  });
});

describe("DELETE /api/templates/[id]", () => {
  it("204 を返し、その後の取得は 404", async () => {
    const created = await insertTemplate(db, valid, 1);
    const res = await deleteTemplateHandler(db, created.id);
    expect(res.status).toBe(204);
    expect((await getTemplateHandler(db, created.id)).status).toBe(404);
  });

  it("存在しない id は 404", async () => {
    expect((await deleteTemplateHandler(db, "nope000000")).status).toBe(404);
  });
});

describe("withErrorHandling", () => {
  it("例外は 500 internal に変換する", async () => {
    const res = await withErrorHandling(async () => {
      throw new Error("boom");
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal" });
  });
});
```

- [ ] **Step 5: テストが失敗することを確認する**

Run: `npm test -- src/server/id.test.ts; npm run test:api`
Expected: どちらも FAIL（モジュールが見つからない）。`test:api` が Workers のランタイムを起動できずに失敗する場合（設定エラー）は、テスト本体ではなく `vitest.workers.config.ts` を直してから進める。

- [ ] **Step 6: ID 生成とリポジトリを実装する**

`src/server/id.ts`:

```ts
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
/** 36 の倍数のうち 256 以下で最大の値。これ以上のバイトは捨てて偏りをなくす。 */
const UNBIASED_LIMIT = 252;

export function generateId(length = 10): string {
  let id = "";
  const bytes = new Uint8Array(length * 2);
  while (id.length < length) {
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte < UNBIASED_LIMIT) id += ALPHABET[byte % ALPHABET.length];
      if (id.length === length) break;
    }
  }
  return id;
}
```

`src/server/templates-repo.ts`:

```ts
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
```

- [ ] **Step 7: ハンドラーを実装する**

`src/server/handlers.ts`:

```ts
import { templateInputSchema, type TemplateInput } from "@/lib/bells";
import { deleteTemplate, getTemplate, insertTemplate, updateTemplate } from "./templates-repo";

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
  return Response.json({ id: template.id }, { status: 201 });
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
```

注: `PUT` で ID が存在しないとき、テストの期待どおり先に入力を検証する（不正な入力なら ID の有無にかかわらず 400）。

- [ ] **Step 8: テストが通ることを確認する**

Run: `npm test && npm run test:api`
Expected: すべて PASS

- [ ] **Step 9: Route Handlers と DB 取得を書く**

`src/server/db.ts`:

```ts
import { getCloudflareContext } from "@opennextjs/cloudflare";

export function getDb(): D1Database {
  return getCloudflareContext().env.DB;
}
```

`src/app/api/templates/route.ts`:

```ts
import { getDb } from "@/server/db";
import { createTemplateHandler, withErrorHandling } from "@/server/handlers";

export async function POST(req: Request) {
  return withErrorHandling(() => createTemplateHandler(getDb(), req));
}
```

`src/app/api/templates/[id]/route.ts`:

```ts
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
```

- [ ] **Step 10: ローカルの D1 と開発サーバーで動作を確認する**

```bash
npm run db:migrate:local
npm run dev &
sleep 8
curl -s -X POST http://localhost:3000/api/templates -H 'content-type: application/json' -d '{"name":"テスト","bells":[{"at":240,"count":1},{"at":300,"count":2}]}'
```

Expected: `{"id":"xxxxxxxxxx"}` が返る。続けてその ID で `curl -s http://localhost:3000/api/templates/<id>` を実行するとテンプレートの JSON が、`curl -s -o /dev/null -w '%{http_code}' -X DELETE http://localhost:3000/api/templates/<id>` を実行すると `204` が返る。確認後に開発サーバーを止める（`kill %1`）。

- [ ] **Step 11: ビルドを確認してコミットする**

Run: `npm run build`
Expected: 成功

```bash
git add migrations src/server src/app/api vitest.workers.config.ts test
git commit -m "feat: add D1-backed templates API

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: E2E 環境、API クライアント、テンプレート作成画面

**Files:**
- Create: `playwright.config.ts`、`src/lib/api-client.ts`、`src/components/TemplateEditor.tsx`、`src/app/new/page.tsx`、`e2e/helpers.ts`
- Modify: `src/app/layout.tsx`（`lang="ja"`、タイトル）、`src/app/globals.css`（雛形のままで可）
- Test: `e2e/create.spec.ts`

**Interfaces:**
- Consumes: `templateInputSchema` `Template` `TemplateInput`（Task 2）、`BellRow` `newRow` `templateToRows` `rowsToCandidate` `issuesToErrors` `FormErrors`（Task 2）、`touchRecent` `removeRecent`（Task 5）、`formatClock`（Task 1）、HTTP API（Task 6）
- Produces:
  - `class ApiError extends Error { readonly status: number }`
  - `createTemplate(input: TemplateInput): Promise<{ id: string }>`
  - `updateTemplate(id: string, input: TemplateInput): Promise<Template>`
  - `deleteTemplate(id: string): Promise<void>`
  - `<TemplateEditor initial?: Template />`（Task 8 の編集画面でも使う）
  - `e2e/helpers.ts` の `createTemplateViaApi(request: APIRequestContext, input: { name: string; bells: { at: number; count: number }[] }): Promise<string>`

- [ ] **Step 1: Playwright の設定とヘルパーを書く**

`playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run db:migrate:local && npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

`e2e/helpers.ts`:

```ts
import { expect, type APIRequestContext } from "@playwright/test";

export async function createTemplateViaApi(
  request: APIRequestContext,
  input: { name: string; bells: { at: number; count: number }[] },
): Promise<string> {
  const res = await request.post("/api/templates", { data: input });
  expect(res.status()).toBe(201);
  const { id } = (await res.json()) as { id: string };
  return id;
}
```

- [ ] **Step 2: 失敗する E2E テストを書く**

`e2e/create.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("テンプレートを作成すると共有URLが表示され、開くとタイマー画面になる", async ({ page }) => {
  await page.goto("/new");
  await page.getByLabel("テンプレート名").fill("LT大会 5分");
  await page.getByLabel("ベル1 分").fill("4");
  await page.getByLabel("ベル1 秒").fill("0");
  await page.getByLabel("ベル2 分").fill("5");
  await page.getByLabel("ベル2 秒").fill("0");
  await page.getByLabel("ベル2 回数").selectOption("2");
  await page.getByRole("button", { name: "ベルを追加" }).click();
  await page.getByLabel("ベル3 分").fill("7");
  await page.getByLabel("ベル3 秒").fill("0");
  await page.getByLabel("ベル3 回数").selectOption("3");
  await page.getByRole("button", { name: "保存" }).click();

  const shareUrl = page.getByTestId("share-url");
  await expect(shareUrl).toHaveValue(/\/t\/[a-z0-9]{10}$/);

  await page.getByRole("link", { name: "タイマーを開く" }).click();
  await expect(page.getByRole("heading", { name: "LT大会 5分" })).toBeVisible();
});

test("入力が不正なら保存せず、該当箇所にエラーを表示する", async ({ page }) => {
  await page.goto("/new");
  await page.getByLabel("テンプレート名").fill("   ");
  await page.getByLabel("ベル1 秒").fill("75");
  await page.getByRole("button", { name: "保存" }).click();

  await expect(page.getByText("名前を入力してください")).toBeVisible();
  await expect(page.getByText("時刻を正しく入力してください")).toBeVisible();
  await expect(page.getByTestId("share-url")).toHaveCount(0);
});

test("ベルの行を削除できる。最後の1行は削除できない", async ({ page }) => {
  await page.goto("/new");
  await page.getByRole("button", { name: "ベル2を削除" }).click();
  await expect(page.getByLabel("ベル2 分")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "ベル1を削除" })).toBeDisabled();
});
```

- [ ] **Step 3: テストが失敗することを確認する**

Run: `npm run test:e2e -- e2e/create.spec.ts`
Expected: FAIL（`/new` が 404 のため、ラベルが見つからない）

- [ ] **Step 4: API クライアントを書く**

`src/lib/api-client.ts`:

```ts
import type { Template, TemplateInput } from "./bells";

export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`API request failed with status ${status}`);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json" } });
  if (!res.ok) throw new ApiError(res.status);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function createTemplate(input: TemplateInput): Promise<{ id: string }> {
  return request("/api/templates", { method: "POST", body: JSON.stringify(input) });
}

export function updateTemplate(id: string, input: TemplateInput): Promise<Template> {
  return request(`/api/templates/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input) });
}

export function deleteTemplate(id: string): Promise<void> {
  return request(`/api/templates/${encodeURIComponent(id)}`, { method: "DELETE" });
}
```

- [ ] **Step 5: 編集フォームのコンポーネントを書く**

`src/components/TemplateEditor.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, createTemplate, deleteTemplate, updateTemplate } from "@/lib/api-client";
import { MAX_BELLS, MAX_COUNT, templateInputSchema, type Template } from "@/lib/bells";
import { issuesToErrors, newRow, rowsToCandidate, templateToRows, type BellRow, type FormErrors } from "@/lib/editor-form";
import { removeRecent, touchRecent } from "@/lib/recent";

const NETWORK_ERROR = "通信に失敗しました。接続を確認してもう一度お試しください。";
const COUNT_OPTIONS = Array.from({ length: MAX_COUNT }, (_, i) => i + 1);
const inputClass = "rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600 dark:bg-zinc-900";

export function TemplateEditor({ initial }: { initial?: Template }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [rows, setRows] = useState<BellRow[]>(() =>
    initial ? templateToRows(initial.bells) : [newRow(240, 1), newRow(300, 2)],
  );
  const [errors, setErrors] = useState<FormErrors>({ rows: {} });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  function updateRow(index: number, patch: Partial<BellRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    const lastAt = rowsToCandidate(name, rows).bells.at(-1)?.at;
    setRows((current) => [...current, newRow(Number.isFinite(lastAt) ? (lastAt ?? 0) + 60 : 60, 1)]);
  }

  async function save() {
    const parsed = templateInputSchema.safeParse(rowsToCandidate(name, rows));
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error.issues));
      return;
    }
    setErrors({ rows: {} });
    setMessage(null);
    setBusy(true);
    try {
      if (initial) {
        await updateTemplate(initial.id, parsed.data);
        touchRecent({ id: initial.id, name: parsed.data.name });
        router.push(`/t/${initial.id}`);
      } else {
        const { id } = await createTemplate(parsed.data);
        touchRecent({ id, name: parsed.data.name });
        setCreatedId(id);
      }
    } catch (error) {
      setMessage(
        error instanceof ApiError && error.status === 404
          ? "このテンプレートは削除されています。"
          : NETWORK_ERROR,
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!initial) return;
    const ok = window.confirm(`「${initial.name}」を本当に削除しますか？（共有している全員が使えなくなります）`);
    if (!ok) return;
    setMessage(null);
    setBusy(true);
    try {
      await deleteTemplate(initial.id);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) {
        setMessage(NETWORK_ERROR);
        setBusy(false);
        return;
      }
    }
    removeRecent(initial.id);
    router.push("/");
  }

  if (createdId) {
    return <ShareResult id={createdId} />;
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="font-semibold">テンプレート名</span>
        <input
          className={inputClass}
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={errors.name ? true : undefined}
        />
        {errors.name && <span className="text-sm text-red-600">{errors.name}</span>}
      </label>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-semibold">ベル（最後のベルが終了時刻）</legend>
        {rows.map((row, i) => (
          <div key={row.key} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-14 text-sm text-zinc-500">ベル{i + 1}</span>
              <input
                className={`${inputClass} w-16 text-right`}
                inputMode="numeric"
                aria-label={`ベル${i + 1} 分`}
                value={row.minutes}
                onChange={(e) => updateRow(i, { minutes: e.target.value })}
              />
              <span>分</span>
              <input
                className={`${inputClass} w-16 text-right`}
                inputMode="numeric"
                aria-label={`ベル${i + 1} 秒`}
                value={row.seconds}
                onChange={(e) => updateRow(i, { seconds: e.target.value })}
              />
              <span>秒に</span>
              <select
                className={inputClass}
                aria-label={`ベル${i + 1} 回数`}
                value={row.count}
                onChange={(e) => updateRow(i, { count: Number(e.target.value) })}
              >
                {COUNT_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}回
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="rounded px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
                aria-label={`ベル${i + 1}を削除`}
                disabled={rows.length === 1}
                onClick={() => setRows((current) => current.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
            {errors.rows[i] && <span className="ml-16 text-sm text-red-600">{errors.rows[i]}</span>}
          </div>
        ))}
        <button
          type="button"
          className="self-start rounded border border-zinc-300 px-3 py-1 text-sm disabled:opacity-40 dark:border-zinc-600"
          disabled={rows.length >= MAX_BELLS}
          onClick={addRow}
        >
          ベルを追加
        </button>
        {errors.general && <span className="text-sm text-red-600">{errors.general}</span>}
      </fieldset>

      {message && (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-zinc-900 px-5 py-2 font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
        >
          保存
        </button>
        {initial && (
          <>
            <Link href={`/t/${initial.id}`} className="text-sm underline">
              保存せずに戻る
            </Link>
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              className="ml-auto rounded border border-red-300 px-3 py-2 text-sm text-red-700 disabled:opacity-50"
            >
              このテンプレートを削除
            </button>
          </>
        )}
      </div>
    </form>
  );
}

function ShareResult({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? `/t/${id}` : `${window.location.origin}/t/${id}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="font-semibold">テンプレートを保存しました。このURLを共有してください。</p>
      <div className="flex gap-2">
        <input
          readOnly
          data-testid="share-url"
          aria-label="共有URL"
          value={url}
          className={`${inputClass} flex-1`}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button type="button" onClick={() => void copy()} className="rounded border border-zinc-300 px-3 dark:border-zinc-600">
          {copied ? "コピーしました" : "コピー"}
        </button>
      </div>
      <Link
        href={`/t/${id}`}
        className="self-start rounded bg-zinc-900 px-5 py-2 font-semibold text-white dark:bg-white dark:text-zinc-900"
      >
        タイマーを開く
      </Link>
    </div>
  );
}
```

- [ ] **Step 6: レイアウトと新規作成ページを書く**

`src/app/layout.tsx` の `<html lang="en">` を `<html lang="ja">` に変え、`metadata` を次のようにする（フォント設定など雛形の他の部分はそのまま残す）:

```ts
export const metadata: Metadata = {
  title: "ベルタイマー",
  description: "発表の時間管理用ベルタイマー",
};
```

`src/app/new/page.tsx`:

```tsx
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
```

この時点では `/t/[id]` がまだないため、create.spec.ts の1本目の最後（タイマー画面の見出し）だけは失敗する。Task 8 で通る。

- [ ] **Step 7: テストを実行する**

Run: `npm run test:e2e -- e2e/create.spec.ts`
Expected: 2本目と3本目は PASS。1本目は「タイマーを開く」以降の見出しの確認で FAIL（Task 8 で実装）。

- [ ] **Step 8: 単体テストとビルドを確認してコミットする**

Run: `npm test && npm run build`
Expected: 成功

```bash
git add playwright.config.ts e2e src/lib/api-client.ts src/components/TemplateEditor.tsx src/app/new src/app/layout.tsx
git commit -m "feat: add template creation page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 編集画面・削除・「見つかりません」画面

**Files:**
- Create: `src/app/t/[id]/edit/page.tsx`、`src/components/TemplateNotFound.tsx`、`src/app/t/[id]/page.tsx`（この Task では見つからない場合の表示と仮の本文のみ。Task 9 で TimerView に置き換える）
- Test: `e2e/edit-delete.spec.ts`

**Interfaces:**
- Consumes: `<TemplateEditor initial>`（Task 7）、`getTemplate`（Task 6）、`getDb`（Task 6）、`removeRecent`（Task 5）、`createTemplateViaApi`（Task 7）
- Produces: `<TemplateNotFound id: string />`

- [ ] **Step 1: 失敗する E2E テストを書く**

`e2e/edit-delete.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { createTemplateViaApi } from "./helpers";

test("編集して保存するとタイマー画面に戻り、変更が反映される", async ({ page, request }) => {
  const id = await createTemplateViaApi(request, { name: "編集前", bells: [{ at: 60, count: 1 }] });
  await page.goto(`/t/${id}/edit`);
  await expect(page.getByLabel("テンプレート名")).toHaveValue("編集前");
  await expect(page.getByLabel("ベル1 分")).toHaveValue("1");
  await page.getByLabel("テンプレート名").fill("編集後");
  await page.getByRole("button", { name: "保存" }).click();

  await expect(page).toHaveURL(new RegExp(`/t/${id}$`));
  await expect(page.getByRole("heading", { name: "編集後" })).toBeVisible();
});

test("削除を確認すると削除してトップへ戻り、URL を開くと「見つかりません」になる", async ({ page, request }) => {
  const id = await createTemplateViaApi(request, { name: "消すもの", bells: [{ at: 60, count: 1 }] });
  await page.goto(`/t/${id}/edit`);
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("「消すもの」を本当に削除しますか？");
    void dialog.accept();
  });
  await page.getByRole("button", { name: "このテンプレートを削除" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto(`/t/${id}`);
  await expect(page.getByText("このテンプレートは見つかりません")).toBeVisible();
  await page.goto(`/t/${id}/edit`);
  await expect(page.getByText("このテンプレートは見つかりません")).toBeVisible();
});

test("削除の確認でキャンセルすると削除しない", async ({ page, request }) => {
  const id = await createTemplateViaApi(request, { name: "残すもの", bells: [{ at: 60, count: 1 }] });
  await page.goto(`/t/${id}/edit`);
  page.once("dialog", (dialog) => void dialog.dismiss());
  await page.getByRole("button", { name: "このテンプレートを削除" }).click();
  await expect(page).toHaveURL(new RegExp(`/t/${id}/edit$`));
  expect((await request.get(`/api/templates/${id}`)).status()).toBe(200);
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm run test:e2e -- e2e/edit-delete.spec.ts`
Expected: FAIL（`/t/[id]/edit` が 404）

- [ ] **Step 3: 「見つかりません」コンポーネントを書く**

`src/components/TemplateNotFound.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { removeRecent } from "@/lib/recent";

export function TemplateNotFound({ id }: { id: string }) {
  const [removed, setRemoved] = useState(false);
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-16">
      <h1 className="text-xl font-bold">このテンプレートは見つかりません</h1>
      <p className="text-zinc-600 dark:text-zinc-400">削除された可能性があります。</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/" className="rounded bg-zinc-900 px-4 py-2 text-white dark:bg-white dark:text-zinc-900">
          トップへ
        </Link>
        <button
          type="button"
          disabled={removed}
          onClick={() => {
            removeRecent(id);
            setRemoved(true);
          }}
          className="rounded border border-zinc-300 px-4 py-2 disabled:opacity-50 dark:border-zinc-600"
        >
          {removed ? "一覧から外しました" : "最近使った一覧から外す"}
        </button>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: 編集ページと仮のタイマーページを書く**

`src/app/t/[id]/edit/page.tsx`:

```tsx
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
```

`src/app/t/[id]/page.tsx`（仮。Task 9 で TimerView に置き換える）:

```tsx
import { TemplateNotFound } from "@/components/TemplateNotFound";
import { getDb } from "@/server/db";
import { getTemplate } from "@/server/templates-repo";

export const dynamic = "force-dynamic";

export default async function TimerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const template = await getTemplate(getDb(), id);
  if (!template) return <TemplateNotFound id={id} />;
  return (
    <main className="px-4 py-10">
      <h1 className="text-2xl font-bold">{template.name}</h1>
    </main>
  );
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npm run test:e2e`
Expected: edit-delete.spec.ts はすべて PASS。create.spec.ts の1本目もタイマー画面に見出しが出るので PASS。

- [ ] **Step 6: ビルドを確認してコミットする**

Run: `npm run build`
Expected: 成功

```bash
git add src/app/t src/components/TemplateNotFound.tsx e2e/edit-delete.spec.ts
git commit -m "feat: add template edit, delete and not-found pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: タイマー画面

**Files:**
- Create: `src/hooks/use-timer.ts`、`src/components/TimerView.tsx`
- Modify: `src/app/t/[id]/page.tsx`（TimerView を表示する）
- Test: `e2e/timer.spec.ts`

**Interfaces:**
- Consumes: `TimerController` `StrikePlayer`（Task 4）、`BellPlayer` `isAudioSupported`（Task 5）、`createWakeLock`（Task 5）、`touchRecent`（Task 5）、`elapsedMs` `isOvertime` `initialTimer` `TimerState`（Task 3）、`endMs` `nextBell`（Task 3）、`formatClock`（Task 1）、`Template`（Task 2）
- Produces:
  - `useTimer(bells: readonly Bell[]): { timer: TimerState; elapsed: number; overtime: boolean; ready: boolean; audioSupported: boolean; toggle(): void; reset(): void; ringNow(): void }`
  - `<TimerView template: Template />`

- [ ] **Step 1: 失敗する E2E テストを書く**

`e2e/timer.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { createTemplateViaApi } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.clock.install();
});

test("スタートすると時間が進み、ベル時刻を過ぎたものは済みになり、終了後は超過表示になる", async ({ page, request }) => {
  const id = await createTemplateViaApi(request, {
    name: "短い発表",
    bells: [{ at: 2, count: 1 }, { at: 4, count: 2 }],
  });
  await page.goto(`/t/${id}`);
  await expect(page.getByRole("heading", { name: "短い発表" })).toBeVisible();
  await expect(page.getByTestId("clock")).toHaveText("0:00");
  await expect(page.getByTestId("next-bell")).toContainText("0:02");

  await page.getByRole("button", { name: "スタート" }).click();
  await page.clock.runFor(2500);
  await expect(page.getByTestId("clock")).toHaveText("0:02");
  await expect(page.getByTestId("bell-item").nth(0)).toHaveAttribute("data-done", "true");
  await expect(page.getByTestId("bell-item").nth(1)).toHaveAttribute("data-done", "false");

  await page.clock.runFor(3000);
  await expect(page.getByTestId("timer-root")).toHaveAttribute("data-overtime", "true");
  await expect(page.getByTestId("clock")).toHaveText("+0:01");
  await expect(page.getByTestId("next-bell")).toHaveText("終了時刻を過ぎました");
});

test("一時停止中は時間が進まず、リセットで 0 に戻る", async ({ page, request }) => {
  const id = await createTemplateViaApi(request, { name: "停止テスト", bells: [{ at: 60, count: 1 }] });
  await page.goto(`/t/${id}`);
  await page.getByRole("button", { name: "スタート" }).click();
  await page.clock.runFor(3000);
  await page.getByRole("button", { name: "一時停止" }).click();
  await page.clock.runFor(10_000);
  await expect(page.getByTestId("clock")).toHaveText("0:03");
  await page.getByRole("button", { name: "リセット" }).click();
  await expect(page.getByTestId("clock")).toHaveText("0:00");
  await expect(page.getByRole("button", { name: "スタート" })).toBeVisible();
});

test("残り時間表示に切り替えられる", async ({ page, request }) => {
  const id = await createTemplateViaApi(request, { name: "残り時間", bells: [{ at: 90, count: 1 }] });
  await page.goto(`/t/${id}`);
  await page.getByTestId("clock").click();
  await expect(page.getByTestId("clock-mode")).toHaveText("残り時間");
  await expect(page.getByTestId("clock")).toHaveText("1:30");
});

test("スペースキー: ボタンにフォーカスがあっても、スタート／一時停止が1回だけ切り替わる", async ({ page, request }) => {
  const id = await createTemplateViaApi(request, { name: "キー操作", bells: [{ at: 60, count: 1 }] });
  await page.goto(`/t/${id}`);

  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "一時停止" })).toBeVisible();
  await page.clock.runFor(3000);

  // スタートボタン（今は「一時停止」）にフォーカスがある状態: 1回だけ切り替わって一時停止になる
  await page.getByRole("button", { name: "一時停止" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "再開" })).toBeVisible();
  await expect(page.getByTestId("clock")).toHaveText("0:03");

  // リセットボタンにフォーカスがある状態: リセットされず、再開する
  await page.getByRole("button", { name: "リセット" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "一時停止" })).toBeVisible();
  await expect(page.getByTestId("clock")).toHaveText("0:03");
  await page.clock.runFor(2000);
  await expect(page.getByTestId("clock")).toHaveText("0:05");
});

test("編集ボタンで編集画面へ移動する", async ({ page, request }) => {
  const id = await createTemplateViaApi(request, { name: "移動", bells: [{ at: 60, count: 1 }] });
  await page.goto(`/t/${id}`);
  await page.getByRole("link", { name: "編集" }).click();
  await expect(page).toHaveURL(new RegExp(`/t/${id}/edit$`));
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm run test:e2e -- e2e/timer.spec.ts`
Expected: FAIL（`clock` などの testid が見つからない）

- [ ] **Step 3: useTimer フックを書く**

`src/hooks/use-timer.ts`:

```ts
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BellPlayer, isAudioSupported } from "@/audio/bell-player";
import type { Bell } from "@/lib/bells";
import { endMs } from "@/lib/schedule";
import { elapsedMs, initialTimer, isOvertime, type TimerState } from "@/lib/timer";
import { TimerController } from "@/lib/timer-controller";
import { createWakeLock } from "@/lib/wake-lock";

export function useTimer(bells: readonly Bell[]) {
  const [controller, setController] = useState<TimerController | null>(null);
  const [timer, setTimer] = useState<TimerState>(initialTimer);
  const [now, setNow] = useState(0);
  const [audioSupported, setAudioSupported] = useState(true);
  const wakeLock = useMemo(() => createWakeLock(), []);

  // コントローラーはブラウザでのみ作る。画面を離れたら予約済みのベルをすべて止める。
  useEffect(() => {
    const supported = isAudioSupported();
    setAudioSupported(supported);
    const c = new TimerController(bells, supported ? new BellPlayer() : null);
    const unsubscribe = c.subscribe(() => {
      setTimer(c.getState());
      setNow(performance.now());
    });
    setController(c);
    return () => {
      unsubscribe();
      void c.dispose();
    };
  }, [bells]);

  // 実行中だけ毎フレーム表示を更新する
  useEffect(() => {
    if (timer.phase !== "running") return;
    let frame = 0;
    const tick = () => {
      setNow(performance.now());
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [timer.phase]);

  // 実行中は画面スリープを防ぐ
  useEffect(() => {
    if (timer.phase !== "running") {
      void wakeLock.release();
      return;
    }
    void wakeLock.acquire();
    document.addEventListener("visibilitychange", wakeLock.onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", wakeLock.onVisibilityChange);
  }, [timer.phase, wakeLock]);

  useEffect(() => () => void wakeLock.release(), [wakeLock]);

  const toggle = useCallback(() => void controller?.toggle(), [controller]);
  const reset = useCallback(() => controller?.reset(), [controller]);
  const ringNow = useCallback(() => void controller?.ringNow(), [controller]);

  return {
    timer,
    elapsed: elapsedMs(timer, now),
    overtime: isOvertime(timer, now, endMs(bells)),
    ready: controller !== null,
    audioSupported,
    toggle,
    reset,
    ringNow,
  };
}
```

- [ ] **Step 4: タイマー画面のコンポーネントを書く**

`src/components/TimerView.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTimer } from "@/hooks/use-timer";
import type { Template } from "@/lib/bells";
import { touchRecent } from "@/lib/recent";
import { endMs, nextBell } from "@/lib/schedule";
import { formatClock } from "@/lib/time";

type ClockMode = "elapsed" | "remaining";

function isTextInput(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

export function TimerView({ template }: { template: Template }) {
  const { bells } = template;
  const { timer, elapsed, overtime, ready, audioSupported, toggle, reset, ringNow } = useTimer(bells);
  const [mode, setMode] = useState<ClockMode>("elapsed");
  const end = endMs(bells);

  useEffect(() => {
    touchRecent({ id: template.id, name: template.name });
  }, [template.id, template.name]);

  // スペースキーでスタート／一時停止。フォーカス中のボタンが作動しないよう keyup も止める。
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isTextInput(e.target)) return;
      e.preventDefault();
      if (!e.repeat) toggle();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTextInput(e.target)) e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [toggle]);

  const clockText = overtime
    ? `+${formatClock((elapsed - end) / 1000)}`
    : mode === "elapsed"
      ? formatClock(elapsed / 1000)
      : formatClock(Math.ceil((end - elapsed) / 1000));

  const next = nextBell(bells, elapsed);
  const nextText = next
    ? `次のベル ${formatClock(next.bell.at)}（${next.bell.count}回）まで ${formatClock(Math.ceil((next.bell.at * 1000 - elapsed) / 1000))}`
    : "終了時刻を過ぎました";

  const toggleLabel = timer.phase === "running" ? "一時停止" : timer.phase === "paused" ? "再開" : "スタート";

  function toggleFullscreen() {
    const action = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
    action.catch(() => {});
  }

  return (
    <main
      data-testid="timer-root"
      data-overtime={overtime ? "true" : "false"}
      className={`flex min-h-screen flex-col gap-6 px-4 py-6 transition-colors ${
        overtime ? "bg-red-600 text-white" : "bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100"
      }`}
    >
      <header className="flex flex-wrap items-center gap-3">
        <Link href="/" className="text-sm underline">
          トップ
        </Link>
        <h1 className="flex-1 text-xl font-bold">{template.name}</h1>
        <Link href={`/t/${template.id}/edit`} className="rounded border border-current px-3 py-1 text-sm">
          編集
        </Link>
        <button type="button" onClick={toggleFullscreen} className="rounded border border-current px-3 py-1 text-sm">
          全画面
        </button>
      </header>

      {!audioSupported && (
        <p role="alert" className="rounded bg-yellow-100 p-3 text-sm text-yellow-900">
          このブラウザでは音を鳴らせません（タイマーは使えます）。
        </p>
      )}

      <section className="flex flex-1 flex-col items-center justify-center gap-4">
        <span data-testid="clock-mode" className="text-sm opacity-70">
          {overtime ? "超過時間" : mode === "elapsed" ? "経過時間" : "残り時間"}
        </span>
        <button
          type="button"
          data-testid="clock"
          aria-label="表示を切り替え"
          onClick={() => setMode((m) => (m === "elapsed" ? "remaining" : "elapsed"))}
          className="font-mono text-[min(22vw,14rem)] leading-none font-bold tabular-nums"
        >
          {clockText}
        </button>
        <p data-testid="next-bell" className="text-lg">
          {nextText}
        </p>
      </section>

      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          disabled={!ready}
          onClick={toggle}
          className={`min-w-32 rounded px-6 py-3 text-lg font-semibold disabled:opacity-50 ${
            overtime ? "bg-white text-red-700" : "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
          }`}
        >
          {toggleLabel}
        </button>
        <button type="button" disabled={!ready} onClick={reset} className="rounded border border-current px-6 py-3 text-lg">
          リセット
        </button>
        <button type="button" disabled={!ready} onClick={ringNow} className="rounded border border-current px-6 py-3 text-lg">
          ベルを鳴らす
        </button>
      </div>

      <ol className="mx-auto flex w-full max-w-md flex-col gap-1">
        {bells.map((bell, i) => {
          const done = bell.at * 1000 <= elapsed;
          return (
            <li
              key={bell.at}
              data-testid="bell-item"
              data-done={done ? "true" : "false"}
              className={`flex justify-between rounded px-3 py-1 ${done ? "opacity-40" : ""}`}
            >
              <span className="font-mono tabular-nums">{formatClock(bell.at)}</span>
              <span>{"🔔".repeat(bell.count)}</span>
              {i === bells.length - 1 && <span className="text-sm">終了</span>}
            </li>
          );
        })}
      </ol>

      <p className="text-center text-xs opacity-60">スペースキーでスタート／一時停止</p>
    </main>
  );
}
```

- [ ] **Step 5: タイマーページを TimerView に置き換える**

`src/app/t/[id]/page.tsx`:

```tsx
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
```

- [ ] **Step 6: テストが通ることを確認する**

Run: `npm run test:e2e`
Expected: すべて PASS。スペースキーのテストが失敗する場合は、`onKeyUp` の `preventDefault` がフォーカス中のボタンのクリックを止めているかを確認する。止まらないブラウザがあれば、各ボタンの `onClick` 内で `e.currentTarget.blur()` を呼んでフォーカスを外す方式に切り替え、テストを再実行する。

- [ ] **Step 7: 実機で音を確認する（手動）**

`npm run dev` を起動し、ブラウザで 0:05（1回）と 0:10（3回）のテンプレートを作って開き、スタートする。確認する点は次のとおり。

- 5秒と10秒でベルが鳴り、10秒では 3回鳴る
- 一時停止すると鳴らず、再開すると残りのベルが鳴る
- スタート直後に別のタブへ切り替えても、時間どおりに鳴る
- 実行中にトップへ戻ると、その後は鳴らない
- 「ベルを鳴らす」で1回鳴る

結果を作業メモに残す。

- [ ] **Step 8: 単体テストとビルドを確認してコミットする**

Run: `npm test && npm run build`
Expected: 成功

```bash
git add src/hooks src/components/TimerView.tsx src/app/t e2e/timer.spec.ts
git commit -m "feat: add timer screen with Web Audio bells and overtime display

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: トップページ（最近使ったテンプレート）

**Files:**
- Create: `src/components/RecentList.tsx`
- Modify: `src/app/page.tsx`（雛形を置き換える）
- Test: `e2e/home.spec.ts`

**Interfaces:**
- Consumes: `loadRecent` `removeRecent` `RecentEntry`（Task 5）、`createTemplateViaApi`（Task 7）

- [ ] **Step 1: 失敗する E2E テストを書く**

`e2e/home.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { createTemplateViaApi } from "./helpers";

test("開いたテンプレートが最近使った一覧に出て、一覧から外せる（サーバーからは消えない）", async ({ page, request }) => {
  const id = await createTemplateViaApi(request, { name: "最近のテンプレ", bells: [{ at: 60, count: 1 }] });
  await page.goto("/");
  await expect(page.getByText("まだありません")).toBeVisible();

  await page.goto(`/t/${id}`);
  await expect(page.getByRole("heading", { name: "最近のテンプレ" })).toBeVisible();
  await page.goto("/");
  const item = page.getByRole("listitem").filter({ hasText: "最近のテンプレ" });
  await expect(item).toBeVisible();

  await item.getByRole("button", { name: "一覧から外す" }).click();
  await expect(page.getByText("最近のテンプレ")).toHaveCount(0);
  expect((await request.get(`/api/templates/${id}`)).status()).toBe(200);
});

test("トップから新規作成ページへ移動できる", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "新しいテンプレートを作る" }).click();
  await expect(page).toHaveURL(/\/new$/);
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm run test:e2e -- e2e/home.spec.ts`
Expected: FAIL（雛形のトップページに該当リンクがない）

- [ ] **Step 3: 一覧コンポーネントとトップページを書く**

`src/components/RecentList.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadRecent, removeRecent, type RecentEntry } from "@/lib/recent";

export function RecentList() {
  // localStorage はブラウザでしか読めないので、マウント後に読み込む
  const [entries, setEntries] = useState<RecentEntry[] | null>(null);

  useEffect(() => {
    setEntries(loadRecent());
  }, []);

  if (entries === null) return null;
  if (entries.length === 0) {
    return <p className="text-zinc-500">まだありません。テンプレートを作るか、共有URLを開くとここに表示されます。</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-center gap-3 py-3">
          <Link href={`/t/${entry.id}`} className="flex-1 font-medium underline-offset-4 hover:underline">
            {entry.name}
          </Link>
          <button
            type="button"
            onClick={() => setEntries(removeRecent(entry.id))}
            className="rounded px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            一覧から外す
          </button>
        </li>
      ))}
    </ul>
  );
}
```

`src/app/page.tsx`（全体を置き換える）:

```tsx
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
```

雛形が `public/` に置いた SVG（`next.svg` など）は使わなくなるので削除してよい。

- [ ] **Step 4: 全テストとビルドを確認する**

Run: `npm test && npm run test:api && npm run test:e2e && npm run lint && npm run build`
Expected: すべて成功

- [ ] **Step 5: コミットする**

```bash
git add -A
git commit -m "feat: add home page with recent templates

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Workers ランタイムでの確認と本番デプロイ

外部サービスへの公開を伴うため、**Step 3 以降はユーザーの確認を得てから実行する**。Cloudflare へのログインはユーザー自身が行う。

**Files:**
- Modify: `wrangler.jsonc`（`database_id` を本物の値にする）
- Create: `README.md`（起動・テスト・デプロイの手順）

- [ ] **Step 1: Workers ランタイムでローカルプレビューする**

```bash
npm run db:migrate:local
npm run preview
```

Expected: OpenNext のビルドが成功し、`wrangler dev` 相当のサーバーが起動する（表示された URL、通常は `http://localhost:8787`）。ブラウザでテンプレートの作成、タイマー、編集、削除が動く。

- [ ] **Step 2: README を書いてコミットする**

`README.md`:

````markdown
# ベルタイマー

発表の時間管理用ベルタイマー。Next.js + Cloudflare Workers + D1。

## 開発

```bash
npm install
npm run db:migrate:local   # ローカル D1 にテーブルを作る
npm run dev                # http://localhost:3000
```

## テスト

```bash
npm test           # 単体テスト
npm run test:api   # API テスト（Workers ランタイム + ローカル D1）
npm run test:e2e   # E2E（Playwright）
```

## デプロイ

```bash
npx wrangler login
npx wrangler d1 create bell-db     # 初回のみ。表示された database_id を wrangler.jsonc に設定する
npm run db:migrate:remote
npm run deploy
```
````

```bash
git add README.md
git commit -m "docs: add README

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: （ユーザー確認後）Cloudflare にログインして D1 を作る**

ユーザーにプロンプトで `! npx wrangler login` を実行してもらう。続けて次を実行する:

```bash
npx wrangler d1 create bell-db
```

Expected: `database_id` が表示される。`wrangler.jsonc` の `"database_id"` をその値に書き換える。

- [ ] **Step 4: （ユーザー確認後）本番 D1 にマイグレーションしてデプロイする**

```bash
npm run db:migrate:remote
npm run deploy
```

Expected: `https://bell.<アカウントのサブドメイン>.workers.dev` が表示される。その URL でテンプレートを作成し、別の端末やブラウザで共有 URL を開いて同じテンプレートが表示されることを確認する。

- [ ] **Step 5: コミットする**

```bash
git add wrangler.jsonc
git commit -m "chore: set production D1 database id

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
