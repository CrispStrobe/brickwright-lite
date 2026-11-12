import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';

// An asset the project does not carry (animation, image, tile, song) stays a named assets.* reference. It is an inert literal like an
// img tag, so it must not make the export's addition helper proof "not current" and refuse the program's ordinary `+`.
const exportOf = source => {
    const imported = arcadeToPseudocode(source);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    for (const costume of imported.costumes || []) {
        if (costume.mode === 'add') creator.addCustomSVGCostume(costume.sprite, costume.svg, costume.name);
        else creator.applyCustomSVG(costume.sprite, costume.svg);
    }
    return {imported, exported: projectToArcade(creator.project, {costumeSvg: (target, costume) => creator.assets.get(costume.assetId)?.data})};
};
const NOTE = /native addition requires its complete current helper body and actual caller proof/;
const source = tail => `let hero = sprites.create(img\`
    . 2
    2 .
\`, SpriteKind.Player)
let total = 0
total += 1
${tail}`;

test('a missing named animation does not refuse the addition helper', () => {
    const {imported, exported} = exportOf(source('animation.runImageAnimation(hero, assets.animation`Absent`, 100, false)'));
    assert.deepEqual(imported.unsupported, ['Missing animation asset reference: "Absent"']);
    assert.ok(!exported.unsupported.some(note => NOTE.test(note)), exported.unsupported.join('|'));
    const text = exported.files['main.ts'];
    assert.match(text, /total = __bwBinaryAdd\(total, /);
    assert.match(text, /animation\.runImageAnimation\(hero, assets\.animation`Absent`, 100, /);
});

test('the same program without the missing animation exports the same addition', () => {
    const {exported} = exportOf(source(''));
    assert.ok(!exported.unsupported.some(note => NOTE.test(note)), exported.unsupported.join('|'));
    assert.match(exported.files['main.ts'], /total = __bwBinaryAdd\(total, /);
});

test('missing image, tile and song references do not refuse the addition helper either', () => {
    const tails = [
        'let shot = sprites.createProjectileFromSide(assets.image`Absent`, -90, 0)',
        'let floor = assets.tile`Absent`',
        'music.play(music.createSong(assets.song`Absent`), music.PlaybackMode.UntilDone)'
    ];
    for (const tail of tails) {
        const {exported} = exportOf(source(tail));
        assert.ok(!exported.unsupported.some(note => NOTE.test(note)), `${tail}: ${exported.unsupported.join('|')}`);
        assert.match(exported.files['main.ts'], /total = __bwBinaryAdd\(total, /, tail);
    }
});
