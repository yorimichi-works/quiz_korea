# Google Play Data safety 回答案

Play Consoleへ入力する前に、実際のリリースビルドと照合すること。

## 収集するデータ

- User IDs: Firebase UID。アカウント管理、ゲーム進行、セキュリティ目的。
- App activity: 対戦結果、レーティング、称号、マッチイベント。アプリ機能、不正防止、分析目的。
- Other user-generated content: ユーザーが送信した通報・問い合わせ。カスタマーサポート、安全確保目的。
- Email address / Name: Google連携時にFirebase Authenticationが処理し、アプリ画面に表示する。ゲームDBには独自保存しない。Firebase SDKの実際の転送内容に合わせて申告する。

## 共有・安全性

- 通信はHTTPSで暗号化。
- データ販売なし。
- アカウントなし（ゲスト）で主要機能を利用可能。
- アプリ内削除と外部Web削除導線あり。
- Firebase Authenticationおよびホスティング・データベース基盤をサービス提供者として使用。

## 広告

- 現在は広告SDKなし。「広告を含む」は No。

## 対象年齢

- 子ども専用アプリではない。Play Consoleの対象年齢は、公開市場と問題内容を確認して最終決定する。
