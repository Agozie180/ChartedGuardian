import { DEMO_SNAPSHOT } from "../trader/beats.ts";
import type { AccountSnapshot } from "../snapshot/schema.ts";
import type { BinancePort } from "./port.ts";

const MAX_AGE_MS = 30_000;
let cache: { at: number; snap: AccountSnapshot } | null = null;

/**
 * Demo NAV used ONLY when the recorded sub-account is unfunded (real balances empty),
 * so the percentage-exposure Charter rules have something to bite against. Labeled as
 * demo wherever it surfaces; the moment real balances exist, they win (see recordedSnapshot).
 */
const DEMO_NAV_USDT = 10_000;

export function invalidateSnapshotCache() {
  cache = null;
}

export function fixtureSnapshot(): AccountSnapshot {
  return { ...DEMO_SNAPSHOT, captured_at: new Date().toISOString() };
}

export function markStaleIfNeeded(snap: AccountSnapshot, now = Date.now()): AccountSnapshot {
  const captured = Date.parse(snap.captured_at);
  if (!Number.isFinite(captured) || now - captured > MAX_AGE_MS) {
    return { ...snap, ok: false, error: "snapshot older than 30s" };
  }
  return snap;
}

/**
 * Snapshot from data captured once off the live Agent OS MCP (see data/recorded/).
 * Marks are always the real captured prices. NAV/balances are real when the
 * sub-account is funded; otherwise a labeled demo NAV stands in.
 */
async function recordedSnapshot(port: BinancePort): Promise<AccountSnapshot> {
  const realBalances = await port.getBalances();
  const tickers = await port.getTickers(["BTCUSDT", "ETHUSDT", "BNBUSDT"]);
  const marks: Record<string, number> = {};
  for (const t of tickers) marks[t.symbol.replace(/USDT$/, "")] = t.lastPrice;

  const funded = realBalances.length > 0;
  const bag: Record<string, number> = funded
    ? Object.fromEntries(realBalances.map((b) => [b.asset, b.free + b.locked]))
    : { USDT: DEMO_NAV_USDT, BTC: 0, ETH: 0, BNB: 0 };

  const nav = Object.entries(bag).reduce(
    (n, [a, q]) => (a === "USDT" ? n + q : n + q * (marks[a] ?? 0)),
    0,
  );

  return {
    ok: true,
    source: "recorded_live",
    captured_at: new Date().toISOString(),
    quote: "USDT",
    balances: bag,
    marks,
    starting_nav_today: nav,
  };
}

export async function buildSnapshot(args: {
  port: BinancePort;
  mode: "live" | "replay" | "off";
}): Promise<AccountSnapshot> {
  if (cache && Date.now() - cache.at < 5_000) {
    return markStaleIfNeeded(cache.snap);
  }
  if (args.mode === "off") {
    const snap = fixtureSnapshot();
    cache = { at: Date.now(), snap };
    return snap;
  }
  if (args.mode === "replay") {
    try {
      const snap = await recordedSnapshot(args.port);
      cache = { at: Date.now(), snap };
      return snap;
    } catch (err) {
      return {
        ...fixtureSnapshot(),
        ok: false,
        source: "recorded_live",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
  try {
    const balances = await args.port.getBalances();
    const assets = balances.map((b) => b.asset).filter((a) => a !== "USDT");
    const tickers = assets.length ? await args.port.getTickers(assets.map((a) => `${a}USDT`)) : [];
    const marks: Record<string, number> = {};
    for (const t of tickers) {
      const base = t.symbol.replace(/USDT$/, "");
      marks[base] = t.lastPrice;
    }
    const bag: Record<string, number> = {};
    for (const b of balances) bag[b.asset] = b.free + b.locked;
    const snap: AccountSnapshot = {
      ok: true,
      source: "live_mcp",
      captured_at: new Date().toISOString(),
      quote: "USDT",
      balances: bag,
      marks,
      starting_nav_today: Object.entries(bag).reduce((n, [a, q]) => {
        if (a === "USDT") return n + q;
        return n + q * (marks[a] ?? 0);
      }, 0),
    };
    cache = { at: Date.now(), snap };
    return snap;
  } catch (err) {
    return {
      ...fixtureSnapshot(),
      ok: false,
      source: "live_mcp",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
