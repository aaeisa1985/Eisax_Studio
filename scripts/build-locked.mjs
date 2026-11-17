import { spawn } from "node:child_process";
import path from "node:path";
import { acquireBuildLock } from "./build-lock.mjs";
import { assertNoBuildRuntime } from "./build-runtime-check.mjs";

const mode = process.argv[2];
if (mode !== "build" && mode !== "desktop") {
  console.error("Usage: node scripts/build-locked.mjs build|desktop");
  process.exit(2);
}
const root = process.cwd();
let child;
let release = () => {};
let stopping = false;
let shutdown = Promise.resolve();

function run(command, args) {
  return new Promise((resolve, reject) => {
    child = spawn(command, args, { cwd: root, stdio: "inherit" });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      child = undefined;
      if (signal || code !== 0) reject(new Error(`${path.basename(command)} ${args.join(" ")} failed (${signal ?? code})`));
      else resolve();
    });
  });
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    stopping = true;
    if (child && process.platform === "win32") {
      const pid = child.pid;
      shutdown = new Promise(resolve => {
        const killer = spawn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        killer.once("error", resolve);
        killer.once("close", resolve);
      });
    } else if (child) child.kill(signal);
    // The awaited child close handler runs before finally releases our lock.
    else { release(); process.exit(130); }
  });
}

try {
  release = await acquireBuildLock(root);
  if (stopping) throw new Error("Build interrupted");
  assertNoBuildRuntime(root);
  const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
  await run(process.execPath, [nextBin, "build"]);
  if (mode === "desktop") {
    await run(process.execPath, [path.join(root, "scripts", "prepare-desktop.mjs")]);
  }
  console.log(mode === "desktop" ? "Build + desktop preparation completed." : "Build completed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await shutdown;
  release();
}
