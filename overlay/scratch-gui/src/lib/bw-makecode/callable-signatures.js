import {parseCallableType} from './callable-type-syntax.js';

// Generic callable result inference is local to an invocation. It never joins
// opaque function resources into the scalar or managed object type graphs.
export function callableSignature(node) {
    const annotation=value=>parseCallableType(typeof value==='string'?value:value?.text || '');
    const parameters=(node.params || []).map(name=>({name,
        optional:!!node.optionalParams?.includes(name) || !!node.parameterDefaults?.some(value=>value.name===name),
        type:annotation(node.paramTypes?.[name])}));
    const result=annotation(node.returnType);
    return parameters.every(parameter=>parameter.type) && result ? {kind:'callable',parameters,result}:null;
}

const sdkImage=type=>type?.kind==='sdk'&&type.name==='Image'&&Reflect.ownKeys(type).length===2&&Object.keys(type).every(key=>['kind','name'].includes(key));
const sameType=(a,b)=>a?.kind===b?.kind && (['named','sdk'].includes(a.kind)?a.name===b.name:
    a.kind==='array'?sameType(a.element,b.element):
        a.parameters.length===b.parameters.length && a.parameters.every((parameter,index)=>
            parameter.optional===b.parameters[index].optional && sameType(parameter.type,b.parameters[index].type)) &&
        sameType(a.result,b.result));

export function instantiateCallableSignature(signature,typeParameters,arguments_,{explicitUndefinedSlots=new Set()}={}) {
    const unsupported=[],substitutions=new Map();
    const fail=message=>{if(!unsupported.includes(message))unsupported.push(message);};
    if(signature?.kind!=='callable' || !Array.isArray(arguments_))
        return {signature:null,substitutions,unsupported:['Callable invocation requires a known signature and ordered arguments']};
    const variables=new Set();
    for(const parameter of typeParameters || []) {
        if(!parameter || !/^[A-Za-z_]\w*$/.test(parameter.name || '') || variables.has(parameter.name) ||
            parameter.constraint || parameter.defaultType)
            fail('Constrained, defaulted or duplicate callable type parameters require separate qualification');
        else variables.add(parameter.name);
    }
    if(arguments_.length>signature.parameters.length)fail('Callable invocation has too many supplied arguments');
    const concrete=type=>type?.kind==='named' ?
        !variables.has(type.name) && !['any','unknown','undefined','null'].includes(type.name) :
        type?.kind==='sdk' ? sdkImage(type) : type?.kind==='array' ? concrete(type.element) : type?.kind==='callable' &&
            type.parameters.every(parameter=>concrete(parameter.type)) && concrete(type.result);
    const bind=(expected,actual)=>{
        if(!expected || !actual){fail('Callable invocation has an unresolved argument type');return;}
        if(expected.kind==='named' && variables.has(expected.name)) {
            if(!concrete(actual)) {
                fail('Callable generic inference requires a concrete supplied type');return;
            }
            const previous=substitutions.get(expected.name);
            if(previous && !sameType(previous,actual))fail('Callable generic arguments disagree for '+expected.name);
            else substitutions.set(expected.name,actual);
            return;
        }
        if(expected.kind!==actual.kind){fail('Callable argument structure differs from its declared signature');return;}
        if(expected.kind==='sdk') {
            if(!sdkImage(expected)||!sdkImage(actual))fail('Callable SDK Image type requires the exact domain');
        } else if(expected.kind==='named') {
            if(['any','unknown'].includes(expected.name) || ['any','unknown'].includes(actual.name))
                fail('Opaque callable argument types require separate qualification');
            else if(expected.name!==actual.name)fail('Callable argument type differs from its declared signature');
        } else if(expected.kind==='array')bind(expected.element,actual.element);
        else {
            if(expected.parameters.length!==actual.parameters.length)fail('Callable callback arity differs from its declared signature');
            else for(let index=0;index<expected.parameters.length;index++) {
                if(expected.parameters[index].optional!==actual.parameters[index].optional)
                    fail('Callable callback optional parameter variance requires separate qualification');
                bind(expected.parameters[index].type,actual.parameters[index].type);
            }
            bind(expected.result,actual.result);
        }
    };
    signature.parameters.forEach((parameter,index)=>{
        if(index<arguments_.length) {
            const actual=arguments_[index];
            // This authority comes from every actual source target's verified
            // numeric default. Undefined stays an explicit supplied argument.
            if(!(explicitUndefinedSlots.has(index) && parameter.optional && parameter.type?.kind==='named' &&
                parameter.type.name==='number' && actual?.kind==='named' && actual.name==='undefined'))bind(parameter.type,actual);
        }
        else if(!parameter.optional)fail('Callable invocation omits a required parameter');
    });
    const substitute=type=>{
        if(type.kind==='sdk'){if(!sdkImage(type))fail('Callable SDK Image type requires the exact domain');return {...type};}
        if(type.kind==='named') {
            if(!variables.has(type.name))return {...type};
            if(!substitutions.has(type.name)){fail('Callable generic result remains unresolved for '+type.name);return {...type};}
            return structuredClone(substitutions.get(type.name));
        }
        if(type.kind==='array')return {...type,element:substitute(type.element)};
        return {...type,parameters:type.parameters.map(parameter=>({...parameter,type:substitute(parameter.type)})),result:substitute(type.result)};
    };
    const instantiated=substitute(signature);
    return {signature:unsupported.length?null:instantiated,substitutions,unsupported};
}
