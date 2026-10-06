import test from 'node:test';
import assert from 'node:assert/strict';
import { formatNutrient, NUTRIENTS, nutritionCoverage, nutritionPerServing, roundNutrition } from '../src/lib/nutrition.mjs';

const foods = {
  '00001': { name: 'A', refuse: 0, energy: 100, protein: 10, fat: 5, carbohydrate: 20, salt: 1 },
  '00002': { name: 'B', refuse: 0, energy: 50, protein: null, fat: 0, carbohydrate: 0, salt: 0.5 },
};

test('材料の合計を人数で割る', () => {
  const n = nutritionPerServing(
    { servings: 2, ingredients: [{ food: '00001', grams: 200 }, { food: '-' }] },
    foods,
  );
  assert.deepEqual(n, { energy: 100, protein: 10, fat: 5, carbohydrate: 20, salt: 1 });
});

test('未測定の成分を含む食品を使うと、その成分だけ null', () => {
  const n = nutritionPerServing(
    { servings: 1, ingredients: [{ food: '00001', grams: 100 }, { food: '00002', grams: 100 }] },
    foods,
  );
  assert.equal(n.protein, null);
  assert.equal(n.energy, 150);
});

test('一部の材料にだけ food がある・食品が無い・grams が無い場合は計算しない', () => {
  const s = (ingredients) => nutritionPerServing({ servings: 1, ingredients }, foods);
  assert.equal(s([{ food: '00001', grams: 100 }, { name: 'x' }]), null);
  assert.equal(s([{ food: '99999', grams: 100 }]), null);
  assert.equal(s([{ food: '00001' }]), null);
  assert.equal(nutritionCoverage([{ name: 'x' }]), 'none');
  assert.equal(nutritionCoverage([{ food: '-' }, { name: 'x' }]), 'partial');
});

test('丸め: エネルギーは整数、他は小数1桁', () => {
  const r = roundNutrition({ energy: 123.5, protein: 1.25, fat: 0.05, carbohydrate: 2.349, salt: null });
  assert.deepEqual(r, { energy: 124, protein: 1.3, fat: 0.1, carbohydrate: 2.3, salt: null });
  assert.equal(roundNutrition(null), null);
});

test('表示用の文字列', () => {
  const [energy, protein] = NUTRIENTS;
  assert.equal(formatNutrient(312, energy), '312kcal');
  assert.equal(formatNutrient(12, protein), '12.0g');
  assert.equal(formatNutrient(null, protein), '-');
});
