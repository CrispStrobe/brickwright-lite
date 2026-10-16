// Preserve the complete MIT character animation v0.0.2; qualify its native host separately.
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(root, 'packages/scratch-gui/package.json'));
const ts = require('typescript');
const dir = resolve(root, 'overlay/scratch-vm/src/extensions/crispstrobe/arcade');
const identity = Object.freeze({packageId: 'arcade-character-animations', filename: 'main.ts',
    repo: 'microsoft/arcade-character-animations', revision: 'a8df7de6f7073b553976b9e47fbfadebcdc4f0ec',
    sourceSha256: '0779affbce45d6eed32ad13dfbf53df63df031aa214304f18c00300f218e6a83',
    licence: 'MIT', licenceSha256: 'c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383'});
const hash = text => createHash('sha256').update(text).digest('hex');
const source = readFileSync(resolve(dir, 'legacy-character-source/main.ts'), 'utf8');
if (hash(source) !== identity.sourceSha256 ||
    hash(readFileSync(resolve(dir, 'legacy-character-source/LICENSE'))) !== identity.licenceSha256 ||
    hash(readFileSync(resolve(dir, 'legacy-character-source/pxt.json'))) !==
        '325238b345647b7bb47ba050fb593fe412b740a2f45794b5677472e42d70cc56') {
    throw new Error('Legacy character animation source, package configuration or MIT notice differs from reviewed originals');
}
const compiled = ts.transpileModule(source, {
    compilerOptions: {target: ts.ScriptTarget.ES2018}, reportDiagnostics: true
});
if (compiled.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error)) {
    throw new Error('Legacy character animation transpilation failed');
}
const output = `// Generated from ${identity.repo} at ${identity.revision}.
// MIT, Copyright (c) Microsoft Corporation.. See legacy-character-source/LICENSE.
// Source SHA256 ${identity.sourceSha256}; regenerate: node scripts/generate-arcade-legacy-character.mjs
module.exports = function initializeOriginalLegacyCharacterAnimations(host) {
const {game, scene, sprites, CollisionDirection} = host;
${compiled.outputText}
return {characterAnimations, Predicate};
};
module.exports.sourceIdentity = Object.freeze(${JSON.stringify(identity, null, 4)});
`;
const path = resolve(dir, 'legacy-character-pxt.js');
if (process.argv.includes('--check')) {
    if (readFileSync(path, 'utf8') !== output) throw new Error('Legacy character animation generated module differs');
    console.log('Verified complete original character animation v0.0.2');
} else writeFileSync(path, output);

const admissionPath = resolve(root, 'overlay/scratch-gui/src/lib/bw-makecode/legacy-character-source-admission.generated.js');
const admission = `// Generated from the complete retained MIT character animation v0.0.2; do not edit.
// Regenerate: node scripts/generate-arcade-legacy-character.mjs
export const LEGACY_CHARACTER_SOURCE_TEXT=${JSON.stringify(source)};
export const LEGACY_CHARACTER_NATIVE_IDENTITY=Object.freeze(${JSON.stringify(identity)});
`;
if (process.argv.includes('--check')) {
    if (readFileSync(admissionPath, 'utf8') !== admission) throw new Error('Legacy character admission source differs');
} else writeFileSync(admissionPath, admission);
