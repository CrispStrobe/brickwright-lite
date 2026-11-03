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
