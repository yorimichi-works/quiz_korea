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
- Android API 36 / min API 23の未署名AAB
- 署名設定を置いた場合だけ署名済みAABを生成するビルド手順
- Digital Asset Linksエンドポイント（Play署名証明書の設定待ち）

## Google Play申請時に人が行う作業

1. Google Play Consoleのデベロッパー本人確認と登録料支払い。
2. 公開する法的名称、住所、電話番号、サポートメールアドレスを入力する。
3. 選定済みパッケージID `com.yorimichiworks.meonjeo` を初回アップロード前に最終確認する。
4. Androidアップロード鍵を安全な場所で作成し、別媒体へバックアップする。
5. `npm run android:bundle -- -RequireSigned`で署名済みAABを生成し、内部テストへアップロードする。
6. Play App Signing証明書のSHA-256をDigital Asset Linksへ設定する。
7. Data safety、対象年齢、コンテンツレーティング、広告の有無を回答する。
8. 実機2台でGoogle連携、対戦、バックグラウンド復帰、削除を確認する。

## App Store申請時に人が行う作業

1. Apple Developer Programへ加入し、Bundle IDと署名を作成する。
2. iOSパッケージとApp Store Connectのアプリレコードを作成する。
3. Google連携を提供する場合はSign in with AppleをFirebaseへ追加する。
4. App Privacy、年齢区分、審査用連絡先、スクリーンショットを登録する。
5. 単純なWebラッパーと判断されないよう、触覚、共有、通知など適切なネイティブ統合を行う。

## リリース判断

- Web/PWA正式β: 実機スモークテスト後に可能。
- Google Play内部テスト: パッケージID確定とアップロード鍵作成後、すぐに署名AABを生成して申請可能。
- Google Play本番: 内部テストとPlay Console申告完了後。
- App Store: Apple開発者資格、iOS署名、Sign in with Apple対応後。
