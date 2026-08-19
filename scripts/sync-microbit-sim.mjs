#!/usr/bin/env node
// Sync the self-hosted micro:bit MicroPython v2 simulator assets.
//
// The simulator (MIT, microbit-foundation/micropython-microbit-v2-simulator) is a
// WASM-compiled MicroPython runtime + board SVG + display/pin/button UI that runs
// entirely client-side. We self-host it so the app works offline and we don't
// hotlink the Foundation's CDN.
//
// The build requires emscripten (emcc) + the MicroPython submodule, so we vendor
// the built artifacts rather than rebuilding in CI. To rebuild:
//
//   cd /tmp/micropython-microbit-v2-simulator
//   source ~/emsdk/emsdk_env.sh
//   git submodule update --init --recursive
//   cd lib/micropython-microbit-v2/lib/micropython/mpy-cross && make CFLAGS_EXTRA="-Wno-error" -j4 && cd -
//   make dist
//
// Then re-run this script with --dir pointing at the repo's build/ output.
//
//   --dir <path>   copy from a local build directory (default: overlay already has them)
//   --check        verify the files exist without modifying (CI)

import {readFile, writeFile, mkdir, copyFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const dest = path.join(here, '..', 'overlay', 'scratch-gui', 'static', 'microbit-sim');
const check = process.argv.includes('--check');
const dirIdx = process.argv.indexOf('--dir');
const srcDir = dirIdx !== -1 ? process.argv[dirIdx + 1] : null;

// From upstream: only the sim UI (page + simulator.js). NOT the firmware —
// upstream's `make dist` firmware is built with an ancient/mismatched toolchain
// whose wasm OOBs on `for`-over-generator (the exact shape of our task
// scheduler), so NOTHING task-shaped ever ran on it. See OURS below.
const FILES = [
    ['simulator.html', 'simulator.html'],
    ['build/simulator.js', 'build/simulator.js']
];

// Our own firmware + loader, built in the pinned emsdk-3.1.25 container (see
// build-debug/README.md) — NOT synced from upstream:
//   build/firmware.{js,wasm}        the STOCK (OFF) build — plain Run + block
//                                   debug. Replaces upstream's broken wasm.
//   build-debug/firmware.{js,wasm}  the settrace (ON) build — line-level debug.
// The glue (firmware.js) is byte-identical between the two builds (one emsdk),
// but each dir keeps its own so the pair stays self-contained. simulator.html
// fetches build/firmware.wasm; simulator-debug.html fetches build-debug/ via
// BW_WASM_URL. Never overwritten by sync.
const OURS = [
    'build/firmware.js', 'build/firmware.wasm',
    'build-debug/firmware.js', 'build-debug/firmware.wasm',
    'simulator-debug.html'
];

// simulator.js is vendored from upstream, but the debug loader needs its wasm
// fetch to honour window.BW_WASM_URL. Re-apply that one-line patch after any
// sync so a stock refresh never silently breaks the debug firmware path.
async function patchSimulatorJs() {
    const p = path.join(dest, 'build', 'simulator.js');
    let js = await readFile(p, 'utf8');
    if (js.includes('self.BW_WASM_URL || "./build/firmware.wasm"')) return false;
    const before = 'await fetch("./build/firmware.wasm")';
    const after = 'await fetch(self.BW_WASM_URL || "./build/firmware.wasm")';
    if (!js.includes(before)) throw new Error('simulator.js: fetchWasm shape changed; update the debug-loader patch');
    js = js.replace(before, after);
    await writeFile(p, js);
    return true;
}

if (srcDir) {
    await mkdir(path.join(dest, 'build'), {recursive: true});
    let changed = 0;
    for (const [src, rel] of FILES) {
        const srcPath = path.join(srcDir, src);
        const dstPath = path.join(dest, rel);
        if (!existsSync(srcPath)) throw new Error(`missing: ${srcPath}`);
        const srcBuf = await readFile(srcPath);
        const dstBuf = await readFile(dstPath).catch(() => null);
        const srcHash = createHash('sha256').update(srcBuf).digest('hex');
        const dstHash = dstBuf ? createHash('sha256').update(dstBuf).digest('hex') : null;
        if (srcHash === dstHash) {
            console.log(`  ok    ${rel} (${srcBuf.length} bytes)`);
            continue;
        }
        changed++;
        if (check) { console.log(`  STALE ${rel}`); continue; }
        await writeFile(dstPath, srcBuf);
        console.log(`  wrote ${rel} (${srcBuf.length} bytes)`);
    }
    if (check && changed) {
        console.error(`\n${changed} stale — run: npm run sync:microbitsim -- --dir <build-dir>`);
        process.exit(1);
    }
    if (!check) {
        const patched = await patchSimulatorJs();
        console.log(patched ? '  patched build/simulator.js (BW_WASM_URL debug-loader hook)'
            : '  ok    build/simulator.js debug-loader hook present');
    }
    console.log(check ? '\nmicro:bit sim assets up to date.' : '\nsynced micro:bit simulator assets.');
} else {
    // Just verify the vendored files exist (stock + our debug additions)
    let missing = 0;
    for (const [, rel] of [...FILES, ...OURS.map((o) => [o, o])]) {
        const p = path.join(dest, rel);
        if (existsSync(p)) {
            const buf = await readFile(p);
            console.log(`  ok    ${rel} (${buf.length} bytes)`);
        } else {
            missing++;
            console.error(`  MISSING ${rel}`);
        }
    }
    if (missing) {
        console.error(`\n${missing} missing — rebuild and sync with --dir <build-dir>`);
        process.exit(1);
    }
    console.log('\nmicro:bit sim assets present.');
}
