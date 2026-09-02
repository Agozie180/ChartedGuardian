import type { Policy } from "./schema.ts";
import { DEMO_CHARTER } from "./demo-charter.ts";

export function compileDemoCharter(now = new Date().toISOString()): Policy {
  return {
    version: 1,
    charter_text: DEMO_CHARTER,
    compiled_at: now,
    compiler: "fixture",
    allowed_assets: ["BTC", "ETH", "BNB"],
    allowed_products: ["SPOT"],
    allowed_quote_assets: ["USDT"],
    max_position_pct: 10,
    max_leverage: 1,
    max_daily_loss_pct: 15,
    max_violations: 2,
    quarantine_enabled: true,
    quarantine_counts_from: ["rule.asset", "rule.leverage", "rule.drift"],
    fail_closed: true,
    dust_usdt: 0.01,
  };
}
