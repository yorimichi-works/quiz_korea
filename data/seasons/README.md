# Season question packages

問題データはアプリ基盤へ直書きせず、シーズン単位で管理する。

- `manifest.json`: 有効シーズンと問題ファイルの対応
- `S1-2026/questions.ko.json`: S1-2026の韓国語問題パッケージ
- `enabledInSeason: true`: 当該シーズンで出題可能
- `enabledInSeason: false`: 公式情報・出典・表現の再確認まで保留

新シーズンでは新しいフォルダを追加し、確認完了後にmanifestの`activeSeasonId`を切り替える。過去シーズンの問題は上書きしない。
