// Current connected inputs and complete directed writers provide authority.
// Saved values, type annotations and procedure/variable name spellings do not.
export function sdkFontInputAuthority(project) {
    const initialized=new WeakMap(),uninitialized=new WeakMap(),unknownLocalWriters=new Set();
    const types=new Map(),owners=new WeakMap(),definitions=new Map(),edges=[],rules=[],calls=[];
    const blocksOf=target=>target.blocks||{};
    const child=(target,block,name)=>typeof block.inputs?.[name]?.[1]==='string'?blocksOf(target)[block.inputs[name][1]]:null;
    const fixed=(block,name)=>!block.inputs?.[name]&&typeof block.fields?.[name]?.[0]==='string'?block.fields[name][0]:null;
    const literal=(target,block,name)=>{const direct=fixed(block,name);if(direct!==null)return direct;const slot=block.inputs?.[name]?.[1],node=child(target,block,name);return Array.isArray(slot)&&slot[0]===10?slot[1]:node?.shadow&&node.opcode==='text'?node.fields?.TEXT?.[0]:null;};
    const add=(cell,type)=>{if(!types.has(cell))types.set(cell,new Set());const set=types.get(cell),before=set.size;set.add(type);return before!==set.size;};
    const key=(target,code)=>`${project.targets.indexOf(target)}:${code}`;
    const variables=new Map();
    const variable=(target,id)=>{
        const owner=typeof id==='string'?(Object.hasOwn(target.variables||{},id)?target:project.targets.find(candidate=>candidate.isStage&&Object.hasOwn(candidate.variables||{},id))):null;
        if(!owner){const value=Symbol('unowned variable');add(value,'Opaque');return value;}
        const name=key(owner,'var:'+id);variables.set(name,owner);return name;
    };
    const cell=(target,block)=>!block?'missing':block.opcode==='data_variable'?variableRead(target,block,block.fields.VARIABLE?.[1]):block.opcode==='arcade_getLocal'?localCell(target,block):/^argument_reporter_/.test(block.opcode)?`${owners.get(block)}:param:${block.fields.VALUE?.[0]}`:block;
    function variableRead(target,block,id){const result=variable(target,id);if(!owners.get(block)||!initialized.get(block)?.has('variable:'+String(result))){if(!uninitialized.has(block))uninitialized.set(block,new Map());const cache=uninitialized.get(block);if(!cache.has(id)){const opaque=Symbol('uninitialized variable read');cache.set(id,opaque);add(opaque,'Opaque');}return cache.get(id);}return result;}
    function localCell(target,block){const owner=owners.get(block),name=literal(target,block,'NAME');if(!owner||typeof name!=='string'||!name||!initialized.get(block)?.has(name)){add(block,'Opaque');return block;}return `${owner}:local:${name}`;}
    const inputCells=new WeakMap();
    const input=(target,block,name)=>{
        const node=child(target,block,name);if(node)return cell(target,node);
        const slot=block.inputs?.[name]?.[1];
        if(Array.isArray(slot)&&slot[0]===12)return variableRead(target,block,slot[2]);
        if(!inputCells.has(block))inputCells.set(block,new Map());const cache=inputCells.get(block);if(cache.has(name))return cache.get(name);
        const value=Symbol(name);cache.set(name,value);add(value,Array.isArray(slot)?slot[0]===10?'String':[4,5,6,7,8].includes(slot[0])?'Number':'Opaque':'Opaque');return value;
    };
    const exact=(value,type)=>types.get(value)?.size===1&&types.get(value).has(type);
    const edge=(from,to)=>edges.push([from,to]);
    function walk(target,id,owner,path=new Set()){
        const block=blocksOf(target)[id];if(!block)return false;
        if(path.has(id)){add(`${owner}:result`,'Opaque');return false;}
        path=new Set(path);path.add(id);
        const previous=owners.get(block);if(previous&&previous!==owner){add(cell(target,block),'Opaque');add(`${owner}:result`,'Opaque');return false;}owners.set(block,owner);
        for(const slot of Object.values(block.inputs||{}))if(typeof slot?.[1]==='string')walk(target,slot[1],owner,path);
        if(block.opcode==='arcade_returnValue'){edge(input(target,block,'VALUE'),`${owner}:result`);return true;}
        const completeIf=block.opcode==='control_if_else'&&walk(target,block.inputs.SUBSTACK?.[1],owner,path)&&walk(target,block.inputs.SUBSTACK2?.[1],owner,path);
        return completeIf||!!block.next&&walk(target,block.next,owner,path);
    }
    for(const target of project.targets)for(const[id,block]of Object.entries(blocksOf(target)))if(block.topLevel){
        const prototype=block.opcode==='procedures_definition'?child(target,block,'custom_block'):null;
        const owner=prototype?key(target,prototype.mutation?.proccode):key(target,'script:'+id);
        if(prototype){let names;try{names=JSON.parse(prototype.mutation.argumentnames||'[]');}catch{names=null;}
            if(!Array.isArray(names)||names.some(name=>typeof name!=='string'||!name)||new Set(names).size!==names.length||definitions.has(owner))definitions.set(owner,null);else definitions.set(owner,{target,block,names});}
        if(!walk(target,id,owner)&&prototype)add(`${owner}:result`,'Undefined');
    }
    // A local read must have a real initial formal or a dominating command
    // write. Branch-only and loop-only writes cannot initialize later reads.
    function initialization(target,id,known,path=new Set()){
        const block=blocksOf(target)[id];if(!block||path.has(id))return known;
        path=new Set(path);path.add(id);initialized.set(block,new Set(known));
        for(const [name,slot]of Object.entries(block.inputs||{}))if(!name.startsWith('SUBSTACK')&&typeof slot?.[1]==='string')initialization(target,slot[1],known,path);
        if(block.opcode==='control_if_else'){
            const left=initialization(target,block.inputs.SUBSTACK?.[1],new Set(known),path),right=initialization(target,block.inputs.SUBSTACK2?.[1],new Set(known),path);
            known=new Set([...left].filter(name=>right.has(name)));
        }else for(const [name,slot]of Object.entries(block.inputs||{}))if(name.startsWith('SUBSTACK')&&typeof slot?.[1]==='string')initialization(target,slot[1],new Set(known),path);
        if(block.opcode==='data_setvariableto')known=new Set([...known,'variable:'+String(variable(target,block.fields.VARIABLE?.[1]))]);
        if(block.opcode==='arcade_setLocal'){const name=literal(target,block,'NAME');if(name!==null)known=new Set([...known,name]);}
        return block.next?initialization(target,block.next,known,path):known;
    }
    for(const target of project.targets)for(const[id,block]of Object.entries(blocksOf(target)))if(block.topLevel){const def=definitions.get(owners.get(block));initialization(target,id,new Set(def?.names||[]));}
    for(const target of project.targets)for(const block of Object.values(blocksOf(target))){
        const value=cell(target,block),owner=owners.get(block),op=block.opcode;
        if(op==='text'||op==='bw_stringLiteral')add(value,'String');
        else if(op==='math_number'||op==='bw_numberLiteral')add(value,'Number');
        else if(op==='arcade_fontValue')add(value,!block.inputs?.FONT&&['font5','font8','font12'].includes(fixed(block,'FONT'))?'Font':'Opaque');
        else if(op==='arcade_createImage')rules.push({value,inputs:[input(target,block,'WIDTH'),input(target,block,'HEIGHT')],needs:['Number','Number'],type:'Image'});
        else if(op==='arcade_imageLiteral')add(value,'Image');
        else if(['operator_add','operator_subtract','operator_multiply','operator_divide','operator_mod'].includes(op))rules.push({value,inputs:[input(target,block,'NUM1'),input(target,block,'NUM2')],needs:['Number','Number'],type:'Number'});
        else if(op==='arrays_valueUnary' && ['+','-','~'].includes(literal(target,block,'OP')))rules.push({value,inputs:[input(target,block,'VALUE')],needs:['Number'],type:'Number'});
        else if(op==='arrays_valueBinary' && ['+','-','*','/','%','**','&','|','^','<<','>>','>>>'].includes(literal(target,block,'OP')))rules.push({value,inputs:[input(target,block,'LEFT'),input(target,block,'RIGHT')],needs:['Number','Number'],type:'Number'});
        else if(op==='arcade_fontForText')rules.push({value,inputs:[input(target,block,'TEXT')],needs:['String'],type:'Font'});
        else if(op==='arcade_scaleFont')rules.push({value,inputs:[input(target,block,'FONT'),input(target,block,'SIZE')],needs:['Font','Number'],type:'Font'});
        else if(op==='arcade_objectField'){
            const name=literal(target,block,'FIELD');rules.push({value,inputs:[input(target,block,'OBJECT')],needs:['Font'],type:['charWidth','charHeight'].includes(name)?'Number':name==='data'?'GlyphBuffer':'Opaque'});
        }else if(op==='arcade_cloneImage')rules.push({value,inputs:[input(target,block,'IMAGE')],needs:['Image'],type:'Image'});
        else if(op==='data_setvariableto'){const destination=variable(target,block.fields.VARIABLE?.[1]);if(owner)edge(input(target,block,'VALUE'),destination);else add(destination,'Opaque');}
        else if(op==='data_changevariableby')add(variable(target,block.fields.VARIABLE?.[1]),'Opaque');
        else if(op==='arcade_setLocal'){if(!owner){add(value,'Opaque');continue;}const name=literal(target,block,'NAME');if(typeof name!=='string'||!name){unknownLocalWriters.add(owner);add(value,'Opaque');continue;}edge(input(target,block,'VALUE'),`${owner}:local:${name}`);if(definitions.get(owner)?.names.includes(name))edge(input(target,block,'VALUE'),`${owner}:param:${name}`);}
        else if(op==='arcade_callFunction'){
            const code=literal(target,block,'NAME');let current=child(target,block,'ARGS'),args=[],seen=new Set(),valid=typeof code==='string',ended=false;
            while(current?.opcode==='arcade_functionArgument'){if(seen.has(current)){valid=false;break;}seen.add(current);args.push(input(target,current,'VALUE'));const rest=literal(target,current,'REST');if(rest==='[]'){current=null;ended=true;break;}current=child(target,current,'REST');}
            if(seen.size&&!ended || !seen.size&&literal(target,block,'ARGS')!=='[]')valid=false;
            calls.push({value,owner,destination:code===null?null:key(target,code),args,valid});
        }else if(!['data_variable','arcade_getLocal','argument_reporter_string_number','arcade_returnValue'].includes(op))add(value,'Opaque');
    }
    // Captured writes can escape their defining invocation. Until capture
    // lineage is qualified for Font, they cannot supply a closed local proof.
    const captureWrites=[];for(const target of project.targets)for(const block of Object.values(blocksOf(target)))if(block.opcode==='arcade_setCaptured')captureWrites.push(literal(target,block,'NAME'));
    if(captureWrites.length||unknownLocalWriters.size)for(const target of project.targets)for(const block of Object.values(blocksOf(target))){const owner=owners.get(block);if(!owner)continue;const names=new Set(definitions.get(owner)?.names||[]);if(['arcade_getLocal','arcade_setLocal'].includes(block.opcode))names.add(literal(target,block,'NAME'));for(const name of names)if(unknownLocalWriters.has(owner)||captureWrites.some(write=>write===null||write===name)){add(`${owner}:local:${name}`,'Opaque');add(`${owner}:param:${name}`,'Opaque');}}
    const callEdges=new Map();for(const call of calls){if(!callEdges.has(call.owner))callEdges.set(call.owner,new Set());callEdges.get(call.owner).add(call.destination);}
    const cyclic=(owner,current=owner,seen=new Set())=>{if(seen.has(current))return false;seen.add(current);for(const next of callEdges.get(current)||[])if(next===owner||cyclic(owner,next,seen))return true;return false;};
    for(const call of calls){const def=definitions.get(call.destination);if(!call.valid||!def||cyclic(call.destination)){add(call.value,'Opaque');continue;}
        if(call.args.length>def.names.length){add(call.value,'Opaque');continue;}
        def.names.forEach((name,index)=>{if(call.args[index]){edge(call.args[index],`${call.destination}:param:${name}`);edge(call.args[index],`${call.destination}:local:${name}`);}else{add(`${call.destination}:param:${name}`,'Undefined');add(`${call.destination}:local:${name}`,'Undefined');}});edge(`${call.destination}:result`,call.value);
    }
    let changed;do{changed=false;for(const[from,to]of edges)for(const type of types.get(from)||[])changed=add(to,type)||changed;
        for(const rule of rules){if(rule.inputs.every((value,index)=>exact(value,rule.needs[index])))changed=add(rule.value,rule.type)||changed;else if(rule.inputs.some((value,index)=>types.get(value)?.size&& !exact(value,rule.needs[index])))changed=add(rule.value,'Opaque')||changed;}
    }while(changed);
    for(const rule of rules)if(!types.get(rule.value)?.size)add(rule.value,'Opaque');
    do{changed=false;for(const[from,to]of edges)for(const type of types.get(from)||[])changed=add(to,type)||changed;}while(changed);
    return {inputTypes:(target,block,name)=>new Set(types.get(input(target,block,name))||[]),accepts:(target,block,name,type)=>exact(input(target,block,name),type),glyphInput:(target,block,name)=>types.get(input(target,block,name))?.has('GlyphBuffer')===true};
}
