# 設計: AIレシピサイトの技術構成・データ設計・自動投稿方式

設計担当(`agents/design/AGENTS.md`)としての設計書。承認後は実装担当へ引き渡す。この設計ではコードは書かない。

## 決定事項
| 項目 | 決定 |
|---|---|
| フレームワーク | Astro(静的出力、Content Collections) |
| ホスティング | Vercel(GitHub連携、PRごとにプレビューURL) |
| 言語 | 日本語のみ |
| 自動投稿 | Claude Code スケジュール実行(2日に1回) → ブランチ → PR |
| 承認 | フェーズ1: ユーザーがスマホGitHubアプリでPRをマージ。フェーズ2: 検証通過で自動マージ(ユーザー指示後のみ) |
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
任意: `affiliate[{label, url, provider: amazon|rakuten}]`
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
- フェーズ2: PRのCIで検証(スキーマ、AI表記、リンク疎通、画像存在、禁止表現)が全通過した場合のみ自動マージ。ユーザーの指示が出るまで有効化しない。

## 5. 初期10レシピ
同じ生成フローで一括作成。ジャンル(主菜・副菜・汁物・麺・丼・デザート等)を分散させ、1つのPRにまとめてプレビュー確認 → 承認後に公開開始。

## 6. シークレットと安全
- OpenAIキー: GitHub Secrets(CI用)、Claude Code実行環境の環境変数(スケジュール実行用)。リポジトリ・ログ・PR本文に出さない。
- 漏洩時はキーを即失効・再発行。OpenAI側に月額上限を設定する。

## 7. リスク・未確定
- Claude Code実行環境から `api.openai.com` へ接続でき、環境変数を渡せるか(要確認)。不可なら画像生成のみGitHub Actionsへ切り出す代替案に変更(承認を取り直す)。
- 自動マージの有効化はフェーズ2の別Planで設計。
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
`npm run validate` で次を検査する(CIでも実行)。スキーマ・AI表記、画像の存在とalt、slug/タイトル重複、禁止表現、アレルゲン整合、加熱記述(警告)、アフィリエイトのURL/ドメイン整合、リンク疎通(`--check-links`)。ルールは `scripts/rules.json`。自動マージ(フェーズ2)は未実装で、ユーザーの指示後に別途設計する。

## 実装状況: 画像生成
Claude Code の実行環境は OpenAI に接続できないため、画像は GitHub Actions で生成する。`recipe/**` ブランチへの push で `images.yml` が `npm run images` を実行し、未生成の画像(`image.prompt` があるレシピ)を gpt-image で作って同じブランチにコミットし、CI を再実行する。キーは GitHub Secrets の `OPENAI_API_KEY` のみ。最初のCIは画像が無く赤になり、画像コミット後の再実行で緑になる。
