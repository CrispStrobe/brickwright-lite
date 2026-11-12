import {isProjectJsonSnapshot} from './project-json-snapshot.js';
import {createOrdinaryExportSymbols} from './ordinary-export-symbols.js';

// Execution nonreachability only. This module never supplies value domains,
// Array allocations, initialized reads or a replacement procedure body.
const descriptor=Object.getOwnPropertyDescriptor,own=Object.hasOwn,keys=Reflect.ownKeys;
const prototype=Object.getPrototypeOf,isArray=Array.isArray,parse=JSON.parse;
const same=(a,b)=>!!a&&!!b&&a.enumerable===b.enumerable&&a.configurable===b.configurable&&
    own(a,'value')===own(b,'value')&&(own(a,'value')?a.value===b.value&&a.writable===b.writable:
        a.get===b.get&&a.set===b.set);
const ambient=[];
for(const object of [Object,Array,JSON,Reflect,String.prototype,RegExp.prototype,
    Object.prototype,Array.prototype,Map.prototype,Set.prototype,WeakMap.prototype,WeakSet.prototype,
    prototype([][Symbol.iterator]()),prototype(new Map()[Symbol.iterator]()),prototype(new Set()[Symbol.iterator]())]){
    const names=keys(object),entries=[];
    for(let i=0;i<names.length;i++)entries[i]=[names[i],descriptor(object,names[i])];
    ambient[ambient.length]={object,parent:prototype(object),entries};
}
const ambientCurrent=()=>{
    for(let i=0;i<ambient.length;i++){
        const row=ambient[i],names=keys(row.object);
        if(prototype(row.object)!==row.parent||names.length!==row.entries.length)return false;
        for(let j=0;j<names.length;j++)if(names[j]!==row.entries[j][0]||!same(descriptor(row.object,names[j]),row.entries[j][1]))return false;
    }
    return true;
};
const denied=Object.freeze({current:()=>true,isUnreachable:()=>false});
const issued=new WeakMap();
const cache=new WeakMap(),weakGet=WeakMap.prototype.get,weakSet=WeakMap.prototype.set,apply=Reflect.apply;
// Closed first slice: no extension-defined execution or function-value bridge.
const opcodes=new Set(('procedures_definition procedures_prototype procedures_call '+
    'argument_reporter_string_number argument_reporter_boolean text math_number math_integer '+
    'math_whole_number math_positive_number math_angle logic_boolean colour_picker '+
    'event_whenflagclicked event_whenkeypressed event_whenbroadcastreceived event_broadcast event_broadcastandwait '+
    'looks_hide looks_show control_wait control_repeat control_repeat_until control_forever '+
    'control_if control_if_else control_stop control_while control_for_each '+
    'data_variable data_setvariableto data_changevariableby '+
    'operator_add operator_subtract operator_multiply operator_divide operator_mod operator_random '+
    'operator_round operator_mathop operator_equals operator_lt operator_gt operator_and operator_or operator_not '+
    'operator_join operator_letter_of operator_length operator_contains '+
    'arcade_whenSourceStarts arcade_callFunction arcade_functionArgument arcade_declareParameterConstraint '+
    'arcade_declareSourceScalar arcade_declareSourceReference '+
    'arcade_getLocal arcade_setLocal arcade_returnValue arcade_log arcade_splash '+
    'arcade_screenImage arcade_mutateImage arcade_drawImage arcade_setImagePixel arcade_sourceWhile arcade_mathBinary '+
    'arcade_sourceValueBinary arcade_sourceValueUnary arcade_spriteProperty '+
    'arrays_specialValue arrays_valueBinary arrays_valueUnary arrays_valueCompare arrays_valueTruthy '+
    'arrays_createReference arrays_referenceValues arrays_referenceItem arrays_referenceLength '+
    'arrays_referenceTruthy arrays_mutateReference arrays_referenceTake arrays_referenceRemove '+
    'arrays_referenceRandom arrays_referenceSlice arrays_referenceConcat arrays_referenceIndexOf '+
    'arrays_namedReference arrays_createEmpty arrays_create1D arrays_create2D arrays_createZeros '+
    'arrays_range arrays_length arrays_get arrays_set arrays_push arrays_delete').split(' '));
const list=value=>{try{const result=parse(value);return isArray(result)?result:null;}catch{return null;}};
const text=(target,node,name)=>{
    const slot=node.inputs?.[name]?.[1];
    if(isArray(slot)&&slot.length===2&&slot[0]===10&&typeof slot[1]==='string')return slot[1];
    const child=typeof slot==='string'&&target.blocks[slot];
    return child?.opcode==='text'&&child.shadow===true&&typeof child.fields?.TEXT?.[0]==='string'?child.fields.TEXT[0]:null;
};
const primitive=value=>isArray(value)&&(
    value.length===2&&[4,5,6,7,8,9,10].includes(value[0])&&['string','number'].includes(typeof value[1])||
    value.length===3&&[11,12,13].includes(value[0])&&typeof value[1]==='string'&&typeof value[2]==='string');

/** Only this constructor can issue a proof; arbitrary objects cannot enroll. */
export function createClosedOrdinaryProjectEntry(project){
    const previous=apply(weakGet,cache,[project]);
    if(previous){previous.current();return previous;}
    if(!ambientCurrent()||!isProjectJsonSnapshot(project)||!isArray(project.targets))return denied;
    const finish=proof=>{apply(weakSet,cache,[project,proof]);return proof;};
    const owners=new WeakMap(),procedures=new Map(),roots=[],records=[];
    let invalid=false,expired=false;
    const symbols=createOrdinaryExportSymbols(project,()=>{invalid=true;});
    const current=()=>{
        if(expired)return false;
        // Project descendants are frozen, but symbol hygiene also depends on
        // the mutable SDK name suppliers. Preserve that receipt after entry.
        try{if(!ambientCurrent()||!symbols.sdkNamesCurrent())expired=true;}
        catch(error){expired=true;throw error;}
        return !expired;
    };
    for(const target of project.targets){
        const blocks=target.blocks;
        if(!blocks||typeof blocks!=='object'||isArray(blocks)){invalid=true;break;}
        const table=new Map();procedures.set(target,table);
        for(const [id,node]of Object.entries(blocks))if(node.topLevel===true){
            if(node.parent!=null||node.shadow!==false){invalid=true;continue;}
            const scope={target,node,id,procedure:null,edges:[],reachable:false};
            roots.push(scope);
            if(node.opcode==='procedures_definition'){
                const proto=blocks[node.inputs?.custom_block?.[1]],code=proto?.mutation?.proccode;
                if(typeof code!=='string'||!symbols.name(target,code)||table.has(code)){invalid=true;continue;}
                scope.procedure=code;scope.ids=list(proto.mutation.argumentids);scope.names=list(proto.mutation.argumentnames);
                if(!scope.ids||!scope.names||scope.ids.length!==scope.names.length){invalid=true;continue;}
                table.set(code,scope);
            }
        }
        const visit=(id,scope,parent=null,path=new Set())=>{
            const node=typeof id==='string'&&blocks[id];
            if(!node||path.has(node)||owners.has(node)||node.parent!==parent&&!(parent===null&&node.parent==null)){
                invalid=true;return;
            }
            if(parent!==null&&node.topLevel!==false){invalid=true;return;}
            if(typeof node.shadow!=='boolean'||node.shadow&&node.next!=null){invalid=true;return;}
            owners.set(node,scope);records.push({target,node,scope});
            const next=new Set(path);next.add(node);
            for(const slot of Object.values(node.inputs||{})){
                if(!isArray(slot)||![1,2,3].includes(slot[0])||slot.length!==(slot[0]===3?3:2)){invalid=true;continue;}
                for(let i=1;i<slot.length;i++){
                    if(typeof slot[i]==='string'){
                        const child=blocks[slot[i]],shadow=i===2||slot[0]===1;
                        if(child?.shadow!==shadow)invalid=true;
                        visit(slot[i],scope,id,next);
                    }else if(!primitive(slot[i]))invalid=true;
                }
            }
            if(node.next!=null){
                if(blocks[node.next]?.shadow!==false)invalid=true;
                visit(node.next,scope,id,next);
            }
        };
        for(const scope of roots)if(scope.target===target)visit(scope.id,scope);
        for(const node of Object.values(blocks))if(!owners.has(node))invalid=true;
    }
    for(const {target,node,scope}of records){
        if(!opcodes.has(node.opcode))invalid=true;
        // A fixed built-in flags read cannot register or dispatch a procedure.
        // Keep dynamic/foreign property shapes outside this closed entry slice.
        if(node.opcode==='arcade_spriteProperty'&&(
            node.mutation!=null||Object.keys(node.inputs||{}).join(',')!=='ID'||
            Object.keys(node.fields||{}).join(',')!=='PROPERTY'||
            !isArray(node.fields.PROPERTY)||node.fields.PROPERTY[0]!=='flags'||
            !(node.fields.PROPERTY.length===1||node.fields.PROPERTY.length===2&&node.fields.PROPERTY[1]===null)))invalid=true;
        // The first slice deliberately has no callable/class/capture bridge.
        // Those entries retain the previous checks, including in unused bodies.
        if(/^(arcade_(?:.*Callable|.*Captured|.*Object|.*Class|startParallel|pushScene|popScene)|procedures_callreturn)/.test(node.opcode))invalid=true;
        if(!['procedures_call','arcade_callFunction'].includes(node.opcode))continue;
        if(node.shadow!==false){invalid=true;continue;}
        const code=node.opcode==='procedures_call'?node.mutation?.proccode:text(target,node,'NAME');
        const callee=procedures.get(target)?.get(code);
        if(!callee||!symbols.call(target,node)){invalid=true;continue;}
        if(node.opcode==='arcade_callFunction'){
            let slot=node.inputs.ARGS?.[1],count=0;
            while(typeof slot==='string'&&target.blocks[slot]?.opcode==='arcade_functionArgument'){
                count++;slot=target.blocks[slot].inputs.REST?.[1];
                if(count>Object.keys(target.blocks).length){invalid=true;break;}
            }
            if(count!==callee.names.length)invalid=true;
        }
        scope.edges.push(callee);
    }
    if(invalid||!symbols.current()||!current())return finish(denied);
    const queue=[];
    for(const scope of roots)if(scope.procedure===null){scope.reachable=true;queue.push(scope);}
    for(let i=0;i<queue.length;i++)for(const callee of queue[i].edges)if(!callee.reachable){callee.reachable=true;queue.push(callee);}
    const facade=Object.freeze({current,isUnreachable(target,node){
        if(!current())return false;
        const scope=owners.get(node);
        return !!scope&&scope.target===target&&scope.procedure!==null&&!scope.reachable;
    }});
    apply(weakSet,issued,[facade,{project}]);return finish(facade);
}

export function closedOrdinaryProjectEntryFor(project,facade){
    return apply(weakGet,issued,[facade])?.project===project&&facade.current()?facade:null;
}
