import test from 'node:test';
import assert from 'node:assert/strict';
import { searchFoods } from './food.mjs';

const foods = {
  '06153': { name: '(たまねぎ類) たまねぎ りん茎 生' },
  '11221': { name: '<鳥肉類> にわとり [若どり・主品目] もも 皮つき 生' },
  '11224': { name: '<鳥肉類> にわとり [若どり・主品目] もも 皮なし 生' },
};

test('すべてのキーワードを含む食品を返す', () => {
  assert.deepEqual(searchFoods(foods, ['にわとり', 'もも']).map((f) => f.code), ['11221', '11224']);
  assert.deepEqual(searchFoods(foods, ['にわとり', '皮つき']).map((f) => f.code), ['11221']);
});

test('カタカナ・全角半角・空白の違いを無視する', () => {
  assert.deepEqual(searchFoods(foods, ['タマネギ']).map((f) => f.code), ['06153']);
  assert.deepEqual(searchFoods(foods, ['皮 つき']).map((f) => f.code), ['11221']);
});

test('食品番号でも探せる。キーワードが無ければ空', () => {
  assert.deepEqual(searchFoods(foods, ['11224']).map((f) => f.code), ['11224']);
  assert.deepEqual(searchFoods(foods, []), []);
});
