import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram} from './helpers/bw-vm.mjs';

// A headless VM has no renderer, so a loop body without a graphics effect
// never requests a redraw. A sprite whose artwork is unavailable is imported
// through the legacy forever-loop shape; that loop must still cost one frame
// per iteration instead of spinning inside a single physical step.
const bound = (promise, ms) => Promise.race([promise,
    new Promise((resolve, reject) => setTimeout(() => reject(new Error('VM step did not return')), ms).unref())]);

test('a source forever loop without graphics yields once per frame', async () => {
    const run = await bound(runProgram(`SPRITE Game:
WHEN arcade source starts:
  set n to 0
  forever:
    change n by 1`, {frames: 8}), 20000);
    assert.deepEqual(run.errors, []);
    const n = run.vm.runtime.targets.flatMap(t => Object.values(t.variables)).find(v => v.name === 'n');
    assert.ok(Number(n.value) >= 1 && Number(n.value) <= 8, `one iteration per frame, got ${n.value}`);
});

// PXT compiles an absent asset literal to undefined and a Sprite made from undefined art throws at the call; the import
// keeps the reference by name and the VM raises the same TypeError rather than inventing a stand-in sprite.
const FAULT = ['TypeError: Expected type Image but received type undefined. Did you forget to assign a variable?'];
test('imported moveSprite on a sprite with missing artwork faults at the creation and still returns', async () => {
    const source = 'let s = sprites.create(assets.image`Absent`, SpriteKind.Player)\ncontroller.moveSprite(s)\n' +
        'info.startCountdown(30)\nscene.cameraFollowSprite(s)';
    const imported = arcadeToPseudocode({'main.ts': source});
    const run = await bound(runProgram(imported.code, {frames: 24}), 20000);
    assert.deepEqual([...new Set(run.errors)], FAULT);
});

test('a forever callback that spawns a projectile from missing artwork faults at the creation and still returns', async () => {
    const source = 'forever(function () {\n let p = sprites.createProjectileFromSide(assets.image`Absent`, -90, 0)\n p.y = randint(0, 10)\n})';
    const imported = arcadeToPseudocode({'main.ts': source});
    const run = await bound(runProgram(imported.code, {frames: 24}), 20000);
    assert.deepEqual([...new Set(run.errors)], FAULT);
});

test('an array length passed to a recursive helper has primitive domain evidence', async () => {
    const source = `let arr = [3, 1, 2]
function step(i: number, j: number) {
    let tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
    pause(10)
}
function sortFrom(lo: number, hi: number) {
    if (lo < hi) {
        step(lo, hi)
        sortFrom(lo + 1, hi)
    }
}
sortFrom(0, arr.length)`;
    const imported = arcadeToPseudocode({'main.ts': source});
    const run = await bound(runProgram(imported.code, {frames: 24}), 20000);
    assert.deepEqual(run.errors, []);
});
