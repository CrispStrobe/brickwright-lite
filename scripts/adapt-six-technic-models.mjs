#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),ids=['rod-ratio','vernier-drive','line-turner','dune-strider','atlas-six','oblique'];
export function adaptedTechnicModel(id){
 assert.ok(ids.includes(id));
 const fixture=new URL('test/fixtures/model-files/'+id+'-source/',root),file='models/'+id+'.ldr';
 const original=readFileSync(new URL(file,fixture)),provenance=JSON.parse(readFileSync(new URL('provenance.json',fixture)));
 assert.equal(createHash('sha256').update(original).digest('hex'),provenance.files[file]);
 let source=original.toString().replace('see ../LICENSE.txt','see ../licenses/'+id+'.txt').replace('see ../LICENSE','see ../licenses/'+id+'.txt');
 if(id==='rod-ratio')for(const x of [100,300])for(const y of [60,80]){
  const old=`0 !BW ID long_post_pin_${x}_${y}\n1 1 ${x} ${y} 185 0 1 0 0 0 1 1 0 0 6558.dat`;
  assert.ok(source.includes(old));source=source.replace(old,old.replace(`${x} ${y} 185`,`${x} ${y} 190`));
 }
 if(id==='oblique'){
  const old='1 72 -160 -280 -120 0 0 1 0 1 0 -1 0 0 32524.dat';assert.ok(source.includes(old));
  source=source.replace(old,'1 72 -170 -275 -120 0 0 1 0 1 0 -1 0 0 32063.dat');
 }
 return source;
}
if(process.argv[1]===fileURLToPath(import.meta.url))for(const id of ids){
 const file=new URL('overlay/scratch-gui/static/sim-lab/models/'+id+'.ldr',root),source=adaptedTechnicModel(id);
 if(process.argv.includes('--check'))assert.equal(readFileSync(file,'utf8'),source,id);else writeFileSync(file,source);
 console.log(id+': exact source adaptation verified');
}
