import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('.next/standalone');
for (const file of await readdir(root)) {
  if (file.startsWith('.env')) await rm(path.join(root, file));
}
await mkdir(path.join(root, '.next'), { recursive: true });
await cp('public', path.join(root, 'public'), { recursive: true });
await cp('.next/static', path.join(root, '.next/static'), { recursive: true });
// Windows tracing can omit Next's dynamically required server modules.
await cp('node_modules/next', path.join(root, 'node_modules/next'), { recursive: true, dereference: true });
await cp('node_modules/@electric-sql/pglite', path.join(root, 'node_modules/@electric-sql/pglite'), { recursive: true, dereference: true });
await mkdir(path.join(root, 'src/lib/db'), { recursive: true });
await cp('src/lib/db/migrations', path.join(root, 'src/lib/db/migrations'), { recursive: true });
console.log('Desktop server prepared.');
