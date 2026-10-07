// Extract the pinned MIT PXT pixel algorithms without the simulator environment
// (packages/scratch-gui/static/makecode/arcade/sim/common-sim.js, from `npm run sync:makecode`).
//   node scripts/generate-arcade-image-operations.mjs [--check]
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const root = resolve(import.meta.dirname, '..');
const source = readFileSync(resolve(root, 'packages/scratch-gui/static/makecode/arcade/sim/common-sim.js'), 'utf8');
const methods = ['setPixel', 'getPixel', 'fillRect', 'drawLineLow', 'drawLineHigh', 'drawLine', 'drawImageCore', 'drawImage', 'drawTransparentImage', 'overlapsWith'];
const declarations = methods.map(name => {
    const start = source.indexOf(`function ${name}(img`);
    if (start < 0) throw new Error(`Missing pinned PXT method ${name}`);
    const body = source.indexOf('{', start);
    let depth = 1, end = body + 1;
    while (depth && end < source.length) {
        if (source[end] === '{') depth++;
        if (source[end] === '}') depth--;
        end++;
    }
    if (depth) throw new Error(`Unclosed pinned PXT method ${name}`);
    return source.slice(start, end);
}).join('\n');
// Sprite rotation (task F4): the simulator's scaled-and-rotated draw and its two
// overlap tests, with their constants and float "fixed point" helpers, taken as
// one contiguous block. Its \`ImageMethods.x = x\` registrations are dropped.
const rotationStart = source.indexOf('const TWO_PI = 2 * Math.PI;');
const rotationEndMarker = 'ImageMethods._checkOverlapsTwoScaledRotatedImages = _checkOverlapsTwoScaledRotatedImages;';
const rotationEnd = source.indexOf(rotationEndMarker, rotationStart);
if (rotationStart < 0 || rotationEnd < 0) throw new Error('Missing pinned PXT scaled-rotated image methods');
const rotation = source.slice(rotationStart, rotationEnd + rotationEndMarker.length)
    .split('\n').filter(line => !/^\s*ImageMethods\.\w+ = \w+;\s*$/.test(line)).join('\n');
for (const name of ['parseShearArgs', 'drawScaledRotatedImage', '_checkOverlapsScaledRotatedImage', '_checkOverlapsTwoScaledRotatedImages']) {
    if (!rotation.includes(`function ${name}(`)) throw new Error(`Missing pinned PXT method ${name}`);
}
const hash = createHash('sha256').update(declarations).update(rotation).digest('hex');
const output = `// Generated from pinned pxt-common-packages simulator image algorithms (MIT).
// Copyright (c) Microsoft Corporation. See static/licenses/pxt-common-packages.MIT.txt.
// Source algorithms SHA-256: ${hash}
// Regenerate: node scripts/generate-arcade-image-operations.mjs
module.exports = function initializePxtImageOperations() {
${declarations}
${rotation}
return {setPixel, getPixel, fillRect, drawLine, drawImage, drawTransparentImage, overlapsWith,
    drawScaledRotatedImage, checkOverlapsScaledRotatedImage: _checkOverlapsScaledRotatedImage,
    checkOverlapsTwoScaledRotatedImages: _checkOverlapsTwoScaledRotatedImages};
};
`;
const target = resolve(root, 'overlay/scratch-vm/src/extensions/crispstrobe/arcade/image-pxt.js');
if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== output) throw new Error('image-pxt.js differs from the pinned PXT simulator — run scripts/generate-arcade-image-operations.mjs');
    console.log(`Verified ten image operations (${hash.slice(0,12)}) against the pinned PXT simulator.`);
} else {
    writeFileSync(target, output);
    console.log(`Generated ten image operations (${hash.slice(0,12)}).`);
}
