// SPDX-License-Identifier: BSD-3-Clause
/**
 * LEGO SPIKE App 3 Python, imported, driving the SPIKE arena headless.
 *
 * The whole route, nothing stubbed: SPIKE 3 Python -> the vendored reader
 * (sb3-creator-python.js routes it to sb3-creator-spike3.js) -> the SPIKE
 * dialect -> SB3Creator -> the real Scratch VM -> the real bundled spikeprime
 * extension -> Web Bluetooth -> the virtual hub -> the arena's world, judged by
 * the arena's checker (test/helpers/spike-arena-vm.mjs, simulated time).
 *
 * Four Rover basics challenges, each exercising a unit the reader converts:
 * wheel degrees (rb01), yaw in decidegrees with the sign inverted (rb02), a
 * colour constant (rb07) and millimetres (rb09). And one deliberately wrong
 * program that reads the yaw with the app's sign, which must FAIL: the yaw
 * inversion is what it depends on, so a reader that got it wrong would pass it.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {REPO, importSource} from './helpers/bw-integrated.mjs';
import {runOnArena, readUnitFile} from './helpers/spike-arena-vm.mjs';

const {default: pythonToPseudocode} = await importSource('src/lib/sb3-creator-python.js');
const {validateWorld} = await import(path.join(REPO, 'overlay', 'scratch-gui', 'src', 'lib', 'spike-arena', 'arena-world.js'));
const FIXTURES = path.join(REPO, 'test', 'fixtures', 'spike3-python-arena');

const world = id => {
    const w = JSON.parse(readUnitFile('rover-basics', `${id}.json`));
    assert.deepEqual(validateWorld(w), [], id);
    return w;
};
const imported = file => {
    const r = pythonToPseudocode(readFileSync(path.join(FIXTURES, file), 'utf8'));
    assert.equal(r.dialect, 'spike3', `${file} is read as SPIKE App 3 Python`);
    assert.deepEqual(r.unsupported, [], `${file} uses only what the blocks can say`);
    return r.pseudocode;
};

for (const id of ['rb01-leave-the-lander', 'rb02-face-the-ridge', 'rb07-stop-at-the-line', 'rb09-cliff-wall']) {
    test(`${id}: the SPIKE 3 Python solution passes`, async () => {
        const run = await runOnArena(imported(`${id}.py`), world(id));
        assert.equal(run.verdict.status, 'pass', `${id}: ${JSON.stringify(run.verdict)}`);
        assert.deepEqual(run.unsupported, [], 'every statement the extension sent was understood by the hub');
    });
}

test('rb02 with the yaw read at the app\'s sign turns past the ridge and fails', async () => {
    const run = await runOnArena(imported('rb02-face-the-ridge.wrong.py'), world('rb02-face-the-ridge'));
    assert.equal(run.verdict.status, 'fail', JSON.stringify(run.verdict));
});
