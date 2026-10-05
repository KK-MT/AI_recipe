// アフィリエイトリンクの生成。レシピには検索キーワードだけを書き、リンクはここで作る。
// IDは環境変数(Vercel)から読む。IDが未設定のサービスのリンクは作らない。

const ID_RE = /^[A-Za-z0-9._-]{3,64}$/;

// 環境変数からIDを読む。形式が不正なら、そのサービスを無効にして警告する(IDの値は出力しない)。
export function getAffiliateIds(env = process.env, warn = console.warn) {
  const pick = (name) => {
    const v = (env[name] ?? '').trim();
    if (!v) return null;
    if (!ID_RE.test(v)) {
      warn(`${name} の形式が不正なため、無効にします(英数字と . _ - のみ、3〜64文字)`);
      return null;
    }
    return v;
  };
  return { rakuten: pick('RAKUTEN_AFFILIATE_ID'), amazon: pick('AMAZON_TRACKING_ID') };
}

let cached;
// ビルド中に何度も呼ばれても、警告が1回で済むように、結果を使い回す。
export function affiliateIds() {
  cached ??= getAffiliateIds();
  return cached;
}

export const hasProvider = (ids) => Boolean(ids.rakuten || ids.amazon);

// 楽天市場の検索結果ページへのアフィリエイトリンク(hb.afl.rakuten.co.jp 経由)
export function buildRakutenUrl(keyword, id) {
  const target = `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(keyword)}/`;
  const p = encodeURIComponent(target);
  return `https://hb.afl.rakuten.co.jp/hgc/${id}/?pc=${p}&m=${p}`;
}

// Amazon の検索結果ページへのアフィリエイトリンク(トラッキングID付き)
export function buildAmazonUrl(keyword, id) {
  return `https://www.amazon.co.jp/s?k=${encodeURIComponent(keyword)}&tag=${id}`;
}

// 表示用のデータ。IDがあるサービスのリンクだけを含み、リンクが1つも無い項目は除く。
export function shoppingLinks(shopping = [], ids) {
  return shopping
    .map((item) => ({
      label: item.label,
      links: [
        ...(ids.rakuten ? [{ provider: 'rakuten', name: '楽天市場で探す', url: buildRakutenUrl(item.keyword, ids.rakuten) }] : []),
        ...(ids.amazon ? [{ provider: 'amazon', name: 'Amazonで探す', url: buildAmazonUrl(item.keyword, ids.amazon) }] : []),
      ],
    }))
    .filter((item) => item.links.length > 0);
}
