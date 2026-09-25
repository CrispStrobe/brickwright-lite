/**
 * The pixel editor's data layer (lib/bw-makecode/pixel-image.js): Arcade art
 * travels as palette pixels, is stored as our rect-SVG costumes, and must come
 * back out EXACTLY — the editor opens a costume, and the export turns costumes
 * into MakeCode `img` literals, so a lossy read would corrupt both.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
    ARCADE_PALETTE, svgToPixels, pixelsToSvg, quantizeRgba, toImgLiteral, floodFill, resizeCanvas, nearestIndex
} from '../overlay/scratch-gui/src/lib/bw-makecode/pixel-image.js';
import {parseImageLiteral} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';
import {importArtefact} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const same = (a, b) => a.width === b.width && a.height === b.height && a.pixels.every((v, i) => v === b.pixels[i]);

const SPRITE = parseImageLiteral(`
    . . 5 5 5 5 . .
    . 5 5 f f 5 5 .
    5 5 f 2 2 f 5 5
    5 f 2 2 2 2 f 5
    . 7 7 . . 7 7 .
`);

test('an image survives costume and back exactly (SVG and img literal)', () => {
    assert.ok(SPRITE && SPRITE.width === 8 && SPRITE.height === 5);
    const back = svgToPixels(pixelsToSvg(SPRITE));
    assert.ok(back, 'our own SVG was not recognised');
    assert.ok(same(back, SPRITE), 'the pixels changed on the way through the costume');
    assert.equal(back.scale, 4);
    assert.ok(same(parseImageLiteral(toImgLiteral(SPRITE).replace(/^img`|`$/g, '')), SPRITE));
});

test('every costume a real Arcade import makes reads back as palette pixels', async () => {
    const fixtures = ['arcade-assets.hex', 'arcade-tilemap.hex', 'arcade-umlaut.hex', 'arcade-shield.hex'];
    let checked = 0;
    for (const f of fixtures) {
        const r = await importArtefact(new Uint8Array(fs.readFileSync(path.join(ROOT, 'test/fixtures/makecode', f))), {name: f});
        for (const c of r.costumes || []) {
            const px = svgToPixels(c.svg);
            assert.ok(px, `${f}: costume ${c.name} is not readable as pixels`);
            // ...and writing it again gives the same SVG, byte for byte.
            assert.equal(pixelsToSvg(px, {scale: px.scale}), c.svg, `${f}: ${c.name} does not re-emit identically`);
            checked++;
        }
    }
    assert.ok(checked >= 5, `only ${checked} costumes checked`);
});

test('someone else\'s SVG is not mistaken for pixel art', () => {
    assert.equal(svgToPixels('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><path d="M0 0L10 10"/></svg>'), null);
    assert.equal(svgToPixels('<svg width="8" height="8"><rect x="0" y="0" width="4" height="4" fill="#123456"/></svg>'), null,
        'a colour outside the palette');
    assert.equal(svgToPixels('<svg width="8" height="8"><rect x="0.5" y="0" width="4" height="4" fill="#ffffff"/></svg>'), null,
        'off the integer grid');
});

test('quantizing: palette colours stay exact, transparency stays transparent, others go to the nearest', () => {
    // 2 x 1 source: palette red, then half-transparent white.
    const rgba = new Uint8Array([0xff, 0x21, 0x21, 255, 255, 255, 255, 60]);
    const q = quantizeRgba(rgba, 2, 1, 2, 1);
    assert.deepEqual([...q.pixels], [2, 0]);
    assert.equal(nearestIndex([250, 250, 250]), 1, 'near-white is white');
    assert.equal(nearestIndex([5, 5, 5]), 15, 'near-black is black');
    // A 4 x 4 block of one palette colour down-sampled to 2 x 2 keeps it.
    const block = new Uint8Array(4 * 4 * 4);
    for (let i = 0; i < 16; i++) block.set([0x24, 0x9c, 0xa3, 255], i * 4);
    assert.deepEqual([...quantizeRgba(block, 4, 4, 2, 2).pixels], [6, 6, 6, 6]);
    assert.equal(ARCADE_PALETTE[6], '#249ca3');
});

test('editing primitives: flood fill stays inside its region; resizing crops and pads', () => {
    const filled = floodFill(SPRITE, 0, 0, 9);
    assert.equal(filled.pixels[0], 9);
    assert.equal(filled.pixels[1], 9);
    assert.equal(filled.pixels[2], 5, 'the fill crossed a colour boundary');
    assert.equal(SPRITE.pixels[0], 0, 'the original was modified');
    const big = resizeCanvas(SPRITE, 10, 6);
    assert.equal(big.width, 10);
    assert.equal(big.pixels[(2 * 10) + 3], SPRITE.pixels[(2 * 8) + 3]);
    assert.equal(big.pixels[(5 * 10) + 9], 0);
    const small = resizeCanvas(SPRITE, 4, 2);
    assert.equal(small.pixels.length, 8);
});
