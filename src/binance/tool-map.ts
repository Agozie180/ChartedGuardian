/**
 * Filled from a raw Day 0 tools/list dump. Names start UNVERIFIED on purpose.
 * Calling a tool whose name is still UNVERIFIED must throw.
 */
export const TOOL_MAP = {
  getTicker: { name: "UNVERIFIED", note: "market data" },
  getBalances: { name: "UNVERIFIED", note: "account" },
  placeOrder: { name: "UNVERIFIED", note: "trade" },
  disconnectAgent: { name: "UNVERIFIED", note: "not documented as MCP" },
  emergencyStop: { name: "UNVERIFIED", note: "not documented as MCP" },
} as const;

export function assertVerified(slot: keyof typeof TOOL_MAP): string {
  const name = TOOL_MAP[slot].name;
  if (name === "UNVERIFIED") {
    throw new Error(`Binance MCP tool '${slot}' is UNVERIFIED. Dump tools/list before live calls.`);
  }
  return name;
}
