# Nix での実行

`nix build` でパッケージをビルドし、次の設定で起動します。OIDC のリダイレクト URI は `${APP_ORIGIN}/auth/callback` です。

```sh
export PORT=3101
export APP_ORIGIN=http://localhost:3101
export OIDC_ISSUER=https://id.example.com
export OIDC_CLIENT_ID=flare-web
export OIDC_CLIENT_SECRET_FILE=/run/secrets/flare-web-oidc
nix run
```

公開する場合は HTTPS のリバースプロキシを用意し、`APP_ORIGIN` をその URL に変更します。公開クライアントとして登録した場合は `OIDC_CLIENT_SECRET_FILE` を省略できます。Pocket ID を含む任意の Discovery 対応 OIDC プロバイダーを指定できます。

接続情報は既定で `${XDG_STATE_HOME:-$HOME/.local/state}/flare-web` に保存します。保存先は `FLARE_DATA_DIR` で変更できます。暗号化鍵も同じディレクトリに保存するため、バックアップはディレクトリ全体を対象にしてください。

開発用には `nix develop` を使います。Node.js と pnpm が PATH に追加されます。Twitter Safe Relay をまとめて起動する構成は [Docker Compose](docker.md) を参照してください。Nix から起動したアプリで既存 Relay に接続するときは `TWITTER_RELAY_BASE_URL` を設定します。

## NixOS モジュール

この flake の `nixosModules.default` を import し、次の設定を追加します。

```nix
services.flare-web = {
  enable = true;
  port = 3101;
  settings = {
    APP_ORIGIN = "https://flare.example.com";
    OIDC_ISSUER = "https://id.example.com";
    OIDC_CLIENT_ID = "flare-web";
  };
  environmentFile = "/run/secrets/flare-web.env";
};
```

秘密値は実行時の `environmentFile` に置きます。`settings` や Nix ソースへ直接書くと Nix store に保存されます。サービスは DynamicUser で動作し、データを `/var/lib/flare-web` に保存します。
