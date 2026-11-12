// Arcade-only source Array value operations, split from bw-array-operations.js
// so they load with the lazy Arcade chunk instead of first paint. They use the
// same captured intrinsics and registration state as that module.
const support=require('./bw-array-operations').sourceValueSupport();
const {bodies,cachedOwner,captureContext,lookupIdentity,nativeReferenceMetadata,primitiveApply,primitiveArray,primitiveDescriptor,primitiveDiagnosticDefine,primitiveError,primitiveObservations,primitiveOwn,primitiveOwner,primitiveUndefined,primitiveWeakGet,referenceIdentity,references,registrations,samePrimitiveDescriptor,sourceBinaryOperation,sourceIntrinsicsCurrent,sourceUnaryOperation,valueDecode}=support;
// Private source-operation rows must not pass through inherited numeric
// setters installed by live owner/runtime callbacks before the next refusal.
function sourcePrivateAppend(array,value) {
    primitiveDiagnosticDefine(array,array.length,{__proto__:null,value,writable:true,enumerable:true,configurable:true});
}

// Only identities already validated by this source operation contribute
// numeric zero. No Array body, item, type certificate or native loan is read.
function sourceBitwiseOperand(value,owned) {
    for(let i=0;i<owned.length;i++)if(value===owned[i].value)return 0;
    return value;
}

// PXT RefCollection arithmetic is arithmetic over the canonical opaque value,
// not JavaScript Array.join. The separate Arcade opcode explicitly selects
// that language meaning. Native arrays_valueBinary and its loan are unchanged.
function sourceValueBinary(runtime,args,util) {
    const fail=message=>{throw new primitiveError('Arcade source arithmetic: '+message);};
    const opcode='arcade_sourceValueBinary';
    if(!sourceIntrinsicsCurrent())fail('intrinsic surface changed');
    const block=primitiveOwner.current(util,args);
    if(!runtime||util?.runtime!==runtime||block?.opcode!==opcode)fail('requires its current primitive operation');
    const activeCall=primitiveOwner.captureActiveCall(util,args);
    if(!activeCall)fail('current cached caller differs');
    const currentContext=captureContext(util,block);
    const slots=['LEFT','RIGHT','OP'],descriptors=[];
    for(let i=0;i<slots.length;i++){
        const descriptor=primitiveDescriptor(args,slots[i]);
        if(!descriptor||!primitiveOwn(descriptor,'value'))fail('arguments require own data');
        sourcePrivateAppend(descriptors,descriptor);
    }
    const op=descriptors[2].value;
    if(!['+','-','*','/','%','**','&','|','^','<<','>>','>>>'].includes(op))fail('unsupported fixed binary operator');
    if(cachedOwner(runtime,util,args,opcode,['OP'])!==block)fail('cached selector differs');
    const observed=primitiveObservations(),owned=[];
    const ownerCurrent=saved=>{const owner=saved.sourceOwner;return owner&&primitiveApply(primitiveWeakGet,registrations,[owner.registration])===owner.source&&
        owner.instance()===owner.boundInstance&&typeof owner.primitive==='function'&&runtime.getOpcodeFunction(owner.opcode)===owner.primitive;};
    const operand=value=>{
        if(!sourceIntrinsicsCurrent())fail('intrinsic surface changed before operand validation');
        if(value===null||value===primitiveUndefined||['undefined','number','string','boolean'].includes(typeof value))return;
        if(!value||typeof value!=='object'||!nativeReferenceMetadata(value))fail('unknown object or reference owner');
        const outer=observed.observe(value),descriptor=observed.field(outer,'bwReference');
        if(outer.prototype!==Object.prototype||outer.keys.length!==1||outer.keys[0]!=='bwReference'||!descriptor)fail('canonical reference shape differs');
        const inner=descriptor.value;
        if(!nativeReferenceMetadata(inner))fail('reference metadata has no native origin');
        const row=observed.observe(inner),identity=referenceIdentity(value);
        if(row.prototype!==Object.prototype||!identity)fail('only exact canonical Array references are supported');
        const body=lookupIdentity(runtime,identity),saved=body&&primitiveApply(primitiveWeakGet,bodies,[body]);
        if(!primitiveArray(body)||valueDecode(value)!==value)fail('Array canonical heap or intern identity is foreign, stale or unknown');
        // SDK resource Arrays can have a genuine current canonical heap entry
        // without ever asking the Arrays factory for a body-reading loan.
        // Opaque coercion reads no elements and grants no body/Number authority.
        // A tracked body must still retain ALL of its existing binding fences.
        if(saved&&(saved.runtime!==runtime||saved.state.disposed||!saved.state.active||saved.generation!==saved.state.generation||!ownerCurrent(saved)))
            fail('tracked Array body generation or binding is foreign or stale');
        sourcePrivateAppend(owned,{value,identity,body,saved});
    };
    operand(descriptors[0].value);operand(descriptors[1].value);
    const current=()=>{
        if(!sourceIntrinsicsCurrent()||!primitiveOwner.isActiveCall(activeCall,util,args)||
            primitiveOwner.current(util,args)!==block||!currentContext()||
            cachedOwner(runtime,util,args,opcode,['OP'])!==block)return false;
        // Run every live runtime/registration callback before the final closed
        // heap and generation checks. A callback may retire or replace bodies
        // while returning the expected block or registration object.
        for(let i=0;i<owned.length;i++)if(owned[i].saved&&!ownerCurrent(owned[i].saved))return false;
        if(!primitiveOwner.isActiveCall(activeCall,util,args)||primitiveOwner.current(util,args)!==block||!currentContext())return false;
        for(let i=0;i<slots.length;i++)if(!samePrimitiveDescriptor(primitiveDescriptor(args,slots[i]),descriptors[i]))return false;
        if(!observed.current())return false;
        if(!sourceIntrinsicsCurrent())return false;
        // These held native lookups inspect no user properties or Array items.
        // There are no runtime/owner callbacks after this publication barrier.
        for(let i=0;i<owned.length;i++){
            const item=owned[i],saved=item.saved;
            if(lookupIdentity(runtime,item.identity)!==item.body||primitiveApply(primitiveWeakGet,bodies,[item.body])!==saved||valueDecode(item.value)!==item.value||
                saved&&(saved.runtime!==runtime||saved.state.disposed||!saved.state.active||saved.generation!==saved.state.generation))return false;
        }
        return sourceIntrinsicsCurrent();
    };
    if(!current())fail('operand or operation changed during validation');
    // Only the held Number adapter may recover a Number from its actual shadow.
    // Both inputs have already executed; coercion order remains left then right.
    const left=sourceNumberInput(runtime,args,util,opcode,'LEFT');
    const right=sourceNumberInput(runtime,args,util,opcode,'RIGHT');
    if(!current())fail('operation changed during Number input observation');
    const bitwise=op==='&'||op==='|'||op==='^'||op==='<<'||op==='>>'||op==='>>>';
    const result=sourceBinaryOperation(bitwise?sourceBitwiseOperand(left,owned):left,op,
        bitwise?sourceBitwiseOperand(right,owned):right);
    if(!current())fail('operand or operation changed during arithmetic');
    return result;
}

// Source unary uses its genuine one-input operation and the same canonical
// owner/currentness boundaries, independently of native BWValues.unary policy.
function sourceValueUnary(runtime,args,util) {
    const fail=message=>{throw new primitiveError('Arcade source arithmetic: '+message);};
    const opcode='arcade_sourceValueUnary';
    if(!sourceIntrinsicsCurrent())fail('intrinsic surface changed');
    const block=primitiveOwner.current(util,args);
    if(!runtime||util?.runtime!==runtime||block?.opcode!==opcode)fail('requires its current primitive operation');
    const activeCall=primitiveOwner.captureActiveCall(util,args);
    if(!activeCall)fail('current cached caller differs');
    const currentContext=captureContext(util,block);
    const slots=['VALUE','OP'],descriptors=[];
    for(let i=0;i<slots.length;i++){
        const descriptor=primitiveDescriptor(args,slots[i]);
        if(!descriptor||!primitiveOwn(descriptor,'value'))fail('arguments require own data');
        sourcePrivateAppend(descriptors,descriptor);
    }
    const op=descriptors[1].value;
    if(op!=='~')fail('unsupported fixed unary operator');
    if(cachedOwner(runtime,util,args,opcode,['OP'])!==block)fail('cached selector differs');
    const observed=primitiveObservations(),owned=[];
    const ownerCurrent=saved=>{const owner=saved.sourceOwner;return owner&&primitiveApply(primitiveWeakGet,registrations,[owner.registration])===owner.source&&
        owner.instance()===owner.boundInstance&&typeof owner.primitive==='function'&&runtime.getOpcodeFunction(owner.opcode)===owner.primitive;};
    const operand=value=>{
        if(!sourceIntrinsicsCurrent())fail('intrinsic surface changed before operand validation');
        if(value===null||value===primitiveUndefined||['undefined','number','string','boolean'].includes(typeof value))return;
        if(!value||typeof value!=='object'||!nativeReferenceMetadata(value))fail('unknown object or reference owner');
        const outer=observed.observe(value),descriptor=observed.field(outer,'bwReference');
        if(outer.prototype!==Object.prototype||outer.keys.length!==1||outer.keys[0]!=='bwReference'||!descriptor)fail('canonical reference shape differs');
        const inner=descriptor.value;
        if(!nativeReferenceMetadata(inner))fail('reference metadata has no native origin');
        const row=observed.observe(inner),identity=referenceIdentity(value);
        if(row.prototype!==Object.prototype||!identity)fail('only exact canonical Array references are supported');
        const body=lookupIdentity(runtime,identity),saved=body&&primitiveApply(primitiveWeakGet,bodies,[body]);
        if(!primitiveArray(body)||valueDecode(value)!==value)fail('Array canonical heap or intern identity is foreign, stale or unknown');
        // SDK resource Arrays can have a genuine current canonical heap entry
        // without ever asking the Arrays factory for a body-reading loan.
        // Opaque coercion reads no elements and grants no body/Number authority.
        // A tracked body must still retain ALL of its existing binding fences.
        if(saved&&(saved.runtime!==runtime||saved.state.disposed||!saved.state.active||saved.generation!==saved.state.generation||!ownerCurrent(saved)))
            fail('tracked Array body generation or binding is foreign or stale');
        sourcePrivateAppend(owned,{value,identity,body,saved});
    };
    operand(descriptors[0].value);
    const current=()=>{
        if(!sourceIntrinsicsCurrent()||!primitiveOwner.isActiveCall(activeCall,util,args)||
            primitiveOwner.current(util,args)!==block||!currentContext()||
            cachedOwner(runtime,util,args,opcode,['OP'])!==block)return false;
        // Run every live runtime/registration callback before the final closed
        // heap and generation checks. A callback may retire or replace bodies
        // while returning the expected block or registration object.
        for(let i=0;i<owned.length;i++)if(owned[i].saved&&!ownerCurrent(owned[i].saved))return false;
        if(!primitiveOwner.isActiveCall(activeCall,util,args)||primitiveOwner.current(util,args)!==block||!currentContext())return false;
        for(let i=0;i<slots.length;i++)if(!samePrimitiveDescriptor(primitiveDescriptor(args,slots[i]),descriptors[i]))return false;
        if(!observed.current())return false;
        if(!sourceIntrinsicsCurrent())return false;
        // These held native lookups inspect no user properties or Array items.
        // There are no runtime/owner callbacks after this publication barrier.
        for(let i=0;i<owned.length;i++){
            const item=owned[i],saved=item.saved;
            if(lookupIdentity(runtime,item.identity)!==item.body||primitiveApply(primitiveWeakGet,bodies,[item.body])!==saved||valueDecode(item.value)!==item.value||
                saved&&(saved.runtime!==runtime||saved.state.disposed||!saved.state.active||saved.generation!==saved.state.generation))return false;
        }
        return sourceIntrinsicsCurrent();
    };
    if(!current())fail('operand or operation changed during validation');
    // Exactly one actual VALUE input and one Number-shadow observation. No
    // second input, body read or primitive loan is synthesized for unary ~.
    const value=sourceNumberInput(runtime,args,util,opcode,'VALUE');
    if(!current())fail('operation changed during Number input observation');
    const result=sourceUnaryOperation(op,sourceBitwiseOperand(value,owned));
    if(!current())fail('operand or operation changed during arithmetic');
    return result;
}



// Owner publishes its stable exports before this closed dependency is entered.
const sourceNumberInput=require('./bw-current-number-input');
module.exports=Object.freeze({__proto__:null,sourceValueBinary,sourceValueUnary});
