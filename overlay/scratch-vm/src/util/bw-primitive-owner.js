// Private synchronous primitive execution loan. Only the engine's current
// cached operation supplies this context; it never survives an awaited result.
const active = new WeakMap();
// The engine loan and Number-input adapter share this explicit role table.
// A loan alone does not authorize interpretation of arbitrary input sockets.
const roles=Object.freeze(Object.fromEntries(Object.entries({
    arcade_createCallable:[],arcade_objectField:[],
    arcade_throwValue:['VALUE'],arcade_createOwnedImageSprite:['KIND'],
    arcade_returnValue:['VALUE'],arcade_functionArgument:['VALUE'],
    arcade_setLocal:['VALUE'],arcade_setCaptured:['VALUE'],
    arcade_setObjectField:['VALUE'],arcade_inspectValue:['VALUE','LIMIT'],
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
    try {return primitive();}finally{active.delete(runtime);}
}
function current(util,args) {
    const record=util?.runtime && active.get(util.runtime);
    return record && record.util===util && record.args===args && owned(record) ? record.block : null;
}
module.exports=Object.freeze({invoke,current,handles,permitsNumberInput});
