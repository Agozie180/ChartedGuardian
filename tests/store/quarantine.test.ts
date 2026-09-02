import { describe, expect, it } from "vitest";
import { evaluate } from "../../src/guardian/engine.ts";
import { compileDemoCharter } from "../../src/policy/fixture-compiler.ts";
import { beats, DEMO_SNAPSHOT } from "../../src/trader/beats.ts";
import { defaultAgent, persistDecision, loadAgent } from "../../src/store/fs-store.ts";

describe("quarantine durability", () => {
  it("second DOGE freezes the agent record on disk", () => {
    const policy = compileDemoCharter();
    let agent = defaultAgent();
    const first = evaluate({
      policy,
      intent: beats.meme_doge,
      snapshot: DEMO_SNAPSHOT,
      log: { count: agent.violation_count, status: agent.status, recent: agent.recent },
    });
    agent = persistDecision(agent, first, { asset: "DOGE", product: "SPOT" });
    expect(agent.status).toBe("LIVE");
    expect(agent.violation_count).toBe(1);

    const second = evaluate({
      policy,
      intent: beats.meme_doge,
      snapshot: DEMO_SNAPSHOT,
      log: { count: agent.violation_count, status: agent.status, recent: agent.recent },
    });
    agent = persistDecision(agent, second, { asset: "DOGE", product: "SPOT" });
    expect(second.decision).toBe("QUARANTINE");
    expect(agent.status).toBe("QUARANTINED");

    const reloaded = loadAgent();
    expect(reloaded.status).toBe("QUARANTINED");

    const third = evaluate({
      policy,
      intent: beats.clean_btc,
      snapshot: DEMO_SNAPSHOT,
      log: { count: reloaded.violation_count, status: reloaded.status, recent: reloaded.recent },
    });
    expect(third.decision).toBe("QUARANTINE");
    expect(third.violated_rules).toContain("rule.gate.already_frozen");
  });
});
