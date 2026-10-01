// レシピの公開前検証。使い方: node scripts/validate-recipes.mjs [--check-links]
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
      out.push(err(`画像ファイルが見つかりません: public${d.image.src}`));
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

  // アフィリエイト
  for (const a of d.affiliate ?? []) {
    let url;
    try {
      url = new URL(a.url);
    } catch {
      out.push(err(`アフィリエイトURLが不正です: ${a.url}`));
      continue;
    }
    if (url.protocol !== 'https:') out.push(err(`アフィリエイトURLが https ではありません: ${a.url}`));
    const domains = rules.affiliateDomains[a.provider];
    if (!domains) {
      out.push(err(`provider が不正です: ${a.provider}`));
    } else if (!domains.some((dm) => url.hostname === dm || url.hostname.endsWith(`.${dm}`))) {
      out.push(err(`provider「${a.provider}」とURLのドメインが一致しません: ${url.hostname}`));
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

// リンク疎通: 404/410/名前解決失敗はエラー、403/429/5xx/タイムアウトは警告
export async function checkLink(url, fetchImpl = fetch) {
  const opts = { redirect: 'follow', signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'Mozilla/5.0 (recipe-link-check)' } };
  try {
    let res = await fetchImpl(url, { ...opts, method: 'HEAD' });
    if (res.status === 405 || res.status === 403) res = await fetchImpl(url, { ...opts, method: 'GET' });
    if (res.status === 404 || res.status === 410) return err(`リンク切れ(${res.status}): ${url}`);
    if (res.status >= 400) return warn(`リンクを確認できませんでした(${res.status}): ${url}`);
    return null;
  } catch (e) {
    const code = e?.cause?.code ?? e?.code;
    if (code === 'ENOTFOUND') return err(`名前解決に失敗しました: ${url}`);
    return warn(`リンクを確認できませんでした(${e?.name ?? 'error'}): ${url}`);
  }
}

async function main() {
  const checkLinks = process.argv.includes('--check-links');
  const recipes = loadRecipes();
  const results = [];
  for (const r of recipes) {
    for (const p of checkRecipe(r)) results.push({ slug: r.slug, ...p });
    if (checkLinks) {
      for (const a of r.data.affiliate ?? []) {
        const p = await checkLink(a.url);
        if (p) results.push({ slug: r.slug, ...p });
      }
    }
  }
  results.push(...checkDuplicates(recipes));

  for (const x of results) console.log(`${x.level === 'error' ? 'ERROR' : 'WARN '} [${x.slug}] ${x.msg}`);
  const errors = results.filter((x) => x.level === 'error').length;
  const warns = results.length - errors;
  console.log(`\nレシピ ${recipes.length} 件を検査: エラー ${errors} 件、警告 ${warns} 件`);
  process.exit(errors > 0 ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
