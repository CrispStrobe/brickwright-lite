import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
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
    for (const binding of ['let img: any;\n', 'function unrelated(img: any) { console.log(img); }\n']) {
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
