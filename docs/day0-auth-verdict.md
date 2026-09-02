# Day 0 auth verdict

Observation, not a product preference. Do not call GO-CUSTOM on `initialize` 200 + `listTools` alone.

| Verdict | Meaning |
|---|---|
| **GO-CUSTOM** | Custom Node client lists tools **and** reads account **and** `scripts/probe-trade.ts` observed a trade-tool call (confirm, elicitation, fill, or structured error). Probe fill is **not** the film. |
| **GO-HOST** | Only a listed client (Claude / ChatGPT / Grok) completed OAuth, **or** the only observed trade-tool call was in a listed client. |
| **NO-GO-MCP** | No MCP tool call works. Prefer labeled replay over Skill Hub / API keys. Do not fake MCP. |

## Recorded on

- Date: 2026-09-02
- Operator: local Node dump
- Geo-eligible account: **yes** (confirmed 2026-09-02)
- Verdict: **not GO-CUSTOM** (HTTP 401 on unauthenticated `initialize`). GO-HOST pending listed-client OAuth.
- Mechanism observed: 401 Unauthorized; no tools/list body
- Probe used as film fill? **No.**
- Public REST minNotional BTCUSDT MARKET: 5 USDT (no API key)
