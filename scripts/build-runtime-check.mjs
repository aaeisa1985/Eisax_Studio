import { execFileSync } from 'node:child_process';
import path from 'node:path';

export function findConflictingRuntimes(rows, root, ownPid = process.pid) {
  const normalized = path.resolve(root).replaceAll('\\', '/').toLowerCase();
  return rows.filter(row => {
    if (Number(row.ProcessId) === ownPid) return false;
    const cmd = String(row.CommandLine || '').replaceAll('\\', '/').toLowerCase();
    if (cmd.includes(`${normalized}/.next/standalone/server.js`)) return true;
    // Electron's main process owns the project's standalone server; never kill it.
    return String(row.Name).toLowerCase() === 'electron.exe' && !cmd.includes('--type=') && cmd.includes(`"${normalized}"`);
  });
}

export function assertNoBuildRuntime(root) {
  if (process.platform !== 'win32') return;
  const script = "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -or $_.Name -eq 'electron.exe' } | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress";
  const raw = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true });
  const parsed = raw.trim() ? JSON.parse(raw) : [];
  const conflicts = findConflictingRuntimes(Array.isArray(parsed) ? parsed : [parsed], root);
  if (conflicts.length) throw new Error(`Close this project's desktop/standalone server before building (PID ${conflicts.map(p => p.ProcessId).join(', ')}). No process was stopped.`);
}
