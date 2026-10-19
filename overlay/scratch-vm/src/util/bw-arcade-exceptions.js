// Stable function identities are published before dependency evaluation. No
// failure routing call is made until all three cyclic modules finish loading.
const failureApply=Reflect.apply,failureFreeze=Object.freeze;
const failureDescriptor=Object.getOwnPropertyDescriptor,failureOwn=Object.hasOwn;
const failureError=Error;
const nativeWeakGet=WeakMap.prototype.get,nativeWeakSet=WeakMap.prototype.set;
const nativeWeakHas=WeakMap.prototype.has,nativeWeakDelete=WeakMap.prototype.delete;
const nativeSetAdd=WeakSet.prototype.add,nativeSetHas=WeakSet.prototype.has;
const failureGet=(map,key)=>failureApply(nativeWeakGet,map,[key]);
const failureSet=(map,key,value)=>failureApply(nativeWeakSet,map,[key,value]);
const failureHas=(map,key)=>failureApply(nativeWeakHas,map,[key]);
const failureDelete=(map,key)=>failureApply(nativeWeakDelete,map,[key]);
const signalAdd=(set,key)=>failureApply(nativeSetAdd,set,[key]);
const signalHas=(set,key)=>failureApply(nativeSetHas,set,[key]);
module.exports=failureFreeze({__proto__:null,rejectConditionWait,create,consume,failed,capture,stale,diagnostic,reported,arrayCoordinatorReady,rejectArrayOperation});
const primitiveOwner = require('./bw-primitive-owner');
const cachedPrimitiveOwner = require('./bw-cached-primitive-owner');
const consumeArrayFailureLease=require('./bw-array-operations').consumeFailureLease;

// Neither an Error property nor a serialized value can grant exceptional
// completion. Only the current primitive may issue a signal for this runtime.
const owners = new WeakMap();
const signals = new WeakMap();
const publishedSignals = new WeakSet();
const failedThreads = new WeakMap();
const promiseLeases = new WeakMap();
const callerLeases = new WeakMap();

function failureStack(thread) {
    const saved=[];for(let i=0;i<thread.stack.length;i++)saved[i]=thread.stack[i];
    return failureFreeze(saved);
}
function create(runtime, readValue, consumePhysicalUpdate = null) {
    if (!runtime || typeof runtime.on !== 'function' || !Array.isArray(runtime.targets)) {
        return Object.freeze({raise() {throw new Error('Arcade Throw requires a bound runtime');},
            rejectConstraint() {throw new Error('Arcade constraint rejection requires a bound runtime');},
            rejectArrayOperation() {throw new Error('Array operation rejection requires a bound runtime');},
            arrayReady:()=>false,
            failure: () => null, captureCaller:()=>null,releaseCaller() {}, rethrow() {}, dispose() {}});
    }
    if (failureHas(owners,runtime)) throw new Error('Arcade exception runtime already has an owner');
    let active = false, disposed = false, generation = 0;
    const failures = new WeakMap(), edges = new WeakMap();
    const live = thread => active && !disposed && runtime.threads?.includes(thread) && !thread.isKilled &&
        thread.status!==thread.constructor.STATUS_DONE && thread.stack?.length>0 &&
        runtime.targets.includes(thread.target) && thread.blockContainer === thread.target.blocks;
    const failure = thread => failureGet(failures,thread) || null;
    const owned = signal => failureGet(signals,signal)?.runtime === runtime;
    const listeners = new Map();
    const listen = (event, handler) => {listeners.set(event, handler);runtime.on(event, handler);};
    const cancel = () => {active = false;generation++;};
    const retireLineage = (thread,signal) => {
        // Mark the complete actual lineage before any cleanup can settle
        // a pending operation. A detached event has no implicit parent.
        const lineage = [];
        for (let current = thread; current && !failureHas(failures,current);) {
            failureSet(failures,current, signal);failureSet(failedThreads,current, {runtime, signal});lineage[lineage.length]=current;
            const edge = failureGet(edges,current);
            current = edge?.generation === generation ? edge.caller : null;
        }
        try {
            const cleanupErrors = [];
            for (let index=0;index<lineage.length;index++) {
                const current=lineage[index];
                const edge = failureGet(edges,current);failureDelete(edges,current);
                try {edge?.cleanup(signal);} catch (error) {cleanupErrors[cleanupErrors.length]=error;}
                finally {runtime.sequencer.retireThread(current);}
            }
            if (cleanupErrors.length) signal.cause = new AggregateError(cleanupErrors, 'Arcade invocation cleanup failed');
            runtime.emit('BLOCKS_ERROR', signal);
            signalAdd(publishedSignals,signal);
        } finally {throw signal;}
    };
    const owner = Object.freeze({
        failure,
        captureCaller(args,util) {
            if (!live(util?.thread)) return null;
            if (!cachedPrimitiveOwner(runtime,util,args,'arcade_createObject',[])) return null;
            const lease=Object.freeze({});
            failureSet(callerLeases,lease,{owner,thread:util.thread,frame:util.thread.peekStackFrame(),generation});
            return lease;
        },
        releaseCaller(lease) {if(lease) failureDelete(callerLeases,lease);},
        capture(thread) {
            if (!live(thread) || runtime.sequencer.activeThread !== thread) return null;
            const lease=Object.freeze({}), frame=thread.peekStackFrame();
            failureSet(promiseLeases,lease,{owner,runtime,thread,frame,generation});
            return lease;
        },
        current(lease) {
            const record=failureGet(promiseLeases,lease);
            return Boolean(record && record.owner===owner && record.generation===generation &&
                live(record.thread) && record.thread.stackFrames.includes(record.frame));
        },
        rethrow(error) {if (owned(error)) throw error;},
        link(child, caller, cleanup = () => {}, lease = null) {
            const record=lease && failureGet(callerLeases,lease);
            const retained=record?.owner===owner && record.thread===caller && record.generation===generation &&
                caller.stackFrames.includes(record.frame);
            if (!live(child) || !live(caller) || child === caller || (!retained && runtime.sequencer.activeThread !== caller) ||
                child.target !== caller.target || typeof cleanup !== 'function' || failureHas(edges,child)) {
                throw new Error('Arcade exception edge requires an actual managed call');
            }
            for (let parent = caller; parent; parent = failureGet(edges,parent)?.caller) {
                if (parent === child) throw new Error('Cyclic Arcade exception edge');
            }
            const edge = {caller, cleanup, generation};
            failureSet(edges,child, edge);
            return () => {if (failureGet(edges,child) === edge) failureDelete(edges,child);};
        },
        linkPhysicalUpdate(child,args,util,cleanup) {
            // This consumer is captured by the actual extension constructor.
            // Neither a missing caller nor public tags can mint a root edge.
            if (!live(child) || util?.thread!==undefined || typeof cleanup!=='function' || failureHas(edges,child) ||
                typeof consumePhysicalUpdate!=='function')
                throw new Error('Arcade physical update requires its private current entry');
            const witness=consumePhysicalUpdate(child,args,util);
            if (!witness || witness.target!==child.target || !live(child))
                throw new Error('Arcade physical update requires its private current entry');
            const edge={caller:null,cleanup,generation};
            failureSet(edges,child,edge);
            return ()=>{if(failureGet(edges,child)===edge)failureDelete(edges,child);};
        },
        raise(args, util) {
            const thread = util?.thread;
            const block = primitiveOwner.current(util, args);
            if (!live(thread) || util.runtime !== runtime || block?.opcode !== 'arcade_throwValue') {
                throw new Error('Arcade Throw requires its current physical primitive');
            }
            // Read while the actual primitive's Number-input loan is live.
            const value = readValue(args, util);
            if (value!==null && !['undefined','boolean','number','string'].includes(typeof value)) {
                throw new Error('Arcade Throw currently requires a primitive thrown value');
            }
            const signal = new Error('Arcade uncaught thrown value: ' + String(value));
            const record = Object.freeze({owner, runtime, generation, value, target: thread.target,
                block: block.id, stack: Object.freeze([...thread.stack])});
            failureSet(signals,signal, record);
            retireLineage(thread,signal);
        },
        arrayReady() {return active&&!disposed;},
        rejectArrayOperation(args,util,error,lease,failureBlock) {
            const thread=util?.thread;
            if(failureGet(signals,error)?.runtime===runtime&&failure(thread)===error)throw error;
            if(failureHas(signals,error))throw error;
            const message=error instanceof failureError&&failureDescriptor(error,'message');
            if(!message||!failureOwn(message,'value')||typeof message.value!=='string')throw Error('Array operation rejection requires its private Error');
            const prior=failure(thread);if(prior)throw prior;
            // A graph/cache/registration change may itself require rejection.
            // The unforgeable lease validates the original still-active call,
            // not the now-invalid source metadata. No other Error is adopted.
            if(!live(thread)||util.runtime!==runtime)throw Error('Array operation rejection requires its private failure lease');
            const witness=consumeArrayFailureLease(runtime,args,util,error,lease,failureBlock);
            if(!witness)throw Error('Array operation rejection requires its private failure lease');
            const signal=new failureError(message.value,{cause:error});
            failureSet(signals,signal,failureFreeze({owner,runtime,generation,kind:'array-constraint',message:message.value,target:thread.target,block:witness.block,stack:failureStack(thread)}));
            retireLineage(thread,signal);
        },
        rejectPrimitiveFault(args,util,error,lease) {
            const thread=util?.thread;
            if(failureHas(signals,error))throw error;
            const prior=failure(thread);if(prior)throw prior;
            if(!live(thread)||util.runtime!==runtime)throw Error('Primitive fault requires its live actual caller');
            const witness=require('./bw-null-sprite-getter').consume(runtime,args,util,error,lease);
            if(!witness)throw Error('Primitive fault requires its private current receipt');
            // Preserve the actual privately issued TypeError, never a public
            // Error tag or copied message. Shared lineage cleanup is unchanged.
            failureSet(signals,error,Object.freeze({owner,runtime,generation,kind:'primitive-fault',message:error.message,
                property:witness.property,target:thread.target,block:witness.block,stack:Object.freeze([...thread.stack])}));
            retireLineage(thread,error);
        },
        rejectConditionWait(thread,error) {
            const witness=require('./bw-source-condition-waits').consumeFailure(runtime,thread,error);
            if(!witness || !live(thread))throw Error('Source condition rejection requires its private current wait');
            const signal=new Error(error.message,{cause:error});
            failureSet(signals,signal,Object.freeze({owner,runtime,generation,kind:'condition-wait',message:error.message,
                target:thread.target,block:witness.block,stack:Object.freeze([...thread.stack])}));
            retireLineage(thread,signal);
        },
        rejectConstraint(args,util,error) {
            const thread=util?.thread,priorIssued=failureGet(signals,error);
            if(priorIssued?.runtime===runtime&&failure(thread)===error)throw error;
            const block=primitiveOwner.current(util,args);
            if(!live(thread)||util.runtime!==runtime||!['procedures_call','arcade_callFunction','arcade_setLocal','arcade_setCaptured'].includes(block?.opcode))
                throw new Error('Arcade constraint rejection requires its actual current primitive');
            cachedPrimitiveOwner(runtime,util,args,block.opcode,[]);
            // Existing issued failures never become a second failure or acquire
            // another runtime's ownership through this entry point.
            if(failureHas(signals,error))throw error;
            const message=error instanceof Error&&Object.getOwnPropertyDescriptor(error,'message');
            if(!message||!Object.prototype.hasOwnProperty.call(message,'value')||typeof message.value!=='string')
                throw new Error('Arcade constraint rejection requires an actual Error diagnostic');
            const prior=failure(thread);if(prior)throw prior;
            const signal=new Error(message.value,{cause:error});
            failureSet(signals,signal,Object.freeze({owner,runtime,generation,kind:'constraint',message:message.value,
                target:thread.target,block:block.id,stack:Object.freeze([...thread.stack])}));
            retireLineage(thread,signal);
        },
        dispose() {
            if (disposed) return;
            cancel();disposed = true;
            for (const [event, listener] of listeners) runtime.off(event, listener);
            listeners.clear();
            if (failureGet(owners,runtime) === owner) failureDelete(owners,runtime);
            // Keep weak tombstones for promises already registered by this
            // owner. A new project must never revive their continuations.
        }
    });
    failureSet(owners,runtime, owner);
    listen('PROJECT_START', () => {generation++;if (!disposed) active = true;});
    listen('PROJECT_STOP_ALL', cancel);
    listen('PROJECT_LOADED', cancel);
    listen('RUNTIME_DISPOSED', owner.dispose);
    return owner;
}

// Engine hooks consume only privately issued signals for this exact thread.
// A stale signal is still recognized so it cannot enter Scratch's ordinary
// rejection path and resume an old thread after Stop/Start.
function consume(runtime, thread, error) {
    return Boolean(failureGet(signals,error)?.runtime === runtime && failureGet(failedThreads,thread)?.signal === error);
}
function failed(runtime, thread) {return failureGet(failedThreads,thread)?.runtime === runtime;}
function capture(runtime,thread) {return failureGet(owners,runtime)?.capture(thread) || null;}
function diagnostic(runtime,error) {
    const record=failureGet(signals,error);
    return record?.runtime===runtime ? ['constraint','array-constraint','condition-wait','primitive-fault'].includes(record.kind) ? Object.freeze({kind:record.kind,message:record.message,block:record.block,target:record.target.id}) : Object.freeze({value:record.value,block:record.block,target:record.target.id}) : null;
}
// A copied message or privately issued but unpublished signal is insufficient.
// This is a read-only publication fact, never an activation or exception loan.
function reported(runtime,error) {
    return failureGet(signals,error)?.runtime===runtime && signalHas(publishedSignals,error);
}
function stale(runtime,thread,lease) {
    if (failed(runtime,thread)) return true;
    if (lease===null) return false; // Ordinary Scratch, no active Arcade owner.
    const record=failureGet(promiseLeases,lease);
    return !record || record.runtime!==runtime || record.thread!==thread || !record.owner.current(lease);
}

function arrayCoordinatorReady(runtime) {return !!failureGet(owners,runtime)?.arrayReady();}
function rejectArrayOperation(runtime,args,util,error,lease,failureBlock) {const owner=failureGet(owners,runtime);if(!owner)throw Error('Array operation rejection requires a shared exception owner');return owner.rejectArrayOperation(args,util,error,lease,failureBlock);}
function rejectConditionWait(runtime,thread,error) {
    const owner=failureGet(owners,runtime);
    if(!owner)throw Error('Source condition rejection requires the current Arcade exception owner');
    return owner.rejectConditionWait(thread,error);
}
