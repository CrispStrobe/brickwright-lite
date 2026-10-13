/**
 * `node scripts/makecode.mjs run` for a program with several boards: what is
 * decided BEFORE any machine exists.
 *
 *   - `--press <Board>:<A|B>@<from>-<to>` is read strictly: a press that
 *     silently did nothing would look like a broken radio;
 *   - a press must name a board the program has, and belongs to a program with
 *     several boards (exit 2, in words, before anything is compiled);
 *   - a missing engine is exit 3, by name, as for one board.
 *
 * And the run itself, end to end: two machines on one air, the car's motor
 * line following the remote's button. It needs the LabWired engine (npm run
 * sync:labwiredwasm) and MakeCode's compiler for both targets (npm run
 * sync:makecode); CI's build job syncs both before its unit step. Without them
 * it skips by name (an early return would pass).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parsePress, resolvePresses, BOARD_OF_TARGET, BOARD_LINES} from '../scripts/lib/makecode-run-boards.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'scripts/makecode.mjs');
const PAIR = path.join(ROOT, 'test/fixtures/multi-board/radio-pair.bw');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-makecode-run-boards-'));
const run = (args, env = {}) => spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', CLI, ...args],
    {cwd: ROOT, encoding: 'utf8', timeout: 900000, env: {...process.env, ...env}});
const engine = fs.existsSync(path.join(ROOT, 'packages/scratch-gui/static/labwired/labwired_wasm_bg.wasm'));
const runtime = target => fs.existsSync(path.join(ROOT, 'packages/scratch-gui/static/makecode', target, 'pxtworker.js'));

test.after(() => fs.rmSync(tmp, {recursive: true, force: true}));

test('a press is a board, a button and an interval of guest seconds', () => {
    assert.deepEqual(parsePress('Remote:A@1-2.5'), {board: 'Remote', button: 'button_a', from: 1, to: 2.5});
    assert.deepEqual(parsePress('Remote:b@0.25-0.5'), {board: 'Remote', button: 'button_b', from: 0.25, to: 0.5});
    assert.deepEqual(parsePress('My car:B@3-4'), {board: 'My car', button: 'button_b', from: 3, to: 4}, 'a board name may hold spaces');
});

test('a press that cannot be read is refused, never dropped', () => {
    for (const bad of ['Remote', 'Remote:A', 'Remote:C@1-2', 'Remote:A@1', 'Remote:A@-1-2', ':A@1-2', 'Remote:A@x-y']) {
        assert.throws(() => parsePress(bad), e => e.usage === true && e.message.includes(bad), bad);
    }
    assert.throws(() => parsePress('Remote:A@2-1'), /the release must come after the press/);
    assert.throws(() => parsePress('Remote:A@1-1'), /the release must come after the press/);
});

test('a press takes the board\'s own spelling, and a board the program lacks is named with the ones it has', () => {
    const names = ['Remote', 'Car'];
    assert.deepEqual(resolvePresses([parsePress('remote:A@1-2')], names).map(p => p.board), ['Remote']);
    assert.throws(() => resolvePresses([parsePress('Truck:A@1-2')], names),
        e => e.usage === true && /names board "Truck"; this program has Remote, Car/.test(e.message));
});

test('the board models and the lines reported for them', () => {
    assert.deepEqual(BOARD_OF_TARGET, {microbit: 'microbit-v1', calliopemini: 'calliope-mini-v1'});
    assert.deepEqual(BOARD_LINES['calliope-mini-v1'].map(l => l.pin), [29, 30], 'the motor driver inputs IN1, IN2');
    assert.equal(BOARD_LINES['microbit-v1'], undefined, 'the micro:bit has no motor driver');
});

test('the CLI refuses a press for a board the program does not have, before compiling', () => {
    const r = run(['run', PAIR, '--press', 'Truck:A@1-2']);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /--press names board "Truck"; this program has Remote, Car/);
});

test('the CLI refuses a press given to a one-board program, and outside run', () => {
    const one = path.join(tmp, 'one.bw');
    fs.writeFileSync(one, 'DEVICE MICROBIT\n\nWHEN flag clicked:\n  radio on group 1 power 7\n');
    const r = run(['run', one, '--press', 'Remote:A@1-2']);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /--press is for a program with several boards/);
    const e = run(['to-ts', PAIR, '--press', 'Remote:A@1-2']);
    assert.equal(e.status, 2, e.stderr);
    assert.match(e.stderr, /--press is for run/);
});

test('several boards without the engine is exit 3, by name',
    {skip: runtime('microbit') && runtime('calliopemini') ? false : 'MakeCode runtime not synced (npm run sync:makecode)', timeout: 900000}, () => {
        const empty = fs.mkdtempSync(path.join(tmp, 'no-engine-'));
        const r = run(['run', PAIR, '--press', 'Remote:A@1-2', '--seconds', '1'], {BW_LABWIRED_DIR: empty});
        assert.equal(r.status, 3, r.stderr);
        assert.match(r.stderr, /Remote \(.*\) and Car \(Calliope mini\) on one simulated radio air/);
        assert.match(r.stderr, /LabWired engine is not synced/);
    });

test('the remote\'s button A drives the car\'s motor A line over the shared air, and only while it is held',
    {skip: engine && runtime('microbit') && runtime('calliopemini') ? false :
        'LabWired engine or MakeCode runtime not synced (npm run sync:labwiredwasm, npm run sync:makecode)', timeout: 900000}, () => {
        const r = run(['run', PAIR, '--press', 'Remote:A@3-3.6', '--seconds', '4.5', '--json']);
        assert.equal(r.status, 0, r.stderr);
        const out = JSON.parse(r.stdout.trim().split('\n').pop());
        // Everything but serial and the matrix frames, for a failure that can be read.
        const seen = JSON.stringify({...out, boards: out.boards.map(({serial, frames, ...b}) => b)});
        assert.equal(out.sharedAir, true, seen);
        assert.deepEqual(out.boards.map(b => [b.name, b.model]), [['Remote', 'microbit-v1'], ['Car', 'calliope-mini-v1']], seen);
        for (const b of out.boards) assert.equal(b.fault, null, seen);
        const car = out.boards[1];
        const motorA = car.lines.find(l => l.name === 'motor A (IN1)');
        const motorB = car.lines.find(l => l.name === 'motor B (IN2)');
        assert.ok(motorA && motorB, seen);
        assert.ok(motorA.edges > 0, `the firmware switched IN1: ${seen}`);
        assert.equal(motorA.active.length, 1, `one press, one interval of driving: ${seen}`);
        assert.ok(motorA.active[0].from >= 3.0, `not before the press at 3.0 s: ${seen}`);
        assert.ok(motorA.active[0].to <= 3.8, `still again soon after the release at 3.6 s: ${seen}`);
        assert.equal(motorB.edges, 0, `button B was never pressed: ${seen}`);
    });
