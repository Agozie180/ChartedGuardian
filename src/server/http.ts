import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate } from "../guardian/engine.ts";
import { compileDemoCharter } from "../policy/fixture-compiler.ts";
import { beats, type BeatId } from "../trader/beats.ts";
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
  // Replay serves the once-captured Agent OS data; every other mode is inert.
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
    ? await executeIfApproved({ decision: decision0, intent: intentRaw, port: portImpl() })
    : {
        ...decision0,
        execution: {
          ...decision0.execution,
          attempted: false,
          skipped_reason:
            decision0.decision === "APPROVE" ? `execution_mode_${mode()}` : decision0.execution.skipped_reason,
        },
      };

  persistDecision(agent, decided, past);
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
          mcp: {
            endpoint: "https://agent.binance.com/mcp/agentic",
            transport: "streamable-http",
            auth: "listed-client OAuth via Claude Code — connected 2026-09-03",
            verified_tools: ["spot_tickerPrice", "spot_getAccount", "spot_exchangeInfo"],
            execution_tool: "spot_newOrder (present in inventory; not yet exercised)",
            data_source:
              mode() === "replay"
                ? "recorded_live — real market/account data captured 2026-09-03, replayed deterministically"
                : mode() === "live"
                  ? "live_mcp"
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

      const demo = url.pathname.match(/^\/demo\/([a-z_]+)$/);
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
