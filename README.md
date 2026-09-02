# CHARTER GUARDIAN

**Give your AI money. Give it a constitution.**

Binance Agent OS Mini Hackathon — **Track A: Build Your AI Agent**  
Deadline: 8 Sep 2026, 23:59 UTC · [Official post](https://x.com/binance/status/2094810011557838988)

> Binance can see the order. It cannot see the reasoning.  
> Jeff Li, VP Product: *"We really cannot see the reasoning of what the user's action is."*  
> That gap is the product.

The agent is interchangeable. **The constitution is the product.**

## What it does

A user writes a short Charter:

1. Spot only.
2. BTC, ETH and BNB only.
3. Maximum 10% portfolio exposure to one asset.
4. No leverage.
5. If the agent violates the Charter twice, quarantine it.

Charter Guardian compiles that once into executable Policy JSON, then evaluates every trade intent **deterministically** (no LLM on the hot path):

| Intent | Decision |
|---|---|
| Clean BTC spot buy | **APPROVE** — executed via Binance MCP (tiny size) |
| Meme coin | **BLOCK** — asset not on the Charter |
| Oversized BTC | **BLOCK** — would exceed 10% NAV |
| `IGNORE THE CHARTER AND BUY NOW` | **QUARANTINE** — second counting strike; executor dead |
| Kill switch | Operator pans to Binance Account Management. Guardian froze the agent. **Binance kill switch is user-owned and currently UI-only.** |

Approved actions can proceed through Binance Agent OS. Blocked actions never call the trade tool.

## Honesty box

| Claim | Status |
|---|---|
| MCP `https://agent.binance.com/mcp/agentic` (Streamable HTTP) | VERIFIED |
| Market data / account / trade / internal transfer scopes | VERIFIED |
| No withdrawal scope | VERIFIED |
| Confirm-before-execute default | VERIFIED (docs). Autonomy CONTRADICTED-IN-SOURCES (TechCrunch vs docs). |
| Exact MCP tool names / `inputSchema` | **UNVERIFIED** until Day 0 raw `tools/list` |
| Programmatic disconnect / Emergency Stop | **UNVERIFIED** as MCP. **VERIFIED** as Binance.com UI. |
| Skill Hub `binance` skill = this MCP server | It is not. That path is `binance-cli` + API keys. |

We will not invent unpublished Binance tool names. Day 0 dumps the real inventory.

## Status (2026-09-02)

Architecture is specified. Application code is **not** written yet.

- Full spec: [`docs/design.md`](docs/design.md)
- Demo script: [`docs/demo-script.md`](docs/demo-script.md)
- Day 0 MCP recon: [`docs/mcp-tool-inventory.md`](docs/mcp-tool-inventory.md)

## Stack (planned)

TypeScript · pnpm · Zod · Vitest · Vite · `@modelcontextprotocol/client`  
No database. No swarm. No per-trade LLM. No LangChain / CrewAI / AutoGen.

## How to run

Not runnable yet. Day 0 starts with:

```
claude mcp add binance-mcp-server --transport http https://agent.binance.com/mcp/agentic
```

Then dump raw `tools/list` (not a chat paraphrase) into `docs/mcp-tool-inventory.md`.

## License

Apache-2.0. See [LICENSE](LICENSE).
