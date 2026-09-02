/**
 * Day 0: dump raw tools/list from Binance MCP.
 * Do not invent names. Unauthenticated initialize returned 401 on 2026-09-02.
 */
const URL = "https://agent.binance.com/mcp/agentic";

async function main() {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "charter-guardian-dump", version: "0.1.0" },
      },
    }),
  });
  const text = await res.text();
  console.log(`HTTP ${res.status}`);
  console.log(text.slice(0, 4000));
  if (res.status === 401) {
    console.log(
      "\nVerdict so far: MCP endpoint requires auth even for initialize. This is not GO-CUSTOM. Record as UNVERIFIED tool names. Use a listed client (Claude Code / ChatGPT / Grok) to authenticate, then re-run.",
    );
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
