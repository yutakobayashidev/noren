# Docker Compose と Twitter Safe Relay

この Compose は Flare Web、Twitter Safe Relay、X ログイン用 Chrome をまとめて起動します。Relay は公式の `0.4.3-relay-slim` イメージを使い、Chrome と同じネットワーク名前空間から CDP に接続します。

## 起動

1. `.env.example` を `.env` にコピーし、`TWITTER_BROWSER_PASSWORD` に任意の長いパスワードを設定します。
2. `.env` に `APP_ORIGIN`、`OIDC_ISSUER`、`OIDC_CLIENT_ID`、必要なら `OIDC_CLIENT_SECRET` を設定します。OIDC プロバイダーへ登録するリダイレクト URI は `${APP_ORIGIN}/auth/callback` です。
3. `docker compose up -d --build` を実行します。
4. `https://localhost:6901` を開き、ユーザー名 `kasm_user` と設定したパスワードで Chrome の画面に入ります。Kasm の自己署名証明書を確認し、Chrome 内で `https://x.com` にログインします。
5. Flare Web の Accounts で X のプロファイル `account1` を選びます。

Flare Web の公開先は既定で `http://localhost:3101` です。本番では HTTPS のリバースプロキシを前段に置き、その URL を `APP_ORIGIN` に設定してください。サーバー上で起動する場合、Chrome のログイン画面には `ssh -L 6901:localhost:6901 <server>` で接続できます。

## 保存と接続

`flare-data` は Flare Web の暗号化された接続情報、`twitter-profile` は Chrome のログイン状態を保存します。通常の `docker compose down` では両方を保持します。`down -v` は両方の保存データを削除するため、再ログインが必要になります。

Flare Web は内部 URL `http://twitter-browser:3000` で Relay に接続します。Compose ではこの値を固定しており、`.env` の `TWITTER_RELAY_BASE_URL` は Compose 外で起動するときだけ使用します。Relay の HTTP ポートと Chrome の CDP ポートはホストに公開しません。Relay の正常性チェックはプロセスの動作確認であり、X のログイン完了を保証するものではありません。

Relay の `account1` は、この Flare Web インスタンスにログインできる利用者が共有します。個人用途では `OIDC_ALLOWED_SUBJECTS` で自分の OIDC subject に制限してください。

設定の元となる公式例: [Twitter Safe Relay Docker](https://github.com/fa0311/twitter_api_safe_relay/tree/438bcc0cce49905cef1199b92ab71aee7e65433b/docker)。

Bluesky の「サーバーで認可」は AT Protocol の OAuth を使います。本番では公開 HTTPS の `APP_ORIGIN` から `/bluesky-client.json` を取得できるようにします。ローカルで認可を試す場合は `APP_ORIGIN=http://127.0.0.1:3101` とし、同じ IP アドレスから開きます。OIDC のリダイレクト URI もこの origin に合わせます。既存のアプリパスワードはログイン方法の選択欄から利用できます。
