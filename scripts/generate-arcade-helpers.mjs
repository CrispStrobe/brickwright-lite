#!/usr/bin/env node
// Keep PXT's base text helpers in sync with our pinned runtime: parseInt and
// helpers.isWhitespace from base/pxt-helpers.ts, transpiled unchanged. PXT's
// parseInt is its own TypeScript (it differs from JavaScript's, e.g. for
// "0x" prefixes and radixes), so the native runtime runs that code.
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(root, 'packages/scratch-gui/package.json'));
const ts = require('typescript');
const bundle = JSON.parse(readFileSync(resolve(root, 'packages/scratch-gui/static/makecode/arcade/target.json')));
const source = bundle.bundledpkgs.base['pxt-helpers.ts'];
const sliceFunction = name => {
    const start = source.indexOf(`function ${name}(`);
    if (start < 0 || source.indexOf(`function ${name}(`, start + 1) >= 0) throw new Error(`expected one pinned PXT function ${name}`);
    let depth = 0;
    for (let end = source.indexOf('{', start); end < source.length; end++) {
        if (source[end] === '{') depth++;
        if (source[end] === '}' && !--depth) return source.slice(start, end + 1);
    }
    throw new Error(`unclosed pinned PXT function ${name}`);
};
const parseInt = sliceFunction('parseInt');
const isWhitespace = sliceFunction('isWhitespace');
const compiled = ts.transpileModule(`namespace helpers { export ${isWhitespace} }\n${parseInt}`,
    {compilerOptions: {target: ts.ScriptTarget.ES2018, removeComments: false}}).outputText;
const content = `// Generated from PXT Arcade ${bundle.versions.target}, pxt-common-packages (MIT).
// Copyright (c) Microsoft Corporation. See static/licenses/pxt-common-packages.MIT.txt.
// pxt-helpers.ts: ${createHash('sha256').update(source).digest('hex')}
// Regenerate: node scripts/generate-arcade-helpers.mjs
module.exports = (function () {
${compiled}
return {parseInt, helpers};
})();
`;
const target = resolve(root, 'overlay/scratch-vm/src/extensions/crispstrobe/arcade/helpers-pxt.js');
if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== content) throw new Error('helpers-pxt.js differs from the pinned PXT runtime');
    console.log(`Verified Arcade base helpers from PXT ${bundle.versions.target}`);
} else {
    writeFileSync(target, content);
    console.log(`Generated Arcade base helpers from PXT ${bundle.versions.target}`);
}
