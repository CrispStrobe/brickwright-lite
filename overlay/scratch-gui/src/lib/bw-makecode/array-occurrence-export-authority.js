import {physicalUpdateSourceSnapshot} from './physical-update-source-snapshot.js';

// This profile never changes a cell-wide type or deletes a writer. It proves
// one receiver at one actual occurrence in a closed straight-line source entry.
const realm=globalThis,keys=Reflect.ownKeys,descriptor=Object.getOwnPropertyDescriptor,
    prototype=Object.getPrototypeOf,same=Object.is;
const intrinsicNames=['globalThis','Object','Array','Map','Set','WeakMap','WeakSet','JSON','Reflect','Number','String','Boolean','Function'];
const intrinsicRows=[];
for(let i=0;i<intrinsicNames.length;i++){
    const name=intrinsicNames[i],d=descriptor(realm,name);intrinsicRows.push({object:realm,key:name,descriptor:d});
    if(name==='globalThis')continue;
    for(const object of [d.value,d.value.prototype].filter(Boolean)){
        const own=keys(object);for(let j=0;j<own.length;j++)intrinsicRows.push({object,key:own[j],descriptor:descriptor(object,own[j])});
        intrinsicRows.push({object,own,prototype:prototype(object)});
    }
}
// for..of/spread and the descriptor snapshot also use iterator prototypes.
// Guard their complete actual chain, not only Symbol.iterator on the container.
for(const iterator of [[][Symbol.iterator](),new Map().entries(),new Set().values()]){
    let object=prototype(iterator);
    while(object&&object!==Object.prototype){
        const own=keys(object);for(let j=0;j<own.length;j++)intrinsicRows.push({object,key:own[j],descriptor:descriptor(object,own[j])});
        intrinsicRows.push({object,own,prototype:prototype(object)});object=prototype(object);
    }
}
const intrinsicsCurrent=()=>{
    for(let i=0;i<intrinsicRows.length;i++){
        const r=intrinsicRows[i];
        if(r.own){const current=keys(r.object);if(current.length!==r.own.length||prototype(r.object)!==r.prototype)return false;for(let j=0;j<current.length;j++)if(current[j]!==r.own[j])return false;}
        else {const a=descriptor(r.object,r.key),b=r.descriptor;if(!a||!b||a.enumerable!==b.enumerable||a.configurable!==b.configurable||a.writable!==b.writable||!same(a.value,b.value)||a.get!==b.get||a.set!==b.set)return false;}
    }
    return true;
};

export function createArrayOccurrenceExportAuthority(project,conservativeInput=()=>false){
    let expired=false,snapshot=null,facts=null;
    if(intrinsicsCurrent())snapshot=physicalUpdateSourceSnapshot(project);
    const observe=()=>{
        if(expired)return false;
        try{if(!snapshot||!intrinsicsCurrent()||!snapshot.current()||!intrinsicsCurrent())expired=true;}
        catch(error){expired=true;throw error;}
        return !expired;
    };
    if(observe())facts=build(project);
    const candidates=[];
    if(facts)for(const [target,map]of facts)for(const [node,names]of map)for(const name of names)
        if(!conservativeInput(target,node,name))candidates.push({target,node,name});
    const candidate=(target,node,name)=>{
        for(let i=0;i<candidates.length;i++){const r=candidates[i];if(r.target===target&&r.node===node&&r.name===name)return true;}
        return false;
    };
    // Refusal is sticky too; model construction may not be retried on an edited
    // graph through a retained policy. A fresh policy may independently reprove it.
    if(!facts)expired=true;
    return Object.freeze({observe,candidate,validateInput(target,node,name){
        if(!observe())return false;
        return candidate(target,node,name);
    }});
}

function build(project){
    const targets=project.targets;if(!Array.isArray(targets)||!targets.length)return null;
    // No other script/entry can run, even if its presently connected statements
    // look harmless. Unrecognised extension effects cannot install guest entries.
    if(!Array.isArray(project.extensions)||project.extensions.some(x=>!['arcade','arrays'].includes(x))||!project.extensions.includes('arcade')||!project.extensions.includes('arrays')||new Set(project.extensions).size!==project.extensions.length)return null;
    const all=new Map(),incoming=new Map(),globals=new Map(),seenIds=new Set();let owner=null,root=null;
    for(const target of targets){
        if(!target||Array.isArray(target)||typeof target.isStage!=='boolean'||!target.blocks||Array.isArray(target.blocks)||!target.variables||Array.isArray(target.variables))return null;
        for(const [id,row]of Object.entries(target.variables)){
            if(seenIds.has(id)||!Array.isArray(row)||row.length!==2||typeof row[0]!=='string'||Object.hasOwn(Object.prototype,row[0]))return null;
            seenIds.add(id);globals.set(id,{target,name:row[0],id});
        }
        const names=new Set();for(const row of Object.values(target.variables)){if(names.has(row[0]))return null;names.add(row[0]);}
        for(const [id,node]of Object.entries(target.blocks)){
            if(!node||Array.isArray(node)||typeof node.opcode!=='string'||!node.inputs||Array.isArray(node.inputs)||!node.fields||Array.isArray(node.fields)||typeof node.shadow!=='boolean'||typeof node.topLevel!=='boolean'||node.mutation!=null)return null;
            for(const [name,row]of Object.entries(node.fields))if(!Array.isArray(row)||row.length!==2||typeof row[0]!=='string'||(name==='VARIABLE'?typeof row[1]!=='string':row[1]!==null))return null;
            if(Object.hasOwn(Object.prototype,id))return null;
            const record={target,id,node};if(all.has(node))return null;all.set(node,record);
            if(node.topLevel){if(root||node.opcode!=='arcade_whenSourceStarts'||node.parent!==null||node.shadow!==false)return null;owner=target;root=node;}
        }
    }
    if(!root||targets.filter(t=>t.isStage===true).length!==1)return null;
    if(project.monitors!=null&&(!Array.isArray(project.monitors)||project.monitors.length))return null;
    if(project.extensionURLs!=null&&(typeof project.extensionURLs!=='object'||Array.isArray(project.extensionURLs)||Object.entries(project.extensionURLs).some(([id,url])=>id!=='arrays'||url!=='https://crispstrobe.github.io/extensions/CrispStrobe/arrays.js')))return null;
    const binding=(target,name,id)=>{
        const c=globals.get(id);if(!c||c.name!==name||c.target!==target&&c.target.isStage!==true)return null;
        if(c.target!==target&&Object.values(target.variables).some(r=>r[0]===name))return null;return c;
    };
    const schema=(n,inputs,fields=[])=>Object.keys(n.inputs).sort().join('|')===[...inputs].sort().join('|')&&Object.keys(n.fields).sort().join('|')===[...fields].sort().join('|');
    for(const {target,id,node}of all.values()){
        if(target!==owner)return null;
        for(const slot of Object.values(node.inputs)){
            if(!Array.isArray(slot)||![1,2,3].includes(slot[0])||slot.length!==(slot[0]===3?3:2))return null;
            for(let i=1;i<slot.length;i++){
                const edge=slot[i];
                if(typeof edge==='string'){
                    const child=target.blocks[edge];if(!child||child.parent!==id)return null;
                    incoming.set(child,(incoming.get(child)||0)+1);
                    if((i===2||slot[0]===1)&&(!child.shadow||child.next||Object.keys(child.inputs).length))return null;
                }else if(!Array.isArray(edge)||edge.length!==2&&edge.length!==3||
                    ![4,5,6,7,8,9,10,12].includes(edge[0])||typeof edge[1]!=='string'||
                    (edge[0]===12?i!==1||slot[0]!==3||edge.length!==3||!binding(target,edge[1],edge[2]):edge.length!==2))return null;
            }
        }
        if(node.next!==null){if(typeof node.next!=='string'||!target.blocks[node.next]||target.blocks[node.next].parent!==id)return null;incoming.set(target.blocks[node.next],(incoming.get(target.blocks[node.next])||0)+1);}
    }
    for(const {node}of all.values())if(node!==root&&(incoming.get(node)!==1||node.topLevel))return null;
    if(incoming.has(root)||!schema(root,[]))return null;
    const env=new Map(),locals=new Map(),visited=new Set([root]),facts=new Map(),arrayDependencies=new Set(),establishedArrays=new Set();
    const scalar=Object.freeze({kind:'scalar'}),unknown=Object.freeze({kind:'unknown'});
    const local=name=>{if(typeof name!=='string'||Object.hasOwn(Object.prototype,name))return null;if(!locals.has(name))locals.set(name,{});return locals.get(name);};
    const row=(n,name)=>n.inputs[name]?.[1];
    const text=(n,name)=>{const r=row(n,name);if(Array.isArray(r))return r[0]===10?r[1]:null;const b=owner.blocks[r];return b?.shadow&&b.opcode==='text'&&schema(b,[],['TEXT'])?b.fields.TEXT?.[0]:null;};
    const field=(n,name,choices)=>{const r=n.fields[name];return Array.isArray(r)&&r.length===2&&r[1]===null&&choices.includes(r[0])?r[0]:null;};
    const readCell=c=>{const v=env.get(c)||unknown;if(v.kind==='array')arrayDependencies.add(c);return v;};
    const assign=(c,value)=>{
        // A later scalar writer is a retained incompatibility even if another
        // Array write restores the terminal value. Never forget that history.
        if(establishedArrays.has(c)&&value.kind!=='array')return false;
        if(value.kind==='array')establishedArrays.add(c);env.set(c,value);return true;
    };
    // Fallback text/number shadows cannot become unvisited writer routes.
    for(const {node}of all.values())for(const slot of Object.values(node.inputs))if(slot.length===3&&typeof slot[2]==='string'){
        const b=owner.blocks[slot[2]];if(!b?.shadow||!(b.opcode==='math_number'&&schema(b,[],['NUM'])&&typeof b.fields.NUM?.[0]==='string'||b.opcode==='text'&&schema(b,[],['TEXT'])&&typeof b.fields.TEXT?.[0]==='string'))return null;visited.add(b);
    }
    const input=(n,name)=>{
        const r=row(n,name);
        if(Array.isArray(r)){
            if(r[0]===12){const c=binding(owner,r[1],r[2]);if(!c)return null;return readCell(c);}
            return [4,5,6,7,8,9,10].includes(r[0])?scalar:null;
        }
        return expression(owner.blocks[r]);
    };
    const fact=(node,name,value)=>{
        if(value?.kind!=='array')return false;
        if(!facts.has(owner))facts.set(owner,new Map());const map=facts.get(owner);if(!map.has(node))map.set(node,new Set());map.get(node).add(name);return true;
    };
    const primitive=value=>value===scalar;
    const usable=value=>primitive(value)||value?.kind==='array';
    function expression(n){
        if(!n||visited.has(n)||n.next!==null)return null;visited.add(n);
        if(n.shadow){if(n.opcode==='math_number'&&schema(n,[],['NUM'])&&typeof n.fields.NUM?.[0]==='string')return scalar;if(n.opcode==='text'&&schema(n,[],['TEXT'])&&typeof n.fields.TEXT?.[0]==='string')return scalar;return null;}
        if(n.opcode==='data_variable'&&schema(n,[],['VARIABLE'])){
            const r=n.fields.VARIABLE,c=Array.isArray(r)&&r.length===2&&binding(owner,r[0],r[1]);if(!c)return null;return readCell(c);
        }
        if(n.opcode==='arcade_getLocal'&&schema(n,['NAME'])){const name=text(n,'NAME'),c=local(name);if(!c)return null;if(!consumeName(n))return null;return readCell(c);}
        if(n.opcode==='arrays_specialValue'&&schema(n,[],['KIND'])&&field(n,'KIND',['null','undefined']))return scalar;
        const binary={operator_add:['NUM1','NUM2'],operator_subtract:['NUM1','NUM2'],operator_multiply:['NUM1','NUM2'],operator_divide:['NUM1','NUM2'],operator_mod:['NUM1','NUM2']};
        if(binary[n.opcode]&&schema(n,binary[n.opcode])&&binary[n.opcode].every(k=>primitive(input(n,k))))return scalar;
        if(n.opcode==='arrays_valueBinary'&&schema(n,['LEFT','RIGHT'],['OP'])&&field(n,'OP',['+','-','*','/','%','**','&','|','^','<<','>>','>>>'])&&usable(input(n,'LEFT'))&&usable(input(n,'RIGHT')))return scalar;
        if(n.opcode==='arrays_valueUnary'&&schema(n,['VALUE'],['OP'])&&field(n,'OP',['+','-','~'])&&usable(input(n,'VALUE')))return scalar;
        if(n.opcode==='arrays_valueCompare'&&schema(n,['LEFT','RIGHT'],['OP'])&&field(n,'OP',['===','!==','==','!=','<','<=','>','>='])&&usable(input(n,'LEFT'))&&usable(input(n,'RIGHT')))return scalar;
        if(n.opcode==='arrays_valueTruthy'&&schema(n,['VALUE'])&&usable(input(n,'VALUE')))return scalar;
        if(n.opcode==='arrays_createReference'&&schema(n,['VALUES'])){
            // Only actual JSON primitive element bodies, never an annotation or
            // a made-up allocation. Expression-list/nested bodies keep old rules.
            const raw=text(n,'VALUES');if(typeof raw!=='string')return null;let values;try{values=JSON.parse(raw);}catch{return null;}
            if(!Array.isArray(values)||values.some(v=>v!==null&&!['number','string','boolean'].includes(typeof v)))return null;
            if(!consumeName(n,'VALUES'))return null;return {kind:'array',site:n};
        }
        if(n.opcode==='arrays_referenceLength'&&schema(n,['ARRAY'])){const a=input(n,'ARRAY');return fact(n,'ARRAY',a)?scalar:null;}
        if(n.opcode==='arrays_referenceItem'&&schema(n,['ARRAY','INDEX'])){
            const a=input(n,'ARRAY'),i=input(n,'INDEX');return fact(n,'ARRAY',a)&&primitive(i)?scalar:null;
        }
        return null;
    }
    // Literal name/value shadows are physical children too, even though their
    // values are metadata rather than executable receivers.
    function consumeName(n,name='NAME'){
        const r=row(n,name);if(typeof r==='string'){const child=owner.blocks[r];if(!child||visited.has(child))return false;visited.add(child);}
        return true;
    }
    let id=root.next,declarationsOpen=true;const declared=new Set();
    while(id){
        const n=owner.blocks[id];if(!n||visited.has(n)||n.shadow||n.topLevel)return null;visited.add(n);
        if(n.opcode!=='arcade_declareSourceScalar')declarationsOpen=false;
        if(n.opcode==='data_setvariableto'&&schema(n,['VALUE'],['VARIABLE'])){
            const r=n.fields.VARIABLE,c=Array.isArray(r)&&r.length===2&&binding(owner,r[0],r[1]);if(!c)return null;
            const value=input(n,'VALUE');if(!usable(value)||!assign(c,value))return null;
        }else if(n.opcode==='arcade_setLocal'&&schema(n,['NAME','VALUE'])){
            const c=local(text(n,'NAME'));if(!c)return null;if(!consumeName(n))return null;const value=input(n,'VALUE');if(!usable(value)||!assign(c,value))return null;
        }else if(n.opcode==='arrays_mutateReference'&&schema(n,['ARRAY','OP','INDEX','VALUE'])&&text(n,'OP')==='push'){
            const a=input(n,'ARRAY'),i=input(n,'INDEX'),v=input(n,'VALUE');if(!consumeName(n,'OP'))return null;if(!fact(n,'ARRAY',a)||!primitive(i)||!primitive(v))return null;
        }else if(n.opcode==='arcade_declareSourceScalar'&&schema(n,['VARIABLE'],['TYPE'])&&field(n,'TYPE',['Number','String','Boolean'])){
            const r=row(n,'VARIABLE');if(!declarationsOpen||!Array.isArray(r)||r[0]!==12||!binding(owner,r[1],r[2])||declared.has(r[2]))return null;declared.add(r[2]);
        }else if(n.opcode==='looks_hide'&&schema(n,[])){
            // Visibility changes have no guest entries in this complete one-hat
            // project. External privileged JS observers are not guest scripts.
        }else return null;
        id=n.next;
    }
    // Every physical block is connected to this evaluated entry: no omitted
    // writer, hidden callback/procedure, foreign target or orphan reporter.
    if(visited.size!==all.size)return null;
    // Preserve the conservative refusal of later incompatible writes. Occurrence
    // transfer never hides a possible future scalar writer behind a saved alias.
    for(const c of arrayDependencies)if(env.get(c)?.kind!=='array')return null;
    return facts;
}
