# App Store提出準備・再検証（2026-10-07 JST）

基点: `main` `1b671259d9d91f5f69f2610aac77013f393087e0`。
環境: Linux、Node v24.19.0、npm 11.9.0。10月5日の成果ZIPを再取得し、現行GitHubの182ファイルをblob SHA-1で照合してから既存修正を再適用しました。未保存の独自ファイルは削除していません。

## 実行結果

| 検証 | 結果 |
|---|---|
| 既存15ファイルの回収後 `ios:verify` | 21/21 PASS |
| `npm ci --ignore-scripts` | 496 packages、成功 |
| 最終 `npm run test:ci` | 105/105 PASS |
| 最終 `npm run lint` | PASS |
| 最終 `npx tsc --noEmit --incremental false` | PASS |
| 最終 `npm run build` | PASS（Web production build） |
| `bash -n scripts/verify-ios-on-mac.sh` | PASS |
| Info.plist、entitlements、共有Schemeの構文 | PASS |
| `git diff --check` | PASS |
| 署名なしSimulatorコンパイル | CI追加、結果待ち |
| 署名済みArchive / IPA / TestFlight / 審査提出 | 未実施 |

## 試験の範囲

- 13件のApple/Googleアカウント移管試験は実API routeを実行し、Firebase HTTPとDB境界のみmock。Apple本番ログイン、実DB移管の証拠ではありません
- 7件の認証request試験は実`auth.js`の関数をNode VMで実行。成功、連打、timeout後の遅延結果、キャンセル、無効credential、旧bridge互換、同期エラーを検査
- native controller照合、callback URL検査、再試行画面は構成検査。操作確認とSwiftコンパイルは別段階
- `test:ci`は署名済Android AABを必要とするAndroid固有5件を対象外にしています。Android配布版合格とはしていません
- Web build成功はiOS build成功ではありません。GUI、iPhone実機、実サービス間認証/削除/2端末対戦は未確認
- 新規キー、署名資格情報、Apple Developer設定、支払い、mainマージ、公開デプロイは行っていません

## CIの確認範囲

App readinessは公開リポジトリの標準`ubuntu-latest`/`macos-26`ランナーを使用します。GitHubの標準public runnerは無料です。Secretsを要求せず、permissionsはcontents:read、checkout後に認証情報を保持しません。iOSジョブはSimulatorを署名なしでコンパイルして`.app`をartifact化するだけです。

- [GitHub標準ランナーとpublic repositoryの料金](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- [Appleの現行SDK最低要件](https://developer.apple.com/news/upcoming-requirements/?id=04282026a)

CI結果は実行後に追記します。コード修正のWeb公開と署名済配布版の作成は別の承認・検証段階です。
