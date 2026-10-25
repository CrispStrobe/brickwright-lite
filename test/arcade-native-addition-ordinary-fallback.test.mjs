import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {SB3Creator} from './helpers/bw-vm.mjs';

// The native Array join is only relevant when an Array can reach an addition.
// Array-free programs whose operands are primitive or SDK (Opaque) values keep
// the ordinary helper; a known object operand or any Array keeps the refusal.
const reason = 'native addition requires initialized primitive or proved flat Array operands';
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

test('an Array-free SDK-number accumulator exports through the ordinary helper', () => {
    const out = exported(sdkWriter);
    assert.deepEqual(out.unsupported, []);
    assert.match(out.ts, /function __bwBinaryAdd\(left: any, right: any\): any \{ return left \+ right \}/);
    assert.doesNotMatch(out.ts, /join\(","\)/);
});

test('an undeclared-type SDK result stays refused once the program holds an Array', () => {
    const out = exported(`let values = [1, 2]
let tempo = 0
function read() {
    tempo = music.tempo()
}
read()
tempo += 0
values.push(tempo)`);
    assert.ok(out.unsupported.includes(reason), JSON.stringify(out.unsupported));
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

test('a Sprite field read through a parameter that may receive null keeps the refusal', () => {
    const out = exported(`let values = [1, 2]
let total = 0
function move(target: Sprite) {
    total = target.x + 1
}
move(null)
move(sprites.create(img\`1\`))
values.push(total)`);
    assert.ok(out.unsupported.includes(reason), JSON.stringify(out.unsupported));
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

test('the same method result keeps the refusal once an Array escapes into an SDK call', () => {
    const out = exported(classResult('sprites.create(img`1`).say(values)\n'));
    assert.ok(out.unsupported.includes(reason), JSON.stringify(out.unsupported));
});
