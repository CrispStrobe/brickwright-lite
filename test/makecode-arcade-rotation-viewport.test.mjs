import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {RotatedBoundingBox, rasterWindow} = require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/rotation-pxt.js')();
const engine = require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/image.js')([], require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/image-pxt.js'));
const art = {width: 7, height: 5, pixels: Uint8Array.from({length: 35}, (_, i) => i % 4 ? (i % 15) + 1 : 0)};

test('bounded rotation gather matches every pinned simulator pixel, including truncation collisions', () => {
    let cases = 0;
    for (const angle of [0, .01, .3, Math.PI / 4, 1.2, Math.PI / 2, 2.5, Math.PI, 3.9, -.7, 7]) {
        for (const [sx, sy] of [[.25, .5], [.7, 1.3], [1, 1], [2, 1.5], [9, 12]]) {
            const box = new RotatedBoundingBox({x: 0, y: 0}, art.width * sx, art.height * sy);
            box.setRotation(angle);
            const full = {width: box.width, height: box.height, pixels: new Uint8Array(box.width * box.height)};
            engine.drawScaledRotated(full, art, 0, 0, sx, sy, angle);
            for (const [x, y] of [[0, 0], [1, 2], [Math.floor(full.width / 2), Math.floor(full.height / 2)]]) {
                const width = Math.max(0, Math.min(17, full.width - x)), height = Math.max(0, Math.min(13, full.height - y));
                const actual = rasterWindow(art, sx, sy, angle, {x, y, width, height});
                const expected = new Uint8Array(width * height);
                for (let row = 0; row < height; row++) expected.set(full.pixels.subarray((y + row) * full.width + x, (y + row) * full.width + x + width), row * width);
                assert.deepEqual(actual.pixels, expected, JSON.stringify({angle, sx, sy, x, y}));
                cases++;
            }
        }
    }
    assert.equal(cases, 165);
});

test('huge rotated sprites visit only visible pixels and empty windows visit none', () => {
    let reads = 0;
    const source = {width: 2, height: 2, pixels: new Proxy([2, 3, 4, 5], {get(target, key) {if (/^\d+$/.test(String(key))) reads++; return target[key];}})};
    for (const angle of [0, .3, Math.PI / 4, Math.PI, -.7]) {
        const box = new RotatedBoundingBox({x: 0, y: 0}, 32768, 32768);
        box.setRotation(angle);
        const result = rasterWindow(source, 16384, 16384, angle, {x: Math.floor(box.width / 2), y: Math.floor(box.height / 2), width: 160, height: 120});
        assert.equal(result.pixels.length, 19200);
        assert.ok(result.pixels.some(Boolean), `visible art at ${angle}`);
    }
    assert.ok(reads < 19200 * 5 * 16, `bounded source reads: ${reads}`);
    reads = 0;
    const empty = rasterWindow(source, 16384, 16384, .3, {x: 0, y: 0, width: 0, height: 0});
    assert.equal(empty.pixels.length, 0);
    assert.equal(reads, 0);
});

test('truncating shear retains the last opaque writer and ignores later transparent pixels', () => {
    const source = {width: 2, height: 2, pixels: Uint8Array.of(0, 0, 2, 3)};
    const window = {x: 0, y: 0, width: 2, height: 2};
    assert.deepEqual(rasterWindow(source, 1, 1, .3, window).pixels, Uint8Array.of(0, 0, 3, 0));
    source.pixels[3] = 0;
    assert.deepEqual(rasterWindow(source, 1, 1, .3, window).pixels, Uint8Array.of(0, 0, 2, 0));
});
