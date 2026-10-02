import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { buildPrompt, findPending, requestImage, run } from './generate-images.mjs';

const KEY = 'sk-test-secret-key-123456';
const recipe = (slug, prompt = '湯気の立つ肉じゃが') => ({
  slug,
  data: { image: { src: `/images/recipes/${slug}.webp`, alt: 'a', aiGenerated: true, ...(prompt ? { prompt } : {}) } },
});
const png = () => sharp({ create: { width: 64, height: 48, channels: 3, background: '#c96' } }).png().toBuffer();
const okFetch = (calls = []) => async (url, init) => {
  calls.push({ url, init });
  return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: (await png()).toString('base64') }] }) };
};
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'img-'));

test('プロンプトに共通スタイルが付く', () => {
  const p = buildPrompt('肉じゃが');
  assert.ok(p.startsWith('肉じゃが') && p.includes('文字・ロゴ'));
});

test('禁止語を含むプロンプトは拒否する', () => {
  assert.throws(() => buildPrompt('マクドナルド風のハンバーガー'), /使えない語/);
});

test('findPending: 生成済みとプロンプト無しは対象外', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'images/recipes'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'images/recipes/done.webp'), 'x');
  const list = findPending([recipe('done'), recipe('new'), recipe('noprompt', null)], dir);
  assert.deepEqual(list.map((r) => r.slug), ['new']);
});

test('run: 生成して webp を保存し、limit を守る。再実行は何もしない', async () => {
  const dir = tmp();
  const calls = [];
  const recipes = [recipe('a'), recipe('b'), recipe('c')];
  const r1 = await run({ recipes, apiKey: KEY, limit: 2, fetchImpl: okFetch(calls), publicDir: dir, log: () => {} });
  assert.deepEqual(r1.generated, ['a', 'b']);
  assert.equal(r1.remaining, 1);
  assert.equal(calls.length, 2);
  const meta = await sharp(path.join(dir, 'images/recipes/a.webp')).metadata();
  assert.equal(meta.format, 'webp');
  const r2 = await run({ recipes: [recipe('a'), recipe('b')], apiKey: KEY, fetchImpl: okFetch(calls), publicDir: dir, log: () => {} });
  assert.equal(r2.generated.length, 0);
  assert.equal(calls.length, 2);
});

test('リクエストにキーとモデルが入る', async () => {
  const calls = [];
  await requestImage({ prompt: 'p', apiKey: KEY, model: 'gpt-image-1', fetchImpl: okFetch(calls) });
  assert.equal(calls[0].url, 'https://api.openai.com/v1/images/generations');
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${KEY}`);
  assert.equal(JSON.parse(calls[0].init.body).model, 'gpt-image-1');
});

test('失敗しても残りを続け、ログにキーが出ない', async () => {
  const dir = tmp();
  const logs = [];
  const badFetch = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: `Incorrect API key: ${KEY}` } }) });
  const r = await run({ recipes: [recipe('a'), recipe('b')], apiKey: KEY, fetchImpl: badFetch, publicDir: dir, log: (m) => logs.push(m) });
  assert.deepEqual(r.failed, ['a', 'b']);
  assert.ok(!logs.join('\n').includes(KEY));
  assert.ok(logs.join('\n').includes('***'));
});

test('応答が返らないときはタイムアウトで失敗する', async () => {
  const slow = (url, init) =>
    new Promise((_, reject) => {
      const keepAlive = setTimeout(() => {}, 5000); // テスト中にイベントループが空にならないように
      init.signal.addEventListener('abort', () => {
        clearTimeout(keepAlive);
        reject(init.signal.reason);
      });
    });
  await assert.rejects(requestImage({ prompt: 'p', apiKey: KEY, fetchImpl: slow, timeoutMs: 20 }), /タイムアウト/);
});
