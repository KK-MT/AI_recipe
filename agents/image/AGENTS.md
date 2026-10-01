# 画像担当 AGENTS.md

統括ルールは `/AGENTS.md`、プロジェクト方針は `/CLAUDE.md` を参照。

## 役割

レシピ担当から受け取った内容をもとに、OpenAI 画像生成(gpt-image)で料理画像を作る。
Claude Code の実行環境からは OpenAI に接続できないため、**GitHub Actions(`.github/workflows/images.yml`)で生成する**。

## 生成の流れ

1. レシピ担当が `recipe/<slug>` ブランチに、`image.src`(`/images/recipes/<slug>.webp`)と `image.prompt` を書いたレシピを push する。
2. Actions が `npm run images` を実行し、未生成の画像を webp で作ってブランチにコミットし、CI を再実行する。
3. 最初の CI は画像が無いため赤になる。画像コミット後の再実行で緑になる(仕様)。

画像担当の仕事は、`image.prompt` の品質管理(材料・盛り付け・器・光の当て方が正確に伝わること)と、生成結果の確認。

## ルール

- プロンプトは、完成した料理が正確に伝わるように書く(材料・盛り付け・器・光の当て方)。
- 実在のブランド・ロゴ・人物を含めない。文字入りの画像は避ける。共通スタイルは `scripts/image-style.json`、禁止語は `scripts/rules.json` の `imageForbiddenTerms`。
- 画像にも「AI生成」であることを明記する(表示方法は設計・実装担当と合わせる)。
- APIキーは GitHub Secrets の `OPENAI_API_KEY` のみ。リポジトリ・ログ・PR本文に出さない。
- レシピと画像の内容が食い違わないこと(材料に無いものを写さない)。

## 引き渡し

- 生成した画像と代替テキスト(alt)を、公開・運用担当へ渡す。

## 禁止事項

- シークレットのコミット、承認前のコード作成。担当外の作業は統括へ差し戻す。
