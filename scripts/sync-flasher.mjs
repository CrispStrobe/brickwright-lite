#!/usr/bin/env node
// Sync the browser flasher (flash.js) from stc-compiler into the overlay.
//
// flash.js is the ONE tested implementation of every family's flashing
// protocol over Web Serial — AVR STK500v1, MicroPython raw REPL, STC ISP,
// and STM32 AN3155 — with a mock-bootloader test suite in stc-compiler
// (scripts/test-flash.mjs). Lite vendors it so the IDE's "Flash to board"
// button uses the same bytes the stc-compiler page proved, rather than a
// second copy that could drift.
//
//   --check      exit non-zero (without writing) if the vendored copy is stale.
//   --dir <path> read from a local stc-compiler checkout (default: over HTTP).
//
// Same contract as the other sync-*.mjs: pinned by sha, self-heals a
// partial cache, records the pin.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolveRef, recordPin } from './lib-pin.mjs';
import path from 'node:path';

const REPO = 'CrispStrobe/stc-compiler';
const REF = process.env.STC_COMPILER_REF || 'main';
const REL = 'docs/flash.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const dest = path.join(here, '..', 'overlay', 'scratch-gui', 'src', 'lib', 'flasher.js');
const check = process.argv.includes('--check');
const dirIdx = process.argv.indexOf('--dir');
const srcDir = dirIdx !== -1 ? process.argv[dirIdx + 1] : null;

let sha = null;
async function source () {
    if (srcDir) return readFile(path.join(srcDir, REL), 'utf8');
    sha = (await resolveRef(REPO, REF)).sha;
    const res = await fetch(`https://raw.githubusercontent.com/${REPO}/${sha}/${REL}`);
    if (!res.ok) throw new Error(`fetch ${REL} @ ${sha}: HTTP ${res.status}`);
    return res.text();
}

// The overlay copy carries a header saying where it came from and that it
// is generated, so nobody hand-edits it (edits go to stc-compiler).
const BANNER = '// VENDORED from CrispStrobe/stc-compiler docs/flash.js — do NOT edit here.\n'
    + '// Change it there (it has the mock-bootloader tests), then `npm run sync:flasher`.\n';

const next = BANNER + (await source());
const current = await readFile(dest, 'utf8').catch(() => null);

if (current === next) {
    console.log('  ok    flasher.js');
} else if (check) {
    console.error('  STALE flasher.js — run: npm run sync:flasher');
    process.exit(1);
} else {
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, next);
    console.log('  wrote flasher.js');
}

if (!check && sha) recordPin('stc-compiler-flasher', sha);
console.log(srcDir
    ? `synced from ${REPO} docs/flash.js (local checkout ${srcDir})`
    : `synced from ${REPO}@${sha} docs/flash.js`);
