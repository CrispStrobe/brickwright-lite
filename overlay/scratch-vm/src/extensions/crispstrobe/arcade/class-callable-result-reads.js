const primitiveOwner = require('../../../util/bw-primitive-owner');

// Private invocation records. A serialized result-flow declaration cannot
// mint an absent result: the exact current primitive must read the owned field.
module.exports = function createResultReads(runtime, values, heap, frames,
    {currentGraph,validateBody,subscribeLifecycle} = {}) {
    let tickets=new WeakMap(),threads=new WeakMap(),disposed=false;
    const fail=message=>{throw new Error('Class conditional result: '+message);};
    const reset=()=>{tickets=new WeakMap();threads=new WeakMap();};
    const events=['PROJECT_START','PROJECT_STOP_ALL','PROJECT_LOADED','RUNTIME_DISPOSED'];
    const subscriptions=events.map(event=>{
        const handler=()=>{if(event==='RUNTIME_DISPOSED')disposed=true;if(event==='PROJECT_LOADED')disposed=false;reset();};
        if(subscribeLifecycle)return subscribeLifecycle(event,handler);
        runtime.on(event,handler);return ()=>runtime.off(event,handler);
    });
    const current=(record,completing=false)=>{
        const done=record.thread.status===record.thread.constructor.STATUS_DONE;
        if(disposed||!runtime.targets.includes(record.target)||record.target.blocks!==record.container||
            record.thread.isKilled||(!runtime.threads.includes(record.thread)&&!(completing&&done))||completing&&!done||currentGraph?.(record.target)!==true||
            JSON.stringify(record.method)!==record.metadata||record.thread.stackFrames[0]?.params!==record.params||
            JSON.stringify(record.target.blocks.getProcedureParamNamesIdsAndDefaults(record.method.procedure)?.[0])!==JSON.stringify(record.parameterNames)||
            record.parameterNames.some((name,index)=>record.params[name]!==record.parameterValues[index]))fail('result record outlived its actual graph/frame');
        const proof=validateBody?.(record.target,record.method,record.receiver);
        if(!proof||proof.fieldReadBlock!==record.proof.fieldReadBlock||proof.procedure!==record.proof.procedure||
            proof.receiverParameter!==record.proof.receiverParameter||proof.className!==record.proof.className||
            proof.memberName!==record.proof.memberName)fail('current method body differs from its result certificate');
        return proof;
    };
    return Object.freeze({
        prepare(thread,target,method,receiver) {
            if(!method.resultFlow)return null;
            if(disposed||threads.has(thread)||thread.target!==target)fail('duplicate or foreign invocation record');
            const proof=validateBody?.(target,method,receiver);
            if(!proof||proof.procedure!==method.procedure||!proof.fieldReadBlock||
                target.blocks.getBlock(proof.fieldReadBlock.id)!==proof.fieldReadBlock||
                proof.fieldReadBlock.opcode!=='arcade_objectField')fail('method requires its current proved field-read body');
            const actual=heap.inspect(receiver),definition=heap.definition(actual.className),field=definition.fields.get(method.resultFlow.presenceField);
            if(actual.className!==proof.className||definition.intrinsic||definition.methods.get(proof.memberName)!==method||!field||field.getter||field.setter)
                fail('presence requires its actual ordinary backing field');
            const fieldClass=heap.definition(field.type);if(fieldClass.intrinsic)fail('intrinsic field cannot grant ordinary conditional result');
            if(method.callableSignature?.parameters[0]?.type?.parameters[0]?.type?.name!==field.type)
                fail('callback input differs from the actual presence field class');
            const parameterNames=target.blocks.getProcedureParamNamesIdsAndDefaults(method.procedure)?.[0],params=thread.stackFrames[0]?.params;
            if(!params||JSON.stringify(parameterNames)!==JSON.stringify([proof.receiverParameter,...method.parameters.map(row=>row.name)]))fail('invocation parameter mapping differs');
            const ticket=Object.freeze({}),record={thread,target,container:target.blocks,method,metadata:JSON.stringify(method),
                receiver,proof:Object.freeze({...proof}),params,parameterNames:Object.freeze(parameterNames.slice()),parameterValues:Object.freeze(parameterNames.map(name=>params[name])),ticket,read:false,absent:false};
            current(record);tickets.set(ticket,record);threads.set(thread,record);return ticket;
        },
        observe(util,args,value) {
            const record=util?.thread&&threads.get(util.thread);if(!record)return false;
            const block=primitiveOwner.current(util,args);if(!block||block!==record.proof.fieldReadBlock)return false;
            current(record);
            if(util.target!==record.target||args.OBJECT!==record.receiver||String(args.FIELD)!==record.method.resultFlow.presenceField)
                fail('read operands differ from the actual method receiver field');
            const captured=frames.receiverCell(util,{className:record.proof.className,methodName:record.proof.memberName,
                procedure:record.proof.procedure,receiverName:record.proof.receiverParameter});
            if(captured.values.value!==record.receiver||value!==heap.get(record.receiver,String(args.FIELD)))
                fail('read result differs from the actual owned field');
            if(record.read)fail('presence field read was repeated outside its single snapshot');
            record.read=true;record.absent=values.decode(value)===undefined;return true;
        },
        complete(ticket,value) {
            const record=tickets.get(ticket);if(!record)fail('unknown or retired result invocation');
            current(record,true);tickets.delete(ticket);threads.delete(record.thread);
            if(!record.read)fail('method never performed its actual certified field read');
            return record.absent&&values.decode(value)===undefined;
        },
        dispose(){disposed=true;reset();subscriptions.forEach(unsubscribe=>unsubscribe());}
    });
};
