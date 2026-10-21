// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {catalogFrom,prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
import {buildSteps} from '../overlay/scratch-gui/src/lib/bw-sim/instructions/steps.js';
import {runRobotLabProgram} from './helpers/robot-lab-direct-vm.mjs';import {judgeMagneticChess} from '../scripts/lib/sim-lab-magnetic-chess-judge.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'),base='overlay/scratch-gui/static/sim-lab/',source=read(base+'models/magnetic-chess.ldr'),db=JSON.parse(read('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json')),C=catalogFrom(db);
test('Magnetic Chess: connected dynamic board, 32 independent pieces, real guides, three motors and complete material BOM',()=>{
 const p=prepareModel(source,C,{mat:'plain'});assert.equal(p.model.parts.length,1208);assert.ok(p.issues.every(i=>i.code==='locked-hinges'));assert.equal(p.model.decor?.length||0,0);assert.deepEqual(p.mechanism.actuators.map(a=>a.port).sort(),['A','B','C']);
 const board=p.mechanism.bodies.find(b=>b.parts.includes('custom_glass_insert'));assert.equal(board.motion,'dynamic');assert.ok(board.parts.includes('board_gasket_00')&&board.parts.includes('board_glass_seat_-1_-1'),'actual bonded interfaces join the support');
 assert.equal(p.mechanism.couplings.filter(c=>c.kind==='magneticField').length,32);assert.equal(p.mechanism.couplings.filter(c=>c.kind==='rackAndPinion').length,2);
 Object.freeze(p.model.parts);
 for(const part of p.model.parts)assert.deepEqual(solidOverlaps(p.model,C,part),[],part.id);
 const plan=buildSteps(p.model,C);assert.equal(plan.steps.flatMap(s=>s.parts).length,1208);assert.ok(plan.steps.every(s=>s.parts.length<=6));const payloads=new Set(p.model.parts.filter(p=>p.load).map(p=>p.id));for(const step of plan.steps)if(step.loose)assert.ok(step.parts.every(id=>payloads.has(id)),'only an explicitly independent chess piece starts a placement step');
});
for(const id of ['magnetic-chess','magnetic-chess-capture'])test(`${id}: native motors transport and release independent pieces while all other squares stay put`,async()=>{
 const r=await runRobotLabProgram(read(base+'programs/'+id+'.bw'),{modelText:source,timeLimitMs:id.endsWith('capture')?330000:90000});assert.ok(r.finishedAt>10000&&r.finishedAt<(id.endsWith('capture')?330000:90000));judgeMagneticChess(id,r);
 const frozen=structuredClone(r),piece=r.mechanism.bodies.find(b=>b.parts.includes('w_knight_g1_base')).id;for(const f of frozen.track)f.bodies[piece]=structuredClone(frozen.track[0].bodies[piece]);assert.throws(()=>judgeMagneticChess(id,frozen),'native encoders cannot qualify an unmoving piece');
});
test('without a magnetic field the same native knight commands cannot transport a piece',async()=>{
 const negative=structuredClone(db),head=negative.parts.find(p=>p.part==='2609dc01.dat');head.connectors.find(c=>c.type==='magnet-face').data.field={referenceForceN:0};
 const r=await runRobotLabProgram(read(base+'programs/magnetic-chess.bw'),{modelText:source,catalog:catalogFrom(negative),timeLimitMs:90000});assert.ok(r.finishedAt);assert.throws(()=>judgeMagneticChess('magnetic-chess',r));
 const b=r.mechanism.bodies.find(b=>b.parts.includes('w_knight_g1_base')),start=r.track[0].bodies[b.id].position,end=r.track.at(-1).bodies[b.id].position;assert.ok(Math.hypot(...end.map((v,k)=>v-start[k]))<.0005,'zero field leaves the knight on its original square');
});
