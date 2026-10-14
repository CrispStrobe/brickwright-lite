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
    return Object.freeze({current,callerCurrent,dispose() {
        dispose();unsubscribers.forEach(unsubscribe=>unsubscribe());
    }});
};
