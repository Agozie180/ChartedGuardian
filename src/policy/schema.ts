import { z } from "zod";

export const ProductSchema = z.enum([
  "SPOT",
  "MARGIN",
  "FUTURES_USDT",
  "FUTURES_COIN",
  "CONVERT",
  "TRANSFER",
]);
export type Product = z.infer<typeof ProductSchema>;

export const CountingRuleIdSchema = z.enum([
  "rule.product",
  "rule.quote",
  "rule.asset",
  "rule.leverage",
  "rule.override",
  "rule.exposure",
  "rule.daily_loss",
  "rule.drift",
]);
export type CountingRuleId = z.infer<typeof CountingRuleIdSchema>;

export const PolicySchema = z
  .object({
    version: z.number().int().min(1),
    charter_text: z.string().min(1),
    compiled_at: z.string().min(1),
    compiler: z.enum(["fixture", "llm"]),
    allowed_assets: z.array(z.string().min(1)).min(1),
    allowed_products: z.array(z.literal("SPOT")).min(1),
    allowed_quote_assets: z.array(z.string().min(1)).min(1),
    max_position_pct: z.number().gt(0).max(100),
    max_leverage: z.number().min(1),
    max_daily_loss_pct: z.number().min(0).max(100),
    max_violations: z.number().int().min(1),
    quarantine_enabled: z.boolean(),
    quarantine_counts_from: z.array(CountingRuleIdSchema).min(1),
    fail_closed: z.literal(true),
    dust_usdt: z.number().min(0),
  })
  .strict();

export type Policy = z.infer<typeof PolicySchema>;
