import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { proposeIntent } from "../../src/trader/agent.ts";
import { TradeIntentInputSchema } from "../../src/intent/schema.ts";
import { evaluate, type ViolationLog } from "../../src/guardian/engine.ts";
import { compileDemoCharter } from "../../src/policy/fixture-compiler.ts";
import { DEMO_SNAPSHOT } from "../../src/trader/beats.ts";

const policy = compileDemoCharter();
const live: ViolationLog = { count: 0, status: "LIVE", recent: [] };

const savedBase = process.env.LLM_BASE_URL;
const savedKey = process.env.LLM_API_KEY;

beforeEach(() => {
  delete process.env.LLM_BASE_URL;
  delete process.env.LLM_API_KEY;
});
afterEach(() => {
  if (savedBase === undefined) delete process.env.LLM_BASE_URL;
  else process.env.LLM_BASE_URL = savedBase;
  if (savedKey === undefined) delete process.env.LLM_API_KEY;
  else process.env.LLM_API_KEY = savedKey;
});

describe("reasoning trader (proposeIntent)", () => {
  it("falls back to a valid, schema-clean host-agent proposal when no LLM is configured", async () => {
    const p = await proposeIntent(DEMO_SNAPSHOT);
    expect(p.origin).toBe("fallback");
    expect(p.fallback_reason).toMatch(/no LLM/i);
    // The proposal must always be something Guardian can consume.
    expect(TradeIntentInputSchema.safeParse(p.intent).success).toBe(true);
  });

  it("hands the state-derived fallback proposal to Guardian for approval", async () => {
    const p = await proposeIntent(DEMO_SNAPSHOT);
    const d = evaluate({ policy, intent: p.intent, snapshot: DEMO_SNAPSHOT, log: live });
    expect(p.intent.source).toBe("host_agent");
    expect(d.decision).toBe("APPROVE");
  });

  it("falls back (never throws) when the configured LLM endpoint is unreachable", async () => {
    process.env.LLM_BASE_URL = "http://127.0.0.1:1"; // nothing listening
    process.env.LLM_API_KEY = "test";
    const p = await proposeIntent(DEMO_SNAPSHOT);
    expect(p.origin).toBe("fallback");
    expect(TradeIntentInputSchema.safeParse(p.intent).success).toBe(true);
  });
});
