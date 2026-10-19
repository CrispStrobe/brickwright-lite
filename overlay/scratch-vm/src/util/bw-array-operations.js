// Stable entry exports close the owner -> exceptions -> operations CJS cycle.
// All values are hoisted function declarations, invoked only after boot completes.
const primitiveFreeze=Object.freeze;
module.exports=primitiveFreeze({__proto__:null,registerSource,bind,consumeFailureLease});
// Opt-in native Array operation ownership, NOT an element/type certificate.
// Only trusted builtin construction receives a module-held registration token.
const primitiveOwner = require('./bw-primitive-owner');
const cachedOwner = require('./bw-cached-primitive-owner');
const values = require('./bw-values');
const exceptions = require('./bw-arcade-exceptions');
// Close backing/decoder authority before extension or guest coercion effects.
const valueLookup=values.arrayValue,valueDecode=values.decode,valueReference=values.arrayReference;
const identityLookup=values.existingArrayByIdentity;
const nativeReferenceMetadata=values.hasNativeReferenceMetadata;
const literalParser=JSON.parse;
const registrations = new WeakMap(), tickets = new WeakMap(), failures = new WeakMap();
const bodies = new WeakMap(), references = new Map(), inflight = new WeakMap();
const parsedMetadata = new WeakMap();
const allocationMethods = new Set(['createReference','create1D','create2D','createEmpty','createZeros','createRange','referenceSlice','referenceConcat']);
const methods = new Set(["valueBinary", "create1D", "create2D", "createEmpty", "createZeros", "createRange", "delete", "get", "get2D", "getMulti", "set", "set2D", "setMulti", "push", "pop", "insert", "remove", "length", "shape", "contains", "indexOf", "slice", "getRow", "getColumn", "map", "filter", "reduce", "sort", "reverse", "sum", "mean", "min", "max", "transpose", "flatten", "reshape", "toJSON", "toString", "listAll", "namedReference", "referenceValues", "createReference", "parseLegacyValue", "jsonValue", "referenceTruthy", "referenceItem", "referenceRemove", "referenceRandom", "referenceLength", "referenceSlice", "referenceConcat", "referenceIndexOf", "referenceTake", "mutateReference", "showTable", "hideTable", "setTableTitle", "setTableStyle", "markCell", "unmarkCell", "clearMarks", "isMarked", "markedCount"]);
// The primitive loan performs no user coercion. Capture its inspection ingress
// before extension code runs, and refuse changed intrinsic descriptor surfaces.
const primitiveKeys=Reflect.ownKeys, primitiveDescriptor=Object.getOwnPropertyDescriptor,primitiveOwn=Object.hasOwn, primitiveFrozen=Object.isFrozen;
const primitivePrototype=Object.getPrototypeOf, primitiveSame=Object.is;
const primitiveExtensible=Object.isExtensible;
const primitiveWeakRefConstructor=typeof WeakRef==='function'?WeakRef:null;
const weakPrototypeDescriptor=primitiveWeakRefConstructor&&primitiveDescriptor(primitiveWeakRefConstructor,'prototype');
const primitiveWeakRefPrototype=weakPrototypeDescriptor&&primitiveOwn(weakPrototypeDescriptor,'value')?weakPrototypeDescriptor.value:null;
const weakDerefDescriptor=primitiveWeakRefPrototype&&primitiveDescriptor(primitiveWeakRefPrototype,'deref');
const primitiveDeref=weakDerefDescriptor&&primitiveOwn(weakDerefDescriptor,'value')&&typeof weakDerefDescriptor.value==='function'?weakDerefDescriptor.value:null;
const primitiveFinalizationRegister=typeof FinalizationRegistry==='function'?FinalizationRegistry.prototype.register:null;
const primitiveArray=Array.isArray, primitiveText=String, primitiveNumber=Number;
const primitiveInteger=Number.isInteger, primitiveApply=Reflect.apply;
const primitiveWeakGet=WeakMap.prototype.get, primitiveWeakSet=WeakMap.prototype.set;
const primitiveWeakDelete=WeakMap.prototype.delete, primitiveWeakHas=WeakMap.prototype.has;
const leaseGet=(map,key)=>primitiveApply(primitiveWeakGet,map,[key]);
const leaseSet=(map,key,value)=>primitiveApply(primitiveWeakSet,map,[key,value]);
const leaseDelete=(map,key)=>primitiveApply(primitiveWeakDelete,map,[key]);
const primitiveSetHas=Set.prototype.has,primitiveSetAdd=Set.prototype.add,primitiveSetDelete=Set.prototype.delete;
const primitiveUndefined=values.UNDEFINED;
const primitiveSetSize=Object.getOwnPropertyDescriptor(Set.prototype,'size').get;
const primitiveMapGet=Map.prototype.get,primitiveMapSet=Map.prototype.set;
const primitiveMapConstructor=Map,primitiveWeakMapConstructor=WeakMap;
const primitiveError=Error, primitiveRealm=globalThis;
const primitiveErrorInstance=Function.prototype[Symbol.hasInstance];
const primitiveGlobals=['globalThis','Array','Object','Reflect','WeakMap','Map','Set','Number','String','JSON','WeakRef']
    .map(key=>({key,descriptor:primitiveDescriptor(primitiveRealm,key)}));
const primitiveRoots=[values,JSON,Number,String,Array,Array.prototype,Object,Object.prototype,Reflect,Function,Function.prototype,
    WeakMap,WeakMap.prototype,Map,Map.prototype,Set,Set.prototype];
if(primitiveWeakRefConstructor)primitiveRoots.push(primitiveWeakRefConstructor);
if(primitiveWeakRefPrototype)primitiveRoots.push(primitiveWeakRefPrototype);
for(const sample of [[][Symbol.iterator](),new Map().entries(),new Set().values()]){
    let prototype=primitivePrototype(sample);
    while(prototype){if(!primitiveRoots.includes(prototype))primitiveRoots.push(prototype);prototype=primitivePrototype(prototype);}
}
const primitiveIntrinsics=primitiveRoots.map(object=>({object,prototype:primitivePrototype(object),
    keys:primitiveKeys(object),descriptors:primitiveKeys(object).map(key=>primitiveDescriptor(object,key))}));
const samePrimitiveDescriptor=(actual,saved)=>{
    if(!actual||!saved)return actual===saved;
    const fields=['value','writable','get','set','configurable','enumerable'];
    for(let i=0;i<fields.length;i++){
        const key=fields[i],hasActual=primitiveOwn(actual,key),hasSaved=primitiveOwn(saved,key);
        if(hasActual!==hasSaved||(hasActual&&!primitiveSame(actual[key],saved[key])))return false;
    }
    return true;
};
const primitiveIntrinsicsCurrent=()=>{
    for(let i=0;i<primitiveGlobals.length;i++){
        const row=primitiveGlobals[i],actual=primitiveDescriptor(primitiveRealm,row.key),saved=row.descriptor;
        if(!actual&&!saved)continue;
        if(!samePrimitiveDescriptor(actual,saved))return false;
    }
    for(let i=0;i<primitiveIntrinsics.length;i++){
        const row=primitiveIntrinsics[i],keys=primitiveKeys(row.object);
        if(primitivePrototype(row.object)!==row.prototype||keys.length!==row.keys.length)return false;
        for(let j=0;j<keys.length;j++){
            if(keys[j]!==row.keys[j])return false;
            const actual=primitiveDescriptor(row.object,keys[j]),saved=row.descriptors[j];
            if(!samePrimitiveDescriptor(actual,saved))return false;
        }
    }
    return true;
};
const ownData = (object,key) => object && primitiveDescriptor(object,key);
// Read raw objects only through captured reflection. A primitive identity copy
// is consumed by the closed existing-heap service; raw Proxy gets never cross
// that service boundary. Reflection may execute traps, so callers fence after it.
const referenceIdentity = value => {
    if(!value||typeof value!=='object')return null;
    const keys=primitiveKeys(value);
    if(keys.length!==1||keys[0]!=='bwReference')return null;
    const outer=primitiveDescriptor(value,'bwReference');
    if(!outer||!(primitiveOwn(outer,'value'))||!outer.value||typeof outer.value!=='object')return null;
    const ref=outer.value,inner=primitiveKeys(ref);
    if(inner.length!==3)return null;
    for(let i=0;i<inner.length;i++)if(inner[i]!=='kind'&&inner[i]!=='id'&&inner[i]!=='scope')return null;
    const kind=primitiveDescriptor(ref,'kind'),id=primitiveDescriptor(ref,'id'),scope=primitiveDescriptor(ref,'scope');
    if(!kind||!id||!scope||!(primitiveOwn(kind,'value'))||!(primitiveOwn(id,'value'))||!(primitiveOwn(scope,'value'))||
        kind.value!=='array'||typeof id.value!=='string'||typeof scope.value!=='string')return null;
    return {kind:kind.value,id:id.value,scope:scope.value};
};
// Failure detection must still recognize the existing owned body behind an
// extra-field wrapper. This identity never grants access or primitive authority;
// a detected tracked reference must subsequently pass exactReference or reject.
const failureReferenceIdentity = value => {
    if(!value||typeof value!=='object')return null;
    const outer=primitiveDescriptor(value,'bwReference');
    if(!outer||!primitiveOwn(outer,'value')||!outer.value||typeof outer.value!=='object')return null;
    const ref=outer.value,kind=primitiveDescriptor(ref,'kind'),id=primitiveDescriptor(ref,'id'),scope=primitiveDescriptor(ref,'scope');
    if(!kind||!id||!scope||!primitiveOwn(kind,'value')||!primitiveOwn(id,'value')||!primitiveOwn(scope,'value')||
        kind.value!=='array'||typeof id.value!=='string'||typeof scope.value!=='string')return null;
    return {kind:kind.value,id:id.value,scope:scope.value};
};
const exactReference = value => referenceIdentity(value)!==null;
const tuple = value => {
    const identity=referenceIdentity(value);
    return identity?JSON.stringify([identity.kind,identity.id,identity.scope]):null;
};
const lookupIdentity=(runtime,identity)=>identity&&identityLookup(runtime,identity.kind,identity.id,identity.scope);
const collected=typeof FinalizationRegistry==='function'?new FinalizationRegistry(({key,weak})=>{
    if(references.get(key)===weak)references.delete(key);
}):null;
function registerSource(source) {
    if(typeof source!=='string'||!source)throw Error('Array operation registration requires actual source bytes');
    const token=Object.freeze({});registrations.set(token,source);return token;
}
function ownsActualCall(record) {
    return !record.closed&&record.state.active&&!record.state.disposed&&
        record.generation===record.state.generation&&record.instance()===record.boundInstance&&
        (record.failureOnly?primitiveOwner.isFailureActive(record.failureCall,record.runtime,'arrays_'+record.method):
            primitiveOwner.isActiveCall(record.actualCall,record.util,record.args));
}
// Capture data without invoking metadata accessors. Identity alone cannot
// detect in-place changes to fields, input entries or mutation properties.
function captureMetadata(...values) {
    const objects=[],seen=new Set();
    const visit=value=>{
        if(!value||typeof value!=='object'||seen.has(value))return;
        seen.add(value);const keys=Reflect.ownKeys(value),descriptors=keys.map(key=>Object.getOwnPropertyDescriptor(value,key));
        if(descriptors.some(d=>!d||!primitiveOwn(d,'value')))throw Error('Array operation metadata requires data properties');
        objects.push({value,keys,descriptors});for(const d of descriptors)visit(d.value);
    };
    for(const value of values)visit(value);
    return ()=>objects.every(({value,keys,descriptors})=>{
        const currentKeys=Reflect.ownKeys(value);
        return currentKeys.length===keys.length&&keys.every((key,i)=>currentKeys[i]===key)&&
            keys.every((key,i)=>{const d=Object.getOwnPropertyDescriptor(value,key),saved=descriptors[i];
                return d&&primitiveOwn(d,'value')&&Object.is(d.value,saved.value)&&
                    d.enumerable===saved.enumerable&&d.configurable===saved.configurable&&d.writable===saved.writable;});
    });
}
// Capture each descriptor ONCE as it is observed. Rendering consumes these
// rows, never a later snapshot. Non-backing observations run before the final
// backing pass, so a raw reference trap cannot rewrite an already-checked body.
function primitiveObservations(localNative=null) {
    const rows=[],index=new primitiveWeakMapConstructor();
    const observe=value=>{
        const saved=primitiveApply(primitiveWeakGet,index,[value]);if(saved)return saved;
        const native=(localNative&&primitiveApply(primitiveWeakHas,localNative,[value]))||primitiveApply(primitiveWeakHas,bodies,[value])||
            primitiveApply(primitiveWeakHas,parsedMetadata,[value])||nativeReferenceMetadata(value);
        // Unknown objects may be Proxies. Only invariant immutable own-data
        // shapes can be admitted without native allocation provenance. Check
        // nonextensibility BEFORE key enumeration: keys cannot then be added.
        if(!native&&primitiveExtensible(value))throw new primitiveError('Array primitive mutable metadata has no native allocation proof');
        const row={value,native,prototype:primitivePrototype(value),keys:primitiveKeys(value),descriptors:[],fields:new primitiveMapConstructor()};
        if(row.keys.length>65537)throw new primitiveError('Array primitive metadata key bound exceeded');
        primitiveApply(primitiveWeakSet,index,[value,row]);rows[rows.length]=row;
        for(let i=0;i<row.keys.length;i++){
            const descriptor=primitiveDescriptor(value,row.keys[i]);
            if(!descriptor||!(primitiveOwn(descriptor,'value')))throw new primitiveError('Array primitive metadata requires data properties');
            if(!native&&(descriptor.configurable||descriptor.writable))throw new primitiveError('Array primitive unknown metadata requires invariant data');
            row.descriptors[i]=descriptor;
            primitiveApply(primitiveMapSet,row.fields,[row.keys[i],descriptor]);
        }
        return row;
    };
    const field=(row,key)=>primitiveApply(primitiveMapGet,row.fields,[key]);
    const check=row=>{
        if(primitivePrototype(row.value)!==row.prototype)return false;
        const keys=primitiveKeys(row.value);if(keys.length!==row.keys.length)return false;
        for(let j=0;j<keys.length;j++){
            if(keys[j]!==row.keys[j])return false;
            const actual=primitiveDescriptor(row.value,keys[j]),saved=row.descriptors[j];
            if(!actual||!(primitiveOwn(actual,'value'))||!primitiveSame(actual.value,saved.value)||
                actual.enumerable!==saved.enumerable||actual.configurable!==saved.configurable||actual.writable!==saved.writable)return false;
        }
        return true;
    };
    const observationsCurrent=()=>{
        // These rows may trap. All loans complete this phase before ANY loan's
        // final native pass. Their immutable invariants fix every saved field.
        for(let i=0;i<rows.length;i++)if(!rows[i].native&&!check(rows[i]))return false;
        return true;
    };
    const nativeCurrent=()=>{
        // Every target has actual native allocation provenance, not inferred
        // prototype/type spelling. Captured reflection here cannot call traps.
        for(let i=0;i<rows.length;i++)if(rows[i].native&&!check(rows[i]))return false;
        return true;
    };
    const current=()=>observationsCurrent()&&nativeCurrent();
    return {observe,field,current,observationsCurrent,nativeCurrent};
}
function captureContext(util,block) {
    const container=util.thread.blockContainer,seen=new Set();
    const path=id=>{
        if(seen.has(id))return null;seen.add(id);
        const node=container.getBlock(id);if(!node)return null;
        if(node===block)return [node];
        for(const input of Object.values(node.inputs||{}))if(input.block){const rest=path(input.block);if(rest)return [node,...rest];}
        return null;
    };
    const nodes=path(util.thread.peekStack());if(!nodes)throw Error('Array operation has no actual connected path');
    const keys=['id','opcode','parent','next','fields','inputs','mutation'];
    const records=nodes.map(node=>({node,id:node.id,descriptors:keys.map(key=>Object.getOwnPropertyDescriptor(node,key))}));
    if(records.some(r=>r.descriptors.some(d=>d&&!primitiveOwn(d,'value'))))throw Error('Array operation context requires data properties');
    const unchanged=captureMetadata(...nodes.flatMap(node=>[node.fields,node.inputs,node.mutation]));
    return ()=>records.every(({node,id,descriptors})=>container.getBlock(id)===node&&keys.every((key,i)=>{
        const now=Object.getOwnPropertyDescriptor(node,key),saved=descriptors[i];
        return !saved?!now:now&&primitiveOwn(now,'value')&&Object.is(now.value,saved.value)&&
            now.enumerable===saved.enumerable&&now.configurable===saved.configurable&&now.writable===saved.writable;
    }))&&unchanged();
}
function graphValid(record) {
    if(!ownsActualCall(record))return false;
    try {return record.metadataUnchanged()&&primitiveOwner.current(record.util,record.args)===record.block&&
        cachedOwner(record.runtime,record.util,record.args,record.opcode,[])===record.block;}
    catch {return false;}
}
function consumeFailureLease(runtime,args,util,error,lease,failureBlock,computationMarker) {
    const saved=leaseGet(failures,lease),record=saved?.record;
    if(!saved||saved.error!==error||record.runtime!==runtime||!ownsActualCall(record))return false;
    if(record.failureOnly){
        if(!primitiveOwner.isActiveCall(record.failureCall,util,args)||
            !primitiveOwner.isFailureActive(record.failureCall,runtime,'arrays_'+record.method,failureBlock)||
            typeof failureBlock!=='string')return false;
        // Internal dispatch supplies the original entry block ID. The boolean
        // token check binds it without exposing args/util or revalidating a
        // graph/cache change which can itself be the reason to reject.
        leaseDelete(failures,lease);return primitiveFreeze({block:failureBlock});
    }
    if(record.args!==args||record.util!==util)return false;
    leaseDelete(failures,lease);
    const witness={__proto__:null,block:record.blockId};
    if(saved.kind==='computation-throw')witness.computationMarker=computationMarker;
    return primitiveFreeze(witness);
}
function bind(runtime,registration,source,instance) {
    if(!registrations.has(registration)||registrations.get(registration)!==source)throw Error('Array operation registration/source binding differs');
    // Metadata construction must stay inert for its whole lifetime, even if a
    // caller subsequently attaches a real runtime. Inspect data descriptors;
    // initially malformed/accessor runtime shapes never call getters/listeners.
    const runtimeData=key=>{
        let object=runtime;
        for(let depth=0;object&&(typeof object==='object'||typeof object==='function')&&depth<64;depth++){
            const descriptor=primitiveDescriptor(object,key);
            if(descriptor)return primitiveOwn(descriptor,'value')?descriptor.value:undefined;
            object=primitivePrototype(object);
        }
    };
    let usable=false;
    try {usable=!!runtime&&typeof runtimeData('on')==='function'&&typeof runtimeData('off')==='function'&&
        primitiveArray(runtimeData('targets'))&&typeof instance==='function'&&primitiveWeakRefConstructor!==null&&primitiveDeref!==null;}catch {usable=false;}
    if(!usable){
        const refuse=()=>{throw new primitiveError('Array operations metadata binding is permanently inert');};
        return Object.freeze({begin:refuse,access:refuse,primitive:refuse,finish:refuse});
    }
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
    const rejectError=(record,error,kind='constraint')=>{
        if(record?.method==='valueBinary')record.primitiveExpired=true;
        if(record?.method==='createReference')record.literalExpired=true;
        if(record?.method==='createReference'&&!record.literalFailure)record.literalFailure=error;
        // Only this bound service can issue a lease. Already adopted signals
        // cannot pass ownsActualCall after retirement and are rethrown unchanged.
        if(record&&record.runtime===runtime&&record.binding===binding&&ownsActualCall(record)&&exceptions.arrayCoordinatorReady(runtime)){
            const lease=primitiveFreeze({});leaseSet(failures,lease,{record,error,kind});
            try {return record.failureOnly?primitiveOwner.dispatchArrayFailure(record.failureCall,error,lease):
                exceptions.rejectArrayOperation(runtime,record.args,record.util,error,lease);}
            finally {leaseDelete(failures,lease);}
        }
        throw error;
    };
    const reject=(record,message)=>rejectError(record,new primitiveError('Array operation ownership: '+message));
    const checkBody=(record,body)=>{
        const saved=body&&typeof body==='object'&&primitiveApply(primitiveWeakGet,bodies,[body]);
        if(!saved)return;
        if(!record||!ownsActualCall(record))reject(record,'tracked Array requires its current operation');
        if(saved.runtime!==runtime||saved.state!==state||saved.generation!==state.generation||saved.state.disposed||!state.active)reject(record,'foreign or stale Array body');
    };
    const scan=(record,value,seen=new Set())=>{
        if(!value||typeof value!=='object'||primitiveApply(primitiveSetHas,seen,[value]))return;
        primitiveApply(primitiveSetAdd,seen,[value]);checkBody(record,value);
        const identity=failureReferenceIdentity(value),key=identity&&JSON.stringify([identity.kind,identity.id,identity.scope]);
        const known=key&&(()=>{const weak=primitiveApply(primitiveMapGet,references,[key]);return weak&&primitiveApply(primitiveDeref,weak,[]);})();
        const lookedUp=lookupIdentity(runtime,identity);
        if((known||lookedUp&&primitiveApply(primitiveWeakHas,bodies,[lookedUp]))&&!exactReference(value))
            reject(record,'tracked reference requires its exact raw shape');
        if(identity)checkBody(record,lookedUp);
        if(known){checkBody(record,known);
            if(lookupIdentity(runtime,identity)!==known)reject(record,'reference/body scope differs');}
        for(const property of Reflect.ownKeys(value)){
            const descriptor=ownData(value,property);
            if(!descriptor||!primitiveOwn(descriptor,'value')){
                if(record)reject(record,'operation inputs require data properties');
                continue;
            }
            scan(record,descriptor.value,seen);
        }
    };
    const enrollAllocation=(record,body,deep,seen=new Set())=>{
        if(!primitiveArray(body)||primitiveApply(primitiveSetHas,seen,[body]))return;
        primitiveApply(primitiveSetAdd,seen,[body]);const known=primitiveApply(primitiveWeakGet,bodies,[body]);
        if(known)checkBody(record,body);else primitiveApply(primitiveWeakSet,bodies,[body,{runtime,state,generation:state.generation,
            primitiveEligible:record.method==='createReference'&&record.literalWitness===true}]);
        if(deep)for(const key of Reflect.ownKeys(body)){
            if(key==='length')continue;
            const descriptor=ownData(body,key);
            if(!descriptor||!primitiveOwn(descriptor,'value'))reject(record,'allocated Array requires data properties');
            if(primitiveArray(descriptor.value))enrollAllocation(record,descriptor.value,true,seen);
        }
    };
    const primitiveLoan=(record,facts)=>{
        const refuse=message=>{if(record)record.primitiveExpired=true;return reject(record,message);};
        if(!record||record.primitiveExpired)return refuse('Array primitive loan requires its current operation');
        if(!primitiveIntrinsicsCurrent())return refuse('Array primitive intrinsic surface changed');
        if(!graphValid(record))return refuse('current cached operation graph changed');
        if(record.method!=='valueBinary'||record.block.fields?.OP?.value!=='+'||
            !facts||!Object.isFrozen(facts)||facts.runtime!==runtime||facts.opcode!=='valueBinary'||
            (facts.slot!=='LEFT'&&facts.slot!=='RIGHT')||facts.raw!==record.args[facts.slot])
            return refuse('Array primitive operand binding differs');
        const active=new Set(),visited=new Set(),observed=primitiveObservations();
        let depth=0,items=0,characters=0;
        const append=text=>{
            characters+=text.length;
            if(characters>1024*1024)return refuse('Array primitive output bound exceeded');
            return text;
        };
        const arrayString=body=>{
            if(!primitiveArray(body)||!primitiveApply(primitiveWeakHas,bodies,[body]))return refuse('Array primitive requires an enrolled body');
            checkBody(record,body);
            if(!primitiveApply(primitiveWeakGet,bodies,[body]).primitiveEligible)return refuse('Array allocation has no primitive backing proof');
            if(primitiveApply(primitiveSetHas,active,[body]))return '';
            const earlyLength=primitiveDescriptor(body,'length');
            if(!earlyLength||!(primitiveOwn(earlyLength,'value')))return refuse('Array primitive length is not data');
            if(earlyLength.value>65536-items||depth>=128||
                (!primitiveApply(primitiveSetHas,visited,[body])&&primitiveApply(primitiveSetSize,visited,[])>=4096))
                return refuse('Array primitive graph bound exceeded');
            const row=observed.observe(body);
            if(row.prototype!==Array.prototype)return refuse('Array primitive prototype differs');
            const keys=row.keys,length=observed.field(row,'length');
            if(!length||!(primitiveOwn(length,'value'))||length.value!==earlyLength.value)return refuse('Array primitive length is not current data');
            for(let i=0;i<keys.length;i++){
                const key=keys[i];if(key==='length')continue;
                const index=typeof key==='string'?primitiveNumber(key):NaN;
                if(!primitiveInteger(index)||index<0||index>=length.value||primitiveText(index)!==key)
                    return refuse('Array primitive has custom properties');
                const d=observed.field(row,key);if(!d||!(primitiveOwn(d,'value')))return refuse('Array primitive element is not data');
            }
            primitiveApply(primitiveSetAdd,visited,[body]);items+=length.value;depth++;
            primitiveApply(primitiveSetAdd,active,[body]);let text='';
            for(let i=0;i<length.value;i++){
                if(i)text+=append(',');
                const descriptor=observed.field(row,primitiveText(i));
                if(descriptor)text+=elementString(descriptor.value);
            }
            primitiveApply(primitiveSetDelete,active,[body]);depth--;return text;
        };
        const referenceString=raw=>{
            const row=observed.observe(raw);
            if(row.keys.length!==1||row.keys[0]!=='bwReference')return refuse('Array primitive reference shape differs');
            const outer=observed.field(row,'bwReference');
            if(!outer||!outer.value||typeof outer.value!=='object')return refuse('Array primitive reference shape differs');
            const inner=observed.observe(outer.value);
            if(inner.keys.length!==3)return refuse('Array primitive reference shape differs');
            const kind=observed.field(inner,'kind'),id=observed.field(inner,'id'),scope=observed.field(inner,'scope');
            if(!kind||!id||!scope||kind.value!=='array'||typeof id.value!=='string'||typeof scope.value!=='string')
                return refuse('Array primitive reference shape differs');
            if((row.prototype!==Object.prototype&&row.prototype!==null)||(inner.prototype!==Object.prototype&&inner.prototype!==null))
                return refuse('Array primitive reference prototype differs');
            // No raw reference is observed between this fence and lookup.
            if(!primitiveIntrinsicsCurrent()||!graphValid(record)||!primitiveIntrinsicsCurrent())return refuse('Array primitive proof expired during reference observation');
            const body=identityLookup(runtime,kind.value,id.value,scope.value);
            if(!body)return refuse('Array primitive reference is foreign or expired');
            const key=JSON.stringify([kind.value,id.value,scope.value]);
            const registered=primitiveApply(primitiveMapGet,references,[key]);
            if(!registered||primitiveApply(primitiveDeref,registered,[])!==body)return refuse('Array primitive reference has no enrolled identity');
            return arrayString(body);
        };
        const elementString=value=>{
            if(value===null||value===undefined||value===primitiveUndefined)return '';
            if(typeof value==='number'||typeof value==='string'||typeof value==='boolean')return append(primitiveText(value));
            if(primitiveArray(value))return arrayString(value);
            if(!value||typeof value!=='object')return refuse('Array primitive element is unsupported');
            const row=observed.observe(value);
            if(observed.field(row,'bwReference'))return referenceString(value);
            const prototype=row.prototype;
            if(prototype!==Object.prototype&&prototype!==null)return refuse('Array primitive encoded value prototype differs');
            const keys=row.keys;
            if(keys.length===1){
                const key=keys[0],descriptor=observed.field(row,key);
                if(descriptor&&(primitiveOwn(descriptor,'value'))){
                    if(key==='bwUndefined'&&descriptor.value===true)return '';
                    if(key==='bwNumber'&&(descriptor.value==='NaN'||descriptor.value==='Infinity'||descriptor.value==='-Infinity'||descriptor.value==='-0'))
                        return append(primitiveText(primitiveNumber(descriptor.value)));
                }
            }
            return refuse('Array primitive element has no owned conversion');
        };
        const result=referenceString(facts.raw);
        if(!primitiveIntrinsicsCurrent()||!graphValid(record))return refuse('Array primitive proof expired during conversion');
        // This loan is not a retained value capability. Preserve its backing
        // data until operation.finish fences publication after the other
        // operand's generic conversion and any resulting callback effects.
        if(!record.primitiveLoans)record.primitiveLoans=[];
        if(!observed.current()||!primitiveIntrinsicsCurrent()||!graphValid(record)||!observed.current()||!primitiveIntrinsicsCurrent())
            return refuse('Array primitive backing changed during conversion');
        record.primitiveLoans.push({observationsCurrent:observed.observationsCurrent,nativeCurrent:observed.nativeCurrent});
        return result;
    };
    const service=Object.freeze({
        begin(method,args,util){
            const failureCall=(method==='valueBinary'||method==='createReference')&&
                primitiveOwner.captureFailureCall(runtime,'arrays_'+method);
            const failureRecord=failureCall?{runtime,binding,failureOnly:true,failureCall,
                state,generation:state.generation,instance,boundInstance:instance(),method,closed:false}:null;
            try {
            if(failureCall&&!primitiveOwner.current(util,args))
                reject(failureRecord,'tracked Array requires its current operation');
            if((method==='valueBinary'||method==='createReference')&&!primitiveIntrinsicsCurrent())throw Error('Array primitive intrinsic surface changed');
            if(!methods.has(method))throw Error('Array operation method is not registered');
            if(!state.active||state.disposed||!exceptions.arrayCoordinatorReady(runtime)||util?.runtime!==runtime)return undefined;
            const block=primitiveOwner.current(util,args);
            if(block?.opcode!=='arrays_'+method)return undefined;
            cachedOwner(runtime,util,args,block.opcode,[]);
            const boundInstance=instance();if(!boundInstance)return undefined;
            const previous=inflight.get(runtime);
            if(previous&&!previous.closed&&previous.thread===util.thread)reject(previous,'current Array operation cannot be reentered');
            const actualCall=primitiveOwner.captureActiveCall(util,args);if(!actualCall)return undefined;
            const ticket=Object.freeze({}),record={runtime,binding,actualCall,blockId:block.id,opcode:block.opcode,metadataUnchanged:captureContext(util,block),state,generation:state.generation,args,util,thread:util.thread,root:util.thread.peekStack(),block,primitive:runtime.getOpcodeFunction(block.opcode),instance,boundInstance,method,closed:false,previous};
            tickets.set(ticket,record);inflight.set(runtime,record);return ticket;
            }catch(error){return rejectError(failureRecord,error);}
        },
        access(ticket,facts){
            const record=primitiveApply(primitiveWeakGet,tickets,[ticket]);
            try {
            const literal=facts?.kind==='literal-ingress',literalBody=facts?.kind==='literal-body';
            if(literal){
                if(!primitiveIntrinsicsCurrent()){
                    const error=new primitiveError('Array literal intrinsic/value surface changed');
                    if(record){record.literalExpired=true;record.literalFailure=error;}
                    throw error;
                }
                if(!record||record.method!=='createReference'||record.literalWitness||record.literalExpired||
                    facts.slot!=='VALUES'||facts.raw!==record.args.VALUES||typeof facts.text!=='string'||
                    (typeof facts.raw==='string'&&facts.text!==facts.raw)||
                    facts.parser!==literalParser||facts.stringify!==primitiveText||
                    facts.decoder!==valueDecode||facts.lookup!==valueLookup||facts.reference!==valueReference)
                    reject(record,'Array literal allocation ingress differs');
            }
            if(record&&(record.runtime!==runtime||record.binding!==binding))throw Error('Array operation ticket belongs to another binding');
            if(record&&!ownsActualCall(record))reject(null,'operation ticket is stale');
            if(record&&!graphValid(record))reject(record,'current cached operation graph changed');
            if(!facts||facts.runtime!==runtime||!Object.isFrozen(facts)||record&&facts.opcode!==record.method)reject(record,'actual supplier access binding differs');
            if(literalBody){
                if(!record||record.method!=='createReference'||!record.literalWitness||record.literalExpired||record.literalBody||
                    facts.raw!==record.args.VALUES||!primitiveArray(facts.body)||!primitiveArray(facts.parsed)||facts.body===facts.parsed||
                    !primitiveIntrinsicsCurrent())reject(record,'Array literal fresh body witness differs');
                const parsed=new Set(),seen=new Set(),localNative=new primitiveWeakMapConstructor(),observed=primitiveObservations(localNative);
                record.literalNative=[];
                let parsedNodes=0;
                const collect=(value,depth=0)=>{
                    if(!value||typeof value!=='object'||primitiveApply(primitiveSetHas,seen,[value]))return;
                    if(++parsedNodes>65536||depth>128)reject(record,'Array literal allocation graph bound exceeded');
                    primitiveApply(primitiveSetAdd,seen,[value]);
                    primitiveApply(primitiveWeakSet,localNative,[value,true]);
                    record.literalNative[record.literalNative.length]=value;
                    const row=observed.observe(value);
                    if(row.keys.length>65537)reject(record,'Array literal allocation element bound exceeded');
                    if(primitiveArray(value)){
                        if(row.prototype!==Array.prototype)reject(record,'Array parsed prototype differs');
                        primitiveApply(primitiveSetAdd,parsed,[value]);
                    }
                    for(let i=0;i<row.descriptors.length;i++)collect(row.descriptors[i].value,depth+1);
                };
                collect(facts.parsed);
                primitiveApply(primitiveWeakSet,localNative,[facts.body,true]);
                const root=observed.observe(facts.body),length=observed.field(root,'length');
                if(root.prototype!==Array.prototype||!length||length.value!==facts.parsed.length)reject(record,'Array literal root differs');
                for(let i=0;i<length.value;i++){
                    const descriptor=observed.field(root,primitiveText(i));
                    if(!descriptor)reject(record,'Array literal root is not dense');
                    if(primitiveArray(descriptor.value)&&!primitiveApply(primitiveSetHas,parsed,[descriptor.value]))
                        reject(record,'Array literal nested body has no parse allocation witness');
                }
                // This identity precedes actual heap registration. No held heap
                // method or temporarily redirected map can substitute another body.
                record.literalBody=facts.body;record.literalCurrent=observed.current;
            }
            scan(record,facts.raw);scan(record,facts.body);
            if(literalBody&&(!record.literalCurrent()||!primitiveIntrinsicsCurrent()))reject(record,'Array literal allocation changed during observation');
            if(facts.kind==='escape'&&facts.body&&primitiveApply(primitiveWeakHas,bodies,[facts.body]))reject(record,'tracked Array cannot escape to a legacy callback');
            if(record&&(record.method==='createReference'||record.method==='valueBinary')&&
                (!primitiveIntrinsicsCurrent()||!graphValid(record)||!primitiveIntrinsicsCurrent()))reject(record,'Array operation proof expired during input observation');
            if(literal)record.literalWitness=true;
            }catch(error){return rejectError(record,error);}
        },
        primitive(ticket,facts){
            const record=primitiveApply(primitiveWeakGet,tickets,[ticket]);
            try {
                if(!primitiveIntrinsicsCurrent()){
                    if(record)record.primitiveExpired=true;
                    throw new primitiveError('Array primitive intrinsic surface changed');
                }
                if(record&&(record.runtime!==runtime||record.binding!==binding))throw Error('Array primitive ticket belongs to another binding');
                return primitiveLoan(record,facts);
            }catch(error){if(record)record.primitiveExpired=true;return rejectError(record,error);}
        },
        finish(ticket,result,facts){
            const record=primitiveApply(primitiveWeakGet,tickets,[ticket]);if(!record)return;
            if(record.runtime!==runtime||record.binding!==binding)throw Error('Array operation completion belongs to another binding');
            const close=()=>{record.closed=true;primitiveApply(primitiveWeakDelete,tickets,[ticket]);
                if(primitiveApply(primitiveWeakGet,inflight,[runtime])===record){
                    if(record.previous&&!record.previous.closed)primitiveApply(primitiveWeakSet,inflight,[runtime,record.previous]);
                    else primitiveApply(primitiveWeakDelete,inflight,[runtime]);
                }};
            // The supplier reports its actual computation error in a frozen own-data
            // completion. Retire only this still-active ticket's lineage, preserving
            // native Error identity/subtype. A prior private signal is rethrown by
            // rejectError unchanged; the ticket is closed exactly once in either case.
            const completionStatus=facts&&typeof facts==='object'&&primitiveDescriptor(facts,'status');
            if((record.method==='valueBinary'||record.method==='createReference')&&
                completionStatus&&primitiveOwn(completionStatus,'value')&&completionStatus.value==='throw'){
                try {
                    const runtimeField=primitiveDescriptor(facts,'runtime'),opcodeField=primitiveDescriptor(facts,'opcode'),errorField=primitiveDescriptor(facts,'error');
                    if(!primitiveFrozen(facts)||!runtimeField||!opcodeField||!errorField||
                        !primitiveOwn(runtimeField,'value')||!primitiveOwn(opcodeField,'value')||!primitiveOwn(errorField,'value')||
                        runtimeField.value!==runtime||opcodeField.value!==record.method)
                        reject(record,'throw completion ticket differs');
                    // Preserve the pre-existing unsupported non-Error throw path;
                    // this profile adopts only the coordinator's own-data Error policy.
                    const thrown=errorField.value,message=thrown&&typeof thrown==='object'&&primitiveDescriptor(thrown,'message');
                    if(!primitiveApply(primitiveErrorInstance,primitiveError,[thrown])||!message||
                        !primitiveOwn(message,'value')||typeof message.value!=='string')return;
                    return rejectError(record,thrown,'computation-throw');
                } finally {close();}
            }
            // Other legacy operations keep their original throw cleanup policy.
            if(facts?.status==='throw'){close();return;}
            try {
                if(record.method==='createReference'&&record.literalExpired)throw record.literalFailure||new primitiveError('Array literal allocation proof expired');
                if((record.method==='valueBinary'||record.method==='createReference')&&!primitiveIntrinsicsCurrent()){
                    record.primitiveExpired=true;
                    throw new primitiveError('Array primitive intrinsic surface changed before publication');
                }
                if(!graphValid(record))reject(record,'current cached operation graph changed');
                if(record.primitiveLoans){
                    if(record.primitiveExpired||!primitiveIntrinsicsCurrent())reject(record,'Array primitive proof expired before publication');
                }
                if(facts?.runtime!==runtime||facts.opcode!==record.method||facts.status!=='return'||!Object.isFrozen(facts))reject(record,'completion ticket differs');
                scan(record,result);scan(record,facts.body);
                if(record.method==='createReference'||record.method==='valueBinary'){
                    if(!primitiveIntrinsicsCurrent()||!graphValid(record)||!primitiveIntrinsicsCurrent())reject(record,'Array operation proof expired before publication');
                    if(!primitiveIntrinsicsCurrent())reject(record,'Array primitive intrinsic surface changed before publication');
                }
                const resultIdentity=referenceIdentity(result);
                const resultBody=lookupIdentity(runtime,resultIdentity);
                const resultKey=resultIdentity&&JSON.stringify([resultIdentity.kind,resultIdentity.id,resultIdentity.scope]);
                // Complete every raw result observation before the final fence.
                if(record.method==='createReference'||record.method==='valueBinary'){
                    if(!graphValid(record)||!primitiveIntrinsicsCurrent())reject(record,'Array operation proof expired after result observation');
                    if(record.literalCurrent&&!record.literalCurrent())reject(record,'Array literal allocation changed before enrollment');
                    if(!primitiveIntrinsicsCurrent())reject(record,'Array primitive intrinsic surface changed before publication');
                }
                // GLOBAL publication barrier: finish every potentially trapping
                // loan observation before checking ANY trusted native row. No
                // graph/raw/reference/WeakRef callbacks occur after this fence.
                if(record.primitiveLoans){
                    for(let i=0;i<record.primitiveLoans.length;i++)if(!record.primitiveLoans[i].observationsCurrent())
                        reject(record,'Array primitive invariant metadata changed before publication');
                    if(!graphValid(record)||!primitiveIntrinsicsCurrent())reject(record,'Array primitive proof expired at publication barrier');
                    for(let i=0;i<record.primitiveLoans.length;i++)if(!record.primitiveLoans[i].nativeCurrent())
                        reject(record,'Array primitive backing changed before publication');
                    if(!primitiveIntrinsicsCurrent())reject(record,'Array primitive intrinsic surface changed before publication');
                }
                if(allocationMethods.has(record.method)&&Array.isArray(facts.body)){
                    // Validate before enrolling anything; a failed completion
                    // must never leave an eligible foreign body behind.
                    if(resultIdentity&&resultBody!==facts.body)reject(record,'completed allocation/body differs');
                    if(record.method==='createReference'&&(!record.literalWitness||record.literalExpired||record.literalBody!==facts.body||!record.literalCurrent||!record.literalCurrent()))
                        reject(record,'Array literal allocation has no current witness');
                    if(record.literalNative)for(let i=0;i<record.literalNative.length;i++)
                        primitiveApply(primitiveWeakSet,parsedMetadata,[record.literalNative[i],true]);
                    enrollAllocation(record,facts.body,
                        ['createReference','create1D','create2D','createEmpty','createZeros','createRange'].includes(record.method));
                }
                if(resultIdentity){
                    const body=resultBody;
                    if(body&&primitiveApply(primitiveWeakHas,bodies,[body])){
                        checkBody(record,body);const key=resultKey,weak=new primitiveWeakRefConstructor(body);
                        primitiveApply(primitiveMapSet,references,[key,weak]);if(collected)primitiveApply(primitiveFinalizationRegister,collected,[body,{key,weak}]);
                    }
                }
            } catch(error){return rejectError(record,error);} finally {close();}
        }
    });
    return service;
}
