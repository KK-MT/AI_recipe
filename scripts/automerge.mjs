// 自動マージ(フェーズ2)。レシピPRが条件をすべて満たすときだけ、.github/workflows/automerge.yml がマージする。
// 使い方:
//   node scripts/automerge.mjs select [--pr N]   対象のPRを1件選び、GITHUB_OUTPUT に number・sha・slug を書く(要 gh)
//   node scripts/automerge.mjs check <slug|PR番号>  新しいレシピの厳しい検査(エラー・警告0件、栄養成分、画像)
//   node scripts/automerge.mjs comment <PR番号> <種類> [本文ファイル]  PRにコメントする(同じ種類は1回だけ)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRecipe, loadRecipes } from './validate-recipes.mjs';
import { NUTRIENTS, formatNutrient, nutritionPerServing, roundNutrition } from '../src/lib/nutrition.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const HOLD_LABEL = '保留';
export const MIN_AGE_HOURS = 4;
const SLUG_RE = /^recipe\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;

export const slugOf = (headRef) => headRef?.match(SLUG_RE)?.[1] ?? null;

// PRの状態の検査。{ ok, wait, reasons }。wait は「今は対象外だが、時間がたてば対象になる」(コメントしない)
export function checkPullRequest(pr, { now = new Date(), minAgeHours = MIN_AGE_HOURS } = {}) {
  const reasons = [];
  const wait = [];
  if (pr.state !== 'OPEN') reasons.push('PRが open ではありません');
  if (pr.isDraft) reasons.push('ドラフトのPRです');
  if (pr.baseRefName !== 'main') reasons.push(`ベースが main ではありません(${pr.baseRefName})`);
  if (pr.isCrossRepository) reasons.push('フォークからのPRです');
  if (!slugOf(pr.headRefName)) reasons.push(`ブランチ名が recipe/<slug> ではありません(${pr.headRefName})`);
  if ((pr.labels ?? []).some((l) => l.name === HOLD_LABEL)) wait.push(`「${HOLD_LABEL}」ラベルが付いています`);
  const ageHours = (now - new Date(pr.createdAt)) / 3_600_000;
  if (ageHours < minAgeHours) wait.push(`作成から${minAgeHours}時間たっていません`);
  if (pr.mergeable === 'CONFLICTING') reasons.push('main と競合しています');
  else if (pr.mergeable !== 'MERGEABLE') wait.push('マージできるかどうか、GitHub がまだ判定していません');
  return { ok: reasons.length === 0 && wait.length === 0, wait, reasons };
}

// 変更ファイルの限定(最重要の安全策)。files は GitHub API の { filename, status } の配列
export function checkFiles(files, slug) {
  const allowed = {
    [`src/content/recipes/${slug}.md`]: ['added'],
    [`public/images/recipes/${slug}.webp`]: ['added'],
    'docs/recipe-ideas.md': ['modified'],
  };
  const reasons = [];
  for (const f of files) {
    const ok = allowed[f.filename]?.includes(f.status);
    if (!ok) reasons.push(`自動マージで変更できないファイルです: ${f.filename}(${f.status})`);
  }
  for (const required of [`src/content/recipes/${slug}.md`, `public/images/recipes/${slug}.webp`]) {
    if (!files.some((f) => f.filename === required)) reasons.push(`${required} がありません`);
  }
  return reasons;
}

// 新しいレシピの厳しい検査: エラー・警告とも0件、栄養成分が計算できる
export function checkNewRecipe(recipe, { foods, publicDir } = {}) {
  if (!recipe) return ['レシピのファイルが見つかりません'];
  const opts = { ...(publicDir && { publicDir }), ...(foods && { foods }) };
  const reasons = checkRecipe(recipe, opts).map((x) => `${x.level === 'error' ? 'エラー' : '警告'}: ${x.msg}`);
  const n = nutritionPerServing(recipe.data, foods ?? loadFoods());
  if (n?.energy == null) reasons.push('栄養成分(エネルギー)が計算できません');
  return reasons;
}

// 画像の検査: sharp で読めるwebp、幅512px以上、10KB以上
export async function checkImage(file) {
  if (!fs.existsSync(file)) return [`画像がありません: ${path.relative(root, file)}`];
  const reasons = [];
  if (fs.statSync(file).size < 10 * 1024) reasons.push('画像のファイルサイズが小さすぎます(10KB未満)');
  try {
    const { default: sharp } = await import('sharp');
    const meta = await sharp(file).metadata();
    if (meta.format !== 'webp') reasons.push(`画像が webp ではありません(${meta.format})`);
    if (!(meta.width >= 512)) reasons.push(`画像の幅が512px未満です(${meta.width}px)`);
  } catch (e) {
    reasons.push(`画像を読み込めません: ${e.message}`);
  }
  return reasons;
}

const loadFoods = () => JSON.parse(fs.readFileSync(path.join(root, 'data/food-composition.json'), 'utf8')).foods;

// PRに載せる要約(1人分の栄養成分)
export function summary(recipe, foods) {
  const n = roundNutrition(nutritionPerServing(recipe.data, foods));
  const values = NUTRIENTS.map((x) => `${x.label} ${formatNutrient(n?.[x.key], x)}`).join('、');
  return `「${recipe.data.title}」(1人分: ${values})`;
}

// --- GitHub(gh コマンド) ---
const repo = () => process.env.GITHUB_REPOSITORY;
const gh = (args) => execFileSync('gh', args, { encoding: 'utf8' });
const ghJson = (args) => JSON.parse(gh(args));
const PR_FIELDS = 'number,state,isDraft,baseRefName,headRefName,headRefOid,isCrossRepository,labels,createdAt,mergeable';
const prFiles = (n) => ghJson(['api', '--paginate', `repos/${repo()}/pulls/${n}/files`, '--jq', '[.[] | {filename, status}]']);
const marker = (kind) => `<!-- automerge:${kind} -->`;

const hasComment = (number, kind) =>
  ghJson(['api', '--paginate', `repos/${repo()}/issues/${number}/comments`, '--jq', '[.[].body]']).some((b) =>
    b.includes(marker(kind)),
  );

// 同じ種類のコメントは1回だけ書く
export function comment(number, kind, body) {
  if (hasComment(number, kind)) return false;
  gh(['pr', 'comment', String(number), '--repo', repo(), '--body', `${body}\n\n${marker(kind)}`]);
  return true;
}

function output(values) {
  const lines = Object.entries(values).map(([k, v]) => `${k}=${v}`).join('\n');
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines}\n`);
  console.log(lines);
}

function select(prArg) {
  const numbers = prArg
    ? [Number(prArg)]
    : ghJson(['pr', 'list', '--repo', repo(), '--state', 'open', '--base', 'main', '--json', 'number,headRefName'])
        .filter((p) => p.headRefName.startsWith('recipe/'))
        .map((p) => p.number)
        .sort((a, b) => a - b);
  for (const number of numbers) {
    const pr = ghJson(['pr', 'view', String(number), '--repo', repo(), '--json', PR_FIELDS]);
    // 手動実行(PR番号を指定)のときは、経過時間を待たない
    const state = checkPullRequest(pr, { minAgeHours: prArg ? 0 : MIN_AGE_HOURS });
    const slug = slugOf(pr.headRefName);
    const reasons = [...state.reasons, ...(slug ? checkFiles(prFiles(number), slug) : [])];
    if (reasons.length) {
      console.log(`#${number}: 対象外\n- ${reasons.join('\n- ')}`);
      comment(number, 'ineligible', `自動マージの対象外のため、マージしませんでした。確認してから手動でマージしてください。\n\n- ${reasons.join('\n- ')}`);
      continue;
    }
    if (state.wait.length) {
      console.log(`#${number}: 待機\n- ${state.wait.join('\n- ')}`);
      continue;
    }
    // 検査に一度失敗したPRは、毎日やり直さない(人が確認して、手動実行で PR番号を指定すればやり直せる)
    if (!prArg && hasComment(number, 'failed')) {
      console.log(`#${number}: 以前に検査に失敗したため、手動実行(PR番号の指定)を待ちます`);
      continue;
    }
    output({ number, sha: pr.headRefOid, slug });
    return;
  }
  console.log('自動マージの対象のPRはありません');
}

async function check(arg) {
  const slug = /^\d+$/.test(arg) ? slugOf(ghJson(['pr', 'view', arg, '--repo', repo(), '--json', 'headRefName']).headRefName) : arg;
  const foods = loadFoods();
  const recipe = loadRecipes().find((r) => r.slug === slug);
  const reasons = [...checkNewRecipe(recipe, { foods }), ...(await checkImage(path.join(root, `public/images/recipes/${slug}.webp`)))];
  if (reasons.length) {
    console.log(`自動マージの検査に失敗: ${slug}\n- ${reasons.join('\n- ')}`);
    process.exit(1);
  }
  const text = summary(recipe, foods);
  if (process.env.SUMMARY_FILE) fs.writeFileSync(process.env.SUMMARY_FILE, text);
  console.log(`自動マージの検査に合格: ${text}`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'select') {
    const i = rest.indexOf('--pr');
    return select(i >= 0 && /^\d+$/.test(rest[i + 1] ?? '') ? rest[i + 1] : null);
  }
  if (cmd === 'check' && rest[0]) return check(rest[0]);
  if (cmd === 'comment' && rest[0] && rest[1]) {
    const body = rest[2] ? fs.readFileSync(rest[2], 'utf8') : '';
    return void comment(Number(rest[0]), rest[1], body);
  }
  console.error('使い方: node scripts/automerge.mjs select [--pr N] | check <slug|PR番号> | comment <PR番号> <種類> [本文ファイル]');
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
