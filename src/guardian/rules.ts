import type { Policy } from "../policy/schema.ts";
import { parseSymbol, type TradeIntent } from "../intent/schema.ts";
import type { AccountSnapshot } from "../snapshot/schema.ts";

export type Hit = { id: string; reason: string };

const OVERRIDE_RE =
  /\b(ignore(?:\s+the)?\s+charter|ignore(?:\s+the)?\s+policy|override(?:\s+the)?\s+(?:charter|policy|rules)|jailbreak|disobey|forget(?:\s+the)?\s+rules|buy\s+now\s+anyway)\b/i;

const STABLES = new Set(["USDT", "USDC", "FDUSD", "TUSD", "DAI", "BUSD"]);

export function isStable(asset: string): boolean {
  return STABLES.has(asset.toUpperCase());
}

export function navOf(snapshot: AccountSnapshot): number {
  let nav = 0;
  for (const [asset, qty] of Object.entries(snapshot.balances)) {
    if (!Number.isFinite(qty) || qty === 0) continue;
    if (asset.toUpperCase() === snapshot.quote.toUpperCase() || isStable(asset)) {
      nav += qty;
      continue;
    }
    const mark = snapshot.marks[asset] ?? snapshot.marks[`${asset}${snapshot.quote}`];
    if (mark === undefined || !Number.isFinite(mark)) return Number.NaN;
    nav += qty * mark;
  }
  return nav;
}

export function assetValue(snapshot: AccountSnapshot, asset: string): number {
  const qty = snapshot.balances[asset] ?? 0;
  if (qty === 0) return 0;
  if (isStable(asset) || asset === snapshot.quote) return qty;
  const mark = snapshot.marks[asset] ?? snapshot.marks[`${asset}${snapshot.quote}`];
  if (mark === undefined) return Number.NaN;
  return qty * mark;
}

export function notional(intent: TradeIntent, snapshot: AccountSnapshot): number | null {
  if (intent.quoteOrderQty !== undefined) return intent.quoteOrderQty;
  if (intent.notional_quote) return intent.notional_quote;
  if (intent.quantity !== undefined) {
    const mark =
      snapshot.marks[intent.asset] ?? snapshot.marks[intent.symbol] ?? snapshot.marks[`${intent.asset}${snapshot.quote}`];
    if (mark === undefined) return null;
    return intent.quantity * mark;
  }
  if (intent.amount) return intent.amount;
  return null;
}

export function checkProduct(policy: Policy, intent: TradeIntent): Hit | null {
  if (intent.product !== "SPOT" || !policy.allowed_products.includes("SPOT")) {
    return {
      id: "rule.product",
      reason: `product_not_allowed: ${intent.product} is not in the Charter (spot only).`,
    };
  }
  return null;
}

export function checkQuote(policy: Policy, intent: TradeIntent): Hit | null {
  const parsed = parseSymbol(intent.symbol, policy.allowed_quote_assets);
  if (!parsed) {
    return { id: "rule.quote", reason: `cannot parse symbol ${intent.symbol}` };
  }
  if (!policy.allowed_quote_assets.some((quote) => quote.toUpperCase() === parsed.quote)) {
    return {
      id: "rule.quote",
      reason: `quote asset ${parsed.quote} is not allowed (Charter quotes: ${policy.allowed_quote_assets.join(", ")}).`,
    };
  }
  return null;
}

export function checkAsset(policy: Policy, intent: TradeIntent): Hit | null {
  const parsed = parseSymbol(intent.symbol, policy.allowed_quote_assets);
  const base = parsed?.base ?? intent.asset;
  if (!policy.allowed_assets.some((asset) => asset.toUpperCase() === base)) {
    return {
      id: "rule.asset",
      reason: `asset_not_allowed: ${base} is not in the Charter.`,
    };
  }
  return null;
}

export function checkLeverage(policy: Policy, intent: TradeIntent): Hit | null {
  const leveragedProduct =
    intent.product === "MARGIN" ||
    intent.product === "FUTURES_USDT" ||
    intent.product === "FUTURES_COIN" ||
    intent.reduce_only === true;
  const lev = intent.leverage ?? 1;
  if (lev > policy.max_leverage || (policy.max_leverage <= 1 && leveragedProduct)) {
    return {
      id: "rule.leverage",
      reason: `leverage_not_allowed: leverage ${lev}x / product ${intent.product} exceeds max_leverage ${policy.max_leverage}.`,
    };
  }
  return null;
}

export function checkOverride(intent: TradeIntent): Hit | null {
  const text = `${intent.prompt ?? ""} ${intent.reason}`.trim();
  if (!text) return null;
  // Remove only an explicitly negated "ignore/override" phrase. Do not let that
  // exemption hide another override instruction later in the same intent.
  const withoutNegatedPhrase = text.replace(
    /\b(?:do\s+not|don't|dont|never)\b.{0,24}\b(?:ignore|override|disobey)\b/gi,
    "",
  );
  if (OVERRIDE_RE.test(withoutNegatedPhrase)) {
    return {
      id: "rule.override",
      reason: "User instruction conflicts with Charter.",
    };
  }
  return null;
}

export function checkExposure(
  policy: Policy,
  intent: TradeIntent,
  snapshot: AccountSnapshot,
): { hit: Hit | null; nav: number; currentPct: number; projectedPct: number } {
  const nav = navOf(snapshot);
  if (!Number.isFinite(nav) || nav <= 0) {
    return {
      hit: { id: "rule.fail_closed.nav_zero", reason: "NAV is missing or zero; fail-closed BLOCK." },
      nav: Number.isFinite(nav) ? nav : 0,
      currentPct: 0,
      projectedPct: 0,
    };
  }
  const n = notional(intent, snapshot);
  if (n === null) {
    return {
      hit: { id: "rule.fail_closed.notional", reason: "Cannot compute notional; fail-closed BLOCK." },
      nav,
      currentPct: 0,
      projectedPct: 0,
    };
  }
  const parsed = parseSymbol(intent.symbol, policy.allowed_quote_assets);
  const base = parsed?.base ?? intent.asset;
  if (isStable(base)) {
    return { hit: null, nav, currentPct: 0, projectedPct: 0 };
  }
  const current = assetValue(snapshot, base);
  if (!Number.isFinite(current)) {
    return {
      hit: { id: "rule.fail_closed.snapshot", reason: `Missing mark price for ${base}; fail-closed BLOCK.` },
      nav,
      currentPct: 0,
      projectedPct: 0,
    };
  }
  const currentPct = (current / nav) * 100;
  const projectedValue =
    intent.side === "BUY" ? current + n : Math.max(0, current - n);
  const projectedPct = (projectedValue / nav) * 100;
  if (intent.side === "BUY" && projectedPct > policy.max_position_pct) {
    return {
      hit: {
        id: "rule.exposure",
        reason: `position_limit_exceeded: ${base} would be ${projectedPct.toFixed(2)}% of NAV (max ${policy.max_position_pct}%).`,
      },
      nav,
      currentPct,
      projectedPct,
    };
  }
  return { hit: null, nav, currentPct, projectedPct };
}

export function checkDailyLoss(policy: Policy, intent: TradeIntent, snapshot: AccountSnapshot): Hit | null {
  if (policy.max_daily_loss_pct <= 0) return null;
  const nav = navOf(snapshot);
  const start = snapshot.starting_nav_today;
  if (!Number.isFinite(nav) || !Number.isFinite(start) || start <= 0) {
    return { id: "rule.fail_closed.snapshot", reason: "Cannot compute daily loss; fail-closed BLOCK." };
  }
  const lossPct = ((start - nav) / start) * 100;
  if (intent.side === "BUY" && lossPct >= policy.max_daily_loss_pct) {
    return {
      id: "rule.daily_loss",
      reason: `daily_loss_limit_exceeded: ${lossPct.toFixed(2)}% >= ${policy.max_daily_loss_pct}%.`,
    };
  }
  return null;
}

export type PastIntent = { asset: string; product: string; leverage?: number };

export function checkDrift(policy: Policy, intent: TradeIntent, recent: PastIntent[]): Hit | null {
  const window = [...recent.slice(-4), { asset: intent.asset, product: intent.product, leverage: intent.leverage }];
  let bad = 0;
  for (const item of window) {
    const assetBad = !policy.allowed_assets.some((asset) => asset.toUpperCase() === item.asset.toUpperCase());
    const productBad = item.product !== "SPOT";
    const levBad = (item.leverage ?? 1) > policy.max_leverage;
    if (assetBad || productBad || levBad) bad += 1;
  }
  if (bad >= 3) {
    return {
      id: "rule.drift",
      reason: "BEHAVIORAL_DRIFT: recent intents left the Charter (assets/products/leverage).",
    };
  }
  return null;
}
