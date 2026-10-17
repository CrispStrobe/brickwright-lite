import {renderCallableType} from './callable-type-syntax.js';

// Inert editable class metadata. Invocation ownership and closure bodies are
// validated separately by the native issuer and current-body lexical exporter.
export function classCallableExportTypes(classes,builtinNames=new Set()) {
    const fail=message=>{throw new Error('Class callable export: '+message);};
    const keys=(value,allowed)=>value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).every(key=>allowed.includes(key));
    const ordinary=name=>{
        const seen=new Set();let cls=classes.get(name);
        if(!cls)fail('unresolved ordinary class '+name);
        while(cls){if(seen.has(cls.name)||builtinNames.has(cls.name))fail('intrinsic or cyclic class signatures are not qualified');seen.add(cls.name);if(cls.parent&&!classes.has(cls.parent))fail('unresolved ordinary parent '+cls.parent);cls=cls.parent?classes.get(cls.parent):null;}
    };
    const type=(value,generics=new Set())=>{
        if(value?.kind==='sdk') {
            if(!keys(value,['kind','name'])||value.name!=='Image')fail('unqualified SDK signature domain');
        }else if(value?.kind==='named') {
            if(!keys(value,['kind','name'])||!/^[A-Za-z_]\w*$/.test(value.name||'')||['any','unknown'].includes(value.name))fail('opaque or malformed signature');
            if(!generics.has(value.name)&&!['number','string','boolean','null','undefined','void'].includes(value.name))ordinary(value.name);
        }else if(value?.kind==='callable') {
            if(!keys(value,['kind','parameters','result'])||!Array.isArray(value.parameters))fail('malformed callable signature');
            const names=new Set();
            for(const parameter of value.parameters){if(!keys(parameter,['name','optional','type'])||!/^[A-Za-z_]\w*$/.test(parameter.name||'')||parameter.optional!==false||names.has(parameter.name))fail('unqualified signature parameter');names.add(parameter.name);type(parameter.type,generics);}
            type(value.result,generics);
        }else fail('unsupported signature domain');
    };
    const field=field=>{
        if(field.valueKind==='sdk'){
            if(field.type!=='Image'||field.sdkType?.kind!=='sdk'||field.getter||field.setter||field.callableSignature!==undefined)fail('invalid explicit SDK Image field');
            type(field.sdkType);return 'Image';
        }
        if(field.type!=='callable'||field.valueKind!=='callable'||field.getter||field.setter)fail('invalid explicit callable field');
        type(field.callableSignature);if(field.callableSignature.kind!=='callable')fail('field requires a callable signature');
        return renderCallableType(field.callableSignature);
    };
    const method=method=>{
        if(!Array.isArray(method.typeParameters)||!Array.isArray(method.parameters)||method.callableSignature?.kind!=='callable')fail('missing method template');
        const generics=new Set();
        for(const parameter of method.typeParameters){if(!keys(parameter,['name','constraint','defaultType'])||!/^[A-Za-z_]\w*$/.test(parameter.name||'')||generics.has(parameter.name)||parameter.constraint!==''||parameter.defaultType!=='')fail('unqualified generic parameters');generics.add(parameter.name);}
        type(method.callableSignature,generics);
        if(method.parameters.length!==method.callableSignature.parameters.length)fail('method signature arity differs');
        method.parameters.forEach((parameter,index)=>{
            const expected=method.callableSignature.parameters[index];
            if(!keys(parameter,['name','type','optional','callableSignature'])||parameter.name!==expected.name||parameter.optional!==false)fail('method parameter mapping differs');
            if(expected.type.kind==='callable') {
                if(parameter.type!=='callable'||JSON.stringify(parameter.callableSignature)!==JSON.stringify(expected.type))fail('callback signature differs');
            }else if(parameter.type!==expected.type.name||parameter.callableSignature!==undefined)fail('method parameter type differs');
        });
        if(method.returnType!==(['named','sdk'].includes(method.callableSignature.result.kind)?method.callableSignature.result.name:'callable'))fail('method result differs');
        return {generics:[...generics],parameters:method.callableSignature.parameters.map(parameter=>renderCallableType(parameter.type)),result:renderCallableType(method.callableSignature.result)};
    };
    const parameter=parameter=>{
        if(parameter.callableSignature!==undefined) {
            if(!keys(parameter,['name','type','optional','callableSignature'])||parameter.type!=='callable'||
                parameter.optional!==false||parameter.sdkType!==undefined||parameter.callableSignature?.kind!=='callable')
                fail('invalid explicit callable constructor parameter');
            type(parameter.callableSignature);return renderCallableType(parameter.callableSignature);
        }
        if(parameter.sdkType===undefined)return parameter.type;
        if(parameter.type!=='Image'||parameter.sdkType?.kind!=='sdk'||parameter.callableSignature!==undefined)fail('invalid explicit SDK Image constructor parameter');
        type(parameter.sdkType);return 'Image';
    };
    return Object.freeze({field,method,ordinary,parameter});
}
