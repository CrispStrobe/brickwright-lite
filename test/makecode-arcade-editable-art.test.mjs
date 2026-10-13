// Imported MakeCode Arcade art is ordinary, editable Scratch costumes: each art
// holder is named after what the game does with it (hero, background,
// coinAnimation), its costumes are named after it, an inline animation is one
// sprite with a costume per frame, and an edit in the paint editor reaches the
// running game.
import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode, nameArtworkSprites} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram, stepFrames} from './helpers/bw-vm.mjs';

const GAME = `scene.setBackgroundImage(img\`
    9 9 9 9 9 9 9 9
    9 9 9 9 9 9 9 9
    7 7 7 7 7 7 7 7
    7 7 7 7 7 7 7 7
\`)
let hero = sprites.create(img\`
    . 2 2 .
    2 2 2 2
    2 . . 2
\`, SpriteKind.Player)
let coin = sprites.create(img\`
    5 5
    5 5
\`, SpriteKind.Food)
animation.runImageAnimation(coin, [img\`
    5 5
    5 5
\`, img\`
    4 4
    4 4
\`], 200, true)
controller.moveSprite(hero)
`;

const summary = r => r.costumes.map(c => `${c.sprite}/${c.name}/${c.mode || 'replace'}`);

test('art holders are named after the game\'s own names, costumes after their holder', () => {
    const r = arcadeToPseudocode(GAME);
    assert.deepEqual(r.unsupported, []);
    assert.deepEqual(r.sprites, ['Game', 'hero', 'coin', 'coinAnimation', 'background']);
    assert.deepEqual(summary(r), ['hero/hero/replace', 'coin/coin/replace', 'background/background/replace',
        'coinAnimation/coinAnimation-1/replace', 'coinAnimation/coinAnimation-2/add']);
    assert.doesNotMatch(r.code, /__arcade(?:Template|Background)\d/, 'no internal name is left for the user to read');
    assert.match(r.code, /set hero to \(arcade create template "hero" kind \(arcade sprite kind value "Player"\)/);
    assert.match(r.code, /arcade frame image array "coinAnimationImage" index \(0\) template "coinAnimation" start 0 count 2/);
    assert.match(r.code, /arcade set background image \(arcade copy image \(arcade frame image array "backgroundImage"/);
    assert.ok(r.costumes.every(c => !/\s/.test(c.name)), 'Code\'s COSTUME lines end a name at a space');
});

test('the inline animation is one sprite with a costume per frame, played in order', async () => {
    const r = arcadeToPseudocode(GAME);
    const run = await runProgram(r.code, {frames: 2, uploads: r.costumes, storage: true});
    try {
        assert.deepEqual(run.errors, []);
        const frames = run.vm.runtime.targets.find(t => t.isOriginal && t.getName() === 'coinAnimation').getCostumes();
        assert.deepEqual(frames.map(c => c.name), ['costume1', 'coinAnimation-2'], 'the helper keeps costume1 for the first; the importer names it');
        const coin = () => Object.values(run.vm.runtime.bwArcadeDeviceState.sprites).find(s => s.image?.width === 2);
        const seen = new Set();
        for (let i = 0; i < 20; i++) { seen.add(coin().image.pixels[0]); await stepFrames(run.vm, 2); }
        assert.deepEqual([...seen].sort(), [4, 5], 'both frames of the one sprite are shown');
    } finally {
        run.vm.quit?.();
    }
});

test('an edited frame costume is what the game draws', async () => {
    const r = arcadeToPseudocode(GAME);
    const run = await runProgram(r.code, {frames: 1, uploads: r.costumes, storage: true});
    try {
        const red = /fill="(#[0-9a-f]{6})"/i.exec(r.costumes.find(c => c.sprite === 'hero').svg)[1];
        const frame2 = r.costumes.find(c => c.name === 'coinAnimation-2').svg.replace(/fill="#[0-9a-f]{6}"/gi, `fill="${red}"`);
        const target = run.vm.runtime.targets.find(t => t.isOriginal && t.getName() === 'coinAnimation');
        run.vm.setEditingTarget(target.id);
        run.vm.updateSvg(1, frame2, 1, 1);
        run.vm.greenFlag();
        const coin = () => Object.values(run.vm.runtime.bwArcadeDeviceState.sprites).find(s => s.image?.width === 2);
        const seen = new Set();
        for (let i = 0; i < 20; i++) { await stepFrames(run.vm, 2); if (coin()) seen.add(coin().image.pixels[0]); }
        assert.ok(seen.has(2), `the edited frame (colour 2) is drawn: saw ${[...seen]}`);
        assert.ok(!seen.has(4), 'the original second frame is gone');
    } finally {
        run.vm.quit?.();
    }
});

test('readable names never collide with the game\'s own sprites', () => {
    const named = nameArtworkSprites({
        code: 'SPRITE Game:\n  set background to (arcade create template "__arcadeTemplate1" kind "Player" width 1 height 1)\n' +
            '  arcade set background image (arcade copy image (arcade frame image array "__arcadeBackground2Image" index (0) template "__arcadeBackground2" start 0 count 1))\n' +
            'SPRITE background:\nSPRITE __arcadeTemplate1:\nSPRITE __arcadeBackground2:\n',
        costumes: [{sprite: '__arcadeTemplate1', name: '__arcadeTemplate1', svg: '<svg/>'},
            {sprite: '__arcadeBackground2', name: '__arcadeBackground2', svg: '<svg/>'}],
        sprites: ['Game', 'background', '__arcadeTemplate1', '__arcadeBackground2'],
        unsupported: []
    });
    assert.deepEqual(named.sprites, ['Game', 'background', 'background2', 'background3']);
    assert.match(named.code, /template "background2" kind "Player"/);
    assert.match(named.code, /array "background3Image" index \(0\) template "background3"/);
    const plain = {code: 'SPRITE hero:\n', costumes: [], sprites: ['hero'], unsupported: []};
    assert.equal(nameArtworkSprites(plain), plain, 'a program without helper sprites is untouched');
});

test('renamed art still exports to MakeCode with its frames', async () => {
    const r = arcadeToPseudocode(GAME);
    const run = await runProgram(r.code, {frames: 0, uploads: r.costumes, storage: true});
    try {
        const exported = projectToArcade(run.creator.project, {costumeSvg: (target, costume) => run.creator.assets.get(costume.assetId)?.data});
        assert.deepEqual(exported.unsupported, []);
        assert.match(exported.ts, /animation\.runImageAnimation\(coin/);
        assert.match(exported.ts, /img`[\s\S]*4 4[\s\S]*`/, 'the second frame\'s pixels are exported');
    } finally {
        run.vm.quit?.();
    }
});
