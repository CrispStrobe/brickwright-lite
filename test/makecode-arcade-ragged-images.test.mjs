import test from 'node:test';
import assert from 'node:assert/strict';
import {parseImageLiteral} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

// Compact literals without spaces and with uneven rows compile in PXT.
const LITERAL = `...6
..626
.62926
.62226
..626
...6`;

test('ragged image literals decode exactly as the original compiler does', async () => {
    const original = await runPxtArcade(`let done = false
let im = img\`
${LITERAL}
\`
let w = im.width
let h = im.height
let px = ""
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px += "" + im.getPixel(x, y) + ","
done = true
done = true`, {waitForGlobals: {done: true}});
    const image = parseImageLiteral(LITERAL);
    assert.deepEqual([image.width, image.height], [original.w, original.h]);
    assert.equal(Array.from(image.pixels).map(pixel => pixel + ',').join(''), original.px);
});
