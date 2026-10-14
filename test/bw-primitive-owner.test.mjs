import test from 'node:test';
import assert from 'node:assert/strict';
import owner from '../overlay/scratch-vm/src/util/bw-primitive-owner.js';
const fixture=()=>{
    const blocks={a:{id:'a',opcode:'arcade_createCallable'},b:{id:'b',opcode:'arcade_createCallable'}};
    const args={NAME:'A'},siblingArgs={NAME:'B'},operation={id:'a',opcode:blocks.a.opcode,_argValues:args,_blockFunction:()=>0},sibling={id:'b',opcode:blocks.b.opcode,_argValues:siblingArgs};
    const container={getBlock:id=>blocks[id],_cache:{_executeCached:{root:{_ops:[operation,sibling]}}}};
    const target={blocks:container},thread={target,blockContainer:container,peekStack:()=> 'root'},runtime={targets:[target],threads:[thread],sequencer:{activeThread:thread},isActiveThread(value){return this.threads.includes(value);},getOpcodeFunction(){return operation._blockFunction;}};
    const util={runtime,thread,target};
    return {blocks,args,siblingArgs,operation,sibling,container,target,thread,runtime,util,invoke:fn=>owner.invoke(runtime,thread,container,operation,args,util,fn)};
};
test('primitive loan binds the actual operation and always clears after return or throw',()=>{
    const f=fixture();assert.equal(owner.current(f.util,f.args),null);
    assert.equal(f.invoke(()=>{assert.equal(owner.current(f.util,f.args),f.blocks.a);return 9;}),9);
    assert.equal(owner.current(f.util,f.args),null);
    assert.throws(()=>f.invoke(()=>{throw new Error('body');}),/body/);assert.equal(owner.current(f.util,f.args),null);
});
test('sibling cached args, cloned util and reentry cannot borrow current primitive authority',()=>{
    const f=fixture();f.invoke(()=>{
        assert.equal(owner.current(f.util,f.siblingArgs),null);assert.equal(owner.current({...f.util},f.args),null);
        assert.throws(()=>owner.invoke(f.runtime,f.thread,f.container,f.sibling,f.siblingArgs,f.util,()=>0),/reentered/);
    });
});
test('foreign container, retired caller and replacement block invalidate primitive authority',()=>{
    for(const change of [f=>{f.thread.blockContainer={};},f=>{f.runtime.threads=[];},f=>{f.blocks.a={...f.blocks.a};},f=>{f.operation._blockFunction=()=>1;},f=>{f.runtime.getOpcodeFunction=()=>()=>1;}]) {
        const f=fixture();f.invoke(()=>{change(f);assert.equal(owner.current(f.util,f.args),null);});
    }
    const f=fixture();f.runtime.sequencer.activeThread=null;assert.throws(()=>f.invoke(()=>0),/actual cached caller/);
});
