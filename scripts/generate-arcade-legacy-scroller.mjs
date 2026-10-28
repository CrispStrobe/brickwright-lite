// Preserve the complete MIT single-background scroller; qualify its native host separately.
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(root, 'packages/scratch-gui/package.json'));
const ts = require('typescript');
const dir = resolve(root, 'overlay/scratch-vm/src/extensions/crispstrobe/arcade');
const identity = Object.freeze({packageId: 'arcade-background-scroll', filename: 'main.ts',
    repo: 'riknoll/arcade-background-scroll', revision: '43651f88b917a98ad886fdd4c1c2ad8001ce9b9c',
    sourceSha256: '1b456d2f65078f1ccf95cd89b30bba000e31bac423c8c1cae494f800ce31ce15',
    licence: 'MIT', licenceSha256: '97a7479845935a5b6bf724b315203ecaeea1f1ae2061e229765945359570f6c0'});
const hash = text => createHash('sha256').update(text).digest('hex');
const source = readFileSync(resolve(dir, 'legacy-scroller-source/main.ts'), 'utf8');
if (hash(source) !== identity.sourceSha256 ||
    hash(readFileSync(resolve(dir, 'legacy-scroller-source/LICENSE'))) !== identity.licenceSha256 ||
    hash(readFileSync(resolve(dir, 'legacy-scroller-source/pxt.json'))) !==
        '8227f9fc521a23d2bf4475cd9cd3822bce13f14934e2101f0b54f7d281482a20') {
    throw new Error('Legacy scroller source, package configuration or MIT notice differs from reviewed originals');
}
const compiled = ts.transpileModule(source, {
    compilerOptions: {target: ts.ScriptTarget.ES2018}, reportDiagnostics: true
});
if (compiled.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error)) {
    throw new Error('Legacy scroller transpilation failed');
}
const output = `// Generated from ${identity.repo} at ${identity.revision}.
// MIT, Copyright (c) 2021 Richard Knoll. See legacy-scroller-source/LICENSE.
// Source SHA256 ${identity.sourceSha256}; regenerate: node scripts/generate-arcade-legacy-scroller.mjs
module.exports = function initializeOriginalLegacyScroller(host) {
const {game, scene} = host;
${compiled.outputText}
return {scroller};
};
module.exports.sourceIdentity = Object.freeze(${JSON.stringify(identity, null, 4)});
`;
const path = resolve(dir, 'legacy-scroller-pxt.js');
if (process.argv.includes('--check')) {
    if (readFileSync(path, 'utf8') !== output) throw new Error('Legacy scroller generated module differs');
    console.log('Verified complete original single-background scroller');
} else writeFileSync(path, output);

const admissionPath=resolve(root,'overlay/scratch-gui/src/lib/bw-makecode/legacy-scroller-source-admission.generated.js');
const admission=`// Generated from the complete retained MIT legacy scroller; do not edit.\n// Regenerate: node scripts/generate-arcade-legacy-scroller.mjs\nexport const LEGACY_SCROLLER_SOURCE_TEXT=${JSON.stringify(source)};\nexport const LEGACY_SCROLLER_NATIVE_IDENTITY=Object.freeze(${JSON.stringify(identity)});\n`;
if(process.argv.includes('--check')) {
    if(readFileSync(admissionPath,'utf8')!==admission)throw new Error('Legacy scroller admission source differs');
} else writeFileSync(admissionPath,admission);
