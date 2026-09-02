import { PolicySchema, type Policy, type CountingRuleId } from "../policy/schema.ts";
import {
  TradeIntentInputSchema,
  normalizeIntent,
  type TradeIntent,
} from "../intent/schema.ts";
import { AccountSnapshotSchema, type AccountSnapshot } from "../snapshot/schema.ts";
import type { Decision, DecisionKind } from "../decision/schema.ts";
import {
  checkAsset,
  checkDailyLoss,
  checkDrift,
  checkExposure,
  checkLeverage,
  checkOverride,
  checkProduct,
  checkQuote,
  navOf,
  type PastIntent,
} from "./rules.ts";

export type ViolationLog = {
  count: number;
  status: "LIVE" | "QUARANTINED";
  recent: PastIntent[];
};

function emptyExecution(): Decision["execution"] {
  return { attempted: false, ok: false };
}

function pack(args: {
  kind: DecisionKind;
  intent: TradeIntent;
  policy: Policy;
  hits: { id: string; reason: string }[];
  nav: number;
  currentPct: number;
  projectedPct: number;
  dailyLossPct: number;
  countAfter: number;
  statusAfter: "LIVE" | "QUARANTINED";
}): Decision {
  const reasons = args.hits.map((h) => h.reason);
  const ids = args.hits.map((h) => h.id);
  const counting = args.hits.filter((h) =>
    args.policy.quarantine_counts_from.includes(h.id as CountingRuleId),
  );
  const hero =
    counting[0]?.reason ??
    args.hits[0]?.reason ??
    (args.kind === "APPROVE" ? "Spot buy is within the Charter." : "Blocked.");

  return {
    decision: args.kind,
    intent_id: args.intent.intent_id,
    policy_version: args.policy.version,
    matched_rule_ids: ids,
    violated_rules: ids,
    reasons: reasons.length ? reasons : [hero],
    risk_summary: {
      nav_quote: args.nav,
      current_exposure_pct: args.currentPct,
      projected_exposure_pct: args.projectedPct,
      daily_loss_pct: args.dailyLossPct,
      counting_hits: counting.map((h) => h.id),
    },
    next_action:
      args.kind === "APPROVE"
        ? { execute: true }
        : args.kind === "QUARANTINE"
          ? { execute: false, freeze_executor: true, binance_kill_switch: "ui_only_unless_mcp_tool_proven" }
          : { execute: false },
    computed: {
      nav_quote: args.nav,
      current_exposure_pct: args.currentPct,
      projected_exposure_pct: args.projectedPct,
      daily_loss_pct: args.dailyLossPct,
    },
    violation_count_after: args.countAfter,
    agent_status_after: args.statusAfter,
    execution: emptyExecution(),
  };
}

export function evaluate(args: {
  policy: unknown;
  intent: unknown;
  snapshot: unknown;
  log: ViolationLog;
}): Decision {
  const policyParse = PolicySchema.safeParse(args.policy);
  const intentParse = TradeIntentInputSchema.safeParse(args.intent);
  const snapParse = AccountSnapshotSchema.safeParse(args.snapshot);

  const dummyIntent: TradeIntent = {
    intent_id: "invalid",
    timestamp: new Date().toISOString(),
    agent_id: "demo-trader",
    product: "SPOT",
    asset: "UNKNOWN",
    symbol: "UNKNOWNUSDT",
    side: "BUY",
    type: "MARKET",
    amount: 0,
    notional_quote: 0,
    reason: "",
    source: "ui",
  };

  if (!intentParse.success) {
    return pack({
      kind: "BLOCK",
      intent: dummyIntent,
      policy: policyParse.success ? policyParse.data : fallbackPolicy(),
      hits: [{ id: "rule.fail_closed.schema", reason: "Intent failed schema validation." }],
      nav: 0,
      currentPct: 0,
      projectedPct: 0,
      dailyLossPct: 0,
      countAfter: args.log.count,
      statusAfter: args.log.status,
    });
  }

  const normalized = normalizeIntent(intentParse.data);
  if ("error" in normalized) {
    return pack({
      kind: "BLOCK",
      intent: { ...dummyIntent, intent_id: intentParse.data.intent_id ?? "invalid" },
      policy: policyParse.success ? policyParse.data : fallbackPolicy(),
      hits: [{ id: "rule.fail_closed.schema", reason: normalized.error }],
      nav: 0,
      currentPct: 0,
      projectedPct: 0,
      dailyLossPct: 0,
      countAfter: args.log.count,
      statusAfter: args.log.status,
    });
  }

  const intent = normalized;

  if (args.log.status === "QUARANTINED") {
    const policy = policyParse.success ? policyParse.data : fallbackPolicy();
    return pack({
      kind: "QUARANTINE",
      intent,
      policy,
      hits: [{ id: "rule.gate.already_frozen", reason: "quarantined_agent: executor is frozen." }],
      nav: 0,
      currentPct: 0,
      projectedPct: 0,
      dailyLossPct: 0,
      countAfter: args.log.count,
      statusAfter: "QUARANTINED",
    });
  }

  if (!policyParse.success) {
    return pack({
      kind: "BLOCK",
      intent,
      policy: fallbackPolicy(),
      hits: [{ id: "rule.fail_closed.policy", reason: "Policy missing or invalid; fail-closed BLOCK." }],
      nav: 0,
      currentPct: 0,
      projectedPct: 0,
      dailyLossPct: 0,
      countAfter: args.log.count,
      statusAfter: "LIVE",
    });
  }

  const policy = policyParse.data;

  if (intent.type === "LIMIT" && intent.limit_price === undefined) {
    return pack({
      kind: "BLOCK",
      intent,
      policy,
      hits: [{ id: "rule.fail_closed.limit_without_price", reason: "LIMIT order missing limit_price." }],
      nav: 0,
      currentPct: 0,
      projectedPct: 0,
      dailyLossPct: 0,
      countAfter: args.log.count,
      statusAfter: "LIVE",
    });
  }

  if (!snapParse.success || !snapParse.data.ok) {
    return pack({
      kind: "BLOCK",
      intent,
      policy,
      hits: [{ id: "rule.fail_closed.snapshot", reason: "Account snapshot is not ok; fail-closed BLOCK." }],
      nav: 0,
      currentPct: 0,
      projectedPct: 0,
      dailyLossPct: 0,
      countAfter: args.log.count,
      statusAfter: "LIVE",
    });
  }

  const snapshot = snapParse.data;
  const hits: { id: string; reason: string }[] = [];

  const product = checkProduct(policy, intent);
  if (product) hits.push(product);
  const quote = checkQuote(policy, intent);
  if (quote) hits.push(quote);
  const asset = checkAsset(policy, intent);
  if (asset) hits.push(asset);
  const leverage = checkLeverage(policy, intent);
  if (leverage) hits.push(leverage);
  const override = checkOverride(intent);
  if (override) hits.push(override);
  const exposure = checkExposure(policy, intent, snapshot);
  if (exposure.hit) hits.push(exposure.hit);
  const daily = checkDailyLoss(policy, intent, snapshot);
  if (daily) hits.push(daily);
  const drift = checkDrift(policy, intent, args.log.recent);
  if (drift) hits.push(drift);

  const nav = Number.isFinite(exposure.nav) ? exposure.nav : navOf(snapshot);
  const start = snapshot.starting_nav_today || nav;
  const dailyLossPct = start > 0 ? ((start - nav) / start) * 100 : 0;

  const countingHit = hits.some((h) =>
    policy.quarantine_counts_from.includes(h.id as CountingRuleId),
  );
  const countAfter = countingHit ? args.log.count + 1 : args.log.count;
  const shouldQuarantine =
    policy.quarantine_enabled &&
    (hits.some((h) => h.id === "rule.drift") || countAfter >= policy.max_violations) &&
    hits.length > 0 &&
    countingHit;

  if (hits.length === 0) {
    return pack({
      kind: "APPROVE",
      intent,
      policy,
      hits: [],
      nav,
      currentPct: exposure.currentPct,
      projectedPct: exposure.projectedPct,
      dailyLossPct,
      countAfter,
      statusAfter: "LIVE",
    });
  }

  const kind: DecisionKind = shouldQuarantine ? "QUARANTINE" : "BLOCK";
  return pack({
    kind,
    intent,
    policy,
    hits,
    nav,
    currentPct: exposure.currentPct,
    projectedPct: exposure.projectedPct,
    dailyLossPct,
    countAfter: shouldQuarantine ? Math.max(countAfter, policy.max_violations) : countAfter,
    statusAfter: shouldQuarantine ? "QUARANTINED" : "LIVE",
  });
}

function fallbackPolicy(): Policy {
  return {
    version: 0,
    charter_text: "invalid",
    compiled_at: new Date().toISOString(),
    compiler: "fixture",
    allowed_assets: ["BTC"],
    allowed_products: ["SPOT"],
    allowed_quote_assets: ["USDT"],
    max_position_pct: 10,
    max_leverage: 1,
    max_daily_loss_pct: 100,
    max_violations: 2,
    quarantine_enabled: true,
    quarantine_counts_from: ["rule.asset", "rule.override"],
    fail_closed: true,
    dust_usdt: 0.01,
  };
}
