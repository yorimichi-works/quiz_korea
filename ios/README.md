# 먼저! iOS 프로젝트

`Meonjeo.xcodeproj` は、韓国語クイズをiPhoneアプリとして動かすSwiftUIプロジェクトです。iOS 16以降、iPhone専用、Bundle IDは `com.yorimichiworks.meonjeo` です。

## 実装済み

- 永続セッション付きWKWebView
- Sign in with AppleからFirebaseへの認証ブリッジ
- 接続元ホストの検証と外部リンクのSafari分離
- オフライン表示、読み込み表示、引っ張って更新
- 共有シートと触覚フィードバックのネイティブブリッジ
- Sign in with Apple entitlementと透過なしApp Storeアイコン

## Macでの初回手順

1. Xcode 26以降（iOS 26 SDK以降）で `Meonjeo.xcodeproj` を開く。
2. MeonjeoターゲットのSigning & CapabilitiesでApple Developer Teamを選ぶ。
3. Apple DeveloperとApp Store Connectで既存登録を検索する。未登録の場合だけBundle ID `com.yorimichiworks.meonjeo` を登録し、Sign in with Appleを有効にする。
4. Firebase AuthenticationのApple設定を所有者が確認する。新しい秘密鍵の生成・アップロードや永続権限の追加は別途承認し、安全な入力方法で行う。秘密鍵をGitやチャットへ置かない。
5. 実機でゲスト開始、Apple連携、再起動後のログイン保持、ログアウト、再連携、アカウント削除を確認する。
6. Product > ArchiveからTestFlightへアップロードする。

アイコンを更新した場合は、リポジトリ直下で `npm run build:ios-assets` を実行してください。

## 提出前の検証

2026年4月28日以降のアップロードはXcode 26以降とiOS 26 SDK以降が必要です。最低対応OS（iOS 16）とは別の条件です。
[AppleのSDK要件](https://developer.apple.com/news/upcoming-requirements/?id=04282026a)

- `npm run ios:verify` は構成と認証APIの自動試験で、Swiftコンパイル・署名・実機動作の代わりにはなりません。
- Macでは `bash scripts/verify-ios-on-mac.sh` でXcode/SDKバージョンと署名なしSimulatorビルドを確認できます。
- `Meonjeo` の共有Schemeを同梱しています。署名済ArchiveはXcodeでTeamと既存証明書を確認後に作成します。
- 実機試験と撮影: [`../store/apple/DEVICE_TEST_PLAN.md`](../store/apple/DEVICE_TEST_PLAN.md)
- 提出状況と残件: [`../store/apple/APP_STORE_READINESS.md`](../store/apple/APP_STORE_READINESS.md)

## 自動検証

`.github/workflows/app-readiness.yml` はPRでWeb/認証/構成試験、lint、型検査、Web buildと、macOS 26上の署名なしSimulatorコンパイルを実行します。Simulator用`.app`は14日保持のActions artifactになります。これはiPhoneに配布できるIPAではありません。認証キーや署名証明書を渡さず、Appleサービスへの提出も行いません。

読み込みに失敗した時は韓国語の再試行画面を表示します。認証bridge v2はrequest IDで古い認証結果を無視し、既存v1とWebの互換も保ちます。実機試験は引き続き必要です。


CIはiPhone Simulatorへの実インストール/起動とQAスクリーンショット取得も行います。`scripts/build-ios-unsigned-archive.sh` は実機arm64向けの署名なしArchiveを作成します。シミュレーター用`.app`と実機用未署名`.xcarchive`は別物で、いずれも提出可能な署名済みIPAではありません。起動画像は現在配信中のWebを表示しているため、サーバー変更の本番反映やAppleログイン成功を証明しません。
