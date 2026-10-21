// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-pane.jsx',import.meta.url),'utf8');
const body=source.slice(source.indexOf('    drive (direction) {'),source.indexOf('    onDriveKey (event, down) {'));
const drive=new Function(`return ({${body}}).drive;`)();
test('holding Drive while Run is active reinstalls the clock after entering manual override',()=>{
 const queued=[],commands=[];let clock=true;
 const pane={session:{bridge:{}},spikeScene:()=>true,state:{status:'running',manualOverride:false,driveSpeed:25},
  setManualOverride(){clock=false;queued.push({manualOverride:true,status:'paused'});},
  startClock(){clock=true;},setState(next){queued.push(next);},
  hub:{setSimulationEnabled(){},movementPair:['A','B'],motors:{percentToDps:(_,p)=>p*2,stop:p=>commands.push([p,0]),runAtSpeed:(p,s)=>commands.push([p,s])}}};
 drive.call(pane,'forward');assert.equal(clock,true);assert.equal(pane.driving,'forward');
 assert.deepEqual(commands,[['A',-50],['B',50]]);
 assert.deepEqual(queued,[{manualOverride:true,status:'paused'},{status:'running'}]);
 drive.call(pane,'stop');assert.equal(pane.driving,null);assert.deepEqual(commands.slice(-2),[['A',0],['B',0]]);
});
