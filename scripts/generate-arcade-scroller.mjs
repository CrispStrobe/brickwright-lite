#!/usr/bin/env node
// Keep the scroller extension (arcade-background-scroll) in sync with its pin:
// main.ts from the vendored, blob-verified source (extensions-vendored.js,
// written by scripts/sync-makecode-extensions.mjs), transpiled unchanged. The
// generated module receives a host (scene, frame handlers, renderables, camera,
// background image) from the native Arcade extension.
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(root, 'packages/scratch-gui/package.json'));
const ts = require('typescript');
const {VENDORED_EXTENSIONS} = await import(pathToFileURL(resolve(root, 'overlay/scratch-gui/src/lib/bw-makecode/extensions-vendored.js')).href);
const pin = VENDORED_EXTENSIONS.find(extension => extension.id === 'arcade-background-scroll');
if (!pin?.files['main.ts']) throw new Error('arcade-background-scroll is not vendored; run scripts/sync-makecode-extensions.mjs');
const source = pin.files['main.ts'].text;
const compiled = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2018, removeComments: false}}).outputText;
const content = `// Generated from ${pin.repo} ${pin.tag} (${pin.commit}), MIT, Copyright (c) Microsoft Corporation.
// See static/licenses/makecode-extensions.MIT.txt.
// main.ts: blob ${pin.files['main.ts'].blob}, sha256 ${createHash('sha256').update(source).digest('hex')}
// Regenerate: node scripts/generate-arcade-scroller.mjs
module.exports = function initializePxtScroller(host) {
const {game, scene} = host;
${compiled}
return {scroller};
};
`;
const target = resolve(root, 'overlay/scratch-vm/src/extensions/crispstrobe/arcade/scroller-pxt.js');
if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== content) throw new Error('scroller-pxt.js differs from the vendored arcade-background-scroll');
    console.log(`Verified Arcade scroller from ${pin.repo} ${pin.tag}`);
} else {
    writeFileSync(target, content);
    console.log(`Generated Arcade scroller from ${pin.repo} ${pin.tag}`);
}
