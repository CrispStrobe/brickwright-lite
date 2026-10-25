// Freeze the exact MIT TextSprite source and its retained kind initializer.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..'),require=createRequire(resolve(root,'packages/scratch-gui/package.json')),ts=require('typescript');
const retained='overlay/scratch-vm/src/extensions/crispstrobe/arcade/text-sprite-source';
const source=readFileSync(resolve(root,retained,'text.ts'),'utf8'),provenance=JSON.parse(readFileSync(resolve(root,retained,'provenance.json'),'utf8'));
const hash=value=>createHash('sha256').update(value).digest('hex');
if(hash(source)!=='691b89e9dc8c70c1dd3da516c409cf277591718108f8013e977f9001a86dea63' || hash(readFileSync(resolve(root,retained,'LICENSE')))!=='c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383')throw new Error('TextSprite source or MIT notice differs from reviewed original');
if(Object.keys(provenance).sort().join(',')!==['repo','version','commit','source','license','licenseUrl','sha256','boundary'].sort().join(',') || provenance.sha256.LICENSE!=='c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383' || provenance.boundary!=='Complete original source transpilation. Native Sprite, Image, fonts and scene hosts need independent original comparison; source admission remains separate.' || provenance.repo!=='microsoft/arcade-text' || provenance.version!=='v1.3.0' || provenance.commit!=='fa2439314c6633943666a763fdae32a5c67a9ae8' || provenance.license!=='MIT' || provenance.source!=='https://github.com/microsoft/arcade-text/blob/fa2439314c6633943666a763fdae32a5c67a9ae8/text.ts' || provenance.licenseUrl!=='https://github.com/microsoft/arcade-text/blob/fa2439314c6633943666a763fdae32a5c67a9ae8/LICENSE' || provenance.sha256['text.ts']!==hash(source))throw new Error('TextSprite official identity changed');
const parsed=ts.createSourceFile('text.ts',source,ts.ScriptTarget.Latest,true),[kind,klass,namespace]=parsed.statements;
const methods=['update','setMaxFontHeight','setIcon','setText','setBorder','setOutline'],functions=['renderScaledImage','getFontForTextAndHeight','create','outlineOtherColor'];
if(parsed.statements.length!==3 || !ts.isModuleDeclaration(kind) || kind.name.text!=='SpriteKind' || !ts.isModuleBlock(kind.body) || kind.body.statements.length!==1 || !ts.isVariableStatement(kind.body.statements[0]) || !ts.isClassDeclaration(klass) || klass.name.text!=='TextSprite' || klass.members.filter(ts.isMethodDeclaration).map(n=>n.name.text).join(',')!==methods.join(',') || !ts.isModuleDeclaration(namespace) || namespace.name.text!=='textsprite' || !ts.isModuleBlock(namespace.body) || namespace.body.statements.map(n=>ts.isFunctionDeclaration(n)&&n.name.text).join(',')!==functions.join(','))throw new Error('TextSprite installation boundary changed');
const declaration=kind.body.statements[0].declarationList.declarations[0];
if(kind.body.statements[0].declarationList.declarations.length!==1 || declaration.name.text!=='Text' || declaration.initializer.getText(parsed)!=='SpriteKind.create()')throw new Error('TextSprite kind initializer changed');
// Retain the exact namespace declaration, including its original comments.
const replacementSource=kind.getFullText(parsed);
const identity={...provenance,packageId:'arcade-text',filename:'text.ts'};
const output=`// Generated exact MIT TextSprite identity and original kind initializer.\n// Regenerate: node scripts/generate-arcade-text-source-admission.mjs\nexport const TEXT_SPRITE_SOURCE_TEXT=${JSON.stringify(source)};\nexport const TEXT_SPRITE_INITIALIZER=${JSON.stringify(replacementSource)};\nexport const TEXT_SPRITE_NATIVE_IDENTITY=Object.freeze({...${JSON.stringify(identity)},sha256:Object.freeze(${JSON.stringify(identity.sha256)})});\n`;
const target=resolve(root,'overlay/scratch-gui/src/lib/bw-makecode/text-source-admission.generated.js');
if(process.argv.includes('--check')){if(readFileSync(target,'utf8')!==output)throw new Error('TextSprite admission identity or initializer changed');console.log('Verified exact TextSprite source, notice and initializer');}else writeFileSync(target,output);
