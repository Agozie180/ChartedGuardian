import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  Balance,
  BinancePort,
  PlaceOrderRequest,
  PlaceOrderResult,
  Ticker,
} from "./port.ts";
import { TOOL_MAP } from "./tool-map.ts";

/**
 * Replays data captured ONCE from Binance Agent OS (see data/recorded/), so the
 * filmed demo runs deterministically with no live dependency — the "connect once,
 * then replay" model.
 *
 * Reads (getTicker/getTickers/getBalances) return the verbatim captured values.
 * placeOrder replays a real captured fill receipt when one exists at
 * data/recorded/order-<clientIntentId>.json; otherwise it returns a clearly
 * labeled replay receipt. Either way, the single execution gate had to APPROVE
 * and fire to reach this method — that logic is real, only the broker is recorded.
 */

const recordedDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "recorded");

type TickersDoc = { tickers: Array<{ symbol: string; price: string }> };
type AccountDoc = { balances: Array<{ asset: string; free: string; locked: string }> };

function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(recordedDir, name), "utf8")) as T;
}

let tickersCache: TickersDoc | null = null;
let accountCache: AccountDoc | null = null;

function tickerDoc(): TickersDoc {
  return (tickersCache ??= loadJson<TickersDoc>("tickers.json"));
}
function accountDoc(): AccountDoc {
  return (accountCache ??= loadJson<AccountDoc>("account.json"));
}

function toTicker(symbol: string): Ticker {
  const row = tickerDoc().tickers.find((t) => t.symbol === symbol);
  if (!row) {
    throw new Error(
      `recordedPort: no captured ticker for '${symbol}' (recorded set is BTCUSDT/ETHUSDT/BNBUSDT)`,
    );
  }
  return { symbol: row.symbol, lastPrice: Number(row.price), raw: row };
}

function sanitize(id: string): string {
  return id.replace(/[^A-Za-z0-9._-]/g, "-");
}

export const recordedPort: BinancePort = {
  async getTicker(symbol: string): Promise<Ticker> {
    return toTicker(symbol);
  },

  async getTickers(symbols: string[]): Promise<Ticker[]> {
    return symbols.map(toTicker);
  },

  async getBalances(): Promise<Balance[]> {
    // Verbatim captured balances. Empty at capture (unfunded sub-account) — we do
    // not fake a balance here; the demo NAV overlay lives in buildSnapshot, labeled.
    return accountDoc().balances.map((b) => ({
      asset: b.asset,
      free: Number(b.free),
      locked: Number(b.locked),
    }));
  },

  async placeOrder(req: PlaceOrderRequest): Promise<PlaceOrderResult> {
    const toolName = TOOL_MAP.placeOrder.name;
    const receiptFile = join(recordedDir, `order-${sanitize(req.clientIntentId)}.json`);

    if (existsSync(receiptFile)) {
      // A real order was captured with explicit consent (fund-later, now funded).
      const receipt = JSON.parse(readFileSync(receiptFile, "utf8")) as {
        orderId?: string | number;
        status?: string;
        [k: string]: unknown;
      };
      return {
        ok: true,
        toolName,
        orderId: receipt.orderId != null ? String(receipt.orderId) : undefined,
        status: receipt.status ?? "FILLED",
        raw: { replay: true, sent_to_binance: true, receipt },
      };
    }

    // No real receipt yet: the gate fired, but nothing was sent live. Say so plainly.
    return {
      ok: true,
      toolName,
      orderId: `REPLAY-${sanitize(req.clientIntentId)}`,
      status: "REPLAY",
      raw: {
        replay: true,
        sent_to_binance: false,
        would_call_tool: toolName,
        request: req,
        note:
          "recorded-live replay: Guardian APPROVED and the single execution gate fired placeOrder; " +
          "no live order was sent (sub-account unfunded, fund-later mode). Drop a captured receipt at " +
          `data/recorded/order-${sanitize(req.clientIntentId)}.json to show a real fill.`,
      },
    };
  },
};
