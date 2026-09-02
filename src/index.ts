import { createAppServer } from "./server/http.ts";
import { compileDemoCharter } from "./policy/fixture-compiler.ts";
import { loadPolicyFile, savePolicyFile } from "./store/fs-store.ts";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 8787);

if (!loadPolicyFile()) savePolicyFile(compileDemoCharter());

const server = createAppServer();
server.listen(port, host, () => {
  console.log(`CHARTER GUARDIAN  http://${host}:${port}`);
  console.log(`EXECUTION_MODE=${process.env.EXECUTION_MODE ?? "off"}  (default off — no live trades)`);
});
