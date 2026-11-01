import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram, clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

// tiles.placeOnTile / placeOnRandomTile start with `if (!sprite ...) return;` in PXT: a sprite variable that
// is still null is a silent no-op and the script goes on. Sprite.setPosition on null throws, but the tile
// placements never reach it. A level script that places a sprite created later (the shipped platformer's
// `bumper`) must keep running.
const SOURCE = `let receiver:Sprite=null
let red=img\`2\`
tiles.setTilemap(tiles.createTilemap(hex\`03000200010201020102\`,img\`0 2 0
0 0 0\`,[img\`0\`,img\`2\`,img\`7\`],TileScale.Eight))
let step=0
tiles.placeOnTile(receiver,tiles.getTileLocation(1,0))
step=1
tiles.placeOnRandomTile(receiver,red)
step=2
let made=sprites.create(img\`1\`,SpriteKind.Player)
tiles.placeOnTile(made,tiles.getTileLocation(1,0))
let madeX=made.x
step=3`;
const names = ['step', 'madeX'];
const vars = run => Object.fromEntries(run.vm.runtime.targets.flatMap(t => Object.values(t.variables)).map(v => [v.name.replace(/^Game_/, ''), v.value]));

test('placing a null sprite on a tile is a no-op like PXT and the script continues', async () => {
    const expected = await runPxtArcade(SOURCE, {waitForGlobals: {step: 3}});
    assert.equal(expected.step, 3);
    assert.equal(expected.madeX, 12);
    const imported = arcadeToPseudocode(SOURCE);
    assert.deepEqual(imported.unsupported, []);
    let run;
    try {
        run = await runProgram(imported.code, {frames: 40, uploads: imported.costumes});
        const actual = vars(run);
        for (const name of names) assert.equal(actual[name], expected[name], name);
        assert.deepEqual(run.errors.filter(message => /Sprite|setPosition|Expected type/.test(message)), []);
    } finally {
        if (run) { run.vm.stopAll(); run.vm.quit(); }
        clearStrayTimers();
    }
});
