import { randomUUID } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}

function readOwner(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

export async function acquireBuildLock(root, { waitMs = 20_000, pollMs = 100 } = {}) {
  const folder = path.join(root, '.data');
  mkdirSync(folder, { recursive: true });
  const file = path.join(folder, 'build.lock');
  const recoveryFile = `${file}.recovery`;
  const token = randomUUID();
  const deadline = Date.now() + waitMs;
  let held = false;
  function claim() {
    let fd;
    try {
      fd = openSync(file, 'wx');
      writeFileSync(fd, JSON.stringify({ pid: process.pid, token, at: Date.now() }));
      held = true;
      return true;
    } catch (error) {
      if (fd !== undefined) { closeSync(fd); fd = undefined; unlinkSync(file); }
      if (error.code !== 'EEXIST') throw error;
      return false;
    } finally { if (fd !== undefined) closeSync(fd); }
  }
  while (!claim()) {
    const owner = readOwner(file);
    if (owner && Number.isInteger(owner.pid) && owner.pid > 0 && !pidAlive(owner.pid)) {
      // Serialize reclamation: two waiters must never unlink each other's new lock.
      let recoveryFd;
      try {
        recoveryFd = openSync(recoveryFile, 'wx');
        const current = readOwner(file);
        if (current && current.pid === owner.pid && current.token === owner.token && !pidAlive(current.pid)) {
          unlinkSync(file);
          claim();
        }
      } catch (error) { if (!['EEXIST', 'ENOENT'].includes(error.code)) throw error; }
      finally {
        if (recoveryFd !== undefined) { closeSync(recoveryFd); unlinkSync(recoveryFile); }
      }
      if (held) break;
    }
    if (Date.now() >= deadline) throw new Error(`Another EISAX Studio build or desktop preparation owns the lock (pid ${owner?.pid ?? 'unknown'}). A live or unreadable lock is never removed automatically.`);
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }
  return () => {
    if (!held) return;
    held = false;
    if (readOwner(file)?.token === token) {
      try { unlinkSync(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  };
}
