import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram, clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

const values = run => Object.fromEntries(run.vm.runtime.targets.flatMap(target => Object.values(target.variables))
    .map(variable => [variable.name.replace(/^(?:Game_)+/, ''), variable.value]));

// filter evaluates every predicate before forEach runs: moving the first kept
// sprite left must not drop or add later sprites. The index form counts calls.
const SOURCE = `let done = false
let xs = [10, 90, 100, 130, 40]
for (let x of xs) {
    let s = sprites.create(img\`1\`, SpriteKind.Enemy)
    s.x = x
}
let all = sprites.allOfKind(SpriteKind.Enemy)
all.filter(e => e.x > 80).forEach(e => e.x -= 80)
let indexSum = 0
all.forEach((e, i) => { indexSum += i * 1000 + e.x })
let magic = (function () {
    let out = 0
    for (let i = 0; i < 4; i++) out += i
    return out * 10
})()
let after = 0
all.forEach(function (e) { after += e.x })
// A discarded map runs its callback for its side effects, like forEach.
let frames = [img\`3 1\`, img\`1 3\`]
frames.map(f => f.replace(3, 10))
let mapped = frames[0].getPixel(0, 0) * 100 + frames[1].getPixel(1, 0)
let mapCalls = 0
xs.map((x, i) => { mapCalls += x + i })
done = true
done = true`;

test('forEach, filter and immediately invoked functions match the original runtime', async () => {
    const original = await runPxtArcade(SOURCE, {waitForGlobals: {done: true}});
    const imported = arcadeToPseudocode(SOURCE);
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 30, storage: true, uploads: imported.costumes});
    try {
        assert.deepEqual(run.errors, []);
        const actual = values(run);
        assert.equal(String(actual.done), 'true');
        for (const name of ['indexSum', 'magic', 'after', 'mapped', 'mapCalls']) assert.equal(Number(actual[name]), original[name], name);
        assert.equal(original.mapped, 1010);
        assert.equal(original.magic, 60);
        const exported = projectToArcade(run.creator.project, {costumeSvg: (target, costume) => run.creator.assets.get(costume.assetId)?.data});
        assert.deepEqual(exported.unsupported, []);
        const again = await runPxtArcade(exported.ts + '\ndone = true', {waitForGlobals: {done: true}});
        for (const name of ['indexSum', 'magic', 'after', 'mapped', 'mapCalls']) assert.equal(again[name], original[name], `${name} in the executed export`);
    } finally { clearStrayTimers(); }
});

test('callbacks that cannot be lowered stay visible', () => {
    // An early return inside forEach, and an IIFE capturing a local of its function.
    for (const source of ['let a = [1, 2]\na.forEach(x => { if (x > 1) return; a.push(x) })',
        'function f(k: number) { return (function () { return k })() }\nlet v = f(2)'])
        assert.ok(arcadeToPseudocode(source).unsupported.length, source);
});
