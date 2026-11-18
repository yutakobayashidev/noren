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
