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
| 署名なしSimulatorコンパイル | PASS: Xcode 26.6 / iOS Simulator SDK 26.5 |
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

## GitHub CI実測結果

2026-10-07 03:03 JSTにrun #1の成功を確認しました。対象は `6058b87f302dec7391d1469768771bcb9fd99acc` とmain基点のPR検証mergeです。

- [App readiness run #1](https://github.com/yorimichi-works/quiz_korea/actions/runs/37508124319): 全2ジョブ SUCCESS
- `web-and-contracts`: 105試験、lint、型検査、Web production buildすべてPASS
- `ios-simulator`: macOS 26.6.2 arm64、Xcode 26.6（17F113）、iOS SDK / Simulator SDK 26.5。`CODE_SIGNING_ALLOWED=NO`、Release、generic iOS Simulatorで **BUILD SUCCEEDED**
- [Simulator artifact](https://github.com/yorimichi-works/quiz_korea/actions/runs/37508124319/artifacts/11432352914): ID `11432352914`、186,266 bytes、有効期限2026-10-20 18:02:50 UTC
- Actions配布ZIPのSHA-256: `be3a14c3c09381b865ed7e5ad1e8692f933d2d6982d2fd663893c60b15f87f18`
- AppIntents frameworkがないためメタデータ抽出を省略したというwarningが1件。コンパイルエラーなし

この成果物は未署名Simulator用アプリです。iPhone実機用IPAやApp Store提出済みビルドではありません。実際のSimulator起動・GUI操作もこのジョブでは実行していません。

コード修正のWeb公開と署名済配布版の作成は別の承認・検証段階です。


## Simulator起動の追加確認

[run #3](https://github.com/yorimichi-works/quiz_korea/actions/runs/37508896834)（source `402f22a168764164f29d5158d35f581159a522a4`）は全2ジョブPASS。iPhone 17 Pro Max Simulatorへ実際にインストール・起動し、1320×2868 PNGを撮影しました。画像を目視確認し、韓国語ホーム、レーティング/ランク表示、設定、オンラインマッチとランキングの入口が表示されていることを確認しました。白画面や起動時のエラー表示はありません。

- [起動画像入りartifact](https://github.com/yorimichi-works/quiz_korea/actions/runs/37508896834/artifacts/11434630370): 2,368,544 bytes
- 配布ZIP SHA-256: `4d8a0b6340e09510db542b115c5afc478f65cf90725711f10c33d034decddaf9`
- Simulator内のnativeコードはPR候補、Web画面は現在公開中のサービスです。API/プライバシー修正はまだ本番へ未反映です
- ログイン、設定/対戦ボタン操作、2端末対戦、Apple再認証/削除はこの試験に含みません
- 起動QA画像として保存。最終候補の実機試験・App Store画面一式の代用にはしません

実機arm64ターゲットも`ios-device-archive`ジョブで署名なしArchiveを確認できるようにしました。結果はPRへ記録します。未署名ArchiveはiPhoneへインストールもストア提出もできません。


## 公開ソースとの再照合後

公開版32 source `234f1540ae848786bb364015f8452d8502c7456d` の取得・照合を完了しました。公開版の回答権移行など14ファイルとpackage.jsonの更新を候補へ統合し、認証APIをService Workerの保存から除外しました。

- 126/126 Node試験PASS
- lint、TypeScript、Web production build、差分の空白検査PASS
- 公開版185 tracked pathsをすべて保持し、公開版の主要更新10ファイルはbyte一致
- entry HTML/SWはauth v8・shell v18と安全なキャッシュ対象へ意図的に更新
- 未解決競合0件。最新のremote/CI結果はPRに追記
- 新しいSimulator起動確認も引き続き現在の公開Webを表示するため、今回の未公開SW/API変更の本番試験ではない

[公開ソース照合記録](SOURCE_RECONCILIATION_20261007.md)
