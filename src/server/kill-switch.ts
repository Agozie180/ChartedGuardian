import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function killSwitchInfo() {
  const md = readFileSync(join(root, "docs", "kill-switch.md"), "utf8");
  const match = md.match(/```\n([\s\S]*?)\n```/);
  const url = match?.[1]?.trim() ?? "TBD";
  return {
    path: "Profile → Dashboard → Sub-account → Account Management",
    url: url === "TBD" ? null : url,
    warning:
      "Emergency stop cancels all spot, margin, and futures positions and orders. Guardian will not auto-click it.",
    honesty:
      "Guardian froze the agent. Binance kill switch is user-owned and currently UI-only.",
  };
}
