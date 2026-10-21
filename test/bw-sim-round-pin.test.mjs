// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';
import {collidersOf,primitivesOverlap} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
import {flattenPart} from '../overlay/scratch-gui/src/lib/bw-sim/ldraw/ldraw-geometry.js';
const root=new URL('../overlay/scratch-gui/',import.meta.url);
const meta=JSON.parse(readFileSync(new URL('src/lib/bw-sim/part-meta/parts.json',root))).parts.find(p=>p.part==='3673.dat');
const read=p=>{const f=new URL('static/ldraw/'+p.toLowerCase(),root);return existsSync(f)?readFileSync(f,'latin1'):undefined;};
test('round pin: official geometry fits an X-axis cylinder without square corners',()=>{
 const flat=flattenPart('3673.dat',read);assert.deepEqual(flat.missing,[]);
 const points=flat.polys.flat();assert.ok(points.length>100);
 assert.ok(Math.max(...points.map(v=>Math.abs(v[0])))<=20.01);
 assert.ok(Math.max(...points.map(v=>Math.hypot(v[1],v[2])))<=8.01);
 assert.equal(meta.colliders[0].shape,'cylinder');assert.equal(meta.colliders[0].radius,8);
});
test('round pin: a supported hinge can rotate next to a beam without phantom square-corner jamming',()=>{
 const beam=collidersOf({position:[340,-80,0],rotation:[0,0,1,0,1,0,-1,0,0]},{colliders:[{shape:'box',halfExtents:[9,10,149]}]})[0];
 const old={colliders:[{shape:'box',halfExtents:[20,7.8,8]}]};
 let oldHits=0;
 for(let i=0;i<360;i+=5){
  const a=i*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  // X-axis pin aimed along Z; rotate its cross section around that hinge line.
  const part={position:[340,-100,10],rotation:[0,-s,-c,0,c,-s,1,0,0]};
  assert.equal(primitivesOverlap(collidersOf(part,meta)[0],beam,.5),false);
  if(primitivesOverlap(collidersOf(part,old)[0],beam,.5))oldHits++;
 }
 assert.ok(oldHits>10,'negative control: the old box introduces fake contacts');
});
