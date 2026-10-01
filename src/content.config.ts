import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const allergens = z.enum(['えび', 'かに', '小麦', 'そば', '卵', '乳', '落花生']);

const recipes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/recipes' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    publishedAt: z.coerce.date(),
    servings: z.number().int().positive(),
    prepMinutes: z.number().int().nonnegative(),
    cookMinutes: z.number().int().nonnegative(),
    ingredients: z.array(z.object({ name: z.string(), amount: z.string() })).min(1),
    steps: z.array(z.string()).min(1),
    tags: z.array(z.string()),
    // 特定原材料7品目のうち使うもの。使わない場合は空配列
    allergens: z.array(allergens),
    tips: z.string(),
    // AI生成の明記を強制する(true 以外はビルドエラー)
    aiGenerated: z.literal(true),
    image: z.object({
      src: z.string(),
      alt: z.string(),
      aiGenerated: z.literal(true),
      // 画像生成用の見た目の説明(画像が未生成のレシピのみ。GitHub Actions が使う)
      prompt: z.string().optional(),
    }),
    affiliate: z
      .array(
        z.object({
          label: z.string(),
          url: z.string().url(),
          provider: z.enum(['amazon', 'rakuten']),
        }),
      )
      .optional(),
  }),
});

export const collections = { recipes };
