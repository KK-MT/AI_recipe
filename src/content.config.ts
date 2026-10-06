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
    // food: 日本食品標準成分表の食品番号(5桁)。水・氷、ゆで湯の塩など計算に含めない材料は "-"
    // grams: 可食部の重さ(g)。栄養成分の計算に使う("-" のときは省略可)
    ingredients: z
      .array(
        z
          .object({
            name: z.string(),
            amount: z.string(),
            food: z.string().regex(/^(\d{5}|-)$/),
            grams: z.number().positive().optional(),
          })
          .refine((i) => i.food === '-' || i.grams !== undefined, { message: 'grams(可食部の重さ)がありません' }),
      )
      .min(1),
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
    // 使った道具・特別な材料。検索キーワードだけを書く(リンクはサイトが自動で作る)
    shopping: z
      .array(z.object({ label: z.string().min(1).max(30), keyword: z.string().min(1).max(30) }))
      .max(3)
      .optional(),
  }),
});

export const collections = { recipes };
