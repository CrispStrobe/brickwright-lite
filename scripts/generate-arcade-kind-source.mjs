// Preserve the pinned MIT allocator and builtin initialization exactly.
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(root, 'packages/scratch-gui/package.json'));
const ts = require('typescript');
const dir = resolve(root, 'overlay/scratch-vm/src/extensions/crispstrobe/arcade');
const identity = JSON.parse(readFileSync(resolve(dir, 'kind-source/provenance.json'), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const source = readFileSync(resolve(dir, 'kind-source/spritekind.ts'), 'utf8');
if (identity.sourceSha256 !== 'de733abb60f73a70f32134af4a1fc72f4de24e1c9b175069d74b5cdf1c112567' ||
    identity.licenceSha256 !== '27ebda9d51f0a56b7e281ccd8230a27236dcb51c05f64b07869ecf6e965d68b0' ||
    identity.revision !== '2d7d59b5226e8a1a1e05e8042dd9f5248ed68fea' ||
    hash(source) !== identity.sourceSha256 || hash(readFileSync(resolve(dir, 'kind-source/LICENSE'))) !== identity.licenceSha256) {
    throw new Error('Pinned original kind allocator or MIT notice differs');
}
const result = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2018}, reportDiagnostics: true});
if (result.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error)) throw new Error('Original kind source transpilation failed');
const output = `// Generated from ${identity.repo} at ${identity.revision}.
// MIT, Copyright (c) Microsoft Corporation. See kind-source/LICENSE.
// Original source SHA256 ${identity.sourceSha256}.
// Regenerate: node scripts/generate-arcade-kind-source.mjs
module.exports = function initializeOriginalSpriteKinds() {
${result.outputText}
return {SpriteKind, sprites};
};
module.exports.sourceIdentity = Object.freeze(${JSON.stringify(identity, null, 4)});
`;
const path = resolve(dir, 'kind-source-pxt.js');
if (process.argv.includes('--check')) {
    if (readFileSync(path, 'utf8') !== output) throw new Error('Original kind generated module differs');
} else writeFileSync(path, output);
