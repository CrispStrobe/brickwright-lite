import {GENERATED_HELPER_PROFILES,inspectGeneratedHelperBindings,mapGeneratedSourceArray} from './generated-helper-recognition.js';

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

// Owner decision 2026-10-30: when the native-addition proof cannot prove both
// operands primitive or flat Arrays, export decides per value at run time
// instead of refusing. PXT's Array.isArray selects the same join the proven
// Array path emits; every other value keeps PXT's ordinary `+`. This body is
// never a domain proof: it is correct for any operand, so it needs none.
export function runtimeDispatchAddHelperSource(name) {
    if (typeof name !== 'string' || !/^[A-Za-z_$][\w$]*$/.test(name)) {
        throw new Error('Runtime-dispatch addition helper requires an exact name');
    }
    const conversion=(input,local)=>`let ${local}: any = ${input}; if (Array.isArray(${input})) { let array: any[] = ${input}; ${local} = array.join(",") }`;
    return `function ${name}(left: any, right: any): any { ${conversion('left','a')}; ${conversion('right','b')}; return a + b }`;
}

// Importing an exported runtime-dispatch helper restores the same native value
// `+` the proven join helper imports to (`calculate value ... op "+"`): the VM
// decides per value at run time, joining an Array as PXT's helper does. Only the
// exact complete body with a unique root binding, its own locals, an unbound
// global `Array` and direct two-argument calls is recognized.
export function lowerRuntimeDispatchAddHelpers(program, profile=GENERATED_HELPER_PROFILES.ordinary) {
    const proof=inspectGeneratedHelperBindings(program,profile),selected=new Map();
    if(!proof.isCurrent())return program;
    const inside=(node,fn)=>{for(let current=node;current;current=proof.parentOf(current))if(current===fn)return true;return false;};
    for(const fn of program.body||[]){
        if(fn?.type!=='FunctionDeclaration'||!/^__bwBinaryAdd_*$/.test(fn.name))continue;
        const canonical='__bwRuntimeDispatchAdd';
        if(!proof.root(fn)||!proof.matches(fn,runtimeDispatchAddHelperSource(canonical),new Map([[fn.name,canonical]])))continue;
        const local=proof.nodes.every(node=>node.type!=='Identifier'||!inside(node,fn)||inside(proof.declarationAt(node),fn)||
            node.name==='Array'&&proof.unbound(node)&&proof.parentOf(node)?.type==='Member'&&proof.parentOf(node).object===node&&
            proof.parentOf(node).name==='isArray');
        const calls=proof.calls(fn,[2],new Set([fn]));
        if(local&&calls?.length)selected.set(fn,calls);
    }
    if(!selected.size||!proof.isCurrent())return program;
    const calls=new Set();for(const list of selected.values())for(const call of list)calls.add(call);
    const rewrite=node=>{
        if(!node||typeof node!=='object')return node;
        if(Array.isArray(node))return mapGeneratedSourceArray(node,rewrite);
        if(calls.has(node))return {type:'NativeArrayValueBinary',op:'+',left:rewrite(node.args[0]),right:rewrite(node.args[1])};
        return Object.fromEntries(Object.entries(node).map(([key,value])=>[key,rewrite(value)]));
    };
    const result=rewrite({...program,body:program.body.filter(node=>!selected.has(node))});
    return proof.isCurrent()?result:program;
}

// Structural recognition of the exact runtime-dispatch body for analyses that
// see the exported program under other parse options (procedure constraints).
// Only the executable shape is compared; the helper's own name is free. Its
// result is Number exactly when both operands are Numbers (no Array input).
const dispatchKeys=new Set(['type','name','params','kind','decls','init','test','callee','object','args','consequent','alternate','expr','op','left','right','value','body']);
const dispatchShape=value=>{
    if(Array.isArray(value))return value.map(dispatchShape);
    if(!value||typeof value!=='object')return value;
    const out={};for(const key of Object.keys(value).sort())if(dispatchKeys.has(key))out[key]=dispatchShape(value[key]);
    return out;
};
const dispatchSide=(input,local)=>[
    {type:'Declaration',kind:'let',decls:[{name:local,init:{type:'Identifier',name:input}}]},
    {type:'If',test:{type:'Call',callee:{type:'Member',object:{type:'Identifier',name:'Array'},name:'isArray'},args:[{type:'Identifier',name:input}]},
        consequent:[{type:'Declaration',kind:'let',decls:[{name:'array',init:{type:'Identifier',name:input}}]},
            {type:'ExpressionStatement',expr:{type:'Assignment',op:'=',left:{type:'Identifier',name:local},
                right:{type:'Call',callee:{type:'Member',object:{type:'Identifier',name:'array'},name:'join'},args:[{type:'String',value:','}]}}}],alternate:null}];
const dispatchExpected=JSON.stringify(dispatchShape({type:'FunctionDeclaration',params:['left','right'],
    body:[...dispatchSide('left','a'),...dispatchSide('right','b'),{type:'Return',value:{type:'Binary',op:'+',left:{type:'Identifier',name:'a'},right:{type:'Identifier',name:'b'}}}]}));
export function isRuntimeDispatchAddDeclaration(fn) {
    if(fn?.type!=='FunctionDeclaration'||typeof fn.name!=='string')return false;
    const {name,...rest}=fn;
    try{return JSON.stringify(dispatchShape(rest))===dispatchExpected;}catch{return false;}
}
