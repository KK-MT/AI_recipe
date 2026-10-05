// レシピの公開前検証。使い方: node scripts/validate-recipes.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rules = JSON.parse(fs.readFileSync(path.join(root, 'scripts/rules.json'), 'utf8'));

const err = (msg) => ({ level: 'error', msg });
const warn = (msg) => ({ level: 'warn', msg });

export function loadRecipes(dir = path.join(root, 'src/content/recipes')) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const { data, content } = matter(fs.readFileSync(path.join(dir, f), 'utf8'));
      return { slug: f.replace(/\.md$/, ''), data, body: content };
    });
}

const textOf = (r) =>
  [r.data.title, r.data.description, r.data.tips, ...(r.data.steps ?? []), r.body].filter(Boolean).join('\n');

// 1件のレシピを検査して { level, msg }[] を返す(リンク疎通を除く)
export function checkRecipe(r, { publicDir = path.join(root, 'public') } = {}) {
  const d = r.data;
  const out = [];

  // スキーマ・AI表記
  for (const key of ['title', 'description', 'publishedAt', 'servings', 'prepMinutes', 'cookMinutes', 'tips']) {
    if (d[key] === undefined || d[key] === null || d[key] === '') out.push(err(`必須項目 ${key} がありません`));
  }
  if (!Array.isArray(d.ingredients) || d.ingredients.length === 0) out.push(err('材料(ingredients)がありません'));
  if (!Array.isArray(d.steps) || d.steps.length === 0) out.push(err('手順(steps)がありません'));
  if (!Array.isArray(d.tags)) out.push(err('tags が配列ではありません'));
  if (!Array.isArray(d.allergens)) out.push(err('allergens が配列ではありません(使わない場合は [] )'));
  if (d.aiGenerated !== true) out.push(err('aiGenerated が true ではありません(AI生成の明記が必要です)'));
  if (!d.image) {
    out.push(err('image がありません'));
  } else {
    if (d.image.aiGenerated !== true) out.push(err('image.aiGenerated が true ではありません(画像のAI生成明記が必要です)'));
    if (!d.image.alt || !String(d.image.alt).trim()) out.push(err('image.alt(代替テキスト)が空です'));
    if (!d.image.src) {
      out.push(err('image.src がありません'));
    } else if (!fs.existsSync(path.join(publicDir, d.image.src))) {
      const hint = d.image.prompt ? '(image.prompt があるので画像生成の実行待ちです)' : '(image.prompt も無いため生成できません)';
      out.push(err(`画像ファイルが見つかりません: public${d.image.src}${hint}`));
    }
  }

  // 禁止表現
  const text = textOf(r);
  for (const term of rules.forbiddenTerms) {
    if (text.includes(term)) out.push(err(`禁止表現「${term}」が含まれています`));
  }

  // アレルゲン整合
  const ingredientText = (d.ingredients ?? []).map((i) => i.name ?? '').join('\n');
  const declared = new Set(d.allergens ?? []);
  for (const [allergen, words] of Object.entries(rules.allergenKeywords)) {
    const hit = words.find((w) => ingredientText.includes(w));
    if (hit && !declared.has(allergen)) {
      out.push(err(`材料に「${hit}」があるのに allergens に「${allergen}」がありません`));
    }
  }

  // 加熱の注意
  const needsHeat = rules.needsHeatKeywords.find((w) => ingredientText.includes(w));
  const stepsText = (d.steps ?? []).join('\n');
  if (needsHeat && !rules.heatWords.some((w) => stepsText.includes(w))) {
    out.push(warn(`材料に「${needsHeat}」がありますが、手順に加熱の記述が見当たりません`));
  }

  // 買い物リンク用の検索キーワード(リンクはサイトが作る。URLや禁止表現は書かせない)
  const shopping = d.shopping ?? [];
  if (!Array.isArray(shopping)) {
    out.push(err('shopping が配列ではありません'));
  } else {
    if (shopping.length > 3) out.push(err(`shopping は最大3件です(${shopping.length}件)`));
    for (const [i, item] of shopping.entries()) {
      for (const key of ['label', 'keyword']) {
        const v = String(item?.[key] ?? '').trim();
        if (!v) out.push(err(`shopping[${i}].${key} が空です`));
        else if (v.length > 30) out.push(err(`shopping[${i}].${key} は30字以内にしてください`));
        else if (/https?:|\/\//i.test(v)) out.push(err(`shopping[${i}].${key} にURLは書けません(検索キーワードだけにしてください)`));
        else {
          const hit = rules.forbiddenTerms.find((t) => v.includes(t));
          if (hit) out.push(err(`shopping[${i}].${key} に禁止表現「${hit}」が含まれています`));
        }
      }
    }
  }
  return out;
}

// 全件にまたがる検査(slug・タイトルの重複)
export function checkDuplicates(recipes) {
  const out = [];
  const seenSlug = new Map();
  const seenTitle = new Map();
  for (const r of recipes) {
    if (seenSlug.has(r.slug)) out.push({ slug: r.slug, ...err(`slug が重複しています: ${seenSlug.get(r.slug)}`) });
    seenSlug.set(r.slug, r.slug);
    const t = String(r.data.title ?? '').trim();
    if (t && seenTitle.has(t)) out.push({ slug: r.slug, ...err(`タイトルが ${seenTitle.get(t)} と重複しています`) });
    else seenTitle.set(t, r.slug);
  }
  return out;
}

async function main() {
  const recipes = loadRecipes();
  const results = [];
  for (const r of recipes) {
    for (const p of checkRecipe(r)) results.push({ slug: r.slug, ...p });
  }
  results.push(...checkDuplicates(recipes));

  for (const x of results) console.log(`${x.level === 'error' ? 'ERROR' : 'WARN '} [${x.slug}] ${x.msg}`);
  const errors = results.filter((x) => x.level === 'error').length;
  const warns = results.length - errors;
  console.log(`\nレシピ ${recipes.length} 件を検査: エラー ${errors} 件、警告 ${warns} 件`);
  process.exit(errors > 0 ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
