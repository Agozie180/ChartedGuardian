import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  appendFileSync,
  openSync,
  writeSync,
  fsyncSync,
  closeSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Policy } from "../policy/schema.ts";
import type { Decision } from "../decision/schema.ts";
import type { ViolationLog } from "../guardian/engine.ts";
import type { PastIntent } from "../guardian/rules.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const runtimeDir = join(root, "data", "runtime");
const agentPath = join(runtimeDir, "agent.json");
const policyPath = join(runtimeDir, "policy.json");
const auditPath = join(runtimeDir, "audit.jsonl");

export type AgentState = {
  status: "LIVE" | "QUARANTINED";
  violation_count: number;
  recent: PastIntent[];
  last_decision: Decision | null;
  updated_at: string;
};

function ensureDir() {
  mkdirSync(runtimeDir, { recursive: true });
}

export function defaultAgent(): AgentState {
  return {
    status: "LIVE",
    violation_count: 0,
    recent: [],
    last_decision: null,
    updated_at: new Date().toISOString(),
  };
}

export function loadAgent(): AgentState {
  ensureDir();
  if (!existsSync(agentPath)) return defaultAgent();
  return JSON.parse(readFileSync(agentPath, "utf8")) as AgentState;
}

export function saveAgent(state: AgentState) {
  ensureDir();
  const body = JSON.stringify(state, null, 2) + "\n";
  const fd = openSync(agentPath, "w");
  try {
    writeSync(fd, body);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

export function loadPolicyFile(): Policy | null {
  if (!existsSync(policyPath)) return null;
  return JSON.parse(readFileSync(policyPath, "utf8")) as Policy;
}

export function savePolicyFile(policy: Policy) {
  ensureDir();
  writeFileSync(policyPath, JSON.stringify(policy, null, 2) + "\n");
}

export function appendAudit(decision: Decision, intent: unknown) {
  ensureDir();
  appendFileSync(auditPath, JSON.stringify({ at: new Date().toISOString(), intent, decision }) + "\n");
}

export function toLog(agent: AgentState): ViolationLog {
  return { count: agent.violation_count, status: agent.status, recent: agent.recent };
}

export function persistDecision(agent: AgentState, decision: Decision, past: PastIntent): AgentState {
  const next: AgentState = {
    status: decision.agent_status_after,
    violation_count: decision.violation_count_after,
    recent: [...agent.recent, past].slice(-20),
    last_decision: decision,
    updated_at: new Date().toISOString(),
  };
  if (decision.decision === "QUARANTINE") {
    saveAgent(next);
  } else {
    saveAgent(next);
  }
  return next;
}

export function resetDemo() {
  const fresh = defaultAgent();
  saveAgent(fresh);
  return fresh;
}
