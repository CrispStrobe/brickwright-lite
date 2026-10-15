// Native source pauseUntil retains the stock CONDITION graph and the stock
// primitive. Only this module can park/sample a caller admitted by its actual
// primitive execution loan. Ordinary Scratch wait-until stays synchronous.
const owners=new WeakMap(),failures=new WeakMap(),samples=new WeakMap();
const branded=promise=>{const token=Object.freeze({});samples.set(token,promise);return token;};
function takeSample(token){const promise=token&&samples.get(token);if(promise)samples.delete(token);return promise||null;}
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
// Reconstruct cache topology from current Blocks, not from a consumer's type
// or an old argument value. Dynamic input results are intentionally live.
function cacheShape(runtime,container,root) {
    const seen=new Set(),rows=[];
    const visit=(id,parent=null,key=null)=>{
        if(seen.has(id))throw Error('Source condition cache has shared or cyclic operands');
        seen.add(id);
        const block=container.getBlock(id),cache=container._cache?._executeCached?.[id];
        if(!block||!cache||cache.id!==id||cache.opcode!==block.opcode||cache.fields!==block.fields||
            cache.inputs!==container.getInputs(block)||cache.mutation!==block.mutation)
            throw Error('Source condition cache differs from current Blocks');
        const fn=runtime.getOpcodeFunction(block.opcode),defined=typeof fn!=='undefined';
        const fields=Object.keys(block.fields),inputs=Object.keys(cache.inputs);
        const shadow=!defined&&fields.length===1&&inputs.length===0;
        if(cache._blockFunction!==fn||cache._definedBlockFunction!==defined||cache._isHat!==runtime.getIsHat(block.opcode)||
            cache._isShadowBlock!==shadow||cache._shadowValue!==(shadow&&block.fields[fields[0]].value)||
            cache._parentValues!==(parent?parent._argValues:null)||cache._parentKey!==key)
            throw Error('Source condition cache primitive or parent routing changed');
        const inputNames=Object.keys(block.inputs).filter(name=>!name.startsWith('SUBSTACK'));
        const sameMap=(map,names,values)=>map&&Object.keys(map).length===names.length&&names.every(name=>map[name]===values[name]);
        if(!sameMap(cache.inputs,inputNames,block.inputs)||!sameMap(cache._fields,fields,block.fields))
            throw Error('Source condition cache field/input map changed');
        const broadcast=cache.inputs.BROADCAST_INPUT;
        const broadcastShadow=broadcast&&broadcast.block===broadcast.shadow;
        const effective=inputs.filter(name=>name!=='custom_block'&&!(name==='BROADCAST_INPUT'&&broadcastShadow));
        if(!sameMap(cache._inputs,effective,cache.inputs))throw Error('Source condition cache input routing changed');
        const args=cache._argValues,allowed=new Set(['mutation',...fields,...effective,...(broadcast?['BROADCAST_OPTION']:[])]);
        if(!args||Object.keys(args).some(name=>!allowed.has(name))||args.mutation!==cache.mutation)
            throw Error('Source condition cache argument schema changed');
        const statics=[];
        if(broadcast){
            const value=args.BROADCAST_OPTION;
            if(!value||Object.keys(value).length!==2||!Object.hasOwn(value,'id')||!Object.hasOwn(value,'name'))
                throw Error('Source condition broadcast argument schema changed');
            statics.push(value);
            if(broadcastShadow){const field=container.getBlock(broadcast.shadow)?.fields?.BROADCAST_OPTION;
                if(!field||value.id!==field.id||value.name!==field.value)throw Error('Source condition cached broadcast shadow changed');
                statics.push(value.id,value.name);
            }
        }
        for(const name of fields){
            const field=block.fields[name],value=args[name];
            if(['VARIABLE','LIST','BROADCAST_OPTION'].includes(name)){
                if(!value||Object.keys(value).length!==2||value.id!==field.id||value.name!==field.value)
                    throw Error('Source condition cached binding differs from its field');
                statics.push(value,value.id,value.name);
            }else {if(value!==field.value)throw Error('Source condition cached static argument changed');statics.push(value);}
        }
        const expected=[];
        for(const name of effective){const input=cache._inputs[name];if(!input.block){if(args[name]!==undefined)throw Error('Source condition disconnected argument changed');continue;}
            const child=visit(input.block,cache,name);
            if(child._isHat)continue;
            expected.push(...child._ops);
            if(child._isShadowBlock&&args[name]!==child._shadowValue)throw Error('Source condition cached shadow argument changed');
        }
        if(defined)expected.push(cache);
        if(!Array.isArray(cache._ops)||cache._ops.length!==expected.length||expected.some((op,i)=>cache._ops[i]!==op))
            throw Error('Source condition cached execution order changed');
        rows.push([cache,cache._ops,cache._argValues,cache._fields,cache._inputs,cache._parentValues,cache._parentKey,
            cache._blockFunction,cache._definedBlockFunction,cache._isHat,cache._isShadowBlock,cache._shadowValue,...statics,...expected]);
        return cache;
    };
    visit(root);return rows;
}
function bind(phase) {
    const runtime=phase.runtime;
    if(owners.has(runtime))throw Error('Source condition wait already has a phase owner');
    const records=new Map();
    const failed=()=>{const exceptions=require('./bw-arcade-exceptions');for(const record of records.values())if(exceptions.failed(runtime,record.thread))settle(record);};
    runtime.on('BLOCKS_ERROR',failed);
    const capturesCurrent=record=> {
        const {thread,captures,cells,locals,params}=record;
        return thread.bwArcadeCaptures===captures && thread._bwArcadeLocals===locals &&
            params.every(([frame,values])=>frame.params===values) &&
            (!captures || (captures.size===cells.length && cells.every(([key,cell,values,name])=>
                captures.get(key)===cell && cell.values===values && cell.key===name)));
    };
    const valid=record=> {
        const {thread,container,root,frame,frames,graph,generation}=record;
        return owners.get(runtime)===owner&&runtime._arcadeFramePhase===phase&&!phase.disposed&&generation===phase.generation&&
            phase._sourceOwned(thread)&&container._cache?._executeCached?.[root]===record.rootCache&&runtime.targets.includes(thread.target)&&thread.target.blocks===container&&thread.blockContainer===container&&
            frames.every((f,i)=>thread.stackFrames[i]===f)&&thread.stackFrames[frames.length-1]===frame&&thread.stack[frames.length-1]===root&&
            capturesCurrent(record)&&graph.length===Object.keys(container._blocks).length&&graph.every(([id,node,shape])=>
                container.getBlock(id)===node&&unchanged(shape));
    };
    const settle=record=>{records.delete(record.thread);record.sample?.resolve({ready:false,cancelled:true});record.sample=null;record.delivery.resolve();};
    const refuse=(record,cause)=>{
        const error=new Error('Source pauseUntil caller graph, cache or lifetime changed',{cause});
        failures.set(error,{runtime,thread:record.thread,block:record.root});
        try {require('./bw-arcade-exceptions').rejectConditionWait(runtime,record.thread,error);}
        catch(signal){if(!require('./bw-arcade-exceptions').consume(runtime,record.thread,signal))throw signal;}
        finally {for(const current of records.values())if(current===record||!phase._sourceOwned(current.thread))settle(current);}
    };
    const checkCache=(record,container,root)=>{
        const rows=cacheShape(runtime,container,root),cache=container._cache._executeCached[root];
        let byRoot=record.caches.get(container);if(!byRoot)record.caches.set(container,byRoot=new Map());
        const previous=byRoot.get(root),prior=previous?.rows;
        if(previous&&previous.cache!==cache)throw Error('Source condition cached root identity changed');
        if(prior&&(prior.length!==rows.length||rows.some((row,i)=>row.length!==prior[i].length||row.some((value,j)=>value!==prior[i][j]))))
            throw Error('Source condition cached operand identity changed');
        if(!prior)byRoot.set(root,{cache,rows});
    };
    const principal=thread=>{
        const seen=new Set();
        for(let current=thread;current&&!seen.has(current);){
            seen.add(current);const record=records.get(current);if(record)return record;
            const call=phase._callOf(current);
            if(!call?.caller||!phase._sourceOwned(current))break;
            current=call.caller;
        }
        return null;
    };
    const sample=record=>{
        if(records.get(record.thread)!==record)return branded(Promise.resolve({ready:false,cancelled:true}));
        try {if(!valid(record))throw Error('Source wait principal changed');checkCache(record,record.container,record.root);}
        catch(error){refuse(record,error);return branded(Promise.resolve({ready:false,cancelled:true}));}
        if(record.state!=='parked'||record.sample)throw Error('Source condition sampling cannot overlap');
        record.state='sampling';record.sample=deferred();const result=branded(record.sample.promise);
        record.thread.status=record.thread.constructor.STATUS_RUNNING;
        phase.requestContinuation().catch(error=>{
            if(records.get(record.thread)===record)refuse(record,error);
            runtime.emit('BLOCKS_ERROR',error);
        });
        return result;
    };
    const owner={
        beforeInputs(thread,container,cache) {
            if(!phase._sourceOwned(thread))return true;
            if(runtime.sequencer.activeThread!==thread||!runtime.isActiveThread(thread)||thread.isKilled||
                !runtime.targets.includes(thread.target)||thread.blockContainer!==container||thread.target.blocks!==container||
                container._cache?._executeCached?.[thread.peekStack()]!==cache)throw Error('Source condition ingress requires actual current execution cache');
            let record=principal(thread);
            if(!records.has(thread)&&cache.opcode==='control_wait_until'){
                record={thread,container,root:thread.peekStack(),frame:thread.peekStackFrame(),frames:[...thread.stackFrames],
                    rootCache:cache,generation:phase.generation,state:'initial',caches:new Map(),delivery:deferred(),sample:null,
                    graph:Object.entries(container._blocks).map(([id,node])=>[id,node,structure(node)]),
                    captures:thread.bwArcadeCaptures,locals:thread._bwArcadeLocals,
                    cells:[...(thread.bwArcadeCaptures||[])].map(([key,cell])=>[key,cell,cell.values,cell.key]),
                    params:thread.stackFrames.map(frame=>[frame,frame.params])};
                records.set(thread,record);
            }
            if(!record)return true;
            if(record.thread===thread&&['parked','delivery'].includes(record.state))return false;
            try {if(!valid(record))throw Error('Source wait principal changed');checkCache(record,container,cache.id);return true;}
            catch(error){refuse(record,error);return false;}
        },
        after(loan,result) {
            if(loan.block.opcode!=='control_wait_until')return result;
            const record=records.get(loan.thread);if(!record)return result;
            const yielded=loan.thread.status===loan.thread.constructor.STATUS_YIELD;
            if(record.state==='initial'){
                if(!yielded){records.delete(record.thread);return result;}
                record.state='parked';
                phase.ext._nativePollEvents().enqueue(()=>sample(record),()=>{
                    if(records.get(record.thread)!==record)return;
                    if(!valid(record)){refuse(record);return;}
                    records.delete(record.thread);record.delivery.resolve();
                });
            }else if(record.state==='sampling'&&record.sample){
                const pending=record.sample;record.sample=null;record.state=yielded?'parked':'delivery';
                pending.resolve({ready:!yielded,cancelled:false});
                if(!yielded)return record.delivery.promise;
            }else {refuse(record);return result;}
            loan.thread.status=loan.thread.constructor.STATUS_PROMISE_WAIT;return result;
        },
        beforeStep(thread) {const record=principal(thread);if(record&&!valid(record))refuse(record);},
        parked(thread) {const record=records.get(thread);return !!record&&['parked','delivery'].includes(record.state);},
        cancel() {for(const record of records.values())settle(record);},
        detach() {owner.cancel();runtime.off('BLOCKS_ERROR',failed);if(owners.get(runtime)===owner)owners.delete(runtime);}
    };
    owners.set(runtime,owner);return owner;
}
function after(record,result) {return owners.get(record.runtime)?.after(record,result) ?? result;}
function beforeInputs(runtime,thread,container,cache) {
    const owner=owners.get(runtime);if(!owner)return true;
    return owner.beforeInputs(thread,container,cache);
}
function consumeFailure(runtime,thread,error) {
    const record=failures.get(error);if(!record||record.runtime!==runtime||record.thread!==thread)return null;
    failures.delete(error);return record;
}
module.exports=Object.freeze({bind,after,beforeInputs,consumeFailure,takeSample});
