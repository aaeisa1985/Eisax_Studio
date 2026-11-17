import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Serializes operations that write `.next` (production build and desktop
 * preparation). Running two of them at once corrupts Next's output with
 * ENOENT pages-manifest/vendor-chunk errors.
 */
const mode = process.argv[2];
if (mode !== "build" && mode !== "desktop") {
  console.error("Usage: node scripts/build-locked.mjs build|desktop");
  process.exit(2);
}

const root = process.cwd();
const lockDir = path.resolve(root, ".data");
const lockFile = path.join(lockDir, "build.lock");
const STALE_MS = 15 * 60 * 1000;
const MAX_WAIT_MS = 20_000;
mkdirSync(lockDir, { recursive: true });

let fd;
let child;
let released = false;

function releaseSync() {
  if (released) return;
  released = true;
  if (fd !== undefined) {
    try { closeSync(fd); } catch {}
    fd = undefined;
  }
  try { rmSync(lockFile, { force: true }); } catch {}
}

async function acquire() {
  const deadline = Date.now() + MAX_WAIT_MS;
  for (;;) {
    try {
      fd = openSync(lockFile, "wx");
      writeFileSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }));
      return;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      let stale = false;
      try {
        const info = JSON.parse(readFileSync(lockFile, "utf8"));
        stale = typeof info?.at === "number" && Date.now() - info.at > STALE_MS;
      } catch {}
      if (stale) {
        rmSync(lockFile, { force: true });
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error("Another EISAX Studio build or desktop preparation is running. Wait for it to finish, then retry.");
      }
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }
}

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
    child?.kill(signal);
    releaseSync();
    process.exit(130);
  });
}
process.on("exit", releaseSync);

try {
  await acquire();
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
  released = false;
  releaseSync();
}
