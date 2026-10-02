// 自動投稿の判断材料を表示する。使い方: node scripts/recipe-status.mjs [--json]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRecipes } from './validate-recipes.mjs';

// 日本時間(JST)の日付 YYYY-MM-DD
export function jstToday(now = new Date()) {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

export function seasonOf(month) {
  if (month >= 3 && month <= 5) return '春';
  if (month >= 6 && month <= 8) return '夏';
  if (month >= 9 && month <= 11) return '秋';
  return '冬';
}

const dateOf = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

export function summarize(recipes, today) {
  const dates = recipes.map((r) => dateOf(r.data.publishedAt)).sort();
  const latest = dates.at(-1) ?? null;
  const tagCounts = {};
  for (const r of recipes) for (const t of r.data.tags ?? []) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
  const month = Number(today.slice(5, 7));
  const daysSinceLatest = latest ? daysBetween(latest, today) : null;
  return {
    today,
    month,
    season: seasonOf(month),
    count: recipes.length,
    latestPublishedAt: latest,
    daysSinceLatest,
    twoDaysPassed: daysSinceLatest === null ? true : daysSinceLatest >= 2,
    tagCounts: Object.fromEntries(Object.entries(tagCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))),
    recipes: recipes.map((r) => ({ slug: r.slug, title: r.data.title })),
  };
}

function format(s) {
  return [
    `今日(JST): ${s.today}`,
    `季節の目安: ${s.season}(${s.month}月)`,
    `レシピ数: ${s.count}`,
    `最新の公開日: ${s.latestPublishedAt ?? 'なし'}(${s.daysSinceLatest ?? '-'}日前)`,
    `最新から2日以上たっている: ${s.twoDaysPassed ? 'はい' : 'いいえ'}`,
    `タグ別件数: ${Object.entries(s.tagCounts).map(([t, n]) => `${t} ${n}`).join(' / ')}`,
    '既存レシピ:',
    ...s.recipes.map((r) => `- ${r.slug}: ${r.title}`),
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const s = summarize(loadRecipes(), jstToday());
  console.log(process.argv.includes('--json') ? JSON.stringify(s, null, 2) : format(s));
}
