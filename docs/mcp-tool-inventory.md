# MCP tool inventory

**Fill on Day 0. Do not invent names.**

Source of truth: raw `tools/list` JSON from Node (`scripts/dump-mcp-tools.ts`) or MCP Inspector.  
Do **not** paste a chat paraphrase.

## Connection

- Endpoint: `https://agent.binance.com/mcp/agentic`
- Transport: Streamable HTTP
- Client used:
- Scopes granted:
- Auth verdict: `GO-CUSTOM` | `GO-HOST` | `NO-GO-MCP` (see `day0-auth-verdict.md`)

## Sizing triple (exit criterion)

| Field | Value |
|---|---|
| `minNotional` (BTCUSDT MARKET) | TBD |
| `NAV` (USDT, post-fund) | TBD |
| `beat1_N` | TBD |

Formula (normative, see design §B4.8):

`funding_usdt >= (minNotional * 1.2) / 0.10 + (minNotional * 1.2)`

Worked row if `minNotional = 10`: fund `>= 132` USDT; `beat1_N ∈ [10, 0.10 * NAV]`.

## Tools

Paste verbatim `name`, `description`, and `inputSchema` below.

```json
[]
```
