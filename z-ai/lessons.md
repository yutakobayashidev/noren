# Lessons

- 2026-11-19: Bluesky の接続も OAuth を標準導線にする。SNS の認証方式は公式の現行対応を確認して選ぶ。
- 2026-11-19: Docker Compose の例には Twitter Safe Relay とログイン用ブラウザ・永続プロファイルを含める。外部 Relay の URL だけを利用者に要求しない。

- 2026-11-18: Flare Web の土台は Flare のネイティブ実装。twitter-lite は Twitter 接続部分だけを採用する。ネイティブ版の clone を、見た目だけ参考にした独自 React アプリや既存 Web 版の改修に置き換えない。基盤・状態管理・ドメイン処理を先に調査し、移植元と再利用範囲を明示する。
- 2026-11-18: Android 版を土台にする指定は Compose をブラウザで使う指定ではない。Web UI は React・Tailwind・shadcn/ui が必須。Android の画面構成・操作と Flare 共通 Kotlin 処理を継承し、UI 技術の選定を移植元から決めつけない。
- 2026-11-18: 「ネイティブ実装をベースにする」はソースを参照した Web スタックへの書き直しを意味する。Kotlin/WASM への依存は持ち込まない。確定要件は Flare Android 準拠、React/TypeScript/Tailwind/shadcn、twitter-lite は Twitter 接続のみ。
- 2026-11-19: Flare の全対応先を無条件で実装範囲に含めない。今回 Pixiv・Fanbox は対象外。対象は X・Mastodon・Bluesky・Misskey・Nostr・RSS、PWA 対応を含む。
- 2026-11-19: SNS のログインを手動トークン入力で済ませない。Mastodon は OAuth の認可画面、Nostr は NIP-07 拡張の公開鍵取得・署名を標準導線にする。秘密鍵はアプリへ入力させない。
- 2026-11-19: 推奨のログイン方式を追加しても、利用できる既存方式は選択肢に残す。Mastodon は OAuth とアクセストークン、Bluesky は OAuth とアプリパスワードを併用する。
- 2026-11-19: RSS / Atom は対象外。タイムラインに統合するのは X・Mastodon・Bluesky・Misskey・Nostr。
- プラグインの企画では、一般的な便利機能の列挙より、複数 SNS を同時に使う場面と、そのとき初めて可能になる操作を具体化する。
- プラグイン一覧は作者・カテゴリ・利用方法・状態が見えるレジストリとして設計し、設定用トグルだけを拡大した画面にしない。
