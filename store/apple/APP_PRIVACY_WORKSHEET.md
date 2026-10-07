# App Privacy 回答準備（2026-10-05）

**履歴資料です。** この広告なしコードの監査を進め、2026-10-07に7分類の回答を承認・公開しました。初回リリースには広告を追加するため、現在の候補は [`ADVERTISING_PRIVACY_WORKSHEET.md`](ADVERTISING_PRIVACY_WORKSHEET.md) を使用します。以下の「広告SDKなし」「Tracking No」を広告入り版へ流用しないでください。

この文書はコード監査に基づく回答案です。App Store Connectへは未入力・未確定です。実機の通信、Firebase本番設定、ホスティングのログ保管・二次利用を所有者が確認してから確定してください。匿名UIDでも利用履歴と結び付くため、単に「匿名ログインだから関連付けなし」とはしません。

## 確認した実装

| データ | 回答案 | 用途・関連付け | 根拠 |
|---|---|---|---|
| Name | 収集あり | App Functionality / linked | `NativeBridge.swift` がfullNameを要求、`auth.js` がFirebase `updateProfile` に保存。Google表示名も認証サービスが処理 |
| Email Address | 収集あり | App Functionality / linked | Apple/Google認証とFirebase Auth。Apple非公開メールのrelay addressを含む。ゲームDBに独自保存しなくても申告から除外しない |
| User ID | 収集あり | App Functionality。イベント計測にはAnalyticsも検討 / linked | `lib/firebase-user.ts`、`db/progress.ts`、`app/api/realtime/route.ts` のUID、ゲーム履歴・ランキング |
| Gameplay Content | 収集あり | App Functionality / linked | マッチ状態、対戦相手、回答・早押しイベント、戦績、レーティング、称号。`db/` とrealtime API |
| Customer Support | 収集あり | App Functionality / linked | `app/api/reports/route.ts` の自由記述、対象、UID、日時。任意開示の例外を安易に適用しない |
| Product Interaction | 収集あり | Analytics / linked。機能用途も運用に照合 | `app/api/quiz-time/route.ts` の表示・クリック、realtime APIの終了イベント。UID付きでDBへ記録 |
| Other Data Types（IP・user-agent等） | 収集ありを前提に最終分類確認 | App Functionality（認証・セキュリティ）。linked範囲をFirebase/hostingに確認 | Firebase公式はAuthのIP・user-agent処理/ログ保持を開示。ホスティングのログ設定は未調査 |
| Diagnostics | 未確定 | 実機Archive/運用ログを確認 | 明示的Crashlytics/Sentry SDKはコード上なし。`console.error`と配信基盤ログの実際の保存項目は未確認 |

### 現時点で機能が見当たらない項目

決済、健康、連絡先帳、精密位置、端末カメラ/マイク、ユーザー画像アップロード、IDFA、広告SDK、第三者横断広告トラッキング。写真・音声の同梱ゲーム素材はユーザーの写真/音声収集とは別です。

「Tracking: No」は現在のコードに基づく案です。広告IDやATT要求はありませんが、最終的には配信基盤・認証サービスの利用設定も照合します。「Data Not Collected」は選択できません。

## Privacy manifest / Required Reason API

現在のXcodeプロジェクトに `PrivacyInfo.xcprivacy` や第三者native SDKはありません。確認したSwiftソースに、UserDefaults、ファイル時刻、空きディスク容量、system boot timeなどのRequired Reason APIの直接呼び出しは見つかりませんでした。

- Web SDKの通信を、native SDKが入っていないことを理由にApp Privacyから除外しない
- 最終ArchiveのPrivacy Reportを生成して依存物を確認する
- Required Reason APIや対象SDKが追加された場合は、正しい理由・署名・manifestを追加する
- 未確認のcollection申告を空のmanifestで「収集なし」に見せない

## 削除・保管の確認

- アプリ削除操作は、Apple再認証 → 認可コード失効 → アプリDB削除 → Firebaseユーザー削除を実装
- `/api/account` は対戦、待機、セッション、通報、クイズタイム、称号、進捗を削除
- ローカルゲームデータのクリアも `app.js` 側で実行
- サービス業者側のログ/バックアップ消去は即時とは断定しない
- 対戦相手側の戦績に埋め込まれた名前・アイコン、既存バックアップ、削除途中の通信失敗時も実機/運用確認対象
- Firebase本番のAppleキー登録、失効、削除完了は今回未実行

## 公式資料

- [Apple App Privacy定義・用途・第三者データ](https://developer.apple.com/app-store/app-privacy-details/)
- [Firebaseのデータ処理・保管](https://firebase.google.com/support/privacy)
- [Privacy manifestへの収集情報追加](https://developer.apple.com/documentation/technotes/tn3184-adding-data-collection-details-to-your-privacy-manifest)
- [AppleのRequired Reason API](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api)
