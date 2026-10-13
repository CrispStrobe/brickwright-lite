/**
 * The micro:bit V2 emulator bases reach a build from the published release
 * (scripts/sync-makecode-runtime.mjs emuBases; task A8 of
 * docs/OPEN-TASKS-2026-09-29.md) — and only as the pinned bytes.
 *
 * No network: a stand-in fetch and stand-in pins. What is held:
 *   - a local build wins and is not re-fetched;
 *   - fetched bytes whose sha256 is the pin are served AND cached locally;
 *   - fetched bytes that are not the pin are refused by name, and nothing is
 *     written (a later run cannot pick them up from the cache);
 *   - --no-emu-fetch (release null) and offline never fetch: the workflow that
 *     BUILDS the bases must not have the published ones stand in for its build;
 *   - strict (--emu-bases) fails on a missing or refused base.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {emuBases, EMU_BASES_RELEASE, MICROBIT_EMU_BASES} = await import(path.join(ROOT, 'scripts/sync-makecode-runtime.mjs'));

const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const GOOD = Buffer.from(':00000001FF\n');
const PINS = {'v2-test': {sha: 'a'.repeat(64), sha256: sha256(GOOD), bytes: GOOD.length}};
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bw-emu-fetch-'));
const quiet = [];
const log = m => quiet.push(m);
const served = files => [...files.keys()];
function fetcher (body) {
    const urls = [];
    const f = async url => { urls.push(url); return {ok: true, arrayBuffer: async () => body}; };
    f.urls = urls;
    return f;
}

test('the release is pinned for every emulator base the sync serves', () => {
    assert.match(EMU_BASES_RELEASE, /^https:\/\/github\.com\/CrispStrobe\/brickwright-lite\/releases\/download\/makecode-emu-bases-\d+\/$/);
    assert.ok(Object.keys(MICROBIT_EMU_BASES).length >= 2);
});

test('pinned bytes from the release are served and cached', async () => {
    const dir = tmp();
    const f = fetcher(GOOD);
    const files = await emuBases({dir, pins: PINS, fetch: f, release: 'https://example.invalid/r/', log});
    assert.deepEqual(served(files), [`microbit/hexcache-emu/${'a'.repeat(64)}.hex`]);
    assert.deepEqual(f.urls, [`https://example.invalid/r/${'a'.repeat(64)}.hex`]);
    assert.ok(fs.readFileSync(path.join(dir, `${'a'.repeat(64)}.hex`)).equals(GOOD), 'cached for the next run');
    // The cached copy now wins: no second fetch.
    const g = fetcher(GOOD);
    await emuBases({dir, pins: PINS, fetch: g, release: 'https://example.invalid/r/', log});
    assert.equal(g.urls.length, 0);
});

test('bytes that are not the pin are refused by name and never cached', async () => {
    const dir = tmp();
    const msgs = [];
    const files = await emuBases({dir, pins: PINS, fetch: fetcher(Buffer.from('not the base')), release: 'https://example.invalid/r/', log: m => msgs.push(m)});
    assert.equal(files.size, 0);
    assert.match(msgs.join('\n'), /REFUSED micro:bit emulator base\(s\) whose bytes are not pinned: v2-test/);
    assert.equal(fs.existsSync(path.join(dir, `${'a'.repeat(64)}.hex`)), false);
    await assert.rejects(emuBases({dir, pins: PINS, fetch: fetcher(Buffer.from('x')), release: 'https://example.invalid/r/', log, strict: true}),
        /every pinned micro:bit emulator base must be present/);
});

test('--no-emu-fetch and offline never fetch; strict then fails on the missing base', async () => {
    for (const opts of [{release: null}, {offline: true}]) {
        const f = fetcher(GOOD);
        const files = await emuBases({dir: tmp(), pins: PINS, fetch: f, log, ...opts});
        assert.equal(files.size, 0);
        assert.equal(f.urls.length, 0, JSON.stringify(opts));
        await assert.rejects(emuBases({dir: tmp(), pins: PINS, fetch: f, log, strict: true, ...opts}), /must be present/);
    }
});
