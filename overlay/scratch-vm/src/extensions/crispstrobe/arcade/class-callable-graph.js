const {validateClassCallablePlan} = require('./class-callable-plan.generated');
const primitiveOwner = require('../../../util/bw-primitive-owner');

// A run-bound semantic graph seal for the separate class profile. It does not
// issue frames or admit source. Captures also require the private frame issuer.
module.exports = function createClassCallableGraph(runtime,{subscribeLifecycle}={}) {
    let targets=null,disposed=false;
    const semantic=block=>JSON.stringify(Object.fromEntries(Object.entries(block).filter(([key])=>key!=='x'&&key!=='y')));
    const snapshot=target=>{
        if(!target||target.isOriginal===false||!target.blocks||!target.blocks._blocks)return null;
        const rows=new Map();
        for(const [id,block] of Object.entries(target.blocks._blocks)) {
            if(!block||block.id!==id||target.blocks.getBlock(id)!==block)return null;
            rows.set(id,{block,semantic:semantic(block)});
        }
        return {target,container:target.blocks,rows};
    };
    const start=()=>{
        targets=null;if(disposed)return;
        const snapshots=runtime.targets.map(snapshot);
        if(snapshots.every(Boolean))targets=snapshots;
    };
    const invalidate=()=>{targets=null;};
    const loaded=()=>{disposed=false;invalidate();};
    const dispose=()=>{disposed=true;invalidate();};
    const events=new Map([['PROJECT_START',start],['PROJECT_STOP_ALL',invalidate],['PROJECT_LOADED',loaded],['RUNTIME_DISPOSED',dispose]]);
    const subscribe=subscribeLifecycle || ((event,handler)=>{runtime.on(event,handler);return ()=>runtime.off(event,handler);});
    const unsubscribers=[...events].map(([event,handler])=>subscribe(event,handler));
    function projectCurrent() {
        if(disposed||!targets||runtime.targets.length!==targets.length)return false;
        return targets.every((record,index)=>{
            const target=runtime.targets[index];
            if(target!==record.target||target.isOriginal===false||target.blocks!==record.container||
                Object.keys(target.blocks._blocks).length!==record.rows.size)return false;
            return [...record.rows].every(([id,row])=>target.blocks.getBlock(id)===row.block&&semantic(row.block)===row.semantic);
        });
    }
    function current(target,plan) {
        if(!projectCurrent()||!targets.some(record=>record.target===target))return false;
        if(plan) {
            const validated=validateClassCallablePlan(plan),bindings=new Map(validated.bindings.map(row=>[row.id,row]));
            for(const owner of validated.owners) {
                if(owner.kind==='module')continue;
                const definition=target.blocks.getProcedureDefinition(owner.procedure);
                if(!definition||!target.blocks.getBlock(definition)||
                    target.blocks.getBlock(definition).opcode!=='procedures_definition')return false;
                const expected=[...(['method','constructor'].includes(owner.kind)?[owner.receiverParameter]:[]),
                    ...owner.parameters.map(id=>bindings.get(id).nativeName)];
                if(JSON.stringify(target.blocks.getProcedureParamNamesIdsAndDefaults(owner.procedure)?.[0])!==JSON.stringify(expected))return false;
            }
        }
        return true;
    }
    // Rejection-only SDK constraints come from the current connected metadata,
    // including declarations whose registration failed. They issue no frames.
    function sdkPlans(target) {
        if(!runtime.targets.includes(target))throw Error('SDK class catalogue requires its current target graph');
        const declarations=Object.values(target?.blocks?._blocks || {}).filter(block=>block.opcode==='arcade_declareCallable');
        if(!declarations.length)return [];
        if(!current(target))throw Error('SDK class catalogue requires its current target graph');
        const plans=new Map();
        for(const block of declarations){
            const input=block.inputs?.METADATA,child=target.blocks.getBlock(input?.block);
            if(!child||child.opcode!=='text'||!child.shadow||input.block!==input.shadow||child.parent!==block.id||
                typeof child.fields?.TEXT?.value!=='string')throw Error('SDK class catalogue requires fixed connected callable metadata');
            const envelope=JSON.parse(child.fields.TEXT.value);
            if(envelope?.version!==2&&envelope?.plan?.schema!=='bw-class-callable-lexical')continue;
            if(envelope.schema!=='bw-callable-declaration'||envelope.version!==2||
                Object.keys(envelope).some(key=>!['schema','version','site','plan'].includes(key)))throw Error('SDK class catalogue has malformed current class metadata');
            const plan=validateClassCallablePlan(envelope.plan);
            const site=plan.sites.find(row=>row.id===envelope.site),owner=site&&plan.owners.find(row=>row.id===site.owner);
            const nameInput=block.inputs?.NAME,name=target.blocks.getBlock(nameInput?.block);
            if(!owner||!name||name.opcode!=='text'||!name.shadow||nameInput.block!==nameInput.shadow||name.parent!==block.id||name.fields?.TEXT?.value!==owner.procedure)
                throw Error('SDK class catalogue requires its actual connected declaration owner');
            if(!plan.classes.some(row=>row.sdkRoles))continue;
            if(!current(target,plan))throw Error('SDK class catalogue requires its current owned procedure graph');
            plans.set(JSON.stringify(plan),plan);
        }
        const byClass=new Map();
        for(const plan of plans.values())for(const row of plan.classes){
            const previous=byClass.get(row.name);
            if(previous&&previous!==JSON.stringify(row))throw Error('SDK class catalogue has ambiguous current class roles');
            byClass.set(row.name,JSON.stringify(row));
        }
        return [...plans.values()];
    }
    function callerCurrent(util, operation=null) {
        const thread=util?.thread,target=util?.target || thread?.target;
        if(!thread||runtime.sequencer.activeThread!==thread||!runtime.threads.includes(thread)||thread.isKilled||
            thread.status===thread.constructor.STATUS_DONE||thread.target!==target||!current(target))return false;
        if(operation) {
            const block=primitiveOwner.current(util,operation.args),input=block?.inputs?.NAME,
                name=target.blocks.getBlock(input?.block);
            if(block?.opcode!=='arcade_createCallable'||!name||name.opcode!=='text'||!name.shadow||
                input.block!==input.shadow||name.parent!==block.id||name.fields?.TEXT?.value!==operation.procedure)return false;
            if(operation.module&&target.blocks.getBlock(thread.topBlock)?.opcode!=='arcade_whenSourceStarts')return false;
        }
        return true;
    }
    return Object.freeze({current,callerCurrent,sdkPlans,dispose() {
        dispose();unsubscribers.forEach(unsubscribe=>unsubscribe());
    }});
};
