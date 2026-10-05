// Extract the pinned MIT PXT pixel algorithms without the simulator environment.
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
const hash = createHash('sha256').update(declarations).digest('hex');
const output = `// Generated from pinned pxt-common-packages simulator image algorithms (MIT).
// Copyright (c) Microsoft Corporation. See static/licenses/pxt-common-packages.MIT.txt.
// Source algorithms SHA-256: ${hash}
// Regenerate: node scripts/generate-arcade-image-operations.mjs
module.exports = function initializePxtImageOperations() {
${declarations}
return {setPixel, getPixel, fillRect, drawLine, drawImage, drawTransparentImage, overlapsWith};
};
`;
writeFileSync(resolve(root, 'overlay/scratch-vm/src/extensions/crispstrobe/arcade/image-pxt.js'), output);
console.log(`Generated seven image operations (${hash.slice(0,12)}).`);
