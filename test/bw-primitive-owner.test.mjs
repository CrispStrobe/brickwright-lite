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
test('object field read loan requires its exact actual operation and clears immediately',()=>{
    const f=fixture();f.blocks.a.opcode=f.operation.opcode='arcade_objectField';
    f.args.OBJECT='actual-reference';f.args.FIELD='state';
    f.invoke(()=>{assert.equal(owner.current(f.util,f.args),f.blocks.a);
        assert.equal(owner.current(f.util,{...f.args}),null);
        assert.equal(owner.current(f.util,f.siblingArgs),null);
        f.thread.isKilled=true;assert.equal(owner.current(f.util,f.args),null);
    });
    assert.equal(owner.current(f.util,f.args),null);
    const unrelated=fixture();unrelated.blocks.a.opcode=unrelated.operation.opcode='arcade_fontValue';
    assert.throws(()=>unrelated.invoke(()=>0),/actual cached caller/);
});
const nestedFixture=()=>{
    const f=fixture(),childArgs={VALUE:3},childBlock={id:'child',opcode:'arcade_setLocal'},fn=()=>0;
    const operation={id:'child',opcode:childBlock.opcode,_argValues:childArgs,_blockFunction:fn};
    const container={getBlock:id=>id==='child'?childBlock:null,_cache:{_executeCached:{child:{_ops:[operation]}}}};
    const target={blocks:container},child={target,blockContainer:container,peekStack:()=> 'child',status:0};
    f.runtime.targets.push(target);f.runtime.threads.push(child);f.util.sequencer=f.runtime.sequencer;
    const originalOpcode=f.runtime.getOpcodeFunction;f.runtime.getOpcodeFunction=opcode=>opcode===childBlock.opcode?fn:originalOpcode();
    return {...f,child,childArgs,childBlock,childOperation:operation,childContainer:container};
};
test('nested VM step owns only the actual child primitive and restores the outer caller',()=>{
    const f=nestedFixture();let steps=0;
    f.runtime.sequencer.stepThread=child=>{
        steps++;assert.equal(child,f.child);assert.equal(f.runtime.sequencer.activeThread,child);
        f.util.thread=child;
        assert.equal(owner.current(f.util,f.args),null);
        owner.invoke(f.runtime,child,f.childContainer,f.childOperation,f.childArgs,f.util,()=>assert.equal(owner.current(f.util,f.childArgs),f.childBlock));
    };
    f.invoke(()=>{owner.stepNested(f.util,f.args,f.child);assert.equal(owner.current(f.util,f.args),f.blocks.a);assert.equal(f.util.thread,f.thread);assert.equal(f.runtime.sequencer.activeThread,f.thread);});
    assert.equal(steps,1);assert.equal(owner.current(f.util,f.args),null);
});
test('nested VM step rejects copied authority, same thread and dead or foreign children before stepping',()=>{
    for(const change of [f=>[f.util,{...f.args},f.child],f=>[{...f.util},f.args,f.child],f=>[f.util,f.args,f.thread],f=>{f.child.isKilled=true;return[f.util,f.args,f.child];},f=>{f.runtime.threads.pop();return[f.util,f.args,f.child];},f=>{f.child.blockContainer={};return[f.util,f.args,f.child];},f=>{f.runtime.sequencer.activeThread=null;return[f.util,f.args,f.child];}]){
        const f=nestedFixture();let steps=0;f.runtime.sequencer.stepThread=()=>steps++;
        f.invoke(()=>{assert.throws(()=>owner.stepNested(...change(f)),/actual current caller|distinct live VM child/);});assert.equal(steps,0);
    }
});
test('nested VM exception and Stop restore shared context without reviving the outer authority',()=>{
    for(const stopped of [false,true]){
        const f=nestedFixture(),failure=new Error('child failed');
        f.runtime.sequencer.stepThread=child=>{f.util.thread=child;f.util.sequencer=null;if(stopped){f.thread.isKilled=true;f.runtime.threads=[];}throw failure;};
        f.invoke(()=>{assert.throws(()=>owner.stepNested(f.util,f.args,f.child),error=>error===failure);assert.equal(f.util.thread,f.thread);assert.equal(f.util.sequencer,f.runtime.sequencer);assert.equal(f.runtime.sequencer.activeThread,f.thread);assert.equal(owner.current(f.util,f.args),stopped?null:f.blocks.a);});
        assert.equal(owner.current(f.util,f.args),null);
    }
});

test('rejection-only active-call witness survives graph invalidation but never copied arguments or invoker return',()=>{
 const f=fixture();f.thread.status=0;f.thread.constructor={STATUS_DONE:4};
 f.blocks.root={id:'root',inputs:{VALUE:{block:'a'}}};
 f.blocks.a.fields={};f.blocks.a.inputs={};f.blocks.a.mutation={};
 f.operation.fields=f.blocks.a.fields;f.operation.inputs=f.blocks.a.inputs;f.operation.mutation=f.blocks.a.mutation;
 f.container.getInputs=block=>block.inputs;
 let token;
 f.invoke(()=>{
  token=owner.captureActiveCall(f.util,f.args);assert.ok(token);
  assert.equal(owner.isActiveCall(token,f.util,f.args),true);
  assert.equal(owner.isActiveCall(token,{...f.util},f.args),false);
  assert.equal(owner.isActiveCall(token,f.util,{...f.args}),false);
  assert.equal(owner.isActiveCall({},f.util,f.args),false);
  f.blocks.a.fields={changed:{value:'invalid'}};
  assert.equal(owner.captureActiveCall(f.util,f.args),null,'invalid graph cannot mint another witness');
  f.blocks.a.opcode='arrays_length';f.operation._argValues={};f.operation._blockFunction=()=>99;
  assert.equal(owner.current(f.util,f.args),null);
  assert.equal(owner.isActiveCall(token,f.util,f.args),true,'original invoker alone retains rejection authority');
 });
 assert.equal(owner.isActiveCall(token,f.util,f.args),false);
 assert.equal(owner.captureActiveCall(f.util,f.args),null);
});
