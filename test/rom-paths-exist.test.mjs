// Every `static/roms/<file>` a source file fetches must actually be there.
//
// WHY THIS EXISTS: debug-runner.js's 8086 branch fetched `bios8086.bin`, a
// name that has never existed in static/roms. It 404ed on every run from the
// day it was written and nothing noticed, because nothing REACHED it — the
// tests construct a machine directly, and the Machine Loader always supplies
// media, so the no-media fallback is the one path a user hits and a suite does
// not. The eighth instance of this lane's recurring defect: a path nothing
// drives is a path nothing tests, and it looks identical to a working one.
//
// A unit test for that branch would not have helped, because the branch is
// correct — it fetches a URL and throws on failure, exactly as intended. What
// was wrong was a STRING, and the only thing that can check a string against
// the filesystem is a check that reads both.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const overlaySrc = resolve(repo, 'overlay/scratch-gui/src');
const romDir = resolve(repo, 'overlay/scratch-gui/static/roms');

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.(js|jsx|mjs)$/.test(name)) out.push(p);
    }
    return out;
}

// `static/roms/NAME` in a string literal, however the URL is later built.
const REF = /['"`]static\/roms\/([A-Za-z0-9_.\-]+)['"`]/g;

test('every static/roms file referenced in the overlay exists', () => {
    const missing = [];
    const seen = new Set();
    for (const file of walk(overlaySrc)) {
        const text = readFileSync(file, 'utf8');
        for (const m of text.matchAll(REF)) {
            const name = m[1];
            seen.add(name);
            if (!existsSync(join(romDir, name))) {
                missing.push(`${relative(repo, file)} fetches static/roms/${name}`);
            }
        }
    }
    assert.ok(seen.size > 0,
        'the scan found no static/roms references at all, which means the pattern '
        + 'stopped matching rather than that everything is fine — a green result '
        + 'from a scan that reads nothing is the failure this file is about');
    assert.deepEqual(missing, [],
        'these paths 404 at runtime, and only for the user:\n  ' + missing.join('\n  '));
});

test('the four 8086 ROMs are present and are the size their load address assumes', () => {
    // romAt is computed as 0x100000 - length so the reset vector at FFFF0h
    // lands inside the image. A ROM of an unexpected size does not fail to
    // load — it loads at the wrong address and executes open bus, which on
    // screen is a machine that never started.
    for (const [name, bytes] of [
        ['i8086-bios.bin', 65536],
        ['i8086-serial-monitor.bin', 32768],
        ['i8086-cga-demo.bin', 32768],
        ['i8086-timer-demo.bin', 32768],
    ]) {
        const p = join(romDir, name);
        assert.ok(existsSync(p), `${name} is missing`);
        const size = statSync(p).size;
        assert.equal(size, bytes, `${name} is ${size} bytes, expected ${bytes}`);
        const at = 0x100000 - size;
        assert.ok(at + size - 1 === 0xfffff,
            `${name} at ${at.toString(16)} must end at FFFFF so the reset vector is inside it`);
    }
});
