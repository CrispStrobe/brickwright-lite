// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';import assert from 'node:assert/strict';
import {mirrorPairs} from '../overlay/scratch-gui/src/lib/bw-sim/instructions/steps.js';
const rotation=[1,0,0,0,1,0,0,0,1],catalog=new Map([['test.dat',{part:'test.dat',category:'beam',massGrams:1,colliders:[],connectors:[{type:'pin-hole',position:[0,0,0],axis:[0,1,0],length:20}]}]]);
const part=(id,x,z,color=4)=>({id,part:'test.dat',color,position:[x,0,z],rotation});
test('mirror lookup crosses positive and negative grid boundaries and keeps original-order ties',()=>{
 const model={version:1,parts:[part('left',-.99,0),part('first',1.01,0),part('later',1.02,0),part('left2',-10.99,20),part('right2',11.01,20),part('left3',-20.99,70),part('right3',21.01,70)]};
 const pairs=mirrorPairs(model,catalog,new Map());assert.equal(pairs.get('left'),'first');assert.equal(pairs.get('left2'),'right2');assert.equal(pairs.get('left3'),'right3');assert.equal(pairs.has('later'),false);
 const changed=structuredClone(model);changed.parts.find(p=>p.id==='right2').color=1;assert.equal(mirrorPairs(changed,catalog,new Map()).has('left2'),false,'nearby parts with a different colour do not match');
});
