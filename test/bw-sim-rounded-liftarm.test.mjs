// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {catalogFrom} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';import {flattenPart} from '../overlay/scratch-gui/src/lib/bw-sim/ldraw/ldraw-geometry.js';
const C=catalogFrom(JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json',import.meta.url)))),read=p=>{try{return readFileSync(new URL('../overlay/scratch-gui/static/ldraw/'+p,import.meta.url),'latin1');}catch{return undefined;}};
test('the 7L liftarm collider follows its actual rounded ends and encloses the official mesh',()=>{
 const mesh=flattenPart('32524.dat',read);assert.deepEqual(mesh.missing,[]);let count=0;
 for(const poly of mesh.polys)for(const [x,y,z]of poly){assert.ok(Math.abs(y)<=10.15,'actual beam thickness');const beyond=Math.max(0,Math.abs(z)-60);assert.ok(Math.hypot(x,beyond)<=9.15,'actual rounded beam envelope');count++;}assert.ok(count>100);
 const c=C.get('32524.dat').colliders;assert.equal(c.length,3);assert.ok(c.some(s=>s.shape==='box'&&s.halfExtents[2]===60));assert.deepEqual(c.filter(s=>s.shape==='cylinder').map(s=>s.position[2]),[-60,60]);
});
test('rounded-end corner clearance preserves central and end collisions',()=>{
 const I=[1,0,0,0,1,0,0,0,1],probe={part:'probe.dat',name:'probe',massGrams:1,connectors:[],colliders:[{shape:'box',halfExtents:[1,1,1]}]},catalog=new Map([...C,['probe.dat',probe]]),beam={id:'beam',part:'32524.dat',position:[0,0,0],rotation:I};
 const hits=position=>{const a={id:'probe',part:'probe.dat',position,rotation:I};return solidOverlaps({parts:[beam,a]},catalog,a);};
 assert.deepEqual(hits([8,0,68]),[],'empty square corner is not beam material');assert.ok(hits([0,0,65]).length,'rounded end remains solid');assert.ok(hits([8,0,0]).length,'straight side remains solid');
 const old=new Map(catalog);old.set('32524.dat',{...C.get('32524.dat'),colliders:[{shape:'box',halfExtents:[9,10,69]}]});const a={id:'probe',part:'probe.dat',position:[8,0,68],rotation:I};assert.ok(solidOverlaps({parts:[beam,a]},old,a).length,'old rectangular end falsely occupies the empty corner');
});
