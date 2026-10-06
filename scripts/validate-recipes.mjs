// レシピの公開前検証。使い方: node scripts/validate-recipes.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { EXCLUDED, NUTRIENTS, nutritionPerServing } from '../src/lib/nutrition.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rules = JSON.parse(fs.readFileSync(path.join(root, 'scripts/rules.json'), 'utf8'));
const defaultFoods = JSON.parse(fs.readFileSync(path.join(root, 'data/food-composition.json'), 'utf8')).foods;

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

// 1件のレシピを検査して { level, msg }[] を返す
export function checkRecipe(r, { publicDir = path.join(root, 'public'), foods = defaultFoods } = {}) {
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

  out.push(...checkNutrition(d, foods));
  return out;
}

// 「1と1/2」「1/2」「2」などの数量を数値にする
export function parseQuantity(s) {
  const t = String(s).normalize('NFKC').trim();
  const m = t.match(/^(\d+(?:\.\d+)?)?(?:と)?(?:(\d+)\/(\d+))?$/);
  if (!m || (!m[1] && !m[2])) return null;
  return (m[1] ? Number(m[1]) : 0) + (m[2] ? Number(m[2]) / Number(m[3]) : 0);
}

const near = (a, b, tol) => Math.abs(a - b) <= b * tol;

// 材料の表示(amount)と重さ(grams)の照合。
// amount の重さは購入時の重さのことがあるため、可食部(× (1 - 廃棄率))との一致も認める。
export function checkAmount(i, food) {
  const amount = String(i.amount ?? '').normalize('NFKC').replace(/\s+/g, '');
  const keep = 1 - (food?.refuse ?? 0) / 100;
  const ok = (x, tol) => near(i.grams, x, tol) || near(i.grams, x * keep, tol);
  const exact = amount.match(/^(\d+(?:\.\d+)?)g$/);
  if (exact) {
    const x = Number(exact[1]);
    return ok(x, 0.01) ? null : err(`材料「${i.name}」: amount(${i.amount})と grams(${i.grams})が一致しません`);
  }
  const approx = amount.match(/約(\d+(?:\.\d+)?)g/);
  if (approx) {
    const x = Number(approx[1]);
    return ok(x, 0.1) ? null : err(`材料「${i.name}」: amount(${i.amount})と grams(${i.grams})が10%以上違います`);
  }
  const spoon = amount.match(/^(大さじ|小さじ)([\d.と/]+)/);
  if (spoon) {
    const q = parseQuantity(spoon[2]);
    if (q) {
      const ml = (spoon[1] === '大さじ' ? 15 : 5) * q;
      const ratio = i.grams / ml;
      if (ratio < 0.4 || ratio > 1.8) {
        return warn(`材料「${i.name}」: ${i.amount}(${ml}ml)に対して grams(${i.grams})が不自然です`);
      }
    }
  }
  return null;
}

// 栄養成分の計算に使う材料の情報(food・grams)の検査
export function checkNutrition(d, foods) {
  const out = [];
  const ingredients = Array.isArray(d.ingredients) ? d.ingredients : [];
  let excluded = 0;
  for (const i of ingredients) {
    const label = `材料「${i.name}」`;
    if (i.food === undefined || i.food === null || i.food === '') {
      out.push(err(`${label}: food(食品番号)がありません(npm run food -- <名前> で探す)`));
      continue;
    }
    if (i.food === EXCLUDED) {
      excluded++;
      if (!/[水湯氷]/.test(i.name ?? '')) {
        out.push(warn(`${label}: 栄養成分の計算に含めない("-")材料です。水・氷や、捨てる材料(ゆで湯の塩など)だけに使ってください`));
      }
      continue;
    }
    const food = foods[String(i.food)];
    if (!food) {
      out.push(err(`${label}: 食品番号 ${i.food} が成分表にありません`));
      continue;
    }
    if (typeof i.grams !== 'number' || !(i.grams > 0)) {
      out.push(err(`${label}: grams(可食部の重さ)が正の数ではありません`));
      continue;
    }
    const nulls = NUTRIENTS.filter((n) => food[n.key] === null).map((n) => n.label);
    if (nulls.length) out.push(warn(`${label}: 成分表で${nulls.join('・')}が未測定のため、その項目は表示されません`));
    const a = checkAmount(i, food);
    if (a) out.push(a);
  }
  if (ingredients.length && excluded * 2 > ingredients.length) {
    out.push(err(`栄養成分の計算に含めない材料("-")が半分を超えています(${excluded}/${ingredients.length})`));
  }
  if (!out.some((x) => x.level === 'error')) {
    const n = nutritionPerServing(d, foods);
    if (n?.energy != null && (n.energy < 20 || n.energy > 1200)) {
      out.push(warn(`1人分のエネルギーが ${Math.round(n.energy)}kcal です(20〜1,200kcal の範囲外)。重さを確認してください`));
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
