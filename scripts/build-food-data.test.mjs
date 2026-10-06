import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkFoods, DATA_PATH, energyMismatch, normalizeName, parseValue } from './build-food-data.mjs';

test('セルの値の解釈: Tr は0、- と空欄は null、括弧・注記つきは数値', () => {
  assert.equal(parseValue(12.5), 12.5);
  assert.equal(parseValue('12.5'), 12.5);
  assert.equal(parseValue('(11.3)'), 11.3);
  assert.equal(parseValue('Tr'), 0);
  assert.equal(parseValue('(Tr)'), 0);
  assert.equal(parseValue('(0)'), 0);
  assert.equal(parseValue('-'), null);
  assert.equal(parseValue(''), null);
  assert.equal(parseValue(null), null);
  assert.equal(parseValue('14.0†'), 14);
  assert.equal(parseValue('3.4*'), 3.4);
  assert.throws(() => parseValue('abc'));
});

test('食品名の空白を整える', () => {
  assert.equal(normalizeName('＜畜肉類＞　ぶた　［大型種肉］ '), '<畜肉類> ぶた [大型種肉]');
});

test('エネルギーの整合チェックは、列の読み違い(kJ と kcal・脂質と炭水化物の取り違え)を見つける', () => {
  const ok = { energy: 156, energyKj: 663, protein: 2.5, fat: 0.3, carbohydrate: 37.1, fiber: 1.5, polyol: null, alcohol: null };
  assert.equal(energyMismatch(ok), null);
  assert.deepEqual(checkFoods({ '01088': { name: 'めし', refuse: 0, salt: 0, ...ok } }), []);
  // kJ を kcal の列として読んだ
  const swapped = { ...ok, energy: 663 };
  assert.ok(energyMismatch(swapped));
  assert.equal(checkFoods({ '01088': { name: 'めし', refuse: 0, salt: 0, ...swapped } }).length, 2);
  // 脂質と炭水化物を取り違えた
  assert.ok(energyMismatch({ ...ok, fat: 37.1, carbohydrate: 0.3 }));
});

test('同梱のデータ: 公式の食品数、値の形式、既知の食品の値', () => {
  const { meta, foods } = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  assert.equal(meta.source, '日本食品標準成分表(八訂)増補2023年');
  assert.equal(Object.keys(foods).length, 2538);
  assert.equal(meta.count, 2538);
  for (const [code, f] of Object.entries(foods)) {
    assert.match(code, /^\d{5}$/);
    for (const k of ['refuse', 'energy', 'protein', 'fat', 'carbohydrate', 'salt']) {
      assert.ok(f[k] === null || (typeof f[k] === 'number' && f[k] >= 0), `${code} ${k}`);
    }
  }
  // 公式Excelのセルの値と照合済みの食品
  assert.deepEqual(foods['01088'], { name: 'こめ [水稲めし] 精白米 うるち米', refuse: 0, energy: 156, protein: 2.5, fat: 0.3, carbohydrate: 37.1, salt: 0 });
  assert.deepEqual(foods['17007'], { name: '<調味料類> (しょうゆ類) こいくちしょうゆ', refuse: 0, energy: 76, protein: 7.7, fat: 0, carbohydrate: 7.9, salt: 14.5 });
});
