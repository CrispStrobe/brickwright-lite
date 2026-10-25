import test from 'node:test';
import assert from 'node:assert/strict';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

// Original-only reference receipt for integration. This is not a native or GUI
// qualification; the combined provider/lowering/export routes must match it.
import {dialogOriginalSource} from './fixtures/arcade-sdk-dialog-game.mjs';

test('selected original SplashDialog keeps live image identity and replaces it on fractional resize', async t => {
    const actual = await runPxtArcade(dialogOriginalSource, {inspectImageGlobals: ['initial', 'resized']});
    assert.equal(actual.sameImage, true); assert.equal(actual.replaced, true);
    assert.equal(actual.width, 160); assert.equal(actual.height, 35);
    assert.equal(actual.resizedWidth, 32); assert.equal(actual.resizedHeight, 28);
    assert.equal(actual.oldWidth, 160); assert.equal(actual.oldHeight, 35);
    assert.equal(actual.textColor, 1); assert.equal(actual.cursorCount, 1);
    assert.equal(actual.$images.initial.width, 160); assert.equal(actual.$images.initial.height, 35);
    assert.equal(actual.$images.resized.width, 32); assert.equal(actual.$images.resized.height, 28);
    t.diagnostic(JSON.stringify({sameImage: actual.sameImage, replaced: actual.replaced,
        width: actual.width, height: actual.height, resizedWidth: actual.resizedWidth, resizedHeight: actual.resizedHeight,
        textColor: actual.textColor, cursorCount: actual.cursorCount,
        boundary: 'Actual original only; native descriptor/image-factory/roundtrip qualification pending'}));
});
