import { DEMO_SNAPSHOT } from "../trader/beats.ts";
import type { AccountSnapshot } from "../snapshot/schema.ts";
import type { BinancePort } from "./port.ts";

const MAX_AGE_MS = 30_000;
let cache: { at: number; snap: AccountSnapshot } | null = null;

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

export async function buildSnapshot(args: {
  port: BinancePort;
  mode: "live" | "replay" | "off";
}): Promise<AccountSnapshot> {
  if (cache && Date.now() - cache.at < 5_000) {
    return markStaleIfNeeded(cache.snap);
  }
  if (args.mode !== "live") {
    const snap = fixtureSnapshot();
    cache = { at: Date.now(), snap };
    return snap;
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
