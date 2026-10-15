import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram,clearStrayTimers} from './helpers/bw-vm.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
const dispatch=(await importGuiDependency('scratch-vm/src/dispatch/central-dispatch.js')).default;
const source='function make(initial:number):()=>number{let n=initial;return()=>{n+=1;return n}}let first=make(2);let alias=first;let second=make(2);let a=first();let b=alias();let c=second();';
test('installed callable reflection uses current owned action without changing its cell or source gate',async()=>{
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:20});
 try{assert.deepEqual(run.errors,[]);const native=Object.values(dispatch.services).find(row=>row?._inst?._runtime===run.vm.runtime&&row._inst._callableValues)?._inst;assert.ok(native);
 const variables=run.vm.runtime.targets.flatMap(t=>Object.values(t.variables));const read=name=>variables.find(v=>v.name===name).value;
 assert.equal(read('first'),read('alias'));const resource=native._callableValues.resource(read('first'));const before=JSON.stringify(resource.captures);
 assert.equal(native._sourceTypeOf(read('first')),'object');assert.equal(native._sourceTypeOf(read('second')),'object');assert.equal(JSON.stringify(resource.captures),before);assert.deepEqual(['a','b','c'].map(read),[3,4,3]);
 const target=resource.target,definition=target.blocks.getBlock(target.blocks.getProcedureDefinition(resource.definition.procedure));const old=definition.next;definition.next=null;assert.throws(()=>native._sourceTypeOf(read('first')),/source graph changed/);definition.next=old;
 const owner=native._callableValues;native._callableValues={};assert.throws(()=>native._sourceTypeOf(read('first')),/native owner changed/);native._callableValues=owner;
 run.vm.stopAll();assert.throws(()=>native._sourceTypeOf(read('first')),/body missing or stale/);
 assert.ok(arcadeToPseudocode(source+'let reflected=typeof first;').unsupported.length,'source operand remains closed until independently qualified');
 }finally{run.vm.stopAll();run.vm.quit();clearStrayTimers();}
});
