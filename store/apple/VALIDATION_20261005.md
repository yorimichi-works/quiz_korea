# 検証記録（2026-10-05）

環境: dot cloud Linux、Node v24.19.0、npm 11.9.0。
対象: main `1b671259d9d91f5f69f2610aac77013f393087e0` に対する提出準備branchの変更。

## 実行済み

| 確認 | 結果 | 範囲 |
|---|---|---|
| `npm ci --ignore-scripts --cache /tmp/meonjeo-npm-cache` | PASS | lockfile通り496 packages。初回はデフォルトnpm cache先が使えず失敗し、書込可能な一時cacheで再実行成功 |
| `npm run ios:verify` | PASS 21/21 | 13件の実API-route単体試験＋8件の構成/文面/素材検査 |
| 全テストのうちAndroid固有5件を除く | PASS 96/96 | 既存ゲーム、問題、realtime、release、iOS/auth試験 |
| 全 `scripts/*.test.mjs` と `scripts/*.test.ts` | 99 PASS / 1 FAIL / 1 SKIP（計101） | FAILはGitに含まれないAndroid `app-release.aab` 不在。SKIPもローカル署名済AAB不在。iOS失敗と混同しない |
| `npm run lint` | PASS | 最終コード |
| `tsc --noEmit --incremental false` | PASS | 最終コード |
| `npm run build` | PASS | production Web build。iOS Archiveではない |
| `bash -n scripts/verify-ios-on-mac.sh` | PASS | shell構文 |
| Mac検証スクリプトをLinuxで実行 | EXPECTED BLOCK / exit 2 | macOS以外で誤って合格を出さないことを確認。Swiftは未コンパイル |
| Scheme XML・Info.plist・entitlements解析 | PASS | Python標準XML/plist parser |
| `git diff --check` | PASS | 空白/競合マーカー等 |
| content ratingキーワード監査 | PASS（判定候補抽出のみ） | 2,000問。犯罪/戦争69、賭博2、薬物1、酒たばこ0、裸体等1、暴言0、恐怖25 |

## Apple統合回帰試験の境界

Firebaseのaccounts:lookup HTTP境界とDBの入出力をmockし、実際のprogress routeをTypeScript変換して実行しています。Apple/Google既存アカウントへのゲスト統合、非匿名アカウント拒否、連携後の古い匿名token拒否、自己統合拒否、project/subject不一致、Firebase拒否を確認しました。

この試験は本番Firebase、Apple認証UI、token失効、実DB移行のエンドツーエンド試験ではありません。

## ブラウザ読み取り

- dot cloud Chromeで本番privacy/support/game/設定を実際に表示
- privacyと削除文面は公開側では変更前。今回のbranchは未デプロイ
- App Store Connectの現在の既存4アプリに먼저!/Meonjeoなし
- Apple Developerの現在のTeamのApp IDsは4件。`com.yorimichiworks.meonjeo`なし
- 新規アプリフォームは確認のみで保存せず閉じた。新規Identifier/資格情報/権限は未作成

## できなかった確認

- ローカルWeb preview: Cloudflare dev serverが `uv_interface_addresses` の実行環境制約で起動できず、cloud browserのloopback URLも `ERR_BLOCKED_BY_CLIENT`。変更後のページ視覚QAは未実施
- iOS実機/Simulator起動、Swiftコンパイル、署名、Archive、TestFlight、Apple本番認証と削除、対戦2台、iOS撮影は未実施
- 配信基盤の全ログ/バックアップ保管条件・Firebase Apple設定は未確認

## 公開・安全性

ローカル準備のみ。main変更、push、draft PR、公開Web更新、App Storeレコード作成、秘密鍵生成、審査提出、公開は行っていません。

共有Schemeは既存のものを維持しました。iOS16最低対応は維持し、手順だけを現行Xcode26/iOS26 SDK要件へ更新しています。
