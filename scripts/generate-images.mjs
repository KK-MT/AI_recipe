// 画像が未生成のレシピ(image.prompt あり)に gpt-image で画像を作る。
// 使い方: OPENAI_API_KEY=... node scripts/generate-images.mjs [--limit N]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { loadRecipes } from './validate-recipes.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(root, 'scripts', f), 'utf8'));
const rules = readJson('rules.json');
const style = readJson('image-style.json');

export function buildPrompt(recipePrompt) {
  const hit = rules.imageForbiddenTerms.find((t) => recipePrompt.includes(t));
  if (hit) throw new Error(`画像プロンプトに使えない語「${hit}」が含まれています`);
  return `${recipePrompt}\n\n${style.base}`;
}

// 画像ファイルがまだ無く、image.prompt があるレシピ
export function findPending(recipes, publicDir = path.join(root, 'public')) {
  return recipes.filter((r) => r.data.image?.src && r.data.image.prompt && !fs.existsSync(path.join(publicDir, r.data.image.src)));
}

const redact = (text, apiKey) => (apiKey ? String(text).split(apiKey).join('***') : String(text));

export async function requestImage({ prompt, apiKey, model = 'gpt-image-1', fetchImpl = fetch, timeoutMs = 120000 }) {
  let res;
  try {
    res = await fetchImpl('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, prompt, size: style.size, quality: style.quality, n: 1 }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (e?.name === 'TimeoutError') throw new Error(`OpenAI API の応答がタイムアウトしました(${timeoutMs / 1000}秒)`);
    throw e;
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenAI API エラー(${res.status}): ${redact(json?.error?.message ?? '詳細なし', apiKey)}`);
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI API の応答に画像データがありません');
  return Buffer.from(b64, 'base64');
}

export async function saveWebp(buffer, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp(buffer).resize({ width: style.webpWidth, withoutEnlargement: true }).webp({ quality: 82 }).toFile(outPath);
}

export async function run({ recipes, apiKey, limit = 12, model, fetchImpl, publicDir = path.join(root, 'public'), log = console.log }) {
  const pending = findPending(recipes, publicDir);
  const targets = pending.slice(0, limit);
  const result = { generated: [], failed: [], remaining: pending.length - targets.length };
  for (const r of targets) {
    try {
      const prompt = buildPrompt(r.data.image.prompt);
      const buffer = await requestImage({ prompt, apiKey, model, fetchImpl });
      await saveWebp(buffer, path.join(publicDir, r.data.image.src));
      result.generated.push(r.slug);
      log(`生成しました: ${r.slug}`);
    } catch (e) {
      result.failed.push(r.slug);
      log(`失敗: ${r.slug}: ${redact(e.message, apiKey)}`);
    }
  }
  return result;
}

async function main() {
  const i = process.argv.indexOf('--limit');
  const limit = i >= 0 ? Number(process.argv[i + 1]) : 12;
  if (!Number.isInteger(limit) || limit < 1) throw new Error('--limit は1以上の整数で指定してください');
  const recipes = loadRecipes();
  if (findPending(recipes).length === 0) {
    console.log('画像が未生成のレシピはありません');
    return;
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY が設定されていません');
    process.exit(1);
  }
  const { generated, failed, remaining } = await run({ recipes, apiKey, limit, model: process.env.OPENAI_IMAGE_MODEL || undefined });
  console.log(`\n生成 ${generated.length} 件、失敗 ${failed.length} 件、上限で未処理 ${remaining} 件`);
  process.exit(failed.length > 0 ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
