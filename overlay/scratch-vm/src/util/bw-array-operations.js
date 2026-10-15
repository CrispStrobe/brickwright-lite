// Opt-in native Array operation ownership, NOT an element/type certificate.
// Only trusted builtin construction receives a module-held registration token.
const primitiveOwner = require('./bw-primitive-owner');
const cachedOwner = require('./bw-cached-primitive-owner');
const values = require('./bw-values');
const exceptions = require('./bw-arcade-exceptions');
const registrations = new WeakMap(), tickets = new WeakMap(), failures = new WeakMap();
const bodies = new WeakMap(), references = new Map(), inflight = new WeakMap();
const allocationMethods = new Set(['createReference','create1D','create2D','createEmpty','createZeros','createRange','referenceSlice','referenceConcat']);
const methods = new Set(["create1D", "create2D", "createEmpty", "createZeros", "createRange", "delete", "get", "get2D", "getMulti", "set", "set2D", "setMulti", "push", "pop", "insert", "remove", "length", "shape", "contains", "indexOf", "slice", "getRow", "getColumn", "map", "filter", "reduce", "sort", "reverse", "sum", "mean", "min", "max", "transpose", "flatten", "reshape", "toJSON", "toString", "listAll", "namedReference", "referenceValues", "createReference", "parseLegacyValue", "jsonValue", "referenceTruthy", "referenceItem", "referenceRemove", "referenceRandom", "referenceLength", "referenceSlice", "referenceConcat", "referenceIndexOf", "referenceTake", "mutateReference", "showTable", "hideTable", "setTableTitle", "setTableStyle", "markCell", "unmarkCell", "clearMarks", "isMarked", "markedCount"]);
const ownData = (object,key) => object && Object.getOwnPropertyDescriptor(object,key);
const exactReference = value => {
    if (!value || typeof value !== 'object' || Reflect.ownKeys(value).join(',') !== 'bwReference') return false;
    const outer = ownData(value,'bwReference');
    if (!outer || !Object.hasOwn(outer,'value') || !outer.value || typeof outer.value!=='object') return false;
    const ref=outer.value,keys=Reflect.ownKeys(ref);
    if(keys.length!==3||!['kind','id','scope'].every(key=>keys.includes(key)))return false;
    return ['kind','id','scope'].every(key=>Object.hasOwn(ownData(ref,key)||{},'value')) &&
        ref.kind==='array' && typeof ref.id==='string' && typeof ref.scope==='string';
};
const tuple = value => {
    const outer=ownData(value,'bwReference');
    const ref=outer && Object.hasOwn(outer,'value') && outer.value;
    if(!ref || typeof ref!=='object')return null;
    const fields=['kind','id','scope'].map(key=>ownData(ref,key));
    if(fields.some(field=>!field||!Object.hasOwn(field,'value')))return null;
    if(fields[0].value!=='array'||typeof fields[1].value!=='string'||typeof fields[2].value!=='string')return null;
    return JSON.stringify(fields.map(field=>field.value));
};
const collected=typeof FinalizationRegistry==='function'?new FinalizationRegistry(({key,weak})=>{
    if(references.get(key)===weak)references.delete(key);
}):null;
function registerSource(source) {
    if(typeof source!=='string'||!source)throw Error('Array operation registration requires actual source bytes');
    const token=Object.freeze({});registrations.set(token,source);return token;
}
function current(record) {
    return !record.closed && record.state.active && !record.state.disposed &&
        record.generation===record.state.generation && record.instance()===record.boundInstance &&
        primitiveOwner.current(record.util,record.args)===record.block &&
        record.runtime.getOpcodeFunction(record.block.opcode)===record.primitive &&
        record.util.thread===record.thread && record.thread.peekStack()===record.root;
}
function consumeFailureLease(runtime,args,util,error,lease) {
    const saved=failures.get(lease);
    if(!saved||saved.error!==error||saved.record.runtime!==runtime||saved.record.args!==args||saved.record.util!==util||!current(saved.record))return false;
    failures.delete(lease);return true;
}
function bind(runtime,registration,source,instance) {
    if(!registrations.has(registration)||registrations.get(registration)!==source)throw Error('Array operation registration/source binding differs');
    if(!runtime||typeof runtime.on!=='function'||typeof runtime.off!=='function'||!Array.isArray(runtime.targets)||typeof instance!=='function'||typeof WeakRef!=='function')throw Error('Array operations require their bound runtime');
    const binding=Object.freeze({});
    let state={active:false,disposed:false,generation:0,lastTargets:new Set(runtime.targets)};
    const invalidate=()=>{state.active=false;state.generation++;};
    runtime.on('PROJECT_START',()=>{state.generation++;if(!state.disposed){state.active=true;state.lastTargets=new Set(runtime.targets);}});
    runtime.on('PROJECT_STOP_ALL',invalidate);
    runtime.on('RUNTIME_DISPOSED',()=>{invalidate();state.disposed=true;});
    runtime.on('PROJECT_LOADED',()=>{
        const fresh=runtime.targets.some(target=>target.blocks&&!state.lastTargets.has(target));
        if(state.disposed&&fresh&&instance()&&registrations.get(registration)===source)state={active:false,disposed:false,generation:state.generation+1,lastTargets:new Set(runtime.targets)};
        else invalidate();
    });
    const reject=(record,message)=>{
        const error=new Error('Array operation ownership: '+message);
        if(record&&current(record)&&exceptions.arrayCoordinatorReady(runtime)){
            const lease=Object.freeze({});failures.set(lease,{record,error});
            try {return exceptions.rejectArrayOperation(runtime,record.args,record.util,error,lease);}
            finally {failures.delete(lease);}
        }
        throw error;
    };
    const checkBody=(record,body)=>{
        const saved=body&&typeof body==='object'&&bodies.get(body);
        if(!saved)return;
        if(!record||!current(record))reject(record,'tracked Array requires its current operation');
        if(saved.runtime!==runtime||saved.state!==state||saved.generation!==state.generation||saved.state.disposed||!state.active)reject(record,'foreign or stale Array body');
    };
    const scan=(record,value,seen=new Set())=>{
        if(!value||typeof value!=='object'||seen.has(value))return;
        seen.add(value);checkBody(record,value);
        const key=tuple(value),known=key&&references.get(key)?.deref();
        if(exactReference(value))checkBody(record,values.arrayValue(runtime,value));
        if(known){if(!exactReference(value))reject(record,'tracked reference requires its exact raw shape');checkBody(record,known);
            if(values.arrayValue(runtime,value)!==known)reject(record,'reference/body scope differs');}
        for(const property of Reflect.ownKeys(value)){
            const descriptor=ownData(value,property);
            if(!descriptor||!Object.hasOwn(descriptor,'value')){
                if(record)reject(record,'operation inputs require data properties');
                continue;
            }
            scan(record,descriptor.value,seen);
        }
    };
    const service=Object.freeze({
        begin(method,args,util){
            if(!methods.has(method))throw Error('Array operation method is not registered');
            if(!state.active||state.disposed||!exceptions.arrayCoordinatorReady(runtime)||util?.runtime!==runtime)return undefined;
            const block=primitiveOwner.current(util,args);
            if(block?.opcode!=='arrays_'+method)return undefined;
            cachedOwner(runtime,util,args,block.opcode,[]);
            const boundInstance=instance();if(!boundInstance)return undefined;
            const previous=inflight.get(runtime);
            if(previous&&!previous.closed&&previous.thread===util.thread)reject(previous,'current Array operation cannot be reentered');
            const ticket=Object.freeze({}),record={runtime,binding,state,generation:state.generation,args,util,thread:util.thread,root:util.thread.peekStack(),block,primitive:runtime.getOpcodeFunction(block.opcode),instance,boundInstance,method,closed:false,previous};
            tickets.set(ticket,record);inflight.set(runtime,record);return ticket;
        },
        access(ticket,facts){
            const record=tickets.get(ticket);
            if(record&&(record.runtime!==runtime||record.binding!==binding))throw Error('Array operation ticket belongs to another binding');
            if(record&&!current(record))reject(null,'operation ticket is stale');
            if(!facts||facts.runtime!==runtime||!Object.isFrozen(facts)||record&&facts.opcode!==record.method)reject(record,'actual supplier access binding differs');
            scan(record,facts.raw);scan(record,facts.body);
            if(facts.kind==='escape'&&facts.body&&bodies.has(facts.body))reject(record,'tracked Array cannot escape to a legacy callback');
        },
        finish(ticket,result,facts){
            const record=tickets.get(ticket);if(!record)return;
            if(record.runtime!==runtime||record.binding!==binding)throw Error('Array operation completion belongs to another binding');
            const close=()=>{record.closed=true;tickets.delete(ticket);if(inflight.get(runtime)===record){if(record.previous&&!record.previous.closed)inflight.set(runtime,record.previous);else inflight.delete(runtime);}};
            // The original private failure must survive supplier finally cleanup.
            if(facts?.status==='throw'){close();return;}
            try {
                if(!current(record)||facts?.runtime!==runtime||facts.opcode!==record.method||facts.status!=='return'||!Object.isFrozen(facts))reject(record,'completion ticket differs');
                scan(record,result);scan(record,facts.body);
                if(allocationMethods.has(record.method)&&Array.isArray(facts.body)){
                    const known=bodies.get(facts.body);
                    if(known)checkBody(record,facts.body);
                    else bodies.set(facts.body,{runtime,state,generation:state.generation});
                    if(exactReference(result)&&values.arrayValue(runtime,result)!==facts.body)reject(record,'completed allocation/body differs');
                }
                if(exactReference(result)){
                    const body=values.arrayValue(runtime,result);
                    if(body&&bodies.has(body)){
                        checkBody(record,body);const key=tuple(result),weak=new WeakRef(body);
                        references.set(key,weak);collected?.register(body,{key,weak});
                    }
                }
            } finally {close();}
        }
    });
    return service;
}
module.exports=Object.freeze({registerSource,bind,consumeFailureLease});
