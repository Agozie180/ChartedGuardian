import { beats, type BeatId } from "./beats.ts";

/** Cheap host-agent capture: same JSON, different source. No LLM. */
export function hostAgentIntent(beat: BeatId) {
  return { ...beats[beat], source: "host_agent" as const };
}
