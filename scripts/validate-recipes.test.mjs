import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRecipe, checkDuplicates, checkLink, loadRecipes } from './validate-recipes.mjs';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');

const base = () => ({
  slug: 'ok',
  body: '',
  data: {
    title: 'テスト',
    description: '説明',
    publishedAt: '2026-10-01',
    servings: 2,
    prepMinutes: 5,
    cookMinutes: 5,
    ingredients: [{ name: 'じゃがいも', amount: '2個' }],
    steps: ['茹でる。'],
    tags: ['和食'],
    allergens: [],
    tips: 'コツ',
    aiGenerated: true,
    image: { src: '/images/recipes/sample-nikujaga.svg', alt: '説明', aiGenerated: true },
  },
});
const errors = (r) => checkRecipe(r, { publicDir }).filter((x) => x.level === 'error').map((x) => x.msg);

test('正常なレシピはエラーなし', () => assert.deepEqual(errors(base()), []));

test('サンプルレシピは合格する', () => {
  for (const r of loadRecipes()) assert.deepEqual(errors(r), [], r.slug);
});

test('aiGenerated が true でないとエラー', () => {
  const r = base();
  r.data.aiGenerated = false;
  assert.ok(errors(r).some((m) => m.includes('aiGenerated')));
});

test('image.aiGenerated が無いとエラー', () => {
  const r = base();
  delete r.data.image.aiGenerated;
  assert.ok(errors(r).some((m) => m.includes('image.aiGenerated')));
});

test('画像ファイルが無いとエラー', () => {
  const r = base();
  r.data.image.src = '/images/recipes/none.webp';
  assert.ok(errors(r).some((m) => m.includes('画像ファイルが見つかりません')));
});

test('alt が空だとエラー', () => {
  const r = base();
  r.data.image.alt = ' ';
  assert.ok(errors(r).some((m) => m.includes('alt')));
});

test('禁止表現を検出する', () => {
  const r = base();
  r.data.tips = '食べると病気が治る';
  assert.ok(errors(r).some((m) => m.includes('禁止表現')));
});

test('アレルゲンの申告漏れを検出する', () => {
  const r = base();
  r.data.ingredients.push({ name: '薄力粉', amount: '50g' }, { name: '卵', amount: '1個' });
  const e = errors(r);
  assert.ok(e.some((m) => m.includes('「小麦」')));
  assert.ok(e.some((m) => m.includes('「卵」')));
  r.data.allergens = ['小麦', '卵'];
  assert.deepEqual(errors(r), []);
});

test('加熱の記述が無いと警告', () => {
  const r = base();
  r.data.ingredients.push({ name: '鶏もも肉', amount: '200g' });
  r.data.steps = ['盛り付ける。'];
  const w = checkRecipe(r, { publicDir }).filter((x) => x.level === 'warn');
  assert.equal(w.length, 1);
});

test('アフィリエイトのドメイン・https を検査する', () => {
  const r = base();
  r.data.affiliate = [
    { label: 'a', url: 'https://example.com/x', provider: 'amazon' },
    { label: 'b', url: 'http://www.amazon.co.jp/x', provider: 'amazon' },
    { label: 'c', url: 'https://www.amazon.co.jp/x', provider: 'amazon' },
  ];
  const e = errors(r);
  assert.equal(e.filter((m) => m.includes('ドメイン')).length, 1);
  assert.equal(e.filter((m) => m.includes('https ではありません')).length, 1);
});

test('slug・タイトルの重複を検出する', () => {
  const a = base();
  const b = { ...base(), slug: 'other' };
  assert.equal(checkDuplicates([a, b]).length, 1);
  assert.equal(checkDuplicates([a, { ...a }]).length, 2);
});

test('リンク疎通: 404 はエラー、403/タイムアウトは警告、200 は問題なし', async () => {
  const mk = (status) => async () => ({ status });
  assert.equal((await checkLink('https://x', mk(404))).level, 'error');
  assert.equal((await checkLink('https://x', mk(503))).level, 'warn');
  assert.equal(await checkLink('https://x', mk(200)), null);
  const dns = async () => { throw Object.assign(new Error('x'), { cause: { code: 'ENOTFOUND' } }); };
  assert.equal((await checkLink('https://x', dns)).level, 'error');
  const to = async () => { throw Object.assign(new Error('x'), { name: 'TimeoutError' }); };
  assert.equal((await checkLink('https://x', to)).level, 'warn');
});
