# App Store申請の残作業

iOSネイティブプロジェクトは `ios/Meonjeo.xcodeproj` に用意済みです。Windows上で構成と素材を自動検証していますが、署名、実機確認、アーカイブはMacとApple Developerアカウントが必要です。

## 用意済み

- SwiftUI/WKWebViewによるiPhoneアプリ（iOS 16以降）
- ゲスト利用と、戦績を維持したSign in with Apple統合
- ログイン再認証を含むアプリ内アカウント削除
- オフライン・読込表示、引っ張って更新、外部リンク分離
- 共有シート、触覚フィードバック
- Sign in with Apple entitlement
- 透過なし1024px App Storeアイコン
- 韓国語の名称、サブタイトル、説明、キーワード案
- プライバシーポリシー、利用規約、サポート、アカウント削除URL

## Apple Developer所有者とMacが必要な作業

1. Apple Developer Programへ加入し、Bundle ID `com.yorimichiworks.meonjeo` とApp Store Connectレコードを作成する。
2. Bundle IDでSign in with Appleを有効にし、XcodeでTeamを選ぶ。
3. Firebase AuthenticationのAppleプロバイダにTeam ID、Key ID、秘密鍵、Services IDを登録する。
4. iPhone実機でゲスト開始、Apple統合、セッション保持、ログアウト、再連携、アカウント削除、対戦を確認する。
5. App Store用スクリーンショットとApp Privacy回答を確定する。
6. Xcode 16以降でArchiveし、TestFlightへアップロードして審査テスト後に申請する。

## ローカル検証

```text
npm run build:ios-assets
npm run ios:verify
```

Appleの署名サービスを通していないため、現時点では「提出可能なIPA」ではなく「Macで署名・実機確認へ進めるXcodeプロジェクト」です。
