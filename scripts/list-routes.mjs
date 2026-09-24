import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC_DIR = join(process.cwd(), 'src');
const METHODS = ['Get', 'Post', 'Put', 'Patch', 'Delete', 'All', 'Options', 'Head'];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.controller\.ts$/.test(entry)) out.push(full);
  }
  return out;
}

function normalize(...parts) {
  const trimmed = parts
    .filter(Boolean)
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '');
  return trimmed ? `/${trimmed}` : '/';
}

function parseController(file) {
  const src = readFileSync(file, 'utf8');
  const ctrlMatch = src.match(/@Controller\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)/);
  const prefix = ctrlMatch ? (ctrlMatch[1] ?? ctrlMatch[2] ?? '') : '';
  const routes = [];
  const re = new RegExp(
    `@(${METHODS.join('|')})\\(\\s*(?:'([^']*)'|"([^"]*)")?\\s*\\)`,
    'g',
  );
  let m;
  while ((m = re.exec(src)) !== null) {
    const method = m[1].toUpperCase() === 'ALL' ? 'ALL' : m[1].toUpperCase();
    const subPath = m[2] ?? m[3] ?? '';
    routes.push({ method, path: normalize(prefix, subPath) });
  }
  return { file: relative(process.cwd(), file), routes };
}

const files = walk(SRC_DIR);
if (files.length === 0) {
  console.log('No controllers found in src/');
  process.exit(0);
}

const rows = files.sort().flatMap((f) => parseController(f).routes);
const w = Math.max(...rows.map((r) => r.method.length), 6);
console.log(`\nAvailable routes (${rows.length}):\n`);
for (const r of rows) console.log(`  ${r.method.padEnd(w)}  ${r.path}`);
console.log('');
