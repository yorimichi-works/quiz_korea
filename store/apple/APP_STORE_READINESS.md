# 먼저! App Store提出準備

## 現在の状態 — 2026-10-07 広告入り初回リリースへ更新

初回リリースにAdMob広告を入れる方針になったため、**広告なしの1.0.0 (2)は最終審査へ送信しません**。広告入りbuild 3は実装・検証中です。

- App Store Connect登録: `6819903098`、Bundle ID `com.yorimichiworks.meonjeo`
- build 2は署名済IPA作成・Apple送信・TestFlight処理完了・掲載版への選択まで確認済み。App Review未送信
- build 2のGit基点: `5de3b4a1a4d97be7d85a227b9f1b97d7550c1c17`。Web161テスト、Simulator、arm64 ArchiveのCI成功
- 物理ボタンの新アイコンと実iPhone Simulatorの必須サイズ画像1枚を保存済み
- 公開Webはv36。認証失効成功前にアカウントデータを削除しない修正と公開support窓口を反映済み
- 広告なし版の7分類Privacyは公開済み、権利欄Yes、年齢16+／韓国15+を保存済み。広告入り版にはこの回答を流用しない
- 無料価格、Mac/Vision Pro除外は保存表示確認済み。中国本土・ベトナムを除く173地域は確定操作済みだが、ブラウザ障害で再読未確認
- モンジョのAdMobアプリとインタースティシャル1ユニットを作成済み。専用UMPメッセージは未公開
- Firebase Apple秘密鍵の本人PCでの入力・保存、実機Apple認証/失効/退会、実機広告/同意の確認は未完

広告の条件、SDK、公開前ゲートは [`ADVERTISING_RELEASE.md`](ADVERTISING_RELEASE.md) を参照。新しいデータ申告は [`ADVERTISING_PRIVACY_WORKSHEET.md`](ADVERTISING_PRIVACY_WORKSHEET.md) の確認待ちです。既存mainへのマージ、アプリ審査送信、本体公開は行っていません。

## 以下は提出準備初期の履歴

以下の未実施表記は当時の状態です。現在の完了・残件は上記を正本とします。

更新: 2026-10-07（日本時間）。基点: `1b671259d9d91f5f69f2610aac77013f393087e0`。

## 結論

**提出可能なIPAはまだありません。** 今回はコード/申告資料/実機手順の準備です。署名済Archive、TestFlight、実機Apple認証/削除、App Store用スクリーンショットは未実施です。最終審査提出・公開は行っていません。

## 準備した内容

- SwiftUI/WKWebViewのiPhoneアプリ、最低対応iOS 16、Bundle ID `com.yorimichiworks.meonjeo`
- Appleログイン・再認証・失効付き削除、共有、触覚、ネットワーク表示、外部リンク分離は既存実装
- Apple既存アカウントへのゲスト統合をGoogle専用APIが拒否する不整合を修正
- 他の連携済みアカウントをゲストと誤認しない判定と13件の回帰試験を追加
- 韓国語privacyと削除案内にApple/iOS、非公開メール、再認証/失効、業者側保管を反映
- 既存の共有Xcode Schemeを確認し、Mac向け署名なしSimulatorビルド確認手順を追加
- 韓国語掲載文（既存）、App Privacy回答表、審査メモ、実機/撮影計画
- 1024×1024 RGB（透過なし）App Storeアイコンを静的確認

## 今回追加した改善

- 10月5日の提出準備ZIPを回収し、現行mainの182ファイルとSHA-1で照合。前回の修正15ファイルを引き継いだ
- Apple認証要求にIDを付け、タイムアウトした古い成功/キャンセル応答が次の認証へ混ざらないようにした。旧native bridgeとの互換も維持
- Native側で二重認証開始・古いcontroller応答を拒否し、認証結果を返す時点でもHTTPSと配信先ホストを再確認
- 通信失敗・WebContentプロセス終了に韓国語エラーと再試行ボタンを追加。意図した読み込みキャンセルで画面を覆わない
- GitHub ActionsにWeb品質確認とmacOS 26での署名なしSimulatorコンパイルを追加。署名・証明書作成・デプロイ・TestFlight送信は行わない
- 105件のローカル試験、lint、型検査、Web production buildを再実行。詳細は [`VALIDATION_20261007.md`](VALIDATION_20261007.md)

## 確認状況

| 項目 | 状態 |
|---|---|
| Web本番privacy・support・game画面 | 10月5日の表示確認記録あり。10月7日はブラウザで再確認していない |
| App Store Connect | 10月5日はApp IDとアプリ登録なしの確認記録。10月7日の登録状態は未確認。新規登録は行っていない |
| Web変更 | 専用branch/Draft PRへ保存する変更。main・公開Webへ未反映 |
| Node回帰/構成テスト | 実行結果は `VALIDATION_20261007.md` 参照 |
| Swiftコンパイル/署名 | Xcode 26.6 / Simulator SDK 26.5でReleaseコンパイルPASS。署名済みArchiveは未実施 |
| Firebase Apple本番設定 | 未確認。新規秘密鍵や設定変更なし |
| 実機2台・Apple認証・失効/削除・復帰 | 未実施 |
| App Privacyと年齢区分 | 回答案のみ。未確定/未提出 |
| Store screenshots | 未撮影。既存540×1080 Web素材はiOS撮影として使用しない |
| Archive/TestFlight/審査提出 | 未実施 |

## 次の順序

1. Apple DeveloperとApp Store ConnectでBundle IDの既存登録を確認し、登録先Teamを決める。重複アプリを作らない
2. 未登録なら `com.yorimichiworks.meonjeo` のIdentifier・Sign in with Apple設定を所有者承認のもと準備し、App Storeレコードを作成する
3. Firebase Appleの本番設定と許可ドメインを確認。キー生成/永続権限/秘密鍵入力は別途承認と安全な手順で行う
4. branch差分レビュー後にWeb修正を公開し、公開privacy/削除案内/APIを再確認する
5. Xcode 26以降＋iOS 26 SDK以降でSimulatorコンパイル、既存署名設定で実機ビルドする
6. [`DEVICE_TEST_PLAN.md`](DEVICE_TEST_PLAN.md) の全項目を実機で記録。Macがなければ承認済みMacビルド環境を確保する
7. 実際のiOSアプリから画面を撮り、[`APP_PRIVACY_WORKSHEET.md`](APP_PRIVACY_WORKSHEET.md) と年齢区分を最終確定する
8. 署名済ArchiveをValidateし、TestFlightへアップロード、処理完了と実機インストールを確認する
9. 最終提出は所有者の明示指示を得てから行う

## 提出用候補

- 名称/説明/キーワード: [`listing-ko.md`](listing-ko.md)
- Category案: Games / Trivia。公開対象国、価格、法的名称、copyright、審査連絡先は所有者が確認
- version: 1.0.0 / build: 1（新規登録・アップロード履歴と重複がないか確認）
- Support: https://meonjeo.syamo.chatgpt.site/support
- Privacy: https://meonjeo.syamo.chatgpt.site/privacy
- 審査メモ: [`REVIEW_NOTES_DRAFT.md`](REVIEW_NOTES_DRAFT.md)
- 暗号化: 現Info.plistは非免除暗号化false。HTTPS/Apple標準認証以外の追加がないか最終ビルドで確認
- 年齢区分: 2,000問のキーワード監査で戦争/犯罪69、賭博言及2、規制薬物1、恐怖題材25、非性的裸体言及1。実行可能な賭博/課金/チャットはコード上なし。Apple質問票に沿って文脈を判断し、13+等を自動確定しない

## 公式要件（2026-10-07日本時間に再確認）

2026年4月28日以降、アップロードはXcode 26以降・iOS 26 SDK以降が必須です。最低対応OSのiOS 16は別の設定なので維持できます。

- [SDK minimum requirements](https://developer.apple.com/news/upcoming-requirements/?id=04282026a)
- [App Privacy](https://developer.apple.com/app-store/app-privacy-details/)
- [Screenshots](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)


## 署名とTestFlightの具体的な実行手順

[`SIGNING_RUNBOOK.md`](SIGNING_RUNBOOK.md)に、Apple既存登録の確認、ログイン用と配信用の鍵の区別、Firebase共用時の削除の注意、署名資材、公開Webとの差分照合、IPA確認、TestFlightへの送信順をまとめました。

[`ci/codemagic.yaml.example`](../../ci/codemagic.yaml.example)は未有効化の署名ビルド専用例です。実在のAPIキー名や署名資材名を設定しておらず、自動ビルド/アップロード/審査提出もありません。所有者承認と登録確認が済むまではrootの`codemagic.yaml`に移しません。


## 公開版との整合

公開版32の正規ソースを取得し、GitHub基点と三者比較しました。回答途中表示・回答権移行等の公開版だけの更新14ファイルを保持し、双方で変更されたpackage.jsonを統合しました。未解決の競合は0件です。認証キャッシュ境界とauth/shellの更新も加えた126件の回帰試験を実施しました。詳細と照合値は [`SOURCE_RECONCILIATION_20261007.md`](SOURCE_RECONCILIATION_20261007.md) を参照してください。本番公開は別承認のままです。
