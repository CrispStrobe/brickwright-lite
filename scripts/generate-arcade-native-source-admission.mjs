// Freeze an exact source comparison for the browser's synchronous admission hook.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const require=createRequire(resolve(root,'packages/scratch-gui/package.json'));
const ts=require('typescript');
const retained='overlay/scratch-vm/src/extensions/crispstrobe/arcade/sprite-data-source';
const source=readFileSync(resolve(root,retained,'main.ts'),'utf8');
const hash=createHash('sha256').update(source).digest('hex');
if(hash!=='8550e26929a475f95a359a096cda2bf75a59715978d9a2ad8745e77b0eec783d')throw new Error('Sprite Data admission source differs from reviewed v0.0.5 bytes');
const names=['setDataNumber','changeDataNumberBy','readDataNumber','setDataString','readDataString','setDataBoolean','readDataBoolean','setDataSprite','readDataSprite'];
const parsed=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const namespace=parsed.statements[0];
if(parsed.statements.length!==1 || !ts.isModuleDeclaration(namespace) || namespace.name.text!=='sprites' || !ts.isModuleBlock(namespace.body) || namespace.body.statements.length!==names.length || namespace.body.statements.some((node,i)=>!ts.isFunctionDeclaration(node) || node.name?.text!==names[i] || !node.body))throw new Error('Sprite Data namespace must install only the reviewed nine functions; initializers are not admitted');
const provenance=JSON.parse(readFileSync(resolve(root,retained,'provenance.json'),'utf8'));
const licenseHash=createHash('sha256').update(readFileSync(resolve(root,retained,'LICENSE'))).digest('hex');
if(Object.keys(provenance).sort().join(',')!==['repository','ref','revision','source','license','sourceSha256','licenseSha256'].sort().join(',') || provenance.repository!=='microsoft/arcade-sprite-data' || provenance.ref!=='v0.0.5' || provenance.revision!=='332026d12c46286c7afe59bc4829ccf08471d5b1' || provenance.source!=='https://github.com/microsoft/arcade-sprite-data/blob/332026d12c46286c7afe59bc4829ccf08471d5b1/main.ts' || provenance.sourceSha256!==hash || provenance.license!=='MIT' || licenseHash!=='9906940f61b1f0b533fa7d99baf55178b2808fbe113ea51dfbfad8572ccd5f2b' || provenance.licenseSha256!==licenseHash)throw new Error('Sprite Data official provenance changed');
const text=`// Generated exact source identity; no filename/version-only source admission.\n// Original Microsoft arcade-sprite-data v0.0.5 is MIT; copyright Microsoft Corporation.\n// Source and notice: ${retained}/\n// Regenerate: node scripts/generate-arcade-native-source-admission.mjs\nexport const SPRITE_DATA_SOURCE_TEXT = ${JSON.stringify(source)};\nexport const SPRITE_DATA_NATIVE_IDENTITY = Object.freeze(${JSON.stringify({...provenance,packageId:'arcade-sprite-data',filename:'main.ts',namespace:'sprites'},null,4)});\nexport const SPRITE_DATA_NATIVE_APIS = Object.freeze(${JSON.stringify(names)});\n`;
const target=resolve(root,'overlay/scratch-gui/src/lib/bw-makecode/native-source-admission.generated.js');
if(process.argv.includes('--check')){if(readFileSync(target,'utf8')!==text)throw new Error('Native source admission differs from reviewed source');console.log('Verified exact Sprite Data source identity and nine-function initialization boundary');}
else writeFileSync(target,text);
