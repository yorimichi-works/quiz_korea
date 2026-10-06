# 먼저! ストア申請チェックリスト

## 現在用意済み

- 公開URL: `https://meonjeo.syamo.chatgpt.site`
- プライバシーポリシー: `https://meonjeo.syamo.chatgpt.site/privacy`
- 利用規約: `https://meonjeo.syamo.chatgpt.site/terms`
- サポート: `https://meonjeo.syamo.chatgpt.site/support`
- アカウント削除: `https://meonjeo.syamo.chatgpt.site/account-deletion`
- ゲスト利用、Google連携、ゲストデータ統合
- アプリ内からのアカウントおよび関連データ削除
- 問題・プレイヤー・不具合の通報をサーバーへ保存
- PWAアイコン（192 / 512 / maskable / Apple touch）
- ストア用1024pxアイコン
- Google Play用512pxアイコン、1024 × 500フィーチャーグラフィック
- Google Play用スマートフォン画面素材（540 × 1080、ホーム／設定）
- 韓国語ストア掲載文、データ取扱申告の下書き
- Google Play審査手順、Console回答案、韓国語リリースノート
- Trusted Web ActivityのAndroidプロジェクト
- Google Play公開用パッケージID: `com.yorimichiworks.meonjeo`
- Android API 36 / min API 23の署名済みAAB
- Androidアップロード鍵（このPC内、Git除外済み）
- AABのSHA-256・サイズ・アップロード証明書指紋のリリース記録
- 公式bundletool 1.18.3によるAAB構造検証
- 署名設定を置いた場合だけ署名済みAABを生成するビルド手順
- Digital Asset Linksエンドポイント（Play署名証明書の設定待ち）

## Google Play申請時に人が行う作業

1. Google Play Consoleのデベロッパー本人確認と登録料支払い。
2. 公開する法的名称、住所、電話番号、サポートメールアドレスを入力する。
3. 選定済みパッケージID `com.yorimichiworks.meonjeo` を初回アップロード前に最終確認する。
4. 作成済みの `android/upload-key.jks` と `android/keystore.properties` を暗号化した別媒体へバックアップする。
5. 作成済みの `store/android/meonjeo-1.0.0-signed.aab` を内部テストへアップロードする。
6. Play App Signing証明書のSHA-256をDigital Asset Linksへ設定する。
7. Data safety、対象年齢、コンテンツレーティング、広告の有無を回答する。
8. 実機2台でGoogle連携、対戦、バックグラウンド復帰、削除を確認する。

## App Storeの準備・未完了事項

iOSプロジェクト、Apple認証ブリッジ、共有・触覚、アイコンは実装済みです。静的検証だけでは提出可能とは判断しません。
最新の状況、Xcode 26/iOS 26 SDK要件、App Privacy、実機試験は [`apple/APP_STORE_READINESS.md`](apple/APP_STORE_READINESS.md) を参照してください。

## リリース判断

- Web/PWA正式β: 実機スモークテスト後に可能。
- Google Play内部テスト: 鍵のバックアップとPlay Consoleの所有者情報確認後、作成済み署名AABをアップロード可能。
- Google Play本番: 内部テストとPlay Console申告完了後。
- App Store: 既存登録の確認、署名済Archive、Apple認証/削除/対戦の実機試験、提出用画面と申告の確定、TestFlight確認後。
