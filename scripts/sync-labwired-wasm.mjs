#!/usr/bin/env node
// Fetch the labwired-wasm artifact — the HEAVY simulation tier's engine.
//
// STM32-PATH.md Phase 4: the hand-rolled CortexM0Machine is the light tier
// (M0-class, peripherals capped at what our codegen emits); everything beyond —
// foreign binaries, F103/F4, RISC-V, Xtensa/ESP32 — goes through labwired. The
// boundary-A adapter that drives it is bw-board's `labwired-adapter.js`.
//
// WHY THIS IS FETCHED AND NOT COMMITTED, UNLIKE emu8051
// -----------------------------------------------------
// emu8051.wasm is 92 KB and lives in the overlay. This one is 20 MB — 200x
// that — and lite has just dropped 70k tracked files to stop carrying
// generated content. So the artifact is published once as a release asset on
// our fork and fetched at build time, and the destination sits under
// `packages/scratch-gui/`, which .gitignore already covers wholesale.
//
// WHAT MAKES A MUTABLE NAME SAFE HERE
// -----------------------------------
// A release TAG is movable and an asset can be re-uploaded under the same
// name, so the URL alone is NOT an immutable reference — the census in
// test/fetch-pinning.test.mjs is right to care. What makes this safe is that
// nothing is written before its sha256 matches EXPECT below: a moved tag, a
// replaced asset or a compromised CDN all fail closed. That is strictly
// stronger than sha-addressing, which authenticates the NAME and then trusts
// whatever bytes arrive. PIN records which SOURCE commit the artifact was
// built from, so the bytes can always be reproduced:
//
//   node scripts/build-labwired-wasm.mjs --ref <PIN>
//
// Bump PIN, TAG and EXPECT together, from that script's BUILD-INFO.json.
//
//   --check   verify without writing (CI drift gate)
//
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {fetchRetry} from './lib-pin.mjs';

/** The SOURCE commit of CrispStrobe/labwired-core the artifact was built from.
 *  Full 40 hex: an abbreviation is not a name anything can fetch by. */
const PIN = '0c0cd0ec3f10c5b291a2bf53705df5cd09765728';
/** The release that carries the built artifact. */
// The release lives on bw-board, not on the labwired fork: the fork stays a
// clean mirror of upstream (it is synced, and a workflow of ours would diverge
// it), while bw-board already owns the build script and is what lite vendors
// from. Built and PUBLISHED by CI — two independent runners agreed byte for
// byte before the asset was uploaded, so the sha256 below is a claim anyone can
// re-derive rather than one machine's fingerprint.
const TAG = 'labwired-wasm-0c0cd0ec';
const REPO = 'CrispStrobe/bw-board';
// The WEB glue, not the nodejs one. The published release carries both: the
// nodejs glue require()s and reads the module off disk, which cannot survive a
// browser bundle. Asset names carry their target because a release's assets are
// one flat namespace.
const EXPECT = {
    'web-labwired_wasm.js': 'a25e1e596ae1afb97e946b9658e466b907908e1f36fb32e9cfb00c0ac0dd848f',
    'web-labwired_wasm_bg.wasm': 'ea1e375ae2f29decc2dbf5774f0266ab6d9343fdd5213066f7dba58e98db0a47'
};
/** What each asset is called once it is ours. */
const LOCAL = {
    'web-labwired_wasm.js': 'labwired_wasm.js',
    'web-labwired_wasm_bg.wasm': 'labwired_wasm_bg.wasm'
};

const here = path.dirname(fileURLToPath(import.meta.url));
// static/, not src/. Webpack copies `static -> static` wholesale, so the engine
// is served as a plain asset and fetched at RUNTIME — which means a checkout
// that never ran this script still BUILDS. Putting it under src/ and importing
// it would make webpack resolve the path at build time, so its absence would be
// a build failure rather than an engine that is simply not offered, and lite
// could never be built without shipping 20 MB.
//
// packages/scratch-gui/ is covered by .gitignore line 8, so nothing here is
// ever tracked.
const dest = path.join(here, '..', 'packages', 'scratch-gui', 'static', 'labwired');
const check = process.argv.includes('--check');

await mkdir(dest, {recursive: true});
let changed = 0;
for (const [name, want] of Object.entries(EXPECT)) {
    const out = path.join(dest, LOCAL[name]);
    const current = await readFile(out).catch(() => null);
    if (current && createHash('sha256').update(current).digest('hex') === want) {
        console.log(`  ok    ${LOCAL[name]} (${current.length} bytes, sha256 verified)`);
        continue;
    }
    changed++;
    if (check) { console.log(`  STALE ${name}`); continue; }

    const url = `https://github.com/${REPO}/releases/download/${TAG}/${name}`;
    let res;
    try {
        res = await fetchRetry(url);
    } catch (e) {
        throw new Error(`fetch ${name} @ ${TAG}: ${e.message}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const got = createHash('sha256').update(buf).digest('hex');
    if (got !== want) {
        throw new Error(`${name}: SHA-256 mismatch\n  expected ${want}\n  got      ${got}\n`
            + 'Refusing to write an unverified binary. A release tag is movable and an '
            + 'asset can be replaced under the same name, so this check is the only thing '
            + 'standing between the build and whatever the CDN served. If the artifact was '
            + 'deliberately rebuilt, regenerate it with scripts/build-labwired-wasm.mjs and '
            + 'update PIN, TAG and EXPECT together from its BUILD-INFO.json.');
    }
    await writeFile(out, buf);
    console.log(`  wrote ${LOCAL[name]} (${buf.length} bytes, sha256 verified)`);
}
if (check && changed) { console.error(`\n${changed} stale — run: npm run sync:labwiredwasm`); process.exit(1); }
console.log(check
    ? '\nlabwired-wasm up to date.'
    : `\nfetched ${TAG}, built from labwired-core@${PIN}.`);
