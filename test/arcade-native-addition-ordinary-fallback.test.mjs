import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {runtimeDispatchAddHelperSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

// A genuine SDK numeric result must be proved independently of whether an
// unrelated Array exists. Unknown SDK results cannot acquire this authority.
const reason = 'native addition requires initialized primitive or proved flat Array operands';
// Owner decision 2026-10-30: an operand the proof cannot establish exports
// through the runtime-dispatch helper (once) and runs like the original PXT.
const dispatched = async (source, names) => {
    const out = exported(source);
    assert.deepEqual(out.unsupported, [], JSON.stringify(out.unsupportedDetails));
    assert.equal(out.unsupported.includes(reason), false);
    assert.ok(out.ts.includes(runtimeDispatchAddHelperSource('__bwBinaryAdd')), out.ts);
    assert.equal(out.ts.split('function __bwBinaryAdd(').length, 2, 'emitted once per program');
    const value = (result, key) => result[key] ?? result['Game_' + key];
    const original = await runPxtArcade(source), roundtrip = await runPxtArcade(out.files);
    // [original, exported] when the exporter renames a global away from an SDK name.
    for (const entry of names) {
        const [name, exportedName] = Array.isArray(entry) ? entry : [entry, entry];
        assert.notEqual(value(original, name), undefined, name);
        assert.deepEqual(value(roundtrip, exportedName), value(original, name), name);
    }
    return out;
};
const exported = source => {
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    for (const costume of imported.costumes) creator.applyCustomSVG(costume.sprite, costume.svg);
    assert.deepEqual(creator.warnings, []);
    return projectToArcade(creator.project, {costumeSvg: (target, costume) => {
        const asset = creator.assets.get(costume.assetId);
        return asset?.type === 'svg' ? asset.data : null;
    }});
};
const sdkWriter = `let initialX = 0
function launch() {
    let shot = sprites.createProjectileFromSprite(img\`1\`, null, -40, 0)
    initialX = shot.x
}
launch()
initialX += 0`;

test('a proved SDK-number accumulator exports through the ordinary helper', () => {
    const out = exported(sdkWriter);
    assert.deepEqual(out.unsupported, []);
    assert.match(out.ts, /function __bwBinaryAdd\(left: any, right: any\): any \{ return left \+ right \}/);
    assert.doesNotMatch(out.ts, /join\(","\)/);
});

test('the same proved accumulator exports when an unrelated Array exists', () => {
    const out = exported(`let values = [1, 2]
${sdkWriter}
values.push(initialX)`);
    assert.deepEqual(out.unsupported, []);
    assert.match(out.ts, /function __bwBinaryAdd\(left: any, right: any\): any \{ return left \+ right \}/);
});

test('an undeclared-type SDK result in an Array program exports through the runtime-dispatch helper', async () => {
    await dispatched(`let values = [1, 2]
let tempo = 0
function read() {
    tempo = music.tempo()
}
read()
tempo += 0
values.push(tempo)
let count = values.length`, [['tempo', 'tempo_'], 'count']);
});


// Array-containing programs: a declared-number SDK Sprite field read on an
// SDK Sprite factory value is a Number producer, so no fallback is needed.
const spriteFieldWithArray = `let values = [1, 2]
let shot = sprites.create(img\`1\`)
let moved = shot.x + 1
values.push(moved)`;

test('an Array program adding a declared-number SDK Sprite field exports with the ordinary helper', () => {
    const out = exported(spriteFieldWithArray);
    assert.deepEqual(out.unsupported, []);
    assert.match(out.ts, /function __bwBinaryAdd\(left: any, right: any\): any \{ return left \+ right \}/);
    assert.match(out.ts, /__bwBinaryAdd\(shot\.x, \(0 \+ 1\)\)/);
});

// Operator decision 2026-10-27: a numeric SDK Sprite field read through a
// parameter whose every actual argument is a Sprite is admitted (it can only
// be a Number). Original-PXT equality is asserted in
// test/arcade-native-addition-readmitted-roundtrip.test.mjs; the null-argument
// case below keeps its refusal.
test('a Sprite field read through a parameter that only receives Sprites exports with the ordinary helper', () => {
    const out = exported(`let values = [1, 2]
let total = 0
function move(target: Sprite) {
    total = target.x + 1
}
move(sprites.create(img\`1\`))
values.push(total)`);
    assert.deepEqual(out.unsupported, []);
    assert.match(out.ts, /function __bwBinaryAdd\(left: any, right: any\): any \{ return left \+ right \}/);
});

test('a Sprite field read through a parameter that may receive null exports through the runtime-dispatch helper', async () => {
    const source = `let values = [1, 2]
let total = 0
function move(target: Sprite) {
    total = target.x + 1
}
move(null)
move(sprites.create(img\`1\`))
values.push(total)`;
    const out = exported(source);
    assert.deepEqual(out.unsupported, [], JSON.stringify(out.unsupportedDetails));
    assert.ok(out.ts.includes(runtimeDispatchAddHelperSource('__bwBinaryAdd')), out.ts);
    // The original faults on null.x; the exported program must fault the same way.
    const fault = /Expected type Sprite but received type null/;
    await assert.rejects(runPxtArcade(source), fault);
    await assert.rejects(runPxtArcade(out.files), fault);
});

// Array programs: the refusal applies only where an Array can reach an
// addition operand. These operands are SDK Sprite field reads through a
// Sprite-declared local, program class method results and typeof results.
test('an Array program adding a Sprite field read through a program receiver function keeps the ordinary helper', () => {
    const out = exported(`let values = [1, 2]
let actor = sprites.create(img\`1\`)
function owner() { return actor }
owner().fx += 5
values.push(1)`);
    assert.deepEqual(out.unsupported, []);
    assert.match(out.ts, /function __bwBinaryAdd\(left: any, right: any\): any \{ return left \+ right \}/);
});

const classResult = escape => `let values = [1, 2]
class Counter {
    count: number
    constructor() { this.count = 3 }
    read() { return this.count }
}
let counter = new Counter()
let total = 0
total = counter.read() + 1
${escape}values.push(total)`;

test('a program method result in a program whose Arrays stay closed keeps the ordinary helper', () => {
    const out = exported(classResult(''));
    assert.deepEqual(out.unsupported, []);
    assert.doesNotMatch(out.ts, /join\(","\)/);
});

test('the same method result exports through the runtime-dispatch helper once an Array escapes into an SDK call', async () => {
    await dispatched(classResult('sprites.create(img`1`).say(values)\n') + '\nlet count = values.length', ['total', 'count']);
});
