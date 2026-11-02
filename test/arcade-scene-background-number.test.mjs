import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram, clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

// scene.backgroundColor() is a typed Number in the pinned SDK and Lite's
// reporter always returns a Number. Passed to a number formal it needs no
// runtime dispatch; original PXT, Lite and the export agree.
const SOURCE = `let color = 2
let observed = 0
function paint(value: number) { scene.setBackgroundColor(value) }
let hero = sprites.create(img\`1\`, SpriteKind.Player)
paint(color)
color = scene.backgroundColor() + 1
paint(color)
observed = scene.backgroundColor()
`;
const files = source => ({'main.ts': source, 'pxt.json': JSON.stringify({dependencies: {device: '*'}, files: ['main.ts']})});

test('scene.backgroundColor() Number results agree with original PXT through the VM and export', async () => {
    const expected = {color: 3, observed: 3};
    const original = await runPxtArcade(files(SOURCE), {fakeClock: true, waitForGlobals: expected});
    for (const [key, value] of Object.entries(expected)) assert.equal(original[key], value, key);
    const imported = arcadeToPseudocode(SOURCE);
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 10, uploads: imported.costumes, storage: true});
    try {
        assert.deepEqual(run.errors, []);
        const vars = Object.fromEntries(run.vm.runtime.targets.flatMap(t => Object.values(t.variables)).map(v => [v.name.replace(/^Game_/, ''), v.value]));
        for (const [key, value] of Object.entries(expected)) assert.equal(vars[key], value, key);
        const exported = projectToArcade(run.creator.project, {costumeSvg: (target, costume) => run.creator.assets.get(costume.assetId)?.data});
        assert.deepEqual(exported.unsupported, []);
        const back = await runPxtArcade(exported.files, {fakeClock: true, waitForGlobals: expected});
        for (const [key, value] of Object.entries(expected)) assert.equal(back[key], value, 'export ' + key);
    } finally { run.vm.quit(); clearStrayTimers(); }
});

test('an aliased, written or extracted scene namespace keeps the parameter refusal', () => {
    const call = 'function paint(value: number) { scene.setBackgroundColor(value) }\npaint(scene.backgroundColor() + 1)\n';
    for (const extra of ['let s: any = scene\n', 'let read = scene.backgroundColor\n', '(scene as any).backgroundColor = () => "x"\n']) {
        const unsupported = arcadeToPseudocode(extra + call).unsupported;
        assert.ok(unsupported.length > 0, extra);
    }
    assert.deepEqual(arcadeToPseudocode(call).unsupported, []);
});

// Without a sprite, a global written from a typed SDK Number call used to get
// no scalar declaration, so `set color to 2` stored the text "2" and the
// Number formal refused at run time. PXT stores Numbers; so must Lite.
const NO_SPRITE = `let color = 2
let observed = 0
let halved = 0
function paint(value: number) { scene.setBackgroundColor(value) }
paint(color)
color = scene.backgroundColor() + 1
paint(color)
observed = scene.backgroundColor()
halved = Math.floor(observed / 2)
`;

test('a program without sprites keeps typed SDK Number globals as Numbers, as original PXT does', async () => {
    const expected = {color: 3, observed: 3, halved: 1};
    const original = await runPxtArcade(files(NO_SPRITE), {fakeClock: true, waitForGlobals: expected});
    for (const [key, value] of Object.entries(expected)) assert.equal(original[key], value, key);
    const imported = arcadeToPseudocode(NO_SPRITE);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /declare arcade source scalar color as Number/);
    const run = await runProgram(imported.code, {frames: 10, storage: true});
    try {
        assert.deepEqual(run.errors, []);
        const vars = Object.fromEntries(run.vm.runtime.targets.flatMap(t => Object.values(t.variables)).map(v => [v.name.replace(/^Game_/, ''), v.value]));
        for (const [key, value] of Object.entries(expected)) assert.strictEqual(vars[key], value, key);
        const exported = projectToArcade(run.creator.project, {costumeSvg: (target, costume) => run.creator.assets.get(costume.assetId)?.data});
        assert.deepEqual(exported.unsupported, []);
        const back = await runPxtArcade(exported.files, {fakeClock: true, waitForGlobals: expected});
        for (const [key, value] of Object.entries(expected)) assert.equal(back[key], value, 'export ' + key);
    } finally { run.vm.quit(); clearStrayTimers(); }
});

test('a shadowed SDK namespace gives no typed Number result', () => {
    const imported = arcadeToPseudocode('let scene: any = {backgroundColor: () => "x"}\nlet color = 2\ncolor = scene.backgroundColor()\n');
    assert.doesNotMatch(imported.code, /declare arcade source scalar color as Number/);
});
