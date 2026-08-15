#!/usr/bin/env node
// Sync bw-parts sidecar JSONs into the bw-circuit-ui overlay.
// Source of truth: bw-parts/parts/*.json (via bw-circuit-ui's vendored copy).
//
//   node scripts/sync-parts-data.mjs [--check]
//
// --check verifies the overlay matches bw-circuit-ui's parts-data without writing.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { guardSource } from './lib-source-guard.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// --dir <bw-circuit-ui checkout> overrides the historical local layout
// (../../../bw-circuit-ui, i.e. lite living under lego/). CI passes it
// explicitly so the workspace shape stays flat and boring there.
const dirIdx = process.argv.indexOf('--dir');
const srcRoot = dirIdx !== -1 ? process.argv[dirIdx + 1]
    : join(HERE, '..', '..', '..', 'bw-circuit-ui');
if (dirIdx !== -1 && srcRoot) guardSource(srcRoot);
const src = join(srcRoot, 'src', 'parts-data');
const dst = join(HERE, '..', 'overlay', 'scratch-gui', 'src', 'lib', 'bw-circuit-ui', 'parts-data');
const check = process.argv.includes('--check');

if (!existsSync(src)) {
    console.error(`sync-parts-data: source not found: ${src}`);
    // An EXPLICIT --dir that does not exist is a broken invocation and
    // must never green a gate; only the implicit local default may be
    // absent harmlessly under --check.
    process.exit(dirIdx !== -1 ? 2 : (check ? 0 : 1));
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
