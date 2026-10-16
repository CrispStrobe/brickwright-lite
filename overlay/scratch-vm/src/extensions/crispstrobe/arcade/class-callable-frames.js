// Internal managed-class frame ownership for callable receiver capture. The
// extension keeps the issuer private; labels and serialized plans cannot mint
// one of these bindings. Runtime admission is a separate class/callable bridge.
module.exports = function createClassCallableFrames(runtime, heap, {currentGraph,subscribeLifecycle} = {}) {
    let generation=0, disposed=false, frames=new WeakMap();
    const reset=()=>{generation++;frames=new WeakMap();};
    const loaded=()=>{disposed=false;reset();};
    const suspend=()=>{disposed=true;reset();};
    const subscribe=subscribeLifecycle || ((event,handler)=>{runtime.on(event,handler);return ()=>runtime.off(event,handler);});
    const unsubscribers=[subscribe('PROJECT_START',reset),subscribe('PROJECT_STOP_ALL',reset),
        subscribe('PROJECT_LOADED',loaded),subscribe('RUNTIME_DISPOSED',suspend)];
    const alive=(thread,target)=>!disposed&&thread&&!thread.isKilled&&runtime.threads.includes(thread)&&
        runtime.targets.includes(target)&&thread.target===target&&thread.status!==thread.constructor.STATUS_DONE;
    const signature=(owner,selected)=>JSON.stringify(selected.constructor?{procedure:owner.constructor,parameters:owner.parameters}:
        {procedure:owner.methods.get(selected.methodName)?.procedure,parameters:owner.methods.get(selected.methodName)?.parameters,
            returnType:owner.methods.get(selected.methodName)?.returnType,typeParameters:owner.methods.get(selected.methodName)?.typeParameters,
            callableSignature:owner.methods.get(selected.methodName)?.callableSignature});
    function ancestry(className) {
        const rows=[],seen=new Set();let definition=heap.definition(className);
        while(definition) {
            if(seen.has(definition.name)||definition.intrinsic)throw new Error('Callable receiver requires ordinary managed class ancestry');
            seen.add(definition.name);rows.push(definition);
            definition=definition.parent?heap.definition(definition.parent):null;
        }
        return rows;
    }
    function bind(thread,target,procedure,params,constructionToken) {
        if(!alive(thread,target)||frames.has(thread))throw new Error('Class callable frame is stale or already bound');
        const definition=target.blocks.getProcedureDefinition(procedure),names=target.blocks.getProcedureParamNamesIdsAndDefaults(procedure)?.[0];
        if(!definition||thread.topBlock!==definition||!Array.isArray(names)||!names.length||
            thread.stackFrames[0]?.params!==params||thread.stackFrames[0]?.waitingReporter!==procedure)
            throw new Error('Class callable frame requires its actual managed procedure and parameter frame');
        const receiver=params[names[0]],className=heap.inspect(receiver).className,chain=ancestry(className),matches=[],methodOwners=new Map();
        for(const owner of chain) {
            for(const method of owner.methods.values())if(method.procedure===procedure)
                methodOwners.set(method,{className:owner.name,methodName:method.name,parameters:method.parameters,descriptor:method,constructor:false});
            if(owner.constructor===procedure&&heap.constructionActive(receiver,constructionToken))
                matches.push({className:owner.name,methodName:null,parameters:owner.parameters,constructor:true});
        }
        // The inherited table retains the same descriptor object. Its deepest
        // declaring ancestor owns it; different descriptors sharing a code
        // remain ambiguous and are refused.
        matches.push(...methodOwners.values());
        const unique=new Map(matches.map(match=>[match.className+'\0'+match.methodName,match]));
        if(unique.size!==1)throw new Error('Class callable frame has no unique actual class procedure owner');
        const selected=[...unique.values()][0];
        if(names.length!==selected.parameters.length+1||selected.parameters.some((parameter,index)=>parameter.name!==names[index+1]))
            throw new Error('Class callable frame parameter mapping differs from its class descriptor');
        frames.set(thread,Object.freeze({generation,target,container:target.blocks,definition,procedure,params,
            parameterNames:Object.freeze(names.slice()),receiverName:names[0],receiver,selected:Object.freeze(selected),constructionToken,
            ancestry:JSON.stringify(chain.map(owner=>owner.name)),signature:signature(heap.definition(selected.className),selected)}));
    }
    function receiverCell(util,{className,methodName,procedure,receiverName}) {
        if(typeof currentGraph!=='function'||currentGraph(util)!==true)
            throw new Error('Callable receiver capture requires its current canonical class block graph');
        const thread=util?.thread,record=thread&&frames.get(thread),target=util?.target || thread?.target;
        if(!record||record.generation!==generation||!alive(thread,target)||runtime.sequencer.activeThread!==thread||
            record.target!==target||record.container!==target.blocks||record.procedure!==procedure||
            record.selected.className!==className||record.selected.methodName!==methodName||record.receiverName!==receiverName||
            target.blocks.getProcedureDefinition(procedure)!==record.definition||thread.stackFrames[0]?.params!==record.params||
            JSON.stringify(target.blocks.getProcedureParamNamesIdsAndDefaults(procedure)?.[0])!==JSON.stringify(record.parameterNames)||
            record.params[receiverName]!==record.receiver)
            throw new Error('Callable receiver capture requires its actual current class invocation');
        if(JSON.stringify(ancestry(heap.inspect(record.receiver).className).map(owner=>owner.name))!==record.ancestry)
            throw new Error('Callable receiver class ancestry changed');
        const actualOwner=heap.definition(record.selected.className);
        if(!record.selected.constructor&&actualOwner.methods.get(record.selected.methodName)!==record.selected.descriptor)
            throw new Error('Callable receiver class method descriptor changed');
        if(signature(actualOwner,record.selected)!==record.signature)
            throw new Error('Callable receiver class procedure signature changed');
        if(record.selected.constructor&&!heap.constructionActive(record.receiver,record.constructionToken))
            throw new Error('Callable constructor receiver capture outlived construction');
        return Object.freeze({values:Object.freeze({value:record.receiver}),key:'value'});
    }
    return {bind,receiverCell,abortThread:thread=>frames.delete(thread),dispose() {suspend();unsubscribers.forEach(unsubscribe=>unsubscribe());}};
};
