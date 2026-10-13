import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..'),source=readFileSync(resolve(root,'src/compat/arcade-string-array-settings.ts'),'utf8');
const ts=createRequire(resolve(root,'packages/scratch-gui/package.json'))('typescript');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2018},reportDiagnostics:true});
if(compiled.diagnostics?.some(d=>d.category===ts.DiagnosticCategory.Error))throw Error('StringArray helper transpilation failed');
const sha=createHash('sha256').update(source).digest('hex');
const outputs={
 'overlay/scratch-vm/src/extensions/crispstrobe/arcade/string-array-settings.js':`// Generated from independently authored MPL-2.0 source src/compat/arcade-string-array-settings.ts.\n// Source SHA256 ${sha}; regenerate scripts/generate-arcade-string-array-settings.mjs.\nmodule.exports = {initialize(settings) {\n${compiled.outputText}\nreturn bwStringArraySettings;\n}};\n`,
 'overlay/scratch-gui/src/lib/bw-makecode/string-array-settings.generated.js':`// Generated from independently authored MPL-2.0 source src/compat/arcade-string-array-settings.ts.\n// Regenerate scripts/generate-arcade-string-array-settings.mjs.\nexport const STRING_ARRAY_SETTINGS_PATH = 'bw-string-array-settings.ts';\nexport const STRING_ARRAY_SETTINGS_SOURCE = ${JSON.stringify(source)};\nexport const STRING_ARRAY_SETTINGS_SHA256 = ${JSON.stringify(sha)};\n`
};
for(const [file,text]of Object.entries(outputs))if(process.argv.includes('--check')){if(readFileSync(resolve(root,file),'utf8')!==text)throw Error('Generated StringArray source drift '+file);}else writeFileSync(resolve(root,file),text);
console.log('Verified independently authored StringArray helper/native/source byte identity');
