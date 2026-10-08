#!/usr/bin/env node
// API names from the pinned Microsoft PXT Arcade bundle (MIT), not an
// implementation or a claim that every listed API is translated.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const bundle=JSON.parse(readFileSync(resolve(root,'packages/scratch-gui/static/makecode/arcade/target.json'),'utf8'));
const apis={...bundle.apiInfo['libs/device'].apis.byQName,...bundle.apiInfo['libs/multiplayer'].apis.byQName,...bundle.apiInfo['libs/color-coded-tilemap'].apis.byQName};
const containers=new Set(Object.keys(apis).filter(name=>[5,6].includes(apis[name].kind)));
const members={};
for(const name of [...containers].sort()) {
 const prefix=name+'.';
 members[name]=Object.keys(apis).filter(key=>key.startsWith(prefix)&&!key.slice(prefix.length).includes('.'))
  .sort().map(key=>[key.slice(prefix.length),containers.has(key)?1:0]);
}
const content=`// Generated from Microsoft PXT Arcade ${bundle.versions.target}, device, multiplayer and color-coded tilemap API metadata (MIT).\n`+
 '// Copyright (c) Microsoft Corporation. See static/licenses/pxt-common-packages.MIT.txt.\n'+
 '// Regenerate: node scripts/generate-arcade-namespace-members.mjs\n'+
 '// Names establish namespace binding only; translation still diagnoses unsupported APIs.\n'+
 `export const ARCADE_NAMESPACE_MEMBERS = ${'{\n'+Object.entries(members).map(([name,entries])=>'    '+JSON.stringify(name)+': '+JSON.stringify(entries)).join(',\n')+'\n}'};\n`;
const output=resolve(root,'overlay/scratch-gui/src/lib/bw-makecode/arcade-namespace-members.js');
if(process.argv.includes('--check')) {
 if(readFileSync(output,'utf8')!==content)throw new Error('Arcade namespace metadata differs from pinned bundle');
 console.log('Pinned Arcade namespace metadata verified');
} else {writeFileSync(output,content);console.log(`Wrote ${containers.size} namespace/enum member lists`);}
