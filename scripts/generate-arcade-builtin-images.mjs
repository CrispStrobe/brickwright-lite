#!/usr/bin/env node
// Regenerate the built-in Arcade image table from a pinned pxt-arcade checkout.
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {execFileSync} from 'node:child_process';

const checkout = process.argv[2];
if (!checkout) throw new Error('usage: node scripts/generate-arcade-builtin-images.mjs /path/to/pxt-arcade');
const revision = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {cwd: checkout, encoding: 'utf8'}).trim();
if (revision !== '8ae4f42') throw new Error(`expected pxt-arcade 8ae4f42, got ${revision}`);
const source = resolve(checkout, 'libs/device');
const output = resolve(import.meta.dirname, '../overlay/scratch-gui/src/lib/bw-makecode/arcade-builtin-images.js');
const entries = new Map();
for (const file of (await readdir(source)).filter(name => name.endsWith('.jres')).sort()) {
    const data = JSON.parse(await readFile(join(source, file), 'utf8'));
    const namespace = data['*']?.namespace;
    if (!namespace || data['*']?.mimeType !== 'image/x-mkcd-f4') continue;
    for (const [name, value] of Object.entries(data)) {
        if (name === '*' || typeof value !== 'string' || !value.startsWith('hwQ')) continue;
        const key = `${namespace}.${name}`;
        if (entries.has(key) && entries.get(key) !== value) throw new Error(`conflicting Arcade image ${key}`);
        entries.set(key, value);
    }
}
if (entries.size < 500) throw new Error(`incomplete PXT image table: ${entries.size}`);
const rows = [...entries].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) =>
    `    ${JSON.stringify(key)}: ${JSON.stringify(value)}`);
await writeFile(output, `// Generated from pxt-arcade 8ae4f42, libs/device/*.jres (MIT).\n` +
    `// Regenerate with scripts/generate-arcade-builtin-images.mjs.\n` +
    `export const BUILTIN_IMAGES = Object.freeze({\n${rows.join(',\n')}\n});\n`);
console.log(`${entries.size} PXT Arcade built-in images written to ${output}`);
