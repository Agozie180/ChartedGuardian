import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluate } from "../../src/guardian/engine.ts";
import { compileDemoCharter } from "../../src/policy/fixture-compiler.ts";
import { beats, DEMO_SNAPSHOT } from "../../src/trader/beats.ts";
import { defaultAgent, persistDecision, loadAgent } from "../../src/store/fs-store.ts";

// This test writes agent.json to disk. Redirect the store to a throwaway tmp dir so it
// never clobbers data/runtime/agent.json — otherwise `pnpm test` would leave the demo
// frozen QUARANTINED on the next `pnpm dev`.
let tmp: string;
let priorRuntimeDir: string | undefined;

beforeAll(() => {
  priorRuntimeDir = process.env.GUARDIAN_RUNTIME_DIR;
  tmp = mkdtempSync(join(tmpdir(), "guardian-quarantine-"));
  process.env.GUARDIAN_RUNTIME_DIR = tmp;
});

afterAll(() => {
  if (priorRuntimeDir === undefined) delete process.env.GUARDIAN_RUNTIME_DIR;
  else process.env.GUARDIAN_RUNTIME_DIR = priorRuntimeDir;
  rmSync(tmp, { recursive: true, force: true });
});

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
