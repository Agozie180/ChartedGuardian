import { z } from "zod";

export const DecisionKindSchema = z.enum(["APPROVE", "BLOCK", "QUARANTINE"]);
export type DecisionKind = z.infer<typeof DecisionKindSchema>;

export const ExecutionSchema = z
  .object({
    attempted: z.boolean(),
    ok: z.boolean().optional(),
    mcp_tool: z.string().nullable().optional(),
    mcp_result: z.unknown().optional(),
    skipped_reason: z.string().optional(),
    error: z.string().optional(),
  })
  .strict();

export const DecisionSchema = z
  .object({
    decision: DecisionKindSchema,
    intent_id: z.string(),
    policy_version: z.number().int(),
    matched_rule_ids: z.array(z.string()),
    violated_rules: z.array(z.string()),
    reasons: z.array(z.string()),
    risk_summary: z.record(z.string(), z.unknown()),
    next_action: z.record(z.string(), z.unknown()),
    computed: z.object({
      nav_quote: z.number(),
      current_exposure_pct: z.number(),
      projected_exposure_pct: z.number(),
      daily_loss_pct: z.number(),
    }),
    violation_count_after: z.number().int().nonnegative(),
    agent_status_after: z.enum(["LIVE", "QUARANTINED"]),
    execution: ExecutionSchema,
  })
  .strict();

export type Decision = z.infer<typeof DecisionSchema>;
