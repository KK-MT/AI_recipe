import { defineConfig } from 'astro/config';

// サイトURL: SITE_URL > Vercel の本番URL > ローカル
const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const site = process.env.SITE_URL || (vercelUrl ? `https://${vercelUrl}` : 'http://localhost:4321');

export default defineConfig({
  site,
  output: 'static',
});
