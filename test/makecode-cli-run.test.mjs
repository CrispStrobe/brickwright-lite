/**
 * `node scripts/makecode.mjs run` (task A7 of docs/OPEN-TASKS-2026-09-29.md):
 * a MakeCode program on LabWired's micro:bit V1 board model, headless, run as a
 * user runs it — a child process, its exit code, what it prints.
 *
 * The engine is the labwired-wasm artifact the app ships (npm run
 * sync:labwiredwasm) and the firmware comes from MakeCode's own compiler (npm
 * run sync:makecode); CI's build job syncs both before its unit step, so these
 * execute there. Without them they skip by name (an early return would pass).
 *
 *   - a micro:bit program compiles, runs with the S110 SoftDevice EMULATED,
 *     prints over serial and draws its LED picture, in GUEST time;
 *   - the same program for a Calliope mini runs on the same board model and
 *     says what that model does not cover;
 *   - a firmware .hex runs as it is (the V1 section of a universal hex);
 *   - a target with no board model, and a missing engine, are refused by name;
 *   - --board v2 (task A8): the program compiled for the EMULATOR onto the
 *     Bluetooth-free bases runs on the micro:bit V2 board model and draws its
 *     picture and exact serial lines (task A10); a universal hex (whose
 *     V2 section carries Nordic's SoftDevice) is refused there, as is a
 *     Calliope program.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {v1Section, hasFirmware} from '../scripts/lib/makecode-run.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'scripts/makecode.mjs');
const FIXTURES = path.join(ROOT, 'test/fixtures/makecode');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-makecode-run-'));
const run = (args, env = {}) => spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', CLI, ...args],
    {cwd: ROOT, encoding: 'utf8', timeout: 900000, env: {...process.env, ...env}});
const engine = fs.existsSync(path.join(ROOT, 'packages/scratch-gui/static/labwired/labwired_wasm_bg.wasm'));
const runtime = target => fs.existsSync(path.join(ROOT, 'packages/scratch-gui/static/makecode', target, 'pxtworker.js'));
const SKIP_BOTH = 'LabWired engine or MakeCode runtime not synced (npm run sync:labwiredwasm, npm run sync:makecode)';
const {MICROBIT_EMU_BASES} = await import(path.join(ROOT, 'scripts/sync-makecode-runtime.mjs'));
const emuBases = Object.values(MICROBIT_EMU_BASES).every(p =>
    fs.existsSync(path.join(ROOT, 'packages/scratch-gui/static/makecode/microbit/hexcache-emu', `${p.sha}.hex`)));
const SKIP_V2 = 'LabWired engine, MakeCode runtime or micro:bit V2 emulator bases not synced (npm run sync:labwiredwasm, npm run sync:makecode)';

test.after(() => fs.rmSync(tmp, {recursive: true, force: true}));

// The program: a serial greeting, an X on the matrix, then a counter every 200 ms.
const PROGRAM = `serial.writeLine("hello bw")
basic.showLeds(\`
    # . . . #
    . # . # .
    . . # . .
    . # . # .
    # . . . #
    \`)
let n = 0
basic.forever(function () {
    n += 1
    serial.writeLine("tick " + n)
    basic.pause(200)
})
`;
const X = ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'];
const programFile = path.join(tmp, 'hello.ts');
fs.writeFileSync(programFile, PROGRAM);
const json = r => JSON.parse(r.stdout.trim().split('\n').pop());

test('the V1 section is cut out of a universal hex; a project-only .hex is not firmware', () => {
    // A V2 section FIRST, its data in plain type-00 records (the format allows it): only the
    // board ID can tell it from the V1 section's.
    const universal = [':020000040000FA', ':0400000A9903C0DEB8', ':10010000AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4F', ':0400000A9900C0DEBB', ':10000000000000200D0000000000000000000000C3', ':00000001FF'].join('\n');
    const {hex, universal: was} = v1Section(universal);
    assert.equal(was, true);
    const types = hex.trim().split('\n').map(l => l.slice(7, 9));
    assert.deepEqual(types, ['00', '01'], 'the V1 data and the end record; no block records, nothing of the V2 section (0D)');
    assert.match(hex, /^:1000000000000020/m, 'the V1 vector table');
    assert.doesNotMatch(hex, /AAAAAAAA/, 'nothing of the V2 section');
    assert.equal(hasFirmware(hex), true, 'a firmware writes address 0');
    assert.equal(hasFirmware(fs.readFileSync(path.join(FIXTURES, 'microbit-blocks.hex'), 'utf8')), false,
        'the fixture carries only its project');
});

test('a micro:bit program runs on the V1 board model: serial, its LED picture, in guest time',
    {skip: engine && runtime('microbit') ? false : SKIP_BOTH, timeout: 900000}, () => {
        const r = run(['run', programFile, '--seconds', '1', '--json']);
        assert.equal(r.status, 0, r.stderr);
        const out = json(r);
        assert.equal(out.board, 'microbit-v1');
        assert.equal(out.universal, true, 'the micro:bit firmware is a universal hex; its V1 section ran');
        assert.equal(out.fault, null);
        assert.match(out.serial, /hello bw/);
        assert.match(out.serial, /tick 1[\s\S]*tick 2/, 'the forever loop kept running');
        assert.ok(out.frames.some(f => f.rows.join('/') === X.join('/')), JSON.stringify(out.frames));
        assert.equal(out.guestSeconds, 1);
        // 1 s of guest time cannot hold 10 ticks of 200 ms: the bound is guest time, not wall time.
        assert.ok((out.serial.match(/tick \d+/g) || []).length <= 5, out.serial);
    });

test('the same program for a Calliope mini runs on that board model and says what it does not cover',
    {skip: engine && runtime('calliopemini') ? false : SKIP_BOTH, timeout: 900000}, () => {
        const r = run(['run', programFile, '--target', 'calliope', '--seconds', '1', '--json']);
        assert.equal(r.status, 0, r.stderr);
        assert.match(r.stderr, /Calliope mini runs on the micro:bit V1 board model.*RGB LED, motor driver/);
        const out = json(r);
        assert.equal(out.target, 'calliopemini');
        assert.equal(out.universal, false, 'a Calliope firmware is a plain nRF51 hex');
        assert.match(out.serial, /hello bw/);
        assert.ok(out.frames.some(f => f.rows.join('/') === X.join('/')));
    });

test('a firmware .hex runs as it is, with the live console and matrix',
    {skip: engine && runtime('microbit') ? false : SKIP_BOTH, timeout: 900000}, () => {
        // Build the firmware once with to-hex's compiler, then run the file itself.
        const sb3 = path.join(tmp, 'hello.sb3');
        assert.equal(run(['to-sb3', programFile, '-o', sb3]).status, 0);
        const fw = path.join(tmp, 'hello-fw.hex');
        const built = run(['to-hex', sb3, '-o', fw]);
        assert.equal(built.status, 0, built.stderr);
        assert.equal(hasFirmware(fs.readFileSync(fw, 'utf8')), true);
        const r = run(['run', fw, '--seconds', '1']);
        assert.equal(r.status, 0, r.stderr);
        assert.match(r.stdout, /LED matrix\n {2}#...#\n {2}\.#\.#\.\n {2}\.\.#\.\.\n/);
        assert.match(r.stdout, /ran 1\.00 s of guest time on the micro:bit V1 board model/);
    });

test('a target with no board model is refused by name', {skip: runtime('arcade') ? false : 'MakeCode runtime not synced (npm run sync:makecode)'}, () => {
    const r = run(['run', path.join(FIXTURES, 'arcade-assets.hex')]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /run has a board model for the micro:bit and the Calliope mini, not arcade/);
});

test('a missing engine is exit 3, by name', {skip: runtime('microbit') ? false : 'MakeCode runtime not synced (npm run sync:makecode)', timeout: 900000}, () => {
    const r = run(['run', programFile, '--seconds', '0.1'], {BW_LABWIRED_DIR: path.join(tmp, 'no-engine')});
    assert.equal(r.status, 3);
    assert.match(r.stderr, /the LabWired engine is not synced .* run `npm run sync:labwiredwasm`/);
});

test('--seconds is bounded', () => {
    const r = run(['run', programFile, '--seconds', '0']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /--seconds must be between 0 and 600/);
});

test('--board v2: the emulator image runs on the micro:bit V2 board model and draws its picture',
    {skip: engine && runtime('microbit') && emuBases ? false : SKIP_V2, timeout: 900000}, () => {
        const r = run(['run', programFile, '--board', 'v2', '--seconds', '1', '--json']);
        assert.equal(r.status, 0, r.stderr);
        const out = json(r);
        assert.equal(out.board, 'microbit-v2');
        assert.equal(out.universal, false, 'the emulator image is a plain nRF52833 hex');
        assert.equal(out.fault, null);
        assert.ok(out.frames.some(f => f.rows.join('/') === X.join('/')), JSON.stringify(out.frames));
        assert.equal(typeof out.serial, 'string');
        const serial = out.serial.replace(/\r/g, '');
        assert.match(serial, /(?:^|\n)hello bw\n/, 'the complete greeting survives CODAL stack reuse');
        const ticks = [...serial.matchAll(/(?:^|\n)tick (\d+)(?=\n|$)/g)].map(m => Number(m[1]));
        assert.ok(ticks.length >= 2 && ticks.length <= 5, serial);
        assert.deepEqual(ticks, Array.from({length: ticks.length}, (_, i) => i + 1), 'complete ordered counter lines');
        assert.equal(out.guestSeconds, 1);
        assert.equal('serialWithheld' in out, false);
        assert.doesNotMatch(r.stderr, /serial is not reported/);
    });

test('--board v2 streams the real serial bytes in the text CLI as well',
    {skip: engine && runtime('microbit') && emuBases ? false : SKIP_V2, timeout: 900000}, () => {
        const r = run(['run', programFile, '--board', 'v2', '--seconds', '1']);
        assert.equal(r.status, 0, r.stderr);
        assert.match(r.stdout.replace(/\r/g, ''), /(?:^|\n)hello bw\n/);
        assert.match(r.stdout, /ran 1\.00 s of guest time on the micro:bit V2 board model/);
        assert.doesNotMatch(r.stderr, /serial is not reported/);
    });

test('--board v2 refuses a universal hex (its V2 section carries the SoftDevice) and a Calliope program',
    {skip: engine && runtime('microbit') ? false : SKIP_BOTH, timeout: 900000}, () => {
        const sb3 = path.join(tmp, 'hello-v2.sb3');
        assert.equal(run(['to-sb3', programFile, '-o', sb3]).status, 0);
        const fw = path.join(tmp, 'hello-universal.hex');
        assert.equal(run(['to-hex', sb3, '-o', fw]).status, 0);
        let r = run(['run', fw, '--board', 'v2', '--seconds', '0.1']);
        assert.equal(r.status, 1);
        assert.match(r.stderr, /refused: a universal micro:bit hex is for a real board: its V2 section carries Nordic's SoftDevice/);
        r = run(['run', programFile, '--board', 'v2', '--target', 'calliope']);
        assert.equal(r.status, 2);
        assert.match(r.stderr, /--board v2 is the micro:bit V2; a calliopemini runs on --board v1/);
        r = run(['run', programFile, '--board', 'v3']);
        assert.equal(r.status, 2);
        assert.match(r.stderr, /run --board is v1 or v2, not v3/);
    });
