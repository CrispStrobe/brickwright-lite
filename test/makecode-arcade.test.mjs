/**
 * MakeCode Arcade → a Scratch project: the artwork and the translation.
 *
 * Real games exercise gallery assets, shared backgrounds, native sprite
 * instances and timed callbacks. Since task E1 an imported game runs on the
 * Arcade runtime (the `arcade` extension's sprite instances, created from
 * per-image templates by a `Game` sprite), not as one Scratch sprite per
 * Arcade sprite; what it still cannot do is reported by name.
 *
 * As in makecode-translate.test.mjs, SB3Creator must compile the result into
 * the sprites and blocks named here; where a claim is about behaviour, the
 * translation is run in the real VM.
 */

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {SOURCE, REPO} from './helpers/bw-integrated.mjs';
import {
    ARCADE_PALETTE,
    parseImageLiteral,
    parseExactImgLiteral,
    parseJres,
    parseTilemaps,
    renderTilemap,
    decodeMkcdImage,
    imageToSvg
} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {unpackMakeCodeSource} from '../overlay/scratch-gui/src/lib/bw-makecode/embedded-source.js';

const COMPILER = join(SOURCE, 'src', 'lib', 'sb3-creator.js');
const canCompile = existsSync(COMPILER);
const SB3Creator = canCompile ? (await import(COMPILER)).default : null;

const fixture = name =>
    new Uint8Array(readFileSync(join(REPO, 'test', 'fixtures', 'makecode', name)));

const projectOf = async name => (await unpackMakeCodeSource(fixture(name))).files;

const nativeCase = async body => {
    const imported=arcadeToPseudocode(`let b=sprites.create(img\`1 1\n1 1\`,SpriteKind.Player)
let observed=0
let v=8
game.onUpdate(function(){${body}})`);
    assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:2,uploads:imported.costumes,storage:true});
    assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
    const vars=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
    return {run,vars,sprite:run.vm.runtime.bwArcadeDeviceState.sprites[vars.b]};
};


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

test('pasted img literals retain palette indices and reject unknown pixels', () => {
    const literal = 'img`\n . 1 T f\n 0 # 2 F\n`';
    assert.deepEqual([...parseExactImgLiteral(literal).pixels], [0, 1, 2, 15, 0, 1, 2, 15]);
    assert.equal(parseExactImgLiteral('img`\n. 1 ?\n`'), null);
    assert.equal(parseExactImgLiteral('img`\n. 1\n2\n`'), null);
    assert.equal(parseExactImgLiteral('not an img literal'), null);
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
    assert.deepEqual(out.unsupported, []);
    assert.deepEqual(out.sprites, ['Game', '__arcadeTemplate1', '__arcadeTemplate2',
        '__arcadeTemplate3', '__arcadeBackground1']);
    assert.equal(out.costumes.length, 4, 'three instance templates and the background retain artwork');
    assert.match(out.code, /arcade register button "up" event \(2049\)/);
    assert.match(out.code, /arcade register overlap kind "Enemy" with kind "Player"/);
    assert.match(out.code, /arcade change score player \(1\) by/);
    assert.match(out.code, /arcade create template "__arcadeTemplate2" kind "Enemy"/);
    assert.match(out.code, /arcade set vx of gegner to/);
    assert.match(out.code, /arcade set background image/);
});

test('timed spawns preserve their own positions, artwork and native velocities', async () => {
    const out = arcadeToPseudocode(await projectOf('arcade-assets.hex'));
    const run = await runProgram(out.code, {frames: 78, uploads: out.costumes, storage: true});
    assert.deepEqual(run.errors, []);
    assert.deepEqual(run.creator.warnings, []);
    const state = run.vm.runtime.bwArcadeDeviceState;
    const enemies = Object.values(state.sprites).filter(sprite => sprite.kind === 'Enemy');
    assert.ok(enemies.length >= 2,'interval first fires immediately, then again after2500ms');
    const enemy = enemies.at(-1);
    assert.ok(enemies[0].x < enemy.x,'the earlier instance has continued moving');
    assert.ok(enemy, 'the 2500ms callback creates an independent instance');
    assert.equal(enemy.vx, -40);
    assert.ok(enemy.x >= 150 && enemy.x <= 160, `enemy starts at the right edge: ${enemy.x}`);
    assert.ok(enemy.y >= 0 && enemy.y <= 120);
    assert.equal(enemy.width, 36);
    assert.equal(enemy.height, 16);
    assert.ok(enemy.mask.some(pixel => pixel !== 0));
    assert.ok(state.backgroundImage.pixels.some(pixel => pixel !== 0));
});

test('native position writes and comparisons retain Arcade coordinates', async () => {
    const {sprite,vars}=await nativeCase('b.x=80;b.y=0;if(b.x>100){b.x=0};observed=b.x');
    assert.equal(sprite.x,80);assert.equal(sprite.y,0);assert.equal(vars.observed,80);
});

test('Arcade screen.width and screen.height use the imported stage dimensions', () => {
    const {code, unsupported} = arcadeToPseudocode('let width = screen.width\nlet height = screen.height\n');
    assert.deepEqual(unsupported, []);
    assert.match(code, /set width to 160/);
    assert.match(code, /set height to 120/);
});

test('constant and changing background colors use the Arcade runtime command', () => {
    const {code, unsupported} = arcadeToPseudocode('scene.setBackgroundColor(2)');
    assert.deepEqual(unsupported, []);
    assert.match(code, /arcade set background color to 2/);
    const changed = arcadeToPseudocode('scene.setBackgroundColor(2)\nscene.setBackgroundColor(3)');
    assert.deepEqual(changed.unsupported, []);
    assert.match(changed.code, /arcade set background color to 2\n  arcade set background color to 3/);
});

test('one native update can move multiple sprites and start effects, while unsupported effect operands stay diagnosed', () => {
    const {code,unsupported}=arcadeToPseudocode(`let hero=sprites.create(img\`1\`,SpriteKind.Player)
let coin=sprites.create(img\`2\`,SpriteKind.Food)
game.onUpdate(function(){coin.x=10;hero.x=20;coin.startEffect(effects.confetti);hero.startEffect(effects.fire,100,5)})`);
    assert.match(code,/arcade set x of coin to/);assert.match(code,/arcade set x of hero to/);
    assert.ok(!unsupported.some(u=>/hero\.x|coin\.x/.test(u)));
    assert.match(code,/arcade start effect confetti on coin for \(0\) ms/);
    assert.ok(unsupported.some(u=>/startEffect/.test(u)));
    assert.match(code,/# unsupported:.*startEffect/);
});

test('the former hostile Pong fixture translates logical values without refusals', async () => {
    const files = await projectOf('arcade-shield.hex');
    const out = arcadeToPseudocode(files, {name: 'ping-pong'});
    assert.ok(out.sprites.length >= 3);
    assert.deepEqual(out.unsupported,[]);
    assert.match(out.code,/arcade set local __bwValue/);
});

test('the translation compiles into the sprites and blocks it names', {skip: canCompile ? false :
    'packages/scratch-gui not integrated — run `npm run integrate` first'}, async () => {
    const files = await projectOf('arcade-assets.hex');
    const out = arcadeToPseudocode(files, {name: 'unterwasser'});
    const creator = new SB3Creator();
    const project = creator.parse(out.code);

    assert.deepEqual(project.targets.map(t => t.name),
        ['Stage', ...out.sprites]);

    const ops = new Set();
    for (const target of project.targets) {
        for (const block of Object.values(target.blocks || {})) {
            if (block && block.opcode) ops.add(block.opcode);
        }
    }
    for (const expected of [
        'event_whenflagclicked', 'arcade_registerButtonHandler', 'arcade_registerIntervalHandler',
        'arcade_registerUpdateHandler', 'arcade_registerOverlapHandler', 'arcade_whenRegisteredOverlap', 'arcade_createSprite',
        'arcade_setSpriteProperty', 'arcade_setSpriteAutoDestroy',
        'arcade_setBackgroundImage', 'arcade_frameImage', 'arcade_spriteProperty',
        'arcade_changePlayerScore', 'operator_random'
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

test('a platformer imports all eight editable tile maps and retains terrain diagnostics', async () => {
    const files = await projectOf('arcade-tilemap.hex');
    const out = arcadeToPseudocode(files, {name: 'jumpy platformer'});
    const commands = out.code.split('\n').filter(line => line.trim().startsWith('arcade set tilemap data '));
    assert.equal(commands.length, 8, 'every authored level has actual map data');
    const maps = commands.map(line => JSON.parse(JSON.parse(line.trim().slice('arcade set tilemap data '.length))));
    for (const map of maps) {
        assert.equal(map.tileSize, 16);
        assert.equal(map.rows, 8);
        assert.equal(map.indices.length, map.columns * map.rows);
        assert.equal(map.walls.length, map.columns * map.rows);
        assert.ok(map.images.length > 1, 'the actual tile images are embedded');
    }
    assert.ok(out.unsupported.some(u => /terrain collision physics and scene lifecycle/.test(u)));
    assert.match(out.code,/arcade register tile kind/);
    assert.ok(!out.unsupported.some(u => /synchronous handler mutation ordering/.test(u)));
    assert.ok(!out.unsupported.some(u => /first 4 backdrops/.test(u)), 'native maps are not capped artwork backdrops');
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

test('native controller bindings and sensing use real keyboard input', async () => {
    const imported=arcadeToPseudocode(`let hero=sprites.create(img\`1 1\n1 1\`,SpriteKind.Player)
hero.setPosition(80,60)
controller.moveSprite(hero,100,0)
let seenLeft=false
let seenA=false
game.onUpdate(function(){if(controller.left.isPressed()){seenLeft=true};if(controller.A.isPressed()){seenA=true}})`);
    assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:3,uploads:imported.costumes,storage:true});
    run.vm.postIOData('keyboard',{key:'ArrowLeft',isDown:true});run.vm.postIOData('keyboard',{key:' ',isDown:true});await stepFrames(run.vm,3);
    const vars=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name,v.value]));
    assert.equal(vars.seenLeft,true);assert.equal(vars.seenA,true);
    const sprite=run.vm.runtime.bwArcadeDeviceState.sprites[vars.hero];assert.equal(sprite.vx,-100);assert.ok(sprite.x<80);
    run.vm.postIOData('keyboard',{key:'ArrowLeft',isDown:false});run.vm.postIOData('keyboard',{key:' ',isDown:false});await stepFrames(run.vm,1);assert.equal(sprite.vx,0);
    assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
});

test('sprite dimensions and edges use the decoded image geometry', () => {
    const {code, unsupported} = arcadeToPseudocode(`
        let hero = sprites.create(img\`
            1 1 1 1
            1 1 1 1
        \`, SpriteKind.Player)
        game.onUpdate(function () {
            if (hero.left < 0 || hero.right > 160) { hero.vx = 0 }
            if (hero.top < 0 || hero.bottom > 120) { hero.vy = 0 }
            if (hero.width == 4 && hero.height == 2) { info.changeScoreBy(1) }
        })
    `);

    for(const property of ['left','right','top','bottom','width','height'])
        assert.match(code,new RegExp(`arcade property ${property} of hero`));
    assert.match(code,/arcade set local __bwValue/);
    assert.match(code,/arcade change score player \(1\) by \(1\)/);
    assert.doesNotMatch(code,/\) and \(|\) or \(/,'logical guards must use lazy branches');
    assert.deepEqual(unsupported, []);
});

test('action animations preserve their real objects, frame images and attachments', async () => {
    const files = await projectOf('arcade-tilemap.hex');
    const out = arcadeToPseudocode(files, {name: 'jumpy platformer'});
    assert.equal((out.code.match(/arcade create animation action/g) || []).length, 11);
    assert.equal((out.code.match(/arcade add animation frame/g) || []).length, 29);
    assert.equal((out.code.match(/arcade attach animation/g) || []).length, 11);
    assert.match(out.code, /arcade attach animation \(coinAnimation\) to sprite \(coin\)/, 'instances created inside functions receive the shared animation');
    const imageResources = out.costumes.filter(c => /^__arcadeBackground/.test(c.sprite));
    assert.ok(imageResources.length >= 29, 'every animation image remains editable artwork');
    assert.ok(imageResources.every(c => c.svg.includes('data-bw-pixel-scale')));
});

test('supported animation calls execute while remaining platformer gaps stay visible', async () => {
    const files = await projectOf('arcade-tilemap.hex');
    const out = arcadeToPseudocode(files, {name: 'jumpy platformer'});
    assert.equal(out.unsupported.filter(u => /setAction|addAnimationFrame|attachAnimation|no named animation|attached to no sprite/.test(u)).length, 0);
    assert.equal((out.code.match(/arcade set animation action/g) || []).length, 11);
    assert.ok(!out.unsupported.some(u => /isHittingTile/.test(u)));
    assert.match(out.code, /arcade sprite \(hero\) hitting wall \(3\)/);
    // Named melodies now play natively (makecode-arcade-music.test.mjs).
    assert.ok(!out.unsupported.some(u => /music\.powerUp\.play/.test(u)));
    assert.match(out.code, /arcade play melody \(arcade melody powerUp\) mode play/);
    assert.ok(!out.unsupported.some(u => /scene\.cameraFollowSprite/.test(u)));
    assert.match(out.code,/arcade camera follow sprite \(player2\)/);
});

test('animation objects retain every frame without a fixed costume cap', () => {
    const many = sprite => Array.from({length: 40}, (_, i) => [
        `let ${sprite}Walk${i} = animation.createAnimation(ActionKind.Walking, 100)`,
        `animation.attachAnimation(${sprite}, ${sprite}Walk${i})`,
        `${sprite}Walk${i}.addAnimationFrame(img\`1\`)`
    ].join('\n')).join('\n');
    const out = arcadeToPseudocode(`
        enum ActionKind { Walking }
        let hero = sprites.create(img\`1\`, SpriteKind.Player)
        let rival = sprites.create(img\`1\`, SpriteKind.Enemy)
        ${many('hero')}
        ${many('rival')}
    `);
    assert.equal((out.code.match(/arcade create animation action/g) || []).length, 80);
    assert.equal((out.code.match(/arcade add animation frame/g) || []).length, 80);
    assert.equal((out.code.match(/arcade attach animation/g) || []).length, 80);
    assert.equal(out.costumes.length, 82, 'two actual sprite images plus all eighty animation images');
    assert.deepEqual(out.unsupported, []);
});

test('the per-player info API writes the same score the plain one does', () => {
    // MakeCode's plain `info.setScore()` IS player one, so player one must
    // share that score — a game that mixes both forms (the pong does) would
    // otherwise keep two scores that drift apart. Scores are the Arcade
    // extension's own (player one is its plain score); lives use native player state.
    const {code, unsupported} = arcadeToPseudocode(`
        let hero = sprites.create(img\`1\`, SpriteKind.Player)
        info.setScore(0)
        info.player1.changeScoreBy(1)
        info.player2.setScore(5)
        game.onUpdate(function () {
            if (info.player2.hasLife()) { info.player2.changeLifeBy(-1) }
            if (info.player1.hasLife()) { info.changeScoreBy(1) }
        })
    `);
    assert.deepEqual(unsupported, []);
    assert.match(code, /arcade set score player \(1\) to \(0\)/);
    assert.match(code, /arcade change score player \(1\) by \(1\)/, 'player one, which the extension shares with the plain score');
    assert.match(code, /arcade set score player \(2\) to \(5\)/);
    assert.match(code, /arcade change score player \(1\) by \(1\)/);
    assert.match(code, /arcade player \(2\) has life/);
    assert.match(code, /arcade player \(1\) has life/);
});

// Native life-zero registration preserves the original assigned-zero behavior;
// runtime and original PXT revival checks live in the focused registration tests.
test('onLifeZero retains a player registration without a positive-life polling prerequisite', () => {
    const {code,unsupported} = arcadeToPseudocode(`
        let hero = sprites.create(img\`1\`, SpriteKind.Player)
        info.player2.onLifeZero(function () { game.over() })
    `);
    assert.deepEqual(unsupported, []);
    assert.match(code, /arcade register life zero player \(2\)/);
    assert.doesNotMatch(code, /wait until lives/);
    assert.match(code, /stop all/);
});

test('native sprite geometry uses decoded width and half-width edges', async () => {
    const {sprite,vars}=await nativeCase('b.x=80;observed=b.width;b.x=b.left');
    assert.equal(vars.observed,2);assert.equal(sprite.x,79);
});

test('a Sprite alias initialized with null reads the selected Sprite width', async () => {
    const imported = arcadeToPseudocode(`
        let ball = sprites.create(img\`1\`, SpriteKind.Player)
        let paddle = sprites.create(img\`2\`, SpriteKind.Food)
        let hit: Sprite = null
        game.onUpdate(function () {
            hit = paddle
            ball.vx = hit.width
        })
    `);
    assert.deepEqual(imported.unsupported, []);
    const run=await runProgram(imported.code,{frames:40,uploads:imported.costumes,storage:true});
    const vars=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name,v.value]));
    assert.equal(vars.hit,vars.paddle);
    assert.equal(run.vm.runtime.bwArcadeDeviceState.sprites[vars.ball].vx,1);
    assert.ok(!Object.hasOwn(vars,'width'));
    assert.deepEqual(run.errors,[]);
});

test('one native callback moves a neighbour and changes another sprite velocity', async () => {
    const imported=arcadeToPseudocode(`let ball=sprites.create(img\`1\`,SpriteKind.Player)
let paddle=sprites.create(img\`2\`,SpriteKind.Food)
game.onUpdate(function(){paddle.x=10;ball.vy=-50})`);
    assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:2,uploads:imported.costumes,storage:true});
    const sprites=Object.values(run.vm.runtime.bwArcadeDeviceState.sprites);
    assert.equal(sprites.find(s=>s.kind==='Food').x,10);assert.equal(sprites.find(s=>s.kind==='Player').vy,-50);
    assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
});

test('native velocity compound assignments preserve addition, subtraction and multiplication', async () => {
    const {sprite}=await nativeCase('b.vx=8;b.vy=8;b.vx+=3;b.vx-=2;b.vy*=-1');
    assert.equal(sprite.vx,9);assert.equal(sprite.vy,-8);
});

test('native trigonometry preserves radians and unary-minus precedence', async () => {
    const {sprite}=await nativeCase('b.vx=5 * -Math.cos(Math.PI)');assert.equal(sprite.vx,5);
});

test('native position compounds preserve both Arcade axes and their operators', async () => {
    const {sprite}=await nativeCase('b.x=40;b.y=40;b.x+=5;b.x-=5;b.y+=5;b.y-=5');
    assert.equal(sprite.x,40);assert.equal(sprite.y,40);
});

test('scaling native position uses the Arcade coordinate', async () => {
    const {sprite}=await nativeCase('b.x=40;b.x*=2');assert.equal(sprite.x,80);
});

test('every compound operator executes on scalar, position and velocity targets', async () => {
    for(const target of ['v','b.x','b.y','b.vx','b.vy'])for(const [op,expected] of [['+=',12],['-=',4],['*=',32],['/=',2]]){
        const {vars}=await nativeCase(`${target}=8;${target}${op}4;observed=${target}`);
        assert.equal(Number(vars.observed),expected,`${target} ${op}4`);
    }
});
