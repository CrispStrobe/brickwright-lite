import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeSimAvailable, compileArcade, runArcadeSim} from '../scripts/lib/makecode-arcade-sim.mjs';
import {runProgram, clearStrayTimers} from './helpers/bw-vm.mjs';

// An Image-typed call on a namespace whose source is not in the project (`gallery.art(...)`) is kept by name with its
// arguments as real blocks, accepted wherever an Image is (projectile creation included), exported as the same call, and run
// as the same 1x1 transparent stand-in `arcade external image` uses.
const SIM = arcadeSimAvailable() ? false : 'MakeCode runtime not synced (npm run sync:makecode)';
const PROGRAM = `let shot = sprites.createProjectileFromSide(gallery.art(1, 3), 50, 0)
let hero = sprites.create(gallery.art(4), SpriteKind.Player)
console.log(shot.width + "x" + shot.height)
console.log(hero.width + "x" + hero.height)
console.log(shot.vx)
hero.setImage(gallery.art(7))
console.log(hero.width + "x" + hero.height)
`;
// What the program means when the namespace IS present: art() returns a 1x1 image.
const DEFINED = `namespace gallery {
    export function art(a: number, b?: number): Image {
        return image.create(1, 1)
    }
}
`;
const LOG = '1x1\n1x1\n50\n1x1\n';
const exportOf = imported => {
    const creator = new SB3Creator();
    creator.parse(imported.code);
    for (const costume of imported.costumes || []) {
        if (costume.mode === 'add') creator.addCustomSVGCostume(costume.sprite, costume.svg, costume.name);
        else creator.applyCustomSVG(costume.sprite, costume.svg);
    }
    return projectToArcade(creator.project, {costumeSvg: (target, costume) => creator.assets.get(costume.assetId)?.data});
};
const pxtLog = async main => (await runArcadeSim(await compileArcade(main), {ms: 500})).serial.map(line => `${line.text.replace(/\n$/, '')}\n`).join('');

test('an unresolved image call imports as a named block with its argument blocks, accepted as projectile and sprite art', () => {
    const imported = arcadeToPseudocode(PROGRAM);
    assert.deepEqual(imported.unsupported, []);
    const calls = imported.code.match(/arcade external image call "gallery\.art" arguments/g) || [];
    assert.equal(calls.length, 3);
    assert.match(imported.code, /arcade projectile image \(\(arcade external image call "gallery\.art" arguments \(/);
    assert.match(imported.code, /arcade create image \(\(arcade external image call "gallery\.art"/);
    assert.match(imported.code, /arcade set image of hero to \(arcade external image call "gallery\.art"/);
    assert.doesNotMatch(imported.code, /arcade external call "gallery\.art"/, 'an image position is an image, not a number');
    const creator = new SB3Creator();
    creator.parse(imported.code);
    assert.deepEqual(creator.warnings, []);
    const blocks = creator.project.targets.flatMap(target => Object.values(target.blocks));
    assert.equal(blocks.filter(block => block.opcode === 'arcade_externalImageCall').length, 3);
});

test('a call that is not in an image position stays the numeric external call', () => {
    const imported = arcadeToPseudocode('let n = gallery.size(2) + 1\nconsole.log(n)\n');
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /arcade external call "gallery\.size"/);
    assert.doesNotMatch(imported.code, /external image call/);
});

test('an image call exports as the same TypeScript call and imports back identically', () => {
    const imported = arcadeToPseudocode(PROGRAM);
    const exported = exportOf(imported);
    assert.deepEqual(exported.unsupported, []);
    const text = exported.files['main.ts'].replace(/\(0 \+ (\d+)\)/g, '$1');
    assert.match(text, /sprites\.createProjectileFromSide\(gallery\.art\(1, 3\), 50, 0\)/);
    assert.match(text, /sprites\.create\(gallery\.art\(4\), SpriteKind\.Player\)/);
    assert.match(text, /hero\.setImage\(gallery\.art\(7\)\)/);
    const back = arcadeToPseudocode(exported.files);
    assert.deepEqual(back.unsupported, []);
    const lines = code => code.split('\n').filter(line => /external image call/.test(line)).map(line => line.replace(/\s+/g, ''));
    assert.deepEqual(lines(back.code).length, lines(imported.code).length);
});

test('an image call runs as the 1x1 transparent stand-in and the program continues', async () => {
    const imported = arcadeToPseudocode(PROGRAM);
    try {
        const run = await runProgram(imported.code, {frames: 6, uploads: imported.costumes, storage: true});
        assert.deepEqual(run.errors, []);
        assert.equal(typeof run.vm.runtime._primitives.arcade_externalImageCall, 'function');
        assert.equal((run.vm.runtime.bwArcadeDeviceState?.serial ?? ''), LOG);
    } finally { clearStrayTimers(); }
});

test('pxt-arcade compiles and logs the same for the original and the export once the namespace is supplied', {skip: SIM, timeout: 300000}, async () => {
    const original = await pxtLog(DEFINED + PROGRAM);
    assert.equal(original, LOG);
    const exported = exportOf(arcadeToPseudocode(PROGRAM)).files['main.ts'];
    assert.equal(await pxtLog(DEFINED + exported), original);
});
