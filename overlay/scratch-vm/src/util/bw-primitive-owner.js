// Private synchronous primitive execution loan. Only the engine's current
// cached operation supplies this context; it never survives an awaited result.
const active = new WeakMap();
const activeCalls = new WeakMap();
const cachedOwner = require('./bw-cached-primitive-owner');
const conditionWaits = require('./bw-source-condition-waits');
// The engine loan and Number-input adapter share this explicit role table.
// A loan alone does not authorize interpretation of arbitrary input sockets.
const roles=Object.freeze(Object.fromEntries(Object.entries({
    control_wait_until:[],
    arcade_createCallable:[],arcade_objectField:[],procedures_call:[],arcade_callFunction:[],
    arcade_throwValue:['VALUE'],arcade_createOwnedImageSprite:['KIND'],
    arcade_returnValue:['VALUE'],arcade_functionArgument:['VALUE'],
    arcade_setLocal:['VALUE'],arcade_setCaptured:['VALUE'],
    arcade_setObjectField:['VALUE'],arcade_inspectValue:['VALUE','LIMIT'],
    arrays_create1D:[],arrays_create2D:[],arrays_createEmpty:[],
    arrays_createZeros:[],arrays_createRange:[],arrays_delete:[],
    arrays_get:[],arrays_get2D:[],arrays_getMulti:[],
    arrays_set:[],arrays_set2D:[],arrays_setMulti:[],
    arrays_push:[],arrays_pop:[],arrays_insert:[],
    arrays_remove:[],arrays_length:[],arrays_shape:[],
    arrays_contains:[],arrays_indexOf:[],arrays_slice:[],
    arrays_getRow:[],arrays_getColumn:[],arrays_map:[],
    arrays_filter:[],arrays_reduce:[],arrays_sort:[],
    arrays_reverse:[],arrays_sum:[],arrays_mean:[],
    arrays_min:[],arrays_max:[],arrays_transpose:[],
    arrays_flatten:[],arrays_reshape:[],arrays_toJSON:[],
    arrays_toString:[],arrays_listAll:[],arrays_namedReference:[],
    arrays_createReference:[],arrays_parseLegacyValue:[],arrays_jsonValue:[],
    arrays_referenceTruthy:[],arrays_referenceItem:[],arrays_referenceRandom:[],
    arrays_referenceLength:[],arrays_referenceSlice:[],arrays_referenceConcat:[],
    arrays_referenceTake:[],arrays_showTable:[],arrays_hideTable:[],
    arrays_setTableTitle:[],arrays_setTableStyle:[],arrays_markCell:[],
    arrays_unmarkCell:[],arrays_clearMarks:[],arrays_isMarked:[],
    arrays_markedCount:[],
    arrays_referenceValues:['VALUE'],arrays_mutateReference:['VALUE'],
    arrays_referenceRemove:['VALUE'],arrays_referenceIndexOf:['VALUE'],
    arrays_valueBinary:['LEFT','RIGHT'],arrays_valueUnary:['VALUE'],
    arrays_valueCompare:['LEFT','RIGHT'],arrays_valueTruthy:['VALUE']
}).map(([opcode,inputs])=>[opcode,Object.freeze(inputs)])));
const handles=opcode=>Object.hasOwn(roles,opcode);
const permitsNumberInput=(opcode,name)=>handles(opcode)&&roles[opcode].includes(name);

function owned(record) {
    const {runtime,thread,container,operation,args,util,block,root,blockFunction}=record;
    return runtime.sequencer.activeThread===thread && runtime.isActiveThread(thread) && !thread.isKilled &&
        runtime.targets.includes(thread.target) && thread.blockContainer===container && thread.target.blocks===container &&
        util.thread===thread && util.runtime===runtime && thread.peekStack()===root &&
        container.getBlock(operation.id)===block && handles(block.opcode) &&
        operation.opcode===block.opcode && operation._argValues===args &&
        operation._blockFunction===blockFunction && runtime.getOpcodeFunction(operation.opcode)===blockFunction &&
        container._cache?._executeCached?.[root]?._ops.includes(operation);
}
function invoke(runtime,thread,container,operation,args,util,primitive) {
    if(active.has(runtime))throw new Error('Primitive execution ownership cannot be reentered');
    const record={runtime,thread,container,operation,args,util,root:thread.peekStack(),block:container.getBlock(operation.id),blockFunction:operation._blockFunction};
    if(!record.block || typeof primitive!=='function' || !owned(record))throw new Error('Primitive execution requires the actual cached caller');
    active.set(runtime,record);
    try {const result=primitive();return conditionWaits.after(record,result);}finally{active.delete(runtime);}
}
// Only a genuine synchronous nested VM thread may suspend an existing loan.
// No callback, copied utility or retained argument snapshot can borrow it.
function stepNested(util,args,child) {
    const runtime=util?.runtime,record=runtime&&active.get(runtime),sequencer=runtime?.sequencer;
    if(!record||record.util!==util||record.args!==args||!owned(record))throw new Error('Nested primitive step requires the actual current caller');
    if(!child||child===record.thread||!runtime.threads.includes(child)||!runtime.isActiveThread(child)||child.isKilled||
        child.status===child.constructor.STATUS_DONE||!runtime.targets.includes(child.target)||
        child.blockContainer!==child.target.blocks||!child.blockContainer.getBlock(child.peekStack())||
        typeof sequencer.stepThread!=='function')throw new Error('Nested primitive step requires a distinct live VM child');
    const previousThread=util.thread,previousSequencer=util.sequencer,previousActive=sequencer.activeThread;
    active.delete(runtime);
    try {sequencer.activeThread=child;return sequencer.stepThread(child);}
    finally {util.thread=previousThread;util.sequencer=previousSequencer;sequencer.activeThread=previousActive;active.set(runtime,record);}
}
function current(util,args) {
    const record=util?.runtime && active.get(util.runtime);
    return record && record.util===util && record.args===args && owned(record) ? record.block : null;
}
// Rejection-only witness for an invoker which already passed strong ownership.
// Current metadata/cache/registration may subsequently become the reason to
// reject. This witness never authorizes effects or Number interpretation.
function captureActiveCall(util,args) {
    const record=util?.runtime&&active.get(util.runtime);
    if(!record||record.util!==util||record.args!==args||!owned(record))return null;
    try {if(cachedOwner(record.runtime,util,args,record.block.opcode,[])!==record.block)return null;}catch{return null;}
    const token=Object.freeze({});
    activeCalls.set(token,{record,runtime:record.runtime,thread:record.thread,target:record.thread.target,
        container:record.container,root:record.root,args,util});
    return token;
}
function isActiveCall(token,util,args) {
    const saved=activeCalls.get(token);
    if(!saved||saved.util!==util||saved.args!==args)return false;
    const {runtime,thread,target,container,root,record}=saved;
    return active.get(runtime)===record&&runtime.sequencer.activeThread===thread&&
        runtime.isActiveThread(thread)&&runtime.threads.includes(thread)&&!thread.isKilled&&
        thread.status!==thread.constructor.STATUS_DONE&&runtime.targets.includes(target)&&
        thread.target===target&&thread.blockContainer===container&&target.blocks===container&&
        thread.peekStack()===root&&util.runtime===runtime&&util.thread===thread;
}
module.exports=Object.freeze({invoke,current,stepNested,handles,permitsNumberInput,captureActiveCall,isActiveCall});
