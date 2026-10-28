// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,cpSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {fetchLDrawClosure} from '../overlay/scratch-gui/src/lib/bw-sim/ldraw/ldraw-fetch.js';
import {flattenPart} from '../overlay/scratch-gui/src/lib/bw-sim/ldraw/ldraw-geometry.js';
import {OWNED_PART_FILES} from '../overlay/scratch-gui/src/lib/bw-sim/ldraw/owned-parts.js';
import {checkOwnedParts} from '../scripts/sync-bw-material-parts.mjs';
const root=new URL('../',import.meta.url).pathname,assets='overlay/scratch-gui/static/sim-lab/parts',meta='overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json';
test('cold authored material closure resolves the glass and print without probing the official library',async()=>{
 const requests=[];const fetchImpl=async url=>{requests.push(url);if(url==='static/ldraw/ldraw-lock.json')return {ok:true,text:async()=>'{"files":{}}'};assert.ok(url.startsWith('static/sim-lab/parts/'));return {ok:true,text:async()=>readFileSync(join(root,'overlay/scratch-gui',url),'utf8')};};
 const c=await fetchLDrawClosure(OWNED_PART_FILES,{fetchImpl});assert.deepEqual(c.missing,[]);assert.deepEqual(c.fromCatalogue,[]);
 for(const name of OWNED_PART_FILES){const f=flattenPart(name,c.read);assert.deepEqual(f.missing,[]);assert.ok(f.polys.length>0);}
 assert.equal(requests.length,7,'one official index and six authored geometry requests');
});
test('authored geometry admission rejects modified assets and cannot hide an official part behind ownedGeometry',()=>{
 assert.deepEqual(checkOwnedParts(),[]);const temp=mkdtempSync(join(tmpdir(),'bw-owned-materials-'));
 try{mkdirSync(join(temp,assets),{recursive:true});cpSync(join(root,assets),join(temp,assets),{recursive:true});mkdirSync(join(temp,'overlay/scratch-gui/src/lib/bw-sim/part-meta'),{recursive:true});cpSync(join(root,meta),join(temp,meta));assert.deepEqual(checkOwnedParts(temp),[]);
 const file=join(temp,assets,OWNED_PART_FILES[0]);writeFileSync(file,readFileSync(file,'utf8')+'0 changed\n');assert.ok(checkOwnedParts(temp).some(s=>s.includes('hash differs')));
 const db=JSON.parse(readFileSync(join(temp,meta)));db.parts[0].ownedGeometry=true;writeFileSync(join(temp,meta),JSON.stringify(db));assert.ok(checkOwnedParts(temp).some(s=>s.includes('owned metadata without locked geometry')));
 }finally{rmSync(temp,{recursive:true,force:true});}
});
