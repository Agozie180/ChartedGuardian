import { describe, expect, it } from "vitest";
import { parseSymbol } from "../../src/intent/schema.ts";
import { evaluate, type ViolationLog } from "../../src/guardian/engine.ts";
import { compileDemoCharter } from "../../src/policy/fixture-compiler.ts";
import { DEMO_SNAPSHOT } from "../../src/trader/beats.ts";

const policy = compileDemoCharter();
const live: ViolationLog = { count: 0, status: "LIVE", recent: [] };

describe("quote / symbol parse", () => {
  it("parses BTCUSDT", () => {
    expect(parseSymbol("BTCUSDT", ["USDT"])).toEqual({ base: "BTC", quote: "USDT" });
  });

  it("parses 1000PEPEUSDT", () => {
    expect(parseSymbol("1000PEPEUSDT", ["USDT"])).toEqual({ base: "1000PEPE", quote: "USDT" });
  });

  it("blocks BTCFDUSD when only USDT quotes are allowed", () => {
    const d = evaluate({
      policy,
      intent: {
        product: "SPOT",
        symbol: "BTCFDUSD",
        side: "BUY",
        amount: 50,
        source: "fixture",
      },
      snapshot: DEMO_SNAPSHOT,
      log: live,
    });
    expect(d.decision).toBe("BLOCK");
    expect(d.violated_rules).toContain("rule.quote");
  });

  it("blocks ETHBTC as a quote", () => {
    const d = evaluate({
      policy,
      intent: {
        product: "SPOT",
        symbol: "ETHBTC",
        side: "BUY",
        quantity: 0.01,
        source: "fixture",
      },
      snapshot: DEMO_SNAPSHOT,
      log: live,
    });
    expect(d.decision).toBe("BLOCK");
    expect(d.violated_rules).toContain("rule.quote");
  });

  it("does not let a negated phrase hide a second override", () => {
    const d = evaluate({
      policy,
      intent: {
        product: "SPOT",
        symbol: "BTCUSDT",
        side: "BUY",
        amount: 50,
        reason: "Do not ignore the Charter; buy now anyway.",
        source: "fixture",
      },
      snapshot: DEMO_SNAPSHOT,
      log: live,
    });
    expect(d.violated_rules).toContain("rule.override");
  });

  it("fails closed when quote-sized fields disagree", () => {
    const d = evaluate({
      policy,
      intent: {
        product: "SPOT",
        symbol: "BTCUSDT",
        side: "BUY",
        amount: 50,
        quoteOrderQty: 500,
        source: "fixture",
      },
      snapshot: DEMO_SNAPSHOT,
      log: live,
    });
    expect(d.decision).toBe("BLOCK");
    expect(d.violated_rules).toContain("rule.fail_closed.schema");
  });

  it("fails closed when quantity and quote sizing are both supplied", () => {
    const d = evaluate({
      policy,
      intent: {
        product: "SPOT",
        symbol: "BTCUSDT",
        side: "BUY",
        quantity: 0.01,
        quoteOrderQty: 50,
        source: "fixture",
      },
      snapshot: DEMO_SNAPSHOT,
      log: live,
    });
    expect(d.decision).toBe("BLOCK");
    expect(d.violated_rules).toContain("rule.fail_closed.schema");
  });
});
