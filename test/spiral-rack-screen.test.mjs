// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {axisRotations, screenRack} from '../scripts/lib/spiral-rack-screen.mjs';
const reference = {connectors: [
 {id:'left',type:'pinhole',position:[-10,0,0],axis:[0,1,0]},
 {id:'right',type:'pinhole',position:[10,0,0],axis:[0,1,0]},
 {id:'t',type:'rack-teeth',position:[0,-5,0],axis:[1,0,0],length:20,data:{normal:[0,-1,0]}}
]};
test('rack screen checks both mounts, tooth orientation and full reference length', () => {
 assert.equal(axisRotations().length, 24);
 assert.ok(screenRack(reference, structuredClone(reference), ['left','right']).length > 0);
 const wrongSpacing = structuredClone(reference); wrongSpacing.connectors[1].position[0] = 11;
 assert.equal(screenRack(reference, wrongSpacing, ['left','right']).length, 0);
 const short = structuredClone(reference); short.connectors[2].length = 19;
 assert.equal(screenRack(reference, short, ['left','right']).length, 0);
 const flipped = structuredClone(reference); flipped.connectors[2].data.normal = [1,0,0];
 assert.equal(screenRack(reference, flipped, ['left','right']).length, 0);
 assert.throws(() => screenRack(reference, reference, ['missing']), /reference connector/);
});
