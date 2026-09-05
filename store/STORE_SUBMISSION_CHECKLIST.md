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
- 韓国語ストア掲載文、データ取扱申告の下書き

## Google Play申請時に人が行う作業

1. Google Play Consoleのデベロッパー本人確認と登録料支払い。
2. 最終パッケージIDを決定する。候補: `com.yorimichiworks.meonjeo`。
3. Android署名鍵を安全な場所で作成し、バックアップする。
4. TWAまたはCapacitorでAABを生成し、内部テストへアップロードする。
5. Digital Asset Linksへ署名証明書のSHA-256を設定する。
6. Data safety、対象年齢、コンテンツレーティング、広告の有無を回答する。
7. 実機2台でGoogle連携、対戦、バックグラウンド復帰、削除を確認する。

## App Store申請時に人が行う作業

1. Apple Developer Programへ加入し、Bundle IDと署名を作成する。
2. iOSパッケージとApp Store Connectのアプリレコードを作成する。
3. Google連携を提供する場合はSign in with AppleをFirebaseへ追加する。
4. App Privacy、年齢区分、審査用連絡先、スクリーンショットを登録する。
5. 単純なWebラッパーと判断されないよう、触覚、共有、通知など適切なネイティブ統合を行う。

## リリース判断

- Web/PWA正式β: 実機スモークテスト後に可能。
- Google Play内部テスト: AABと署名鍵を作成すれば可能。
- Google Play本番: 内部テストとPlay Console申告完了後。
- App Store: Apple開発者資格、iOS署名、Sign in with Apple対応後。
