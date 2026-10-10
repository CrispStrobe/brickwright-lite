import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram, clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

const values = run => Object.fromEntries(run.vm.runtime.targets.flatMap(target => Object.values(target.variables))
    .map(variable => [variable.name.replace(/^(?:Game_)+/, ''), variable.value]));

// PXT iterates its frame callbacks live: an update handler registered while
// the frame's updates run is called later in that same frame.
const SOURCE = `let frame = 0
let log = ""
let done = false
game.onUpdate(function () {
    if (frame == 2) {
        game.onUpdate(function () {
            log = log + "late" + frame + ";"
        })
    }
    log = log + "f" + frame + ";"
    frame += 1
    if (frame > 6) {
        done = true
    }
})`;

test('an update handler registered during an update runs in the same frame, as in the original', async () => {
    const original = await runPxtArcade(SOURCE, {waitForGlobals: {done: true}, fakeClock: true});
    assert.match(original.log, /^f0;f1;f2;late3;f3;late4;/);
    const imported = arcadeToPseudocode(SOURCE);
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 12, storage: true});
    try {
        assert.deepEqual(run.errors, []);
        const actual = String(values(run).log);
        assert.equal(actual.slice(0, original.log.length), original.log);
    } finally { clearStrayTimers(); }
});
