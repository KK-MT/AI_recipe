import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkRecipe, checkDuplicates, loadRecipes } from './validate-recipes.mjs';

// 画像ファイルがある状態を作るための一時の public ディレクトリ
const publicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-'));
fs.mkdirSync(path.join(publicDir, 'images/recipes'), { recursive: true });
fs.writeFileSync(path.join(publicDir, 'images/recipes/ok.webp'), 'x');

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
    image: { src: '/images/recipes/ok.webp', alt: '説明', aiGenerated: true },
  },
});
const errors = (r) => checkRecipe(r, { publicDir }).filter((x) => x.level === 'error').map((x) => x.msg);

test('正常なレシピはエラーなし', () => assert.deepEqual(errors(base()), []));

test('同梱のレシピは、画像の生成待ち以外のエラーがない', () => {
  for (const r of loadRecipes()) {
    const e = errors(r).filter((m) => !m.includes('画像ファイルが見つかりません'));
    assert.deepEqual(e, [], r.slug);
  }
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

test('shopping: 正常なキーワードはエラーなし', () => {
  const r = base();
  r.data.shopping = [{ label: '落とし蓋', keyword: '落とし蓋 ステンレス' }];
  assert.deepEqual(errors(r), []);
});

test('shopping: 4件以上・空・長すぎる・URL・禁止表現はエラー', () => {
  const r = base();
  r.data.shopping = [
    { label: 'a', keyword: 'b' },
    { label: 'a', keyword: 'b' },
    { label: 'a', keyword: 'b' },
    { label: '', keyword: 'b' },
  ];
  const e = errors(r);
  assert.ok(e.some((m) => m.includes('最大3件')));
  assert.ok(e.some((m) => m.includes('label が空')));
  r.data.shopping = [{ label: 'あ'.repeat(31), keyword: 'https://example.com/x' }];
  const e2 = errors(r);
  assert.ok(e2.some((m) => m.includes('30字以内')));
  assert.ok(e2.some((m) => m.includes('URLは書けません')));
  r.data.shopping = [{ label: '病気が治る', keyword: 'お茶' }];
  assert.ok(errors(r).some((m) => m.includes('禁止表現')));
});

test('slug・タイトルの重複を検出する', () => {
  const a = base();
  const b = { ...base(), slug: 'other' };
  assert.equal(checkDuplicates([a, b]).length, 1);
  assert.equal(checkDuplicates([a, { ...a }]).length, 2);
});
