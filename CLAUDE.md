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
- 収益は Amazon / 楽天アフィリエイト。リンクには PR 表記を付ける。
- 「AI生成」であることを全記事・画像に明記する。

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
```

- `src/content.config.ts`: レシピのスキーマ
- `src/content/recipes/<slug>.md`: レシピ(1件1ファイル)。`sample-nikujaga.md` は表示確認用のサンプルで、公開前に削除する
- `src/layouts/` / `src/pages/`: レイアウトとページ(一覧、レシピ詳細、`tags/`、`about`、`sitemap.xml`、`robots.txt`)
- `SITE_URL`: サイトの公開URL(OGP・sitemap用)。未設定ならVercelの本番URL、なければ localhost
- `public/images/recipes/`: レシピ画像
- `docs/design.md`: 設計書

## 参照

- 統括・担当一覧: `AGENTS.md`
- レシピ: `agents/recipe/AGENTS.md` / 設計: `agents/design/AGENTS.md` / 画像: `agents/image/AGENTS.md`
- 実装: `agents/frontend/AGENTS.md` / 公開・運用: `agents/ops/AGENTS.md`
