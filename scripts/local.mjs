import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

// Bind to loopback: the local profile is personal and does not require login.
const args = process.argv.slice(2);
const dev = args.includes("--dev");
if (!dev && !existsSync(".next/BUILD_ID")) {
  console.error("Run npm run build first, or use npm run local:dev for development.");
  process.exit(1);
}
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", dev ? "dev" : "start", "--hostname", "127.0.0.1", ...args.filter((arg) => arg !== "--dev")], {
  stdio: "inherit",
  env: { ...process.env, EISAX_LOCAL_MODE: "true" },
});
child.on("exit", (code) => process.exit(code ?? 1));
