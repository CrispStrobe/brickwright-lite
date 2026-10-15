const {validateCallableLexicalPlan}=require('./callable-lexical-plan.generated');
// Callable declarations extend the atomic source prelude, never scalar or
// object-reference type domains. Binding authority is the connected stock ID.
const OPCODE='arcade_declareSourceCallable';
const fail=message=>{throw new Error('Source callable declaration: '+message);};
const record=value=>value!==null && typeof value==='object' && !Array.isArray(value);
const only=(value,keys)=>record(value) && Object.keys(value).every(key=>keys.includes(key));
function concreteType(value,parameter=false) {
    if(!record(value))fail('missing concrete signature');
    if(value.kind==='named') {
        if(!only(value,['kind','name']) || !['number','string','boolean','null','undefined',...(parameter?[]:['void'])].includes(value.name))
            fail('unqualified signature type');
        return {kind:'named',name:value.name};
    }
    if(value.kind!=='callable' || !only(value,['kind','parameters','result']) || !Array.isArray(value.parameters))fail('unqualified signature type');
    const names=new Set();let optional=false;
    const parameters=value.parameters.map(row=>{
        if(!only(row,['name','optional','type']) || typeof row.name!=='string' || !/^[A-Za-z_]\w*$/.test(row.name) ||
            names.has(row.name) || typeof row.optional!=='boolean' || optional&&!row.optional)fail('invalid ordered parameters');
        names.add(row.name);optional ||= row.optional;
        return {name:row.name,optional:row.optional,type:concreteType(row.type,true)};
    });
    return {kind:'callable',parameters,result:concreteType(value.result)};
}
module.exports={
    matches:block=>block?.opcode===OPCODE,
    resolve(target,block,originals) {
        const reporter=target.blocks.getBlock(block.inputs?.VARIABLE?.block);
        if(reporter?.opcode!=='data_variable')fail('requires a connected stock variable reporter');
        const id=reporter.fields?.VARIABLE?.id, variable=typeof id==='string'&&target.lookupVariableById(id);
        const owner=originals.find(candidate=>Object.hasOwn(candidate.variables || {},id)&&candidate.variables[id]===variable);
        if(!owner || !variable || variable.type!=='' || owner!==target&&!owner.isStage)fail('missing, foreign or nonscalar variable binding');
        const input=block.inputs?.SIGNATURE, signatureBlock=target.blocks.getBlock(input?.block);
        if(!signatureBlock || signatureBlock.opcode!=='text' || !signatureBlock.shadow || input.block!==input.shadow ||
            typeof signatureBlock.fields?.TEXT?.value!=='string')fail('requires fixed signature text');
        let value;try {value=JSON.parse(signatureBlock.fields.TEXT.value);} catch(_){fail('malformed signature JSON');}
        let binding=null,seal=null;
        if(value?.schema==='bw-callable-variable') {
            if(!only(value,['schema','version','binding','signature','variableId','variableName']) || value.version!==1 || typeof value.binding!=='string' || !/^binding_\d+$/.test(value.binding))
                fail('unknown source variable envelope');
            if(typeof value.variableId!=='string'||value.variableId!==id||typeof value.variableName!=='string'||!value.variableName)fail('lexical variable ID seal differs from connected binding');
            binding=value.binding;seal=value;value=value.signature;
        }
        const signature=concreteType(value);
        if(signature.kind!=='callable')fail('requires a concrete function signature');
        if(binding) {
            const plans=[];
            for(const candidate of Object.values(target.blocks._blocks || {})) {
                if(candidate.opcode!=='arcade_declareCallable')continue;
                const child=target.blocks.getBlock(candidate.inputs?.METADATA?.block);
                if(child?.opcode!=='text' || !child.shadow || candidate.inputs.METADATA.block!==candidate.inputs.METADATA.shadow)
                    fail('source plan requires fixed declaration metadata');
                let envelope;try{envelope=JSON.parse(child.fields?.TEXT?.value);}catch(_){fail('malformed source plan metadata');}
                if(envelope?.schema!=='bw-callable-declaration')continue;
                if(![1,3].includes(envelope.version) || !only(envelope,['schema','version','site','plan']))fail('unknown source plan envelope');
                const plan=validateCallableLexicalPlan(envelope.plan);
                if(!plan.sites.some(site=>site.id===envelope.site))fail('foreign source plan site');
                plans.push(plan);
            }
            if(!plans.length || plans.some(plan=>JSON.stringify(plan)!==JSON.stringify(plans[0])))fail('missing or inconsistent lexical plans');
            const row=plans[0].bindings.find(row=>row.id===binding);
            if(!row || row.owner!==plans[0].module || row.kind!=='global' || row.type.kind!=='callable' ||
                JSON.stringify(concreteType(row.type))!==JSON.stringify(signature)||row.nativeName!==seal.variableName)fail('source variable signature/binding differs from lexical plan');
        }
        const typeInfo={binding,signature};
        return {target,block,id,type:'Callable',typeInfo,reference:false,additional:true,variable,owner};
    },
    same:(left,right)=>JSON.stringify(left)===JSON.stringify(right)
};
