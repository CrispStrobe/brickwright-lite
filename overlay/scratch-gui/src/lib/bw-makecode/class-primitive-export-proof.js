import {sdkFontInputAuthority} from './sdk-font-input-authority.js';

// Validate current ordinary-class constraints. Declaration types constrain a
// writer. Symbolic declaration constraints remain distinct from actual facts;
// neither supplies runtime/provenance authority or changes a value.
export function checkClassPrimitiveExport({project,classes,procedures,note,dynamicReceiver=()=>false,qualifiedInput=()=>null}) {
    const primitive=sdkFontInputAuthority(project),ordinary=[...classes.values()].filter(cls=>!cls.intrinsic);
    const expected=new Map([['number','Number'],['string','String'],['boolean','Boolean']]);
    if(!ordinary.length)return;
    const owned=new WeakMap(),locations=new WeakMap(),definitions=new Map(),rows=[],bad=new Set(),methodOwners=new Map();
    const blocks=target=>target.blocks||{},child=(target,block,name)=>typeof block.inputs?.[name]?.[1]==='string'?blocks(target)[block.inputs[name][1]]:null;
    const fixed=(target,block,name)=>{if(!block.inputs?.[name]&&typeof block.fields?.[name]?.[0]==='string')return block.fields[name][0];const input=block.inputs?.[name]?.[1],value=child(target,block,name);return Array.isArray(input)&&input[0]===10?String(input[1]):value?.shadow&&value.opcode==='text'?String(value.fields?.TEXT?.[0]):null;};
    const key=(target,name)=>`${project.targets.indexOf(target)}:${name}`;
    const opaque=()=>new Set(['Opaque']),union=sets=>new Set(sets.flatMap(set=>[...set]));
    const diagnostics=new Set(),fail=message=>diagnostics.add('Class primitive export: '+message);
    for(const target of project.targets)for(const[id,block]of Object.entries(blocks(target)))locations.set(block,{target,id});
    for(const target of project.targets)for(const[id,block]of Object.entries(blocks(target)))if(block.topLevel){
        const proto=block.opcode==='procedures_definition'?child(target,block,'custom_block'):null;
        let definition=null;
        if(proto){let names;try{names=JSON.parse(proto.mutation?.argumentnames||'[]');}catch{names=null;}
            const code=proto.mutation?.proccode,k=key(target,code);
            definition={target,block,proto,code,names,rows:[],returns:[],fallthrough:false};
            if(typeof code!=='string'||!Array.isArray(names)||names.some(name=>typeof name!=='string'||!name)||new Set(names).size!==names.length||definitions.has(k)){bad.add(k);definitions.set(k,null);}else definitions.set(k,definition);
        }
        const owner=definition||{target,block,rows:[]};
        const visit=(current,parent,path=new Set())=>{
            if(!current)return;
            const where=locations.get(current);if(!where||path.has(current)||owned.has(current)&&owned.get(current)!==owner){bad.add(owner);if(owned.has(current))bad.add(owned.get(current));return;}
            if(parent&&current.parent!==locations.get(parent)?.id){bad.add(owner);return;}
            if(owned.has(current))return;owned.set(current,owner);owner.rows.push(current);rows.push({target,block:current,owner});path=new Set(path);path.add(current);
            for(const input of Object.values(current.inputs||{}))if(typeof input?.[1]==='string'){const next=blocks(target)[input[1]];if(!next)bad.add(owner);else visit(next,current,path);}
            if(current.next){const next=blocks(target)[current.next];if(!next)bad.add(owner);else visit(next,current,path);}
        };
        visit(block,null);
    }
    for(const cls of ordinary){
        const entries=[[cls.initializer,[],null],[cls.constructor,cls.parameters,null],...cls.methods.filter(method=>!method.callableSignature).map(method=>[method.procedure,method.parameters,method.returnType]),...cls.fields.flatMap(field=>[...(field.getter?[[field.getter,[],field.type]]:[]),...(field.setter?[[field.setter.procedure,field.setter.parameters,null]]:[])])];
        for(const[code,parameters,result]of entries){
            // Native inherited constructors belong to the already validated
            // intrinsic descriptor, not to an editable managed procedure.
            if(code===cls.constructor){
                let base=classes.get(cls.parent);const seen=new Set();let intrinsic=false;
                while(base&&!seen.has(base)){seen.add(base);if(base.intrinsic&&base.constructor===code){intrinsic=true;break;}base=classes.get(base.parent);}
                if(intrinsic)continue;
            }
            const k=key(cls.target,code),def=definitions.get(k);if(!def){fail('class '+cls.name+' requires a unique actual procedure '+code);continue;}
            // An implicit inherited constructor retains its declaring owner.
            if(methodOwners.has(def)&&methodOwners.get(def).cls!==cls)continue;
            methodOwners.set(def,{cls,parameters,result});
        }
    }
    for(const row of procedures?.values()||[]){const def=row.definition&&definitions.get(key(row.definition.target,row.definition.code));if(def&&!row.native&&!methodOwners.has(def))methodOwners.set(def,{cls:row.cls,parameters:row.params,result:row.result});}
    const ancestry=name=>{const found=[],seen=new Set();while(classes.has(name)&&!seen.has(name)){seen.add(name);const cls=classes.get(name);found.push(cls);name=cls.parent;}return found;};
    const member=(name,property,method=false)=>{for(const cls of ancestry(name)){const value=(method?cls.methods:cls.fields).find(row=>row.name===property);if(value)return {cls,value};}return null;};
    let cache=new WeakMap(),previous=new WeakMap();const checking=new Set();
    const args=(target,block)=>{const result=[],seen=new Set();let value=child(target,block,'ARGS');if(!value)return fixed(target,block,'ARGS')==='[]'?result:null;
        while(value?.opcode==='arcade_functionArgument'){if(seen.has(value))return null;seen.add(value);result.push({target,block:value,name:'VALUE'});if(fixed(target,value,'REST')==='[]')return result;value=child(target,value,'REST');}return null;};
    const input=(target,block,name)=>{const slot=block.inputs?.[name]?.[1],value=child(target,block,name);let actual;
        if(value)actual=expression(target,value);
        else if(Array.isArray(slot)){if([4,5,6,7,8].includes(slot[0]))actual=new Set(['Number']);else if(slot[0]===10)actual=new Set(['String']);else if(slot[0]===12)actual=variable(target,slot[2]);}
        if(!actual)actual=opaque();
        // Existing v2 current-body validation owns lexical Arrow parameters.
        // Only its registered input certificate can extend this ordinary view.
        if(actual.has('Opaque')){const certified=qualifiedInput(target,block,name);if(certified?.kind==='named'){
            if(expected.has(certified.name))return new Set(['Constraint:'+expected.get(certified.name)]);
            if(classes.has(certified.name))return new Set(['@'+certified.name]);
        }}
        return actual;
    };
    const variable=(target,id)=>{const actual=project.targets.filter(other=>Object.hasOwn(other.variables||{},id));if(actual.length!==1||actual[0]!==target&&!actual[0].isStage)return opaque();
        const writers=rows.filter(row=>row.block.fields?.VARIABLE?.[1]===id&&['data_setvariableto','data_changevariableby'].includes(row.block.opcode));return writers.length?union(writers.map(row=>row.block.opcode==='data_setvariableto'?input(row.target,row.block,'VALUE'):opaque())):opaque();};
    function destinations(target,block){
        if(block.opcode==='arcade_callFunction'){const def=definitions.get(key(target,fixed(target,block,'NAME')));return def?[def]:[];}
        if(block.opcode==='arcade_createObject'){const cls=classes.get(fixed(target,block,'CLASS')),def=cls&&definitions.get(key(cls.target,cls.constructor));return def?[def]:[];}
        if(block.opcode==='arcade_callObjectMethod'){const result=[];for(const name of input(target,block,'OBJECT')){const found=name.startsWith('@')&&member(name.slice(1),fixed(target,block,'METHOD'),true);const def=found&&definitions.get(key(found.cls.target,found.value.procedure));if(!def)return [];result.push(def);}return [...new Set(result)];}
        return [];
    }
    const calls=()=>rows.filter(row=>['arcade_callFunction','arcade_createObject','arcade_callObjectMethod'].includes(row.block.opcode));
    function parameter(def,name){const index=def.names?.indexOf(name),meta=methodOwners.get(def);if(index<0)return opaque();
        if(index===0&&meta)return new Set(['@'+meta.cls.name]);
        // A formal's declared constraint is symbolic source typing, not an
        // observed runtime producer. Every actual call and overwrite is checked separately.
        const declared=meta?.parameters[index-1];
        if(expected.has(declared?.type))return new Set(['Constraint:'+expected.get(declared.type)]);
        if(classes.has(declared?.type))return new Set(['@'+declared.type]);
        const values=[];for(const call of calls())if(destinations(call.target,call.block).includes(def)){
            const supplied=args(call.target,call.block),offset=call.block.opcode==='arcade_callFunction'?0:1;if(!supplied){values.push(opaque());continue;}
            const argument=supplied[index-offset];if(argument)values.push(input(argument.target,argument.block,argument.name));else{const declaration=meta?.parameters[index-1];values.push(declaration&&Object.hasOwn(declaration,'default')?new Set([typeof declaration.default==='number'?'Number':typeof declaration.default==='string'?'String':typeof declaration.default==='boolean'?'Boolean':'Opaque']):new Set(['Undefined']));}
        }
        for(const row of def.rows)if(row.opcode==='arcade_setLocal'&&fixed(def.target,row,'NAME')===name)values.push(input(def.target,row,'VALUE'));
        return values.length?union(values):opaque();
    }
    function local(target,block,name){const def=owned.get(block);if(!def||bad.has(def)||typeof name!=='string')return opaque();
        if(def.names?.includes(name))return parameter(def,name);
        const writers=def.rows.filter(row=>row.opcode==='arcade_setLocal'&&fixed(target,row,'NAME')===name);
        return writers.length?union(writers.map(writer=>input(target,writer,'VALUE'))):opaque();
    }
    function fieldValues(name,property){const found=member(name,property);if(!found)return opaque();
        if(expected.has(found.value.type))return new Set(['Constraint:'+expected.get(found.value.type)]);if(found.value.getter){const def=definitions.get(key(found.cls.target,found.value.getter));return def?result(def):opaque();}
        const values=[];
        for(const row of rows)if(row.block.opcode==='arcade_setObjectField'&&fixed(row.target,row.block,'FIELD')===property){
            const receivers=input(row.target,row.block,'OBJECT');for(const receiver of receivers){const owner=receiver.startsWith('@')&&member(receiver.slice(1),property);if(owner?.cls===found.cls){values.push(input(row.target,row.block,'VALUE'));break;}}
        }
        return values.length?union(values):opaque();
    }
    function result(def){if(!def||bad.has(def)||bad.has(key(def.target,def.code)))return opaque();
        const visit=(id,path=new Set())=>{const block=blocks(def.target)[id];if(!block)return {values:[],complete:false};if(path.has(block))return {values:[opaque()],complete:false};path=new Set(path);path.add(block);
            if(block.opcode==='arcade_returnValue')return {values:[input(def.target,block,'VALUE')],complete:true};
            let values=[],complete=false;
            if(['control_if','control_if_else','control_repeat','control_repeat_until','control_forever'].includes(block.opcode)){
                const left=visit(block.inputs?.SUBSTACK?.[1],path);values.push(...left.values);
                if(block.opcode==='control_if_else'){const right=visit(block.inputs?.SUBSTACK2?.[1],path);values.push(...right.values);complete=left.complete&&right.complete;}
            }
            if(!complete&&block.next){const tail=visit(block.next,path);values.push(...tail.values);complete=tail.complete;}return {values,complete};
        };
        const proof=visit(def.block.next);
        for(const block of def.rows)if(block.opcode==='arcade_returnValue')proof.values.push(input(def.target,block,'VALUE'));
        if(!proof.complete)proof.values.push(new Set(['Undefined']));return union(proof.values);
    }
    const arrayAllocations=new Map();
    for(const row of rows)if(row.block.opcode==='arrays_createReference'){
        const identity='Array:'+project.targets.indexOf(row.target)+':'+locations.get(row.block).id;
        arrayAllocations.set(identity,row);
    }
    function arrayElements(target,block){
        const receivers=input(target,block,'ARRAY'),values=[];
        if(!receivers.size)return new Set();
        const actual=[...receivers].filter(value=>!['Undefined','Null'].includes(value));
        if(!actual.length)return opaque();
        for(const identity of actual){
            const allocation=arrayAllocations.get(identity);if(!allocation)return opaque();
            const initial=fixed(allocation.target,allocation.block,'VALUES');
            if(initial!==null){
                let parsed;try{parsed=JSON.parse(initial);}catch{return opaque();}
                if(!Array.isArray(parsed))return opaque();
                for(const item of parsed)values.push(new Set([item===null?'Null':typeof item==='number'?'Number':typeof item==='string'?'String':typeof item==='boolean'?'Boolean':'Opaque']));
            }else{
                let value=child(allocation.target,allocation.block,'VALUES');const seen=new Set();if(!value)return opaque();
                while(value?.opcode==='arrays_referenceValues'){
                    if(seen.has(value))return opaque();seen.add(value);values.push(input(allocation.target,value,'VALUE'));
                    if(fixed(allocation.target,value,'REST')==='[]'){value=null;break;}
                    value=child(allocation.target,value,'REST');if(!value)return opaque();
                }
                if(value)return opaque();
            }
            // A historical alias may have changed since a write. Use every
            // connected possible receiver producer, never its current heap value.
            for(const row of rows)if(row.block.opcode==='arrays_mutateReference'){
                const operation=fixed(row.target,row.block,'OP');
                if(!['push','unshift','insertAt','set','pop','shift','removeAt','removeElement','reverse','sort'].includes(operation))return opaque();
                const candidates=input(row.target,row.block,'ARRAY');
                if(!candidates.size)return new Set();
                if([...candidates].some(value=>!arrayAllocations.has(value)&&!['Undefined','Null'].includes(value)))return opaque();
                if(candidates.has(identity)&&['push','unshift','insertAt','set'].includes(operation))values.push(input(row.target,row.block,'VALUE'));
            }
        }
        return values.length?union(values):opaque();
    }
    function expression(target,block){if(cache.has(block))return cache.get(block);if(checking.has(block))return previous.get(block)||new Set();checking.add(block);let types;
        const owner=owned.get(block);if(!owner||bad.has(owner))types=opaque();else switch(block.opcode){
        case 'arrays_valueTruthy':case 'arrays_valueCompare':case 'operator_equals':case 'operator_lt':case 'operator_gt':case 'operator_and':case 'operator_or':case 'operator_not':types=new Set(['Boolean']);break;
        case 'math_number':case 'bw_numberLiteral':types=new Set(['Number']);break;
        case 'arrays_specialValue':{const kind=fixed(target,block,'KIND');types=kind==='undefined'?new Set(['Undefined']):kind==='null'?new Set(['Null']):opaque();break;}
        case 'arrays_createReference':types=new Set(['Array:'+project.targets.indexOf(target)+':'+locations.get(block).id]);break;
        case 'arrays_referenceItem':case 'arrays_referenceTake':case 'arrays_referenceRandom':types=arrayElements(target,block);break;
        case 'text':case 'bw_stringLiteral':types=new Set(['String']);break;
        case 'data_variable':types=variable(target,block.fields.VARIABLE?.[1]);break;
        case 'arcade_getLocal':types=local(target,block,fixed(target,block,'NAME'));break;
        case 'argument_reporter_string_number':case 'argument_reporter_boolean':types=local(target,block,block.fields.VALUE?.[0]);break;
        case 'arcade_createObject':{const cls=classes.get(fixed(target,block,'CLASS'));types=cls?new Set(['@'+cls.name]):opaque();break;}
        case 'arcade_objectField':{const receivers=input(target,block,'OBJECT'),values=[];for(const name of receivers)values.push(name.startsWith('@')?fieldValues(name.slice(1),fixed(target,block,'FIELD')):opaque());types=values.length?union(values):opaque();break;}
        case 'arcade_callFunction':case 'arcade_callObjectMethod':{const defs=destinations(target,block);types=defs.length?union(defs.map(def=>{const declared=methodOwners.get(def)?.result;return expected.has(declared)?new Set(['Constraint:'+expected.get(declared)]):result(def);})):opaque();break;}
        default:{
            if(block.opcode==='arrays_valueBinary'){
                const op=fixed(target,block,'OP'),left=input(target,block,'LEFT'),right=input(target,block,'RIGHT'),all=union([left,right]);
                if(!left.size||!right.size){types=new Set();break;}
                const numeric=[...all].every(type=>['Number','Constraint:Number','Boolean','Constraint:Boolean','Undefined','Null'].includes(type));
                if(['+','-','*','/','%','**','&','|','^','<<','>>','>>>'].includes(op)&&left.size&&right.size&&numeric)types=new Set([all.has('Constraint:Number')?'Constraint:Number':'Number']);
                else if(op==='+'&&left.size&&right.size&&[...all].every(type=>['String','Constraint:String','Number','Constraint:Number','Boolean','Constraint:Boolean','Undefined','Null'].includes(type))&&[...all].some(type=>type==='String'||type==='Constraint:String'))types=new Set(['String']);
                else types=opaque();break;
            }
            if(block.opcode==='arrays_valueUnary'){
                const op=fixed(target,block,'OP'),operand=input(target,block,'VALUE');if(!operand.size){types=new Set();break;}types=op==='!'?new Set(['Boolean']):['+','-','~'].includes(op)&&[...operand].every(type=>['Number','Constraint:Number','Undefined','Null'].includes(type))?new Set(['Number']):opaque();break;
            }
            const numericInputs={operator_add:['NUM1','NUM2'],operator_subtract:['NUM1','NUM2'],operator_multiply:['NUM1','NUM2'],operator_divide:['NUM1','NUM2'],operator_mod:['NUM1','NUM2']};
            if(numericInputs[block.opcode]){const operands=numericInputs[block.opcode].map(name=>input(target,block,name));if(operands.some(set=>!set.size)){types=new Set();break;}types=operands.every(set=>set.size>0&&[...set].every(type=>type==='Number'||type==='Constraint:Number'))?new Set([operands.some(set=>set.has('Constraint:Number'))?'Constraint:Number':'Number']):opaque();break;}
            // Reuse qualified current-project primitive rules, never annotation-seeded class cells.
            const where=locations.get(block),probe={inputs:{VALUE:[2,where.id]}};types=primitive.inputTypes(target,probe,'VALUE');
            if(!types.size||types.has('Opaque')){
                if(['operator_equals','operator_lt','operator_gt','operator_and','operator_or','operator_not'].includes(block.opcode))types=new Set(['Boolean']);
                else if(block.opcode==='operator_join')types=new Set(['String']);
                else types=opaque();
            }
        }}
        checking.delete(block);cache.set(block,types);return types;
    }
    // Calls can feed other calls without recursive execution (tap(tap(1))).
    // Solve the actual producer equations to a fixed point instead of treating
    // a temporarily revisited formal as an opaque producer. Empty cycles never
    // become source authority; concrete incompatible writers remain in unions.
    for(let round=0;round<=rows.length;round++){
        previous=cache;cache=new WeakMap();checking.clear();
        for(const row of rows)expression(row.target,row.block);
        if(rows.every(({block})=>{const a=cache.get(block),b=previous.get(block);return a&&b&&a.size===b.size&&[...a].every(value=>b.has(value));}))break;
        if(round===rows.length)fail('current producer graph does not converge');
    }
    const compatible=(actual,type)=>actual.size>0&&[...actual].every(value=>value===expected.get(type)||value==='Constraint:'+expected.get(type)||value==='Undefined'||value==='Null');
    const requireType=(actual,type,context)=>{if(expected.has(type)&&!compatible(actual,type))fail(context+' conflicts with declared '+type+' (actual '+[...actual].sort().join('|')+')');};
    for(const row of rows){const {target,block,owner}=row;if(bad.has(owner))continue;
        if(block.opcode==='arcade_setObjectField'){
            if(dynamicReceiver(target,block,true,false,methodOwners.get(owner)?.cls.name))continue;
            const name=fixed(target,block,'FIELD'),receivers=input(target,block,'OBJECT');
            if(name===null||!receivers.size||[...receivers].some(receiver=>!receiver.startsWith('@')||!classes.has(receiver.slice(1)))){fail('field writer requires an actual declared receiver and fixed property');continue;}
            for(const receiver of receivers){const found=receiver.startsWith('@')&&member(receiver.slice(1),name);if(!found||found.cls.intrinsic||found.value.valueKind==='callable')continue;
                requireType(input(target,block,'VALUE'),found.value.type,'field '+found.cls.name+'.'+name+' writer');}
        }
        if(['arcade_callFunction','arcade_createObject','arcade_callObjectMethod'].includes(block.opcode)&&!dynamicReceiver(target,block,false,block.opcode==='arcade_callObjectMethod',methodOwners.get(owner)?.cls.name))for(const def of destinations(target,block)){const meta=methodOwners.get(def),supplied=args(target,block);if(!meta||!supplied)continue;
            const offset=block.opcode==='arcade_callFunction'?1:0;meta.parameters.forEach((param,index)=>{const argument=supplied[index+offset];if(argument)requireType(input(argument.target,argument.block,argument.name),param.type,'argument '+meta.cls.name+'.'+def.code+'.'+param.name);});}
        if(block.opcode==='arcade_setLocal'){const meta=methodOwners.get(owner),name=fixed(target,block,'NAME'),index=owner.names?.indexOf(name),param=index>0?meta?.parameters[index-1]:null;if(param)requireType(input(target,block,'VALUE'),param.type,'formal '+meta.cls.name+'.'+name+' writer');}
    }
    for(const[def,meta]of methodOwners){
        for(const param of meta.parameters)if(Object.hasOwn(param,'default')){const value=param.default,type=value===null?'Null':typeof value==='number'?'Number':typeof value==='string'?'String':typeof value==='boolean'?'Boolean':'Opaque';requireType(new Set([type]),param.type,'default '+meta.cls.name+'.'+param.name);}
        if(bad.has(def))fail('class '+meta.cls.name+' procedure ownership is malformed');}
    for(const[def,meta]of methodOwners)if(expected.has(meta.result))requireType(result(def),meta.result,'result '+meta.cls.name+'.'+def.code);
    for(const message of diagnostics)note(message);
}
