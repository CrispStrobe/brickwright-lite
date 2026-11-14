// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {readOutputPose, observeTerminal, programCompletion, PROGRAM_OUTPUT_CONTRACTS} from '../scripts/lib/robot-lab-program-completion.mjs';
const contract=PROGRAM_OUTPUT_CONTRACTS['toggle-lever'];
const valid=()=>({execution:'COMPLETED',terminalObservation:{sawZero:true,sawTransition:true},programVariables:{completed:1,stage:4},motors:{A:{commanded:true,moved:true}},outputMeasurement:{samples:3,invalid:false,travelM:0.02,homeErrorM:0.0001},messages:['ToggleLever complete: compare the passive lever arc with the link closure.'],failures:[]});
test('requires actual zero-to-one terminal transition and final terminal value',()=>{const state={};observeTerminal(state,{completed:1},'completed');assert.equal(state.sawTransition,undefined);observeTerminal(state,{completed:0},'completed');observeTerminal(state,{completed:1},'completed');assert.equal(state.sawTransition,true);const r=valid();r.programVariables.completed=0;assert.equal(programCompletion(r,contract).status,'PARTIAL');});
test('completed program, primary drive and real passive output are jointly required',()=>{assert.equal(programCompletion(valid(),contract).status,'COMPLETE');for(const mutate of [r=>r.execution='BOUNDED_PARTIAL',r=>r.outputMeasurement.travelM=0,r=>r.outputMeasurement.invalid=true,r=>r.motors={},r=>r.messages=[],r=>r.terminalObservation.sawTransition=false]){const r=valid();mutate(r);assert.equal(programCompletion(r,contract).status,'PARTIAL');}});
test('motor diagnostic, error and unreviewed output can never complete',()=>{const r=valid();r.failures=['program-fault-flag'];assert.equal(programCompletion(r,contract).status,'FAIL');assert.equal(programCompletion(valid(),null).status,'PARTIAL');});

test('PointWeaver observes authored endpoint origin relative to its base, not rotating off-axis tip',()=>{
    const requested=[];const poses={endpoint_marker:{ok:true,position:[0.07,0.02,-0.014],quat:[0,0,0,1]},'base_cross_-40':{ok:true,position:[0.01,0,0.02],quat:[0,0,0,1]},endpoint_marker_tip:{ok:true,position:[0.078,0.024,-0.014],quat:[0,0,0,1]}};
    const api={pose:id=>{requested.push(id);return poses[id];}},c=PROGRAM_OUTPUT_CONTRACTS.pointweaver;
    const first=readOutputPose(api,c);poses.endpoint_marker_tip.position=[0.062,0.024,-0.014];
    assert.deepEqual(readOutputPose(api,c),first);assert.deepEqual(requested,['endpoint_marker','base_cross_-40','endpoint_marker','base_cross_-40']);
    assert.deepEqual(first.position,poses.endpoint_marker.position.map((v,i)=>v-poses['base_cross_-40'].position[i]));
    poses.endpoint_marker.position[0]=NaN;assert.equal(readOutputPose(api,c),null);
});
