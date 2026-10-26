// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalogFrom,prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {structuralCouplingLinks} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
const catalog=catalogFrom(JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json',import.meta.url))));
const source=readFileSync(new URL('../overlay/scratch-gui/static/sim-lab/models/phasekeeper.ldr',import.meta.url),'utf8');
const without=(source,ids)=>source.split(/(?=^0 !BW ID )/m).filter(b=>!ids.some(id=>b.startsWith('0 !BW ID '+id+'\n'))).join('');
const prepare=text=>prepareModel(text,catalog,{autoPorts:false});
const loose=p=>p.issues.filter(i=>i.code==='loose-part').flatMap(i=>i.parts);
const single=without(source,['joint_2_intermediate_yoke','joint_2_output_yoke']);
for(const [name,text,count] of [['single Cardan',single,1],['double Cardan',source,2]])test(`${name}: real universal joints retain the intermediate shaft`,()=>{
 const p=prepare(text);assert.equal(p.mechanism.couplings.filter(c=>c.kind==='universalJoint').length,count);
 assert.ok(!loose(p).includes('intermediate_axle'),'The real fork constraint retains the shaft');
});
test('removing a fork from the single Cardan restores the detached-shaft diagnostic',()=>{
 const p=prepare(without(single,['joint_1_input_yoke']));
 assert.equal(p.mechanism.couplings.filter(c=>c.kind==='universalJoint').length,0);
 assert.ok(loose(p).includes('intermediate_axle'));
});
test('unplugging both ends of a double Cardan restores the loose intermediate assembly',()=>{
 const p=prepare(without(source,['joint_1_input_yoke','joint_2_output_yoke']));
 assert.ok(loose(p).includes('intermediate_axle'));
});
test('a physically unrelated part remains loose beside a connected Cardan assembly',()=>{
 const p=prepare(source+'0 !BW ID disconnected_brick\n1 71 1000 1000 1000 1 0 0 0 1 0 0 0 1 3001.dat\n');
 assert.ok(loose(p).includes('disconnected_brick'));assert.ok(!loose(p).includes('intermediate_axle'));
});

test('angle-only gear, chain and band relations grant no structural support',()=>{
 assert.deepEqual(structuralCouplingLinks(['gear','relativeGear','chain','band','worm'].map(kind=>({kind,body1:'frame',body2:'unsupported'}))),[]);
 assert.deepEqual(structuralCouplingLinks([{kind:'universalJoint',body1:'input',body2:'shaft'},{kind:'rope',points:[{body:'drum'}],hook:{body:'load'}}]),[{type:'universalJoint',body1:'input',body2:'shaft'},{type:'rope',body1:'drum',body2:'load'}]);
});
