// Preserve the complete MIT Text Sprite algorithms; qualify host integration separately.
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(root, 'packages/scratch-gui/package.json'));
const ts = require('typescript');
const dir = resolve(root, 'overlay/scratch-vm/src/extensions/crispstrobe/arcade');
const source = readFileSync(resolve(dir, 'text-sprite-source/text.ts'), 'utf8');
const hash = createHash('sha256').update(source).digest('hex');
if (hash !== '691b89e9dc8c70c1dd3da516c409cf277591718108f8013e977f9001a86dea63') {
    throw new Error('Text Sprite differs from reviewed original v1.3.0');
}
const compiled = ts.transpileModule(source, {
    compilerOptions: {target: ts.ScriptTarget.ES2018}, reportDiagnostics: true
});
if (compiled.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error)) {
    throw new Error('Text Sprite transpilation failed');
}
const output = `// Generated from microsoft/arcade-text v1.3.0 at fa2439314c6633943666a763fdae32a5c67a9ae8.
// MIT, Copyright (c) Microsoft Corporation. See text-sprite-source/LICENSE.
// Source SHA256 ${hash}; regenerate: node scripts/generate-arcade-text-sprite.mjs
module.exports = function initializeOriginalTextSprite(host) {
const {Sprite, SpriteFlag, image, game} = host;
var SpriteKind = {create: host.createKind};
${compiled.outputText}
return {TextSprite, textsprite, SpriteKind};
};
`;
const path = resolve(dir, 'text-sprite-pxt.js');
if (process.argv.includes('--check')) {
    if (readFileSync(path, 'utf8') !== output) throw new Error('Text Sprite generated module differs');
    console.log('Verified complete original Text Sprite algorithms');
} else writeFileSync(path, output);
