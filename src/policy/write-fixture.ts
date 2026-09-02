import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileDemoCharter } from "./fixture-compiler.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = join(root, "data", "fixtures", "policy.demo.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(compileDemoCharter(), null, 2) + "\n");
console.log(`wrote ${out}`);
