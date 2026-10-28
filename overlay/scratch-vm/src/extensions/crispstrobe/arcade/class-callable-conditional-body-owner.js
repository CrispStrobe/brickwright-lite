const {inspectClassConditionalBody}=require('./class-callable-conditional-body.generated');
module.exports = function conditionalBodyOwner(target,method,heap,receiver) {
    const blocks=target?.blocks,fail=message=>{throw Error('Class conditional owner: '+message);};
    const definition=procedure=>{
        const prototypes=Object.values(blocks?._blocks||{}).filter(row=>row.opcode==='procedures_prototype'&&row.mutation?.proccode===procedure);
        if(prototypes.length!==1)fail('duplicate or missing actual method prototype');
        const prototype=prototypes[0],definitions=Object.values(blocks._blocks).filter(row=>row.opcode==='procedures_definition'&&row.inputs?.custom_block?.block===prototype.id);
        if(definitions.length!==1||prototype.parent!==definitions[0].id||blocks.getProcedureDefinition(procedure)!==definitions[0].id)fail('method definition differs from actual prototype');
        let names;try{names=JSON.parse(prototype.mutation.argumentnames);}catch{fail('malformed current parameter names');}
        if(JSON.stringify(names)!==JSON.stringify(blocks.getProcedureParamNamesIdsAndDefaults(procedure)?.[0]))fail('current cached parameter mapping differs');
        return {block:definitions[0],names};
    };
    const get=id=>{const row=blocks.getBlock(id);if(!row||row.id!==id||blocks._blocks[id]!==row)fail('block lacks actual container identity');return row;};
    const field=(row,name)=>row.fields?.[name]?.value;
    const literal=(row,name)=>{
        const direct=field(row,name);if(typeof direct==='string')return direct;
        const slot=row.inputs?.[name],value=slot?.block&&get(slot.block);
        if(!value||slot.block!==slot.shadow||!value.shadow||value.parent!==row.id||value.opcode!=='text'||typeof field(value,'TEXT')!=='string')fail('computed selector/local name is unqualified');
        return field(value,'TEXT');
    };
    const voidBody=(selected,seen=new Set())=>{
        if(seen.has(selected.procedure))fail('recursive Void followup body');seen.add(selected.procedure);
        const row=definition(selected.procedure),visited=new Set();
        const scan=(id,parent)=>{while(id){const block=get(id);if(visited.has(id)||block.parent!==parent)fail('cyclic or foreign Void body');visited.add(id);
            if(block.opcode==='arcade_returnValue'){const value=get(block.inputs?.VALUE?.block);
                if(value.parent!==block.id||value.opcode!=='arrays_valueUndefined'&&!(value.opcode==='arrays_specialValue'&&field(value,'KIND')==='undefined'))fail('Void followup returns an unproved value');
            }
            for(const[name,input]of Object.entries(block.inputs||{}))if(name.startsWith('SUBSTACK'))scan(input.block,block.id);
            parent=id;id=block.next;
        }};scan(row.block.next,row.block.id);return true;
    };
    const className=heap.inspect(receiver).className,cls=heap.definition(className);
    if(cls.intrinsic||cls.methods.get(method.name)!==method)fail('method lacks actual ordinary heap owner');
    const root=definition(method.procedure),receiverParameter=root.names[0];
    if(JSON.stringify(root.names)!==JSON.stringify([receiverParameter,...method.parameters.map(row=>row.name)]))fail('method parameters differ');
    const presence=cls.fields.get(method.resultFlow.presenceField),state=presence&&heap.definition(presence.type);
    if(!presence||presence.getter||presence.setter||state.intrinsic)fail('presence field lacks ordinary backing owner');
    return inspectClassConditionalBody({block:get,input:(row,name)=>row.inputs?.[name]?.block,literal,field,definition:root.block.id},method,{
        className,receiverParameter,validateFollowup(name){const selected=state.methods.get(name);
            if(!selected||selected.parameters.length||selected.typeParameters?.length||selected.returnType!=='void'||selected.callableSignature?.result?.name!=='void')return false;
            return voidBody(selected);
        }
    });
};
