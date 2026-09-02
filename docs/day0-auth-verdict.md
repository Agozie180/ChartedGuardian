# Day 0 auth verdict

Observation, not a product preference. Do not call GO-CUSTOM on `initialize` 200 + `listTools` alone.

| Verdict | Meaning |
|---|---|
| **GO-CUSTOM** | Custom Node client lists tools **and** reads account **and** `scripts/probe-trade.ts` observed a trade-tool call (confirm, elicitation, fill, or structured error). Probe fill is **not** the film. |
| **GO-HOST** | Only a listed client (Claude / ChatGPT / Grok) completed OAuth, **or** the only observed trade-tool call was in a listed client. |
| **NO-GO-MCP** | No MCP tool call works. Prefer labeled replay over Skill Hub / API keys. Do not fake MCP. |

## Recorded on

- Date:
- Operator:
- Geo-eligible account: **yes** (confirmed 2026-09-02)
- Verdict: TBD
- Mechanism observed (confirm / elicitation / immediate fill / error):
- Probe used as film fill? **No.**
