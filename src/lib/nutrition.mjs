// 栄養成分の計算。文部科学省『日本食品標準成分表(八訂)増補2023年』の値(data/food-composition.json)から、
// レシピの材料の食品番号(food)と可食部の重さ(grams)を使って、1人分あたりの目安を計算する。
// Astro のページと、scripts/ の検証で共用する。

export const NUTRIENTS = [
  { key: 'energy', label: 'エネルギー', unit: 'kcal', digits: 0 },
  { key: 'protein', label: 'たんぱく質', unit: 'g', digits: 1 },
  { key: 'fat', label: '脂質', unit: 'g', digits: 1 },
  { key: 'carbohydrate', label: '炭水化物', unit: 'g', digits: 1 },
  { key: 'salt', label: '食塩相当量', unit: 'g', digits: 1 },
];

export const SOURCE_NAME = '日本食品標準成分表(八訂)増補2023年';

// 計算に含めない材料(水・氷、ゆで湯の塩など捨てる材料)の food の値
export const EXCLUDED = '-';

const hasFood = (i) => i.food !== undefined || i.grams !== undefined;

// 栄養成分を計算できる材料の書き方か。'all'(全材料に food と grams がある)、'none'、'partial'
export function nutritionCoverage(ingredients = []) {
  const n = ingredients.filter(hasFood).length;
  if (n === 0) return 'none';
  return n === ingredients.length ? 'all' : 'partial';
}

// 1人分あたりの値(丸める前)。計算できない場合は null。
// 成分表で未測定(null)の成分を含む食品を使った場合、その成分だけ null にする。
export function nutritionPerServing(recipe, foods) {
  const { ingredients = [], servings } = recipe;
  if (nutritionCoverage(ingredients) !== 'all' || !(servings > 0)) return null;
  const total = Object.fromEntries(NUTRIENTS.map((n) => [n.key, 0]));
  for (const i of ingredients) {
    if (i.food === EXCLUDED) continue;
    const f = foods[i.food];
    if (!f || !(i.grams > 0)) return null;
    for (const { key } of NUTRIENTS) {
      if (total[key] === null) continue;
      total[key] = f[key] === null ? null : total[key] + (i.grams * f[key]) / 100;
    }
  }
  return Object.fromEntries(Object.entries(total).map(([k, v]) => [k, v === null ? null : v / servings]));
}

// 表示用に丸める(エネルギーは整数、他は小数1桁)
export function roundNutrition(values) {
  if (!values) return null;
  return Object.fromEntries(
    NUTRIENTS.map(({ key, digits }) => {
      const v = values[key];
      if (v === null || v === undefined) return [key, null];
      const p = 10 ** digits;
      // 0.05 などが 0.0 にならないよう、浮動小数点の誤差を補正してから丸める
      return [key, Math.round(Number((v * p).toFixed(6))) / p];
    }),
  );
}

// 表示用の文字列(例: "312kcal"、"12.5g")。値が無ければ "-"
export function formatNutrient(value, { unit, digits }) {
  return value === null || value === undefined ? '-' : `${value.toFixed(digits)}${unit}`;
}
