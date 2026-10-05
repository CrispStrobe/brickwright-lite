/**
 * A Scratch project -> MakeCode Arcade (lib/bw-makecode/export-arcade.js).
 *
 * The contract, checked on real programs: every one of lite's 38 Scratch game
 * examples, and every Arcade game a real MakeCode file imports into, exports to
 * TypeScript that MakeCode's OWN Arcade compiler accepts (measured 42/42 on
 * 2026-09-25, after two defects the first run found: variables given text were
 * declared as numbers, and a placeholder literal 0 tripped Static TypeScript's
 * literal narrowing). What has no Arcade counterpart is NAMED, never dropped.
 * The unit cases pin the model mapping: coordinates, keys, touching, costumes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import util from 'node:util';
import {fileURLToPath} from 'node:url';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {pixelsToSvg, svgToPixels} from '../overlay/scratch-gui/src/lib/bw-makecode/pixel-image.js';
import {parseImageLiteral} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';
import {importArtefact} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';
import {makeCodeSourceHex} from '../overlay/scratch-gui/src/lib/bw-makecode/export.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {compile, hasRuntime} from '../scripts/lib/pxt-node.mjs';
import {runProgram} from './helpers/bw-vm.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {default: SB3Creator} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/sb3-creator.js'));
const games = (await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/sb3-creator-game-examples.js'))).default;

const exportOf = (src, uploads = []) => {
    const cr = new SB3Creator();
    cr.parse(src);
    for (const u of uploads) (u.mode === 'add' ? cr.addCustomSVGCostume(u.sprite, u.svg, u.name) : cr.applyCustomSVG(u.sprite, u.svg));
    return projectToArcade(cr.project, {costumeSvg: (t, c) => {
        const a = cr.assets.get(c.assetId);
        return a && a.type === 'svg' ? a.data : null;
    }});
};

test('sprite procedure arguments keep each caller handle through runtime and Arcade export', async () => {
    const source = `function shift(sprite: Sprite, distance: number) { sprite.x += distance }
function relay(sprite: Sprite, distance: number) { shift(sprite, distance) }
let first: Sprite = sprites.create(img\`1\`, SpriteKind.Player)
let second: Sprite = sprites.create(img\`2\`, SpriteKind.Enemy)
relay(first, 10)
relay(second, 20)`;
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /DEFINE shift \(sprite\) \(distance\):\n  arcade set x of sprite to calculate value \(arcade property x of sprite\) op "\+" with \(arcade local distance\)/);
    assert.match(imported.code, /DEFINE relay \(sprite\) \(distance\):\n  shift \(arcade local sprite\) \(arcade local distance\)/);
    const run = await runProgram(imported.code, {frames: 12, uploads: imported.costumes});
    assert.deepEqual(run.creator.warnings, []);
    assert.deepEqual(run.errors, []);
    const positions = run.vm.runtime.targets.filter(t => !t.isOriginal).map(t => t.x).sort((a, b) => a - b);
    assert.deepEqual(positions, [28.5, 58.5]);
    const exported = exportOf(imported.code, imported.costumes);
    assert.deepEqual(exported.unsupported, []);
    assert.match(exported.ts, /function Game_shift \(sprite: Sprite, distance: number\)/);
    assert.match(exported.ts, /Game_relay\(first, \(0 \+ 10\)\)/);
    if (hasRuntime('arcade')) {
        const result = await compile('arcade', exported.files);
        assert.equal(result.success, true, JSON.stringify(result.diagnostics));
    }
});

test('a named sprite can move inside an overlap callback with its background intact', async () => {
    const source = `let player: Sprite = null
let food: Sprite = null
scene.setBackgroundColor(13)
player = sprites.create(img\`1\`, SpriteKind.Player)
food = sprites.create(img\`2\`, SpriteKind.Food)
sprites.onOverlap(SpriteKind.Player, SpriteKind.Food, function (sprite, otherSprite) {
    food.setPosition(randint(0, scene.screenWidth()), randint(0, scene.screenHeight()))
})`;
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /arcade set position of \(food\) x \(pick random 0 to 160\) y \(pick random 0 to 120\)/);
    const exported = exportOf(imported.code, imported.costumes);
    assert.deepEqual(exported.unsupported, []);
    assert.match(exported.ts, /scene\.setBackgroundColor\(13\)/);
    assert.match(exported.ts, /food\.setPosition\(randint\(0, 160\), randint\(0, 120\)\)/);
    if (hasRuntime('arcade')) {
        const result = await compile('arcade', exported.files);
        assert.equal(result.success, true, JSON.stringify(result.diagnostics));
    }
});

test('namespaced creation callbacks pass each new sprite through helper procedures', async () => {
    const source = `namespace SpriteKind { export const Asteroid = SpriteKind.create() }
namespace asteroids {
    sprites.onCreated(SpriteKind.Asteroid, function (sprite: Sprite) { mark(sprite) })
    function mark(sprite: Sprite) { count += 1; sprite.x = count * 10 }
}
let count = 0
sprites.create(img\`1\`, SpriteKind.Asteroid)
sprites.create(img\`2\`, SpriteKind.Asteroid)`;
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /WHEN arcade creation handler "__bwCreated1" runs:/);
    assert.ok(imported.code.includes('DEFINE mark (sprite):\n  set count to (calculate value (count) op "+" with ((0 + (1))))\n  arcade set x of sprite to calculate value (count) op "*" with ((0 + (10)))'));
    const run = await runProgram(imported.code, {frames: 15, uploads: imported.costumes});
    assert.deepEqual(run.creator.warnings, []);
    assert.deepEqual(run.errors, []);
    const positions = run.vm.runtime.targets.filter(t => !t.isOriginal).map(t => t.x).sort((a, b) => a - b);
    assert.deepEqual(positions, [-210, -180]);
    const exported = exportOf(imported.code, imported.costumes);
    assert.deepEqual(exported.unsupported, []);
    assert.match(exported.ts, /sprites\.onCreated\(SpriteKind\.Asteroid/);
    assert.match(exported.ts, /Game_mark\(__bwCreatedSprite___bwCreated1\)/);
    if (hasRuntime('arcade')) {
        const result = await compile('arcade', exported.files);
        assert.equal(result.success, true, JSON.stringify(result.diagnostics));
    }
});

test('namespaced creation events retain startup text prompts and screen coordinates', async () => {
    const source = `namespace SpriteKind { export const Asteroid = SpriteKind.create() }
namespace asteroids {
    sprites.onCreated(SpriteKind.Asteroid, function (sprite: Sprite) { sprite.x = 10 })
    game.onUpdateInterval(1500, function () { sprites.create(img\`1\`, SpriteKind.Asteroid) })
}
let name: string = game.askForString("What is your name?")
let x: number = screen.width / 2
game.splash(name)`;
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /set name to arcade ask text "What is your name\?"/);
    assert.ok(imported.code.includes('set x_ to calculate value (160) op "/" with ((0 + (2)))'));
    assert.match(imported.code, /WHEN arcade every 1500 ms:/);
    const exported = exportOf(imported.code, imported.costumes);
    assert.deepEqual(exported.unsupported, []);
    assert.match(exported.ts, /game\.askForString\("What is your name\?"\)/);
    if (hasRuntime('arcade')) {
        const result = await compile('arcade', exported.files);
        assert.equal(result.success, true, JSON.stringify(result.diagnostics));
    }
});

test('namespaced creation setup appends strings through conditional branches', async () => {
    const source = `namespace SpriteKind { export const Asteroid = SpriteKind.create() }
namespace asteroids {
    sprites.onCreated(SpriteKind.Asteroid, function (sprite: Sprite) { sprite.x = 10 })
}
let name = "Captain "
let suffix = "A"
if (suffix == "A") { suffix += " 2" }
name += suffix
sprites.create(img\`1\`, SpriteKind.Asteroid)`;
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /set suffix to \(calculate value \(suffix\) op "\+" with \(" 2"\)\)/);
    assert.match(imported.code, /set name to \(calculate value \(name\) op "\+" with \(suffix\)\)/);
    const run = await runProgram(imported.code, {frames: 10, uploads: imported.costumes});
    assert.deepEqual(run.errors, []);
    const variables = run.vm.runtime.targets.flatMap(target => Object.values(target.variables || {}));
    assert.equal(variables.find(variable => variable.name === 'name')?.value, 'Captain A 2');
    const exported = exportOf(imported.code, imported.costumes);
    assert.deepEqual(exported.unsupported, []);
    if (hasRuntime('arcade')) {
        const result = await compile('arcade', exported.files);
        assert.equal(result.success, true, JSON.stringify(result.diagnostics));
    }
});

test('reassigning a sprite handle inside a loop positions each spawned sprite', async () => {
    const source = `let duck: Sprite = null
for (let index = 0; index <= 4; index++) {
    duck = sprites.create(img\`1\`, SpriteKind.Player)
    duck.setPosition(15 + index * 20, 10)
}`;
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 35, uploads: imported.costumes});
    assert.deepEqual(run.creator.warnings, []);
    assert.deepEqual(run.errors, []);
    const positions = run.vm.runtime.targets.filter(target => !target.isOriginal)
        .map(target => target.x).sort((a, b) => a - b);
    assert.deepEqual(positions, [-195, -135, -75, -15, 45]);
    const exported = exportOf(imported.code, imported.costumes);
    assert.deepEqual(exported.unsupported, []);
    if (hasRuntime('arcade')) {
        const result = await compile('arcade', exported.files);
        assert.equal(result.success, true, JSON.stringify(result.diagnostics));
    }
});

test('named player and unnamed interval sprites share the handle event path', async () => {
    const source = `namespace SpriteKind { export const Asteroid = SpriteKind.create() }
namespace asteroids {
    sprites.onCreated(SpriteKind.Asteroid, function(sprite: Sprite) { sprite.x = 10 })
    game.onUpdateInterval(1500, function() { sprites.create(img\`1\`, SpriteKind.Asteroid) })
}
for (let i = 0; i < 2; i++) { sprites.create(img\`1\`, SpriteKind.Asteroid) }
let player = sprites.create(img\`2\`, SpriteKind.Player)
controller.moveSprite(player, 80, 30)
player.setPosition(80, 60)`;
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /WHEN arcade every 1500 ms:/);
    assert.match(imported.code, /arcade control sprite \(player\) vx \(80\) vy \(30\)/);
    const run = await runProgram(imported.code, {frames: 25, uploads: imported.costumes});
    assert.deepEqual(run.creator.warnings, []);
    assert.deepEqual(run.errors, []);
    const sprites = Object.values(run.vm.runtime.bwArcadeDeviceState?.sprites || {})
        .filter(sprite => sprite.id);
    assert.equal(sprites.filter(sprite => sprite.kind === 'Asteroid' && sprite.x === 10).length, 2);
    assert.equal(sprites.filter(sprite => sprite.kind === 'Player' && sprite.x === 80).length, 1);
    const exported = exportOf(imported.code, imported.costumes);
    assert.deepEqual(exported.unsupported, []);
    if (hasRuntime('arcade')) {
        const result = await compile('arcade', exported.files);
        assert.equal(result.success, true, JSON.stringify(result.diagnostics));
    }
});

test('onCreated image change applies to every template of the same sprite kind', async () => {
    const image = '3 3 3 3\n3 . . 3\n3 3 3 3';
    const source = `namespace SpriteKind { export const Cloud = SpriteKind.create() }
sprites.onCreated(SpriteKind.Cloud, function(sprite: Sprite) { sprite.setImage(img\`${image}\`) })
let first = sprites.create(img\`1 1\n1 1\`, SpriteKind.Cloud)
let second = sprites.create(img\`2 2\n2 2\`, SpriteKind.Cloud)`;
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /arcade set costume of arcade event first to 1/);
    const changed = imported.costumes.filter(costume => costume.name.endsWith('-frame-1'));
    assert.equal(changed.length, 2);
    for (const costume of changed) {
        const pixels = svgToPixels(costume.svg);
        assert.equal(pixels?.width, 4);
        assert.equal(pixels?.height, 3);
        assert.deepEqual([...pixels.pixels], [...parseImageLiteral(image).pixels]);
    }
    const run = await runProgram(imported.code, {frames: 12, uploads: imported.costumes});
    assert.deepEqual(run.creator.warnings, []);
    assert.deepEqual(run.errors, []);
    const clouds = Object.values(run.vm.runtime.bwArcadeDeviceState?.sprites || {})
        .filter(sprite => sprite.id && sprite.kind === 'Cloud');
    assert.equal(clouds.length, 2);
    assert.ok(clouds.every(sprite => sprite.width === 4 && sprite.height === 3));
    const exported = exportOf(imported.code, imported.costumes);
    assert.deepEqual(exported.unsupported, []);
    assert.match(exported.ts, /__bwCreatedSprite_\w+\.setImage\(img`/);
    if (hasRuntime('arcade')) {
        const result = await compile('arcade', exported.files);
        assert.equal(result.success, true, JSON.stringify(result.diagnostics));
    }
});

test('the model mapping: coordinates, keys, touching', () => {
    const {ts, unsupported} = exportOf(`SPRITE hero:
WHEN flag clicked:
  go to x: 30 y: -60
  FOREVER:
    IF touching enemy THEN:
      change y by 30
WHEN right arrow key pressed:
  change x by 6

SPRITE enemy:
WHEN flag clicked:
  set x to 90
`, ['hero', 'enemy'].map(sprite => ({sprite,
        svg: pixelsToSvg(parseImageLiteral('1 1\n1 1')), mode: 'replace'})));
    assert.match(ts, /hero\.setPosition\(30 \/ 3 \+ 80, 60 - -60 \/ 3\)/, 'Scratch 30,-60 is Arcade 90,80');
    assert.match(ts, /hero\.overlapsWith\(enemy\)/);
    assert.match(ts, /hero\.y -= 30 \/ 3/, 'y up in Scratch is y down in Arcade');
    assert.match(ts, /controller\.right\.onEvent\(ControllerButtonEvent\.Pressed, function \(\) \{\n\s+hero\.x \+= 6 \/ 3/);
    assert.match(ts, /enemy\.x = 90 \/ 3 \+ 80/);
    assert.deepEqual(unsupported, []);
});

test('a pixel-art costume becomes the sprite\'s image exactly', () => {
    const art = parseImageLiteral('. 2 2 .\n2 5 5 2\n. 2 2 .');
    const {ts} = exportOf('SPRITE gem:\nWHEN flag clicked:\n  wait 1 seconds\n', [{sprite: 'gem', svg: pixelsToSvg(art), mode: 'replace'}]);
    assert.match(ts, /sprites\.create\(img`\n\s+\. 2 2 \.\n\s+2 5 5 2\n\s+\. 2 2 \.\n`, SpriteKind\.Player\)/);
});

test('Arcade bounce block exports and reimports through MakeCode sprite methods', async () => {
    const source = `DEVICE ARCADE\nGLOBAL hero\nSPRITE art:\nWHEN flag clicked:\n  hide\nSPRITE Game:\nWHEN flag clicked:\n  set hero to arcade spawn template "art" kind "Player" x 80 y 60 width 2 height 2\n  arcade bounce hero on wall 1\n  arcade ghost hero through sprites 1\n`;
    const out = exportOf(source, [{sprite: 'art', svg: pixelsToSvg(parseImageLiteral('1 1\n1 1')), mode: 'replace'}]);
    assert.deepEqual(out.unsupported, []);
    assert.match(out.ts, /hero\.setBounceOnWall\(true\)/);
    assert.match(out.ts, /hero\.setFlag\(SpriteFlag\.GhostThroughSprites, true\)/);
    const imported = arcadeToPseudocode(out.files);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /arcade bounce hero on wall \(0 < 1\)/);
    assert.match(imported.code, /arcade ghost hero through sprites \(0 < 1\)/);
    const flagged = arcadeToPseudocode({'main.ts': `let hero: Sprite = null\nhero = sprites.create(img\`1\`, SpriteKind.Player)\nhero.setFlag(SpriteFlag.BounceOnWall, true)\nhero.setFlag(SpriteFlag.GhostThroughSprites, true)`});
    assert.deepEqual(flagged.unsupported, []);
    assert.match(flagged.code, /arcade bounce hero on wall \(0 < 1\)/);
    assert.match(flagged.code, /arcade ghost hero through sprites \(0 < 1\)/);
    if (hasRuntime('arcade')) {
        const compiled = await compile('arcade', out.files);
        assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
    }
});

test('a pinned PXT gallery sprite survives Arcade import and reexport', async () => {
    const imported = arcadeToPseudocode('let skelly = sprites.create(sprites.castle.skellyFront, SpriteKind.Enemy)');
    assert.deepEqual(imported.unsupported, []);
    const exported = exportOf(imported.code, imported.costumes);
    assert.deepEqual(exported.unsupported, []);
    assert.match(exported.ts, /let __bwFrames_shared1: Image\[\] = \[img`/);
    assert.match(exported.ts, /sprites\.create\(__bwFrames_shared1\[/);
    if (hasRuntime('arcade')) {
        const compiled = await compile('arcade', exported.files);
        assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
    }
});

test('exported Arcade sprite variables retain their original handle names with exact art', () => {
    const imported = arcadeToPseudocode(
        'let hostSprite = sprites.create(sprites.castle.princessFront0, SpriteKind.Player)\n' +
        'hostSprite.sayText("Hello")');
    assert.deepEqual(imported.unsupported, []);
    const exported = exportOf(imported.code, imported.costumes);
    assert.deepEqual(exported.unsupported, []);
    assert.match(exported.ts, /let hostSprite: Sprite = null/);
    assert.match(exported.ts, /hostSprite = sprites\.create\(/);
    const again = arcadeToPseudocode(exported.files);
    assert.deepEqual(again.unsupported, []);
    assert.match(again.code, /GLOBAL hostSprite/);
    assert.deepEqual(svgToPixels(again.costumes[0].svg), svgToPixels(imported.costumes[0].svg));
});

test('a sprite name that collides with an Arcade API is reported', () => {
    const exported = exportOf('SPRITE game:\nWHEN flag clicked:\n  wait 1 seconds\n',
        [{sprite: 'game', svg: pixelsToSvg(parseImageLiteral('1')), mode: 'replace'}]);
    assert.ok(exported.unsupported.some(gap => gap.includes('sprite variable name changed')));
    assert.match(exported.ts, /let gameSprite = sprites\.create\(/);
});

test('an Arcade number prompt reexports to the PXT prompt API', async () => {
    const imported = arcadeToPseudocode('let n = game.askForNumber("Number?")');
    assert.deepEqual(imported.unsupported, []);
    const exported = exportOf(imported.code);
    assert.deepEqual(exported.unsupported, []);
    assert.match(exported.ts, /game\.askForNumber\("Number\?"\)/);
    assert.doesNotMatch(exported.ts, /sprites\.create\(/);
    if (hasRuntime('arcade')) {
        const compiled = await compile('arcade', exported.files);
        assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
    }
});

test('an Arcade text prompt reexports to the PXT prompt API', async () => {
    const imported = arcadeToPseudocode('let name = game.askForString("Name?")');
    assert.deepEqual(imported.unsupported, []);
    const exported = exportOf(imported.code);
    assert.deepEqual(exported.unsupported, []);
    assert.match(exported.ts, /game\.askForString\("Name\?"\)/);
    if (hasRuntime('arcade')) {
        const compiled = await compile('arcade', exported.files);
        assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
    }
});

test('what has no Arcade counterpart is named and left as a comment where it stood', () => {
    const {ts, unsupported} = exportOf('SPRITE s:\nWHEN flag clicked:\n  switch backdrop to night\n  wait 1 seconds\n');
    assert.ok(unsupported.some(u => /backdrop/.test(u)), JSON.stringify(unsupported));
    assert.match(ts, /\/\/ looks_switchbackdropto/);
});

test('Arcade handle blocks export sprite identity, artwork, motion and collision callbacks',
    {skip: !hasRuntime('arcade')}, async () => {
        const art = parseImageLiteral('1 1\n1 1');
        const out = exportOf(`DEVICE ARCADE
GLOBAL hero
GLOBAL enemy
GLOBAL remaining
SPRITE heroArt:
WHEN flag clicked:
  hide
SPRITE enemyArt:
WHEN flag clicked:
  hide
SPRITE Game:
WHEN arcade kind "Enemy" created:
  arcade set vy of arcade event first to 10
WHEN arcade kinds "Player" and "Enemy" overlap:
  arcade destroy arcade event second
  change score by 1
WHEN space key pressed:
  arcade set vx of hero to 30
WHEN z key pressed:
  arcade set vx of hero to -30
WHEN flag clicked:
  set score to 0
  set lives to 3
  set hero to arcade spawn template "heroArt" kind "Player" x 80 y 60 width 2 height 2
  set enemy to arcade spawn template "enemyArt" kind "Enemy" x 90 y 60 width 2 height 2
  arcade set vx of enemy to -20
  arcade keep hero in screen 1
  set remaining to arcade count kind "Enemy"
  IF arcade hero overlaps enemy THEN:
    change score by 5
`, [
            {sprite: 'heroArt', svg: pixelsToSvg(art), mode: 'replace'},
            {sprite: 'enemyArt', svg: pixelsToSvg(art), mode: 'replace'}
        ]);
        assert.deepEqual(out.unsupported, []);
        assert.deepEqual(out.warnings, []);
        assert.match(out.ts, /let hero: Sprite = null/);
        assert.match(out.ts, /let enemy: Sprite = null/);
        assert.match(out.ts, /sprites\.onOverlap\(SpriteKind\.Player, SpriteKind\.Enemy/);
        assert.match(out.ts, /sprites\.onCreated\(SpriteKind\.Enemy/);
        assert.match(out.ts, /otherSprite\.destroy\(\)/);
        assert.match(out.ts, /info\.setScore\(0\)/);
        assert.match(out.ts, /info\.setLife\(3\)/);
        assert.match(out.ts, /info\.changeScoreBy\(1\)/);
        assert.match(out.ts, /controller\.A\.onEvent\(ControllerButtonEvent\.Pressed/);
        assert.match(out.ts, /controller\.B\.onEvent\(ControllerButtonEvent\.Pressed/);
        assert.match(out.ts, /hero\.setPosition\(80, 60\)/);
        assert.match(out.ts, /enemy\.vx = -20/);
        assert.match(out.ts, /sprites\.allOfKind\(SpriteKind\.Enemy\)\.length/);
        assert.match(out.ts, /hero\.overlapsWith\(enemy\)/);
        assert.doesNotMatch(out.ts, /heroArtSprite|enemyArtSprite|GameSprite/);
        const result = await compile('arcade', out.files);
        assert.equal(result.success, true, JSON.stringify(result.diagnostics?.slice(0, 5)));
        const imported = arcadeToPseudocode(out.files);
        assert.deepEqual(imported.unsupported, []);
        assert.match(imported.code, /arcade create template/);
        assert.ok(imported.code.includes('arcade set vx of enemy to convert value ((0 + (20))) op "-"'));
        assert.match(imported.code, /arcade destroy arcade event second/);
        assert.match(imported.code, /arcade count kind "Enemy"/);
        assert.match(imported.code, /IF truthiness of value \(arcade hero overlaps enemy\) THEN:/);
        assert.match(imported.code, /WHEN arcade creation handler "__bwCreated1" runs:/);
        assert.match(imported.code, /WHEN space key pressed:/);
        assert.match(imported.code, /WHEN z key pressed:/);
        const roundtrip = await runProgram(imported.code, {frames: 4});
        assert.deepEqual(roundtrip.creator.warnings, []);
        assert.deepEqual(roundtrip.errors, []);
        assert.equal(Object.values(roundtrip.vm.runtime.bwArcadeDeviceState?.sprites || {})
            .filter(sprite => sprite.id).length, 2);
    });

test('a simple authored handle game survives Arcade source HEX export and import', async () => {
    const art = parseImageLiteral('3 3\n3 3');
    const out = exportOf(`DEVICE ARCADE
GLOBAL hero
SPRITE heroArt:
WHEN flag clicked:
  hide
SPRITE Game:
WHEN flag clicked:
  set hero to arcade spawn template "heroArt" kind "Player" x 80 y 60 width 2 height 2
  arcade set vx of hero to 25
  arcade keep hero in screen 1
`, [{sprite: 'heroArt', svg: pixelsToSvg(art), mode: 'replace'}]);
    assert.deepEqual(out.unsupported, []);
    assert.deepEqual(out.warnings, []);
    const hex = makeCodeSourceHex(out.files, {
        name: 'Brickwright Arcade Game',
        target: 'arcade',
        editorUrl: 'https://arcade.makecode.com/'
    });
    const imported = await importArtefact(new TextEncoder().encode(hex), {name: 'game.hex'});
    assert.equal(imported.project.target, 'arcade');
    assert.equal(imported.files['main.ts'], out.files['main.ts']);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /arcade create template "__arcadeTemplate1" kind "Player"/);
    assert.equal(imported.costumes.length, 1);
    assert.match(imported.code, /arcade set vx of hero to 25/);
});

test('an authored costume change exports as a real Arcade image and reimports as a costume',
    {skip: !hasRuntime('arcade')}, async () => {
        const first = parseImageLiteral('1 1\n1 1');
        const second = parseImageLiteral('2 2\n2 2');
        const out = exportOf(`DEVICE ARCADE
GLOBAL hero
SPRITE heroArt:
WHEN flag clicked:
  hide
SPRITE Game:
WHEN flag clicked:
  set hero to arcade spawn template "heroArt" kind "Player" x 80 y 60 width 2 height 2
  arcade set costume of hero to 1
`, [
            {sprite: 'heroArt', svg: pixelsToSvg(first), mode: 'replace'},
            {sprite: 'heroArt', svg: pixelsToSvg(second), name: 'second', mode: 'add'}
        ]);
        assert.deepEqual(out.unsupported, []);
        assert.deepEqual(out.warnings, []);
        assert.match(out.ts, /hero\.setImage\(img`\n\s+2 2\n\s+2 2\n`\)/);
        const compiled = await compile('arcade', out.files);
        assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics?.slice(0, 5)));
        const imported = arcadeToPseudocode(out.files);
        assert.deepEqual(imported.unsupported, []);
        assert.match(imported.code, /arcade set costume of hero to 1/);
        assert.equal(imported.costumes.length, 2);
        const exportedAgain = exportOf(imported.code, imported.costumes);
        assert.deepEqual(exportedAgain.unsupported, []);
        assert.deepEqual(exportedAgain.warnings, []);
        assert.match(exportedAgain.ts, /hero\.setImage\(img`\n\s+2 2\n\s+2 2\n`\)/);
        const run = await runProgram(imported.code, {frames: 4, uploads: imported.costumes});
        assert.deepEqual(run.errors, []);
        assert.deepEqual(run.creator.warnings, []);
        const sprite = Object.values(run.vm.runtime.bwArcadeDeviceState?.sprites || {})
            .find(s => s.id);
        assert.equal(sprite?.costume, 1);
    });

test('a computed frame index wraps and survives Arcade compilation and reimport',
    {skip: !hasRuntime('arcade')}, async () => {
    const art = parseImageLiteral('1 1\n1 1');
    const next = parseImageLiteral('2 2 2\n2 2 2');
    const out = exportOf(`DEVICE ARCADE
GLOBAL hero
GLOBAL frame
SPRITE heroArt:
WHEN flag clicked:
  hide
SPRITE Game:
WHEN flag clicked:
  set frame to 3
  set hero to arcade spawn template "heroArt" kind "Player" x 80 y 60 width 2 height 2
  arcade set costume of hero to frame
`, [
        {sprite: 'heroArt', svg: pixelsToSvg(art), mode: 'replace'},
        {sprite: 'heroArt', svg: pixelsToSvg(next), name: 'next', mode: 'add'}
    ]);
    assert.deepEqual(out.unsupported, []);
    assert.match(out.ts, /__bwFrames_heroArt\[/);
    assert.match(out.ts, /Math\.round\(frame\) % 2/);
    const compiled = await compile('arcade', out.files);
    assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics?.slice(0, 5)));
    const imported = arcadeToPseudocode(out.files);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /arcade set image of hero to arcade frame image array .* index \(frame\)/);
    assert.equal(imported.costumes.length, 2);
    const reexported = exportOf(imported.code, imported.costumes);
    assert.deepEqual(reexported.unsupported, []);
    assert.match(reexported.ts, /Math\.round\(frame\) % 2/);
    const run = await runProgram(imported.code, {frames: 4, uploads: imported.costumes, storage: true});
    assert.deepEqual(run.errors, []);
    const sprite = Object.values(run.vm.runtime.bwArcadeDeviceState?.sprites || {}).find(s => s.id);
    assert.deepEqual([...sprite.image.pixels], [2,2,2,2,2,2]);
    assert.equal(sprite?.width, 3);
});

test('fixed and computed image changes share the same imported frame indices', () => {
    const out = exportOf(`DEVICE ARCADE
GLOBAL hero
GLOBAL frame
SPRITE heroArt:
WHEN flag clicked:
  hide
SPRITE Game:
WHEN flag clicked:
  set hero to arcade spawn template "heroArt" kind "Player" x 80 y 60 width 2 height 2
  arcade set costume of hero to 1
  arcade set costume of hero to frame
`, [
        {sprite: 'heroArt', svg: pixelsToSvg(parseImageLiteral('1 1\n1 1')), mode: 'replace'},
        {sprite: 'heroArt', svg: pixelsToSvg(parseImageLiteral('2 2\n2 2')), name: 'next', mode: 'add'}
    ]);
    assert.deepEqual(out.unsupported, []);
    const imported = arcadeToPseudocode(out.files);
    assert.deepEqual(imported.unsupported, []);
    assert.equal(imported.costumes.length, 2);
    assert.match(imported.code, /arcade set costume of hero to 1\n  arcade set image of hero to arcade frame image array .* index \(frame\)/);
});

test('a resized image updates Arcade collision bounds after export and reimport', async () => {
    const out = exportOf(`DEVICE ARCADE
GLOBAL hero
SPRITE heroArt:
WHEN flag clicked:
  hide
SPRITE Game:
WHEN flag clicked:
  set hero to arcade spawn template "heroArt" kind "Player" x 80 y 60 width 2 height 2
  arcade set costume of hero to 1
`, [
        {sprite: 'heroArt', svg: pixelsToSvg(parseImageLiteral('1 1\n1 1')), mode: 'replace'},
        {sprite: 'heroArt', svg: pixelsToSvg(parseImageLiteral('2 2 2\n2 2 2')), name: 'larger', mode: 'add'}
    ]);
    assert.deepEqual(out.unsupported, []);
    const imported = arcadeToPseudocode(out.files);
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 4, uploads: imported.costumes});
    assert.deepEqual(run.errors, []);
    const sprite = Object.values(run.vm.runtime.bwArcadeDeviceState?.sprites || {}).find(s => s.id);
    assert.equal(sprite?.width, 3);
    assert.equal(sprite?.height, 2);
});

test('Arcade import carries setImage changes that resize collision bounds', () => {
    const imported = arcadeToPseudocode({'main.ts': `let hero: Sprite = null
hero = sprites.create(img\`
    1 1
    1 1
\`, SpriteKind.Player)
hero.setImage(img\`
    2 2 2
    2 2 2
\`)
`});
    assert.deepEqual(imported.unsupported, []);
    assert.equal(imported.costumes.length, 2);
});

test('resizing noncanonical SVG artwork stays an explicit export gap', () => {
    const out = exportOf(`DEVICE ARCADE
GLOBAL hero
SPRITE heroArt:
WHEN flag clicked:
  hide
SPRITE Game:
WHEN flag clicked:
  set hero to arcade spawn template "heroArt" kind "Player" x 80 y 60 width 2 height 2
  arcade set costume of hero to 1
`, [
        {sprite: 'heroArt', svg: pixelsToSvg(parseImageLiteral('1 1\n1 1'), {scale: 2}), mode: 'replace'},
        {sprite: 'heroArt', svg: pixelsToSvg(parseImageLiteral('2 2 2\n2 2 2'), {scale: 2}),
            name: 'larger', mode: 'add'}
    ]);
    assert.ok(out.unsupported.some(item => item.includes('four-unit pixel SVG artwork')));
});

test('export-shaped Arcade startup threads and event aliases import as live handles', () => {
    const imported = arcadeToPseudocode(`function move (sprite: Sprite) { sprite.x += 2 }
let made: Sprite = null
let alias: Sprite = null
let caption = ""
game.onUpdateInterval(100, function () {
    made = sprites.create(img\`1\`, SpriteKind.Enemy)
    made.setPosition(20, 30)
})
sprites.onCreated(SpriteKind.Enemy, function (sprite: Sprite) {
    alias = sprite
    move(alias)
})
control.runInParallel(function () {
    while (true) { caption = "" + caption + "!"; pause(100) }
})`);
    assert.deepEqual(imported.unsupported, []);
    assert.equal(imported.costumes.length, 1);
    assert.match(imported.code, /WHEN arcade every 100 ms:[\s\S]*arcade set position of \(made\)/);
    assert.match(imported.code, /WHEN arcade creation handler "__bwCreated1" runs:[\s\S]*set alias to \(arcade event first\)/);
    assert.match(imported.code, /DEFINE move \(sprite\):\n  arcade set x of sprite/);
    assert.match(imported.code, /WHEN flag clicked:\n  FOREVER:[\s\S]*calculate value \(calculate value \(""\) op "\+" with \(caption\)\) op "\+" with \("!"\)/);
});

test('a procedure local sprite spawns on each call and stays local through Arcade export', async () => {
    const source = `function spawnAt(x: number) {
    let ball: Sprite = sprites.create(img\`1 1\n1 1\`, SpriteKind.Player)
    ball.x = x
    ball.y = 30
}
spawnAt(20)
spawnAt(100)`;
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /arcade set local ball to \(arcade create template/);
    assert.match(imported.code, /DEFINE spawnAt \(x_\):[\s\S]*arcade set x of arcade local ball to arcade local x_/);
    const run = await runProgram(imported.code, {frames: 8, uploads: imported.costumes});
    assert.deepEqual(run.errors, []);
    const sprites = Object.values(run.vm.runtime.bwArcadeDeviceState?.sprites || {})
        .filter(sprite => sprite.id).map(sprite => [sprite.x, sprite.y]).sort((a, b) => a[0] - b[0]);
    assert.deepEqual(sprites, [[20, 30], [100, 30]]);
    const exported = exportOf(imported.code, imported.costumes);
    assert.deepEqual(exported.unsupported, []);
    const reimported = arcadeToPseudocode(exported.files);
    assert.deepEqual(reimported.unsupported, []);
    assert.doesNotMatch(reimported.code, /GLOBAL ball/);
    assert.match(reimported.code, /arcade set x of arcade local ball/);
    const rerun = await runProgram(reimported.code, {frames: 8, uploads: reimported.costumes});
    assert.deepEqual(rerun.errors, []);
    const roundtripSprites = Object.values(rerun.vm.runtime.bwArcadeDeviceState?.sprites || {})
        .filter(sprite => sprite.id).map(sprite => [sprite.x, sprite.y]).sort((a, b) => a[0] - b[0]);
    assert.deepEqual(roundtripSprites, [[20, 30], [100, 30]]);
});

test('update callback projectiles keep their local handles through runtime and Arcade export', async () => {
    const source = `namespace SpriteKind { export const Star = SpriteKind.create() }
game.onUpdate(function () {
    let star = sprites.createProjectile(img\`1\`, 50, 0, SpriteKind.Star)
    star.y = 42
})`;
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /WHEN arcade updates:[\s\S]*arcade set local star to \(arcade projectile template/);
    const assertRuntime = async (code, uploads) => {
        const run = await runProgram(code, {frames: 4, uploads});
        assert.deepEqual(run.errors, []);
        const sprites = Object.values(run.vm.runtime.bwArcadeDeviceState?.sprites || {})
            .filter(sprite => sprite.id);
        assert.ok(sprites.length >= 2);
        assert.ok(sprites.every(sprite => sprite.kind === 'Star' && sprite.y === 42 && sprite.vx === 50));
    };
    await assertRuntime(imported.code, imported.costumes);
    const exported = exportOf(imported.code, imported.costumes);
    assert.deepEqual(exported.unsupported, []);
    assert.match(exported.files['main.ts'], /game\.onUpdate\(function \(\) \{\n    let star: Sprite = null/);
    const reimported = arcadeToPseudocode(exported.files);
    assert.deepEqual(reimported.unsupported, []);
    await assertRuntime(reimported.code, reimported.costumes);
    if (hasRuntime('arcade')) {
        const compiled = await compile('arcade', exported.files);
        assert.equal(compiled.success, true, compiled.diagnostics?.map(d => d.message).join('\n'));
    }
});

test('a procedure can reassign its local handle to a projectile', async () => {
    const source = `function launch() {
    let shot: Sprite = null
    shot = sprites.createProjectile(img\`1\`, 10, 0)
    shot.y = 42
}
launch()`;
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /arcade set local shot to \(arcade projectile template/);
    const exported = exportOf(imported.code, imported.costumes);
    assert.deepEqual(exported.unsupported, []);
    const reimported = arcadeToPseudocode(exported.files);
    assert.deepEqual(reimported.unsupported, []);
    assert.match(reimported.code, /arcade set y of arcade local shot to 42/);
    const run = await runProgram(reimported.code, {frames: 4, uploads: reimported.costumes});
    assert.deepEqual(run.errors, []);
    const sprites = Object.values(run.vm.runtime.bwArcadeDeviceState?.sprites || {}).filter(sprite => sprite.id);
    assert.equal(sprites.length, 1);
    assert.equal(sprites[0].y, 42);
    assert.equal(sprites[0].vx, 10);
});

test('an update callback steers a named enemy toward a separate player handle', async () => {
    const source = `let player = sprites.create(img\`1\`, SpriteKind.Player)
let enemy = sprites.create(img\`2\`, SpriteKind.Enemy)
player.setPosition(100, 80)
enemy.setPosition(20, 10)
game.onUpdate(function () {
    if (player.x > enemy.x) enemy.vx = 2
    if (player.y > enemy.y) enemy.vy = 2
})`;
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /WHEN arcade updates:[\s\S]*arcade set vx of enemy to 2/);
    const assertMotion = async (code, uploads) => {
        const run = await runProgram(code, {frames: 5, uploads});
        assert.deepEqual(run.errors, []);
        const sprites = Object.values(run.vm.runtime.bwArcadeDeviceState?.sprites || {})
            .filter(sprite => sprite.id);
        assert.equal(sprites.length, 2);
        const enemy = sprites.find(sprite => sprite.kind === 'Enemy');
        assert.equal(enemy?.vx, 2);
        assert.equal(enemy?.vy, 2);
    };
    await assertMotion(imported.code, imported.costumes);
    const exported = exportOf(imported.code, imported.costumes);
    assert.deepEqual(exported.unsupported, []);
    const reimported = arcadeToPseudocode(exported.files);
    assert.deepEqual(reimported.unsupported, []);
    await assertMotion(reimported.code, reimported.costumes);
});

test('a custom-kind sprite keeps its update handler through Arcade reimport', () => {
    const source = `namespace SpriteKind { export const Asteroid = SpriteKind.create() }
let rock = sprites.create(img\`1\`, SpriteKind.Asteroid)
rock.vx = 50
game.onUpdate(function () {
    if (rock.x > 160) { rock.x = 0; rock.vx = -rock.vx }
})`;
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /WHEN arcade updates:/);
    const exported = exportOf(imported.code, imported.costumes);
    assert.deepEqual(exported.unsupported, []);
    const reimported = arcadeToPseudocode(exported.files);
    assert.deepEqual(reimported.unsupported, []);
    assert.match(reimported.code, /WHEN arcade updates:[\s\S]*arcade set vx of rock/);
});

test('Arcade sprite edges use image dimensions for writes and reads', async () => {
    const source = `let box = sprites.create(img\`1 1 1 1\n1 1 1 1\`, SpriteKind.Player)
box.bottom = 80
box.right = 100
box.bottom += 5
let bottom = box.bottom
let right = box.right`;
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    assert.ok(imported.code.includes('arcade set bottom of box to calculate value (arcade property bottom of box) op "+" with ((0 + (5)))'));
    const check = async (code, uploads) => {
        const run = await runProgram(code, {frames: 5, uploads});
        assert.deepEqual(run.errors, []);
        const box = Object.values(run.vm.runtime.bwArcadeDeviceState?.sprites || {})
            .find(sprite => sprite.id);
        assert.equal(box?.width, 4);
        assert.equal(box?.height, 2);
        assert.equal(box?.x, 98);
        assert.equal(box?.y, 84);
    };
    await check(imported.code, imported.costumes);
    const exported = exportOf(imported.code, imported.costumes);
    assert.deepEqual(exported.unsupported, []);
    assert.match(exported.files['main.ts'], /box\.bottom = __bwBinaryAdd\(box\.bottom, \(0 \+ 5\)\)/);
    const reimported = arcadeToPseudocode(exported.files);
    assert.deepEqual(reimported.unsupported, []);
    await check(reimported.code, reimported.costumes);
});

test('a creation callback positions an edge after changing sprite image size', async () => {
    const imported = arcadeToPseudocode(`sprites.onCreated(SpriteKind.Trampoline, function (sprite: Sprite) {
    sprite.setImage(img\`1 1 1 1\n1 1 1 1\`)
    sprite.bottom = 80
})
let platform = sprites.create(img\`1\`, SpriteKind.Trampoline)`);
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 5, uploads: imported.costumes});
    assert.deepEqual(run.errors, []);
    const platform = Object.values(run.vm.runtime.bwArcadeDeviceState?.sprites || {})
        .find(sprite => sprite.id);
    assert.equal(platform?.width, 4);
    assert.equal(platform?.height, 2);
    assert.equal(platform?.y, 79);
});

// ── MakeCode's own compiler, over the whole corpus ─────────────────────────
const STATIC = path.join(ROOT, 'packages/scratch-gui/static/makecode/arcade');
const skip = fs.existsSync(path.join(STATIC, 'pxtworker.js')) ? false : 'MakeCode runtime not synced (npm run sync:makecode) — pxt compiler absent';

test('every lite game and every imported Arcade game exports to TypeScript MakeCode\'s compiler accepts', {skip, timeout: 1200000}, async () => {
    const {PXT_GLUE_JS} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-makecode/pxt-runtime.js'));
    const sb = {setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate,
        TextEncoder: util.TextEncoder, TextDecoder: util.TextDecoder, Buffer,
        console: {log () {}, debug () {}, info () {}, warn () {}, error () {}},
        pxtTargetBundle: JSON.parse(fs.readFileSync(path.join(STATIC, 'target.json'), 'utf8'))};
    sb.global = sb;
    sb.self = sb;
    sb.eval = src => vm.runInContext(src, sb, {filename: 'eval'});
    vm.createContext(sb, {codeGeneration: {strings: false, wasm: false}});
    vm.runInContext(fs.readFileSync(path.join(STATIC, 'pxtworker.js'), 'utf8'), sb, {filename: 'pxtworker.js'});
    vm.runInContext(PXT_GLUE_JS, sb, {filename: 'pxt-glue.js'});
    const corpus = Object.entries(games).map(([id, src]) => ({id, src: String(src), uploads: []}));
    for (const f of ['arcade-assets.hex', 'arcade-tilemap.hex', 'arcade-umlaut.hex', 'arcade-shield.hex']) {
        const r = await importArtefact(new Uint8Array(fs.readFileSync(path.join(ROOT, 'test/fixtures/makecode', f))), {name: f});
        corpus.push({id: f, src: r.code, uploads: r.costumes || []});
    }
    assert.ok(corpus.length >= 40, `only ${corpus.length} programs`);
    const failed = [];
    for (const c of corpus) {
        const ex = exportOf(c.src, c.uploads);
        const r = JSON.parse(JSON.stringify(await sb.bwMakeCode.compile(ex.files, {})));
        if (!r.success) failed.push(`${c.id}: ${(r.diagnostics[0] || {}).message}`);
    }
    assert.deepEqual(failed, []);
});
