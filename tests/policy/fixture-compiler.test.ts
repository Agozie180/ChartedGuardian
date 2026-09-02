import { describe, expect, it } from "vitest";
import { PolicySchema } from "../../src/policy/schema.ts";
import { compileDemoCharter } from "../../src/policy/fixture-compiler.ts";

describe("fixture compiler", () => {
  it("emits a valid demo policy without an LLM", () => {
    const policy = compileDemoCharter();
    expect(PolicySchema.parse(policy).allowed_assets).toEqual(["BTC", "ETH", "BNB"]);
    expect(policy.max_position_pct).toBe(10);
    expect(policy.max_leverage).toBe(1);
    expect(policy.max_violations).toBe(2);
  });
});
