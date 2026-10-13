import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
const result = spawnSync(process.execPath, [path.join(root, 'node_modules/tailwindcss/lib/cli.js'),
  '-c', path.join(root, 'tailwind.config.cjs'), '-i', path.join(root, 'src/input.css'),
  '-o', path.join(root, 'assets/crm.css'), '--minify'], { cwd: root, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
