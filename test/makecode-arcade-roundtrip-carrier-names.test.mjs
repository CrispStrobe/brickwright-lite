import test from 'node:test';
import assert from 'node:assert/strict';
import {importProjectFiles} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';
import {projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';

// Artwork lives on a carrier sprite whose name the importer derives from how
// the program uses the image. The exported TypeScript names its frame bank
// after that carrier, so a second import must derive the same name instead of
// falling back to a generic one and "losing" the target.
function roundTrip (main) {
    const files = {'main.ts': main, 'pxt.json': JSON.stringify({name: 'rt', dependencies: {device: '*'}, files: ['main.ts']})};
    const imported = importProjectFiles(files, {target: 'arcade', name: 'rt'});
    const creator = new SB3Creator();
    creator.parse(imported.code);
    for (const costume of imported.costumes || []) {
        if (costume.mode === 'add') creator.addCustomSVGCostume(costume.sprite, costume.svg, costume.name);
        else creator.applyCustomSVG(costume.sprite, costume.svg);
    }
    const exported = projectJsonToArcade(JSON.stringify(creator.project), {name: 'roundtrip',
        costumeSvg: (sprite, costume) => {
            const asset = creator.assets.get(costume.assetId);
            return asset?.type === 'svg' ? asset.data : null;
        }});
    const back = importProjectFiles(exported.files, {target: 'arcade', name: 'roundtrip'});
    const again = new SB3Creator();
    again.parse(back.code);
    return {before: creator.project.targets.map(t => t.name), after: again.project.targets.map(t => t.name), exported};
}

test('a sprite created from built-in artwork keeps its carrier name through export and re-import', () => {
    const {before, after, exported} = roundTrip(
        'let hero = sprites.create(sprites.food.smallTaco, SpriteKind.Player)\nhero.setPosition(80, 60)\n');
    assert.match(exported.files['main.ts'], /__bwFrames_hero/, 'the frame bank is named after the carrier');
    assert.ok(before.includes('hero'));
    assert.deepEqual(before.filter(name => !after.includes(name)), []);
});

test('two sprites sharing artwork keep both carrier names', () => {
    const {before, after} = roundTrip(
        'let one = sprites.create(sprites.food.smallTaco, SpriteKind.Player)\n' +
        'let two = sprites.create(sprites.food.smallBurger, SpriteKind.Enemy)\n');
    assert.deepEqual(before.filter(name => !after.includes(name)), []);
});

test('a sprite stored in a host-local variable keeps its carrier names (the exporter prefixes the variable)', () => {
    const {before, after} = roundTrip(
        'for (let i = 0; i < 3; i++) {\n    let boss: Sprite = sprites.create(sprites.castle.skellyFront, SpriteKind.Enemy)\n' +
        '    boss.x = randint(0, 100)\n}\n');
    assert.ok(before.includes('bossSprite'), 'the plain sprite is named after the variable');
    assert.deepEqual(before.filter(name => !after.includes(name)), []);
});

test('two creations from the same built-in image share one bank and every sprite carrier stays', () => {
    const {before, after, exported} = roundTrip(
        'sprites.create(sprites.food.smallTaco, SpriteKind.Enemy)\n' +
        'game.onUpdateInterval(500, function () {\n    sprites.create(sprites.food.smallTaco, SpriteKind.Enemy)\n})\n');
    assert.equal((exported.files['main.ts'].match(/let __bwFrames_\w+: Image\[\]/g) || []).length, 1);
    const missing = before.filter(name => !after.includes(name));
    assert.deepEqual(missing.filter(name => !/^spriteArt\d*$/.test(name)), []);
});
