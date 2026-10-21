// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseLDConfig} from '../overlay/scratch-gui/src/lib/bw-sim/view/ldraw-colors.js';
import {partVisual,_clearCache} from '../overlay/scratch-gui/src/lib/bw-sim/view/part-geometry.js';
test('direct RGB print colours stay fixed instead of inheriting the glass placement colour',()=>{
 const colors=parseLDConfig('0 !COLOUR Trans_Clear CODE 47 VALUE #FFFFFF EDGE #333333 ALPHA 128');assert.equal(colors.get(47).alpha,128/255);assert.ok(colors.has(0x2345a69));assert.equal(colors.get(0x2345a69).value,'#345a69');assert.equal(colors.has(0x1000000),false);
 _clearCache();const v=partVisual('direct-colour-test.dat',p=>p.endsWith('direct-colour-test.dat')?'0 BFC CERTIFY CCW\n3 0x2345A69 0 0 0 10 0 0 0 0 10\n3 16 20 0 0 30 0 0 20 0 10\n':undefined,colors);
 assert.deepEqual(v.faces.groups.map(g=>[g.materialIndex,g.count]),[[0,3],[1,3]]);const a=v.faces.attributes.color.array;assert.ok(a[9]<a[10]&&a[10]<a[11],'dark blue print keeps its measured RGB order');assert.deepEqual(Array.from(a.slice(0,3)),[1,1,1],'unprinted glass still inherits its placed colour');_clearCache();
});
