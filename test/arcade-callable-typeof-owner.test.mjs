import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import BW from '../overlay/scratch-vm/src/util/bw-values.js';
import CallableValues from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/callable-values.js';
import createTypeOf from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/source-typeof-values.js';
// These service controls model the declared procedure authority. Installed
// source/current Blocks ownership must pass its separate actual VM gate.
const fixture=()=>{
 const runtime=new EventEmitter();let body=true,names=[];
 const target={blocks:{_blocks:{body:{opcode:'procedures_definition',next:'return'}},getProcedureDefinition:()=>body?'body':null,getProcedureParamNamesIdsAndDefaults:()=>[names,[],[]]}};runtime.targets=[target];
 const owner=new CallableValues(runtime,BW);owner.declare(target,{procedure:'label',site:'label-site',parameters:[],captures:[]});owner.declare(target,{procedure:'action',site:'action-site',parameters:[],captures:[{name:'n',mode:'cell'}]});
 const cell={n:4},label=owner.create(target,'label'),action=owner.create(target,'action',{locals:cell});let current=owner,active=true;
 const classify=createTypeOf(runtime,BW,{current:()=>active&&current===owner,callable:value=>owner.typeOf(value)});
 classify.snapshotInputs();return {runtime,target,owner,cell,label,action,classify,setBody:value=>{body=value;},setNames:value=>{names=value;},replace:()=>{current={};},dispose:()=>{active=false;owner.dispose();}};
};
test('owned label and captured action retain selected PXT reflection without invoking',()=>{
 const f=fixture();try{assert.equal(f.classify(f.label),'function');assert.equal(f.classify(f.action),'object');assert.equal(f.classify(BW.decode(JSON.parse(JSON.stringify(f.action)))),'object');const count=f.owner.resources.size;for(let i=0;i<4;i++)assert.equal(f.classify(f.action),'object');assert.equal(f.cell.n,4);assert.equal(f.owner.resources.size,count);}finally{f.dispose();}
});
test('callable reflection refuses forged bodyless foreign removed and changed resources',()=>{
 const f=fixture();try{assert.throws(()=>f.classify(BW.reference(f.runtime,'callable','fake')),/body missing/);assert.throws(()=>f.classify(BW.reference(new EventEmitter(),'callable','fake')),/foreign or stale/);assert.throws(()=>f.classify({bwReference:{kind:'callable',id:'fake',scope:'fake'}}),/foreign or stale/);f.setBody(false);assert.throws(()=>f.classify(f.action),/body missing/);f.setBody(true);f.setNames(['changed']);assert.throws(()=>f.classify(f.action),/body missing/);}finally{f.dispose();}
});
test('replaced Stop and disposed owners cannot lend reflection authority',()=>{
 const replaced=fixture();try{replaced.replace();assert.throws(()=>replaced.classify(replaced.action),/native owner changed/);}finally{replaced.dispose();}
 const stopped=fixture();try{stopped.runtime.emit('PROJECT_STOP_ALL');assert.throws(()=>stopped.classify(stopped.action),/body missing/);}finally{stopped.dispose();}
 const disposed=fixture();disposed.dispose();assert.throws(()=>disposed.classify(disposed.action),/disposed/);
});
test('optional callable adapter cannot grant arbitrary classifications or text carriers',()=>{
 const f=fixture();try{const bad=createTypeOf(f.runtime,BW,{current:()=>true,callable:()=> 'madeup'});bad.snapshotInputs();assert.throws(()=>bad(f.action),/classification missing/);const closed=createTypeOf(f.runtime,BW,{current:()=>true});assert.throws(()=>closed(f.action),/unsupported reference owner callable/);assert.equal(f.classify(BW.encode('{"bwReference":{"kind":"callable"}}')),'string');assert.throws(()=>f.classify(()=>0),/unregistered object or function/);}finally{f.dispose();}
});

test('owned callable classification requires its exact initialized source graph',()=>{
 const f=fixture();try{const uninitialized=createTypeOf(f.runtime,BW,{current:()=>true,callable:value=>f.owner.typeOf(value)});assert.throws(()=>uninitialized(f.action),/graph changed or uninitialized/);
 const body=f.target.blocks._blocks.body;body.next='edited';assert.throws(()=>f.classify(f.action),/source graph changed/);body.next='return';assert.equal(f.classify(f.action),'object');
 f.target.blocks._blocks.body={...body};assert.throws(()=>f.classify(f.action),/source graph changed/);f.target.blocks._blocks.body=body;
 const foreign={blocks:{_blocks:{}}};f.runtime.targets.push(foreign);assert.throws(()=>f.classify(f.action),/source graph changed/);f.runtime.targets.pop();assert.equal(f.classify(f.action),'object');
 }finally{f.dispose();}
});
