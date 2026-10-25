import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const FramePhase=require(process.env.BW_SOURCE_PRESENCE_FRAME_MODULE || '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/frame-phase.js');
const target=table=>({blocks:{_blocks:table}});
function fixture(table={hat:{opcode:'arcade_whenSourceStarts'}}){
    const runtime=new EventEmitter();runtime.targets=[target(table)];let updates=false,updateReads=0;
    const ext={getInfo:()=>({blocks:[{opcode:'callback',blockType:'hat'}]}),_sdkSpriteUpdates:{hasSceneUpdates(){updateReads++;return updates;}}};
    const phase=new FramePhase(runtime,ext);runtime._arcadeFramePhase=phase;
    return{runtime,phase,ext,table,setUpdates:value=>{updates=value;},updateReads:()=>updateReads,close:()=>phase.detach()};
}
function census(tables,work){
    let calls=0;const descriptors=new Map();
    try{for(const name of ['values','entries']){const descriptor=Object.getOwnPropertyDescriptor(Object,name);descriptors.set(name,descriptor);Object.defineProperty(Object,name,{...descriptor,value:function(...args){if(tables.includes(args[0]))calls++;return Reflect.apply(descriptor.value,this,args);}});}return work(()=>calls);}
    finally{for(const[name,descriptor]of descriptors)Object.defineProperty(Object,name,descriptor);}
}
test('positive current witness avoids repeated full census for all three original predicate forms',()=>{
    for(const opcode of ['arcade_sourceWhile','arcade_whenSourceStarts','arcade_callback']){
        const f=fixture({hat:{opcode}});try{census([f.table],count=>{for(let i=0;i<100;i++)assert.equal(f.phase.hasSourceProject(),true);assert.equal(count(),1,'original full census must fail this cost control');assert.equal(f.updateReads(),100,'scene updates still checked on every read');});}finally{f.close();}
    }
});
test('false is never cached and a newly added source hat is immediately detected',()=>{
    const f=fixture({ordinary:{opcode:'looks_show'}});try{census([f.table],count=>{assert.equal(f.phase.hasSourceProject(),false);assert.equal(f.phase.hasSourceProject(),false);f.table.newHat={opcode:'arcade_whenSourceStarts'};assert.equal(f.phase.hasSourceProject(),true);assert.equal(f.phase.hasSourceProject(),true);assert.equal(count(),3);});}finally{f.close();}
});
test('direct deletion invalidates witness and finds another actual qualifying entry',()=>{
    const f=fixture({first:{opcode:'arcade_sourceWhile'},second:{opcode:'arcade_whenSourceStarts'}});try{assert.equal(f.phase.hasSourceProject(),true);delete f.table.first;assert.equal(f.phase.hasSourceProject(),true);delete f.table.second;assert.equal(f.phase.hasSourceProject(),false);}finally{f.close();}
});
test('same ID replacement and current opcode changes cannot retain stale true',()=>{
    const f=fixture();try{assert.equal(f.phase.hasSourceProject(),true);f.table.hat={opcode:'looks_show'};assert.equal(f.phase.hasSourceProject(),false);f.table.hat.opcode='arcade_sourceWhile';assert.equal(f.phase.hasSourceProject(),true);f.table.hat.opcode='looks_show';assert.equal(f.phase.hasSourceProject(),false);}finally{f.close();}
});
test('replacing the Blocks object or its dictionary requires the actual current graph',()=>{
    const f=fixture();try{const owner=f.runtime.targets[0],old=owner.blocks;assert.equal(f.phase.hasSourceProject(),true);owner.blocks={_blocks:{}};assert.equal(f.phase.hasSourceProject(),false);owner.blocks=old;assert.equal(f.phase.hasSourceProject(),true);old._blocks={hat:{opcode:'looks_show'}};assert.equal(f.phase.hasSourceProject(),false);old._blocks.hat.opcode='arcade_whenSourceStarts';assert.equal(f.phase.hasSourceProject(),true);}finally{f.close();}
});
test('removed/replaced target and actual block movement invalidate target ownership',()=>{
    const f=fixture();try{const old=f.runtime.targets[0],block=f.table.hat;assert.equal(f.phase.hasSourceProject(),true);f.runtime.targets=[target({})];assert.equal(f.phase.hasSourceProject(),false);f.runtime.targets.push(old);assert.equal(f.phase.hasSourceProject(),true);delete f.table.hat;f.runtime.targets[0].blocks._blocks.moved=block;assert.equal(f.phase.hasSourceProject(),true);f.runtime.targets.shift();assert.equal(f.phase.hasSourceProject(),false);}finally{f.close();}
});
test('current own enumerable data membership is required, inherited/nonenumerable entries do not qualify',()=>{
    const f=fixture();try{const block=f.table.hat;assert.equal(f.phase.hasSourceProject(),true);Object.defineProperty(f.table,'hat',{value:block,enumerable:false,configurable:true});assert.equal(f.phase.hasSourceProject(),false);delete f.table.hat;Object.setPrototypeOf(f.table,{hat:block});assert.equal(f.phase.hasSourceProject(),false);Object.defineProperty(f.table,'hat',{value:block,enumerable:true,configurable:true});assert.equal(f.phase.hasSourceProject(),true);}finally{f.close();}
});
test('opcode accessor and inherited opcode remain ordinary uncached fallback observations',()=>{
    for(const block of [Object.defineProperty({},'opcode',{get:()=> 'arcade_sourceWhile',enumerable:true}),Object.create({opcode:'arcade_whenSourceStarts'})]){
        const f=fixture({hat:block});try{census([f.table],count=>{assert.equal(f.phase.hasSourceProject(),true);assert.equal(f.phase.hasSourceProject(),true);assert.equal(count(),2);});}finally{f.close();}
    }
});
test('an own entry accessor is never cached as a data witness',()=>{
    const block={opcode:'arcade_sourceWhile'},table={};Object.defineProperty(table,'hat',{get:()=>block,enumerable:true});const f=fixture(table);try{census([table],count=>{assert.equal(f.phase.hasSourceProject(),true);assert.equal(f.phase.hasSourceProject(),true);assert.equal(count(),2);});}finally{f.close();}
});
test('native callback membership is checked currently and false-to-new callback is visible',()=>{
    const f=fixture({hat:{opcode:'arcade_callback'}});try{assert.equal(f.phase.hasSourceProject(),true);f.phase.nativeCallbackOpcodes.delete('arcade_callback');assert.equal(f.phase.hasSourceProject(),false);f.phase.nativeCallbackOpcodes.add('arcade_callback');assert.equal(f.phase.hasSourceProject(),true);f.phase.nativeCallbackOpcodes=new Set(['arcade_new']);assert.equal(f.phase.hasSourceProject(),false);f.table.hat.opcode='arcade_new';assert.equal(f.phase.hasSourceProject(),true);}finally{f.close();}
});
test('scene updates retain first priority on every read and disposal precedes it',()=>{
    const f=fixture({});try{f.setUpdates(true);census([f.table],count=>{assert.equal(f.phase.hasSourceProject(),true);assert.equal(f.phase.hasSourceProject(),true);assert.equal(count(),0);});f.setUpdates(false);assert.equal(f.phase.hasSourceProject(),false);assert.equal(f.updateReads(),3);f.phase.dispose();assert.equal(f.phase.hasSourceProject(),false);assert.equal(f.updateReads(),3);}finally{f.close();}
});
test('existing start/stop/load/dispose lifecycle invalidates witness without changing generation behavior',()=>{
    const f=fixture();try{census([f.table],count=>{assert.equal(f.phase.hasSourceProject(),true);let generation=f.phase.generation;for(const event of ['PROJECT_START','PROJECT_STOP_ALL','PROJECT_LOADED']){f.runtime.emit(event);assert.equal(f.phase.generation,++generation);assert.equal(f.phase.hasSourceProject(),true);}assert.equal(count(),4);f.runtime.emit('RUNTIME_DISPOSED');assert.equal(f.phase.hasSourceProject(),false);f.runtime.emit('PROJECT_LOADED');assert.equal(f.phase.disposed,false);assert.equal(f.phase.hasSourceProject(),true);assert.equal(count(),5);});}finally{f.close();}
});
