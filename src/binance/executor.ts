import type { Decision } from "../decision/schema.ts";
import { normalizeIntent, TradeIntentInputSchema, type TradeIntent } from "../intent/schema.ts";
import type { BinancePort } from "./port.ts";

let inFlight = false;

export function withSingleFlight<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight) {
    const err = new Error("single_flight");
    (err as Error & { code?: string }).code = "409";
    return Promise.reject(err);
  }
  inFlight = true;
  return fn().finally(() => {
    inFlight = false;
  });
}

export function toPlaceOrderRequest(intent: TradeIntent) {
  return {
    product: "SPOT" as const,
    symbol: intent.symbol,
    side: intent.side,
    type: intent.type,
    quantity: intent.quantity,
    quoteOrderQty: intent.quoteOrderQty,
    limit_price: intent.limit_price,
    clientIntentId: intent.intent_id,
  };
}

/**
 * THE only execution gate. Callers (HTTP, UI, host agent) must go through this.
 * Never rewrite APPROVE to BLOCK on broker failure.
 */
export async function executeIfApproved(args: {
  decision: Decision;
  intent: unknown;
  port: BinancePort;
}): Promise<Decision> {
  if (args.decision.decision !== "APPROVE" || args.decision.agent_status_after !== "LIVE") {
    return {
      ...args.decision,
      execution: {
        attempted: false,
        ok: false,
        skipped_reason:
          args.decision.decision === "APPROVE"
            ? "agent_not_live"
            : `decision_${args.decision.decision}`,
      },
    };
  }

  const parsed = TradeIntentInputSchema.safeParse(args.intent);
  const normalized = parsed.success ? normalizeIntent(parsed.data) : { error: "bad intent" };
  if ("error" in normalized) {
    return {
      ...args.decision,
      execution: { attempted: false, ok: false, skipped_reason: "intent_unusable" },
    };
  }

  try {
    const result = await args.port.placeOrder(toPlaceOrderRequest(normalized));
    return {
      ...args.decision,
      execution: {
        attempted: true,
        ok: result.ok,
        mcp_tool: result.toolName,
        mcp_result: result.raw,
        error: result.ok ? undefined : (result.error ?? "place_order_failed"),
      },
    };
  } catch (err) {
    return {
      ...args.decision,
      execution: {
        attempted: true,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
