import test from 'node:test';
import assert from 'node:assert/strict';
import { jstToday, daysBetween, seasonOf, summarize } from './recipe-status.mjs';

const r = (slug, date, tags) => ({ slug, data: { title: `題名${slug}`, publishedAt: date, tags } });

test('日本時間の日付: UTC の夜は翌日になる', () => {
  assert.equal(jstToday(new Date('2026-10-01T20:00:00Z')), '2026-10-02');
  assert.equal(jstToday(new Date('2026-10-01T14:59:00Z')), '2026-10-01');
});

test('日数の差: 月またぎ', () => {
  assert.equal(daysBetween('2026-10-31', '2026-11-02'), 2);
  assert.equal(daysBetween('2026-10-02', '2026-10-02'), 0);
});

test('季節の目安', () => {
  assert.deepEqual([1, 4, 7, 10, 12].map(seasonOf), ['冬', '春', '夏', '秋', '冬']);
});

test('summarize: 最新日・経過日数・タグ件数', () => {
  const s = summarize(
    [r('a', new Date('2026-09-30T00:00:00Z'), ['和食', '主菜']), r('b', '2026-10-01', ['和食'])],
    '2026-10-02',
  );
  assert.equal(s.latestPublishedAt, '2026-10-01');
  assert.equal(s.daysSinceLatest, 1);
  assert.equal(s.twoDaysPassed, false);
  assert.deepEqual(s.tagCounts, { 和食: 2, 主菜: 1 });
  assert.equal(summarize([r('a', '2026-09-30', [])], '2026-10-02').twoDaysPassed, true);
});

test('summarize: レシピが無いときは実行してよい', () => {
  const s = summarize([], '2026-10-02');
  assert.equal(s.twoDaysPassed, true);
  assert.equal(s.latestPublishedAt, null);
});
