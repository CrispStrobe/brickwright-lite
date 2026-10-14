import {hasSdkFontValues,seedSdkFontValueType,sdkFontGraphType} from './sdk-font-export-types.js';
import {sdkExportClasses,sdkClassPublicName,sdkClassName} from './sdk-class-descriptors.js';
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
        if(!['arcade_declareClass','arcade_declareSubclass'].includes(block.opcode))continue;
        try {
            const name=literal(target,block,'NAME'),fields=JSON.parse(literal(target,block,'FIELDS')),
                parameters=JSON.parse(literal(target,block,'PARAMETERS')),methods=JSON.parse(literal(target,block,'METHODS'));
            if(!/^[A-Za-z_]\w*$/.test(name||'') || classes.has(name) || !Array.isArray(fields) || !Array.isArray(parameters) || !Array.isArray(methods))throw Error('invalid declaration');
            const validType=type=>typeof type==='string' && /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*(?:\[\])*$/.test(type);
            const names=new Set();
            for(const field of fields){if(!/^[A-Za-z_]\w*$/.test(field?.name||'') || names.has(field.name) || !validType(field.type) || Object.keys(field).some(key=>!['name','type','readonly','visibility','initializer','parameterProperty','getter','setter'].includes(key)) || typeof field.readonly!=='boolean' || field.visibility!==undefined&&!['public','private','protected'].includes(field.visibility))throw Error('invalid field');if(field.getter!==undefined && (typeof field.getter!=='string'||!field.getter) || field.setter!==undefined && (!field.setter || typeof field.setter.procedure!=='string'||!field.setter.procedure||Object.keys(field.setter).some(key=>!['procedure','parameters'].includes(key))||!Array.isArray(field.setter.parameters)||field.setter.parameters.length!==1||field.setter.parameters.some(param=>!validType(param.type)||!/^[A-Za-z_]\w*$/.test(param.name)||param.optional!==false||Object.hasOwn(param,'default')||Object.keys(param).some(key=>!['name','type','optional'].includes(key)))))throw Error('invalid accessor');if((field.getter||field.setter)&&(field.initializer!==undefined||field.parameterProperty||field.readonly!==!!(field.getter&&!field.setter)))throw Error('invalid accessor storage metadata');names.add(field.name);}
            for(const param of parameters)if(!/^[A-Za-z_]\w*$/.test(param?.name||'') || !validType(param.type))throw Error('invalid constructor parameter');
            for(const method of methods)if(!/^[A-Za-z_]\w*$/.test(method?.name||'') || names.has(method.name) || !validType(method.returnType) || method.visibility!==undefined&&!['public','private','protected'].includes(method.visibility) || !Array.isArray(method.parameters) || method.parameters.some(param=>!validType(param.type)||!/^[A-Za-z_]\w*$/.test(param.name)))throw Error('invalid method');
            classes.set(name,{name,parent:block.opcode==='arcade_declareSubclass'?literal(target,block,'BASE'):null,target,fields,parameters,methods,initializer:literal(target,block,'INITIALIZER'),constructor:literal(target,block,'CONSTRUCTOR')});
        }catch(error){emitter.note('Arcade class export requires fixed valid declaration metadata: '+error.message);}
    }
    const builtinNames=new Set(sdkExportClasses().map(cls=>cls.name));
    const builtinObject=emitter.project.targets.some(target=>Object.values(target.blocks).some(block=>block.opcode==='arcade_createObject' && builtinNames.has(literal(target,block,'CLASS'))));
    if(!classes.size && !builtinObject && !hasSdkFontValues(emitter.project))return {classes,procedures,variableTypes:new Map(),valueTypes:()=>new Set(),inputTypes:()=>new Set(),fontGlyphInput:()=>false,localType:()=> 'any',render:()=>[],receiver:block=>{emitter.note('Arcade object member export requires a valid class declaration');return emitter.arrayValue(block,'OBJECT');}};
    for(const cls of sdkExportClasses())if(!classes.has(cls.name))classes.set(cls.name,cls);
    const ancestors=name=>{const result=[],seen=new Set();while(name){if(seen.has(name)||!classes.has(name)){emitter.note('Class inheritance export requires declared acyclic parents');return [];}seen.add(name);result.push(classes.get(name));name=classes.get(name).parent;}return result;};
    const resolveMember=(cls,name,method=false)=>ancestors(cls.name).flatMap(base=>method?base.methods:base.fields).find(value=>value.name===name);
    const accessorOwners=new Map();
    for(const cls of classes.values())for(const field of cls.fields)for(const code of [field.getter,field.setter?.procedure].filter(Boolean)){
        const k=key(cls.target,code);
        if(accessorOwners.has(k) || [...classes.values()].some(other=>other.target===cls.target && [other.initializer,other.constructor,...other.methods.map(method=>method.procedure)].includes(code)))emitter.note('Arcade accessor procedure must belong to exactly one declared accessor half');
        accessorOwners.set(k,{cls,field});
    }
    for(const cls of classes.values()){const chain=ancestors(cls.name),fields=new Set(chain.flatMap(base=>base.fields.map(field=>field.name)));if(chain.some(base=>base.methods.some(method=>fields.has(method.name))))emitter.note('Inherited class field/accessor conflicts with a method');}
    const accessorHalf=(cls,name,kind)=>ancestors(cls.name).map(base=>base.fields.find(field=>field.name===name)?.[kind]).find(Boolean);
    const superHelpers=new Map(),parameterPropertyBlocks=new Set();
    const localName=(target,block)=>block?.opcode==='arcade_getLocal'?literal(target,block,'NAME'):/^argument_reporter_/.test(block?.opcode||'')?block.fields.VALUE?.[0]:null;

    const callParameters=(target,value)=>{const names=[];let tail=value.inputs?.ARGS,current=child(target,value,'ARGS');const seen=new Set();while(current?.opcode==='arcade_functionArgument'){if(seen.has(current))return null;seen.add(current);const name=localName(target,child(target,current,'VALUE'));if(!name)return null;names.push(name);tail=current.inputs?.REST;current=child(target,current,'REST');}const slot=tail?.[1];return (Array.isArray(slot)?String(slot[1])==='[]':current?.shadow&&current.fields?.TEXT?.[0]==='[]')?names:null;};
    const addType=(cell,type)=>{type=sdkFontGraphType(type);if(type.endsWith('[]')){graph.add(cell,'array');addType(graph.element(cell),type.slice(0,-2));}else graph.add(cell,type);};
    for(const cell of emitter.sourceReferenceCells?.values() || [])addType('var:'+cell.id,cell.type);
    for(const cls of classes.values()) {
        if(cls.intrinsic)continue;
        for(const base of ancestors(cls.name))for(const field of base.fields){addType(`field:${base.name}:${field.name}`,field.type);graph.merge(`field:${cls.name}:${field.name}`,`field:${base.name}:${field.name}`);}
        for(const base of ancestors(cls.name).filter(base=>base.intrinsic)){
            const code=[`__bwClass_${base.name}_superConstructor`,...['self',...base.parameters].map(()=>'%s')].join(' ');superHelpers.set(key(cls.target,code),base);
            for(const method of base.methods)procedures.set(key(cls.target,method.procedure),{cls:base,params:method.parameters,result:method.returnType,native:true});
        }
        const superCode=[`__bwClass_${cls.name}_superConstructor`,...['self',...cls.parameters].map(()=>'%s')].join(' '),superDef=definitions.get(key(cls.target,superCode));
        if(superDef){
            const calls=[];let b=cls.target.blocks[superDef.block.next];

            while(b){if(b.opcode!=='arcade_setLocal'||literal(cls.target,b,'NAME')!=='__bwDiscardObjectResult')break;const value=child(cls.target,b,'VALUE');if(value?.opcode!=='arcade_callFunction')break;calls.push({name:literal(cls.target,value,'NAME'),parameters:callParameters(cls.target,value)});b=cls.target.blocks[b.next];}
            if(!b && calls.length===2 && calls[0].name===cls.initializer && calls[1].name===cls.constructor && JSON.stringify(calls[0].parameters)===JSON.stringify(superDef.parameters.slice(0,1)) && JSON.stringify(calls[1].parameters)===JSON.stringify(superDef.parameters)){superHelpers.set(key(cls.target,superCode),cls);procedures.set(key(cls.target,superCode),{cls,definition:superDef,params:cls.parameters,result:'void',superHelper:true});}
            else emitter.note('Class super constructor helper must retain only its declared initializer and constructor calls');
        }
        const ctorDef=definitions.get(key(cls.target,cls.constructor));let prefix=ctorDef&&cls.target.blocks[ctorDef.block.next];
        for(const field of cls.fields.filter(field=>field.parameterProperty)){
            if(prefix?.opcode==='arcade_setObjectField' && literal(cls.target,prefix,'FIELD')===field.name && localName(cls.target,child(cls.target,prefix,'OBJECT'))===ctorDef.parameters[0] && localName(cls.target,child(cls.target,prefix,'VALUE'))===field.name){parameterPropertyBlocks.add(prefix);prefix=cls.target.blocks[prefix.next];}
            else emitter.note('Class parameter property export requires its declared initial argument binding');
        }
        if(cls.parent || cls.fields.some(field=>field.initializer)){
            const init=definitions.get(key(cls.target,cls.initializer)),self=init?.parameters[0];let current=init&&cls.target.blocks[init.block.next],valid=!!init;
            if(cls.parent){const value=current&&child(cls.target,current,'VALUE');valid=valid && current?.opcode==='arcade_setLocal' && literal(cls.target,current,'NAME')==='__bwDiscardObjectResult' && value?.opcode==='arcade_callFunction' && literal(cls.target,value,'NAME')===classes.get(cls.parent)?.initializer && JSON.stringify(callParameters(cls.target,value))===JSON.stringify([self]);current=current&&cls.target.blocks[current.next];}
            for(const field of cls.fields.filter(field=>field.initializer)){const value=current&&child(cls.target,current,'VALUE');valid=valid && current?.opcode==='arcade_setObjectField' && literal(cls.target,current,'FIELD')===field.name && localName(cls.target,child(cls.target,current,'OBJECT'))===self && value?.opcode==='arcade_callFunction' && literal(cls.target,value,'NAME')===field.initializer && JSON.stringify(callParameters(cls.target,value))==='[]';current=current&&cls.target.blocks[current.next];}
            if(!valid || current)emitter.note('Class field initializer export requires exactly its declared parent and field calls');
        }
        for(const [code,params,result]of [[cls.initializer,[],'void'],[cls.constructor,cls.parameters,'void'],...cls.methods.map(method=>[method.procedure,method.parameters,method.returnType]),...cls.fields.flatMap(field=>[...(field.getter?[[field.getter,[],field.type]]:[]),...(field.setter?[[field.setter.procedure,field.setter.parameters,'void']]:[])])]) {
            const k=key(cls.target,code),definition=definitions.get(k);
            if(code===cls.constructor && ancestors(cls.name).some(base=>base.intrinsic && base.constructor===code))continue;
            if(!definition || !Array.isArray(definition.parameters) || definition.parameters.length!==params.length+1 || definition.parameters.some(name=>typeof name!=='string'||!/^[A-Za-z_]\w*$/.test(name)) || new Set(definition.parameters).size!==definition.parameters.length){emitter.note(`Arcade class ${cls.name} procedure does not match its declaration`);continue;}
            if(emitter.project.targets.some(target=>Object.values(target.variables||{}).some(value=>emitter.varName(target,value[0])===definition.parameters[0])))emitter.note('Class receiver parameter must retain distinct ownership from exported global bindings');
            if(!procedures.has(k))procedures.set(k,{cls,definition,params,result});emitter.managedValueProcedures.add(k);
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
            if(op==='arcade_sourceTypeOf')graph.add(value,'string');
            seedSdkFontValueType(block,value,addType);
            if(op==='arcade_createObject'){const name=literal(target,block,'CLASS');if(classes.has(name)){addType(value,name);bind(target,classes.get(name).constructor,args(target,block),1);}}
            if(op==='arcade_callFunction'){const code=literal(target,block,'NAME');graph.merge(value,`${key(target,code)}:result`);bind(target,code,args(target,block));}
            if(op==='arcade_returnValue')graph.merge(`${owner}:result`,input(target,block,'VALUE'));
            if(op==='data_setvariableto'){const id=block.fields.VARIABLE[1]||block.fields.VARIABLE[0];variables.set(id,{target,name:block.fields.VARIABLE[0]});graph.merge(`var:${id}`,input(target,block,'VALUE'));}
            if(op==='arcade_setLocal')graph.merge(`${owner}:local:${literal(target,block,'NAME')}`,input(target,block,'VALUE'));
            if(['arcade_objectField','arcade_setObjectField','arcade_callObjectMethod'].includes(op))for(const name of graph.node(input(target,block,'OBJECT')).types) {
                const cls=classes.get(name);if(!cls)continue;
                const field=literal(target,block,'FIELD');
                if(op==='arcade_objectField'){const getter=accessorHalf(cls,field,'getter');if(getter){graph.merge(value,`${key(target,getter)}:result`);}else graph.merge(value,`field:${name}:${field}`);}
                if(op==='arcade_setObjectField'){const setter=accessorHalf(cls,field,'setter');if(setter)bind(target,setter.procedure,[input(target,block,'VALUE')],1);else graph.merge(`field:${name}:${field}`,input(target,block,'VALUE'));}
                if(op==='arcade_callObjectMethod'){const method=resolveMember(cls,literal(target,block,'METHOD'),true);if(method){graph.merge(value,`${key(target,method.procedure)}:result`);bind(target,method.procedure,args(target,block),1);}}
            }
            if(op==='arrays_createReference'){graph.add(value,'array');let item=child(target,block,'VALUES');while(item?.opcode==='arrays_referenceValues'){graph.merge(graph.element(value),input(target,item,'VALUE'));item=child(target,item,'REST');}}
            if(['arrays_referenceItem','arrays_referenceTake','arrays_referenceRandom'].includes(op))graph.merge(value,graph.element(input(target,block,'ARRAY')));
            if(op==='arrays_mutateReference' && ['push','unshift','insertAt','set'].includes(literal(target,block,'OP')))graph.merge(graph.element(input(target,block,'ARRAY')),input(target,block,'VALUE'));
        }
    }while(revision!==graph.revision);
    function typeOf(cell,seen=new Set()) {
        const node=graph.node(cell);if(seen.has(node))return 'any';seen.add(node);
        if(node.types.has('array'))return `${node.element?typeOf(node.element,seen):'any'}[]`;
        const types=[...node.types].filter(type=>type!=='any' && type!=='void');return types.length===1?sdkClassPublicName(types[0]):'any';
    }
    const variableTypes=new Map([...variables].map(([id,{target,name}])=>[emitter.varName(target,name),typeOf(`var:${id}`)]));
    const localType=(key,name)=>typeOf(`${key}:local:${name}`);
    function receiver(block,write=false,method=false) {
        const target=emitter.target,text=emitter.arrayValue(block,'OBJECT'),name=literal(target,block,method?'METHOD':'FIELD');
        const restricted=[...graph.node(input(target,block,'OBJECT')).types].some(type=>{const cls=classes.get(type),member=cls&&resolveMember(cls,name,method);return member && ((member.visibility && member.visibility!=='public' && emitter.currentClassName!==type) || write&&member.readonly);});
        if(restricted)return `(${text} as any)`;
        if(write && [...graph.node(input(target,block,'OBJECT')).types].some(type=>{const cls=classes.get(type),field=cls&&resolveMember(cls,name);return field&&(field.getter||field.setter)&&['number','boolean','string'].includes(field.type)&&(field.type!=='boolean' && emitter.isBoolean(child(target,block,'VALUE')) || [...graph.node(input(target,block,'VALUE')).types].some(value=>['number','boolean','string'].includes(value)&&value!==field.type));}))return `(${text} as any)`;
        for(const type of graph.node(input(target,block,'OBJECT')).types){const cls=classes.get(type),field=cls&&resolveMember(cls,name);if(field && (field.getter||field.setter) && (!field.getter || write&&!field.setter)){const base=ancestors(cls.parent).find(base=>{const property=base.fields.find(field=>field.name===name);return property?.getter && (!write||property.setter);});if(base)return `(${text} as ${sdkClassPublicName(base.name)})`;}}
        const known=[...graph.node(input(target,block,'OBJECT')).types].map(type=>classes.get(type)).filter(Boolean);
        if(!known.length || known.some(cls=>!resolveMember(cls,name,method))){
            const candidates=[...classes.values()].filter(cls=>!cls.intrinsic && resolveMember(cls,name,method));
            if(candidates.length===1){const member=resolveMember(candidates[0],name,method);return member.visibility!=='public' || write&&member.readonly?`(${text} as any)`:`(${text} as ${candidates[0].name})`;}
        }
        return text;
    }
    function superCall(code,args) {
        const cls=classes.get(emitter.currentClassName);if(!cls?.parent)return null;
        const parentChain=ancestors(cls.parent),k=key(emitter.target,code),helper=superHelpers.get(k),procedure=procedures.get(k);
        if(helper && parentChain.some(parent=>parent.name===helper.name)){
            if(args[0]!==emitter.currentClassReceiver || !emitter.currentClassConstructor){emitter.note('Super constructor export requires the active constructor receiver');return 'undefined';}
            return `super(${args.slice(1).join(', ')})`;
        }
        if(procedure && parentChain.some(parent=>parent.name===procedure.cls.name)){const method=procedure.cls.methods.find(method=>method.procedure===code);
            if(method && args[0]===emitter.currentClassReceiver)return `super.${method.name}(${args.slice(1).join(', ')})`;
        }
        return null;
    }
    function render() {
        const saved={target:emitter.target,blocks:emitter.blocks,currentLocalNames:emitter.currentLocalNames,currentClassName:emitter.currentClassName,currentClassReceiver:emitter.currentClassReceiver,currentClassConstructor:emitter.currentClassConstructor};
        const out=[];
        function body(code,cls,parameters,constructor=false) {
            const k=key(cls.target,code),def=definitions.get(k);if(!def)return [];
            emitter.target=cls.target;emitter.blocks=cls.target.blocks;emitter.currentLocalNames=new Set();emitter.currentClassName=cls.name;emitter.currentClassReceiver=def.parameters[0];emitter.currentClassConstructor=constructor;
            let lines=emitter.body(def.block.next,[],[],false);
            const locals=[...emitter.currentLocalNames].filter(name=>!def.parameters.includes(name));
            lines=[...locals.map(name=>`    let ${name}: ${localType(k,name)} = undefined`),...lines];
            const receiver=def.parameters[0].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
            const receiverToken=new RegExp(`"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|(?<![\\w$.])\\b${receiver}\\b`,'g');
            lines=lines.map(line=>line.replace(receiverToken,token=>token[0]==='"'||token[0]==="'"?token:'this'));
            // Field initialization/constructors cannot return a new instance.
            if(constructor && lines.some(line=>/^\s*return\s+\S/.test(line)))emitter.note('Class constructor procedure cannot return a value');
            return lines;
        }
        for(const cls of classes.values()) {
            if(cls.intrinsic)continue;
            const ctor=definitions.get(key(cls.target,cls.constructor));
            const params=cls.parameters.map((param,index)=>{const field=cls.fields.find(field=>field.parameterProperty&&field.name===param.name);return `${field?(field.visibility||'public')+' '+(field.readonly?'readonly ':''):''}${ctor?.parameters[index+1] || param.name}${param.optional&&!Object.prototype.hasOwnProperty.call(param,'default')?'?':''}: ${param.type}${Object.prototype.hasOwnProperty.call(param,'default')?' = '+JSON.stringify(param.default):''}`;}).join(', ');
            const lines=[`class ${cls.name}${cls.parent?' extends '+sdkClassPublicName(cls.parent):''} {`];
            for(const field of cls.fields){
                if(field.parameterProperty)continue;
                if(field.getter||field.setter){
                    const prefix=field.visibility && field.visibility!=='public'?field.visibility+' ':'';
                    if(field.getter){const script=body(field.getter,cls,[]);if(!script.some(line=>/^\s*return\s+\S/.test(line)))emitter.note('Class getter must return a value');lines.push(`    ${prefix}get ${field.name}(): ${field.type} {`,...script,'    }');}
                    if(field.setter){const def=definitions.get(key(cls.target,field.setter.procedure)),param=field.setter.parameters[0];const script=body(field.setter.procedure,cls,field.setter.parameters);if(script.some(line=>/^\s*return\s+\S/.test(line)))emitter.note('Class setter cannot return a value');lines.push(`    ${prefix}set ${field.name}(${def?.parameters[1]||param.name}: ${param.type}) {`,...script,'    }');}
                    continue;
                }
                let initializer='';
                if(field.initializer){const code=field.initializer,k=key(cls.target,code),def=definitions.get(k),fn=emitter.fnNames.get(k);
                    if(!def||def.parameters.length||!fn)emitter.note('Class field initializer export requires its fixed zero-argument procedure');
                    else initializer=` = ${fn}()`;
                }
                lines.push(`    ${field.visibility && field.visibility!=='public'?field.visibility+' ':''}${field.readonly?'readonly ':''}${field.name}: ${field.type}${initializer}`);
            }
            const implicit=cls.parent && cls.constructor===classes.get(cls.parent)?.constructor;
            if(!implicit){
                const legacy=cls.parent || cls.fields.some(field=>field.initializer)?[]:body(cls.initializer,cls,[],true);
                lines.push(`    constructor(${params}) {`,...legacy,...body(cls.constructor,cls,cls.parameters,true),'    }');
            }
            for(const method of cls.methods) {
                const def=definitions.get(key(cls.target,method.procedure));
                const params=method.parameters.map((param,index)=>`${def?.parameters[index+1] || param.name}${param.optional&&!Object.prototype.hasOwnProperty.call(param,'default')?'?':''}: ${param.type}${Object.prototype.hasOwnProperty.call(param,'default')?' = '+JSON.stringify(param.default):''}`).join(', ');
                const script=body(method.procedure,cls,method.parameters),returns=script.some(line=>/^\s*return\s+\S/.test(line));
                const result=method.returnType==='any'?typeOf(`${key(cls.target,method.procedure)}:result`):method.returnType;
                lines.push(`    ${method.visibility && method.visibility!=='public'?method.visibility+' ':''}${method.name}(${params})${returns?': '+result:''} {`,...script,'    }');
            }
            lines.push('}');out.push(lines.join('\n'));
        }
        Object.assign(emitter,saved);return out;
    }
    const valueTypes=(target,block)=>new Set(graph.node(cell(target,block)).types);
    return {classes,procedures,variableTypes,valueTypes,inputTypes:(target,block,name)=>new Set(graph.node(input(target,block,name)).types),fontGlyphInput:(target,block,name)=>graph.node(input(target,block,name))===graph.node('field:__bwSDK_Font:data'),localType,render,receiver,superCall,parameterPropertyBlocks,publicName:sdkClassPublicName,hasType:type=>classes.has(sdkClassName(type.replace(/(?:\[\])+$/,'')))};
}
