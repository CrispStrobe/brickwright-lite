/** Portable source-reference bindings, inspected before exporter mutations. */
export function sourceReferenceProject(project) {
    const result=new Map(),registered=new Set(),classes=new Set();
    const targets=project.targets||[],declared=block=>['arcade_declareSourceScalar','arcade_declareSourceReference'].includes(block?.opcode);
    const literal=(target,block,name)=>{
        const input=block.inputs?.[name]?.[1],child=typeof input==='string'?target.blocks?.[input]:null;
        return Array.isArray(input)&&input[0]===10?input[1]:child?.shadow&&child.opcode==='text'?child.fields?.TEXT?.[0]:null;
    };
    for(const target of targets)for(const block of Object.values(target.blocks||{}))if(['arcade_declareClass','arcade_declareSubclass'].includes(block.opcode)){
        const name=literal(target,block,'NAME');
        if(typeof name!=='string'||!/^[A-Za-z_]\w*$/.test(name)||classes.has(name))throw Error('Source reference export requires unique fixed class declarations');
        classes.add(name);
    }
    const supported=type=>['Sprite','Image','image.Font'].includes(type)||classes.has(type)||typeof type==='string'&&type.endsWith('[]')&&(['number','boolean','string','Sprite','Image'].includes(type.slice(0,-2))||classes.has(type.slice(0,-2)));
    for(const target of targets)for(const hat of Object.values(target.blocks||{})){
        if(!hat.topLevel||hat.opcode!=='arcade_whenSourceStarts')continue;
        let block=target.blocks[hat.next];const seen=new Set();
        while(declared(block)){
            if(seen.has(block))throw Error('Cyclic source declaration sequence');seen.add(block);
            if(block.opcode==='arcade_declareSourceReference'){
                const slot=block.inputs?.VARIABLE?.[1],reporter=typeof slot==='string'?target.blocks[slot]:null;
                const id=Array.isArray(slot)&&slot[0]===12?slot[2]:reporter?.opcode==='data_variable'?reporter.fields?.VARIABLE?.[1]:null;
                const type=block.fields?.TYPE?.[0];
                if(block.inputs?.TYPE||!supported(type)||!id)throw Error('Source reference export requires a variable ID and direct supported type field');
                const owner=Object.hasOwn(target.variables||{},id)?target:targets.find(candidate=>candidate.isStage&&Object.hasOwn(candidate.variables||{},id));
                if(!owner||result.has(id))throw Error('Source reference export variable is missing, foreign or duplicated');
                result.set(id,{id,type,target:owner,name:owner.variables[id][0]});registered.add(block);
            }
            block=target.blocks[block.next];
        }
    }
    for(const target of targets)for(const block of Object.values(target.blocks||{}))if(block.opcode==='arcade_declareSourceReference'&&!registered.has(block))throw Error('Source reference declarations must precede source initializers');
    return result;
}
