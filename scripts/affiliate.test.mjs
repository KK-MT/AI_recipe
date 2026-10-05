import test from 'node:test';
import assert from 'node:assert/strict';
import { getAffiliateIds, hasProvider, buildRakutenUrl, buildAmazonUrl, shoppingLinks } from '../src/lib/affiliate.mjs';

const none = { rakuten: null, amazon: null };
const items = [{ label: '落とし蓋', keyword: '落とし蓋 ステンレス' }];

test('IDが未設定なら、サービスは無効', () => {
  assert.deepEqual(getAffiliateIds({}), none);
  assert.equal(hasProvider(none), false);
});

test('IDを読む。前後の空白は除く', () => {
  const ids = getAffiliateIds({ RAKUTEN_AFFILIATE_ID: ' abc123.def ', AMAZON_TRACKING_ID: 'shop-22' });
  assert.deepEqual(ids, { rakuten: 'abc123.def', amazon: 'shop-22' });
  assert.equal(hasProvider(ids), true);
});

test('形式が不正なIDは無効にして警告し、値は出力しない', () => {
  const logs = [];
  const ids = getAffiliateIds({ RAKUTEN_AFFILIATE_ID: 'bad id"><script>' }, (m) => logs.push(m));
  assert.equal(ids.rakuten, null);
  assert.equal(logs.length, 1);
  assert.ok(!logs[0].includes('script'));
});

test('楽天のURL: 検索URLがエンコードされて含まれる', () => {
  const url = buildRakutenUrl('落とし蓋 ステンレス', 'abc123');
  assert.ok(url.startsWith('https://hb.afl.rakuten.co.jp/hgc/abc123/?pc='));
  const pc = new URL(url).searchParams.get('pc');
  assert.equal(pc, `https://search.rakuten.co.jp/search/mall/${encodeURIComponent('落とし蓋 ステンレス')}/`);
  assert.equal(new URL(url).searchParams.get('m'), pc);
});

test('AmazonのURL: キーワードとタグ', () => {
  const u = new URL(buildAmazonUrl('卵焼き器 & 巻きす', 'shop-22'));
  assert.equal(u.hostname, 'www.amazon.co.jp');
  assert.equal(u.searchParams.get('k'), '卵焼き器 & 巻きす');
  assert.equal(u.searchParams.get('tag'), 'shop-22');
});

test('shoppingLinks: IDがあるサービスだけ。IDが無ければ空', () => {
  assert.deepEqual(shoppingLinks(items, none), []);
  const r = shoppingLinks(items, { rakuten: 'abc123', amazon: null });
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].links.map((l) => l.provider), ['rakuten']);
  const both = shoppingLinks(items, { rakuten: 'abc123', amazon: 'shop-22' });
  assert.deepEqual(both[0].links.map((l) => l.provider), ['rakuten', 'amazon']);
  assert.deepEqual(shoppingLinks(undefined, { rakuten: 'abc123', amazon: null }), []);
});
