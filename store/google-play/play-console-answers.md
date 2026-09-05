# Google Play Console 入力用回答案

実際のPlay Console画面では、リリースビルドと運用方針に変更がないことを確認してから入力します。

## アプリ設定

- App or game: Game
- Free or paid: Free
- Category: Trivia
- Default language: Korean (ko-KR)
- Package ID候補: `com.yorimichiworks.meonjeo`
- Target SDK: API 36
- Minimum SDK: API 23
- Ads: No
- App access: All functionality is available without special access
- Login credentials for review: Not required; a guest account is created automatically

## App content

- News app: No
- Government app: No
- Financial features: No
- Health features: No
- Advertising ID: Not used
- In-app purchases: None
- User-to-user communication: None
- Public user-generated content: None
- Precise or approximate location: Not collected
- Web browsing: The wrapper passes only the app URLs it opens to the device browser; it does not read the user's general browsing history

## 対象年齢案

子ども向け専用ではありません。初回申請では13歳以上の年齢帯を選ぶ案とし、最終的な配信国・問題内容・運営方針は所有者が確認します。Families Policy対象として申請しない前提です。

## Content rating回答時の注意

- オンラインで他の利用者とリアルタイム対戦しますが、チャット、DM、自由入力プロフィール、画像投稿はありません。
- 歴史・時事問題には戦争や死亡に関する教育的な文章表現が含まれる可能性があります。暴力描写の質問には、実際の問題監査結果に従って回答します。
- 映画・歴史などの問題文に、犯罪、殺人、戦争、賭博、規制薬物への文章上の言及があります。写実的な画像・動画や、賭博・薬物を実行する機能はありません。
- 性的描写や露骨な言葉を意図したコンテンツはありません。芸術作品「考える人」の説明に、非性的な裸体への文章上の言及が1問あります。
- 詳細は `content-rating-audit.md` と `npm run audit:content-rating` の結果を参照します。

## Data safety

`data-safety.md`を正本として入力します。Firebase UID、対戦アクティビティ、通報内容、Google連携時のメールアドレス・表示名、認証時のIP・ユーザーエージェント等、およびホストブラウザへ渡すアプリURLを申告対象として再確認します。

## 所有者が入力する値

- デベロッパーの法的名称・住所・電話番号
- 公開するサポートメールアドレス
- 配信国、価格、対象年齢の最終選択
- Play App Signing証明書のSHA-256
