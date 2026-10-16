const cachedOwner=require('./bw-cached-primitive-owner');
// One installed module instance owns declaration issues, real execution segments
// and completed results. Nothing in project metadata is a result certificate.
const rows=new WeakMap(),adapters=new WeakMap(),issues=new WeakMap(),owners=new WeakMap();
const rowOwner=Symbol('actual scene clock declaration'),rowIssue=Symbol('actual scene clock issuance');
const opcode='arcade_sceneMillis';
let issueSerial=0;
const fail=message=>{throw Error('Scene clock Number: '+message);};
const own=(object,name)=>{const descriptor=object&&Object.getOwnPropertyDescriptor(object,name);return descriptor&&Object.hasOwn(descriptor,'value')?descriptor:null;};
const loan=()=>require('./bw-primitive-owner'); // avoid a module initialization cycle
function adapterCurrent(owner,record) {
    return !!record&&owner.isCurrent()&&owner.isInstance(record.instance)&&
        own(record.adapter,'_inst')?.value===record.instance&&own(record.adapter,'sceneMillis')?.value===record.delegate&&
        Object.getPrototypeOf(record.adapter)===record.prototype&&!Object.hasOwn(record.adapter,'getInfo')&&
        own(record.prototype,'getInfo')?.value===record.getInfo;
}
function declaration(info,owner) {
    const entries=info?.id==='arcade'&&info.blocks?.filter(row=>row.opcode==='sceneMillis');
    if(entries?.length!==1||!owner)fail('original declaration owner missing');
    rows.set(entries[0],owner);Object.defineProperty(entries[0],rowOwner,{value:owner,enumerable:true});return info;
}
function bindAdapterInfo(info,adapter,instance) {
    const entry=info?.id==='arcade'&&info.blocks?.find(row=>row.opcode==='sceneMillis'),owner=entry&&own(entry,rowOwner)?.value;
    if(rows.get(entry)!==owner||!owner?.isInstance(instance)||!owner.isCurrent())fail('original adapter source differs');
    const delegate=own(adapter,'sceneMillis')?.value,prototype=Object.getPrototypeOf(adapter),getInfo=own(prototype,'getInfo')?.value;
    if(typeof delegate!=='function'||typeof getInfo!=='function'||Object.hasOwn(adapter,'getInfo')||own(adapter,'_inst')?.value!==instance)fail('original adapter delegate differs');
    let record=adapters.get(owner);if(!record){record={adapter,instance,delegate,prototype,getInfo};adapters.set(owner,record);}
    if(record.adapter!==adapter||record.instance!==instance||record.delegate!==delegate||!adapterCurrent(owner,record))fail('adapter identity changed');
    if(Object.hasOwn(entry,rowIssue))fail('source declaration issuance was reused');
    const token=Object.freeze({});issues.set(token,{owner,adapter:record,arguments:entry.arguments,serial:++issueSerial,consumed:false});
    Object.defineProperty(entry,rowIssue,{value:token,enumerable:true});
}
// Snapshot own data only: public getters cannot stand in for current Blocks.
function structure(object,seen=new Set()) {
    if(!object||typeof object!=='object'||seen.has(object))return [];
    seen.add(object);const descriptors=Object.getOwnPropertyDescriptors(object),keys=Reflect.ownKeys(descriptors),out=[[object,Object.getPrototypeOf(object),keys,descriptors]];
    for(const key of keys){const d=descriptors[key];if(!Object.hasOwn(d,'value'))fail('configured graph contains an accessor');out.push(...structure(d.value,seen));}return out;
}
function unchanged(snapshot) {
    return snapshot.every(([object,prototype,keys,descriptors])=>{
        const now=Object.getOwnPropertyDescriptors(object),actual=Reflect.ownKeys(now);
        return Object.getPrototypeOf(object)===prototype&&actual.length===keys.length&&keys.every((key,index)=>actual[index]===key&&
            now[key].value===descriptors[key].value&&now[key].get===descriptors[key].get&&now[key].set===descriptors[key].set);
    });
}
function topology(runtime,container,root) {
    const seen=new Set(),result=[];
    const visit=(id,parent=null,key=null)=>{
        if(seen.has(id))fail('current operands shared or cyclic');seen.add(id);
        const block=container.getBlock(id),cache=container._cache?._executeCached?.[id];
        if(!block||!cache||cache.id!==id||cache.opcode!==block.opcode||cache.fields!==block.fields||
            cache.inputs!==container.getInputs(block)||cache.mutation!==block.mutation)fail('cache differs from current Blocks');
        const fn=runtime.getOpcodeFunction(block.opcode),defined=typeof fn!=='undefined',fieldNames=Object.keys(block.fields),inputNames=Object.keys(block.inputs).filter(name=>!name.startsWith('SUBSTACK'));
        if(cache._blockFunction!==fn||cache._definedBlockFunction!==defined||cache._isHat!==runtime.getIsHat(block.opcode)||
            cache._parentValues!==(parent?parent._argValues:null)||cache._parentKey!==key)fail('cached function or parent routing changed');
        if(Object.keys(cache.inputs).length!==inputNames.length||inputNames.some(name=>cache.inputs[name]!==block.inputs[name]))fail('input map changed');
        const shadow=!defined&&fieldNames.length===1&&inputNames.length===0;
        if(cache._isShadowBlock!==shadow||cache._shadowValue!==(shadow&&block.fields[fieldNames[0]].value))fail('shadow cache changed');
        const effective=Object.keys(cache.inputs).filter(name=>name!=='custom_block'&&!(name==='BROADCAST_INPUT'&&cache.inputs[name].block===cache.inputs[name].shadow)),expected=[];
        if(Object.keys(cache._inputs).length!==effective.length||effective.some(name=>cache._inputs[name]!==cache.inputs[name]))fail('effective input routing changed');
        for(const name of effective){const childId=cache._inputs[name].block;if(!childId)continue;const child=visit(childId,cache,name);if(!child._isHat)expected.push(...child._ops);}
        if(defined)expected.push(cache);
        if(cache._ops.length!==expected.length||expected.some((op,index)=>cache._ops[index]!==op))fail('cached execution order changed');
        result.push({block,structure:structure(block),cache,ops:cache._ops,args:cache._argValues,fields:cache._fields,inputs:cache._inputs,parentValues:cache._parentValues,parentKey:cache._parentKey,fn});return cache;
    };
    visit(root);return result;
}
function schema(target,node) {
    const blocks=target.blocks._blocks,ids=Object.keys(blocks).filter(id=>blocks[id]===node),id=ids[0],parent=blocks[node?.parent],incoming=[];
    if(ids.length!==1||!node||node.id!==id||node.opcode!==opcode||node.shadow!==false||node.topLevel!==false||node.next!=null||node.mutation!=null||
        Object.keys(node.fields||{}).length||Object.keys(node.inputs||{}).length||!parent)return false;
    for(const block of Object.values(blocks))for(const [name,slot]of Object.entries(block.inputs||{})){
        if(slot.block===id)incoming.push({block,name});
        if(slot.shadow===id&&slot.block!==id)incoming.push({block,name});
    }
    return incoming.length===1&&incoming[0].block===parent;
}
function create(runtime,owner) {
    if(!runtime||typeof runtime.on!=='function'||!owner||owners.has(runtime))return Object.freeze({
        read:(_args,_util,_read,legacy)=>legacy(),eligible:()=>false,prove:()=>false
    });
    const lookup=runtime.getOpcodeFunction;let registration=null,valid=!(runtime._blockInfo||[]).some(row=>row.id==='arcade');
    let generation=0,active=false,disposed=false,targets=new Set(),segments=new WeakMap(),pending=new WeakMap();
    const capture=(category,refresh=false)=>{
        if(category?.id!=='arcade'||!valid)return;
        const entries=category.blocks?.filter(row=>row.json?.type===opcode),entry=entries?.length===1&&entries[0],issue=issues.get(entry?.info?.[rowIssue]),adapter=adapters.get(owner),func=entry?.info?.func;
        if((refresh?registration?.category!==category:!!registration)||!issue||issue.consumed||issue.serial<=(registration?.issue.serial||0)||issue.owner!==owner||issue.adapter!==adapter||
            issue.arguments!==entry?.info?.arguments||entry?.info?.[rowOwner]!==owner||!adapterCurrent(owner,adapter)||!runtime._blockInfo?.includes(category)||
            typeof lookup!=='function'||runtime.getOpcodeFunction!==lookup||typeof func!=='function'||lookup.call(runtime,opcode)!==func){valid=false;return;}
        issue.consumed=true;registration={category,entry,issue,adapter,func,arguments:entry.info.arguments};generation++;segments=new WeakMap();pending=new WeakMap();
    };
    const current=()=>valid&&active&&!disposed&&registration&&adapterCurrent(owner,registration.adapter)&&runtime.getOpcodeFunction===lookup&&
        lookup.call(runtime,opcode)===registration.func&&runtime._blockInfo?.includes(registration.category)&&registration.category.id==='arcade'&&
        registration.category.blocks?.filter(row=>row.json?.type===opcode).length===1&&registration.category.blocks.includes(registration.entry)&&
        registration.entry.info?.func===registration.func&&registration.entry.info?.arguments===registration.arguments&&
        registration.entry.info?.[rowOwner]===owner&&issues.get(registration.entry.info?.[rowIssue])===registration.issue&&registration.issue.consumed;
    const invalidate=()=>{generation++;active=false;segments=new WeakMap();pending=new WeakMap();};
    const context=()=>{
        const value=owner.context();
        const id=own(value?.state,'_sceneValueId')?.value;
        if(!value||!value.state||!(value.scenes instanceof Map)||typeof id!=='string'||!id||!Number.isSafeInteger(value.serial)||value.serial<0||!Number.isSafeInteger(value.epoch)||value.epoch<0||value.scenes.get(id)!==value.state)fail('actual current scene registry differs');
        return value;
    };
    const sameScene=saved=>{const now=context();return now.state===saved.state&&now.serial===saved.serial&&now.epoch===saved.epoch&&now.scenes===saved.scenes;};
    const segmentCurrent=(segment,util)=>{
        if(!segment||!current()||segment.generation!==generation||segments.get(util.thread)!==segment||runtime.sequencer?.activeThread!==util.thread||
            !runtime.isActiveThread(util.thread)||util.thread.isKilled||!runtime.threads.includes(util.thread)||!runtime.targets.includes(segment.target)||
            util.thread.target!==segment.target||util.thread.blockContainer!==segment.container||segment.target.blocks!==segment.container||
            util.thread.peekStack()!==segment.root||util.thread.peekStackFrame()!==segment.frame)return false;
        if(segment.graph.some(row=>!unchanged(row.structure)))return false;
        const next=topology(runtime,segment.container,segment.root);
        return next.length===segment.graph.length&&next.every((row,index)=>{
            const old=segment.graph[index];return row.block===old.block&&row.cache===old.cache&&row.ops===old.ops&&row.args===old.args&&
                row.fields===old.fields&&row.inputs===old.inputs&&row.parentValues===old.parentValues&&row.parentKey===old.parentKey&&row.fn===old.fn;
        });
    };
    const state={before(thread,container,blockCached,ready){
        segments.delete(thread);
        if(!ready||!blockCached._ops?.some(op=>op.opcode===opcode))return;
        if(!current()||runtime.sequencer?.activeThread!==thread||thread.blockContainer!==container||thread.target?.blocks!==container||
            thread.peekStack()!==blockCached.id||!runtime.isActiveThread(thread)||thread.isKilled||!runtime.targets.includes(thread.target))fail('actual input segment owner differs');
        segments.set(thread,{generation,target:thread.target,container,root:blockCached.id,frame:thread.peekStackFrame(),graph:topology(runtime,container,blockCached.id),receipts:new WeakMap()});
    },discard(record){pending.delete(record.operation);},after(record,result){
        if(record.operation.opcode!==opcode)return result;
        const saved=pending.get(record.operation);pending.delete(record.operation);
        if(!saved||saved.args!==record.args||saved.util!==record.util||saved.registration!==registration||!segmentCurrent(saved.segment,record.util)||
            !loan().isActiveCall(saved.call,record.util,record.args)||!sameScene(saved.scene)||typeof result!=='number'||!Number.isFinite(result)||!Object.is(result,saved.value))fail('real finite reporter completion missing or changed');
        saved.segment.receipts.set(record.operation,Object.freeze({...saved,operation:record.operation,value:result}));return result;
    }};
    owners.set(runtime,state);
    runtime.on('EXTENSION_ADDED',capture);runtime.on('BLOCKSINFO_UPDATE',category=>capture(category,true));
    runtime.on('PROJECT_START',()=>{invalidate();if(!disposed){active=true;targets=new Set(runtime.targets);}});
    runtime.on('PROJECT_STOP_ALL',invalidate);runtime.on('RUNTIME_DISPOSED',()=>{invalidate();disposed=true;});
    runtime.on('PROJECT_LOADED',()=>{invalidate();if(disposed&&runtime.targets?.length&&runtime.targets.every(target=>!targets.has(target))&&valid&&registration&&adapterCurrent(owner,registration.adapter)&&runtime.getOpcodeFunction===lookup&&lookup.call(runtime,opcode)===registration.func){disposed=false;targets=new Set(runtime.targets);}});
    return Object.freeze({read(args,util,read,legacy){
        // Direct service callers, even with a retained utility, keep their old
        // behavior. The actual engine after-hook will reject a missing receipt.
        if(loan().current(util,args)?.opcode!==opcode)return legacy();
        const segment=segments.get(util.thread);
        if(!segmentCurrent(segment,util))fail('actual current input segment missing');
        const block=cachedOwner(runtime,util,args,opcode,[]),ops=segment.container._cache._executeCached[segment.root]._ops,matches=ops.filter(op=>op.id===block.id&&op._argValues===args);
        if(!schema(util.thread.target,block)||matches.length!==1||Object.keys(args).join(',')!=='mutation'||own(args,'mutation')?.value!==block.mutation)fail('zero-input reporter schema differs');
        const call=loan().captureActiveCall(util,args);if(!call)fail('actual reporter invocation missing');
        const observed=read(); // exactly one original source read, never a retry
        if(!observed||typeof observed.value!=='number'||!Number.isFinite(observed.value))fail('actual scene read is not finite Number');
        const scene=context();if(scene.state!==observed.state||!segmentCurrent(segment,util))fail('scene or input segment changed during read');
        const value=observed.value||0; // retain the original clock's negative-zero fallback
        pending.set(matches[0],{args,util,call,scene,segment,registration,value});return value;
    },eligible(target,node){return !!current()&&runtime.targets.includes(target)&&schema(target,node);},
    prove(target,node,args,util){
        if(!current()||!schema(target,node)||util?.thread?.target!==target||!loan().current(util,args))return false;
        const call=loan().captureActiveCall(util,args);if(!call)return false;
        const segment=segments.get(util.thread);if(!segmentCurrent(segment,util))return false;
        const operations=segment.container._cache._executeCached[segment.root]._ops,matches=operations.filter(op=>op.id===node.id);
        if(matches.length!==1)return false;const operation=matches[0],receipt=segment.receipts.get(operation);
        if(!receipt||receipt.registration!==registration||!sameScene(receipt.scene)||receipt.segment!==segment||
            operation._argValues!==receipt.args||operation._blockFunction!==registration.func||!operation._parentValues||
            !Object.is(own(operation._parentValues,operation._parentKey)?.value,receipt.value)||typeof receipt.value!=='number'||!Number.isFinite(receipt.value))return false;
        cachedOwner(runtime,util,receipt.args,opcode,[]);
        return loan().isActiveCall(call,util,args);
    }});
}
function beforeInputs(runtime,thread,container,blockCached,ready=true){owners.get(runtime)?.before(thread,container,blockCached,ready);}
function finish(record){if(record.operation.opcode===opcode)owners.get(record.runtime)?.discard(record);}
function after(record,result){const owner=owners.get(record.runtime);if(record.operation.opcode===opcode&&!owner)fail('original result owner missing');return owner?owner.after(record,result):result;}
module.exports=Object.freeze({create,declaration,bindAdapterInfo,beforeInputs,after,finish});
