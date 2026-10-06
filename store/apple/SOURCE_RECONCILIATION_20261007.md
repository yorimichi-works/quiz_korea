# 公開版とiOS候補のソース照合

2026-10-07 JST。公開版32の正規ソースを別のcheckoutへ取得して比較しました。公開サイトへのpush、公開、データベース変更は行っていません。

## 比較対象

- 共通基点: `1b671259d9d91f5f69f2610aac77013f393087e0`
- 公開版32: `234f1540ae848786bb364015f8452d8502c7456d`、185 tracked files。取得commitと公開versionのsource commitが一致
- 統合前のPR候補: `9c86ecb9aa5727b7f5adc575742991518cd9b013`

Git履歴でも共通基点を確認しました。三者比較では157ファイルが同一、28ファイルが候補側のみの変更/追加、14ファイルが公開側のみの変更/追加、`package.json` 1件が双方で変更されていました。

## 保持した公開版の変更

| ファイル | 公開版の内容 | 解決 |
|---|---|---|
| `app.js` / `public/app.js` | 問題の1文字ずつの表示、相手の回答途中表示、1文字ごとの回答確認、誤答後の回答権ロックと再開、poll間隔 | 公開版とbyte一致で保持 |
| `app/api/realtime/route.ts` | partial回答、回答中のタイムライン停止、誤答/時間切れ後の再開、回答者ロック、将来の問題文を隠す処理 | 公開版とbyte一致で保持 |
| `lib/answer-choices.ts` | 回答をinvalid/partial/complete/wrongへ分類 | 公開版とbyte一致で保持 |
| `lib/answer-rebound.ts` | 誤答後のロックと時間補正 | 公開版とbyte一致で保持 |
| `drizzle/0004_meonjeo_answer_rebound.sql` | lock/回答途中/停止時刻の4列 | 公開版とbyte一致で保持。DBには実行していない |
| `scripts/answer-choices.test.mjs` / `scripts/answer-rebound.test.mjs` / `scripts/realtime-route-contract.test.mjs` | 公開版の回帰試験7件の追加 | 公開版とbyte一致で保持 |
| `.gitignore` | `.sites-runtime/` を除外 | 公開版とbyte一致で保持 |
| `index.html` / `public/game.html` | `app.js?v=16` と新しいshell | app v16を保持し、auth v8 / shell v18へ進めた |
| `sw.js` / `public/sw.js` | shell v17とapp v16参照 | app v16を保持。下記の認証キャッシュ対策を追加したv18へ更新 |
| `package.json` | `test:realtime` にrebound試験を追加 | 公開側のコマンドと、候補側のiOS/auth/全体テストコマンドを両方保持 |

byte一致で保持した10ファイルのGit blob SHA-1と公開版の全185パスを、[`SOURCE_RECONCILIATION_20261007.json`](SOURCE_RECONCILIATION_20261007.json)に記録しました。存在確認、ハッシュ一致、package統合を回帰試験でチェックします。今後意図してこれらを変更するときは、基点の記録と検査をレビューして更新してください。

Apple戦績移管、native認証要求の照合、再試行画面、Apple文面/提出準備は候補側から保持しています。**未解決のファイル競合は0件です。公開側のファイルを省略・削除したものはありません。**

## 認証キャッシュの追加修正

従来のService WorkerはGET応答を一律にCache APIへ保存していました。Cache APIはHTTPキャッシュ指示を自動適用しないため、認証APIの`no-store`だけでは保存を防げません。候補版では次を追加しました。

- `/api`、`/api/`、認証用パス、Authorization付きリクエスト、外部originはService Workerの保存/応答対象外
- `private` / `no-store` と失敗HTTP応答を保存しない
- 保存容量エラーで正常なネットワーク応答を捨てない
- script等の取得失敗時にゲームHTMLを代用しない
- 古いモンジョshellだけを削除し、他のcacheは保持
- auth v8 / shell v18をentry HTMLとpublicコピーに反映

実アカウントのデータ漏えいを観測したという報告ではなく、実装上の保存対象を絞る予防修正です。[Cache APIの挙動](https://developer.mozilla.org/en-US/docs/Web/API/Cache)

## 検証の範囲

- 統合直後: 115試験PASS
- 認証キャッシュとソース保全検査を加えた最終候補: 126試験を実行
- lint、型検査、Web production build、全体CIを再実行し、結果はPRへ記録
- root/publicのapp・auth・SWの一致、rebound処理、部分回答、source保全、認証キャッシュ境界を検査
- 実ユーザーによる2端末の本番対戦、Apple本番認証・失効・退会は未実施

この照合は取得した公開版32を基準にしています。公開する直前に公開元が進んでいないか再確認し、進んでいれば追加差分を取り込んでから検証してください。
