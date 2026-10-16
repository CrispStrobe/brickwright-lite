const {validateClassCallablePlan} = require('./class-callable-plan.generated');
const createTypes = require('./class-callable-types');

// Private optional provider for the class-only v2 profile. A validated plan is
// never a frame issuer. The installed caller must supply its real graph guard.
module.exports = function createClassCallableProvider(runtime, values, heap, frames, {currentGraph,currentCall,signatureOf,sdkImages,sdkSchema=false} = {}) {
    const types = createTypes(runtime, values, heap, signatureOf, sdkImages,{sdkSchema}), proofs = new WeakMap();
    const fail = message => { throw new Error('Class callable provider: ' + message); };
    const catalogue = (plan,selected=null) => {
        for (const row of plan.classes) {
            if(selected&&!selected.has(row.name))continue;
            const definition = heap.definition(row.name);
            if (definition.intrinsic || (definition.parent || null) !== row.parent) fail('class catalogue differs from actual ordinary heap');
            const hasSdk=type=>type?.kind==='sdk'||type?.kind==='callable'&&(type.parameters.some(parameter=>hasSdk(parameter.type))||hasSdk(type.result));
            const actualRoles={fields:[...definition.fields.values()].filter(field=>field.valueKind==='sdk'||field.valueKind==='callable'&&hasSdk(field.callableSignature)).map(field=>field.valueKind==='sdk'?{name:field.name,type:field.type,sdkType:field.sdkType}:{name:field.name,type:field.type,callableSignature:field.callableSignature}),
                constructor:definition.parameters.flatMap((parameter,index)=>parameter.sdkType?[{index,name:parameter.name,type:parameter.type,sdkType:parameter.sdkType}]:[]),
                methods:[...definition.methods.values()].filter(method=>hasSdk(method.callableSignature)).map(method=>({name:method.name,typeParameters:method.typeParameters,callableSignature:method.callableSignature}))};
            const canonical=roles=>({fields:[...roles.fields].sort((a,b)=>a.name.localeCompare(b.name)),constructor:roles.constructor,methods:[...roles.methods].sort((a,b)=>a.name.localeCompare(b.name))});
            const expected=row.sdkRoles||{fields:[],constructor:[],methods:[]};
            if(JSON.stringify(canonical(actualRoles))!==JSON.stringify(canonical(expected)))fail('SDK class roles differ from actual registered heap');

        }
    };
    const current = (record, target) => {
        if (record.target !== target || !runtime.targets.includes(target) || target.blocks !== record.container ||
            typeof currentGraph !== 'function' || currentGraph(target, record.plan) !== true)
            fail('requires current canonical class block graph');
        catalogue(record.plan);
        const owner=record.creator;
        if(owner&&['method','constructor'].includes(owner.kind)) {
            const definition=heap.definition(owner.className);
            const selected=owner.kind==='constructor'?{procedure:definition.constructor,parameters:definition.parameters}:
                definition.methods.get(owner.memberName);
            if(!selected||selected.procedure!==owner.procedure||selected.parameters.length!==owner.signature.parameters.length||
                selected.parameters.some((parameter,index)=>parameter.name!==owner.signature.parameters[index].name||
                    parameter.optional!==owner.signature.parameters[index].optional||Object.hasOwn(parameter,'default')))
                fail('source creator differs from its actual heap procedure');
            if(selected.callableSignature) {
                if(JSON.stringify(selected.callableSignature)!==JSON.stringify(owner.signature)||
                    JSON.stringify(selected.typeParameters)!==JSON.stringify(owner.typeParameters))fail('source creator differs from its actual heap signature');
            }else if(owner.typeParameters.length||selected.parameters.some((parameter,index)=>
                (parameter.sdkType?parameter.type!=='Image'||JSON.stringify(parameter.sdkType)!==JSON.stringify(owner.signature.parameters[index].type):owner.signature.parameters[index].type.kind!=='named'||owner.signature.parameters[index].type.name!==parameter.type))||
                owner.kind==='method'&&(owner.signature.result.kind!=='named'||owner.signature.result.name!==selected.returnType))
                fail('source creator differs from its actual heap signature');
        }
    };
    const recordFor = proof => {const record = proofs.get(proof);if (!record) fail('unknown declaration proof');return record;};
    const freeze=value=>{for(const child of Object.values(value))if(child&&typeof child==='object')freeze(child);return Object.freeze(value);};
    function methodSignature(method) {
        if(!Array.isArray(method.typeParameters)||!Array.isArray(method.parameters))fail('method requires explicit generic and parameter metadata');
        const generics=new Set();
        for(const parameter of method.typeParameters) {
            if(!parameter||Object.keys(parameter).some(key=>!['name','constraint','defaultType'].includes(key))||
                !/^[A-Za-z_]\w*$/.test(parameter.name||'')||generics.has(parameter.name)||parameter.constraint!==''||parameter.defaultType!=='')
                fail('unqualified generic method parameter');
            generics.add(parameter.name);
        }
        const signature=types.validate(method.callableSignature,generics);
        if(signature.kind!=='callable'||signature.parameters.length!==method.parameters.length)fail('method signature arity differs');
        const parameters=method.parameters.map((parameter,index)=>{
            const expected=signature.parameters[index];
            if(!parameter||Object.keys(parameter).some(key=>!['name','type','optional','callableSignature'].includes(key))||
                parameter.name!==expected.name||parameter.optional!==false)fail('method parameter mapping differs');
            if(expected.type.kind==='callable') {
                if(parameter.type!=='callable'||JSON.stringify(parameter.callableSignature)!==JSON.stringify(expected.type))fail('method callback signature differs');
            }else if(parameter.type!==expected.type.name||parameter.callableSignature!==undefined)fail('method parameter type differs');
            return structuredClone(parameter);
        });
        if(method.returnType!==(['named','sdk'].includes(signature.result.kind)?signature.result.name:'callable'))fail('method return type differs');
        if(method.resultFlow!==undefined){
            const flow=method.resultFlow;
            if(!flow||typeof flow!=='object'||Array.isArray(flow)||Object.keys(flow).some(key=>!['schema','presenceField','absent','present'].includes(key))||
                flow.schema!=='bw-class-result-flow/v1'||!/^[A-Za-z_]\w*$/.test(flow.presenceField||'')||flow.absent!=='undefined'||flow.present!=='callback'||
                generics.size!==1||signature.result.kind!=='named'||!generics.has(signature.result.name)||signature.parameters.length!==1||
                signature.parameters[0].type.kind!=='callable'||signature.parameters[0].type.result.kind!=='named'||
                signature.parameters[0].type.result.name!==signature.result.name||signature.parameters[0].type.parameters.length!==1)
                fail('unqualified conditional method result flow');
        }
        return freeze({...method,parameters,typeParameters:structuredClone(method.typeParameters),callableSignature:signature});
    }
    function prepareDeclaration(target, descriptor) {
        if (!descriptor || descriptor.schema !== 'bw-callable-declaration' || descriptor.version !== 2 ||
            Object.keys(descriptor).some(key => !['schema','version','site','plan','procedure'].includes(key))) fail('invalid v2 declaration envelope');
        const plan = validateClassCallablePlan(descriptor.plan);
        const site = plan.sites.find(row => row.id === descriptor.site), owner = site && plan.owners.find(row => row.id === site.owner);
        if (!owner || owner.procedure !== descriptor.procedure) fail('source site/procedure mismatch');
        const creator = plan.owners.find(row => row.id === site.createdIn);
        const record = {target,container:target?.blocks,plan,creator,procedure:owner.procedure,signature:types.validate(owner.signature),receivers:new Map()};
        current(record, target);
        const nativeParameter = name => plan.bindings.find(binding => owner.parameters.includes(binding.id) && binding.sourceName === name).nativeName;
        const captures = site.captures.map(capture => {
            const binding = plan.bindings.find(row => row.id === capture.binding);
            if (binding.kind === 'receiver') {
                if (binding.owner !== creator.id || !['method','constructor'].includes(creator.kind)) fail('nested receiver creation requires separate invocation binding');
                record.receivers.set(binding.nativeName, {className:creator.className,methodName:creator.memberName,
                    procedure:creator.procedure,receiverName:creator.receiverParameter});
            }
            return {name:binding.nativeName,mode:capture.mode};
        });
        const proof = Object.freeze({descriptor:{procedure:owner.procedure,site:site.id,
            parameters:owner.signature.parameters.map(parameter => nativeParameter(parameter.name)),captures,defaults:[]},
            sourceOwner:creator.kind === 'module' ? {module:true} : {procedure:creator.procedure}});
        proofs.set(proof, record);return proof;
    }
    return Object.freeze({prepareDeclaration,methodSignature,
        assertSdkCatalogue(target,plan,className=null) {
            if(typeof currentGraph!=='function'||!currentGraph(target,plan))fail('requires current canonical class block graph');
            let selected=null;if(className){selected=new Set();let definition=heap.definition(className);while(definition){if(selected.has(definition.name))fail('cyclic SDK class ancestry');selected.add(definition.name);definition=definition.parent?heap.definition(definition.parent):null;}}
            catalogue(validateClassCallablePlan(plan),selected);
        },
        assertCurrent(proof,target) {current(recordFor(proof),target);},
        assertCreate(proof,target,util,operationArgs) {
            const record=recordFor(proof);current(record,target);
            if(typeof currentCall!=='function'||currentCall(util,{procedure:record.procedure,module:record.creator.kind==='module',args:operationArgs})!==true)
                fail('creation requires its actual current reporter and lexical caller');
            if(['method','constructor'].includes(record.creator.kind))frames.receiverCell(util,
                {className:record.creator.className,methodName:record.creator.memberName,
                    procedure:record.creator.procedure,receiverName:record.creator.receiverParameter});
        },
        ownsReceiver(proof,name) {return recordFor(proof).receivers.has(name);},
        receiverCell(proof,name,util) {
            const record = recordFor(proof);current(record,util?.target || util?.thread?.target);
            const receiver = record.receivers.get(name);if (!receiver) fail('missing actual receiver capture');
            return frames.receiverCell(util,receiver);
        },
        signature(proof) {const record=recordFor(proof);current(record,record.target);return structuredClone(record.signature);},
        invocation(proof,args,rawArgs=args) {const record=recordFor(proof);current(record,record.target);const signature=types.instantiate(record.signature,[],args);signature.parameters.forEach((parameter,index)=>{if(parameter.type.kind==='sdk')types.result({kind:'callable',parameters:[],result:parameter.type},rawArgs[index]);});return signature;},
        result(signature,value) {return types.result(signature,value);},
        fieldSignature(signature) {
            const validated=types.validate(signature);
            if(validated.kind!=='callable')fail('field requires an explicit callable signature');
            return freeze(validated);
        },
        fieldValue(signature,value) {
            // Uninitialized typed cells retain actual PXT undefined. They do
            // not become a callable resource, and invocation still refuses.
            const decoded=values.decode(value);if(decoded===undefined||decoded===null)return value;
            types.instantiate({kind:'callable',parameters:[{name:'callback',optional:false,type:signature}],result:{kind:'named',name:'void'}},[],[value]);
            return value;
        }
    });
};
