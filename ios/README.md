# 먼저! iOS 프로젝트

`Meonjeo.xcodeproj` は、公開中の韓国クイズをiPhoneアプリとして動かすSwiftUIプロジェクトです。iOS 16以降、iPhone専用、Bundle IDは `com.yorimichiworks.meonjeo` です。

## 実装済み

- 永続セッション付きWKWebView
- Sign in with AppleからFirebaseへの認証ブリッジ
- 接続元ホストの検証と外部リンクのSafari分離
- オフライン表示、読み込み表示、引っ張って更新
- 共有シートと触覚フィードバックのネイティブブリッジ
- Sign in with Apple entitlementと透過なしApp Storeアイコン

## Macでの初回手順

1. Xcode 16以降で `Meonjeo.xcodeproj` を開く。
2. MeonjeoターゲットのSigning & CapabilitiesでApple Developer Teamを選ぶ。
3. Bundle ID `com.yorimichiworks.meonjeo` をApple Developerで登録し、Sign in with Appleを有効にする。
4. Firebase AuthenticationでAppleプロバイダを有効にし、AppleのTeam ID、Key ID、秘密鍵、Services IDを設定する。
5. 実機でゲスト開始、Apple連携、再起動後のログイン保持、ログアウト、再連携、アカウント削除を確認する。
6. Product > ArchiveからTestFlightへアップロードする。

アイコンを更新した場合は、リポジトリ直下で `npm run build:ios-assets` を実行してください。
