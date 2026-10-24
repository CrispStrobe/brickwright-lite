import {GENERATED_HELPER_PROFILES,inspectGeneratedHelperBindings} from './generated-helper-recognition.js';

// Native Array addition is not PXT RefCollection addition. These helpers emit
// actual PXT join calls for flat primitive Arrays; body matching alone NEVER
// proves an operand domain or authorizes lowering to a native operation.
export function nativeArrayAddHelperSource(name, leftArray, rightArray) {
    if (typeof name !== 'string' || !/^[A-Za-z_$][\w$]*$/.test(name) || (!leftArray && !rightArray) ||
        typeof leftArray !== 'boolean' || typeof rightArray !== 'boolean') {
        throw new Error('Native Array addition helper requires an exact name and Array positions');
    }
    const conversion=(input,local)=>`let ${local}: any = ${input}; if (${input} !== null && typeof ${input} === "object") { let array: any[] = ${input}; ${local} = array.join(",") }`;
    const statements=[leftArray?conversion('left','a'):'let a: any = left',rightArray?conversion('right','b'):'let b: any = right'];
    return `function ${name}(left: any, right: any): any { ${statements.join('; ')}; return a + b }`;
}

// Return syntax candidates only. A later private consumer must independently
// prove every argument's actual initialized flat-primitive Array/scalar domain,
// all writers/aliases and current Program before choosing native semantics.
// No name, annotation or matching-body record is a value/type certificate.
export function inspectNativeArrayAddHelpers(program, profile=GENERATED_HELPER_PROFILES.ordinary) {
    const proof=inspectGeneratedHelperBindings(program,profile),helpers=new Map();
    if(!proof.isCurrent())return {helpers,current:()=>false};
    for(const fn of program.body||[]){
        if(fn?.type!=='FunctionDeclaration')continue;
        for(const [leftArray,rightArray,suffix]of [[true,false,'Left'],[false,true,'Right'],[true,true,'Both']]){
            const canonicalName='__bwNativeArrayAdd'+suffix;
            if(!new RegExp('^'+canonicalName+'_*$').test(fn.name)&&!(leftArray&&rightArray&&/^__bwBinaryAdd_*$/.test(fn.name)))continue;
            const names=new Map([[fn.name,canonicalName]]);
            if(proof.root(fn)&&proof.matches(fn,nativeArrayAddHelperSource(canonicalName,leftArray,rightArray),names))
                helpers.set(fn.name,{declaration:fn,leftArray,rightArray,calls:[]});
        }
    }
    const inside=(node,fn)=>{for(let current=node;current;current=proof.parentOf(current))if(current===fn)return true;return false;};
    // Closure of this exact helper is independent of the surrounding Program's
    // value/effect domain. The canonical body uses only its own parameters and
    // locals; no ambient builtin/free identifier is needed. The consumer still
    // proves every outside writer, call and effect before choosing a domain.
    for(const [name,record]of helpers){
        const fn=record.declaration,calls=proof.calls(fn,[2],new Set([fn]));
        const local=proof.nodes.every(node=>node.type!=='Identifier'||!inside(node,fn)||
            inside(proof.declarationAt(node),fn));
        if(!local||calls===null||calls.length===0)helpers.delete(name);
        else record.calls=calls;
    }
    return {helpers:proof.isCurrent()?helpers:new Map(),current:()=>proof.isCurrent()};
}

export function nativeArrayAddHelperCandidates(program,profile=GENERATED_HELPER_PROFILES.ordinary) {
    return inspectNativeArrayAddHelpers(program,profile).helpers;
}
