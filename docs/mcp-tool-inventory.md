# MCP tool inventory

Captured 2026-09-03 from the live tool surface exposed to the listed OAuth client
(Claude Code). Names are verbatim from that surface — **do not invent names.**

## Connection

- Endpoint: `https://agent.binance.com/mcp/agentic`
- Transport: Streamable HTTP, declared in repo `.mcp.json`
- Client used: **Claude Code as a listed OAuth client** (2026-09-03). The custom Node path (`scripts/dump-mcp-tools.ts`) returned HTTP 401 unauthenticated and was not pursued — the listed-client path succeeded.
- Auth: browser OAuth via `/mcp` → authenticate `binance`. **Connected.**
- Account: Agentic sub-account, `canTrade: true`, balances **empty** (NAV = 0, unfunded at capture).
- Auth verdict: **GO-HOST** (see [`day0-auth-verdict.md`](day0-auth-verdict.md)).

## Sizing triple (exit criterion)

| Field | Value |
|---|---|
| `minNotional` (BTCUSDT MARKET) | **5 USDT**, `NOTIONAL.applyMinToMarket=true` — confirmed via authenticated `spot_exchangeInfo` (captured in `../data/recorded/exchange-info-btcusdt.json`). |
| `NAV` (USDT) | Demo NAV **10,000** (labeled) — sub-account unfunded at capture, real NAV = 0. Real balances win automatically once funded. |
| `beat1_N` | clean_btc = **500 USDT** notional (`quoteOrderQty`), ≈5% of demo NAV, clears the 5 USDT min. |

Formula (normative, see design §B4.8):

`funding_usdt >= (minNotional * 1.2) / 0.10 + (minNotional * 1.2)`

Worked row if `minNotional = 10`: fund `>= 132` USDT; `beat1_N ∈ [10, 0.10 * NAV]`.

## Tools (exposed set, observed 2026-09-03)

Names are verbatim from the live MCP tool surface exposed to the client. `inputSchema`s are served by the live server; the three read tools below were exercised and their real responses are in [`../data/recorded/`](../data/recorded/).

**Called — VERIFIED:**
- `spot_tickerPrice` → `../data/recorded/tickers.json`
- `spot_getAccount` → `../data/recorded/account.json`
- `spot_exchangeInfo` → `../data/recorded/exchange-info-btcusdt.json`

**Present — trade (not exercised; sub-account unfunded):**
- `spot_newOrder`, `spot_deleteOrder`, `spot_deleteOpenOrders`

**Present — spot reads:** `spot_depth`, `spot_klines`, `spot_uiKlines`, `spot_ticker24hr`, `spot_myTrades`, `spot_getOrder`, `spot_getOpenOrders`

**Present — other products:** `futures_usds_*`, `futures_coin_*`, `margin_*`, `convert_*` (quote / accept / limit), `sub_account_getMainAccountAsset`, `analysis_getTokenAiReport`, plus META helpers `tool_search` / `tool_execute`.

**Present — wallet (all read-only in the exposed set):** `wallet_accountStatus`, `wallet_allCoinsInformation`, `wallet_dailyAccountSnapshot`, `wallet_depositAddress`, `wallet_depositHistory`, `wallet_getApiKeyPermission`, `wallet_queryUserUniversalTransferHistory`, `wallet_queryUserWalletBalance`, `wallet_withdrawHistory`.

> No withdrawal- or transfer-**execution** tool is in the exposed set, and Guardian never calls one. The server's own instructions reference a `create_wallet_sapi_userUniversalTransfer` tool (possibly reachable via `tool_execute`); we neither expose nor invoke it. We do not claim transfers are impossible — only that we never touch them.
