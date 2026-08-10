#!/usr/bin/env node
// Sync bw-parts sidecar JSONs into the bw-circuit-ui overlay.
// Source of truth: bw-parts/parts/*.json (via bw-circuit-ui's vendored copy).
//
//   node scripts/sync-parts-data.mjs [--check]
//
// --check verifies the overlay matches bw-circuit-ui's parts-data without writing.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const src = join(HERE, '..', '..', '..', 'bw-circuit-ui', 'src', 'parts-data');
const dst = join(HERE, '..', 'overlay', 'scratch-gui', 'src', 'lib', 'bw-circuit-ui', 'parts-data');
const check = process.argv.includes('--check');

if (!existsSync(src)) {
    console.error(`sync-parts-data: source not found: ${src}`);
    console.error('(expected bw-circuit-ui at ../../bw-circuit-ui relative to lite)');
    process.exit(check ? 0 : 1); // --check on CI without the source is not a failure
}

mkdirSync(dst, { recursive: true });

const srcFiles = readdirSync(src).filter(f => f.endsWith('.json')).sort();
const dstFiles = existsSync(dst)
    ? readdirSync(dst).filter(f => f.endsWith('.json')).sort()
    : [];

let stale = 0;
for (const f of srcFiles) {
    const srcContent = readFileSync(join(src, f), 'utf8');
    const dstPath = join(dst, f);
    const dstContent = existsSync(dstPath) ? readFileSync(dstPath, 'utf8') : null;
    if (srcContent !== dstContent) {
        stale++;
        if (check) {
            console.log(`  STALE ${f}`);
        } else {
            writeFileSync(dstPath, srcContent);
            console.log(`  wrote ${f}`);
        }
    }
}

if (check && stale) {
    console.error(`\n${stale} stale sidecar(s) — run: node scripts/sync-parts-data.mjs`);
    process.exit(1);
}
console.log(check
    ? `parts-data: ${srcFiles.length} files, all up to date.`
    : `synced ${srcFiles.length} sidecar(s) from bw-circuit-ui.`);
