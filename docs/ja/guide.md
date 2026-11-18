# Noren 運用ガイド

[English](../en/guide.md) · [日本語](../ja/guide.md) · [简体中文](../zh-CN/guide.md) · [README](README.md)

Noren のログイン、タイムライン、投稿は React クライアントと Node.js サーバーが担当します。LP とプラグインの作者ガイドは Astro の静的サイトです。通常のビルドでは両方を同じドメインで配信でき、LP だけに別のドメインを割り当てることもできます。

## ログインと SNS の接続

Pocket ID など、Discovery に対応した OIDC プロバイダーに Noren を登録します。`APP_ORIGIN` にはクライアントの公開 HTTPS URL を指定し、`${APP_ORIGIN}/auth/callback` をリダイレクト URI として登録します。`OIDC_ISSUER` と `OIDC_CLIENT_ID`、必要に応じてクライアントシークレットを設定します。[環境変数の例](../../.env.example)

ログイン後に「アカウント」から接続先を選びます。Mastodon は OAuth とアクセストークン、Bluesky は OAuth とアプリパスワードに対応しています。Bluesky の OAuth では、公開 URL から `/bluesky-client.json` を取得できるようにします。Misskey は MiAuth で認可します。Nostr は NIP-07 対応の拡張機能をインストールし、拡張側で署名を承認します。

## Docker Compose で起動する

`.env.example` を `.env` にコピーし、OIDC の設定と `TWITTER_BROWSER_PASSWORD` を記入してから起動します。

```sh
docker compose up -d --build
```

Noren は http://localhost:3101 で開けます。X を接続するには https://localhost:6901 を開き、`kasm_user` と設定したパスワードで Chrome に入ります。Chrome 内で X にログインし、Noren で `account1` を選びます。別のサーバーで動かす場合は `ssh -L 6901:localhost:6901 <server>` でブラウザに接続できます。

公開時は HTTPS のリバースプロキシを前段に置きます。Relay のプロフィールは、このインスタンスにログインできる全員が使えます。個人用なら `OIDC_ALLOWED_SUBJECTS` に自分の subject を指定してください。バックアップには `flare-data` と `twitter-profile` の両方を含めます。

## NixOS で起動する

この flake の `nixosModules.default` を import します。シークレットは実行時に読む環境変数ファイルに置きます。バックアップは暗号化鍵を含む `/var/lib/flare-web` 全体を対象にします。

```nix
services.noren = {
  enable = true;
  port = 3101;
  settings = {
    APP_ORIGIN = "https://social.example.org";
    OIDC_ISSUER = "https://id.example.org";
    OIDC_CLIENT_ID = "noren";
  };
  environmentFile = "/run/secrets/noren.env";
};
```

## Cloudflare Workers

LP を専用ドメインに配信できます。`PUBLIC_FLARE_APP_URL` には **Noren クライアント**の公開 HTTPS URL を指定します。Astro がビルド時にアプリ・レジストリ・ライセンスへのリンクを生成します。OIDC と SNS の認証情報はクライアント側のサーバーで管理します。

リポジトリのルートで `pnpm install --frozen-lockfile` を実行します。ローカルから初めて公開するときは `pnpm dlx wrangler@4.164.0 login` で認証します。次の URL を自分のクライアントの公開先に置き換えてください。

```sh
PUBLIC_FLARE_APP_URL=https://social.example.org pnpm --filter @flare/site run deploy
```

公開前にアップロード内容を確認するには次を実行します。

```sh
PUBLIC_FLARE_APP_URL=https://social.example.org pnpm --filter @flare/site build:worker
pnpm dlx wrangler@4.164.0 deploy --config apps/site/wrangler.jsonc --dry-run
```

Git からのデプロイは、Cloudflare の **Workers Builds** で `noren-site` Worker にこのリポジトリを接続します。ルートディレクトリをリポジトリのルートにし、ビルド変数に `PUBLIC_FLARE_APP_URL` を指定します。公開に使うブランチと次のコマンドを設定してください。 [Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)

| ビルドコマンド | デプロイコマンド |
| --- | --- |
| `pnpm --filter @flare/site build:worker` | `pnpm dlx wrangler@4.164.0 deploy --config apps/site/wrangler.jsonc` |

日本語の LP は `/`、英語は `/en/`、簡体字中国語は `/zh/` で開けます。それぞれの末尾に `plugins/` を付けると作者ガイドが開きます。同梱版では各パスの先頭に `/site` を付けます。

## プラグインを作る

[引用操作のサンプル](../../plugins/quote-local/)を `plugins/` 以下にコピーし、manifest の ID、作者、各言語の表示名を設定します。本文を使う操作には `post.text`、元リンクを使う操作には `post.url` を指定します。`action.js` から操作を export し、本文の下に結果を出すには `inlineText`、コピー画面を開くには `copyText` を返します。

クライアントを起動し、レジストリで操作を有効にします。NixOS での配布は `services.noren.plugins` にディレクトリを追加します。外部プラグインは non-flake input にすると、管理者が `flake.lock` で版を固定できます。

## 設計資料と運用例

- [Compose の構成とボリューム](../docker.md)
- [Nix パッケージと NixOS モジュール](../nix.md)
- [プラグインの配布と実行](../plugins/runtime.md)
- [ドメイン用語集](../../GLOSSARY.md)
