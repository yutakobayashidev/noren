# プラグインの配布と実行

設計決定。最初の拡張箇所は投稿メニュー、最初の利用例は PLaMo による端末内翻訳とする。現在動くのは本体に同梱した Markdown 引用操作と WebMCP。以下は次の実装が満たす契約である。

## 既存の実装から採用した点

| 実装 | 作者が使う仕組み | Flare で採用する点 |
| --- | --- | --- |
| DeepSeek Harness | Cordis の `inject` で必要なサービスを宣言する。`ctx` に登録したツールや購読はアンロード時に解除される。 | 実行中の要求をホストが所有し、無効化時にまとめて取り消す。[ライフサイクル](https://deepseek-harness.github.io/deepseek-harness/en/develop/framework/) |
| Pi coding agent | npm・Git・ローカルからパッケージを配布できる。規約に沿った配置か manifest で内容を発見し、拡張の関数でツールを登録する。 | 作者は普通の JS と manifest を配布できる。利用者は一覧を見るだけなら JS をロードしない。[パッケージ](https://docs.pi.dev/latest/packages)・[拡張 API](https://docs.pi.dev/latest/extensions) |
| VS Code | manifest の contributions で提供するコマンドなどを宣言し、起動条件に応じて実装をロードする。 | レジストリ、メニューの表示名、必要な権限を静的に読み取る。[Extension Anatomy](https://code.visualstudio.com/api/get-started/extension-anatomy) |
| Joplin | プラグインとホストの間で API 呼び出しをメッセージに変換し、イベントハンドラーを ID で対応付ける。 | 投稿カードを渡さず、実行 ID とデータだけを送る。[実行方式](https://joplinapp.org/help/dev/spec/plugins/) |
| Figma | プラグイン本体を制限された JS 環境で実行し、必要なら UI を iframe に置く。 | 訳文の描画・クリップボード操作はホストが担当する。[How Plugins Run](https://developers.figma.com/docs/plugins/how-plugins-run/) |
| Misskey | AiScript の API でノートや投稿フォームの操作を登録できる。 | SNS 固有の操作に名前を付ける。最初に公開するのは選択した投稿への操作だけ。[Plugin API](https://misskey-hub.net/en/docs/for-developers/plugin/plugin-api-reference/) |

## 管理者が配布し、読者が有効にする

配布単位は manifest とブラウザ用 JS を含むディレクトリとする。作者は Nix を書かずに公開できる。NixOS モジュールの予定インターフェースは次のとおり。外部リポジトリは flake input として宣言し、flake.lock でリビジョンを固定する。

```nix
services.flare-web.plugins = [
  ./plugins/my-quote
  inputs.plamo-plugin.outPath
];
```

ビルド時に ID の重複、未知の API バージョン、存在しないエントリ、パッケージ外を指すファイルを検出したらビルドを止める。配布した版と要求権限から静的な一覧を生成する。利用者の有効化はブラウザ内の Flare ログイン単位で記録し、権限追加時は再確認まで停止する。Nix の世代を戻すと一覧とコードが一緒に戻る。削除済み ID の有効化記録だけでは起動できない。

## 投稿操作の契約

既存の apiVersion 1 の引用プラグインは同梱用として維持する。新しい契約は apiVersion 2 とし、manifest に ID、版、作者、日英中の表示名、操作 ID、エントリ、要求権限を記載する。単純な引用は投稿本文と元 URL を読み、copyText を返す。翻訳は本文と翻訳先言語を読み、非同期に inlineText を返す。ホストは許可された項目だけを入力に含め、結果はテキストとして描画する。

読者が操作を選ぶと、ホストは実行 ID を発行し、その投稿カードと有効化の世代に結び付ける。カードを閉じた場合、ログアウト、無効化、タイムアウトでは実行を取り消す。遅れて届いた結果や異なるカードの結果は捨てる。内容注意で隠れた本文は利用者が開くまで渡さない。

外部 JS は本体と異なるオリジンで隔離し、ホストとの通信を実行ごとの MessagePort に限定する。モデル取得と推論はホストが管理する専用 Worker のサービスとして公開する。プラグインは manifest で要求したモデル ID のみ指定できる。任意の URL、DOM、SNS の資格情報、認証済み API は公開しない。現在の同梱用 dynamic import は本体と同じ権限を持つため、外部パッケージのローダーには転用しない。

## PLaMo で確認すること

Sakutto は固定した wllama で PLaMo を動かし、Chromium では offscreen document が推論用 Worker を維持する。モデルは後から取得し、ブラウザストレージか利用者が選んだフォルダに保存する。Flare の PWA ではページが専用 Worker を所有し、タブを閉じたら推論も終了する。[Sakutto](https://github.com/jammaru/sakutto)

1. HTTPS の PWA で WebGPU アダプターと必要なデバイス機能を確認する。利用できない端末では理由を表示し、モデルの取得前に止める。平文 HTTP の tailnet プレビューは GPU の検証対象外とする。[GPU.requestAdapter](https://developer.mozilla.org/en-US/docs/Web/API/GPU/requestAdapter)
2. 初回にモデル名、容量、配布元を表示する。明示的な取得後にダイジェストを検証し、完了したモデルだけを再利用する。取得中断、容量不足、モデル削除から再試行できるようにする。
3. 読者が投稿の翻訳を選ぶと、本文だけを端末の WebGPU で処理し、原文の下に訳文を表示する。同じタブではモデルを共有して要求を順番に実行する。GPU 喪失時は原文を残し再試行を提示する。
4. Android とデスクトップの実機で初回のモデル取得量、最初の訳が出るまでの時間、二件目の待ち時間を記録する。オフライン再翻訳、無効化直後のキャンセル、投稿本文の外部送信ゼロを確かめる。

実装順は、モデル不要の引用操作で隔離・キャンセル・Nix の追加とロールバックを検証し、その後に PLaMo の実機検証へ進む。公開レジストリで第三者コードを受け入れる条件は、隔離環境からの外部通信、親 DOM、ストレージ、認証済み API への直接アクセスをブラウザ試験で遮断できることとする。
