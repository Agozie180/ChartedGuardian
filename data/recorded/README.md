# Recorded-live captures

Real data captured **once** from Binance Agent OS over an authenticated MCP session
(Claude Code as the listed OAuth client, 2026-09-03), then replayed **deterministically**
by `src/binance/recorded-port.ts` so the filmed demo runs offline with no live dependency.

This is the "connect once, then replay" model. Nothing here is invented — every value
is a verbatim (or field-trimmed) response from the live server.

| File | Tool | What it is |
|---|---|---|
| `tickers.json` | `spot_tickerPrice` | Live BTC/ETH/BNB USDT prices |
| `account.json` | `spot_getAccount` | Agentic sub-account snapshot (uid redacted). Real NAV = 0 (unfunded at capture). |
| `exchange-info-btcusdt.json` | `spot_exchangeInfo` | BTCUSDT trading filters (min order size, lot/price steps) |
| `order-*.json` | `spot_newOrder` | (present only if one tiny real order was placed with explicit user consent) |

## Honesty

- **Connection**: real, listed-client OAuth (GO-HOST). Verdict recorded in `../../docs/day0-auth-verdict.md`.
- **Market data**: real, live.
- **NAV**: the sub-account was empty at capture, so the demo uses a clearly-labeled demo NAV for the
  exposure math. Real balances are recorded verbatim (empty) — we do not fake a balance.
- **Withdrawals**: never called. No withdrawal-execution tool was in the exposed set.
