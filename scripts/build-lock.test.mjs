import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { acquireBuildLock } from './build-lock.mjs';
import { findConflictingRuntimes } from './build-runtime-check.mjs';

async function fixture(run) {
  const root = await mkdtemp(path.join(tmpdir(), 'studio-build-lock-'));
  try { await mkdir(path.join(root, '.data')); await run(root, path.join(root, '.data/build.lock')); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test('rejected contender preserves the live owner lock regardless of its age', () => fixture(async (root, file) => {
  const owner = JSON.stringify({ pid: process.pid, token: 'owner', at: 0 });
  await writeFile(file, owner);
  await assert.rejects(acquireBuildLock(root, { waitMs: 20, pollMs: 5 }), /owns the lock/);
  assert.equal(await readFile(file, 'utf8'), owner);
}));

test('a dead owner is reclaimed and concurrent contenders remain exclusive', () => fixture(async (root, file) => {
  const child = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
  await writeFile(file, JSON.stringify({ pid: child.pid, token: 'dead' }));
  let active = 0;
  await Promise.all(Array.from({ length: 5 }, async () => {
    const release = await acquireBuildLock(root, { waitMs: 2000, pollMs: 5 });
    assert.equal(++active, 1);
    await new Promise(resolve => setTimeout(resolve, 20));
    active--;
    release(); release();
  }));
  await assert.rejects(readFile(file), { code: 'ENOENT' });
}));

test('release cannot remove a replacement lock', () => fixture(async (root, file) => {
  const release = await acquireBuildLock(root);
  const replacement = JSON.stringify({ pid: process.pid, token: 'replacement' });
  await writeFile(file, replacement);
  release();
  assert.equal(await readFile(file, 'utf8'), replacement);
}));

test('corrupt owner metadata is retained for explicit inspection', () => fixture(async (root, file) => {
  await writeFile(file, 'incomplete');
  await assert.rejects(acquireBuildLock(root, { waitMs: 10, pollMs: 5 }));
  assert.equal(await readFile(file, 'utf8'), 'incomplete');
}));

test('runtime preflight distinguishes this checkout from unrelated apps', () => {
  const root = path.resolve('checkout');
  const rows = [
    { ProcessId: 1, Name: 'node.exe', CommandLine: `node "${root}/.next/standalone/server.js"` },
    { ProcessId: 2, Name: 'electron.exe', CommandLine: `electron "${root}"` },
    { ProcessId: 3, Name: 'electron.exe', CommandLine: `electron --type=renderer "${root}"` },
    { ProcessId: 4, Name: 'node.exe', CommandLine: 'node unrelated/server.js' },
  ];
  assert.deepEqual(findConflictingRuntimes(rows, root, 999).map(r => r.ProcessId), [1, 2]);
});

test('failed build child releases only its own CLI lock', () => fixture(async (root, file) => {
  const next = path.join(root, 'node_modules/next/dist/bin');
  await mkdir(next, { recursive: true });
  await writeFile(path.join(next, 'next'), 'process.exit(7)');
  const wrapper = new URL('./build-locked.mjs', import.meta.url);
  const { fileURLToPath } = await import('node:url');
  const result = spawnSync(process.execPath, [fileURLToPath(wrapper), 'build'], { cwd: root, encoding: 'utf8', timeout: 20_000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /failed \(7\)/);
  await assert.rejects(readFile(file), { code: 'ENOENT' });
}));
