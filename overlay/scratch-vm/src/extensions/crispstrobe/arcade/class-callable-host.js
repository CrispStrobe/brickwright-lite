const createGraph = require('./class-callable-graph');
const createFrames = require('./class-callable-frames');
const createProvider = require('./class-callable-provider');
const createTypes = require('./class-callable-types');
const createResultReads = require('./class-callable-result-reads');
const conditionalBodyOwner = require('./class-callable-conditional-body-owner');

// Private extension integration. Serialized declarations cannot issue a frame;
// only the real managed procedure dispatch supplies its sentinel parameter map.
module.exports = function createClassCallableHost(runtime, values, createHeap, nativeHooks, callableOwner, sdkImages) {
    if (!runtime || typeof runtime.on !== 'function' || !Array.isArray(runtime.targets)) return null;
    let provider;
    const heap = createHeap(runtime, values, {...nativeHooks,
        sdkSignature: type => types.validate(type),
        sdkField: (type,value) => {types.result({kind:'callable',parameters:[],result:type},value);},
        callableSignature: signature => provider.fieldSignature(signature),
        callableField: (signature, value) => provider.fieldValue(signature, value),
        callableMethod: method => provider.methodSignature(method)});
    const listeners=new Map();
    const subscribeLifecycle=(event,handler)=>{
        let entry=listeners.get(event);
        if(!entry){const handlers=new Set(),dispatch=()=>{for(const callback of [...handlers])callback();};entry={handlers,dispatch};listeners.set(event,entry);runtime.on(event,dispatch);}
        entry.handlers.add(handler);
        return ()=>{entry.handlers.delete(handler);if(!entry.handlers.size){runtime.off(event,entry.dispatch);listeners.delete(event);}};
    };
    const graph = createGraph(runtime,{subscribeLifecycle});
    const frames = createFrames(runtime, heap, {currentGraph: util => graph.callerCurrent(util),subscribeLifecycle});
    const signatureOf = reference => callableOwner().signature(reference);
    provider = createProvider(runtime, values, heap, frames, {
        currentGraph: graph.current, currentCall: graph.callerCurrent, signatureOf, sdkImages});
    const types = createTypes(runtime, values, heap, signatureOf, sdkImages);
    const resultReads=createResultReads(runtime,values,heap,frames,{currentGraph:graph.current,subscribeLifecycle,
        validateBody:(target,method,receiver)=>conditionalBodyOwner(target,method,heap,receiver)});
    const completions=new WeakMap();
    const matches = (procedure, args, token) => {
        if (!args.length) return [];
        let actual;
        try {actual = heap.inspect(args[0]);} catch {return [];}
        const rows = [], seen = new Set(), methods = new Set();
        let classProfile=false;
        let definition = heap.definition(actual.className);
        while (definition) {
            if (seen.has(definition.name) || definition.intrinsic) return [];
            seen.add(definition.name);
            classProfile ||= [...definition.fields.values()].some(field=>['callable','sdk'].includes(field.valueKind)) || [...definition.methods.values()].some(method=>method.callableSignature) || definition.parameters.some(parameter=>parameter.sdkType);
            for (const method of definition.methods.values()) if (method.procedure === procedure && !methods.has(method)) {
                methods.add(method);rows.push({method});
            }
            if (definition.constructor === procedure && heap.constructionActive(args[0], token)) rows.push({constructor:true});
            definition = definition.parent ? heap.definition(definition.parent) : null;
        }
        return classProfile ? rows : [];
    };
    const rawSdkInputs=(signature,args)=>{signature.parameters.forEach((parameter,index)=>{if(parameter.type.kind==='sdk')types.result({kind:'callable',parameters:[],result:parameter.type},args[index]);});};
    return Object.freeze({heap, provider, subscribeLifecycle,
        validateConstructor(definition,args,target) {
            if(target)for(const plan of graph.sdkPlans(target))if(plan.classes.some(row=>row.name===definition.name))provider.assertSdkCatalogue(target,plan);
            definition.parameters.forEach((parameter,index)=>{if(parameter.sdkType)types.result({kind:'callable',parameters:[],result:parameter.sdkType},args[index]);});
        },
        validateMethodInputs(method,args) {
            if(method.callableSignature){const signature=types.instantiate(method.callableSignature,method.typeParameters,args);rawSdkInputs(signature,args);}
        },
        bind(thread, target, procedure, params, token, args, rawArgs=args) {
            const owners = matches(procedure, args, token);
            if (!owners.length) return null;
            if (owners.length !== 1) throw new Error('Class callable managed procedure ownership is ambiguous');
            if (!graph.current(target)) throw new Error('Class callable managed dispatch requires the current project graph');
            for(const plan of graph.sdkPlans(target))provider.assertSdkCatalogue(target,plan);
            const method = owners[0].method;
            const result = method?.callableSignature ? types.instantiate(method.callableSignature, method.typeParameters, args.slice(1)) : null;
            if(result)rawSdkInputs(result,rawArgs.slice(1));
            frames.bind(thread, target, procedure, params, token);
            if(!result)return null;
            const ticket=Object.freeze({});
            completions.set(ticket,{target,method,signature:result,metadata:JSON.stringify(method),resultRead:resultReads.prepare(thread,target,method,args[0])});
            return ticket;
        },
        result(ticket, value) {
            if(!ticket)return value;
            const completion=completions.get(ticket);
            if(!completion||!graph.current(completion.target)||JSON.stringify(completion.method)!==completion.metadata)
                throw new Error('Class callable result outlived its actual invocation');
            completions.delete(ticket);
            if(completion.resultRead&&resultReads.complete(completion.resultRead,value))return value;
            return types.result(completion.signature,value);
        },
        observeObjectField(args,util,value){return resultReads.observe(util,args,value);},
        dispose() {resultReads.dispose();frames.dispose();graph.dispose();}
    });
};
