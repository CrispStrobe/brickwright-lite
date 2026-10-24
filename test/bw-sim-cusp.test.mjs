// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runRobotLabProgram} from './helpers/robot-lab-direct-vm.mjs';
import {judgeCusp} from '../scripts/lib/sim-lab-cusp-judge.mjs';
const read=p=>readFileSync(new URL('../overlay/scratch-gui/static/sim-lab/'+p,import.meta.url),'utf8');
for(const autoPorts of [undefined,false])test(`Cusp ${autoPorts===false?'strict':'ordinary'}: actual cusp, backtracking and loop in both directions`,async()=>{
 const r=await runRobotLabProgram(read('programs/cusp-lab.bw'),{modelText:read('models/cusp-lab.ldr'),timeLimitMs:80000,autoPorts});
 const summary=judgeCusp(r);console.log(JSON.stringify(summary));
 const frozen=structuredClone(r),body=frozen.mechanism.bodies.find(b=>b.parts.includes('marker_r20'));
 for(const f of frozen.track)f.bodies[body.id]=structuredClone(frozen.track[0].bodies[body.id]);
 assert.throws(()=>judgeCusp(frozen),'Identical useful-motion judge rejects frozen markers');
});
