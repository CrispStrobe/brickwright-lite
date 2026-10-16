import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {svgToPixels} from '../overlay/scratch-gui/src/lib/bw-makecode/pixel-image.js';

// This class is deliberately outside ordinary class admission. Its diagnostic
// must survive while neighboring Image values retain their actual operations.
const neighbor = 'class Unsupported { static read(): number { return 7; } }\n';
const literal = 'img`1 .\n. 2`';
const source = `${neighbor}
namespace art { export const first = ${literal}; export const second = ${literal}; }
let alias = art.first;
alias.setPixel(0, 0, 7);
let after = art.first.getPixel(0, 0);
function retained() { console.log("keep unused helper"); }
`;
const copies = code => [...code.matchAll(/arcade copy image \(arcade frame image array "([^"]+)" index \(0\) template "([^"]+)" start 0 count 1\)/g)];

test('generic fallback retains exact distinct image resources beside unsupported class and unused helper', () => {
    const result = arcadeToPseudocode(source);
    assert.ok(result.unsupported.some(message => /class Unsupported|Class Unsupported/.test(message)), result.unsupported.join('\n'));
    assert.ok(!result.unsupported.some(message => /image or asset literal not translated here/.test(message)));
    assert.doesNotMatch(result.code, /"\(image\)"/);
    assert.match(result.code, /DEFINE retained/);
    assert.match(result.code, /keep unused helper/);
    const values = copies(result.code);
    assert.equal(values.length, 2);
    assert.notEqual(values[0][1], values[1][1], 'separate literal declarations keep separate resource identities');
    assert.notEqual(values[0][2], values[1][2]);
    for (const value of values) {
        const costumes = result.costumes.filter(costume => costume.sprite === value[2]);
        assert.equal(costumes.length, 1);
        const image = svgToPixels(costumes[0].svg);
        assert.equal(image.width, 2); assert.equal(image.height, 2);
        assert.deepEqual(Array.from(image.pixels), [1, 0, 0, 2]);
        assert.ok(result.sprites.includes(value[2]));
        const declaration = result.code.indexOf(`SPRITE ${value[2]}:`);
        assert.ok(declaration >= 0);
        assert.match(result.code.slice(declaration).split('\n\n')[0], /\n  hide(?:\n|$)/);
        assert.doesNotMatch(result.code.slice(declaration).split('\n\n')[0], /\n  show(?:\n|$)/);
    }
});

test('namespace aliases read the original allocation and mutation remains ordered', () => {
    const result = arcadeToPseudocode(source);
    const alias = /set alias to \(([^\n]+)\)/.exec(result.code);
    assert.ok(alias);
    assert.doesNotMatch(alias[1], /arcade copy image|arcade frame image/);
    assert.match(alias[1], /__bwNamespace_art_first/);
    const write = result.code.indexOf('arcade set image pixel (alias) x 0 y 0 color 7');
    assert.ok(write > result.code.indexOf(alias[0]), result.code);
    assert.match(result.code.slice(write), /arcade image pixel \(__bwNamespace_art_first\) x 0 y 0/);
    assert.equal(copies(result.code).length, 2, 'alias reads must not create a third allocation');
});

test('a repeated function literal remains an allocating expression at its evaluation site', () => {
    const result = arcadeToPseudocode(`${neighbor}function fresh(): Image { return ${literal}; }\nlet first = fresh();\nlet second = fresh();`);
    assert.equal(copies(result.code).length, 1, 'one source literal is one template, not one retained runtime Image');
    assert.match(result.code, /DEFINE fresh/);
    assert.match(result.code, /arcade return value \(arcade copy image/);
    assert.equal((result.code.match(/arcade call function "fresh"/g) || []).length, 2);
});

test('shadowed img tags cannot acquire resource ownership on the fallback route', () => {
    for (const binding of ['let img: any;\n', 'function unrelated(img: any) { console.log(img); }\n',
        'img = replacement;\n', 'class img {}\n', 'enum img { one }\n',
        'namespace img { export const member = 1; }\n',
        'globalThis.img = replacement;\n', 'globalThis["img"] = replacement;\n',
        'for (let img of [1]) { console.log(img); }\n']) {
        const result = arcadeToPseudocode(neighbor + binding + `let picture = ${literal};`);
        assert.ok(result.unsupported.some(message => /unshadowed img binding/.test(message)));
        assert.equal(copies(result.code).length, 0);
        assert.equal(result.costumes.length, 0);
    }
});

test('unreadable literal pixels retain the actual unsupported boundary and allocate no template', () => {
    const result = arcadeToPseudocode(neighbor + 'let picture = img`z`;');
    assert.ok(result.unsupported.some(message => /image or asset literal not translated here/.test(message)));
    assert.equal(copies(result.code).length, 0);
    assert.equal(result.costumes.length, 0);
});


test('resource names cannot merge with actual source sprite declarations', () => {
    const result = arcadeToPseudocode(`${neighbor}let __arcadeBackground1 = sprites.create(img` + '`2`' + `, SpriteKind.Player);
let picture = ${literal};`);
    const values = copies(result.code);
    assert.equal(values.length, 1);
    const name = values[0][2];
    assert.notEqual(name, '__arcadeBackground1');
    const spriteNames = [...result.code.matchAll(/^SPRITE ([^:]+):/gm)].map(match => match[1]);
    assert.equal(new Set(spriteNames).size, spriteNames.length, 'actual actors and resources have unique sections');
    assert.equal(result.costumes.filter(costume => costume.sprite === name).length, 1);
    const actorArt = result.costumes.filter(costume => costume.sprite !== name);
    assert.equal(actorArt.length, 1);
    assert.deepEqual(Array.from(svgToPixels(actorArt[0].svg).pixels), [2]);
    const actorSection = result.code.slice(result.code.indexOf(`SPRITE ${actorArt[0].sprite}:`)).split('\n\n')[0];
    assert.match(actorSection, /\n  show(?:\n|$)/, 'resource hiding must not hide the actual actor');
    assert.deepEqual(Array.from(svgToPixels(result.costumes.find(costume => costume.sprite === name).svg).pixels), [1, 0, 0, 2]);
});

test('a non-emitted class literal cannot leave orphan artwork that current export turns into an actor', () => {
    const result = arcadeToPseudocode('class Unemitted { static picture(): Image { return ' + literal + '; } }');
    assert.ok(result.unsupported.some(message => /class Unemitted|Class Unemitted/.test(message)));
    assert.equal(copies(result.code).length, 0);
    assert.equal(result.costumes.length, 0);
    // Synthetic current-resource inventory boundary, not a Creator/VM result.
    // An unused imported artwork target is an actor to current export. There
    // must be no such target for a class body the source converter did not emit.
    const assets = new Map();
    const targets = [{isStage:true, name:'Stage', blocks:{}, variables:{}, lists:{}, broadcasts:{}, costumes:[], sounds:[]}];
    for (const [index, costume] of result.costumes.entries()) {
        const assetId = 'resource' + index;
        assets.set(assetId, costume.svg);
        targets.push({isStage:false, name:costume.sprite, visible:false, x:0, y:0, size:100, direction:90,
            blocks:{}, variables:{}, lists:{}, broadcasts:{}, sounds:[],
            costumes:[{name:costume.name, assetId, md5ext:assetId+'.svg', dataFormat:'svg', rotationCenterX:3, rotationCenterY:3}]});
    }
    const exported = projectToArcade({targets}, {costumeSvg:(_target, costume) => assets.get(costume.assetId)});
    assert.deepEqual(exported.unsupported, []);
    assert.doesNotMatch(exported.ts, /sprites\.create/);
});


test('ambient escapes and dynamic code remain outside generic literal ownership', () => {
    for (const configured of [
        'Reflect.set(globalThis, "img", replacement);',
        'Object.defineProperty(globalThis, "img", descriptor);',
        'let g = globalThis; g.img = replacement;',
        'let g = window; g["img"] = replacement;',
        'let g = self; g.img = replacement;',
        'function unused() { let g = globalThis; g.img = replacement; }',
        'eval("img = replacement");',
        'let build = Function; build("img = replacement")();',
        'let build = (() => 0).constructor; build("img = replacement")();',
        'let escapedTag = img; change(escapedTag);'
    ]) {
        const result = arcadeToPseudocode(neighbor + configured + `\nlet picture = ${literal};`);
        assert.ok(result.unsupported.some(message => /ambient handles, tag escapes, dynamic code/.test(message)), configured);
        assert.ok(result.unsupported.some(message => /class Unsupported|Class Unsupported/.test(message)), 'neighbor diagnostics remain');
        assert.equal(copies(result.code).length, 0, configured);
        assert.equal(result.costumes.length, 0, configured);
    }
});


test('unresolved computed access and unknown this ownership cannot borrow literal authority', () => {
    for (const configured of [
        'let f: any = () => 0; let build = f["con" + "structor"]; build("img = replacement")();',
        'let f: any = () => 0; let key = "constructor"; let build = f[key]; build("img = replacement")();',
        'let host = this; host.img = replacement;',
        'this.img = replacement;',
        'let values: any[]; let item = values[0];',
        'let values = [1]; let index; let item = values[index]; index = 0;',
        'let values = [1]; inspect(values); let item = values[0];'
    ]) {
        const result = arcadeToPseudocode(neighbor + configured + `\nlet picture = ${literal};`);
        assert.ok(result.unsupported.some(message => /unshadowed img binding/.test(message)), configured);
        assert.equal(copies(result.code).length, 0, configured);
        assert.equal(result.costumes.length, 0, configured);
    }
});

test('an initialized actual Array and actual Number index remain in the bounded source domain', () => {
    const result = arcadeToPseudocode(neighbor + `let values = [1, 2]; let index = 0; let value = values[index]; let picture = ${literal};`);
    assert.ok(!result.unsupported.some(message => /unshadowed img binding|configured Array index proof/.test(message)), result.unsupported.join('\n'));
    assert.equal(copies(result.code).length, 1);
    assert.deepEqual(Array.from(svgToPixels(result.costumes[0].svg).pixels), [1, 0, 0, 2]);
});
