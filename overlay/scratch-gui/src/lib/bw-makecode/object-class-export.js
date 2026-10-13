import {ValueTypeGraph} from './value-type-graph.js';

// Recover reviewable class declarations from explicit authoring blocks, not
// from a mutable heap snapshot. Bindings and invocation cells retain types.
export function prepareObjectClassExport(emitter) {
    const definitions=new Map(),classes=new Map(),procedures=new Map(),graph=new ValueTypeGraph(),owners=new WeakMap();
    const literal=(target,block,name)=>{
        const slot=block.inputs?.[name]?.[1],child=typeof slot==='string' && target.blocks[slot];
        return Array.isArray(slot)?String(slot[1]):child?.shadow?String(Object.values(child.fields||{})[0]?.[0]):null;
    };
    const child=(target,block,name)=>typeof block.inputs?.[name]?.[1]==='string'?target.blocks[block.inputs[name][1]]:null;
    const key=(target,code)=>`${target.isStage?'':target.name}:${code}`;
    for(const target of emitter.project.targets)for(const block of Object.values(target.blocks||{})) {
        if(block.opcode==='procedures_definition') {
            const proto=child(target,block,'custom_block');if(!proto?.mutation)continue;
            const code=proto.mutation.proccode,parameters=JSON.parse(proto.mutation.argumentnames||'[]');
            definitions.set(key(target,code),{target,block,code,parameters});
        }
        if(block.opcode!=='arcade_declareClass')continue;
        try {
            const name=literal(target,block,'NAME'),fields=JSON.parse(literal(target,block,'FIELDS')),
                parameters=JSON.parse(literal(target,block,'PARAMETERS')),methods=JSON.parse(literal(target,block,'METHODS'));
            if(!/^[A-Za-z_]\w*$/.test(name||'') || classes.has(name) || !Array.isArray(fields) || !Array.isArray(parameters) || !Array.isArray(methods))throw Error('invalid declaration');
            const validType=type=>typeof type==='string' && /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*(?:\[\])*$/.test(type);
            const names=new Set();
            for(const field of fields){if(!/^[A-Za-z_]\w*$/.test(field?.name||'') || names.has(field.name) || !validType(field.type) || typeof field.readonly!=='boolean')throw Error('invalid field');names.add(field.name);}
            for(const param of parameters)if(!/^[A-Za-z_]\w*$/.test(param?.name||'') || !validType(param.type))throw Error('invalid constructor parameter');
            for(const method of methods)if(!/^[A-Za-z_]\w*$/.test(method?.name||'') || names.has(method.name) || !validType(method.returnType) || !Array.isArray(method.parameters) || method.parameters.some(param=>!validType(param.type)||!/^[A-Za-z_]\w*$/.test(param.name)))throw Error('invalid method');
            classes.set(name,{name,target,fields,parameters,methods,initializer:literal(target,block,'INITIALIZER'),constructor:literal(target,block,'CONSTRUCTOR')});
        }catch(error){emitter.note('Arcade class export requires fixed valid declaration metadata: '+error.message);}
    }
    if(!classes.size)return {classes,procedures,variableTypes:new Map(),localType:()=> 'any',render:()=>[]};
    const addType=(cell,type)=>{if(type.endsWith('[]')){graph.add(cell,'array');addType(graph.element(cell),type.slice(0,-2));}else graph.add(cell,type);};
    for(const cls of classes.values()) {
        for(const field of cls.fields)addType(`field:${cls.name}:${field.name}`,field.type);
        for(const [code,params,result]of [[cls.initializer,[],'void'],[cls.constructor,cls.parameters,'void'],...cls.methods.map(method=>[method.procedure,method.parameters,method.returnType])]) {
            const k=key(cls.target,code),definition=definitions.get(k);
            if(!definition || definition.parameters.length!==params.length+1){emitter.note(`Arcade class ${cls.name} procedure does not match its declaration`);continue;}
            procedures.set(k,{cls,definition,params,result});emitter.managedValueProcedures.add(k);
            addType(`${k}:local:${definition.parameters[0]}`,cls.name);
            params.forEach((param,index)=>addType(`${k}:local:${definition.parameters[index+1]}`,param.type));
            if(result!=='void')addType(`${k}:result`,result);
        }
    }
    for(const target of emitter.project.targets) {
        const mark=(block,owner,seen=new Set())=>{
            if(!block || seen.has(block))return;seen.add(block);owners.set(block,owner);
            for(const input of Object.values(block.inputs||{}))if(typeof input?.[1]==='string')mark(target.blocks[input[1]],owner,seen);
            mark(target.blocks[block.next],owner,seen);
        };
        for(const block of Object.values(target.blocks||{}))if(block.topLevel) {
            const proto=block.opcode==='procedures_definition' && child(target,block,'custom_block');
            mark(block,proto?key(target,proto.mutation.proccode):`${target.name}:script:${block.id}`);
        }
    }
    const variables=new Map(),cells=new WeakMap();
    const cell=(target,block)=>{
        if(!block)return 'missing-block';
        const owner=owners.get(block);
        if(block.opcode==='data_variable')return `var:${block.fields.VARIABLE[1]||block.fields.VARIABLE[0]}`;
        if(block.opcode==='arcade_getLocal')return `${owner}:local:${literal(target,block,'NAME')}`;
        if(/^argument_reporter_/.test(block.opcode))return `${owner}:local:${block.fields.VALUE[0]}`;
        if(!cells.has(block))cells.set(block,Symbol(block.opcode));return cells.get(block);
    };
    const inputCells=new WeakMap();
    const input=(target,block,name)=>{
        if(!inputCells.has(block))inputCells.set(block,new Map());
        const cache=inputCells.get(block);if(cache.has(name))return cache.get(name);
        const node=child(target,block,name);if(node && !node.shadow)return cell(target,node);
        const slot=block.inputs?.[name]?.[1];
        if(Array.isArray(slot) && [12,13].includes(slot[0]))return `var:${slot[2]||slot[1]}`;
        const value=Symbol('literal');if(Array.isArray(slot))graph.add(value,[4,5,6,7,8].includes(slot[0])?'number':'string');
        else if(node)graph.add(value,node.opcode==='math_number'?'number':'string');cache.set(name,value);return value;
    };
    const args=(target,block)=>{const out=[];let current=child(target,block,'ARGS');while(current?.opcode==='arcade_functionArgument'){out.push(input(target,current,'VALUE'));current=child(target,current,'REST');}return out;};
    const bind=(target,code,values,offset=0)=>{
        const def=definitions.get(key(target,code));if(def)values.forEach((value,index)=>{if(index+offset<def.parameters.length)graph.merge(value,`${key(target,code)}:local:${def.parameters[index+offset]}`);});
    };
    let revision;
    do {
        revision=graph.revision;
        for(const target of emitter.project.targets)for(const block of Object.values(target.blocks||{})) {
            const value=cell(target,block),owner=owners.get(block),op=block.opcode;
            if(op==='arcade_createObject'){const name=literal(target,block,'CLASS');if(classes.has(name)){addType(value,name);bind(target,classes.get(name).constructor,args(target,block),1);}}
            if(op==='arcade_callFunction'){const code=literal(target,block,'NAME');graph.merge(value,`${key(target,code)}:result`);bind(target,code,args(target,block));}
            if(op==='arcade_returnValue')graph.merge(`${owner}:result`,input(target,block,'VALUE'));
            if(op==='data_setvariableto'){const id=block.fields.VARIABLE[1]||block.fields.VARIABLE[0];variables.set(id,{target,name:block.fields.VARIABLE[0]});graph.merge(`var:${id}`,input(target,block,'VALUE'));}
            if(op==='arcade_setLocal')graph.merge(`${owner}:local:${literal(target,block,'NAME')}`,input(target,block,'VALUE'));
            if(['arcade_objectField','arcade_setObjectField','arcade_callObjectMethod'].includes(op))for(const name of graph.node(input(target,block,'OBJECT')).types) {
                const cls=classes.get(name);if(!cls)continue;
                const field=literal(target,block,'FIELD');
                if(op==='arcade_objectField')graph.merge(value,`field:${name}:${field}`);
                if(op==='arcade_setObjectField')graph.merge(`field:${name}:${field}`,input(target,block,'VALUE'));
                if(op==='arcade_callObjectMethod'){const method=cls.methods.find(method=>method.name===literal(target,block,'METHOD'));if(method){graph.merge(value,`${key(target,method.procedure)}:result`);bind(target,method.procedure,args(target,block),1);}}
            }
            if(op==='arrays_createReference'){graph.add(value,'array');let item=child(target,block,'VALUES');while(item?.opcode==='arrays_referenceValues'){graph.merge(graph.element(value),input(target,item,'VALUE'));item=child(target,item,'REST');}}
            if(['arrays_referenceItem','arrays_referenceTake','arrays_referenceRandom'].includes(op))graph.merge(value,graph.element(input(target,block,'ARRAY')));
            if(op==='arrays_mutateReference' && ['push','unshift','insertAt','set'].includes(literal(target,block,'OP')))graph.merge(graph.element(input(target,block,'ARRAY')),input(target,block,'VALUE'));
        }
    }while(revision!==graph.revision);
    function typeOf(cell,seen=new Set()) {
        const node=graph.node(cell);if(seen.has(node))return 'any';seen.add(node);
        if(node.types.has('array'))return `${node.element?typeOf(node.element,seen):'any'}[]`;
        const types=[...node.types].filter(type=>type!=='any' && type!=='void');return types.length===1?types[0]:'any';
    }
    const variableTypes=new Map([...variables].map(([id,{target,name}])=>[emitter.varName(target,name),typeOf(`var:${id}`)]));
    const localType=(key,name)=>typeOf(`${key}:local:${name}`);
    function render() {
        const saved={target:emitter.target,blocks:emitter.blocks,currentLocalNames:emitter.currentLocalNames};
        const out=[];
        function body(code,cls,parameters,constructor=false) {
            const k=key(cls.target,code),def=definitions.get(k);if(!def)return [];
            emitter.target=cls.target;emitter.blocks=cls.target.blocks;emitter.currentLocalNames=new Set();
            let lines=emitter.body(def.block.next,[],[],false);
            const locals=[...emitter.currentLocalNames].filter(name=>!def.parameters.includes(name));
            lines=[...locals.map(name=>`    let ${name}: ${localType(k,name)} = undefined`),...lines];
            const receiver=def.parameters[0].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
            lines=lines.map(line=>line.replace(new RegExp(`\\b${receiver}\\b`,'g'),'this'));
            // Field initialization/constructors cannot return a new instance.
            if(constructor && lines.some(line=>/^\s*return\s+\S/.test(line)))emitter.note('Class constructor procedure cannot return a value');
            return lines;
        }
        for(const cls of classes.values()) {
            const ctor=definitions.get(key(cls.target,cls.constructor));
            const params=cls.parameters.map((param,index)=>`${ctor?.parameters[index+1] || param.name}${param.optional?'?':''}: ${param.type}`).join(', ');
            const lines=[`class ${cls.name} {`,...cls.fields.map(field=>`    ${field.readonly?'readonly ':''}${field.name}: ${field.type}`),
                `    constructor(${params}) {`,...body(cls.initializer,cls,[],true),...body(cls.constructor,cls,cls.parameters,true),'    }'];
            for(const method of cls.methods) {
                const def=definitions.get(key(cls.target,method.procedure));
                const params=method.parameters.map((param,index)=>`${def?.parameters[index+1] || param.name}${param.optional?'?':''}: ${param.type}`).join(', ');
                const script=body(method.procedure,cls,method.parameters),returns=script.some(line=>/^\s*return\s+\S/.test(line));
                const result=method.returnType==='any'?typeOf(`${key(cls.target,method.procedure)}:result`):method.returnType;
                lines.push(`    ${method.name}(${params})${returns?': '+result:''} {`,...script,'    }');
            }
            lines.push('}');out.push(lines.join('\n'));
        }
        Object.assign(emitter,saved);return out;
    }
    return {classes,procedures,variableTypes,localType,render};
}
