// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {axisRotations, screenRack, screenMountRedesign} from '../scripts/lib/spiral-rack-screen.mjs';
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

test('screen allows a rigidly shifted catalog origin but rejects displaced tooth contact', () => {
 const shifted = structuredClone(reference);
 for (const c of shifted.connectors) c.position = c.position.map((v, i) => v + [40,7,-3][i]);
 assert.ok(screenRack(reference, shifted, ['left','right']).some(x =>
  x.translation.some(v => Math.abs(v) > 0)), 'catalog origin is not assumed to be the model origin');
 const invalid = structuredClone(reference);
 invalid.connectors[2].position[1] = -6;
 assert.equal(screenRack(reference, invalid, ['left','right']).length, 0, 'tooth contact must also coincide');
});


test('redesign distances retain tooth alignment and report missing connector types', () => {
 const moved = structuredClone(reference); moved.connectors[1].position[0] += 3;
 const options = screenMountRedesign(reference, moved, ['left','right']);
 assert.ok(options.length > 0);
 assert.ok(options.some(x => x.distances[0].nearestLdu === 0 && x.distances[1].nearestLdu === 3));
 const missing = structuredClone(reference); missing.connectors = missing.connectors.filter(c => c.type !== 'pinhole');
 assert.ok(screenMountRedesign(reference, missing, ['left']).every(x => x.distances[0].nearestLdu === null));
 const short = structuredClone(reference); short.connectors[2].length = 19;
 assert.equal(screenMountRedesign(reference, short, ['left']).length, 0);
});
