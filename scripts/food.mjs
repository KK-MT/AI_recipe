// 成分表の食品を検索する。使い方: npm run food -- <キーワード> [キーワード...]
// 例: npm run food -- 鶏 もも 皮つき
// すべてのキーワードを含む食品を、食品番号・食品名・100gあたりの値で表示する(空白・全角半角の違いは無視)。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_PATH } from './build-food-data.mjs';

const norm = (s) => String(s).normalize('NFKC').replace(/\s+/g, '').toLowerCase();
// ひらがなとカタカナの違いも無視する(例: 「たまねぎ」で「たまねぎ」「タマネギ」の両方)
const kana = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

export function searchFoods(foods, keywords, limit = 30) {
  const ks = keywords.map((k) => kana(norm(k))).filter(Boolean);
  if (!ks.length) return [];
  return Object.entries(foods)
    .filter(([code, f]) => {
      const name = kana(norm(f.name));
      return ks.every((k) => name.includes(k) || code === k);
    })
    .slice(0, limit)
    .map(([code, f]) => ({ code, ...f }));
}

function main() {
  const keywords = process.argv.slice(2);
  if (!keywords.length) {
    console.error('使い方: npm run food -- <キーワード> [キーワード...]');
    process.exit(1);
  }
  const { foods } = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const hits = searchFoods(foods, keywords, 50);
  if (!hits.length) {
    console.log('見つかりませんでした。キーワードを短くするか、別の呼び方で検索してください。');
    return;
  }
  const v = (x) => (x === null ? '-' : x);
  console.log('食品番号 | 食品名 | 100gあたり: エネルギー(kcal) たんぱく質 脂質 炭水化物 食塩相当量(g) | 廃棄率');
  for (const f of hits) {
    console.log(`${f.code} | ${f.name} | ${v(f.energy)} ${v(f.protein)} ${v(f.fat)} ${v(f.carbohydrate)} ${v(f.salt)} | ${f.refuse}%`);
  }
  if (hits.length === 50) console.log('(50件まで表示。キーワードを足して絞り込んでください)');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
