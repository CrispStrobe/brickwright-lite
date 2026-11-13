// SPDX-License-Identifier: BSD-3-Clause
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarize} from '../scripts/robot-lab-e1-contact-summary.mjs';
const body=(id,native,part)=>({id,native,parts:[part],motion:'dynamic',edge:true});
const base=()=>({schema:'e1.capture.v1',issues:[],finishedAt:10,bodies:[body('b0',1,'backing_left_0_0'),body('b1',2,'left_shaft_-1'),body('b2',3,'right_shaft_-1')],contacts:[{a:'b0',b:'b1',step:0,normal:[0,1,0]},{a:'b2',b:'b0',step:1,normal:[0,1,0]}]});
test('reports both callback orientations without inferring native order',()=>{const r=summarize(base());assert.equal(r.lanes[0].frameFirst,1);assert.equal(r.lanes[1].frameFirst,0);assert.match(r.boundary,/require separate verification/);});
test('refuses missing contacts, missing bodies and nonfinite normals',()=>{let x=base();x.contacts.pop();assert.throws(()=>summarize(x),/missing roller-frame/);x=base();x.bodies.pop();assert.throws(()=>summarize(x),/missing distinct/);x=base();x.contacts[0].normal[0]=NaN;assert.throws(()=>summarize(x),/invalid contact/);});
