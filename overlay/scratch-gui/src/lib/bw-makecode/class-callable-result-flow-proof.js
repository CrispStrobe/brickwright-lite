// Lowering metadata comes only from a completed source producer proof. The
// actual current Blocks body must be checked independently during execution
// and export; this inert certificate cannot issue a completion permission.
import {classResultFlowCertificate,classMethodSourceSignature,classConstructorSourceSignature,classCallableReflectionSource,classSdkImageRoles,classSdkImageValue,assertCurrentClassSourceProof,classSdkImageValueCandidate,compilerOwnedClassSourceHasPhysicalSnapshot} from './class-callable-source-flow.js';
import {cloneClassSourceMetadata,ordinaryConstructorParameterProperties} from './class-parameter-property-source.js';
export function withClassResultFlowProof(program,proof) {
    if(proof?.eligible!==true||!proof.resultFlows)return program;
    const methods=new Set(program.body.filter(node=>node.type==='Class').flatMap(node=>node.methods));
    return cloneClassSourceMetadata(program,(node,out)=>{
        if(classSdkImageValue(proof,program,node)){out.bwSdkImageValue=true;out.bwObjectTypes=['image'];}
        if(node.type==='Unary'&&node.op==='typeof'&&classCallableReflectionSource(proof,program,node))out.bwSourceCallableTypeOf=true;
        if(node.type==='Class') {
            const roles=classSdkImageRoles(proof,program,node);if(roles)out.bwSdkImageRoles=roles;
            const constructor=classConstructorSourceSignature(proof,program,node);
            if(constructor)out.ctor.bwClassCallableSignature=constructor;
            if(node.ctor?.parameterProperties?.length&&!ordinaryConstructorParameterProperties(out))
                throw Error('Class lowering lost its actual constructor parameter property correspondence');
        }
        if(methods.has(node)) {
            out.bwClassCallableSignature=classMethodSourceSignature(proof,program,node);
            const flow=classResultFlowCertificate(proof,program,node);
            if(flow)out.bwClassResultFlow=structuredClone(flow);
        }
    });
}

// Private execution-path eligibility, not syntax/semantic authority. The caller
// is the compiler's actual synchronous parser/owned-normalizer call chain. An
// own-data snapshot cannot distinguish arbitrary Proxy inputs; this is not a
// new public foreign-AST entry or an unforgeable origin certificate.
const classCloneGlobal=globalThis;
const classCloneApply=Reflect.apply,classCloneKeys=Reflect.ownKeys;
const classCloneDescriptor=Object.getOwnPropertyDescriptor;
const classClonePrototype=Object.getPrototypeOf,classCloneSame=Object.is;
const classCloneOwn=Object.prototype.hasOwnProperty;
const classCloneGlobals=['globalThis','Object','Array','Map','Set','WeakMap','JSON','Reflect','Number','String','Error','structuredClone'];
const classCloneRecords=[];
const classCloneGlobalDescriptors=[];
const classCloneRemember=object=>{
    if(!object||typeof object!=='object'&&typeof object!=='function')return;
    for(let i=0;i<classCloneRecords.length;i++)if(classCloneRecords[i].object===object)return;
    const keys=classCloneKeys(object),descriptors=[];
    for(let i=0;i<keys.length;i++)descriptors[i]=classCloneDescriptor(object,keys[i]);
    classCloneRecords[classCloneRecords.length]={object,keys,descriptors,prototype:classClonePrototype(object)};
};
for(let i=0;i<classCloneGlobals.length;i++) {
    const descriptor=classCloneDescriptor(classCloneGlobal,classCloneGlobals[i]);
    classCloneGlobalDescriptors[i]=descriptor;
    if(descriptor&&classCloneApply(classCloneOwn,descriptor,['value'])) {
        classCloneRemember(descriptor.value);
        const prototype=descriptor.value&&classCloneDescriptor(descriptor.value,'prototype');
        if(prototype&&classCloneApply(classCloneOwn,prototype,['value']))classCloneRemember(prototype.value);
    }
}
// for-of over own-key arrays and private Set/Map records also depends on the
// iterator objects' complete prototype chains, not just collection methods.
for(const iterator of [[][Symbol.iterator](),new Map()[Symbol.iterator](),new Set()[Symbol.iterator]()]) {
    let prototype=classClonePrototype(iterator);
    while(prototype){classCloneRemember(prototype);prototype=classClonePrototype(prototype);}
}
const classCloneDescriptorEqual=(a,b)=>{
    if(!a||!b)return a===b;
    const keys=classCloneKeys(a),other=classCloneKeys(b);if(keys.length!==other.length)return false;
    for(let i=0;i<keys.length;i++)if(keys[i]!==other[i]||!classCloneSame(a[keys[i]],b[keys[i]]))return false;
    return true;
};
const classCloneIntrinsicsCurrent=()=>{
    for(let i=0;i<classCloneGlobals.length;i++)
        if(!classCloneDescriptorEqual(classCloneGlobalDescriptors[i],classCloneDescriptor(classCloneGlobal,classCloneGlobals[i])))return false;
    for(let i=0;i<classCloneRecords.length;i++) {
        const row=classCloneRecords[i],keys=classCloneKeys(row.object);
        if(classClonePrototype(row.object)!==row.prototype||keys.length!==row.keys.length)return false;
        for(let j=0;j<keys.length;j++)if(keys[j]!==row.keys[j]||!classCloneDescriptorEqual(row.descriptors[j],classCloneDescriptor(row.object,keys[j])))return false;
    }
    return true;
};

// Complete compiler-internal operation, not a cached fact/proof handle. The
// public operation above retains its original observation/error boundaries.
export function withCompilerOwnedClassResultFlowProof(program,proof) {
    if(!compilerOwnedClassSourceHasPhysicalSnapshot(proof,program)||!classCloneIntrinsicsCurrent())
        return withClassResultFlowProof(program,proof);
    if(proof?.eligible!==true||!proof.resultFlows)return program;
    assertCurrentClassSourceProof(proof,program);
    const methods=new Set(program.body.filter(node=>node.type==='Class').flatMap(node=>node.methods));
    const result=cloneClassSourceMetadata(program,(node,out)=>{
        if(classSdkImageValueCandidate(proof,node)&&classSdkImageValue(proof,program,node)){out.bwSdkImageValue=true;out.bwObjectTypes=['image'];}
        if(node.type==='Unary'&&node.op==='typeof'&&classCallableReflectionSource(proof,program,node))out.bwSourceCallableTypeOf=true;
        if(node.type==='Class') {
            const roles=classSdkImageRoles(proof,program,node);if(roles)out.bwSdkImageRoles=roles;
            const constructor=classConstructorSourceSignature(proof,program,node);
            if(constructor)out.ctor.bwClassCallableSignature=constructor;
            if(node.ctor?.parameterProperties?.length&&!ordinaryConstructorParameterProperties(out))
                throw Error('Class lowering lost its actual constructor parameter property correspondence');
        }
        if(methods.has(node)) {
            out.bwClassCallableSignature=classMethodSourceSignature(proof,program,node);
            const flow=classResultFlowCertificate(proof,program,node);
            if(flow)out.bwClassResultFlow=structuredClone(flow);
        }
    });
    assertCurrentClassSourceProof(proof,program);
    return result;
}
