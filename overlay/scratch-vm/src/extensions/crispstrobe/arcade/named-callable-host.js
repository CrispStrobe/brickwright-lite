const createGraph = require('./class-callable-graph');
const {inspectNamedCallableCurrent} = require('./named-callable-current.generated');

// Reuse the existing run-owned graph seal and synchronous create operation loan.
// A declaration label never stands in for an Arrow allocation or a JS function.
module.exports = function createNamedCallableHost(runtime,values,subscribeLifecycle) {
    if(!runtime||typeof runtime.on!=='function'||!Array.isArray(runtime.targets))return null;
    const graph=createGraph(runtime,{subscribeLifecycle});
    const normalized=target=>({blocks:Object.fromEntries(Object.entries(target.blocks._blocks).map(([id,block])=>[id,{
        ...block,fields:Object.fromEntries(Object.entries(block.fields||{}).map(([name,field])=>[name,[field.value,field.id]])),
        inputs:Object.fromEntries(Object.entries(block.inputs||{}).map(([name,input])=>[name,
            input.block===input.shadow?[1,input.block]:input.shadow?[3,input.block,input.shadow]:[2,input.block]]))
    }]))});
    return Object.freeze({
        prepare(target,descriptor) {
            if(!graph.current(target))throw new Error('Named callable declaration requires its current project owner');
            const normalizedTargets=runtime.targets.map(normalized),actual=normalizedTargets[runtime.targets.indexOf(target)];
            const current=inspectNamedCallableCurrent(actual,descriptor.plan,{targets:normalizedTargets});
            const site=descriptor.plan.sites.find(row=>row.id===descriptor.site),owner=site&&descriptor.plan.owners.find(row=>row.id===site.owner);
            if(!owner||owner.procedure!==descriptor.procedure)throw new Error('Named declaration procedure identity differs');
            return Object.freeze({target,plan:descriptor.plan,site:site.id,procedure:owner.procedure,result:owner.signature.result.name,signature:owner.signature,current});
        },
        assertCurrent(record,target) {
            if(record.target!==target||!graph.current(target))throw new Error('Named callable project is stopped, foreign or edited');
        },
        assertCreate(record,target,util,args) {
            if(record.target!==target||!graph.callerCurrent(util,{args,procedure:record.procedure,module:true}))
                throw new Error('Named callable value requires its actual live declaration read');
        },
        result(record,value) {
            if(!graph.current(record.target))throw new Error('Named callable result outlived its current owner');
            const decoded=values.decode(value),expected=record.result==='void'?'undefined':record.result;
            if(typeof decoded!==expected)throw new Error('Named callable result differs from its actual primitive declaration');
            return value;
        },
        dispose:graph.dispose
    });
};
