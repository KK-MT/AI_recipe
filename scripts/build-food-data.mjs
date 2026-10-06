// 文部科学省『日本食品標準成分表(八訂)増補2023年』の本表(Excel)から、data/food-composition.json を作る。
// 使い方: npm run food:build -- <本表のExcelのパス>
// Excel は公式ページ(https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html)の「第2章(データ)」。
// Excel 本体はコミットしない。数値を手で書き足すことはしない(必ずこのスクリプトで作り直す)。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_PATH = path.join(root, 'data/food-composition.json');

// 取り込む列(成分識別子 → JSONのキー)。列の位置ではなく、表の「成分識別子」の行で探す。
export const COLUMNS = {
  REFUSE: 'refuse', // 廃棄率(%)
  ENERC_KCAL: 'energy', // エネルギー(kcal)
  'PROT-': 'protein', // たんぱく質(g)
  'FAT-': 'fat', // 脂質(g)
  'CHOCDF-': 'carbohydrate', // 炭水化物(g)
  NACL_EQ: 'salt', // 食塩相当量(g)
};
// 整合チェックだけに使う列(JSONには入れない)
const CHECK_COLUMNS = { ENERC: 'energyKj', ALC: 'alcohol', 'FIB-': 'fiber', POLYL: 'polyol' };

// エネルギーの概算と合わないが、公式の値として正しく読めていることを確認した食品(値は公式のまま収録する)
export const ENERGY_CHECK_EXCEPTIONS = {
  '18056': '春巻き。kJ と kcal は整合し、水分・たんぱく質・脂質・炭水化物・灰分の合計も約100g(2026-10-06 確認)',
};

// 表のセルの値を数値にする。Tr(微量)は0、-(未測定)と空欄は null、括弧つき(推定値)は数値。
// 末尾の † と *(分析方法などの注記)は取り除く。
export function parseValue(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  const s = String(v).normalize('NFKC').trim().replace(/[†*]+$/, '').trim().replace(/^\((.*)\)$/, '$1').trim();
  if (s === '' || s === '-') return null;
  if (s === 'Tr') return 0;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  throw new Error(`解釈できない値です: ${JSON.stringify(v)}`);
}

export const normalizeName = (s) => String(s).normalize('NFKC').replace(/\s+/g, ' ').trim();

// 列の読み違いを見つけるための、エネルギーの大まかな整合チェック。
// 八訂のエネルギーは、アミノ酸組成のたんぱく質・利用可能炭水化物・食物繊維などから計算されるため、
// 「たんぱく質×4 + 脂質×9 + 炭水化物×4 + アルコール×7」とは一致しない。食物繊維(約2kcal/g)と
// 糖アルコール(約2.4kcal/g)だけを炭水化物から分けて概算し、大きくずれるものだけを見つける。
export function energyMismatch(f) {
  const fiber = f.fiber ?? 0;
  const polyol = f.polyol ?? 0;
  const carb = Math.max(0, (f.carbohydrate ?? 0) - fiber - polyol);
  const est = (f.protein ?? 0) * 4 + (f.fat ?? 0) * 9 + carb * 4 + fiber * 2 + polyol * 2.4 + (f.alcohol ?? 0) * 7;
  const diff = Math.abs(f.energy - est);
  return diff > Math.max(25, est * 0.25) ? { est: Math.round(est), diff: Math.round(diff) } : null;
}

const cellText = (cell) => {
  const v = cell.value;
  if (v && typeof v === 'object') {
    if (v.richText) return v.richText.map((r) => r.text).join('');
    if ('result' in v) return v.result;
  }
  return v;
};

// 「表全体」シートを読み、{ 食品番号: {...} } を返す
export async function readWorkbook(file) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets.find((s) => s.name === '表全体') ?? wb.worksheets[0];

  // 成分識別子の行を探す
  let idRow = null;
  ws.eachRow((row, r) => {
    if (idRow) return;
    const texts = row.values.map((v) => String(v ?? '').trim());
    if (texts.includes('ENERC_KCAL')) idRow = r;
  });
  if (!idRow) throw new Error('成分識別子(ENERC_KCAL)の行が見つかりません');
  const colOf = {};
  ws.getRow(idRow).eachCell((cell, c) => (colOf[String(cellText(cell)).trim()] = c));
  for (const id of [...Object.keys(COLUMNS), ...Object.keys(CHECK_COLUMNS)]) {
    if (!colOf[id]) throw new Error(`列 ${id} が見つかりません`);
  }
  // 食品番号は2列目、食品名は4列目(見出しの行で確認する)
  const header = (r, c) => String(cellText(ws.getRow(r).getCell(c)) ?? '').replace(/\s/g, '');
  let headerOk = false;
  for (let r = 1; r < idRow; r++) if (header(r, 2) === '食品番号' && header(r, 4) === '食品名') headerOk = true;
  if (!headerOk) throw new Error('食品番号・食品名の列が想定と違います');

  const foods = {};
  for (let r = idRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const code = String(cellText(row.getCell(2)) ?? '').trim();
    if (!code) continue;
    if (!/^\d{5}$/.test(code)) throw new Error(`${r}行目: 食品番号が不正です: ${code}`);
    if (foods[code]) throw new Error(`食品番号が重複しています: ${code}`);
    const food = { name: normalizeName(cellText(row.getCell(4))) };
    try {
      for (const [id, key] of Object.entries({ ...COLUMNS, ...CHECK_COLUMNS })) food[key] = parseValue(cellText(row.getCell(colOf[id])));
    } catch (e) {
      throw new Error(`${r}行目(${code}): ${e.message}`);
    }
    foods[code] = food;
  }
  return foods;
}

// 取り込んだデータの検査。問題の一覧(文字列)を返す
export function checkFoods(foods) {
  const problems = [];
  for (const [code, f] of Object.entries(foods)) {
    if (!f.name) problems.push(`${code}: 食品名が空です`);
    for (const key of Object.values(COLUMNS)) {
      if (f[key] !== null && (typeof f[key] !== 'number' || !Number.isFinite(f[key]) || f[key] < 0)) {
        problems.push(`${code} ${f.name}: ${key} が不正です(${f[key]})`);
      }
    }
    if (f.energy === null) continue;
    // kJ と kcal の整合(列の読み違いを検出する)。八訂は kJ と kcal を別の係数で計算するため、数%ずれる
    if (f.energyKj != null && Math.abs(f.energyKj / 4.184 - f.energy) > Math.max(3, f.energy * 0.06)) {
      problems.push(`${code} ${f.name}: エネルギーの kJ(${f.energyKj})と kcal(${f.energy})が合いません`);
    }
    if (ENERGY_CHECK_EXCEPTIONS[code]) continue;
    const m = energyMismatch(f);
    if (m) problems.push(`${code} ${f.name}: エネルギー ${f.energy}kcal と成分からの概算 ${m.est}kcal が大きく違います`);
  }
  return problems;
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('使い方: npm run food:build -- <本表のExcelのパス>');
    process.exit(1);
  }
  const all = await readWorkbook(file);
  const problems = checkFoods(all);
  if (problems.length) {
    console.error(problems.join('\n'));
    console.error(`\n${problems.length} 件の問題があるため、書き出しません`);
    process.exit(1);
  }
  const foods = {};
  for (const [code, f] of Object.entries(all)) {
    foods[code] = Object.fromEntries(['name', ...Object.values(COLUMNS)].map((k) => [k, f[k]]));
  }
  const meta = {
    source: '日本食品標準成分表(八訂)増補2023年',
    publisher: '文部科学省',
    url: 'https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html',
    file: path.basename(file),
    sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
    retrievedAt: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }),
    unit: '可食部100gあたり。energy: kcal、protein/fat/carbohydrate/salt: g、refuse: 廃棄率(%)。Tr は0、未測定は null、推定値(括弧つき)は数値として収録',
    count: Object.keys(foods).length,
  };
  // 食品番号の順に、1食品1行で書く(差分を読みやすくする)。
  // オブジェクトのキーの順序は数値らしい番号が先になるため、明示的に並べる
  const lines = Object.entries(foods)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, f]) => `    ${JSON.stringify(code)}: ${JSON.stringify(f)}`);
  const json = `{\n  "meta": ${JSON.stringify(meta, null, 2).replace(/\n/g, '\n  ')},\n  "foods": {\n${lines.join(',\n')}\n  }\n}\n`;
  JSON.parse(json);
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, json);
  console.log(`${meta.count} 食品を ${path.relative(root, DATA_PATH)} に書き出しました`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
