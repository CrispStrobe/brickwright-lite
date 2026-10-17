import {currentSdkImageProducer,currentSdkImageRoles} from './sdk-image-current-producers.js';
import {inspectClassConditionalBody} from './class-callable-conditional-body.js';
import {validateClassCallablePlan} from './class-callable-plan.js';
import {instantiateCallableSignature} from './callable-signatures.js';
import {classCallableExportTypes} from './class-callable-export-types.js';

// Current serialized blocks, actual class declarations and procedure owners.
// No runtime values or retained source bodies supply export type authority.
export function createClassCallableExportProvider({target,project,classes,definitions,valueTypes,literal,key,builtinNames,sdkImagePrototype=false,literalResource=null}) {
    const templates=classCallableExportTypes(classes,builtinNames),named=name=>({kind:'named',name});
    const fail=message=>{throw new Error('Class callable export: '+message);};
    let plan=null;
    const checkingFields=new Map(),checkingLocals=new Set();
    const member=(name,field,method=false)=>{
        const seen=new Set();let cls=classes.get(name);
        while(cls&&!seen.has(cls.name)){seen.add(cls.name);const found=(method?cls.methods:cls.fields).find(row=>row.name===field);if(found)return {cls,value:found};cls=classes.get(cls.parent);}
        return null;
    };
    const same=(a,b)=>a?.kind===b?.kind&&(['named','sdk'].includes(a.kind)?a.name===b.name:a.parameters.length===b.parameters.length&&a.parameters.every((parameter,index)=>same(parameter.type,b.parameters[index].type))&&same(a.result,b.result));
    const subtype=(actual,expected)=>{
        if(same(actual,expected))return true;
        if(actual?.kind!=='named'||expected?.kind!=='named')return false;
        let cls=classes.get(actual.name);const seen=new Set();while(cls&&!seen.has(cls.name)){seen.add(cls.name);if(cls.name===expected.name)return true;cls=classes.get(cls.parent);}return false;
    };
    const fieldType=field=>field.valueKind==='sdk'?field.sdkType:field.valueKind==='callable'?field.callableSignature:named(field.type);
    const parameterType=parameter=>parameter.sdkType||parameter.callableSignature||named(parameter.type);
    const checkingVariables=new Map();
    const containsInput=(block,wanted,seen=new Set())=>{
        if(block===wanted)return true;if(!block||seen.has(block))return false;seen.add(block);
        return Object.values(block.inputs||{}).some(input=>typeof input[1]==='string'&&containsInput(target.blocks[input[1]],wanted,seen));
    };
    const initializedBefore=(id,readBlock)=>{
        if(!readBlock||!Object.values(target.blocks).includes(readBlock))return false;
        const owner=scope(readBlock),root=owner.rootBlock||definitions.get(key(target,owner.procedure))?.block;if(!root)return false;
        let current=target.blocks[root.next],initialized=false;const seen=new Set();
        while(current){
            if(seen.has(current)||Object.keys(current.inputs||{}).some(name=>name.startsWith('SUBSTACK')))return false;seen.add(current);
            if(containsInput(current,readBlock))return initialized;
            if(current.opcode==='data_setvariableto'&&current.fields?.VARIABLE?.[1]===id)initialized=true;
            current=target.blocks[current.next];
        }
        return false;
    };
    const variableType=(block,readBlock=block)=>{
        const id=block.fields?.VARIABLE?.[1];if(!id)return null;
        const owners=project.targets.filter(other=>Object.hasOwn(other.variables||{},id));
        if(owners.length!==1||owners[0]!==target&&!owners[0].isStage)return null;
        if(checkingVariables.has(id)){const cached=checkingVariables.get(id);return cached?.kind==='sdk'&&!initializedBefore(id,readBlock)?null:cached;}
        checkingVariables.set(id,null);
        try {
            const writers=[];
            for(const other of project.targets)for(const writer of Object.values(other.blocks||{})){
                if(writer.opcode!=='data_setvariableto'||writer.fields?.VARIABLE?.[1]!==id)continue;
                if(other!==target)return null;writers.push(writer);
            }
            if(!writers.length)return null;
            let anchor=null;
            for(const writer of writers){
                const type=slotType(writer.inputs.VALUE?.[1],scope(writer),new Set(),writer);
                if(type?.kind==='sdk'||type?.kind==='named'&&classes.has(type.name)){anchor=type;checkingVariables.set(id,anchor);break;}
            }
            if(!anchor)return null;
            for(const writer of writers){const type=slotType(writer.inputs.VALUE?.[1],scope(writer),new Set(),writer);if(!type||!subtype(type,anchor))return null;}
            return anchor.kind==='sdk'&&!initializedBefore(id,readBlock)?null:anchor;
        }finally{checkingVariables.delete(id);}
    };
    const scope=block=>{
        const seen=new Set();let current=block;
        while(current?.parent){if(seen.has(current)){fail('cyclic current body ownership');}seen.add(current);current=target.blocks[current.parent];}
        if(current?.opcode==='procedures_definition'){
            const definition=[...definitions.values()].find(row=>row.target===target&&row.block===current);
            const owner=definition&&plan?.owners.find(row=>row.procedure===definition.code);
            if(owner)return owner;
            for(const cls of classes.values())if(cls.target===target){
                const method=cls.methods.find(row=>row.procedure===definition?.code);
                if(method)return {className:cls.name,receiverParameter:definition.parameters[0],signature:method.callableSignature,
                    parameters:method.parameters,procedure:definition.code};
                if(cls.constructor===definition?.code)return {kind:'constructor',className:cls.name,receiverParameter:definition.parameters[0],parameters:cls.parameters,procedure:definition.code};
            }
            return {kind:'module',procedure:definition?.code};
        }
        return {kind:'module',rootBlock:current};
    };
    const conditional=(owner)=>{
        const cls=classes.get(owner.className),method=cls?.methods.find(row=>row.procedure===owner.procedure);
        if(!method?.resultFlow)return null;
        const def=definitions.get(key(target,owner.procedure));if(!def)return null;
        const ids=new WeakMap(Object.entries(target.blocks).map(([id,row])=>[row,id]));
        const adapted=new Map();
        const row=id=>{const raw=target.blocks[id];if(!raw)return null;if(!adapted.has(id))adapted.set(id,{...raw,id});return adapted.get(id);};
        const field=member(cls.name,method.resultFlow.presenceField);
        if(!field||field.value.valueKind==='callable'||!classes.has(field.value.type))fail('conditional saved field lacks an ordinary class producer');
        templates.ordinary(field.value.type);
        const proof=inspectClassConditionalBody({block:row,definition:ids.get(def.block),input:(b,name)=>b.inputs?.[name]?.[1],
            literal:(b,name)=>literal(target,target.blocks[b.id],name),field:(b,name)=>b.fields?.[name]?.[0]},method,{
            className:cls.name,receiverParameter:def.parameters[0],validateFollowup:name=>{
                const follow=member(field.value.type,name,true)?.value;
                return !!follow&&follow.parameters.length===0&&follow.typeParameters?.length===0&&follow.callableSignature?.result?.name==='void';
            }});
        const raw=b=>target.blocks[b.id];
        return {...proof,fieldType:named(field.value.type),resultType:method.callableSignature.result,
            fieldReadBlock:raw(proof.fieldReadBlock),condition:raw(proof.condition),call:raw(proof.call),
            followups:proof.followups.map(raw),connectedBlocks:proof.connectedBlocks.map(raw),saveAssignment:raw(proof.saveAssignment),resultAssignment:raw(proof.resultAssignment),presentReturn:raw(proof.presentReturn),absentReturn:raw(proof.absentReturn)};
    };
    const local=(owner,name,readBlock=null)=>{
        if(owner.receiverParameter===name)return named(owner.className);
        const binding=plan?.bindings.find(row=>row.owner===owner.id&&row.nativeName===name);
        if(binding)return binding.type;
        const parameter=owner.parameters?.find(row=>typeof row==='object'&&row.name===name);
        if(parameter)return parameterType(parameter);
        if(!readBlock)return null;
        const branch=conditional(owner);
        if(branch){
            // Every read is bound by the connected shape proof. The result cell
            // exists only in the present arm, and has no forward/absent use.
            if(name===branch.savedName)return branch.fieldType;
            if(name===branch.resultName)return branch.resultType;
            return null;
        }
        const definition=owner.rootBlock&&Object.values(target.blocks).includes(owner.rootBlock)?{block:owner.rootBlock}:definitions.get(key(target,owner.procedure));if(!definition)return null;
        const identity=(owner.procedure||owner.id)+':'+name+':'+Object.entries(target.blocks).find(([,value])=>value===readBlock)?.[0];
        if(checkingLocals.has(identity))return null;
        checkingLocals.add(identity);
        try {
            const contains=(block,wanted,seen=new Set())=>{
                if(block===wanted)return true;if(!block||seen.has(block))return false;seen.add(block);
                return Object.values(block.inputs||{}).some(input=>typeof input[1]==='string'&&contains(target.blocks[input[1]],wanted,seen));
            };
            const visited=new Set();let id=definition.block.next,proved=null;
            while(id){
                if(visited.has(id))return null;visited.add(id);const block=target.blocks[id];
                if(!block||Object.keys(block.inputs||{}).some(key=>key.startsWith('SUBSTACK')))return null;
                if(contains(block,readBlock))return proved;
                if(block.opcode==='arcade_setLocal'&&literal(target,block,'NAME')===name){
                    const value=slotType(block.inputs.VALUE?.[1],owner);
                    if(!value||proved&&!same(proved,value))return null;proved=value;
                }
                id=block.next;
            }
            return null;
        }finally{checkingLocals.delete(identity);}
    };
    const slotType=(slot,owner,seen=new Set(),readAt=null)=>{
        if(Array.isArray(slot)){
            if([4,5,6,7,8].includes(slot[0]))return named('number');
            if(slot[0]===10)return named('string');
            if(slot[0]===12)return variableType({opcode:'data_variable',fields:{VARIABLE:[slot[1],slot[2]]}},readAt);
            return null;
        }
        const block=target.blocks[slot];if(!block||seen.has(block))return null;seen=new Set([...seen,block]);
        const inputType=name=>slotType(block.inputs?.[name]?.[1],owner,seen,block);
        const argsType=()=>{
            const args=[];let rest=block.inputs?.ARGS?.[1],visited=new Set();
            while(typeof rest==='string'&&target.blocks[rest]?.opcode==='arcade_functionArgument'){
                if(visited.has(rest))fail('cyclic current arguments');visited.add(rest);const arg=target.blocks[rest];args.push(slotType(arg.inputs.VALUE?.[1],owner,seen,arg));rest=arg.inputs.REST?.[1];
            }
            const end=typeof rest==='string'&&target.blocks[rest];if(!(Array.isArray(rest)&&rest[0]===10&&rest[1]==='[]')&&!(end?.opcode==='text'&&end.shadow&&end.fields.TEXT?.[0]==='[]'))fail('unproved current ordered argument list');
            return args;
        };
        if(['operator_add','operator_subtract','operator_multiply','operator_divide','operator_mod'].includes(block.opcode)) {
            return inputType('NUM1')?.name==='number'&&inputType('NUM2')?.name==='number'?named('number'):null;
        }
        if(block.opcode==='math_number')return named('number');if(block.opcode==='text')return named('string');
        if(block.opcode==='arrays_valueCompare'&&['===','!==','<','>','<=','>='].includes(block.fields?.OP?.[0])){const left=inputType('LEFT'),right=inputType('RIGHT');return left&&right&&same(left,right)&&['number','string','boolean'].includes(left.name)?named('boolean'):null;}
        if(block.opcode==='argument_reporter_string_number')return local(owner,block.fields.VALUE?.[0]);
        if(block.opcode==='arcade_getLocal')return local(owner,literal(target,block,'NAME'),block);
        if(block.opcode==='arcade_getCaptured'){
            const site=plan?.sites.find(row=>row.owner===owner.id),name=literal(target,block,'NAME');
            return plan?.bindings.find(row=>row.nativeName===name&&site?.captures.some(capture=>capture.binding===row.id))?.type;
        }
        if(block.opcode==='data_variable')return variableType(block);
        if(block.opcode==='arcade_createCallable'){
            const procedure=literal(target,block,'NAME');return plan?.owners.find(row=>row.procedure===procedure)?.signature;
        }
        if(block.opcode==='arrays_specialValue'&&['undefined','null'].includes(block.fields?.KIND?.[0]))return named(block.fields.KIND[0]);
        if(['arrays_valueUndefined','arrays_valueNull'].includes(block.opcode))return named(block.opcode==='arrays_valueNull'?'null':'undefined');
        if(block.opcode==='arrays_valueBinary'){
            const left=inputType('LEFT'),right=inputType('RIGHT'),op=block.fields.OP?.[0];
            if(left?.name==='number'&&right?.name==='number'&&['+','-','*','/','%'].includes(op))return named('number');
            if(op==='+'&&left?.name==='string'&&right?.name==='string')return named('string');
        }
        if(sdkImagePrototype&&['arcade_createImage','arcade_cloneImage','arcade_frameImage'].includes(block.opcode))return currentSdkImageProducer(target,block,inputType,literalResource);
        if(block.opcode==='arcade_setObjectField')return null;
        return operation(block,owner,{inputType,argsType,localType:name=>local(owner,name)});
    };
    const writerSafe=(className,fieldName,expected,seen=new Set())=>{
        const identity=className+'.'+fieldName;if(checkingFields.has(identity))return checkingFields.get(identity);checkingFields.set(identity,false);
        try {
        // A declaration alone cannot authorize a recursive field-read cycle.
        // Require an independently proved writer before using its field type.
        for(const block of Object.values(target.blocks)){
            if(block.opcode!=='arcade_setObjectField'||literal(target,block,'FIELD')!==fieldName)continue;
            const owner=scope(block),receiver=slotType(block.inputs.OBJECT?.[1],owner);
            const selected=receiver?.kind==='named'&&member(receiver.name,fieldName);
            if(selected?.cls.name!==className)continue;
            const actual=slotType(block.inputs.VALUE?.[1],owner);
            if(actual&&subtype(actual,expected)){checkingFields.set(identity,true);break;}
        }
        if(!checkingFields.get(identity))return false;
        return true;
        }finally{checkingFields.delete(identity);}
    };
    const operation=(block,owner,environment)=>{
        if(!Object.values(target.blocks).includes(block))return null;
        const actualOwner=scope(block);
        if(owner.id&&actualOwner.id!==owner.id||owner.procedure&&actualOwner.procedure!==owner.procedure||owner.rootBlock&&actualOwner.rootBlock!==owner.rootBlock)return null;
        const {inputType,argsType,localType}=environment;
        if(sdkImagePrototype&&['arcade_createImage','arcade_cloneImage','arcade_frameImage'].includes(block.opcode))return currentSdkImageProducer(target,block,inputType,literalResource);
        if(sdkImagePrototype&&block.opcode==='arcade_imageProperty'&&['width','height'].includes(block.fields?.PROPERTY?.[0]||literal(target,block,'PROPERTY'))){const image=inputType('IMAGE');return image?.kind==='sdk'&&image.name==='Image'?named('number'):null;}
        if(sdkImagePrototype&&['arcade_imagePixel','arcade_setImagePixel'].includes(block.opcode)){
            const names=block.opcode==='arcade_imagePixel'?['X','Y']:['X','Y','COLOR'];
            if(Object.keys(block.fields||{}).length||Object.keys(block.inputs||{}).sort().join(',')!==['IMAGE',...names].sort().join(','))return null;
            const image=inputType('IMAGE');
            if(image?.kind!=='sdk'||image.name!=='Image'||names.some(name=>{const value=inputType(name);return value?.kind!=='named'||value.name!=='number';}))return null;
            return named(block.opcode==='arcade_imagePixel'?'number':'void');
        }
        if(sdkImagePrototype&&['arcade_mutateImage','arcade_drawImage'].includes(block.opcode)){
            const fill=block.opcode==='arcade_mutateImage',names=fill?['COLOR','TO']:['X','Y','W','H','COLOR'];
            if(Object.keys(block.fields||{}).join(',')!=='OP'||block.fields.OP?.[0]!== (fill?'fill':'fillRect')||
                Object.keys(block.inputs||{}).sort().join(',')!==['IMAGE',...names].sort().join(','))return null;
            const image=inputType('IMAGE');
            if(image?.kind!=='sdk'||image.name!=='Image'||names.some(name=>{const value=inputType(name);return value?.kind!=='named'||value.name!=='number';}))return null;
            // Native fill evaluates the otherwise unused replacement socket.
            // Export drops that operand: only a proved inert Number literal may
            // disappear, never an effectful Number reporter or numeric text.
            if(fill){
                const slot=block.inputs.TO[1],leaf=typeof slot==='string'?target.blocks[slot]:null;
                const inert=Array.isArray(slot)?slot.length===2&&[4,5,6,7,8].includes(slot[0]):
                    leaf?.shadow===true&&/^math_(?:number|whole_number|integer|positive_number|angle)$/.test(leaf.opcode)&&
                    !Object.keys(leaf.inputs||{}).length&&Object.keys(leaf.fields||{}).join(',')==='NUM'&&!leaf.next;
                const replacement=literal(target,block,'TO');
                if(!inert||replacement===null||!Number.isFinite(Number(replacement)))return null;
            }
            return named('void');
        }
        if(block.opcode==='arcade_getLocal')return localType(literal(target,block,'NAME')) || local(owner,literal(target,block,'NAME'),block);
        if(block.opcode==='arcade_createObject'){
            const name=literal(target,block,'CLASS'),cls=classes.get(name);if(!cls)return null;templates.ordinary(name);
            const args=argsType();if(args.length!==cls.parameters.length||args.some((type,index)=>!type||!subtype(type,parameterType(cls.parameters[index]))))fail('current constructor arguments differ');return named(name);
        }
        if(['arcade_objectField','arcade_assignObjectField','arcade_setObjectField','arcade_callObjectMethod'].includes(block.opcode)){
            const receiver=inputType('OBJECT');if(!receiver||receiver.kind!=='named'||!classes.has(receiver.name))return null;templates.ordinary(receiver.name);
            const method=block.opcode==='arcade_callObjectMethod',name=literal(target,block,method?'METHOD':'FIELD'),selected=member(receiver.name,name,method);if(!selected)return null;
            let lexicalOwner=owner;const seenOwners=new Set();
            while(lexicalOwner&&!lexicalOwner.className&&!seenOwners.has(lexicalOwner.id)){
                seenOwners.add(lexicalOwner.id);lexicalOwner=plan?.owners.find(row=>row.id===lexicalOwner.parent);
            }
            const visibility=selected.value.visibility;
            if(visibility==='private'&&lexicalOwner?.className!==selected.cls.name)return null;
            if(visibility==='protected'&&(!lexicalOwner?.className||!subtype(named(lexicalOwner.className),named(selected.cls.name))))return null;
            if(!method&&selected.value.readonly&&block.opcode!=='arcade_objectField'){
                const actualReceiver=target.blocks[block.inputs.OBJECT?.[1]];
                const receiverName=actualReceiver?.opcode==='arcade_getLocal'?literal(target,actualReceiver,'NAME'):actualReceiver?.opcode==='argument_reporter_string_number'?actualReceiver.fields.VALUE?.[0]:null;
                if(owner.kind!=='constructor'||owner.className!==selected.cls.name||receiverName!==owner.receiverParameter)return null;
            }

            if(method){const args=argsType(),row=selected.value;if(!row.callableSignature||args.some(type=>!type))return null;
                const result=instantiateCallableSignature(row.callableSignature,row.typeParameters,args);if(result.unsupported.length)fail(result.unsupported.join('; '));return result.signature.result;}
            const expected=fieldType(selected.value);
            if(block.opcode!=='arcade_objectField'){
                const actual=inputType('VALUE');if(!actual||!subtype(actual,expected))return null;
                if(block.opcode==='arcade_assignObjectField'&&(expected.name!=='number'||!['+=','-=','*=','/=','%='].includes(literal(target,block,'OP'))))return null;
            }
            return writerSafe(selected.cls.name,name,expected)?expected:null;
        }
        if(block.opcode==='arcade_callCallable'){
            const signature=inputType('CALLABLE');if(signature?.kind!=='callable')return null;const args=argsType();
            if(args.length!==signature.parameters.length||args.some((type,index)=>!type||!subtype(type,signature.parameters[index].type)))fail('current callback arguments differ');return signature.result;
        }
        return null;
    };
    const verifyWriters=()=>{
        for(const other of project.targets)for(const block of Object.values(other.blocks||{})){
            const imageOperation=sdkImagePrototype&&['arcade_imagePixel','arcade_setImagePixel','arcade_mutateImage','arcade_drawImage'].includes(block.opcode);
            if(!imageOperation&&!['arcade_setObjectField','arcade_assignObjectField'].includes(block.opcode))continue;
            if(other!==target)fail('foreign class field writer has no owned lexical provenance');
            const owner=scope(block),actual=operation(block,owner,{
                inputType:name=>slotType(block.inputs?.[name]?.[1],owner,new Set(),block),
                argsType:()=>[],localType:name=>local(owner,name,block)
            });
            if(!actual)fail(imageOperation?'current Image operation lacks its actual owned receiver, exact shape and Number operands':'current class field write differs from its concrete signature');
        }
    };
    // This is a statement-only module entry, not a callFunction value type.
    // The actual declaration body remains subject to complete lexical/body
    // validation before the exporter installs this provider's root context.
    const declaredModuleVoidCall=block=>{
        if(block?.opcode!=='arcade_callFunction'||Object.keys(block.inputs||{}).sort().join(',')!=='ARGS,NAME')return false;
        const callIDs=Object.entries(target.blocks).filter(([,value])=>value===block);if(callIDs.length!==1)return false;
        const code=block.inputs.NAME[1],text=typeof code==='string'&&target.blocks[code];
        const name=Array.isArray(code)?code.length===2&&code[0]===10&&typeof code[1]==='string'?code[1]:null:
            text?.opcode==='text'&&text.shadow===true&&text.parent===callIDs[0][0]&&Object.keys(text.inputs||{}).length===0&&
            Object.keys(text.fields||{}).join(',')==='TEXT'&&typeof text.fields.TEXT?.[0]==='string'&&!text.next?text.fields.TEXT[0]:null;
        const owners=plan?.owners.filter(row=>row.kind==='declaration'&&row.parent===plan.module&&row.procedure===name);
        if(owners?.length!==1||/%[sbn]/.test(name))return false;
        const owner=owners[0];if(owner.parameters.length||owner.signature.parameters.length||owner.defaults.length||owner.signature.result.kind!=='named'||owner.signature.result.name!=='void')return false;
        const def=definitions.get(key(target,name));if(!def||def.target!==target||def.code!==name||def.parameters.length||def.block?.opcode!=='procedures_definition')return false;
        const ids=Object.entries(target.blocks).filter(([,value])=>value===def.block);if(ids.length!==1)return false;
        const protoID=def.block.inputs?.custom_block?.[1],proto=typeof protoID==='string'&&target.blocks[protoID];
        if(proto?.opcode!=='procedures_prototype'||proto.parent!==ids[0][0]||proto.mutation?.proccode!==name||typeof proto.mutation.argumentnames!=='string')return false;
        let names;try{names=JSON.parse(proto.mutation.argumentnames);}catch(_){return false;}
        if(!Array.isArray(names)||names.length)return false;
        const args=block.inputs.ARGS[1],end=typeof args==='string'&&target.blocks[args];
        return Array.isArray(args)?args.length===2&&args[0]===10&&args[1]==='[]':
            end?.opcode==='text'&&end.shadow===true&&end.parent===callIDs[0][0]&&
            Object.keys(end.inputs||{}).length===0&&Object.keys(end.fields||{}).join(',')==='TEXT'&&end.fields.TEXT?.[0]==='[]'&&!end.next;
    };
    // A discarded Void call has no value binding. Its destination must be
    // unobservable in the complete current project, not just absent from the
    // retained lexical plan. The same physical proof serves ordinary roots,
    // nonlexical methods and actual lexical owners.
    const unusedVoidProofs=new WeakMap(),issuedUnusedVoidProofs=new Map();
    const observeUnusedVoidProofs=()=>{
        let current=true;
        for(const proof of issuedUnusedVoidProofs.values())if(!proof.current())current=false;
        return current;
    };
    const observeUnusedVoidAt=id=>{const proof=issuedUnusedVoidProofs.get(id);return !proof||proof.current();};
    const unusedVoidStatement=(block,owner)=>{
        if(!observeUnusedVoidProofs())return null;
        const cached=block&&typeof block==='object'?unusedVoidProofs.get(block):null;
        if(!plan||block?.opcode!=='arcade_setLocal'||!project.targets.includes(target))return null;
        const ids=Object.entries(target.blocks).filter(([,value])=>value===block);if(ids.length!==1)return null;
        const [id]=ids[0],actualOwner=scope(block);let root=block;const parents=new Set();
        while(root.parent){if(parents.has(root))return null;parents.add(root);root=target.blocks[root.parent];if(!root)return null;}
        if(owner.id?actualOwner.id!==owner.id:owner.rootBlock?root!==owner.rootBlock:!owner.procedure||actualOwner.procedure!==owner.procedure)return null;
        if(cached)return cached;
        const name=literal(target,block,'NAME');
        if(!/^[A-Za-z_]\w*$/.test(name||'')||name===actualOwner.receiverParameter||classes.has(name))return null;
        if(plan.bindings.some(row=>row.nativeName===name||row.sourceName===name))return null;
        if([...definitions.values()].some(row=>row.parameters.includes(name)))return null;
        if(project.targets.some(other=>Object.values(other.variables||{}).some(variable=>variable[0]===name)))return null;
        for(const other of project.targets)for(const current of Object.values(other.blocks||{})){
            if(['arcade_declareLocal','arcade_getLocal','arcade_getCaptured','arcade_setLocal','arcade_setCaptured'].includes(current.opcode)&&literal(other,current,'NAME')===name&&!(other===target&&current===block))return null;
            if(/^argument_reporter_/.test(current.opcode)&&current.fields?.VALUE?.[0]===name)return null;
        }
        const valueId=block.inputs?.VALUE?.[1],value=typeof valueId==='string'&&target.blocks[valueId];if(!value||value.parent!==id)return null;
        // A lexical declaration's new route is specifically an existing owned
        // class/callback call. Other Void-producing operations do not acquire
        // a statement permission from this sink.
        if(owner.id&&!['arcade_callObjectMethod','arcade_callCallable'].includes(value.opcode))return null;
        const moduleVoid=owner.rootBlock?.opcode==='arcade_whenSourceStarts'&&actualOwner.rootBlock===owner.rootBlock&&declaredModuleVoidCall(value);
        verifyWriters();const type=moduleVoid?null:slotType(valueId,actualOwner);
        if(!moduleVoid&&(type?.kind!=='named'||type.name!=='void'))return null;
        const issuedPlan=plan,state=()=>JSON.stringify([plan,project.targets.map(other=>[other.variables,other.blocks]),
            [...classes].map(([name,row])=>[name,{...row,target:project.targets.indexOf(row.target)}]),
            [...definitions].map(([name,row])=>[name,row.code,row.parameters,project.targets.indexOf(row.target),Object.entries(row.target.blocks).filter(([,value])=>value===row.block).map(([id])=>id)])]),snapshot=state();let expired=false;
        const proof=Object.freeze({current(){
            if(expired)return false;
            try {
                if(plan!==issuedPlan||!project.targets.includes(target)||target.blocks[id]!==block||block.inputs?.VALUE?.[1]!==valueId||target.blocks[valueId]!==value||state()!==snapshot){expired=true;return false;}
                return true;
            }catch(error){expired=true;throw error;}
        }});
        unusedVoidProofs.set(block,proof);issuedUnusedVoidProofs.set(id,proof);return proof;
    };
    return Object.freeze({
        validateCurrentPlan(candidate,actualTarget){
            plan=null;let accepted=false;
            try {
            validateClassCallablePlan(candidate);if(actualTarget!==target)return false;
            const sdk=type=>type?.kind==='sdk'||type?.kind==='callable'&&(type.parameters.some(parameter=>sdk(parameter.type))||sdk(type.result));
            if(!sdkImagePrototype&&(candidate.classes.some(row=>row.sdkRoles)||candidate.owners.some(row=>sdk(row.signature))||candidate.bindings.some(row=>sdk(row.type))))return false;
            for(const row of candidate.classes){const cls=classes.get(row.name);if(!cls||cls.target!==target||(cls.parent||null)!==row.parent)return false;templates.ordinary(row.name);
                const actual=currentSdkImageRoles(cls),expected=row.sdkRoles||{fields:[],constructor:[],methods:[]};
                const canonical=roles=>({fields:[...roles.fields].sort((a,b)=>a.name.localeCompare(b.name)),constructor:roles.constructor,methods:[...roles.methods].sort((a,b)=>a.name.localeCompare(b.name))});
                if(JSON.stringify(actual)!==JSON.stringify(canonical(expected)))return false;
            }
            for(const owner of candidate.owners.filter(row=>['constructor','method'].includes(row.kind))){
                const cls=classes.get(owner.className),selected=owner.kind==='constructor'?{procedure:cls.constructor,parameters:cls.parameters}:cls.methods.find(row=>row.name===owner.memberName);
                const def=selected&&definitions.get(key(target,selected.procedure));if(!def||selected.procedure!==owner.procedure||def.parameters[0]!==owner.receiverParameter||def.parameters.length!==selected.parameters.length+1||selected.parameters.some((parameter,index)=>def.parameters[index+1]!==parameter.name)||selected.parameters.length!==owner.signature.parameters.length)return false;
                if(selected.parameters.some((parameter,index)=>parameter.name!==owner.signature.parameters[index].name||parameter.type!==(['named','sdk'].includes(owner.signature.parameters[index].type.kind)?owner.signature.parameters[index].type.name:'callable')))return false;
                if(owner.kind==='constructor'){
                    if(owner.typeParameters.length||owner.signature.result.kind!=='named'||owner.signature.result.name!=='void')return false;
                    if(selected.parameters.some((parameter,index)=>{
                        const expected=owner.signature.parameters[index].type;
                        return expected.kind==='sdk'?parameter.type!=='Image'||JSON.stringify(parameter.sdkType)!==JSON.stringify(expected):expected.kind==='callable'?JSON.stringify(parameter.callableSignature)!==JSON.stringify(expected):parameter.callableSignature!==undefined||parameter.sdkType!==undefined;
                    }))return false;
                }
                if(owner.kind==='method' && (JSON.stringify(selected.callableSignature)!==JSON.stringify(owner.signature)||JSON.stringify(selected.typeParameters)!==JSON.stringify(owner.typeParameters)))return false;
            }
            plan=candidate;
            verifyWriters();
            if(candidate.classes.some(row=>row.sdkRoles))for(const block of Object.values(target.blocks))if(['arcade_createObject','arcade_callObjectMethod','arcade_callCallable'].includes(block.opcode)){
                const id=Object.entries(target.blocks).find(([,row])=>row===block)?.[0];if(!slotType(id,scope(block)))return false;
            }
            for(const cls of classes.values())if(cls.target===target)for(const method of cls.methods)if(method.callableSignature){
                const definition=definitions.get(key(target,method.procedure));if(!definition)return false;
                const owner={className:cls.name,receiverParameter:definition.parameters[0],parameters:method.parameters,procedure:method.procedure};
                if(method.resultFlow){conditional(owner);continue;}
                const visited=new Set();let id=definition.block.next,returned=false;
                while(id){
                    if(visited.has(id))return false;visited.add(id);const block=target.blocks[id];if(!block||Object.keys(block.inputs||{}).some(name=>name.startsWith('SUBSTACK')))return false;
                    if(block.opcode==='arcade_returnValue'){
                        const actual=slotType(block.inputs.VALUE?.[1],owner);if(!actual||!same(actual,method.callableSignature.result))return false;returned=true;
                    }else if(!['arcade_declareLocal','arcade_setLocal','arcade_setObjectField','arcade_assignObjectField','arcade_setImagePixel'].includes(block.opcode))return false;
                    else if(block.opcode==='arcade_setLocal'){
                        const name=literal(target,block,'NAME');
                        if(name===owner.receiverParameter||owner.parameters.some(parameter=>parameter.name===name))return false;
                        const value=slotType(block.inputs.VALUE?.[1],owner);
                        if(value?.name==='void'){
                            if(Object.values(target.blocks).some(read=>scope(read).procedure===owner.procedure&&read.opcode==='arcade_getLocal'&&literal(target,read,'NAME')===name))return false;
                        }else if(!this.localAssignment(block,owner))return false;
                    }else if(['arcade_setObjectField','arcade_assignObjectField','arcade_setImagePixel'].includes(block.opcode)&&!operation(block,owner,{inputType:name=>slotType(block.inputs?.[name]?.[1],owner),argsType:()=>[],localType:name=>local(owner,name,block)}))return false;
                    id=block.next;
                }
                if(method.callableSignature.result.name!=='void'&&!returned)return false;
            }
            accepted=true;return true;
            }finally{if(!accepted)plan=null;}
        },
        currentInputType(block,name){
            if(!plan||!Object.values(target.blocks).includes(block))return null;
            verifyWriters();return slotType(block.inputs?.[name]?.[1],scope(block),new Set(),block);
        },
        valueType(block,owner,environment){verifyWriters();return block.opcode==='arcade_setObjectField'?null:operation(block,owner,environment);},
        statementType(block,owner,environment){verifyWriters();return operation(block,owner,environment)!==null;},
        expressionType(block){
            if(!plan)return null;
            const id=Object.entries(target.blocks).find(([,value])=>value===block)?.[0];
            return id?slotType(id,scope(block)):null;
        },
        sdkVariable(id){
            if(!plan?.classes.some(row=>row.sdkRoles))return false;
            const reads=[];
            const scan=(value,block)=>{if(!Array.isArray(value))return;if(value[0]===12&&value[2]===id)reads.push(block);else for(const child of value)scan(child,block);};
            for(const block of Object.values(target.blocks)){
                if(block.opcode==='data_variable'&&block.fields?.VARIABLE?.[1]===id)reads.push(block);
                for(const input of Object.values(block.inputs||{}))scan(input,block);
            }
            return reads.length>0&&reads.every(block=>variableType({fields:{VARIABLE:['',id]}},block)?.kind==='sdk');
        },
        localType:local,
        unusedVoidStatement,
        localAssignment(block,owner){
            if(!plan||block?.opcode!=='arcade_setLocal'||!Object.values(target.blocks).includes(block))return null;
            const name=literal(target,block,'NAME');if(!/^[A-Za-z_]\w*$/.test(name||'')||name===owner.receiverParameter)return null;
            if(classes.has(name)||['this','super','class','function','return','let','const','var','new','if','else','for','while','switch','case','default','throw','try','catch','finally','break','continue','delete','typeof','void','in','instanceof','extends','implements','interface','enum','namespace','import','export','yield','await','null','true','false','undefined','NaN'].includes(name))return null;
            if(project.targets.some(other=>Object.values(other.variables||{}).some(variable=>variable[0]===name)))return null;
            if(plan.bindings.some(row=>row.nativeName===name||row.sourceName===name)||owner.parameters?.some(parameter=>typeof parameter==='object'&&(parameter.name===name||parameter.nativeName===name)))return null;
            const site=plan.sites.find(row=>row.owner===owner.id);
            if(plan.bindings.some(row=>row.nativeName===name&&(row.owner===owner.id||site?.captures.some(capture=>capture.binding===row.id))))return null;
            const definition=owner.rootBlock&&Object.values(target.blocks).includes(owner.rootBlock)?{block:owner.rootBlock}:definitions.get(key(target,owner.procedure));if(!definition)return null;
            let id=definition.block.next,earlier=false;const visited=new Set();
            while(id){
                if(visited.has(id))return null;visited.add(id);const current=target.blocks[id];
                if(!current||Object.keys(current.inputs||{}).some(key=>key.startsWith('SUBSTACK')))return null;
                if(current===block)break;
                if(current.opcode==='arcade_setLocal'&&literal(target,current,'NAME')===name)earlier=true;
                id=current.next;
            }
            if(!id)return null;
            const type=slotType(block.inputs.VALUE?.[1],owner);if(!type||type.kind==='named'&&['null','undefined','void'].includes(type.name))return null;
            const prior=earlier&&local(owner,name,block);if(earlier&&(!prior||!same(type,prior)))return null;
            return Object.freeze({name,type:structuredClone(type),first:!earlier});
        },
        contextForModuleRoot(root,callableEmitter,moduleCreates){
            if(!observeUnusedVoidProofs())return null;
            if(!plan||!Object.values(target.blocks).includes(root)||!root.topLevel||!['arcade_whenSourceStarts','event_whenflagclicked','procedures_definition'].includes(root.opcode))return null;
            const definition={block:root};
            const owner={kind:'module',rootBlock:root},cells=new Map();
            const contains=(block,id,seen=new Set())=>{
                if(block===target.blocks[id])return true;if(!block||seen.has(block))return false;seen.add(block);
                return Object.values(block.inputs||{}).some(input=>typeof input[1]==='string'&&contains(target.blocks[input[1]],id,seen))||contains(target.blocks[block.next],id,seen);
            };
            const constructor=Object.entries(target.blocks).some(([id,block])=>{
                if(block.opcode!=='arcade_createObject'||!contains(definition.block,id))return false;
                const type=slotType(id,scope(block)),cls=type?.kind==='named'&&classes.get(type.name);
                return !!cls&&cls.target===target&&!cls.intrinsic&&plan.classes.some(row=>row.name===cls.name);
            });
            const declaredVoid=Object.entries(target.blocks).some(([id,block])=>block.opcode==='arcade_setLocal'&&contains(root,id)&&
                declaredModuleVoidCall(target.blocks[block.inputs?.VALUE?.[1]])&&unusedVoidStatement(block,owner)?.current());
            if(![...moduleCreates].some(id=>contains(definition.block,id))&&!constructor&&!declaredVoid)return null;
            verifyWriters();
            const provider=this;
            return {
                statementTerminator:true,
                generatedLocal(id){const block=target.blocks[id],proof=provider.localAssignment(block,owner);if(proof)cells.set(proof.name,proof.type);return proof;},
                discardLocal(id){
                    if(!observeUnusedVoidAt(id))return false;
                    const block=target.blocks[id];if(block?.opcode!=='arcade_setLocal'||!contains(root,id))return false;
                    const proof=unusedVoidStatement(block,owner);return !!proof&&proof.current();
                },
                local(name){if(!cells.has(name))fail('module procedure reads a local before its proved assignment');return name;},
                capture(){fail('module procedure has no lexical capture');},
                create(id){if(!moduleCreates.has(id))fail('module procedure creation has a foreign owner');return callableEmitter.moduleCreate(id);}
            };
        },
        contextForMethod(code){
            if(!observeUnusedVoidProofs())return null;
            const cls=[...classes.values()].find(row=>row.target===target&&row.methods.some(method=>method.procedure===code&&method.callableSignature));
            const method=cls?.methods.find(row=>row.procedure===code),definition=definitions.get(key(target,code));if(!plan||!method||!definition)return null;
            const owner={className:cls.name,receiverParameter:definition.parameters[0],parameters:method.parameters,procedure:code};
            const provider=this,cells=new Map();
            return {
                statementTerminator:true,
                generatedLocal(id){
                    const block=target.blocks[id],branch=conditional(owner);if(!branch){const proof=provider.localAssignment(block,owner);if(proof)cells.set(proof.name,proof.type);return proof;}
                    if(block?.opcode!=='arcade_setLocal')return null;
                    const name=literal(target,block,'NAME');
                    if(name===branch.savedName&&target.blocks[block.inputs.VALUE?.[1]]===branch.fieldReadBlock)return {name,type:branch.fieldType,first:true};
                    if(name===branch.resultName&&target.blocks[block.inputs.VALUE?.[1]]===branch.call)return {name,type:branch.resultType,first:true};
                    return null;
                },
                discardLocal(id){
                    if(!observeUnusedVoidAt(id))return false;
                    const block=target.blocks[id];if(block?.opcode!=='arcade_setLocal')return false;
                    const name=literal(target,block,'NAME');if(name===owner.receiverParameter||owner.parameters.some(row=>row.name===name))return false;
                    const branch=conditional(owner);
                    if(branch)return branch.followups.includes(target.blocks[block.inputs.VALUE?.[1]]);
                    const proof=unusedVoidStatement(block,owner);return !!proof&&proof.current();
                },
                local(name,write=false){
                    const branch=conditional(owner);
                    if(branch&&[branch.savedName,branch.resultName].includes(name)){if(write)fail('conditional locals must use their actual defining assignments');return name;}
                    if(name===owner.receiverParameter){if(write)fail('edited method writes its actual receiver');return 'this';}
                    if(write&&owner.parameters.some(parameter=>parameter.name===name))fail('class callback method parameter writes are not qualified');
                    if(!cells.has(name)&&!local(owner,name))fail('unproved current class method local');return name;
                },
                capture(){fail('nonlexical class method has no captured binding');},
                create(){fail('class method creation lacks an actual lexical owner');}
            };
        }
    });
}
