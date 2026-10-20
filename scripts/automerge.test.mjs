import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { checkFiles, checkImage, checkNewRecipe, checkPullRequest, HOLD_LABEL, slugOf } from './automerge.mjs';
import { loadRecipes } from './validate-recipes.mjs';

const now = new Date('2026-10-21T03:07:00Z'); // 12:07 JST
const pr = (over = {}) => ({
  state: 'OPEN',
  isDraft: false,
  baseRefName: 'main',
  headRefName: 'recipe/buri-teriyaki',
  isCrossRepository: false,
  labels: [],
  createdAt: '2026-10-20T21:09:00Z', // 6:09 JST
  mergeable: 'MERGEABLE',
  ...over,
});

test('ブランチ名から slug を取り出す', () => {
  assert.equal(slugOf('recipe/buri-teriyaki'), 'buri-teriyaki');
  assert.equal(slugOf('recipe/Buri'), null);
  assert.equal(slugOf('recipe/a/b'), null);
  assert.equal(slugOf('claude/x'), null);
});

test('条件を満たすPRは対象', () => {
  assert.deepEqual(checkPullRequest(pr(), { now }), { ok: true, wait: [], reasons: [] });
});

test('対象外: ドラフト・ベース違い・フォーク・ブランチ名・競合', () => {
  for (const over of [
    { isDraft: true },
    { baseRefName: 'dev' },
    { isCrossRepository: true },
    { headRefName: 'claude/ai-recipe-auto-posting-xzbctl' },
    { mergeable: 'CONFLICTING' },
  ]) {
    const r = checkPullRequest(pr(over), { now });
    assert.equal(r.ok, false, JSON.stringify(over));
    assert.ok(r.reasons.length > 0, JSON.stringify(over));
  }
});

test('待機(コメントしない): 保留ラベル・作成から4時間未満・マージ可否が未判定', () => {
  for (const over of [
    { labels: [{ name: HOLD_LABEL }] },
    { createdAt: '2026-10-21T00:00:00Z' },
    { mergeable: 'UNKNOWN' },
  ]) {
    const r = checkPullRequest(pr(over), { now });
    assert.equal(r.ok, false, JSON.stringify(over));
    assert.deepEqual(r.reasons, [], JSON.stringify(over));
    assert.equal(r.wait.length, 1, JSON.stringify(over));
  }
  // 手動実行(minAgeHours: 0)は経過時間を待たない
  assert.equal(checkPullRequest(pr({ createdAt: '2026-10-21T03:00:00Z' }), { now, minAgeHours: 0 }).ok, true);
});

test('変更ファイルの限定: レシピと画像の追加、アイデアリストの変更だけ', () => {
  const ok = [
    { filename: 'src/content/recipes/buri-teriyaki.md', status: 'added' },
    { filename: 'public/images/recipes/buri-teriyaki.webp', status: 'added' },
  ];
  assert.deepEqual(checkFiles(ok, 'buri-teriyaki'), []);
  assert.deepEqual(checkFiles([...ok, { filename: 'docs/recipe-ideas.md', status: 'modified' }], 'buri-teriyaki'), []);
  for (const extra of [
    { filename: 'scripts/validate-recipes.mjs', status: 'modified' },
    { filename: '.github/workflows/automerge.yml', status: 'modified' },
    { filename: 'src/content/recipes/nikujaga.md', status: 'modified' },
    { filename: 'src/content/recipes/other.md', status: 'added' },
    { filename: 'data/food-composition.json', status: 'modified' },
  ]) {
    assert.ok(checkFiles([...ok, extra], 'buri-teriyaki').some((m) => m.includes(extra.filename)), extra.filename);
  }
  // 既存のレシピを書き換えた(added でない)場合も対象外
  assert.ok(checkFiles([{ ...ok[0], status: 'modified' }, ok[1]], 'buri-teriyaki').length > 0);
  // 画像がない場合も対象外
  assert.ok(checkFiles([ok[0]], 'buri-teriyaki').some((m) => m.includes('.webp')));
});

test('新しいレシピは、エラー・警告とも0件でなければ対象外', () => {
  const recipes = loadRecipes();
  const ok = recipes.find((r) => r.slug === 'nikujaga');
  assert.deepEqual(checkNewRecipe(ok), []);
  // 既存の警告(ゆで湯の塩)があるレシピは、自動マージの基準では対象外になる
  assert.ok(checkNewRecipe(recipes.find((r) => r.slug === 'horenso-gomaae')).some((m) => m.startsWith('警告')));
  assert.deepEqual(checkNewRecipe(undefined), ['レシピのファイルが見つかりません']);
});

test('画像の検査: webp・幅512px以上・10KB以上', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-'));
  const noisy = (w, h) => sharp(Buffer.from(Array.from({ length: w * h * 3 }, () => Math.floor(Math.random() * 256))), { raw: { width: w, height: h, channels: 3 } });
  const good = path.join(dir, 'good.webp');
  await noisy(600, 400).webp({ quality: 90 }).toFile(good);
  assert.deepEqual(await checkImage(good), []);
  const small = path.join(dir, 'small.webp');
  await noisy(300, 200).webp({ quality: 90 }).toFile(small);
  assert.ok((await checkImage(small)).some((m) => m.includes('512px')));
  const png = path.join(dir, 'x.webp');
  await noisy(600, 400).png().toFile(png);
  assert.ok((await checkImage(png)).some((m) => m.includes('webp ではありません')));
  assert.ok((await checkImage(path.join(dir, 'none.webp'))).some((m) => m.includes('画像がありません')));
});
