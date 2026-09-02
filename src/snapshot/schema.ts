import { z } from "zod";

export const AccountSnapshotSchema = z
  .object({
    ok: z.boolean(),
    source: z.enum(["live_mcp", "recorded_live", "fixture"]),
    captured_at: z.string().min(1),
    quote: z.string().min(1),
    balances: z.record(z.string(), z.number()),
    marks: z.record(z.string(), z.number()),
    starting_nav_today: z.number().nonnegative(),
    error: z.string().optional(),
  })
  .strict();

export type AccountSnapshot = z.infer<typeof AccountSnapshotSchema>;
