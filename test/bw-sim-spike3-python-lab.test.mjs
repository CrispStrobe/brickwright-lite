// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * LEGO SPIKE App 3 Python, imported through the Code tab's reader and run in the Robot Lab's physics.
 *
 *   SPIKE 3 Python -> lib/robot-lab-pseudocode.js readPython (the reader the Code tab's
 *   "To blocks" calls: the vendored sb3-creator-python.js, which routes SPIKE App 3 source to
 *   sb3-creator-spike3.js) -> DEVICE SPIKE text -> SB3Creator -> the real Scratch VM -> the real
 *   bundled spikeprime extension -> Web Bluetooth -> the virtual hub -> SimSession (Jolt) on the
 *   Wall stopper model, Wall mat (test/helpers/sim-lab-vm.mjs runOnSimLab).
 *
 * Judged by the Wall stopper's shared physical judge (test/helpers/wall-stop-lab-judge.mjs): the
 * robot drives at the wall and stops because the distance reading went below 100 mm, without
 * touching it. The same program with a threshold the reading never passes must fail the judge.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {existsSync, readFileSync} from 'node:fs';
import {REPO, INTEGRATED} from './helpers/bw-integrated.mjs';

const GUI = path.join(REPO, 'overlay', 'scratch-gui');
const {readPython} = await import(path.join(GUI, 'src', 'lib', 'robot-lab-pseudocode.js'));
const MODEL_TEXT = readFileSync(path.join(GUI, 'static', 'sim-lab', 'models', 'wall-stopper.ldr'), 'utf8');

/** SPIKE App 3 Python for the Wall stopper: 333 deg/s is 30 % of the medium motor's 1110 deg/s. */
const spike3 = belowMm => `from hub import port
import runloop
import motor_pair
import distance_sensor

async def main():
    motor_pair.pair(motor_pair.PAIR_1, port.A, port.B)
    motor_pair.move(motor_pair.PAIR_1, 0, velocity=333)
    await runloop.until(lambda: distance_sensor.distance(port.D) < ${belowMm})
    motor_pair.stop(motor_pair.PAIR_1)

runloop.run(main())
`;

const imported = source => {
    const r = readPython(source);
    assert.equal(r.dialect, 'spike3', 'read as SPIKE App 3 Python');
    assert.deepEqual(r.unsupported, [], 'every statement has a block');
    assert.deepEqual(r.warnings || [], []);
    return r.pseudocode;
};

test('the Code tab reads the SPIKE 3 Python Wall stopper into SPIKE blocks text', () => {
    const text = imported(spike3(100));
    assert.match(text, /^DEVICE SPIKE$/m);
    assert.match(text, /set movement motors A B/);
    assert.match(text, /set movement speed 30/);
    assert.match(text, /wait until \(spike distance D in mm\) < 100/);
    assert.match(text, /stop movement/);
});

const missing = path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'index.js');
if (!existsSync(missing)) {
    test('the SPIKE 3 Python Lab run: its inputs are present', () => {
        assert.fail(`missing ${path.relative(REPO, missing)} — run \`cd packages/scratch-gui && npm install --ignore-scripts --legacy-peer-deps\``);
    });
} else {
    const {runOnSimLab, FRAME_MS} = await import('./helpers/sim-lab-vm.mjs');
    const {judgeWallStopRun, reportWallStop} = await import('./helpers/wall-stop-lab-judge.mjs');
    const run = async belowMm => {
        const result = await runOnSimLab(imported(spike3(belowMm)), {modelText: MODEL_TEXT, mat: 'wall', timeLimitMs: 15000});
        return {result, r: judgeWallStopRun(result, {thresholdMm: 100, speedPercent: 30, frameMs: FRAME_MS})};
    };

    test('SPIKE 3 Python, imported to blocks, stops the Wall stopper in the Lab physics because of its reading', async t => {
        const {result, r} = await run(100);
        assert.deepEqual(result.issues, []);
        assert.deepEqual(result.run.unsupported, [], 'every command the program sent was understood by the hub');
        t.diagnostic(reportWallStop(r));
        assert.ok(r.startGap > 0.5, 'the robot starts well away from the wall');
        assert.ok(r.settled, 'the robot has come to rest');
        assert.deepEqual(r.failures, [], reportWallStop(r));
        assert.ok(r.ok);
    });

    test('the judge can fail: the same Python with a threshold the reading never passes drives into the wall', async t => {
        const {r} = await run(0);
        t.diagnostic(reportWallStop(r));
        assert.equal(r.ok, false);
        assert.ok(r.closestGap <= 0.001, `kept ${r.closestGap} m off the wall`);
        assert.ok(r.failures.some(f => f.startsWith('(a)')), reportWallStop(r));
    });
}
