#!/usr/bin/env node
// Sync the vendored emu8051-stc WASM (tier-2 instruction-accurate simulation).
//
// This is the only BINARY in the overlay, so it is the one vendored artifact that cannot be
// read and judged by eye. It is therefore the one with a hard integrity check: the upstream
// repo records a SHA-256 for each file in build/BUILD-INFO.md, and this script refuses to
// write anything whose hash does not match the expectation pinned below.
//
// That check is not theoretical. When this was first vendored, the upstream WORKING TREE had
// been rebuilt and no longer matched the committed, audited artifact (55529 bytes vs 55526).
// Vendoring from a checkout's build/ directory would have shipped an unaudited binary.
//
// Licence: the C is MIT (emu8051, © Jari Komppa; STC12 model by CrispStrobe). The binary also
// contains Emscripten's runtime glue — MIT / University of Illinois. See THIRD-PARTY.md.
//
//   --check      verify without writing.
//   --ref <r>    a branch/tag/sha of CrispStrobe/emu8051-stc (default: the pinned commit).

import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolveRef, fetchRetry} from './lib-pin.mjs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

// Pinned to the commit whose BUILD-INFO.md records these hashes. Bump both together.
//
// FULL 40-HEX, and that is not pedantry. This read `'2f1855a'` — seven
// characters — and an abbreviated sha is not an immutable name: git's own
// abbreviation is unique only within one repository at one moment, it grows as
// the repo does, and nothing here would notice if it became ambiguous. The same
// shape cost this fleet seven blind CI commits when an abbreviated pin named a
// commit that could not be fetched. The abbreviation also HID a discrepancy in
// this very comment, which called `e04b15a` "current" while PIN was a different
// commit: they are two real commits four hours apart
// (e04b15a0b0b8561556c32dfb40e1fbb04b1029b5, 2026-08-16T15:42Z — the P5/STC15
// port that exports _emu_set_part) and PIN is the later fix on top of it.
//
// This is the one vendored artifact with an integrity check STRONGER than
// sha-addressing: EXPECT below is the content hash of each file, so even a
// compromised CDN cannot substitute a binary. The pin says WHICH build; the
// hashes say WHAT arrived. Keep both.
const PIN = '2f1855a26dacd17619e6d398bbd9b0ae177a476a';
const EXPECT = {
    'emu8051.wasm': '329a85f5a3fc93c02e4a3e8604d11c04dca221ca89ccc46c1c836e4ba50bc808',
    'emu8051.js': 'b8cdeacdda0b7fb2e5608881deead877d0a497f60b4a074d91bec3e9733ee365'
};

const here = path.dirname(fileURLToPath(import.meta.url));
const dest = path.join(here, '..', 'overlay', 'scratch-gui', 'src', 'lib', 'emu8051');
const check = process.argv.includes('--check');
const refIdx = process.argv.indexOf('--ref');
const refArg = refIdx !== -1 ? process.argv[refIdx + 1] : PIN;

// `--ref` accepts a branch or tag for convenience, and a branch on the raw CDN
// is a cached URL that can serve an older commit. Resolve it to a sha before
// any content is fetched, so what the run REPORTS is what it read. A full sha
// is returned untouched and costs no request.
const {sha: ref, resolved} = await resolveRef('CrispStrobe/emu8051-stc', refArg);
if (resolved) console.log(`  resolved ${refArg} -> ${ref}`);

await mkdir(dest, {recursive: true});
let changed = 0;
for (const [name, want] of Object.entries(EXPECT)) {
    const url = `https://raw.githubusercontent.com/CrispStrobe/emu8051-stc/${ref}/build/${name}`;
    // raw.githubusercontent rate-limits CI bursts (HTTP 429 killed two
    // deploys on 2026-08-17 after the ancestry check had already passed).
    // Retry with backoff, honoring Retry-After when present.
    let res;
    try {
        res = await fetchRetry(url);
    } catch (e) {
        throw new Error(`fetch ${name} @ ${ref}: ${e.message}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const got = createHash('sha256').update(buf).digest('hex');
    if (got !== want) {
        throw new Error(`${name}: SHA-256 mismatch\n  expected ${want}\n  got      ${got}\n`
            + 'Refusing to vendor an unverified binary. If this is an intentional rebuild, '
            + 'update PIN and EXPECT together from the upstream build/BUILD-INFO.md.');
    }
    const out = path.join(dest, name);
    const current = await readFile(out).catch(() => null);
    if (current && createHash('sha256').update(current).digest('hex') === got) {
        console.log(`  ok    ${name} (${buf.length} bytes, sha256 verified)`);
        continue;
    }
    changed++;
    if (check) { console.log(`  STALE ${name}`); continue; }
    await writeFile(out, buf);
    console.log(`  wrote ${name} (${buf.length} bytes, sha256 verified)`);
}
if (check && changed) { console.error(`\n${changed} stale — run: npm run sync:emuwasm`); process.exit(1); }
// The full sha, not `.slice(0, 8)`. An abbreviation in the RECORD is the same
// defect as an abbreviation in the pin: it is not a name anything can fetch by
// with certainty, and it is what a later reader copies.
console.log(check ? '\nvendored WASM up to date.' : `\nsynced from emu8051-stc@${ref}. Next: npm run integrate`);
