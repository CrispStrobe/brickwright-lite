#!/usr/bin/env node
// Derive numeric Scene constants from the shipped Microsoft MIT SDK itself.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const bundle=JSON.parse(readFileSync(resolve(root,'packages/scratch-gui/static/makecode/arcade/target.json'),'utf8'));
const source=bundle.bundledpkgs.game['scene.ts'];
const api=bundle.apiInfo['libs/device'].apis.byQName;
if(!/^namespace scene\s*\{/m.test(source))throw new Error('Pinned Scene source namespace changed');
const values=Object.fromEntries([...source.matchAll(/export const ([A-Z][A-Z0-9_]*)\s*=\s*(-?\d+(?:\.\d+)?)\s*;/g)].map(match=>['scene.'+match[1],Number(match[2])]));
const numeric=Object.keys(api).filter(name=>name.startsWith('scene.')&&!name.slice(6).includes('.')&&api[name].kind===4&&(api[name].retType==='number'||/^-?\d+(?:\.\d+)?$/.test(api[name].retType)));
for(const name of numeric)if(!Object.hasOwn(values,name)||!Number.isFinite(values[name]))throw new Error('Unsupported Scene constant source: '+name);
for(const name of Object.keys(values))if(!numeric.includes(name))throw new Error('Scene source constant absent from API: '+name);
// The named Scene flags are enum members, not exported scalar constants.
const flagBody=source.match(/export enum Flag\s*\{([^}]*)\}/)?.[1];
if(!flagBody)throw new Error('Pinned Scene Flag enum is absent');
const flagRows=flagBody.replace(/\/\/[^\n]*/g,'').split(',').map(row=>row.trim()).filter(Boolean);
const flags={};
for(const row of flagRows){const parsed=/^(\w+)\s*=\s*(\d+)\s*<<\s*(\d+)$/.exec(row);if(!parsed)throw new Error('Unsupported Scene Flag source: '+row);flags['scene.Flag.'+parsed[1]]=Number(parsed[2])<<Number(parsed[3]);}
const declaredFlags=Object.keys(api).filter(name=>name.startsWith('scene.Flag.'));
if(JSON.stringify(Object.keys(flags).sort())!==JSON.stringify(declaredFlags.sort()))throw new Error('Scene Flag enum/source API differs');
Object.assign(values,flags);
const sorted=Object.fromEntries(Object.entries(values).sort(([a],[b])=>a.localeCompare(b)));
const content=`// Generated from Microsoft PXT Arcade ${bundle.versions.target} game/scene.ts (MIT).\n// Copyright (c) Microsoft Corporation. See static/licenses/pxt-common-packages.MIT.txt.\n// Regenerate: node scripts/generate-arcade-scene-constants.mjs\nexport const ARCADE_SCENE_SOURCE_SHA256 = '${createHash('sha256').update(source).digest('hex')}';\nexport const ARCADE_SCENE_CONSTANTS = Object.freeze(${JSON.stringify(sorted,null,4)});\n`;
const output=resolve(root,'overlay/scratch-gui/src/lib/bw-makecode/arcade-scene-constants.js');
if(process.argv.includes('--check')){if(readFileSync(output,'utf8')!==content)throw new Error('Pinned Scene constants differ');console.log('Pinned Scene constants verified');}
else {writeFileSync(output,content);console.log('Generated '+numeric.length+' pinned Scene constants');}
