// Retain the complete original nine Sprite Data algorithms without substituting defaults.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const require=createRequire(resolve(root,'packages/scratch-gui/package.json'));
const ts=require('typescript');
const folder=resolve(root,'overlay/scratch-vm/src/extensions/crispstrobe/arcade');
const source=readFileSync(resolve(folder,'sprite-data-source/main.ts'),'utf8');
const sha=createHash('sha256').update(source).digest('hex');
if(sha!=='8550e26929a475f95a359a096cda2bf75a59715978d9a2ad8745e77b0eec783d')throw new Error('Sprite Data differs from reviewed v0.0.5 source');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2018},reportDiagnostics:true});
if(compiled.diagnostics?.some(d=>d.category===ts.DiagnosticCategory.Error))throw new Error('Sprite Data transpilation failed');
const content=`// Generated from Microsoft arcade-sprite-data v0.0.5, commit 332026d12c46286c7afe59bc4829ccf08471d5b1.\n// MIT, Copyright (c) Microsoft Corporation. Original source/license: sprite-data-source/.\n// Source SHA256 ${sha}; regenerate: node scripts/generate-arcade-sprite-data.mjs\nmodule.exports = function initializeOriginalSpriteData() {\n${compiled.outputText}\nreturn sprites;\n};\n`;
const target=resolve(folder,'sprite-data-pxt.js');
if(process.argv.includes('--check')){if(readFileSync(target,'utf8')!==content)throw new Error('Sprite Data differs from original source');console.log('Verified complete original Sprite Data algorithms');}
else writeFileSync(target,content);
