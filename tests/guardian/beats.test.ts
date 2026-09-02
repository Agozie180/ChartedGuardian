import { describe, expect, it } from "vitest";
import { evaluate, type ViolationLog } from "../../src/guardian/engine.ts";
import { compileDemoCharter } from "../../src/policy/fixture-compiler.ts";
import { beats, DEMO_SNAPSHOT } from "../../src/trader/beats.ts";
import { executeIfApproved } from "../../src/binance/executor.ts";
import type { BinancePort } from "../../src/binance/port.ts";

const policy = compileDemoCharter();
const live: ViolationLog = { count: 0, status: "LIVE", recent: [] };

function spyPort() {
  const calls: unknown[] = [];
  const port: BinancePort = {
    async getTicker() {
      return { symbol: "BTCUSDT", lastPrice: 100_000, raw: {} };
    },
    async getTickers() {
      return [];
    },
    async getBalances() {
      return [];
    },
    async placeOrder(req) {
      calls.push(req);
      return { ok: true, toolName: "spy", raw: { spy: true }, orderId: "1" };
    },
  };
  return { port, calls };
}

describe("Guardian filmed / required scenarios", () => {
  it("allows BTC spot 500 USDT (5% of 10k NAV)", () => {
    const d = evaluate({ policy, intent: beats.clean_btc, snapshot: DEMO_SNAPSHOT, log: live });
    expect(d.decision).toBe("APPROVE");
    expect(d.agent_status_after).toBe("LIVE");
    expect(d.violation_count_after).toBe(0);
    expect(d.computed.projected_exposure_pct).toBeCloseTo(5, 5);
  });

  it("blocks prohibited DOGE", () => {
    const d = evaluate({ policy, intent: beats.meme_doge, snapshot: DEMO_SNAPSHOT, log: live });
    expect(d.decision).toBe("BLOCK");
    expect(d.violated_rules).toContain("rule.asset");
    expect(d.reasons.some((r) => r.includes("DOGE"))).toBe(true);
    expect(d.violation_count_after).toBe(1);
  });

  it("blocks position limit (2000 USDT BTC = 20% of 10k)", () => {
    const d = evaluate({ policy, intent: beats.oversized_btc, snapshot: DEMO_SNAPSHOT, log: live });
    expect(d.decision).toBe("BLOCK");
    expect(d.violated_rules).toContain("rule.exposure");
    expect(d.violation_count_after).toBe(0);
  });

  it("blocks prompt override without quarantining on a clean log", () => {
    const d = evaluate({ policy, intent: beats.override, snapshot: DEMO_SNAPSHOT, log: live });
    expect(d.decision).toBe("BLOCK");
    expect(d.violated_rules).toContain("rule.override");
    expect(d.reasons.some((r) => /conflicts with Charter/i.test(r))).toBe(true);
    expect(d.agent_status_after).toBe("LIVE");
    expect(d.violation_count_after).toBe(0);
  });

  it("quarantines on the second counting asset violation", () => {
    const afterOne: ViolationLog = {
      count: 1,
      status: "LIVE",
      recent: [{ asset: "DOGE", product: "SPOT" }],
    };
    const d = evaluate({ policy, intent: beats.meme_doge, snapshot: DEMO_SNAPSHOT, log: afterOne });
    expect(d.decision).toBe("QUARANTINE");
    expect(d.agent_status_after).toBe("QUARANTINED");
    expect(d.violated_rules).toContain("rule.asset");
  });

  it("flags behavioral drift after a cluster of prohibited intents", () => {
    const log: ViolationLog = {
      count: 1,
      status: "LIVE",
      recent: [
        { asset: "DOGE", product: "SPOT" },
        { asset: "DOGE", product: "SPOT" },
        { asset: "PEPE", product: "SPOT" },
      ],
    };
    const d = evaluate({ policy, intent: beats.leverage, snapshot: DEMO_SNAPSHOT, log });
    expect(d.violated_rules).toContain("rule.drift");
    expect(d.violated_rules).toContain("rule.leverage");
    expect(d.decision).toBe("QUARANTINE");
  });

  it("blocks leverage / futures", () => {
    const d = evaluate({ policy, intent: beats.leverage, snapshot: DEMO_SNAPSHOT, log: live });
    expect(d.decision).toBe("BLOCK");
    expect(d.violated_rules).toContain("rule.leverage");
    expect(d.violated_rules).toContain("rule.product");
  });

  it("blocks daily loss limit on further buys", () => {
    const snapped = {
      ...DEMO_SNAPSHOT,
      balances: { USDT: 8_000, BTC: 0, ETH: 0, BNB: 0 },
      starting_nav_today: 10_000,
    };
    const d = evaluate({ policy, intent: beats.clean_btc, snapshot: snapped, log: live });
    expect(d.decision).toBe("BLOCK");
    expect(d.violated_rules).toContain("rule.daily_loss");
  });

  it("keeps a quarantined agent frozen", () => {
    const frozen: ViolationLog = { count: 2, status: "QUARANTINED", recent: [] };
    const d = evaluate({ policy, intent: beats.clean_btc, snapshot: DEMO_SNAPSHOT, log: frozen });
    expect(d.decision).toBe("QUARANTINE");
    expect(d.violated_rules).toContain("rule.gate.already_frozen");
  });

  it("never calls placeOrder on BLOCK", async () => {
    const { port, calls } = spyPort();
    const d = evaluate({ policy, intent: beats.meme_doge, snapshot: DEMO_SNAPSHOT, log: live });
    const after = await executeIfApproved({ decision: d, intent: beats.meme_doge, port });
    expect(after.execution.attempted).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("never calls placeOrder on QUARANTINE", async () => {
    const { port, calls } = spyPort();
    const log: ViolationLog = { count: 1, status: "LIVE", recent: [{ asset: "DOGE", product: "SPOT" }] };
    const d = evaluate({ policy, intent: beats.meme_doge, snapshot: DEMO_SNAPSHOT, log });
    const after = await executeIfApproved({ decision: d, intent: beats.meme_doge, port });
    expect(d.decision).toBe("QUARANTINE");
    expect(after.execution.attempted).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("calls placeOrder only after APPROVE", async () => {
    const { port, calls } = spyPort();
    const d = evaluate({ policy, intent: beats.clean_btc, snapshot: DEMO_SNAPSHOT, log: live });
    const after = await executeIfApproved({ decision: d, intent: beats.clean_btc, port });
    expect(d.decision).toBe("APPROVE");
    expect(after.execution.attempted).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("does not rewrite APPROVE to BLOCK when the broker throws", async () => {
    const port: BinancePort = {
      async getTicker() {
        return { symbol: "BTCUSDT", lastPrice: 1, raw: {} };
      },
      async getTickers() {
        return [];
      },
      async getBalances() {
        return [];
      },
      async placeOrder() {
        throw new Error("mcp down");
      },
    };
    const d = evaluate({ policy, intent: beats.clean_btc, snapshot: DEMO_SNAPSHOT, log: live });
    const after = await executeIfApproved({ decision: d, intent: beats.clean_btc, port });
    expect(after.decision).toBe("APPROVE");
    expect(after.execution.ok).toBe(false);
    expect(after.execution.attempted).toBe(true);
  });

  it("fail-closes on a stale/unusable snapshot", () => {
    const d = evaluate({
      policy,
      intent: beats.clean_btc,
      snapshot: { ...DEMO_SNAPSHOT, ok: false },
      log: live,
    });
    expect(d.decision).toBe("BLOCK");
    expect(d.violated_rules).toContain("rule.fail_closed.snapshot");
  });
});
