# 引き継ぎ資料(2026-10-06 時点)

新しいセッションは、まず `CLAUDE.md`、`AGENTS.md`、この資料を読むこと。ユーザーは日本語で、スマホ中心で作業している。

## 1. プロジェクトの現状

AIが料理レシピを作ってWEBで公開するサイト(Astro の静的サイト、ホスティングは Vercel)。**公開済み・運用中。**

| 項目 | 状態 |
|---|---|
| サイト | 公開済み。レシピ12件(初期10件 + きんぴらごぼう + さばの味噌煮)。一覧は料理ごとのカード表示 |
| 自動投稿 | Routine `trig_01CoGuhXnVWw45AkJA9zESm7`(毎日 6:07 JST に起動。最新レシピから2日未満ならスキップ)。1回に1レシピのPRを作る。**マージはユーザーがスマホで行う(フェーズ1)** |
| 画像 | GitHub Actions(`images.yml`)が gpt-image で生成してコミット。キーは GitHub Secrets の `OPENAI_API_KEY` |
| アフィリエイト | 楽天・Amazonの検索リンクを、レシピの `shopping` から自動生成。IDは Vercel の環境変数(`RAKUTEN_AFFILIATE_ID`、`AMAZON_TRACKING_ID`)。**ユーザーが両方設定済みで、サイトにリンクが出ることを確認済み** |
| 検証・CI | `npm run validate` と `npm test`、`ci.yml`(test → validate → build) |
| 独自ドメイン | 未取得。ユーザーは「しばらく様子を見る」。取得するときは `SITE_URL` を設定し、楽天・Amazon に登録したサイトURLも更新する |
| 栄養成分 | 実装済み(下の §2)。成分表から1人分を計算して表示 |
| 自動マージ(フェーズ2) | 未実装。**ユーザーの明示的な指示があるまで作らない** |

次の定期実行は 2026-10-07 06:07 JST(10/5付けのレシピから2日たつため、新しいレシピPRができる見込み)。

## 2. 栄養成分の表示(実装済み・ブランチに push 済み、PR未作成)

- 計画: `docs/nutrition-plan.md`(2026-10-06 の変更を含め、ユーザー承認済み)。実装の内容は `docs/design.md` の「実装状況: 栄養成分」。
- データ: 公式Excel(第2章データ `20260327-mxt_kagsei-mext-000029402_02.xlsx`)から `data/food-composition.json`(2,538食品)を作った。環境は `www.mext.go.jp` に接続できるようになった。データの作り直しが必要になったら、公式ページでExcelのURLを確認し、`npm run food:build -- <Excel>`。MEXT のサイトは、ときどき SSL のエラー(`SSL_ERROR_SYSCALL`)で切れるが、やり直せば成功する(`curl --retry 3` など)。**数値を記憶で作ったり、手で書き足したりしない。**
- 既存12レシピは `food`/`grams` をバックフィル済み(`food`/`grams` は必須になった)。重さは、計量スプーンの一般的な目安(しょうゆ大さじ1=18g など)と可食部で決めた。ほうれん草のゆで湯の塩は `food: "-"` で、検証の警告が1件出るのは想定どおり。
- 自動投稿の手順書(`docs/auto-post.md`)に `food`/`grams` の書き方を追加した。**このブランチが `main` にマージされた後の、最初の自動投稿のレシピPRで、`food`/`grams` が書かれ、栄養成分が表示されるかを確認する**(計画の Verification 5)。マージ前に作られたレシピPR(`food`/`grams` なし)は、マージ後に検証で失敗するため、`food`/`grams` を書き足す。
- 未完了: ユーザーが「PR作成して」と言ったら、PRを作る。PR本文には、材料の対応(材料 → 食品 → 重さ)と1人分の値の一覧を載せる。

## 3. 作業のルール(ユーザーの指示。必ず守る)

1. **コードはすぐ書かない。PlanMode で設計し、ユーザーの承認を得てから書く。** 文書だけの変更や、承認済みの計画の実装は、再承認なしで進めてよい(これまでの運用)。
2. **ExitPlanMode が「You are not in plan mode」というエラーを返すことがある。これは承認ではない。** その場合は、EnterPlanMode をもう一度呼び、続けて ExitPlanMode を呼んで、本当の承認を得る。承認されていない状態で、実装を始めない。
3. **PRは、ユーザーが「PR作成して」と言ったときだけ作る。** 自動投稿のレシピPRは例外(Routine が作る)。PRのタイトルと本文は、日本語で、PR本文の末尾に指定された署名を付ける。同じブランチのPRが既に開かれていたら、新しく作らずに更新する。
4. 開発ブランチは **`claude/ai-recipe-auto-posting-xzbctl`**。PRがマージされたら、`git fetch origin main && git checkout -B claude/ai-recipe-auto-posting-xzbctl origin/main` で作り直し、`git push -u origin` する(Stopフックが、未pushのコミットを指摘する)。他のブランチへは許可なく push しない(`recipe/**` は、レシピ用のブランチとして、ユーザーが承認した例外)。
5. シークレット(APIキーなど)をコミットしない・チャットに出さない。アフィリエイトIDは秘密ではないが、コードには書かない。
6. 文書・サイト・レシピの文章は、すべて日本語。「AI生成」を、全記事・画像に明記する。アフィリエイトには「PR」表記を付ける。
7. コミットメッセージの末尾に、指定された `Co-Authored-By` と `Claude-Session` の行を付ける。

## 4. 環境の制約と、分かっていること

- この環境(Claude Code のクラウド)は、**OpenAI に接続できない**(画像は Actions で生成する)。文部科学省のサイト(`www.mext.go.jp`)には接続できる(許可済み)。楽天のサイトも接続できない。`WebSearch` は使えるが、`WebFetch` や `curl` は許可ドメインだけ。
- `rm` や `git push --delete` のような、リモートブランチの削除は、この環境からは通信が切られて失敗する。不要なブランチ(`recipe/initial-10`、`recipe/kinpira-gobo`、`recipe/saba-misoni`)は、**ユーザーに、GitHub 上で削除してもらう**。
- Routine のセッションの中身(最後のメッセージなど)は、こちらからは読めない。結果は、GitHub(PR・ブランチ・Actions)の状態で確認する。
- バックグラウンドの待機の完了通知(`task-notification`)は、ユーザーの返信ではない。承認として扱わない。
- GitHub の操作は、`mcp__github__*` のツールを使う(`gh` コマンドはない)。ツールは `ToolSearch` で読み込む。
- 長い待機には、`Bash` の `run_in_background` を使う(前景の `sleep` は禁止されている)。
- 日付は日本時間(JST)で扱う。レシピの `publishedAt` も JST。

## 5. 主なファイル

- `CLAUDE.md`: プロジェクトの方針・コマンド・構成(最重要)。`AGENTS.md` と `agents/<担当>/AGENTS.md`: 担当ごとのルール
- `docs/design.md`: 設計書(実装状況つき)。`docs/auto-post.md`: 自動投稿(Routine)の手順書。`docs/recipe-ideas.md`: ユーザーが書き足す、作ってほしい料理
- `docs/nutrition-plan.md`: 栄養成分の承認済み計画
- `src/content.config.ts`: レシピのスキーマ。`src/content/recipes/`: レシピ。`src/lib/affiliate.mjs`: アフィリエイトリンクの生成
- `scripts/`: 検証(`validate-recipes.mjs`、`rules.json`)、画像生成(`generate-images.mjs`)、判断材料(`recipe-status.mjs`)とテスト
- `.github/workflows/`: `ci.yml`、`images.yml`

## 6. ユーザーの側の未完了・確認待ち

- 楽天のリンクの形式(`hb.afl.rakuten.co.jp/hgc/<ID>/?pc=...`)は、記憶に基づく。**クリックして楽天の検索結果に着くこと、アフィリエイトのレポートに計上されることの確認が済んでいない**(ユーザーが「リンクが出ることは確認」と報告。計上は未確認)。違っていれば、`buildRakutenUrl`(`src/lib/affiliate.mjs`)だけを直す。
- Amazon アソシエイトは、申し込みから180日以内に3件の適格販売が必要(ユーザーに案内済み)。
- 独自ドメインの取得は、ユーザーが「様子を見る」と決めた。
- 自動投稿の通知(プッシュ)が届くか、画像や内容の質は、ユーザーの確認待ち。

## 7. 今後の候補(ユーザーの指示があってから)

フェーズ2(自動マージ)/ タグ別一覧のカード化 / PWA化 / 独自ドメイン / OpenAI費用の確認方法。
