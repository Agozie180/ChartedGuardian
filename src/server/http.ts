import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate } from "../guardian/engine.ts";
import { compileDemoCharter } from "../policy/fixture-compiler.ts";
import { beats, type BeatId } from "../trader/beats.ts";
import { proposeIntent } from "../trader/agent.ts";
import { executeIfApproved, withSingleFlight } from "../binance/executor.ts";
import { nullPort } from "../binance/null-port.ts";
import { recordedPort } from "../binance/recorded-port.ts";
import { buildSnapshot, invalidateSnapshotCache } from "../binance/snapshot.ts";
import {
  loadAgent,
  loadPolicyFile,
  persistDecision,
  resetDemo,
  savePolicyFile,
  appendAudit,
  toLog,
} from "../store/fs-store.ts";
import { killSwitchInfo } from "./kill-switch.ts";
import { normalizeIntent, TradeIntentInputSchema } from "../intent/schema.ts";
import type { BinancePort } from "../binance/port.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const uiDir = join(root, "src", "ui");

function mode(): "live" | "replay" | "off" {
  const v = process.env.EXECUTION_MODE ?? "off";
  if (v === "live" || v === "replay") return v;
  return "off";
}

function portImpl(): BinancePort {
  // A live MCP adapter is not shipped yet. Keep live mode inert and fail closed
  // rather than presenting nullPort as a live Binance connection.
  return mode() === "replay" ? recordedPort : nullPort;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

function send(res: ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
  });
  res.end(json);
}

function workflowTrace(decision: any, intent: any, proposal?: any) {
  const attempted = decision?.execution?.attempted === true;
  const source = proposal?.origin === "llm"
    ? `LLM agent (${proposal.model ?? "configured model"})`
    : proposal
      ? "host agent (fallback proposal)"
      : intent?.source === "host_agent"
        ? "host agent"
        : intent?.source === "fixture"
          ? "demo fixture"
          : "client";
  return {
    source,
    handoff: "agent -> guardian",
    guardian: decision?.decision ?? "—",
    binance: attempted
      ? `tool called: ${decision.execution.mcp_tool ?? "placeOrder"}`
      : decision?.decision === "APPROVE"
        ? "tool not called: execution mode"
        : "tool not called: guardian gate",
  };
}

function mcpResult(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function mcpError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function mime(p: string) {
  return { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript" }[
    extname(p)
  ];
}

async function runIntent(intentRaw: unknown) {
  const policy = loadPolicyFile() ?? compileDemoCharter();
  if (!loadPolicyFile()) savePolicyFile(policy);
  const agent = loadAgent();
  const snapshot = await buildSnapshot({ port: portImpl(), mode: mode() });
  const decision0 = evaluate({
    policy,
    intent: intentRaw,
    snapshot,
    log: toLog(agent),
  });

  const parsed = TradeIntentInputSchema.safeParse(intentRaw);
  const normalized = parsed.success ? normalizeIntent(parsed.data) : null;
  const past = {
    asset: normalized && !("error" in normalized) ? normalized.asset : "UNKNOWN",
    product: parsed.success ? parsed.data.product : "SPOT",
    leverage: parsed.success ? parsed.data.leverage : undefined,
  };

  const shouldExecute =
    (mode() === "live" && snapshot.source === "live_mcp") ||
    (mode() === "replay" && snapshot.source === "recorded_live");
  const decided = shouldExecute
    ? await executeIfApproved({
        decision: decision0,
        intent: intentRaw,
        port: portImpl(),
        policy,
        snapshot,
        log: toLog(agent),
      })
    : {
        ...decision0,
        execution: {
          ...decision0.execution,
          attempted: false,
          skipped_reason:
            decision0.decision === "APPROVE" ? `execution_mode_${mode()}` : decision0.execution.skipped_reason,
        },
      };

  persistDecision(agent, decided, past, intentRaw);
  appendAudit(decided, intentRaw);
  if (decided.execution.attempted) invalidateSnapshotCache();
  return decided;
}

export function createAppServer() {
  return createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET,POST,OPTIONS",
          "access-control-allow-headers": "content-type",
        });
        res.end();
        return;
      }

      const url = new URL(req.url ?? "/", "http://127.0.0.1");

      // Guardian is the local MCP boundary. Agents connect here and can only
      // invoke Guardian tools; no upstream Binance trade tool is exposed.
      if (req.method === "POST" && url.pathname === "/mcp") {
        const body = (await readJson(req)) as { id?: unknown; method?: string; params?: any };
        const id = body.id ?? null;
        if (body.method === "initialize") {
          send(res, 200, mcpResult(id, {
            protocolVersion: "2025-03-26",
            capabilities: { tools: {} },
            serverInfo: { name: "charter-guardian", version: "0.1.0" },
          }));
          return;
        }
        if (body.method === "notifications/initialized") {
          send(res, 202, {});
          return;
        }
        if (body.method === "tools/list") {
          send(res, 200, mcpResult(id, { tools: [
            {
              name: "guardian_trade",
              description: "Submit a spot trade intent. Guardian validates policy before execution.",
              inputSchema: { type: "object", additionalProperties: true },
            },
            {
              name: "guardian_state",
              description: "Read Guardian policy, status, and last decision.",
              inputSchema: { type: "object", properties: {}, additionalProperties: false },
            },
          ] }));
          return;
        }
        if (body.method === "tools/call") {
          const name = body.params?.name;
          if (name === "guardian_state") {
            const policy = loadPolicyFile() ?? compileDemoCharter();
            const agent = loadAgent();
            send(res, 200, mcpResult(id, { content: [{ type: "text", text: JSON.stringify({ policy, agent }) }] }));
            return;
          }
          if (name === "guardian_trade") {
            const decided = await withSingleFlight(() => runIntent(body.params?.arguments ?? {}));
            send(res, 200, mcpResult(id, {
              content: [{ type: "text", text: JSON.stringify(decided) }],
              isError: decided.decision !== "APPROVE",
            }));
            return;
          }
          send(res, 200, mcpError(id, -32601, `Unknown tool: ${String(name)}`));
          return;
        }
        send(res, 200, mcpError(id, -32601, `Unsupported method: ${String(body.method)}`));
        return;
      }

      if (req.method === "GET" && (url.pathname === "/" || url.pathname.startsWith("/ui"))) {
        const file =
          url.pathname === "/" || url.pathname === "/ui" || url.pathname === "/ui/"
            ? join(uiDir, "index.html")
            : join(uiDir, url.pathname.replace(/^\/ui\//, ""));
        if (existsSync(file) && mime(file)) {
          res.writeHead(200, { "content-type": mime(file)! });
          res.end(readFileSync(file));
          return;
        }
      }

      if (req.method === "GET" && url.pathname === "/state") {
        const policy = loadPolicyFile() ?? compileDemoCharter();
        const agent = loadAgent();
        send(res, 200, {
          policy,
          agent,
          last_decision: agent.last_decision,
          execution_mode: mode(),
          kill_switch: killSwitchInfo(),
          workflow: agent.last_decision
            ? workflowTrace(agent.last_decision, agent.last_intent)
            : null,
          mcp: {
            endpoint: "http://127.0.0.1:8787/mcp (Guardian boundary)",
            transport: "streamable-http",
            auth: "local Guardian MCP facade; upstream Binance credentials are not exposed",
            verified_tools: ["spot_tickerPrice", "spot_getAccount", "spot_exchangeInfo"],
            execution_tool: "spot_newOrder (present in inventory; not yet exercised)",
            data_source:
              mode() === "replay"
                ? "recorded_live — real market/account data captured 2026-09-03, replayed deterministically"
                : mode() === "live"
                  ? "unavailable — live MCP adapter is not installed; execution is fail-closed"
                  : "fixture (EXECUTION_MODE=off)",
          },
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/compile") {
        const policy = compileDemoCharter();
        savePolicyFile(policy);
        send(res, 200, { policy });
        return;
      }

      if (req.method === "POST" && url.pathname === "/reset-demo") {
        const body = (await readJson(req)) as { confirm?: boolean };
        if (body.confirm !== true) {
          send(res, 400, { error: "confirm: true required" });
          return;
        }
        send(res, 200, { ok: true, agent: resetDemo() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/open-binance-kill-switch") {
        send(res, 200, killSwitchInfo());
        return;
      }

      if (req.method === "POST" && url.pathname === "/intent") {
        const body = await readJson(req);
        const decided = await withSingleFlight(() => runIntent(body));
        send(res, 200, decided);
        return;
      }

      // The reasoning trader proposes; Guardian still decides. The agent runs
      // OFF the hot path and falls back to a canned intent on any failure, so
      // this endpoint can never break the deterministic demo.
      if (req.method === "POST" && url.pathname === "/agent-propose") {
        const snapshot = await buildSnapshot({ port: portImpl(), mode: mode() });
        const proposal = await proposeIntent(snapshot);
        const decided = await withSingleFlight(() => runIntent(proposal.intent));
        send(res, 200, {
          proposal,
          decision: decided,
          workflow: workflowTrace(decided, proposal.intent, proposal),
        });
        return;
      }

      const demo = url.pathname.match(/^\/demo\/([a-z0-9_]+)$/);
      if (req.method === "POST" && demo) {
        const id = demo[1] as BeatId;
        if (!(id in beats)) {
          send(res, 404, { error: "unknown beat" });
          return;
        }
        const decided = await withSingleFlight(() => runIntent(beats[id]));
        send(res, 200, decided);
        return;
      }

      send(res, 404, { error: "not found" });
    } catch (err) {
      const code = (err as { code?: string }).code === "409" ? 409 : 500;
      send(res, code, { error: err instanceof Error ? err.message : String(err) });
    }
  });
}
