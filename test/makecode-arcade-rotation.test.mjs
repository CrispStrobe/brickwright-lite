// Sprite rotation (task F4 of docs/OPEN-TASKS-2026-09-29.md): PXT's
// Sprite.rotation / rotationDegrees, the rotated bounding box that becomes the
// sprite's width and height, its whole-box hitbox, the rotated pixel overlap
// tests and the rotated raster, each against the pinned Arcade simulator.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

const Arcade = loadExtensionClass('arcade');
const prop = (a, id, p) => a.spriteProperty({ID: id, PROPERTY: p});
// An asymmetric picture, so a flip or a transposition cannot pass for a rotation.
const ART = ['2222222.', '2......3', '2......3', '44444444', '..5..5..'];
// A hollow bar: inside its rotated rectangle there are empty pixels, so the
// pixel test decides cases that the rotated-box test lets through.
const BAR = ['22222222222', '2.........2', '22222222222'];
const ANGLES = [0, 0.3, Math.PI / 4, 1.2, Math.PI / 2, 2.5, Math.PI, 3.9, -0.7, 7];

function artSprite (a, rows = ART, x = 60, y = 50) {
    const image = a.createImage({WIDTH: rows[0].length, HEIGHT: rows.length});
    rows.forEach((row, py) => [...row].forEach((c, px) => {
        if (c !== '.') a.setImagePixel({IMAGE: image, X: px, Y: py, COLOR: Number.parseInt(c, 16)});
    }));
    const id = a.createImageSprite({IMAGE: image, KIND: 'Player'});
    a.setSpritePosition({ID: id, X: x, Y: y});
    return id;
}
const pxtImage = rows => `img\`\n${rows.map(r => r.split('').join(' ')).join('\n')}\n\``;
// One number per raster: a position-weighted sum, so a pixel in the wrong place changes it.
const HASH = 'let h=0;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)h+=(x*31+y*17+1)*c.getPixel(x,y);';

test('rotation, rotationDegrees and data are sprite properties of the extension', () => {
    const a = new Arcade(new EventEmitter());
    for (const p of ['rotation', 'rotationDegrees', 'data']) assert.ok(a.getInfo().menus.spriteProperties.items.includes(p), p);
    const id = artSprite(a);
    assert.equal(prop(a, id, 'rotation'), 0);
    a.setSpriteProperty({ID: id, PROPERTY: 'rotationDegrees', VALUE: 90});
    assert.ok(Math.abs(prop(a, id, 'rotation') - Math.PI / 2) < 1e-12);
    a.setSpriteProperty({ID: id, PROPERTY: 'data', VALUE: 'gold'});
    assert.equal(prop(a, id, 'data'), 'gold', 'data keeps any value, not only numbers');
});

test('the pinned original: rotated size, center, raster and pixel overlaps', async () => {
    const lines = [`let s=sprites.create(${pxtImage(ART)},SpriteKind.Player);s.setPosition(60,50);`];
    ANGLES.forEach((angle, i) => {
        lines.push(`s.rotation=${angle};let w${i}=s.width;let h${i}=s.height;let x${i}=s.x;let y${i}=s.y;let r${i}=s.rotation;let d${i}=s.rotationDegrees;`,
            `{let c=image.create(s.width,s.height);helpers.imageDrawScaledRotated(c,0,0,s.image,s.sx,s.sy,s.rotation);${HASH}let raster${i}=h;}`);
    });
    // Scaled and rotated together, both orders of setting them.
    lines.push('s.rotation=0.6;s.sx=2;s.sy=1.5;let sw=s.width;let sh=s.height;',
        '{let c=image.create(s.width,s.height);helpers.imageDrawScaledRotated(c,0,0,s.image,s.sx,s.sy,s.rotation);' + HASH + 'let scaledRaster=h;}');
    // Overlaps: a rotated bar against a plain one, and two rotated bars, at offsets.
    // \`plain\` never has its rotation set: assigning even 0 gives a sprite a
    // rotated box in PXT, which would leave the one-rotated path untested.
    lines.push(`let p=sprites.create(${pxtImage(BAR)},SpriteKind.Player);`,
        `let q=sprites.create(${pxtImage(['333', '333', '333'])},SpriteKind.Food);`,
        `let plain=sprites.create(${pxtImage(['333', '333', '333'])},SpriteKind.Food);plain.setPosition(10,10);`,
        `let dot=sprites.create(${pxtImage(['3'])},SpriteKind.Food);dot.setPosition(10,10);`);
    const OVERLAPS = [];
    [0, 0.4, Math.PI / 4, 1.3, 2.2].forEach((ra, i) => [[0, 0], [5, 3], [6, -4], [3, 5], [-7, 0], [5, -5], [-5, 5], [6, 6], [-6, -6], [7, -3], [-3, 7]].forEach(([dx, dy], j) => {
        [false, true].forEach(both => {
            const name = `o${i}_${j}_${both ? 'b' : 'p'}`;
            OVERLAPS.push({name, ra, dx, dy, both});
            const other = both ? 'q' : 'plain';
            lines.push(`p.setPosition(80,60);p.rotation=${ra};${other}.setPosition(${80 + dx},${60 + dy});${both ? 'q.rotation=0.9;' : ''}` +
                `let ${name}=p.overlapsWith(${other});let ${name}r=${other}.overlapsWith(p);`, `${other}.setPosition(10,10);`);
        });
    }));
    [0.4, Math.PI / 4, 2.2].forEach((ra, i) => [[0, 0], [1, 0], [0, 1], [2, -1], [-3, 1], [4, 0]].forEach(([dx, dy], j) => {
        const name = `dot${i}_${j}`;
        OVERLAPS.push({name, ra, dx, dy, dot: true});
        lines.push(`p.setPosition(80,60);p.rotation=${ra};dot.setPosition(${80 + dx},${60 + dy});` +
            `let ${name}=p.overlapsWith(dot);let ${name}r=dot.overlapsWith(p);dot.setPosition(10,10);`);
    }));
    const original = await runPxtArcade(lines.join('\n'));

    const a = new Arcade(new EventEmitter());
    const id = artSprite(a);
    ANGLES.forEach((angle, i) => {
        a.setSpriteProperty({ID: id, PROPERTY: 'rotation', VALUE: angle});
        for (const [key, name] of [['width', 'w'], ['height', 'h'], ['x', 'x'], ['y', 'y'], ['rotation', 'r'], ['rotationDegrees', 'd']]) {
            assert.equal(prop(a, id, key), original[name + i], `${key} at ${angle}`);
        }
        const sprite = a._sprite(id);
        const raster = a._scaledSpriteImage(sprite, {x: 0, y: 0, width: sprite.width | 0, height: sprite.height | 0});
        let hash = 0;
        for (let y = 0; y < raster.height; y++) for (let x = 0; x < raster.width; x++) hash += (x * 31 + y * 17 + 1) * raster.pixels[y * raster.width + x];
        assert.equal(hash, original['raster' + i], `raster at ${angle}`);
    });
    a.setSpriteProperty({ID: id, PROPERTY: 'rotation', VALUE: 0.6});
    a.setSpriteProperty({ID: id, PROPERTY: 'sx', VALUE: 2});
    a.setSpriteProperty({ID: id, PROPERTY: 'sy', VALUE: 1.5});
    assert.equal(prop(a, id, 'width'), original.sw);
    assert.equal(prop(a, id, 'height'), original.sh);
    const scaled = a._sprite(id);
    const sr = a._scaledSpriteImage(scaled, {x: 0, y: 0, width: scaled.width | 0, height: scaled.height | 0});
    let sh = 0;
    for (let y = 0; y < sr.height; y++) for (let x = 0; x < sr.width; x++) sh += (x * 31 + y * 17 + 1) * sr.pixels[y * sr.width + x];
    assert.equal(sh, original.scaledRaster, 'scaled and rotated raster');

    const p = artSprite(a, BAR);
    const q = artSprite(a, ['333', '333', '333']);
    const plain = artSprite(a, ['333', '333', '333'], 10, 10);
    const dot = artSprite(a, ['3'], 10, 10);
    let positives = 0;
    for (const {name, ra, dx, dy, both, dot: isDot} of OVERLAPS) {
        a.setSpritePosition({ID: p, X: 80, Y: 60});
        a.setSpriteProperty({ID: p, PROPERTY: 'rotation', VALUE: ra});
        const other = isDot ? dot : both ? q : plain;
        a.setSpritePosition({ID: other, X: 80 + dx, Y: 60 + dy});
        if (both) a.setSpriteProperty({ID: q, PROPERTY: 'rotation', VALUE: 0.9});
        assert.equal(a.spriteOverlaps({A: p, B: other}), original[name], name);
        assert.equal(a.spriteOverlaps({A: other, B: p}), original[name + 'r'], name + ' reversed');
        a.setSpritePosition({ID: other, X: 10, Y: 10});
        assert.equal(prop(a, plain, 'rotation'), 0);
        if (original[name]) positives++;
    }
    assert.ok(positives > 5 && positives < OVERLAPS.length - 5, `the cases mix hits and misses (${positives}/${OVERLAPS.length})`);
});

test('MakeCode rotation and data import, run like the original, and export back', async () => {
    const {arcadeToPseudocode} = await import('../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js');
    const {projectToArcade} = await import('../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js');
    const {runProgram, SB3Creator} = await import('./helpers/bw-vm.mjs');
    const source = [
        'let hero = sprites.create(img`',
        '    2 2 2 2 2 2 2 2 2 2',
        '    2 2 2 2 2 2 2 2 2 2',
        '`, SpriteKind.Player)',
        'hero.setPosition(70, 40)',
        'hero.rotationDegrees = 30',
        'let w = hero.width',
        'let h = hero.height',
        'hero.rotation += 0.5',
        'let w2 = hero.width',
        'let deg = Math.round(hero.rotationDegrees)',
        'hero.data = 7',
        'let d = hero.data'
    ].join('\n');
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    const original = await runPxtArcade(source);
    const run = await runProgram(imported.code, {frames: 4, uploads: imported.costumes, storage: true});
    assert.deepEqual(run.errors, []);
    const value = name => Number(run.vm.runtime.targets.flatMap(t => Object.values(t.variables || {})).find(v => v.name === name)?.value);
    for (const name of ['w', 'h', 'w2', 'deg', 'd']) assert.equal(value(name), original[name], name);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    for (const c of imported.costumes) (c.mode === 'add' ? creator.addCustomSVGCostume(c.sprite, c.svg, c.name) : creator.applyCustomSVG(c.sprite, c.svg));
    const {ts, unsupported} = projectToArcade(creator.project, {costumeSvg: (t, c) => {
        const asset = creator.assets.get(c.assetId);
        return asset?.type === 'svg' ? asset.data : null;
    }});
    assert.deepEqual(unsupported, []);
    assert.match(ts, /hero\.rotationDegrees = 30/);
    assert.match(ts, /hero\.rotation = /);
    assert.match(ts, /hero\.data = 7/);
    const exportedOriginal = await runPxtArcade(ts);
    for (const name of ['w', 'h', 'w2', 'deg', 'd']) assert.equal(exportedOriginal[name], original[name], `exported ${name}`);
    const reimported = arcadeToPseudocode(ts);
    assert.deepEqual(reimported.unsupported, []);
    const rerun = await runProgram(reimported.code, {frames: 4, uploads: reimported.costumes, storage: true});
    const rerunValues = Object.fromEntries(rerun.vm.runtime.targets.flatMap(t => Object.values(t.variables || {})).map(v => [v.name, v.value]));
    for (const name of ['w', 'h', 'w2', 'deg', 'd']) assert.equal(Number(rerunValues[name]), original[name], `reimported ${name}`);
    const {stepFrames} = await import('./helpers/bw-vm.mjs');
    await run.vm.loadProject(Buffer.from(await (await run.vm.saveProjectSb3()).arrayBuffer()));
    run.vm.greenFlag();await stepFrames(run.vm,4);
    for (const name of ['w', 'h', 'w2', 'deg', 'd']) assert.equal(value(name), original[name], `SB3 ${name}`);

});


test('Sprite.data lazy defaults and reference aliases match original PXT across export and SB3', async () => {
    const {arcadeToPseudocode} = await import('../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js');
    const {projectToArcade} = await import('../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js');
    const {runProgram, stepFrames} = await import('./helpers/bw-vm.mjs');
    const source = `let hero=sprites.create(image.create(2,2),SpriteKind.Player)
let first=hero.data
let lazySame=first===hero.data
hero.data=0
let zeroReplaced=hero.data!==0
let zeroFresh=first!==hero.data
let second=hero.data
hero.data=false
let falseReplaced=hero.data!==false
let falseFresh=second!==hero.data
hero.data=""
let emptyReplaced=hero.data!==""
hero.data=undefined
let undefinedReplaced=hero.data!==undefined
let arrayHero=sprites.create(image.create(2,2),SpriteKind.Player)
let numbers=[2,3]
arrayHero.data=numbers
let arrayAlias:number[]=arrayHero.data
let arraySame=arrayAlias===numbers
arrayAlias.push(7)
let arrayChanged=numbers.length
let imageHero=sprites.create(image.create(2,2),SpriteKind.Player)
let picture=image.create(2,1)
picture.fill(5)
let heroAlias=imageHero
heroAlias.data=picture
let imageAlias:Image=imageHero.data
let imageSame=imageAlias===picture
imageAlias.setPixel(0,0,9)
let imageChanged=picture.getPixel(0,0)
let spriteHero=sprites.create(image.create(2,2),SpriteKind.Player)
spriteHero.data=imageHero
let spriteAlias:Sprite=spriteHero.data
let spriteSame=spriteAlias===imageHero
spriteAlias.vx=37
let spriteChanged=imageHero.vx`;
    const names=['lazySame','zeroReplaced','zeroFresh','falseReplaced','falseFresh','emptyReplaced','undefinedReplaced','arraySame','arrayChanged','imageSame','imageChanged','spriteSame','spriteChanged'];
    const expected = await runPxtArcade(source);
    const values = run => Object.fromEntries(run.vm.runtime.targets.flatMap(t => Object.values(t.variables || {})).map(v => [v.name, v.value]));
    const check = run => {
        assert.deepEqual(run.errors, []);
        const actual=values(run);
        for (const name of names) assert.equal(actual[name],expected[name],name);
        assert.equal(actual.arrayAlias,actual.numbers);
        assert.equal(actual.imageAlias,actual.picture);
        assert.equal(actual.spriteAlias,actual.imageHero);
    };
    const execute = async imported => {
        assert.deepEqual(imported.unsupported, []);
        const run = await runProgram(imported.code,{frames:20,uploads:imported.costumes,storage:true});
        check(run);return run;
    };
    const imported=arcadeToPseudocode(source), run=await execute(imported);
    await execute({...imported,code:run.creator.decompile()});
    const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});
    assert.deepEqual(exported.unsupported,[]);
    assert.match(exported.ts,/arrayAlias\s*:\s*number\[\]/,'array data remains statically typed for PXT array shims');
    assert.match(exported.ts,/imageAlias\s*:\s*Image/);
    assert.match(exported.ts,/spriteAlias\s*:\s*Sprite/);
    const exportedOriginal=await runPxtArcade(exported.ts);
    for(const name of names)assert.equal(exportedOriginal[name],expected[name],`exported ${name}`);
    await execute(arcadeToPseudocode(exported.ts));
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));
    run.vm.greenFlag();await stepFrames(run.vm,20);check(run);
});

test('Sprite.data arbitrary object members remain explicit unsupported diagnostics', async () => {
    const {arcadeToPseudocode} = await import('../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js');
    const imported=arcadeToPseudocode('let hero=sprites.create(image.create(2,2),SpriteKind.Player)\nhero.data.points=7\nlet points=hero.data.points');
    assert.ok(imported.unsupported.length, 'object member access must not be silently translated');
});
