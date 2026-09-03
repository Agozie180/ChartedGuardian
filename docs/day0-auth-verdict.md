# Day 0 auth verdict

Observation, not a product preference. Do not call GO-CUSTOM on `initialize` 200 + `listTools` alone.

| Verdict | Meaning |
|---|---|
| **GO-CUSTOM** | Custom Node client lists tools **and** reads account **and** `scripts/probe-trade.ts` observed a trade-tool call (confirm, elicitation, fill, or structured error). Probe fill is **not** the film. |
| **GO-HOST** | Only a listed client (Claude / ChatGPT / Grok) completed OAuth, **or** the only observed trade-tool call was in a listed client. |
| **NO-GO-MCP** | No MCP tool call works. Prefer labeled replay over Skill Hub / API keys. Do not fake MCP. |

## Recorded on

- Date: **2026-09-03** (connection); 2026-09-02 (initial unauthenticated recon)
- Operator: Claude Code (listed OAuth client)
- Geo-eligible account: **yes**
- Verdict: **GO-HOST** — listed-client OAuth (Claude Code) completed; `tools/list` exposed; `spot_getAccount` read the sub-account; `spot_tickerPrice` + `spot_exchangeInfo` returned real data (all captured in [`../data/recorded/`](../data/recorded/)).
- Trade tool: `spot_newOrder` **present** with schema; **not exercised** (sub-account unfunded, NAV = 0).
- NOT GO-CUSTOM: unauthenticated custom-Node `initialize` returned HTTP 401; the listed-client path succeeded, so the custom path was not pursued.
- Probe used as film fill? **No.** No live order placed.
- Public REST `minNotional` BTCUSDT MARKET: 5 USDT; re-confirmed via authenticated `spot_exchangeInfo` (`NOTIONAL.applyMinToMarket = true`).
