# Quiz Korea: 再利用メモと公開手順

## 既存 `tieronline` から再利用する方針

- `lib/repositories/` のRepository分離：画面からデータ保存先を直接参照しない。最初はモック、次にFirestore実装へ交換する。
- `lib/services/firebase_bootstrap.dart` の初期化境界：Firebase設定がないローカル起動を壊さず、接続状態をアプリの外側で扱う。
- `firestore.rules` の認証・所有者チェック：クライアントの表示値を信用せず、ユーザー、試合、通報、管理操作ごとに書き込み主体を制限する。
- `functions/src/rateLimit.ts` の考え方：buzz / answer は重複排除キーとレート制限を持たせる。
- 冪等な集計・監査：試合結果とレート更新は `matchId` 単位で一度だけ確定し、再送・切断復帰で二重加算しない。
- `docs/internationalization_architecture.md` の分離：表示言語、問題の原文locale、対象市場を別フィールドにする。
- `firebase.json` のHosting設定：HTMLとJSのキャッシュを抑え、SPAの直接URLを `index.html` へ戻す。

## 今後起こりやすい問題と先回り

1. **同時押しの不公平感**：クライアント時刻ではなくサーバー受理イベントを正本にし、`BuzzEvent` を監査保存する。
2. **正答の漏えい**：正答は通常のクライアント通信へ事前送信せず、判定はサーバー側の正規化済みデータで行う。
3. **切断・再送による二重処理**：イベントIDと `matchId` の一意制約、状態遷移チェック、結果確定の冪等化を先に入れる。
4. **問題品質と表記揺れ**：`canonicalAnswers`、`acceptedAliases`、`rejectedNearMatches`、出典、レビュー状態を問題DBの必須項目にする。
5. **韓国語入力の判定差**：Unicode正規化、空白、大小文字、登録済み別表記だけを決定的に吸収し、LLMを対戦中の判定へ全面利用しない。
6. **匿名ユーザーのデータ消失**：匿名IDとアカウント連携を分け、連携処理はサーバー側で移行記録を残す。
7. **公開後の費用・荒らし**：App Check、Callable Functions、Rate Limit、監査ログ、通報導線をFirebase接続時に追加する。

## ローカル確認

```powershell
cd D:\user\develop\quiz_korea
python -m http.server 4199
```

ブラウザで `http://127.0.0.1:4199/` を開き、ホームから「빠른 대전」、早押し、正答入力まで確認する。

## GitHubへ登録

GitHubで空のリポジトリ（例：`quiz-korea`）を作り、URLを自分のものに置き換える。

```powershell
cd D:\user\develop\quiz_korea
git init
git add .
git commit -m "Build Quiz Battle prototype"
git branch -M main
git remote add origin https://github.com/<YOUR_ACCOUNT>/quiz-korea.git
git push -u origin main
```

push前にAPIキー、サービスアカウントJSON、`.env`、Firebase Admin認証情報をコミットしていないことを確認する。

## Firebase Hostingでネット確認

```powershell
npm install -g firebase-tools
firebase login
cd D:\user\develop\quiz_korea
firebase use --add
firebase deploy --only hosting
```

表示された `https://<project-id>.web.app` をスマートフォンでも開く。更新が反映されない場合はシークレットウィンドウで確認する。

まず手動デプロイで確認し、安定後にGitHub Actionsへ移す。CIではFirebaseトークンをGitへ直書きせずGitHub Secretsへ保存する。リアルタイム対戦実装時は静的Hostingだけでなく、Firestore Rules、Functions、App Checkも同じ環境の責務として追加する。
