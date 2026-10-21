/** Directed scalar flow for export. Reference identity remains the responsibility
 * of the reference graph; copying a scalar does not alias its source cell. */
export function scalarExportFlow(project, isBoolean, sourceCells = new Map()) {
    const types=new Map(),edges=[],owners=new WeakMap(),definitions=new Map(),variables=new Map(),elements=new Map();
    const cell=(target,block)=>{
        if(!block)return 'missing';
        const owner=owners.get(block);
        if(block.opcode==='data_variable')return `variable:${block.fields.VARIABLE[1] || block.fields.VARIABLE[0]}`;
        if(block.opcode==='arcade_getLocal')return `${owner}:local:${literal(target,block,'NAME')}`;
        if(/^argument_reporter_/.test(block.opcode))return `${owner}:local:${block.fields.VALUE[0]}`;
        return block;
    };
    const add=(key,type)=>{if(!types.has(key))types.set(key,new Set());const values=types.get(key),before=values.size;values.add(type);return values.size!==before;};
    const child=(target,block,name)=>typeof block.inputs?.[name]?.[1]==='string'?target.blocks[block.inputs[name][1]]:null;
    const literal=(target,block,name)=>{if(block.fields?.[name])return String(block.fields[name][0]);const slot=block.inputs?.[name]?.[1],node=child(target,block,name);return Array.isArray(slot)?String(slot[1]):node?.shadow?String(Object.values(node.fields || {})[0]?.[0]):null;};
    const key=(target,name)=>`${target.isStage?'':target.name}:${name}`;
    for(const target of project.targets)for(const [blockId,block] of Object.entries(target.blocks || {}))if(block.topLevel){
        const proto=block.opcode==='procedures_definition' && child(target,block,'custom_block');
        const owner=proto?key(target,proto.mutation.proccode):`${target.name}:script:${blockId}`;
        if(proto)definitions.set(owner,JSON.parse(proto.mutation.argumentnames || '[]'));
        const seen=new Set(),visit=node=>{if(!node || seen.has(node))return;seen.add(node);owners.set(node,owner);for(const value of Object.values(node.inputs || {}))if(typeof value?.[1]==='string')visit(target.blocks[value[1]]);visit(target.blocks[node.next]);};visit(block);
    }
    const cache=new WeakMap();
    const input=(target,block,name)=>{
        if(!cache.has(block))cache.set(block,new Map());const cells=cache.get(block);if(cells.has(name))return cells.get(name);
        const node=child(target,block,name);if(node && !node.shadow)return cell(target,node);
        const slot=block.inputs?.[name]?.[1];if(Array.isArray(slot) && [12,13].includes(slot[0]))return `variable:${slot[2] || slot[1]}`;
        const value=Symbol(name);if(Array.isArray(slot))add(value,[4,5,6,7,8].includes(slot[0])?'number':'string');else if(node)add(value,node.opcode==='math_number'?'number':'string');cells.set(name,value);return value;
    };
    const element=value=>{if(!elements.has(value))elements.set(value,Symbol('array element'));return elements.get(value);};
    const edge=(from,to)=>edges.push([from,to]);
    const argumentCells=(target,block)=>{const values=[];let node=child(target,block,'ARGS');while(node?.opcode==='arcade_functionArgument'){values.push(input(target,node,'VALUE'));node=child(target,node,'REST');}return values;};
    for(const {id,type} of sourceCells.values())if(['Number','Boolean','String'].includes(type))add(`variable:${id}`,type.toLowerCase());
    const arithmetic=[];
    for(const target of project.targets)for(const block of Object.values(target.blocks || {})){
        const value=cell(target,block),owner=owners.get(block),op=block.opcode;
        if(isBoolean(block))add(value,'boolean');
        if(['math_number','bw_numberLiteral','arrays_referenceLength','arrays_referenceIndex','arrays_referenceFind','operator_add','operator_subtract','operator_multiply','operator_divide','operator_mod','operator_round','operator_random','planetemaths_min','planetemaths_max'].includes(op))add(value,'number');
        if(['text','bw_stringLiteral','operator_join','arcade_sourceTypeOf','arcade_inspectValue'].includes(op))add(value,'string');
        if(op==='arrays_valueUnary'){const operation=literal(target,block,'OP');add(value,operation==='typeof'?'string':operation==='!'?'boolean':'number');}
        if(op==='arrays_valueBinary'){
            const operation=literal(target,block,'OP');
            if(operation==='+')arithmetic.push([value,input(target,block,'LEFT'),input(target,block,'RIGHT')]);else add(value,'number');
        }
        if(op==='arrays_specialValue'){
            const kind=literal(target,block,'KIND');if(['undefined','null'].includes(kind))add(value,kind);else if(['NaN','Infinity','-Infinity'].includes(kind))add(value,'number');
        }
        if(op==='data_setvariableto'){
            const id=block.fields.VARIABLE[1] || block.fields.VARIABLE[0],destination=`variable:${id}`,source=input(target,block,'VALUE');
            variables.set(id,{target,name:block.fields.VARIABLE[0]});edge(source,destination);edge(element(source),element(destination));edge(element(destination),element(source));
        }
        if(op==='arcade_setLocal'){
            const source=input(target,block,'VALUE'),destination=`${owner}:local:${literal(target,block,'NAME')}`;
            edge(source,destination);edge(element(source),element(destination));edge(element(destination),element(source));
        }
        if(op==='arcade_returnValue')edge(input(target,block,'VALUE'),`${owner}:result`);
        if(op==='arcade_callFunction'){
            const called=key(target,literal(target,block,'NAME')),params=definitions.get(called);
            edge(`${called}:result`,value);edge(element(`${called}:result`),element(value));
            if(params)argumentCells(target,block).forEach((argument,index)=>{if(index<params.length){edge(argument,`${called}:local:${params[index]}`);edge(element(argument),element(`${called}:local:${params[index]}`));}});
        }
        if(op==='procedures_call'){
            // A stock call's inputs are keyed by argument ID, in prototype order.
            const called=key(target,block.mutation?.proccode),params=definitions.get(called);let ids=[];
            try{ids=JSON.parse(block.mutation?.argumentids||'[]');}catch{ids=[];}
            if(params&&Array.isArray(ids)&&ids.length===params.length)ids.forEach((id,index)=>{if(!block.inputs?.[id])return;const argument=input(target,block,id);edge(argument,`${called}:local:${params[index]}`);edge(element(argument),element(`${called}:local:${params[index]}`));});
        }
        if(op==='arrays_createReference'){
            add(value,'array');let item=child(target,block,'VALUES');while(item?.opcode==='arrays_referenceValues'){edge(input(target,item,'VALUE'),element(value));item=child(target,item,'REST');}
        }
        if(['arrays_referenceItem','arrays_referenceTake','arrays_referenceRandom'].includes(op))edge(element(input(target,block,'ARRAY')),value);
        if(op==='arrays_mutateReference' && ['push','unshift','set','insertAt'].includes(literal(target,block,'OP')))edge(input(target,block,'VALUE'),element(input(target,block,'ARRAY')));
        if(!types.has(value) && !['data_variable','arcade_getLocal','arcade_callFunction','arrays_referenceItem','arrays_referenceTake','arrays_referenceRandom','arrays_valueBinary','arrays_valueUnary','arrays_specialValue','argument_reporter_string_number','argument_reporter_boolean'].includes(op))add(value,'unknown');
    }
    let changed;
    do {
        changed=false;
        for(const [from,to]of edges)for(const type of types.get(from) || [])changed=add(to,type)||changed;
        for(const [value,left,right]of arithmetic){
            const l=types.get(left),r=types.get(right);
            if(!l?.size || !r?.size)continue;
            if(l.has('string') || r.has('string'))changed=add(value,'string')||changed;
            if([...l,...r].every(type=>['number','boolean','undefined','null'].includes(type)))changed=add(value,'number')||changed;
        }
    }while(changed);
    const type=key=>{const values=[...(types.get(key) || [])].filter(value=>!['undefined','null'].includes(value));return values.length===1 && ['number','boolean','string'].includes(values[0])?values[0]:'any';};
    const primitive=key=>{const values=[...(types.get(key)||[])];return values.length>0 && values.every(value=>['number','boolean','string','undefined','null'].includes(value));};
    return {types,type,primitive,variables,definitions};
}
