/** Scalar/JSON item export must not serialize an actual native reference.
 * Follow historical variable writers across actual project owners. */
export function namedArrayItemExportAuthority(project,name,isBoolean,sourceReferences=new Map()) {
    if(name==='__proto__' || Object.hasOwn(Object.prototype,name))return {ok:false,reason:'Named Array item export requires separate qualification for prototype-sensitive registry names'};
    const targets=project.targets || [],stage=targets.find(target=>target.isStage),writers=new Map();
    const child=(target,block,input)=>typeof block?.inputs?.[input]?.[1]==='string'?target.blocks?.[block.inputs[input][1]]:null;
    const variable=(target,id)=>{
        const owner=Object.hasOwn(target.variables || {},id)?target:Object.hasOwn(stage?.variables || {},id)?stage:null;
        return owner?{key:`${targets.indexOf(owner)}:${id}`,value:owner.variables[id][1]}:null;
    };
    const literal=(target,block,input)=>{
        const slot=block?.inputs?.[input]?.[1],node=child(target,block,input);
        if(Array.isArray(slot) && [4,5,6,7,8,10].includes(slot[0]))return {known:true,value:slot[0]===10?String(slot[1]):Number(slot[1])};
        if(node?.shadow && ['text','math_number'].includes(node.opcode))return {known:true,value:Object.values(node.fields || {})[0]?.[0]};
        return {known:false};
    };
    const input=(target,block,key)=>{
        const node=child(target,block,key),slot=block?.inputs?.[key]?.[1];
        if(node && !node.shadow)return {target,node};
        if(Array.isArray(slot) && slot[0]===12)return {target,node:{opcode:'data_variable',fields:{VARIABLE:[slot[1],slot[2]]}}};
        const value=literal(target,block,key);return value.known?{value:value.value}:{};
    };
    for(const target of targets)for(const block of Object.values(target.blocks || {}))if(block.opcode==='data_setvariableto'){
        const id=block.fields?.VARIABLE?.[1],binding=variable(target,id);if(!binding)continue;
        const list=writers.get(binding.key) || [];list.push(input(target,block,'VALUE'));writers.set(binding.key,list);
    }
    const scalar=value=>value===null || value===undefined || ['number','boolean','string'].includes(typeof value);
    // A named call belongs to this target's actual procedure binding. Inspect
    // every connected return; a label or declared result type is not evidence.
    const procedureReturns=(target,node)=>{
        const called=literal(target,node,'NAME');if(!called.known)return null;
        const definitions=Object.values(target.blocks || {}).filter(block=>{
            if(block.opcode!=='procedures_definition')return false;
            return child(target,block,'custom_block')?.mutation?.proccode===String(called.value);
        });
        if(definitions.length!==1)return null;
        const definition=definitions[0],returns=[],visited=new Set(),active=new Set();let invalid=false;
        const visit=id=>{
            if(id===undefined || id===null)return;
            if(typeof id!=='string')return;
            if(active.has(id)){invalid=true;return;}
            if(visited.has(id))return;
            const block=target.blocks?.[id];if(!block){invalid=true;return;}
            visited.add(id);active.add(id);
            if(block.opcode==='procedures_definition' || block.topLevel){invalid=true;return;}
            if(block.opcode==='arcade_returnValue')returns.push(input(target,block,'VALUE'));
            for(const slot of Object.values(block.inputs || {}))visit(slot?.[1]);
            visit(block.next);
            active.delete(id);
        };
        visit(definition.next);
        // No return graph cannot certify a result. Fallthrough in a graph with
        // scalar returns produces undefined, which the item codec preserves.
        return invalid || !returns.length?null:{definition,returns};
    };
    const primitive=(entry,seen=new Set())=>{
        if(Object.hasOwn(entry,'value'))return scalar(entry.value);
        const {target,node}=entry;if(!node)return false;
        if(seen.has(node))return true;seen=new Set([...seen,node]);
        if(['text','bw_stringLiteral','math_number','bw_numberLiteral'].includes(node.opcode))return true;
        if(isBoolean(node))return true;
        if(node.opcode==='arrays_specialValue')return true;
        if(node.opcode==='data_variable'){
            const binding=variable(target,node.fields?.VARIABLE?.[1]);
            if(!binding || sourceReferences.has(node.fields?.VARIABLE?.[1]) || !scalar(binding.value))return false;
            if(seen.has(binding.key))return true;seen.add(binding.key);
            return (writers.get(binding.key)||[]).every(writer=>primitive(writer,seen));
        }
        if(node.opcode==='arcade_callFunction'){
            const procedure=procedureReturns(target,node);
            if(!procedure || seen.has(procedure.definition))return false;
            const nested=new Set([...seen,procedure.definition]);
            return procedure.returns.every(value=>primitive(value,nested));
        }
        if(node.opcode==='arrays_valueUnary')return primitive(input(target,node,'VALUE'),seen);
        if(node.opcode==='arrays_valueBinary')return primitive(input(target,node,'LEFT'),seen)&&primitive(input(target,node,'RIGHT'),seen);
        if(node.opcode==='operator_add')return primitive(input(target,node,'NUM1'),seen)&&primitive(input(target,node,'NUM2'),seen);
        return false;
    };
    const origins=(entry,seen=new Set())=>{
        if(Object.hasOwn(entry,'value'))return {names:new Set(),unknown:!scalar(entry.value)};
        const {target,node}=entry;if(!node)return {names:new Set(),unknown:true};
        if(seen.has(node))return {names:new Set(),unknown:true};seen=new Set([...seen,node]);
        if(node.opcode==='arrays_namedReference'){
            const value=literal(target,node,'NAME');return value.known?{names:new Set([String(value.value)]),unknown:false}:{names:new Set(),unknown:true};
        }
        if(node.opcode==='data_variable'){
            const binding=variable(target,node.fields?.VARIABLE?.[1]);if(!binding)return {names:new Set(),unknown:true};
            if(seen.has(binding.key))return {names:new Set(),unknown:true};seen.add(binding.key);
            const values=[{value:binding.value},...(writers.get(binding.key)||[])].map(writer=>origins(writer,seen));
            return {names:new Set(values.flatMap(value=>[...value.names])),unknown:values.some(value=>value.unknown)};
        }
        if(['arrays_referenceItem','arrays_referenceTake','arrays_referenceRandom','arrays_referenceSlice','arrays_referenceConcat'].includes(node.opcode))return origins(input(target,node,'ARRAY'),seen);
        if(primitive(entry))return {names:new Set(),unknown:false};
        return {names:new Set(),unknown:true};
    };
    const legacyLiteral=value=>{
        if(typeof value!=='string')return scalar(value);
        try{
            const parsed=JSON.parse(value);
            return !(parsed && typeof parsed==='object' && Object.hasOwn(parsed,'bwReference'));
        }catch(_){return true;}
    };
    const mayText=(entry,seen=new Set())=>{
        if(Object.hasOwn(entry,'value'))return typeof entry.value==='string';
        const {target,node}=entry;if(!node)return true;
        if(['text','bw_stringLiteral','operator_join','arrays_stringConcat'].includes(node.opcode))return true;
        if(node.opcode==='arcade_callFunction'){
            const procedure=procedureReturns(target,node);
            if(!procedure || seen.has(procedure.definition))return true;
            const nested=new Set([...seen,procedure.definition]);
            return procedure.returns.some(value=>mayText(value,nested));
        }
        if(node.opcode==='data_variable'){
            const binding=variable(target,node.fields?.VARIABLE?.[1]);if(!binding)return true;
            if(seen.has(binding.key))return false;seen=new Set([...seen,binding.key]);
            return [{value:binding.value},...(writers.get(binding.key)||[])].some(value=>mayText(value,seen));
        }
        if(node.opcode==='arrays_valueBinary' && String(literal(target,node,'OP').value)==='+')
            return mayText(input(target,node,'LEFT'),seen)||mayText(input(target,node,'RIGHT'),seen);
        return !primitive(entry);
    };
    const legacyInput=(entry,seen=new Set())=>{
        if(Object.hasOwn(entry,'value'))return legacyLiteral(entry.value);
        const {target,node}=entry;if(!node)return false;
        if(node.opcode==='text' || node.opcode==='bw_stringLiteral')return legacyLiteral(Object.values(node.fields || {})[0]?.[0]);
        if(node.opcode==='arcade_callFunction'){
            const procedure=procedureReturns(target,node);
            if(!procedure || seen.has(procedure.definition))return false;
            const nested=new Set([...seen,procedure.definition]);
            return procedure.returns.every(value=>legacyInput(value,nested));
        }
        if(node.opcode==='data_variable'){
            const binding=variable(target,node.fields?.VARIABLE?.[1]);if(!binding || sourceReferences.has(node.fields?.VARIABLE?.[1]) || !legacyLiteral(binding.value))return false;
            if(seen.has(binding.key))return true;seen=new Set([...seen,binding.key]);
            return (writers.get(binding.key)||[]).every(writer=>legacyInput(writer,seen));
        }
        // Unresolved text generation could reconstruct a reference carrier.
        if(['operator_join','arrays_stringConcat'].includes(node.opcode))return false;
        if(node.opcode==='arrays_valueBinary' && String(literal(target,node,'OP').value)==='+' && mayText(entry))return false;
        return primitive(entry);
    };
    for(const target of targets)for(const block of Object.values(target.blocks || {})){
        if(['arrays_push','arrays_set','arrays_insert','arrays_set2D','arrays_setMulti'].includes(block.opcode)){
            const receiver=literal(target,block,'NAME');
            if((!receiver.known || String(receiver.value)===name) && !legacyInput(input(target,block,'VALUE')))
                return {ok:false,reason:'Named Array item export requires proven scalar inputs; opaque or native reference writers are not admitted'};
        }
        if(block.opcode==='arrays_mutateReference'){
            const op=literal(target,block,'OP');if(!['set','push','unshift','insert'].includes(String(op.value)))continue;
            const receiver=origins(input(target,block,'ARRAY'));
            if((receiver.names.has(name) || receiver.unknown) && !primitive(input(target,block,'VALUE')))
                return {ok:false,reason:'Named Array item export cannot exclude an opaque or native reference write through a historical alias'};
        }
    }
    return {ok:true};
}
