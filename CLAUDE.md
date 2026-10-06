# CLAUDE.md

AIで料理レシピを作成し、WEBで公開するプロジェクト。担当ごとのルールは `AGENTS.md`(統括)と `agents/<担当>/AGENTS.md` を参照。

## 絶対ルール

- **コードはすぐ書かない。必ず PlanMode で設計し、ユーザーの承認を得てから書く。**
- APIキーなどのシークレットはリポジトリにコミットしない。
- ユーザーが依頼するまで Pull Request(PR)は作成しない。ただし自動投稿のレシピPRは AGENTS.md の公開フローに従う。
- 文書・サイト・レシピ本文はすべて日本語。

## プロジェクト概要

| フェーズ | 内容 |
|---|---|
| 1. 初期投入 | 公開前に10個ほどのレシピを投稿しておく |
| 2. 公開開始 | サイトを公開する |
| 3. 自動投稿 | 2日に1回程度、AIがレシピを作成して投稿する |

## 技術方針

- 静的サイト。レシピは Markdown / JSON でリポジトリに保存する。
- スマホで動作確認できること。ブランチ/PRごとのプレビューURL(GitHub Pages / Vercel 等)で確認する。
- フレームワークは Astro、ホスティングは Vercel(設計承認済み。詳細は `docs/design.md`)。ドメインは未定。
- OpenAI APIキーは GitHub Secrets / 実行環境の環境変数で管理する。`.env` はコミットしない(`.env.example` にキー名のみ)。
- 自動投稿は Claude Code のスケジュール実行(2日に1回)。ブランチ作成 → PR作成までを行う。
- 承認フロー
  - 最初の数週間: PRをユーザーがスマホの GitHub アプリでマージして公開する。
  - その後: 検証に通ったものを自動マージへ移行する。移行はユーザーの指示があるまで行わない。
- 画像は OpenAI 画像生成(gpt-image)で作る。APIキーはシークレット管理する。
- 収益は Amazon / 楽天アフィリエイト。レシピには検索キーワード(`shopping`)だけを書き、リンクはサイトが自動で作る。リンクには PR 表記を付ける。
- 「AI生成」であることを全記事・画像に明記する。
- 栄養成分(1人分の目安)は、文部科学省『日本食品標準成分表(八訂)増補2023年』の値から計算する。AIに数値を推定させない。レシピには材料ごとの食品番号(`food`)と可食部の重さ(`grams`)だけを書く。出典を明記する。

## 開発ルール

- 開発ブランチは `claude/ai-recipe-auto-posting-xzbctl`。他のブランチへは許可なく push しない。
- コミットメッセージは内容が分かるように具体的に書く。
- PR作成時は PRテンプレート(`.github/pull_request_template.md` 等)があれば構成に従う。

## コマンド / ディレクトリ構成

```
npm install        # 依存インストール(Node 22 / npm)
npm run dev        # 開発サーバー(スマホ確認用に 0.0.0.0 で待受)
npm run build      # 静的ビルド(dist/)。スキーマ違反・AI生成表記の欠落はここで失敗する
npm run preview    # ビルド結果の確認
npm test           # 検証スクリプトの単体テスト
npm run validate   # レシピ検証(スキーマ・AI表記・画像・アレルゲン・禁止表現・買い物キーワードなど)
npm run recipe:status # 自動投稿の判断材料(日付・最新レシピ・タグ別件数)を表示
npm run images     # 画像が未生成のレシピの画像を生成(OPENAI_API_KEY が必要。通常は Actions が実行)
npm run food -- <キーワード>  # 成分表の食品を検索(食品番号・100gあたりの値)。レシピの food を選ぶのに使う
npm run food:build -- <Excel>  # 公式Excel(第2章データ)から data/food-composition.json を作り直す(通常は不要)
```

- `src/content.config.ts`: レシピのスキーマ
- `src/content/recipes/<slug>.md`: レシピ(1件1ファイル)
- `src/layouts/` / `src/pages/`: レイアウトとページ(一覧、レシピ詳細、`tags/`、`about`、`sitemap.xml`、`robots.txt`)
- `SITE_URL`: サイトの公開URL(OGP・sitemap用)。未設定ならVercelの本番URL、なければ localhost
- `RAKUTEN_AFFILIATE_ID` / `AMAZON_TRACKING_ID`: アフィリエイトID(Vercelの環境変数。ProductionとPreview)。未設定のサービスのリンクは表示しない。IDは秘密情報ではないが、コードには書かない
- `data/food-composition.json`: 日本食品標準成分表(八訂)増補2023年の全2,538食品(100gあたりのエネルギー・たんぱく質・脂質・炭水化物・食塩相当量、廃棄率)。手で編集しない(`food:build` で作る)。Excel本体はコミットしない
- `src/lib/nutrition.mjs`: 栄養成分の計算(1人分。ページと検証で共用)
- `src/lib/affiliate.mjs`: アフィリエイトリンクの生成(レシピの `shopping` の検索キーワードから作る)
- `scripts/`: レシピ検証(`validate-recipes.mjs`)とそのテスト。禁止表現・アレルゲン対応表は `rules.json`
- `.github/workflows/images.yml`: `recipe/**` ブランチへの push で画像を生成してコミットし、CIを再実行(キーは GitHub Secrets の `OPENAI_API_KEY`)
- `.github/workflows/ci.yml`: PR・pushで test → validate → build を実行
- `docs/auto-post.md`: 自動投稿(Routine)の手順書。`docs/recipe-ideas.md`: 作ってほしい料理のリスト
- `public/images/recipes/`: レシピ画像
- `docs/design.md`: 設計書

## 参照

- **引き継ぎ(新しいセッションは最初に読む): `docs/handoff.md`**
- 統括・担当一覧: `AGENTS.md`
- レシピ: `agents/recipe/AGENTS.md` / 設計: `agents/design/AGENTS.md` / 画像: `agents/image/AGENTS.md`
- 実装: `agents/frontend/AGENTS.md` / 公開・運用: `agents/ops/AGENTS.md`
