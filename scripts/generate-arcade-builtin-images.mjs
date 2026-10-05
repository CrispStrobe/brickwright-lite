#!/usr/bin/env node
// Regenerate the built-in Arcade image table (sprites.castle.tileGrass1,
// sprites.food.smallApple, ...) from the pinned pxt-arcade bundle that
// `npm run sync:makecode` installs: target.json's `device` package, its
// *.jres image resources (pxt-arcade, MIT; static/licenses/pxt-common-packages.MIT.txt).
//   node scripts/generate-arcade-builtin-images.mjs          write the table
//   node scripts/generate-arcade-builtin-images.mjs --check  fail if it differs
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const bundlePath = resolve(root, 'packages/scratch-gui/static/makecode/arcade/target.json');
let bundle;
try {
    bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
} catch (error) {
    throw new Error(`no pinned pxt-arcade bundle at ${bundlePath} — run \`npm run sync:makecode\` (${error.message})`);
}
const device = bundle.bundledpkgs && bundle.bundledpkgs.device;
if (!device) throw new Error('the pinned pxt-arcade bundle has no device package');
const entries = new Map();
for (const file of Object.keys(device).filter(name => name.endsWith('.jres')).sort()) {
    const data = JSON.parse(device[file]);
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
const content = `// Generated from pxt-arcade ${bundle.versions.target} (the pinned bundle), device/*.jres (MIT).\n` +
    `// Copyright (c) Microsoft Corporation. See static/licenses/pxt-common-packages.MIT.txt.\n` +
    `// Regenerate with scripts/generate-arcade-builtin-images.mjs.\n` +
    `export const BUILTIN_IMAGES = Object.freeze({\n${rows.join(',\n')}\n});\n`;
const output = resolve(root, 'overlay/scratch-gui/src/lib/bw-makecode/arcade-builtin-images.js');
if (process.argv.includes('--check')) {
    if (readFileSync(output, 'utf8') !== content) {
        throw new Error('arcade-builtin-images.js differs from the pinned pxt-arcade bundle — run scripts/generate-arcade-builtin-images.mjs');
    }
    console.log(`Verified ${entries.size} PXT Arcade built-in images against pxt-arcade ${bundle.versions.target}`);
} else {
    writeFileSync(output, content);
    console.log(`${entries.size} PXT Arcade built-in images written to ${output}`);
}
