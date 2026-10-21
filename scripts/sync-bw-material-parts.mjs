#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
export const NOTICE = {"name":"Brickwright authored material parts","licence":"BSD-3-Clause","holder":"CrispStrobe"};
import {readFileSync,readdirSync} from 'node:fs';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';import {join,dirname} from 'node:path';
import {OWNED_PART_FILES} from '../overlay/scratch-gui/src/lib/bw-sim/ldraw/owned-parts.js';
const ROOT=join(dirname(fileURLToPath(import.meta.url)),'..');
export const checkOwnedParts=(root=ROOT)=>{
 const dir=join(root,'overlay/scratch-gui/static/sim-lab/parts'),lock=JSON.parse(readFileSync(join(dir,'parts-lock.json'))),meta=JSON.parse(readFileSync(join(root,'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'))),out=[];
 const hash=b=>createHash('sha256').update(b).digest('hex');
 if(lock.version!==1||lock.license!=='BSD-3-Clause'||lock.author!=='CrispStrobe'||!/^[a-f0-9]{64}$/.test(lock.sourceSha256||''))out.push('invalid authored-material provenance');
 const names=Object.keys(lock.files).sort();if(JSON.stringify(names)!==JSON.stringify([...OWNED_PART_FILES].sort()))out.push('authored material resolver differs from lock');
 if(JSON.stringify(readdirSync(dir).filter(n=>n.endsWith('.dat')).sort())!==JSON.stringify(names))out.push('unlocked or missing authored material geometry');
 if(hash(readFileSync(join(dir,'LICENSE.txt')))!==lock.licenseSha256)out.push('authored material licence hash differs');
 for(const name of names){if(!/^[a-z0-9_-]+\.dat$/.test(name)){out.push('invalid material filename');continue;}const bytes=readFileSync(join(dir,name));if(hash(bytes)!==lock.files[name])out.push(name+': hash differs');const text=bytes.toString();if(!/^0 Author: CrispStrobe$/m.test(text)||!/^0 !LICENSE BSD-3-Clause : see LICENSE.txt$/m.test(text))out.push(name+': missing authored licence');}
 for(const p of meta.parts)if(p.ownedGeometry&&!names.includes(p.part))out.push(p.part+': owned metadata without locked geometry');
 for(const name of names.filter(n=>!n.includes('print')))if(!meta.parts.some(p=>p.part===name&&p.ownedGeometry===true))out.push(name+': missing owned metadata');
 return out;
};
if(process.argv[1]===fileURLToPath(import.meta.url)){const errors=checkOwnedParts();if(errors.length)throw Error(errors.join('\n'));console.log('Six authored BSD geometry files and five physical material entries verified');}
