/**
 * MakeCode Arcade → a Scratch project: the artwork and the translation.
 *
 * Two real games carry this file. `arcade-assets.hex` is the friendly
 * case — one script per sprite, a .g.jres gallery, a background — and
 * `arcade-shield.hex` is the hostile one, a pong where a single script
 * drives three sprites, which Scratch cannot express and which must
 * therefore come back as a list of refusals rather than as a game that
 * silently does not work.
 *
 * As in makecode-translate.test.mjs, the assertion that matters is that
 * SB3Creator compiles the result into the sprites and blocks named here.
 */

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

import {INTEGRATED, REPO} from './helpers/bw-integrated.mjs';
import {
    ARCADE_PALETTE,
    parseImageLiteral,
    parseJres,
    parseTilemaps,
    renderTilemap,
    decodeMkcdImage,
    imageToSvg
} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {unpackMakeCodeSource} from '../overlay/scratch-gui/src/lib/bw-makecode/embedded-source.js';

const COMPILER = join(INTEGRATED, 'src', 'lib', 'sb3-creator.js');
const canCompile = existsSync(COMPILER);
const SB3Creator = canCompile ? (await import(COMPILER)).default : null;

const fixture = name =>
    new Uint8Array(readFileSync(join(REPO, 'test', 'fixtures', 'makecode', name)));

const projectOf = async name => (await unpackMakeCodeSource(fixture(name))).files;

test('an img literal is read with MakeCode\'s own character set', () => {
    // The `img` shim's groups are ["0.", "1#", "2T", ...]: hex digit or
    // mnemonic, and spaces are separators that carry nothing.
    const image = parseImageLiteral('. 1 2 .\n. T # .');
    assert.equal(image.width, 4);
    assert.equal(image.height, 2);
    assert.deepEqual([...image.pixels], [0, 1, 2, 0, 0, 2, 1, 0], 'T is 2 and # is 1');
    assert.equal(parseImageLiteral('. .\n. . .'), null, 'a ragged literal is refused, not guessed');
    assert.equal(parseImageLiteral(''), null);
});

test('the SVG uses the Arcade palette and leaves colour 0 out', () => {
    const svg = imageToSvg({width: 2, height: 1, pixels: new Uint8Array([0, 2])}, {scale: 4});
    assert.match(svg, /width="8" height="4"/);
    assert.equal((svg.match(/<rect/g) || []).length, 1, 'transparent pixels are absent, not painted');
    assert.match(svg, new RegExp(ARCADE_PALETTE[2]));
});

test('runs of one colour merge into one rect', () => {
    const svg = imageToSvg({width: 8, height: 1, pixels: new Uint8Array([1, 1, 1, 1, 2, 2, 2, 2])});
    assert.equal((svg.match(/<rect/g) || []).length, 2, '8 pixels, 2 colours, 2 rects');
});

test('a .g.jres gallery decodes column-major, which is the whole trick', async () => {
    const files = await projectOf('arcade-assets.hex');
    const jres = Object.entries(files).find(([name]) => /\.jres$/.test(name));
    assert.ok(jres, 'this fixture was chosen because it has an asset gallery');
    const images = parseJres(jres[1]);
    const names = Object.keys(images);
    assert.ok(names.length >= 2);
    // Row-major decoding of a column-major buffer produces a diagonal
    // smear of the right size, so size alone proves nothing — the sprite
    // has to have an empty first row and a filled middle.
    const sprite = Object.values(images).find(i => i.width === 16 && i.height === 16);
    assert.ok(sprite, 'a 16x16 sprite');
    const row = y => [...sprite.pixels.slice(y * 16, (y + 1) * 16)];
    assert.ok(row(0).every(p => p === 0), 'the top row is transparent');
    assert.ok(row(8).some(p => p !== 0), 'the middle row is not');
});

test('a malformed image buffer is refused', () => {
    assert.equal(decodeMkcdImage('AAAA'), null);
    assert.equal(decodeMkcdImage(''), null);
});

test('a real Arcade game becomes sprites, costumes and scripts', async () => {
    const files = await projectOf('arcade-assets.hex');
    const out = arcadeToPseudocode(files, {name: 'unterwasser'});

    assert.match(out.code, /^DEVICE ARCADE/, 'an imported game selects the playable console');
    assert.deepEqual(out.sprites, ['background', 'mySprite', 'gegner', 'einfangen']);
    // The backdrop is a sprite, not a Stage costume: applyCustomSVG
    // deliberately skips the Stage, so a Stage costume would never arrive.
    assert.ok(out.costumes.some(c => c.sprite === 'background'));
    assert.equal(out.costumes.length, 4, 'every sprite got its art');
    assert.match(out.code, /WHEN up arrow key pressed:/, 'controller events are key hats');
    assert.match(out.code, /IF touching mySprite THEN:/, 'overlap becomes touching');
    assert.match(out.code, /change score by/);
    assert.match(out.code, /create clone of gegner/, 'a mid-game spawn is a clone');
    assert.match(out.code, /change x by gegner_vx \/ 10/, 'velocity becomes a motion loop');
});

test('the clone is created AFTER the parent is positioned', async () => {
    const files = await projectOf('arcade-assets.hex');
    const {code} = arcadeToPseudocode(files);
    const lines = code.split('\n');
    const clone = lines.findIndex(l => /create clone of gegner/.test(l));
    const position = lines.findIndex(l => /go to x: 240/.test(l));
    assert.ok(position > -1 && clone > position,
        'a Scratch clone inherits the parent\'s position, so the order is load-bearing');
});

test('coordinates are converted, and stay in Arcade units in between', () => {
    const {code} = arcadeToPseudocode(`
        let hero = sprites.create(img\`1\`, SpriteKind.Player)
        hero.x = 80
        hero.y = 0
        game.onUpdate(function () {
            if (hero.x > 100) { hero.x = 0 }
        })
    `);
    assert.match(code, /set x to 0\b/, '80 is the middle of a 160-wide screen');
    assert.match(code, /set y to 180\b/, 'y 0 is the top, which is +180 on the stage');
    // The comparison is the game's own arithmetic and must not silently
    // switch units halfway through.
    assert.match(code, /\(x position \/ 3 \+ 80\) > 100/);
});

test('what Scratch cannot express is refused by name', () => {
    // A script that moves TWO sprites can only ever be one of them. The
    // script lands on the sprite it mentions first and the other one's
    // writes are refused — a Scratch script cannot move its neighbour.
    const {code, unsupported} = arcadeToPseudocode(`
        let hero = sprites.create(img\`1\`, SpriteKind.Player)
        let coin = sprites.create(img\`2\`, SpriteKind.Food)
        game.onUpdate(function () {
            coin.x = 10
            hero.x = 20
            coin.startEffect(effects.confetti)
        })
    `);
    assert.match(code, /set x to -210/, 'the sprite it does own is translated');
    assert.ok(unsupported.some(u => /hero\.x/.test(u)), 'the other one is refused');
    assert.ok(unsupported.some(u => /startEffect/.test(u)), 'and so are effects');
    assert.match(code, /# unsupported: hero\.x/, 'each refusal is said where it happened');
});

test('the hostile case reports rather than pretends', async () => {
    const files = await projectOf('arcade-shield.hex');
    const out = arcadeToPseudocode(files, {name: 'ping-pong'});
    assert.equal(out.sprites.length, 3);
    assert.ok(out.unsupported.length > 5,
        'a pong driven from one script cannot become three Scratch sprites, and says so');
    assert.ok(out.unsupported.every(u => typeof u === 'string' && u.length > 10),
        'each refusal names what it refused');
});

test('the translation compiles into the sprites and blocks it names', {skip: canCompile ? false :
    'packages/scratch-gui not integrated — run `npm run integrate` first'}, async () => {
    const files = await projectOf('arcade-assets.hex');
    const out = arcadeToPseudocode(files, {name: 'unterwasser'});
    const creator = new SB3Creator();
    const project = creator.parse(out.code);

    assert.deepEqual(project.targets.map(t => t.name),
        ['Stage', 'background', 'mySprite', 'gegner', 'einfangen']);

    const ops = new Set();
    for (const target of project.targets) {
        for (const block of Object.values(target.blocks || {})) {
            if (block && block.opcode) ops.add(block.opcode);
        }
    }
    for (const expected of [
        'event_whenflagclicked', 'event_whenkeypressed', 'control_forever',
        'control_create_clone_of', 'sensing_touchingobject', 'motion_gotoxy',
        'motion_changexby', 'motion_changeyby', 'motion_yposition',
        'data_changevariableby', 'operator_random'
    ]) {
        assert.ok(ops.has(expected), `${expected} is missing — a mapping compiled to silence`);
    }

    // And the artwork attaches to the sprites the code just created.
    for (const costume of out.costumes) {
        assert.ok(creator.applyCustomSVG(costume.sprite, costume.svg),
            `${costume.sprite} has no sprite to put its costume on`);
    }
});

test('a tilemap is read out of the generated factory, not the jres', async () => {
    // The TILES are in the .g.jres; the MAP is a hex literal inside a
    // generated switch in tilemap.g.ts, which is why it has its own
    // reader. Header: u16 width, u16 height, then one byte per cell.
    const files = await projectOf('arcade-tilemap.hex');
    const maps = parseTilemaps(files['tilemap.g.ts']);
    assert.ok(Object.keys(maps).length >= 2, 'a platformer has several levels');

    const level = maps.level;
    assert.equal(level.width, 32);
    assert.equal(level.height, 8);
    assert.equal(level.cells.length, 32 * 8);
    assert.ok(level.tiles.length >= 4, 'and a tile set to index into');
    // The bottom row is the ground: a level that parsed as all-empty
    // would still have the right dimensions, so check it has content.
    const bottom = [...level.cells.slice(7 * 32)];
    assert.ok(bottom.every(c => c !== 0), 'the ground row is solid');
    assert.ok([...level.cells.slice(0, 32)].every(c => c === 0), 'the sky is not');
});

test('the level is painted whole, tile by tile', async () => {
    const files = await projectOf('arcade-tilemap.hex');
    const maps = parseTilemaps(files['tilemap.g.ts']);
    const tiles = parseJres(files['tilemap.g.jres']);
    const image = renderTilemap(maps.level, tiles);
    assert.equal(image.width, 32 * 16, '32 tiles of 16 pixels');
    assert.equal(image.height, 8 * 16);
    // The sky is transparent and the ground is not — the two together
    // rule out both "nothing was drawn" and "everything was".
    assert.ok([...image.pixels.slice(0, image.width)].every(p => p === 0));
    assert.ok([...image.pixels.slice((image.height - 1) * image.width)].some(p => p !== 0));
});

test('a platformer imports with its level as the backdrop', async () => {
    const files = await projectOf('arcade-tilemap.hex');
    const out = arcadeToPseudocode(files, {name: 'jumpy platformer'});
    assert.ok(out.sprites.includes('background'));
    const backdrop = out.costumes.find(c => c.sprite === 'background');
    assert.ok(backdrop, 'the level became a costume');
    assert.match(backdrop.name, /^level-/);
    assert.ok(backdrop.svg.length > 10000, 'a whole level, not a placeholder');
    // And the difference it cannot hide: a picture is not terrain.
    assert.ok(out.unsupported.some(u => /not as terrain/.test(u)));
    // Eight levels at a few hundred kilobytes each is more than the paint
    // editor should be handed, so the extras are named, not dropped.
    assert.equal(out.costumes.filter(c => c.sprite === 'background').length, 4);
    assert.ok(out.unsupported.some(u => /only the first 4 backdrops/.test(u)));
});

test('sprite kinds are numbers, not refusals', () => {
    // Every Arcade game defines a few kinds; reporting them would bury
    // the real refusals under noise.
    const out = arcadeToPseudocode(`
        namespace SpriteKind { export const Coin = SpriteKind.create() }
        let hero = sprites.create(img\`1\`, SpriteKind.Player)
    `);
    assert.ok(!out.unsupported.some(u => /SpriteKind/.test(u)));
});

test('the controller reads as the keyboard, both ways', () => {
    // moveSprite becomes arrow-key motion; isPressed becomes the key
    // sensing block. Between them they cover how nearly every Arcade
    // game reads input.
    const {code, unsupported} = arcadeToPseudocode(`
        let hero = sprites.create(img\`1\`, SpriteKind.Player)
        controller.moveSprite(hero, 100, 0)
        game.onUpdate(function () {
            if (controller.left.isPressed()) { hero.x += -2 }
            if (controller.A.isPressed()) { hero.y += -5 }
        })
    `);
    assert.match(code, /IF key left arrow pressed\? THEN:/);
    assert.match(code, /IF key space pressed\? THEN:/, 'the A button is the space bar');
    assert.match(code, /change y by 15/, "Arcade's y grows downwards and the stage's grows up");
    assert.match(code, /IF key right arrow pressed\? THEN:/, 'moveSprite drives the arrows');
    assert.deepEqual(unsupported, []);
});
