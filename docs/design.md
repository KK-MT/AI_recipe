# 設計: AIレシピサイトの技術構成・データ設計・自動投稿方式

設計担当(`agents/design/AGENTS.md`)としての設計書。承認後は実装担当へ引き渡す。この設計ではコードは書かない。

## 決定事項
| 項目 | 決定 |
|---|---|
| フレームワーク | Astro(静的出力、Content Collections) |
| ホスティング | Vercel(GitHub連携、PRごとにプレビューURL) |
| 言語 | 日本語のみ |
| 自動投稿 | Claude Code スケジュール実行(2日に1回) → ブランチ → PR |
| 承認 | フェーズ1: ユーザーがスマホGitHubアプリでPRをマージ。フェーズ2: 検証通過で自動マージ(実装済み。`AUTO_MERGE=on` で有効) |
| 画像 | OpenAI gpt-image |
| APIキー | GitHub Secrets と Claude Code 実行環境の環境変数。**.env はコミットしない**(`.gitignore`。リポジトリには `.env.example` にキー名のみ) |
| ドメイン | 未定。Vercel標準URLで開始、後から追加可能にする |

## 1. リポジトリ構成(予定)
```
src/content/recipes/<slug>.md   # レシピ1件=1ファイル(フロントマター+本文)
src/content.config.ts           # zodスキーマ(検証を兼ねる)
src/pages/index.astro           # 新着一覧
src/pages/recipes/[slug].astro  # レシピ詳細
src/pages/tags/[tag].astro      # タグ別一覧
src/pages/about.astro           # サイト概要・AI生成の説明・アフィリエイト表記
public/images/recipes/<slug>.webp
scripts/validate-recipes.*      # 公開前検証(PRのCIで実行)
.env.example / .gitignore
```

## 2. レシピのデータ設計(フロントマター)
必須: `title`, `description`, `publishedAt`, `servings`(人数), `prepMinutes`, `cookMinutes`, `ingredients[{name, amount}]`, `steps[]`, `tags[]`, `allergens[]`(法定表示7品目+推奨など), `tips`, `aiGenerated: true`, `image{src, alt, aiGenerated: true}`
任意: `shopping[{label, keyword}]`(最大3件。検索キーワードだけを書き、アフィリエイトリンクはサイトが生成する)
- `aiGenerated` が true 以外はビルドエラーにする(AI生成明記を強制)。
- スキーマ違反はビルド失敗 → PRのプレビューが作られず、マージ前に気付ける。

## 3. 画面設計(スマホ優先)
- 一覧: 画像カード、縦1列(スマホ)、タグ絞り込み。詳細: 画像 → 概要(時間・人数) → 材料 → 手順 → コツ → アレルゲン → アフィリエイト。
- 全ページに「AI生成」バッジ、画像に「AI生成画像」表記。アフィリエイト枠には「PR」表記と説明。
- SEO: schema.org `Recipe` JSON-LD、OGP、sitemap。

## 4. 自動投稿フロー(2日に1回)
1. 起動(Claude Code スケジュール)。`main` を最新化、既存レシピ一覧を確認し重複を避ける。
2. レシピ担当がレシピ作成 → 安全チェック。
3. 画像担当が gpt-image で画像生成し `public/images/recipes/` に保存(webp)。
4. ブランチ `recipe/<slug>` にコミット、PR作成(概要・アレルゲン・チェック結果を記載)。
5. VercelがプレビューURLを発行 → ユーザーがスマホで確認して承認(マージ)。
6. マージ後Vercelが本番デプロイ。
- フェーズ2: PRのCIで検証(スキーマ、AI表記、画像存在、アレルゲン、禁止表現など。リンクの疎通確認は、アフィリエイトをサイトが自動生成する方式にしたため不要になった)が全通過した場合のみ自動マージ。実装は下の「実装状況: 自動マージ」。

## 5. 初期10レシピ
同じ生成フローで一括作成。ジャンル(主菜・副菜・汁物・麺・丼・デザート等)を分散させ、1つのPRにまとめてプレビュー確認 → 承認後に公開開始。

## 6. シークレットと安全
- OpenAIキー: GitHub Secrets(CI用)、Claude Code実行環境の環境変数(スケジュール実行用)。リポジトリ・ログ・PR本文に出さない。
- 漏洩時はキーを即失効・再発行。OpenAI側に月額上限を設定する。

## 7. リスク・未確定
- Claude Code実行環境から `api.openai.com` へ接続でき、環境変数を渡せるか(要確認)。不可なら画像生成のみGitHub Actionsへ切り出す代替案に変更(承認を取り直す)。
- 独自ドメイン、AdSense有無は今回の対象外。

## 8. 実装担当への引き渡し順(各ステップでPlanModeと承認)
1. Astro初期化・スキーマ・レイアウト(サンプル1件)
2. 一覧・詳細・タグ・aboutページ、JSON-LD、AI/PR表記
3. 検証スクリプトとCI
4. Vercel連携・プレビュー確認
5. 自動投稿(スケジュール)の手順書化と `CLAUDE.md` のコマンド/構成の追記

## Verification(設計承認後の実装時に確認)
- サンプルレシピでビルド成功、AI表記なしはビルド失敗
- PRごとにVercelプレビューURLが発行され、スマホで表示崩れなし
- Lighthouse(モバイル)で主要項目が良好
- `git grep` でシークレットが含まれないこと

## 実装状況: 検証(ステップ3)
`npm run validate` で次を検査する(CIでも実行)。スキーマ・AI表記、画像の存在とalt、slug/タイトル重複、禁止表現、アレルゲン整合、加熱記述(警告)、アフィリエイトのURL/ドメイン整合、リンク疎通(`--check-links`)。ルールは `scripts/rules.json`。自動マージ(フェーズ2)は「実装状況: 自動マージ」を参照。

## 実装状況: 画像生成
Claude Code の実行環境は OpenAI に接続できないため、画像は GitHub Actions で生成する。`recipe/**` ブランチへの push で `images.yml` が `npm run images` を実行し、未生成の画像(`image.prompt` があるレシピ)を gpt-image で作って同じブランチにコミットし、CI を再実行する。キーは GitHub Secrets の `OPENAI_API_KEY` のみ。最初のCIは画像が無く赤になり、画像コミット後の再実行で緑になる。

## 実装状況: 自動投稿
Routine(スケジュール実行)が毎日 6:07(日本時間)に新しいセッションを起動し、`docs/auto-post.md` に従って、レシピ1件を `recipe/<slug>` ブランチに push して PR を作る(最新レシピから2日未満ならスキップ)。画像は `images.yml` が生成する。マージはユーザーが行う(フェーズ1)。判断材料は `npm run recipe:status`、ユーザーの希望は `docs/recipe-ideas.md`。

## 実装状況: 自動マージ(フェーズ2)
ユーザーの指示(2026-10-20)で実装。`.github/workflows/automerge.yml` が毎日 12:07〜20:07(日本時間)の毎時に動き、条件をすべて満たすレシピPRを1件、マージコミットでマージしてブランチを削除する。リポジトリ変数 `AUTO_MERGE` が `on` のときだけ動く(フェーズ2の開始・停止はユーザーがこの変数で行う)。
- 判定(`scripts/automerge.mjs`): open・ドラフトでない・ベース `main`・同じリポジトリの `recipe/<slug>`・競合なし。「保留」ラベルあり、作成から4時間未満は待機(コメントしない)。変更ファイルは `src/content/recipes/<slug>.md` と `public/images/recipes/<slug>.webp` の追加、`docs/recipe-ideas.md` の変更だけ(コードやデータを変えるPRは必ず人が確認する)。
- 検査: 判定は `main` のコードで行い、選んだコミットを `main` にマージした状態で変更ファイルを再確認してから、テスト・検証(画像必須)・ビルドと、新しいレシピのエラー・警告0件、栄養成分、画像(webp・幅512px以上・10KB以上)を検査する。`gh pr merge --match-head-commit` で、検査後の push があればマージしない。
- 対象外・検査失敗のPRには理由を1回だけコメントし、検査に失敗したPRは毎日やり直さない(ワークフローを PR番号を指定して手動実行すると、経過時間を待たずに再検査する)。
- GITHUB_TOKEN のマージでは `main` の push のCIは起動しないが、同じマージ結果をワークフロー内で検査済み。本番デプロイは Vercel の連携で行われる。
- 定時実行の回数: 最初は 12:07 の1日1回だったが、初回(10/21)に GitHub の定時実行が5時間20分遅れた(混雑時は遅れたり、飛ばされたりすることがある)ため、12:07〜20:07 の毎時に増やした。マージは1回に最大1件、コメントはPRごとに1回、検査に失敗したPRは定時実行でやり直さないので、回数を増やしても動作は変わらない。
- あわせて、レシピPRのCIの誤った失敗を解消した。最初のCI(画像の生成前)は `--allow-pending-images` で生成待ちを警告にとどめ、`images.yml` は画像の push で承認待ちになった重複のCIを削除する。

## 実装状況: 栄養成分
文部科学省『日本食品標準成分表(八訂)増補2023年』の本表(公式Excel、令和8年3月27日の正誤反映済み)から、全2,538食品の値を `data/food-composition.json` に取り込んだ(`scripts/build-food-data.mjs`。列は成分識別子で探し、kJ/kcal とエネルギー概算の整合を全件検査する)。レシピの材料には食品番号 `food` と可食部の重さ `grams` を書き、`src/lib/nutrition.mjs` が1人分のエネルギー・たんぱく質・脂質・炭水化物・食塩相当量を計算する。表示は詳細ページの表(出典つき)、一覧カードの「約◯kcal/人分」、JSON-LD の `nutrition`、about の説明。水・氷と捨てる材料は `food: "-"`(計算に含めない)。検証は、食品番号の存在、`grams`、amount との照合(「約◯g」±10%、廃棄率を考慮)、大さじ・小さじの比(警告)、1人分 20〜1,200kcal(警告)。計画は `docs/nutrition-plan.md`。

## 実装状況: アフィリエイト
レシピの `shopping`(道具・特別な材料の検索キーワード)から、楽天市場・Amazonの検索結果へのアフィリエイトリンクを `src/lib/affiliate.mjs` が生成し、詳細ページの「使った道具・材料 PR」枠に表示する。IDは Vercel の環境変数(`RAKUTEN_AFFILIATE_ID`、`AMAZON_TRACKING_ID`)で設定し、未設定のサービスは表示しない。広告表記(PR・説明・Amazon規約の文言)は、有効なサービスに応じてフッターとaboutに出る。AIが商品URLを作らないため、リンク切れや存在しない商品のリスクがない。旧 `affiliate` フィールドと、リンク疎通の検査(`--check-links`)は廃止した。
