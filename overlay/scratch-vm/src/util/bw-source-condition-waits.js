// Native source pauseUntil retains the stock CONDITION graph and the stock
// primitive. Only this module can park/sample a caller admitted by its actual
// primitive execution loan. Ordinary Scratch wait-until stays synchronous.
const owners=new WeakMap(),failures=new WeakMap();
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
// Capture plain current Blocks structure without invoking an accessor. Values
// in variables/captured environments remain live; this binds their reporter
// graph and physical frames, not their current guest values.
function structure(value,seen=new Set()) {
    if(!value || typeof value!=='object' || seen.has(value))return [];
    seen.add(value);
    const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors);
    const rows=[[value,Object.getPrototypeOf(value),keys,descriptors]];
    for(const key of keys){const d=descriptors[key];if(!Object.hasOwn(d,'value'))throw Error('Source wait Blocks graph contains an accessor');rows.push(...structure(d.value,seen));}
    return rows;
}
function unchanged(rows) {
    return rows.every(([object,prototype,keys,descriptors])=>{
        if(Object.getPrototypeOf(object)!==prototype)return false;
        const current=Object.getOwnPropertyDescriptors(object),now=Reflect.ownKeys(current);
        return now.length===keys.length && keys.every((key,i)=>now[i]===key && current[key].value===descriptors[key].value &&
            current[key].get===descriptors[key].get && current[key].set===descriptors[key].set);
    });
}
function bind(phase) {
    const runtime=phase.runtime;
    if(owners.has(runtime))throw Error('Source condition wait already has a phase owner');
    const records=new Map();
    const capturesCurrent=record=> {
        const {thread,captures,cells,locals,params}=record;
        return thread.bwArcadeCaptures===captures && thread._bwArcadeLocals===locals &&
            params.every(([frame,values])=>frame.params===values) &&
            (!captures || (captures.size===cells.length && cells.every(([key,cell,values,name])=>
                captures.get(key)===cell && cell.values===values && cell.key===name)));
    };
    const valid=record=> {
        const {thread,container,root,operation,block,blockFunction,cache,frames,graph,generation}=record;
        return owners.get(runtime)===owner && runtime._arcadeFramePhase===phase && !phase.disposed && generation===phase.generation && phase._sourceOwned(thread) &&
            runtime.targets.includes(thread.target) && thread.target.blocks===container && thread.blockContainer===container &&
            thread.peekStack()===root && frames.length===thread.stackFrames.length && frames.every((f,i)=>thread.stackFrames[i]===f) &&
            container.getBlock(operation.id)===block && block.opcode==='control_wait_until' &&
            operation._blockFunction===blockFunction && runtime.getOpcodeFunction(block.opcode)===blockFunction &&
            operation.opcode===block.opcode && operation._argValues===record.args &&
            Object.keys(record.args).length===2 && Object.hasOwn(record.args,'CONDITION') && Object.hasOwn(record.args,'mutation') &&
            record.args.mutation===operation.mutation && operation.mutation===block.mutation &&
            container._cache?._executeCached?.[root]===cache && cache._ops===record.ops &&
            cache._ops.length===record.operations.length && record.operations.every(([op,fn,opcode],i)=>
                cache._ops[i]===op && op._blockFunction===fn && op.opcode===opcode &&
                (!op._definedBlockFunction || runtime.getOpcodeFunction(opcode)===fn)) && capturesCurrent(record) &&
            graph.length===Object.keys(container._blocks).length && graph.every(([id,node,shape])=>
                container.getBlock(id)===node && unchanged(shape));
    };
    const settle=record=>{records.delete(record.thread);record.sample?.resolve(false);record.sample=null;record.delivery.resolve();};
    const refuse=record=>{
        const error=new Error('Source pauseUntil caller graph, cache or lifetime changed');
        // The exception coordinator consumes this private one-shot witness and
        // retires the actual managed lineage before pending promises settle.
        failures.set(error,{runtime,thread:record.thread,block:record.block.id});
        try {require('./bw-arcade-exceptions').rejectConditionWait(runtime,record.thread,error);}
        finally {settle(record);}
    };
    const sample=record=>{
        if(records.get(record.thread)!==record)return Promise.resolve(false);
        if(!valid(record)){refuse(record);return Promise.resolve(false);}
        if(record.sample)throw Error('Source condition sampling cannot overlap');
        record.sample=deferred();const result=record.sample.promise;
        record.thread.status=record.thread.constructor.STATUS_RUNNING;
        // This turn is queued after any physical request which parked us. It
        // retries the original VM caller; no copied predicate or guest callback.
        phase.requestContinuation().catch(error=>{
            if(records.get(record.thread)===record){
                try {refuse(record);} catch(signal){runtime.emit('BLOCKS_ERROR',signal);}
            }
            // The original source-turn rejection is retained on the error bus.
            runtime.emit('BLOCKS_ERROR',error);
        });
        return result;
    };
    const owner={
        after(loan,result) {
            if(loan.block.opcode!=='control_wait_until' || !phase.active || !phase._sourceOwned(loan.thread))return result;
            let record=records.get(loan.thread);
            const yielded=loan.thread.status===loan.thread.constructor.STATUS_YIELD;
            if(!record) {
                if(!yielded)return result; // Optimistic true: exactly one read.
                record={...loan,generation:phase.generation,cache:loan.container._cache._executeCached[loan.root],
                    frames:[...loan.thread.stackFrames],graph:Object.entries(loan.container._blocks).map(([id,node])=>[id,node,structure(node)]),
                    delivery:deferred(),sample:null,
                    captures:loan.thread.bwArcadeCaptures,locals:loan.thread._bwArcadeLocals,
                    cells:[...(loan.thread.bwArcadeCaptures||[])].map(([key,cell])=>[key,cell,cell.values,cell.key]),
                    params:loan.thread.stackFrames.map(frame=>[frame,frame.params])};
                record.ops=record.cache._ops;record.operations=record.ops.map(op=>[op,op._blockFunction,op.opcode]);
                records.set(loan.thread,record);
                phase.ext._nativePollEvents().enqueue(()=>sample(record),()=>{
                    if(records.get(record.thread)!==record)return;
                    if(!valid(record)){refuse(record);return;}
                    records.delete(record.thread);record.delivery.resolve();
                });
            } else {
                if(!record.sample || !valid(record))return refuse(record);
                const pending=record.sample;record.sample=null;pending.resolve(!yielded);
                if(!yielded)return record.delivery.promise;
            }
            // Unlike a generic YIELD, this explicit parked wait must also stop
            // warp-mode immediate retries. The stock stack stays on this block.
            loan.thread.status=loan.thread.constructor.STATUS_PROMISE_WAIT;
            return result;
        },
        beforeStep(thread) {const record=records.get(thread);if(record?.sample&&!valid(record))refuse(record);},
        parked(thread) {const record=records.get(thread);return !!record&&!record.sample;},
        cancel() {for(const record of records.values())settle(record);},
        detach() {owner.cancel();if(owners.get(runtime)===owner)owners.delete(runtime);}
    };
    owners.set(runtime,owner);return owner;
}
function after(record,result) {return owners.get(record.runtime)?.after(record,result) ?? result;}
function consumeFailure(runtime,thread,error) {
    const record=failures.get(error);
    if(!record || record.runtime!==runtime || record.thread!==thread)return null;
    failures.delete(error);return record;
}
module.exports=Object.freeze({bind,after,consumeFailure});
