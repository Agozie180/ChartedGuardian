import { z } from "zod";
import { ProductSchema } from "../policy/schema.ts";

export const TradeIntentInputSchema = z
  .object({
    intent_id: z.string().min(1).optional(),
    timestamp: z.string().min(1).optional(),
    agent_id: z.string().min(1).optional(),
    product: ProductSchema,
    asset: z.string().min(1).optional(),
    symbol: z.string().min(1).optional(),
    side: z.enum(["BUY", "SELL"]),
    type: z.enum(["MARKET", "LIMIT"]).optional(),
    amount: z.number().positive().optional(),
    quantity: z.number().positive().optional(),
    quoteOrderQty: z.number().positive().optional(),
    notional_quote: z.number().positive().optional(),
    limit_price: z.number().positive().optional(),
    leverage: z.number().min(1).optional(),
    reduce_only: z.boolean().optional(),
    reason: z.string().optional(),
    rationale: z.string().optional(),
    prompt: z.string().optional(),
    source: z.enum(["fixture", "ui", "host_agent"]).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const quoteValues = [value.amount, value.quoteOrderQty, value.notional_quote].filter(
      (v): v is number => v !== undefined,
    );
    if (quoteValues.length > 1 && new Set(quoteValues).size > 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "amount, quoteOrderQty, and notional_quote must agree" });
    }
    if (value.type === "LIMIT" && value.limit_price === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "LIMIT order requires limit_price" });
    }
    if (value.quantity !== undefined && quoteValues.length > 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "quantity cannot be combined with quote-sized fields" });
    }
  });

export type TradeIntentInput = z.infer<typeof TradeIntentInputSchema>;

export type TradeIntent = {
  intent_id: string;
  timestamp: string;
  agent_id: string;
  product: z.infer<typeof ProductSchema>;
  asset: string;
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT";
  amount: number;
  quantity?: number;
  quoteOrderQty?: number;
  notional_quote: number;
  limit_price?: number;
  leverage?: number;
  reduce_only?: boolean;
  reason: string;
  prompt?: string;
  source: "fixture" | "ui" | "host_agent";
};

const STABLE = ["USDT", "USDC", "FDUSD", "TUSD", "DAI", "BUSD"] as const;

export function parseSymbol(
  symbol: string,
  quotes: readonly string[],
): { base: string; quote: string } | null {
  const upper = symbol.toUpperCase();
  const candidates = [...new Set([...quotes, ...STABLE])].sort(
    (a, b) => b.length - a.length,
  );
  for (const quote of candidates) {
    if (upper.endsWith(quote) && upper.length > quote.length) {
      return { base: upper.slice(0, -quote.length), quote };
    }
  }
  return null;
}

export function normalizeIntent(
  raw: TradeIntentInput,
  defaultQuote = "USDT",
): TradeIntent | { error: string } {
  const quoteOrderQty = raw.quoteOrderQty ?? raw.amount ?? raw.notional_quote;
  const quantity = raw.quantity;
  if (quoteOrderQty === undefined && quantity === undefined) {
    return { error: "intent needs amount, quoteOrderQty, or quantity" };
  }

  let symbol = raw.symbol?.toUpperCase();
  let asset = raw.asset?.toUpperCase();
  if (!symbol && asset) symbol = `${asset}${defaultQuote}`;
  if (!symbol) return { error: "intent needs asset or symbol" };

  const parsed = parseSymbol(symbol, [defaultQuote, ...STABLE]);
  if (!asset) asset = parsed?.base ?? symbol;

  const amount = quoteOrderQty ?? 0;
  const reason = raw.reason ?? raw.rationale ?? "";

  return {
    intent_id: raw.intent_id ?? `intent-${Date.now()}`,
    timestamp: raw.timestamp ?? new Date().toISOString(),
    agent_id: raw.agent_id ?? "demo-trader",
    product: raw.product,
    asset,
    symbol,
    side: raw.side,
    type: raw.type ?? "MARKET",
    amount,
    quantity,
    quoteOrderQty: quoteOrderQty,
    notional_quote: raw.notional_quote ?? amount,
    limit_price: raw.limit_price,
    leverage: raw.leverage,
    reduce_only: raw.reduce_only,
    reason,
    prompt: raw.prompt,
    source: raw.source ?? "ui",
  };
}
