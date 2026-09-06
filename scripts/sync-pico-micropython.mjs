#!/usr/bin/env node
/**
 * sync:picomicropython — ensure the pinned MicroPython Pico UF2 is present.
 *
 * The Python tab's ▶ Run for the Pico boots this firmware in rp2040js (N3c).
 * MicroPython is MIT and *could* be vendored, but a 650 KB binary blob in git
 * to serve one target is a bad trade — the same call the probe's header makes —
 * so the firmware is FETCHED by exact versioned URL and pinned by sha256, and
 * NEVER committed (it lands in artifacts/, which is gitignored).
 *
 * The pin, the URL, and the fetch+verify all live ONCE, in
 * scripts/probe-pico-micropython.mjs (`ensureFirmware`/`FIRMWARE`) — the probe
 * has owned them since before N3c and the boot gate already imports them, so a
 * second copy of the sha256 would be a second thing to drift. This script is
 * the `npm run sync:` entry point around that single source, with a --check
 * that verifies the cached copy against the pin WITHOUT reaching the network
 * (the shape every other sync:*:check has).
 *
 * The fetch site itself is the `fetch(FIRMWARE.url)` inside `ensureFirmware`;
 * it is declared in test/fetch-pinning.test.mjs as class `content-hash` — the
 * sha256 pin, not the (versioned) URL, is what decides what ships, so a moved
 * or replaced artefact fails closed.
 *
 * Usage:
 *   npm run sync:picomicropython          # fetch into artifacts/ if absent, verify sha256
 *   npm run sync:picomicropython:check    # verify the cached copy matches the pin; never fetch
 */
import fs from 'node:fs';
import {ensureFirmware, FIRMWARE, CACHED_UF2} from './probe-pico-micropython.mjs';

const check = process.argv.includes('--check');

async function main () {
    if (check) {
        // Verify-only: a cached copy must exist and match the pin. Never fetch —
        // :check runs in places that must not reach the network, and a silent
        // fetch here would hide a missing firmware behind a fresh download.
        if (!fs.existsSync(CACHED_UF2)) {
            console.error(`[sync:picomicropython] NOT CACHED: ${CACHED_UF2}`);
            console.error(`  run \`npm run sync:picomicropython\` to fetch ${FIRMWARE.file} ` +
                '(650 KB, sha256-pinned, gitignored).');
            process.exit(1);
        }
        // ensureFirmware in offline mode re-hashes the cached bytes against
        // FIRMWARE.sha256 and throws on a mismatch — that IS the check.
        await ensureFirmware({offline: true, quiet: true});
        console.log(`[sync:picomicropython] OK — ${FIRMWARE.file} matches sha256 ${FIRMWARE.sha256}`);
        return;
    }
    const bytes = await ensureFirmware({quiet: false});
    console.log(`[sync:picomicropython] ${FIRMWARE.file} present (${bytes.length} bytes), ` +
        `sha256 ${FIRMWARE.sha256}`);
}

main().catch(err => {
    console.error(String((err && err.stack) || err));
    process.exit(1);
});
