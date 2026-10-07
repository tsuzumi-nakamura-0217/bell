# ベルタイマー

発表の時間管理用ベルタイマー。好きな時刻に好きな回数のベルを鳴らせます。テンプレートはサーバー（Cloudflare D1）に保存され、サイトを開いた全員がサイドバーから選んで使えます。

- 本番: https://bell.smallkabutomsi.workers.dev
- 構成: Next.js 16.3 + `@opennextjs/cloudflare`（Cloudflare Workers）+ D1
- 仕様: `docs/superpowers/specs/2026-10-07-bell-timer-design.md`

> Next.js は 16.3.8 に固定しています。16.4 が出力する `.next/server/preview-props.json` を `@opennextjs/cloudflare` 1.20.9 がまだ扱えず、Workers 上で起動時に落ちるためです。上げるときは `npm run preview` で動作を確認してください。

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
npm run test:e2e   # E2E（Playwright）。3000 番が使用中なら E2E_PORT=3100 npm run test:e2e
```

## デプロイ

```bash
npx wrangler login
npm run db:migrate:remote   # マイグレーションを追加したときだけ
npm run deploy
```

本番の D1 データベース `bell-db` は作成済みで、`wrangler.jsonc` に ID を設定してあります。
