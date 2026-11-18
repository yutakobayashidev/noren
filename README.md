# Flare Web

Flare Android のタイムラインとアカウント操作を React・TypeScript・Tailwind CSS・shadcn/ui で実装した Web クライアントです。最初に OIDC で Flare Web にログインし、Accounts から各 SNS を接続します。

| 接続先 | 接続方法 |
| --- | --- |
| Mastodon | OAuth、アクセストークン |
| Bluesky | OAuth、アプリパスワード |
| Misskey | MiAuth |
| Nostr | NIP-07 対応拡張で署名 |
| X | Twitter Safe Relay のログイン済みプロフィール |

[Docker Compose](docs/docker.md) はログイン用 Chrome と Twitter Safe Relay を同梱します。[Nix パッケージと NixOS モジュール](docs/nix.md) でも起動できます。OIDC は Discovery 対応のプロバイダーを設定でき、Pocket ID では公開 URL を issuer に指定します。

開発時は `nix develop` の中で `pnpm install --frozen-lockfile` と `pnpm dev` を実行します。OIDC 設定例は [.env.example](.env.example) にあります。ローカルで公開投稿だけ試すには `FLARE_PREVIEW=1 pnpm dev` を使います。

PWA のインストールは HTTPS または localhost の本番ビルドで利用できます。オフライン時には再接続画面を表示します。設定から日本語・簡体字中国語・英語を選べます。WebMCP に対応するブラウザでは、設定から検索プラグインを有効にできます。

## 移植元

画面構成とタイムラインの扱いは [Flare Android](https://github.com/flaresocialapp/Flare/tree/fd3979c2860ed509ecc97c6eef2212a977571282) の HomeScreen、HomeTimelineScreen と各 SNS の DataSource を参照しています。PWA アイコンの出典も同リポジトリです。twitter-lite からは X の投稿変換と Relay 接続を採用しています。ドメイン用語は [GLOSSARY.md](GLOSSARY.md) にまとめています。

## ワークスペース

pnpm workspace のルートは Flare Web クライアントと API、`apps/site` は Astro の LP・作者ガイド、`packages/plugin-starter` はレジストリから有効化できる投稿操作のサンプルです。通常の開発起動で同じ origin の `/site/` と `/site/plugins/` が開けます。LP の編集時は `pnpm site:dev` で Astro のライブプレビューを起動できます。

- `pnpm check` は整形、lint、型検査、単体・OIDC テストを順に実行します。単体テストは Vite+ の Vitest、lint は Oxlint、整形は Oxfmt と Astro 用 Prettier プラグインを使います。
- `pnpm format` はワークスペースのコードを整形します。
- `pnpm build` はクライアントと静的サイトを dist に出力します。
- `pnpm exec playwright install chromium` の後、`pnpm test:e2e` でブラウザテストを実行します。

LP は独立した Astro アプリとしても配信できます。`PUBLIC_FLARE_APP_URL=https://flare.example.com pnpm --filter @flare/site build` は、サイトルート向けの静的ファイルを `apps/site/dist` に生成します。Web クライアントと同梱する `pnpm build` では `dist/site` を生成します。
