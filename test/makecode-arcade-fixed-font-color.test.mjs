import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {createArcadeRuntimeMock} from './helpers/arcade-runtime-mock.mjs';

const original = JSON.parse(readFileSync(new URL('./fixtures/arcade/live-font-pixels.json', import.meta.url), 'utf8'));

test('the actual fixed-font Image adapter retains selected-original eight-bit glyph colors', () => {
    const extension = new (loadExtensionClass('arcade'))(createArcadeRuntimeMock())._inst;
    const reference = extension.createImage({WIDTH: 32, HEIGHT: 24});
    extension.printImageText({IMAGE: reference, TEXT: 'A', X: 0, Y: 0, COLOR: 17, FONT: 'small'});
    const image = extension._image(reference);
    // The original first draw occupies only this 6x5 region. Its later
    // scaled/wide draws start at x8/y12 and cannot affect these pixels.
    const expected = original.fontPicture.pixels.map((color, index) =>
        index % 32 < 6 && Math.floor(index / 32) < 5 ? color : 0);
    assert.ok(expected.includes(17), 'original glyph color control is nonempty');
    assert.deepEqual([...image.pixels], expected);
});
