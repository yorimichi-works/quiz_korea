# モンジョの署名とTestFlightへの進め方

対象: `yorimichi-works/quiz_korea`、Bundle ID `com.yorimichiworks.meonjeo`、iPhone、iOS 16以降、version 1.0.0。作成日: 2026-10-07 JST。

## 最初に必要なこと

所有者がApple DeveloperとApp Store Connectへログインし、登録先TeamとこのBundle IDの既存登録を確認します。登録状態を確認できないまま、重複アプリや新しい鍵を作りません。

署名なしのSimulatorアプリと実機arm64 ArchiveはGitHub CIで生成・検証済みです。署名済IPA、TestFlight送信、Apple本番認証、削除、実機2台対戦は別の工程です。直近の確定結果はPR #1の「Final verified result」を参照してください。

## 1 Apple側の登録を確認する

1. Apple Developerで登録先Teamを選ぶ。Bundle ID `com.yorimichiworks.meonjeo` の有無を検索する
2. 既存App IDがあれば再利用し、Sign in with Apple capabilityの有効状態を確認する。なければ所有者の承認後に作成する
3. App Store ConnectでもBundle IDに紐づく既存アプリを検索する。なければ名称・主言語・SKU・アクセス対象を確認して新規レコードを作る
4. 数字のApple ID、使用済みversion/build番号、契約更新の表示を確認する。契約への同意や追加料金があれば所有者へ引き継ぐ

Bundle ID、Apple ID（数字）、Team ID、Services IDは別物です。推測で置き換えません。パスワードや秘密鍵をチャット・Git・ログへ書きません。

## 2 Appleログインと削除を接続する

このアプリはAuthenticationServicesで得たApple tokenをWeb側Firebase Authへ渡します。既存ゲスト戦績の移管と、削除時の再認証・認可コード失効を両方通す必要があります。

- Firebaseの対象プロジェクトと登録アプリを確認し、必要なiOS Bundle ID登録を所有者承認後に行う
- Apple側で対象App ID、Services ID、必要なSign in with Appleキーの既存設定を確認する
- FirebaseのAppleプロバイダ、Services ID、OAuth code flow設定を整合させる。Return URLは実際のFirebase project IDから決める
- 既存の承認済ドメインは重複追加しない
- Appleの非公開メール、再認証、token失効、削除完了を試験用アカウントで確認する

App Store Connect APIキーはビルド/アップロード用、Sign in with Appleキーは利用者ログイン用です。同じ`.p8`拡張子でも相互に流用しません。新しい鍵の作成・権限追加にはその操作への承認が必要で、秘密鍵の入力/アップロードは所有者が安全な画面で行います。

Firebase Authユーザーは同じFirebaseプロジェクト内のアプリで共有されます。既存の別アプリとプロジェクトを共用する場合、`deleteUser`で他アプリの認証にも影響しないかを先に確認します。既存ユーザーを移す、別プロジェクトを新設する、といった変更は自動では行いません。

[Firebase Apple Web認証](https://firebase.google.com/docs/auth/web/apple) / [Apple認証と失効](https://firebase.google.com/docs/auth/ios/apple)

## 3 Codemagicの最小構成

既存の連携や証明書が見えても、そのままモンジョへ利用範囲を拡張しません。所有者が利用する連携と署名資材を承認してから、モンジョ専用の設定を作ります。

1. Applicationsで既存モンジョアプリを確認。なければ承認後に`quiz_korea`を追加する
2. 対象Teamの有効なApple Distribution証明書を選ぶ。不要な証明書を新設・失効しない
3. `com.yorimichiworks.meonjeo`とSign in with Apple entitlementを含むApp Store provisioning profileを確認し、必要なら承認後に作成・登録する
4. 当日の無料枠/料金と並列ビルド状況を確認する。課金を有効にしない
5. [`ci/codemagic.yaml.example`](../../ci/codemagic.yaml.example)の2つのreferenceとbuild番号を確定する。承認後にだけrootの`codemagic.yaml`へ移す

例はビルド専用です。自動トリガー、Apple API連携、公開/アップロード設定を含まず、未確認のbuild番号と承認フラグでは停止します。YAML構文と静的ガードを検査した例であり、Codemagicでの署名成功を証明しません。

[Codemagic署名設定](https://docs.codemagic.io/yaml-code-signing/signing-ios/) / [native iOSビルド](https://docs.codemagic.io/yaml-quick-start/building-a-native-ios-app/)

## 4 Web修正を公開する前に

GitHubへのcommit/PRと、公開Webへの反映は別です。公開元の現行ソースを取得・照合し、今回のAPI・認証・プライバシー修正だけを既存の変更を保持して適用します。現行ソースを読めなければ丸ごと上書きしません。

公開するサイト、差分、公開範囲、戻し方を確認してから公開承認を受けます。その後、公開APIのゲスト移管、privacy/削除案内、ログインを再検証します。Simulatorホーム画面が見えることだけで、未公開サーバー修正の受入合格にはしません。

## 5 署名済IPAを確認する

- Bundle ID、Team、version/build、署名証明書、プロビジョニング期限を確認する
- entitlementの`com.apple.developer.applesignin`を確認する
- 使用したGit commitとWeb版、IPAのSHA-256を記録する
- [`DEVICE_TEST_PLAN.md`](DEVICE_TEST_PLAN.md)を実機で実施し、実施済み/未実施を分ける
- TestFlightへの送信先Apple IDと、対象IPA/build番号を確定する

## 6 TestFlightへ送る

初回は対象と結果を確認しやすい手順で、所有者承認済みのIPAだけをアップロードします。アップロード完了に加え、Apple側の処理完了、暗号化質問等の不足、内部テスターへの利用可否、実機インストールまで確認します。

Codemagicの`submit_to_testflight`はベータレビュー送信の設定です。単なるバイナリアップロードや、内部テスターだけでの確認と混同しません。外部テスター招待、ベータレビュー、本番App Store審査提出、公開日は、それぞれ対象と目的が承認されてから設定します。旧ビルドの期限切れや既存審査のキャンセルは自動で行いません。

[CodemagicのApp Store Connect配信](https://docs.codemagic.io/yaml-publishing/app-store-connect/)

## 朝の確認でまとめて決める項目

- Appleへログインして既存登録を確認する
- モンジョ用App ID/機能・profile・Firebase Apple設定の不足分を、確認した範囲で準備してよいか
- 利用する既存署名資材/API連携の対象と範囲。新規キーが必要なら別に明示承認する
- PR反映と現行Webとの差分適用・公開を行ってよいか
- 署名済IPA確認後のTestFlightアップロード先と内部確認の対象。公開審査/外部配信を混ぜない

最初に必要なユーザー操作はAppleログインです。その後に登録状況を確定させれば、不要なキー発行や重複アプリ作成を避けられます。
