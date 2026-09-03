/**
 * Slots mapped to real Binance Agent OS MCP tools, verified via Claude Code OAuth
 * against https://agent.binance.com/mcp/agentic (2026-09-03).
 *
 *   VERIFIED   — called successfully this session.
 *   PRESENT    — in the live tools/list with a known inputSchema, not yet exercised.
 *   UNVERIFIED — not confirmed to exist as an MCP tool; calling it must throw.
 */
export const TOOL_MAP = {
  getTicker: { name: "spot_tickerPrice", status: "VERIFIED", note: "market data — called 2026-09-03" },
  getBalances: { name: "spot_getAccount", status: "VERIFIED", note: "account view — called 2026-09-03" },
  placeOrder: {
    name: "spot_newOrder",
    status: "PRESENT",
    note: "spot trade — present in inventory with schema; not yet exercised (sub-account unfunded)",
  },
  disconnectAgent: {
    name: "UNVERIFIED",
    status: "UNVERIFIED",
    note: "no MCP disconnect tool observed; agent freeze is Guardian-side, kill switch is user-owned Binance UI",
  },
  emergencyStop: {
    name: "UNVERIFIED",
    status: "UNVERIFIED",
    note: "no MCP emergency-stop tool observed; kill switch is user-owned Binance UI",
  },
} as const;

export function assertVerified(slot: keyof typeof TOOL_MAP): string {
  const entry = TOOL_MAP[slot];
  if (entry.name === "UNVERIFIED") {
    throw new Error(`Binance MCP tool '${slot}' is UNVERIFIED. Capture tools/list before live calls.`);
  }
  return entry.name;
}
