import {parseCallableType} from './callable-type-syntax.js';
import {instantiateCallableSignature} from './callable-signatures.js';

// Source type authority for the separate class/callable bridge. This is not
// runtime admission: a descriptor must subsequently bind actual heap classes,
// method procedures and lexical receiver frames in the current project run.
export function createClassCallableDescriptors(program) {
    const classes=new Map(), unsupported=[];
    const fail=message=>{if(!unsupported.includes(message))unsupported.push(message);};
    for(const cls of program.body || [])if(cls.type==='Class') {
        if(classes.has(cls.name))fail('Duplicate class callable owner '+cls.name);
        else classes.set(cls.name,cls);
    }
    const ordinary=name=>{
        const seen=new Set();let cls=classes.get(name);
        while(cls) {
            if(seen.has(cls.name))return false;
            seen.add(cls.name);
            if(!cls.base)return true;
            cls=classes.get(cls.base);
        }
        return false;
    };
    const valid=(type,generics=new Set())=>{
        if(!type)return false;
        if(type.kind==='named')return generics.has(type.name)||
            ['number','string','boolean','void','undefined','null'].includes(type.name)||ordinary(type.name);
        if(type.kind!=='callable')return false; // Array/callback variance is a later slice.
        return type.parameters.every(parameter=>!parameter.optional&&valid(parameter.type,generics))&&valid(type.result,generics);
    };
    const annotation=value=>parseCallableType(typeof value==='string'?value:value?.text || '');
    const rows=[];
    for(const cls of classes.values()) {
        const fields=[],methods=[];
        for(const field of cls.fields || [])if(/=>|\bFunction\b/.test(field.typeName || '')) {
            const type=annotation(field.typeName);
            if(!ordinary(cls.name)||field.isStatic||type?.kind!=='callable'||!valid(type))
                fail('Class callable field requires a concrete ordinary-class signature: '+cls.name+'.'+field.name);
            else fields.push({name:field.name,type:structuredClone(type)});
        }
        for(const method of cls.methods || []) {
            if(!method.bwClassCallableSignature&&!method.typeParameters?.length&&!/=>/.test(method.returnType || '')&&
                !Object.values(method.paramTypes || {}).some(value=>/=>/.test(typeof value==='string'?value:value?.text || '')))continue;
            const generics=new Set(),typeParameters=[];
            for(const parameter of method.typeParameters || []) {
                if(!/^[A-Za-z_]\w*$/.test(parameter.name || '')||generics.has(parameter.name)||parameter.constraint||parameter.defaultType)
                    fail('Class callable method requires unconstrained distinct type parameters: '+cls.name+'.'+method.name);
                else {generics.add(parameter.name);typeParameters.push({...parameter});}
            }
            const signature=method.bwClassCallableSignature||{kind:'callable',parameters:(method.params || []).map(name=>({name,
                optional:!!method.optionalParams?.includes(name),type:annotation(method.paramTypes?.[name])})),result:annotation(method.returnType)};
            if(!ordinary(cls.name)||method.isStatic||method.kind!=='method'||method.parameterDefaults?.length||!valid(signature,generics))
                fail('Class callable method requires a concrete instance signature: '+cls.name+'.'+method.name);
            else methods.push({name:method.name,typeParameters,signature,...(method.bwClassResultFlow?{resultFlow:structuredClone(method.bwClassResultFlow)}:{})});
        }
        rows.push({name:cls.name,parent:cls.base || null,fields,methods});
    }
    const owners=new Map(rows.map(row=>[row.name,row]));
    const lookup=(name,method)=>{
        const seen=new Set();let row=owners.get(name);
        while(row&&!seen.has(row.name)){seen.add(row.name);const found=row.methods.find(value=>value.name===method);if(found)return {owner:row.name,method:found};row=owners.get(row.parent);}
        return null;
    };
    return {schema:'bw-class-callable-types',version:2,classes:rows,unsupported,
        instantiate(className,methodName,arguments_) {
            const found=lookup(className,methodName);
            if(unsupported.length||!found)return {signature:null,substitutions:new Map(),unsupported:['Class callable invocation has no qualified source method owner']};
            if(!arguments_.every(type=>valid(type)))return {signature:null,substitutions:new Map(),unsupported:['Class callable argument type is unresolved or outside the ordinary-class domain']};
            const result=instantiateCallableSignature(found.method.signature,found.method.typeParameters,arguments_);
            return {...result,owner:found.owner};
        }};
}
