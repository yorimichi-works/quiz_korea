# App Store申請の残作業

Web/PWAとGoogle Play向け資材は共有できますが、Windows環境だけではiOS署名済みアーカイブを作成できません。

## 用意済み

- 韓国語の名称、サブタイトル、説明、キーワード案
- プライバシーポリシー、利用規約、サポート、アカウント削除URL
- ゲスト利用とアプリ内アカウント削除
- 1024pxアイコン原稿

## Apple Developer所有者とMacが必要な作業

1. Apple Developer Programへ加入し、Bundle IDとApp Store Connectレコードを作成する。
2. iOSネイティブコンテナを作成し、実機で署名・アーカイブする。
3. GoogleログインをiOS版でも提供する場合、FirebaseでSign in with Appleを構成し、同等のログイン選択肢を表示する。
4. App Privacy、年齢区分、審査連絡先を所有者情報で入力する。
5. App Store指定サイズのiPhoneスクリーンショットをiOS実機またはSimulatorから作成する。
6. Webサイトの単純な再包装と判断されないよう、iOSで十分なアプリ体験になっていることを実機で確認する。

iOS版は上記が完了するまで「申請可能」とは扱いません。
