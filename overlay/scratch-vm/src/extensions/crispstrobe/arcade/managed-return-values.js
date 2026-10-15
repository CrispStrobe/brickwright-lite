const primitiveOwner=require('../../../util/bw-primitive-owner');
const currentNumberInput=require('./current-number-input');
const semantic=block=>JSON.stringify([block.opcode,block.fields,block.inputs,block.mutation,block.next,block.parent,block.topLevel,block.shadow]);

// A physical numeric shadow has a String carrier in stock Scratch. Preserve
// its actual Number meaning at the managed return boundary, while that exact
// input and invocation are still available. No declared return type is used.
module.exports=function createManagedReturnValues(runtime) {
    const bound=!!runtime&&typeof runtime.on==='function'&&Array.isArray(runtime.targets);
    let records=new WeakMap(),active=false,disposed=false;
    const body=(target,definition)=>{
        const nodes=new Map();
        const visit=id=>{if(!id||nodes.has(id))return;const block=target.blocks.getBlock(id);if(!block)return;
            nodes.set(id,{block,semantic:semantic(block)});for(const input of Object.values(block.inputs||{}))visit(input.block);visit(block.next);};
        visit(definition);return nodes;
    };
    const bind=(thread,target,name,definition,caller)=>{
        if(!bound||!active||disposed||!runtime.targets.includes(target)||thread.target!==target||thread.blockContainer!==target.blocks||
            !runtime.threads.includes(thread)||!runtime.threads.includes(caller)||caller.isKilled||runtime.sequencer.activeThread!==caller||
            caller.target!==target||caller.blockContainer!==target.blocks)return;
        const block=target.blocks.getBlock(definition),prototype=target.blocks.getBlock(block?.inputs?.custom_block?.block),frame=thread.stackFrames[0];
        if(block?.opcode!=='procedures_definition'||prototype?.mutation?.proccode!==name||thread.stack[0]!==null||frame?.waitingReporter!==name)return;
        records.set(thread,{target,container:target.blocks,name,definition,frame,caller,nodes:body(target,definition)});
    };
    const value=(args,util)=>{
        const original=args.VALUE,thread=util?.thread,record=thread&&records.get(thread);
        if(!bound||!active||disposed||!record||typeof original!=='string')return original;
        try {
            const {target,container,name,definition,frame,caller,nodes}=record;
            if(!runtime.targets.includes(target)||thread.target!==target||thread.blockContainer!==container||target.blocks!==container||
                thread.stack[0]!==null||thread.stackFrames[0]!==frame||frame.waitingReporter!==name||
                caller.isKilled||!runtime.threads.includes(caller)||container.getProcedureDefinition(name)!==definition)return original;
            const block=primitiveOwner.current(util,args);
            if(block?.opcode!=='arcade_returnValue'||nodes.get(block.id)?.block!==block)return original;
            const current=body(target,definition);
            if(current.size!==nodes.size||[...nodes].some(([id,saved])=>current.get(id)?.block!==saved.block||current.get(id)?.semantic!==saved.semantic))return original;
            return currentNumberInput(runtime,args,util,'arcade_returnValue');
        } catch (_) {return original;} // An unproved input keeps its original value and downstream refusal.
    };
    return Object.freeze({bind,value,start:()=>{records=new WeakMap();if(bound&&!disposed)active=true;},
        invalidate:()=>{active=false;records=new WeakMap();},dispose:()=>{disposed=true;active=false;records=new WeakMap();}});
};
