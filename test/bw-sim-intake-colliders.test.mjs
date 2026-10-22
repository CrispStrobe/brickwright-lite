// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {derivePart,libReader} from '../scripts/derive-part-meta.mjs';
import {flattenPart} from '../overlay/scratch-gui/src/lib/bw-sim/ldraw/ldraw-geometry.js';
import {colliderFit} from '../overlay/scratch-gui/src/lib/bw-sim/part-meta/derive.js';
const root=new URL('../overlay/scratch-gui/',import.meta.url),read=libReader(new URL('static/ldraw',root).pathname);
const parts=JSON.parse(readFileSync(new URL('src/lib/bw-sim/part-meta/parts.json',root))).parts;
for(const id of ['32291.dat','63869.dat'])test(`${id}: cross-block collider correction reproduces from official mesh`,()=>{
 const derived=derivePart(id,read);assert.deepEqual(derived.problems,[]);
 const actual=parts.find(p=>p.part===id);assert.deepEqual(actual.colliders,derived.meta.colliders,'Regeneration must preserve the correction');
 const boss=actual.colliders.find(c=>c.shape==='cylinder');assert.ok(boss);
 assert.equal(boss.radius,9);assert.equal(boss.halfHeight,10,'Retain the full axle boss length');
 const flat=flattenPart(id,read);
 const fit=colliderFit(actual.colliders,flat.polys.flat());
 console.log(id,fit);assert.ok(fit.enclosed>=.95,`Actual mesh coverage ${fit.enclosed}`);
});
