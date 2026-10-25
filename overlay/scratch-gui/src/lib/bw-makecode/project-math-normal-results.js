import {isProjectJsonSnapshot} from './project-json-snapshot.js';

// A normal-result fact for closed actual Number operands, not the declared
// output type or numeric socket. Variable/parameter/captured reads do not enroll.
const get=Object.getOwnPropertyDescriptor,keys=Reflect.ownKeys,proto=Object.getPrototypeOf;
const own=Object.hasOwn,isArray=Array.isArray,number=Number,finite=Number.isFinite;
const isSame=Object.is,realm=globalThis,aliases=[];
for(const name of ['Object','Array','Number','Reflect','String','Map','Set','WeakMap','WeakSet'])aliases[aliases.length]=[name,get(realm,name)];
const ambient=[];
for(const object of [Object,Array,Number,Reflect,String.prototype,Object.prototype,Array.prototype,
    Map.prototype,Set.prototype,WeakMap.prototype,WeakSet.prototype,proto([][Symbol.iterator]()),proto(new Map()[Symbol.iterator]()),proto(new Set()[Symbol.iterator]())]){
    const names=keys(object),rows=[];for(let i=0;i<names.length;i++)rows[i]=get(object,names[i]);
    ambient[ambient.length]={object,parent:proto(object),names,rows};
}
const same=(a,b)=>!!a&&!!b&&a.enumerable===b.enumerable&&a.configurable===b.configurable&&
    own(a,'value')===own(b,'value')&&(own(a,'value')?isSame(a.value,b.value)&&a.writable===b.writable:a.get===b.get&&a.set===b.set);
const ambientCurrent=()=>{
    for(let i=0;i<aliases.length;i++)if(!same(aliases[i][1],get(realm,aliases[i][0])))return false;
    for(let i=0;i<ambient.length;i++){
        const row=ambient[i],names=keys(row.object);
        if(proto(row.object)!==row.parent||names.length!==row.names.length)return false;
        for(let j=0;j<names.length;j++)if(names[j]!==row.names[j]||!same(get(row.object,names[j]),row.rows[j]))return false;
    }
    return true;
};
const denied=Object.freeze({current:()=>true,isNumberResult:()=>false});
const cache=new WeakMap(),weakGet=WeakMap.prototype.get,weakSet=WeakMap.prototype.set,apply=Reflect.apply;
const selectors=new Set(['min','max','atan2','randomRange']);
const arithmetic={operator_add:['NUM1','NUM2'],operator_subtract:['NUM1','NUM2'],
    operator_multiply:['NUM1','NUM2'],operator_divide:['NUM1','NUM2'],operator_mod:['NUM1','NUM2'],
    operator_round:['NUM'],operator_random:['FROM','TO']};
const numericShadows=new Set(['math_number','math_integer','math_whole_number','math_positive_number','math_angle']);
const exact=(object,names)=>!!object&&keys(object).length===names.length&&names.every(name=>own(object,name));
const field=(node,name)=>{const value=node.fields?.[name];return isArray(value)&&(value.length===1||value.length===2&&value[1]===null)?value[0]:null;};
const numericLiteral=value=>['number','string'].includes(typeof value)&&finite(number(value));

export function createProjectMathNormalResults(project){
    const previous=apply(weakGet,cache,[project]);if(previous)return previous;
    if(!ambientCurrent()||!isProjectJsonSnapshot(project))return denied;
    const owners=new WeakMap(),incoming=new Map();let expired=false;
    for(const target of project.targets||[]){
        const edges=new Map();incoming.set(target,edges);
        for(const [id,node]of Object.entries(target.blocks||{}))owners.set(node,{target,id});
        for(const [id,node]of Object.entries(target.blocks||{})){
            const add=(child,shadow,kind)=>{
                if(typeof child!=='string')return;
                if(!edges.has(child))edges.set(child,[]);edges.get(child).push({parent:id,shadow,kind});
            };
            add(node.next,false,'next');
            for(const slot of Object.values(node.inputs||{}))if(isArray(slot)){
                add(slot[1],slot[0]===1,'input');if(slot[0]===3)add(slot[2],true,'input');
            }
        }
    }
    const current=()=>{
        if(expired)return false;
        try{if(!ambientCurrent())expired=true;}catch(error){expired=true;throw error;}
        return !expired;
    };
    const physical=(target,node)=>{
        const seen=new Set();let value=node;
        while(value){
            const record=owners.get(value);if(!record||record.target!==target||seen.has(value))return false;seen.add(value);
            const edges=incoming.get(target).get(record.id)||[];
            if(value.parent==null)return value.topLevel===true&&value.shadow===false&&edges.length===0;
            if(value.topLevel!==false||edges.length!==1||edges[0].parent!==value.parent||edges[0].shadow!==value.shadow||value===node&&edges[0].kind!=='input')return false;
            value=target.blocks[value.parent];if(!value)return false;
        }
        return false;
    };
    const inputNumber=(target,node,name,active)=>{
        const slot=node.inputs?.[name];if(!isArray(slot)||![1,2,3].includes(slot[0])||slot.length!==(slot[0]===3?3:2))return false;
        const inline=value=>isArray(value)&&value.length===2&&[4,5,6,7,8].includes(value[0])&&numericLiteral(value[1]);
        if(slot[0]===3){
            const fallback=slot[2],shadow=typeof fallback==='string'&&target.blocks[fallback];
            if(!inline(fallback)&&!(shadow&&shadow.shadow===true&&numericShadows.has(shadow.opcode)&&
                shadow.parent===owners.get(node)?.id&&numberNode(target,shadow,active)))return false;
        }
        const value=slot[1];
        if(isArray(value))return slot[0]===1&&inline(value);
        const child=typeof value==='string'&&target.blocks[value];
        return !!child&&child.parent===owners.get(node)?.id&&numberNode(target,child,active);
    };
    const numberNode=(target,node,active=new Set())=>{
        if(!node||active.has(node)||active.size>128||node.next!=null||node.mutation!=null||!physical(target,node))return false;
        const next=new Set(active);next.add(node);
        if(numericShadows.has(node.opcode))return node.shadow===true&&exact(node.inputs,[])&&exact(node.fields,['NUM'])&&numericLiteral(field(node,'NUM'));
        if(node.opcode==='arrays_specialValue')return exact(node.inputs,[])&&exact(node.fields,['KIND'])&&['NaN','Infinity','-Infinity'].includes(field(node,'KIND'));
        if(node.opcode==='arcade_mathBinary')return exact(node.fields,['OP'])&&selectors.has(field(node,'OP'))&&exact(node.inputs,['A','B'])&&
            ['A','B'].every(name=>inputNumber(target,node,name,next));
        const inputs=own(arithmetic,node.opcode)&&arithmetic[node.opcode];
        return !!inputs&&exact(node.fields,[])&&exact(node.inputs,inputs)&&inputs.every(name=>inputNumber(target,node,name,next));
    };
    const facade=Object.freeze({current,isNumberResult(target,node){
        return current()&&node?.opcode==='arcade_mathBinary'&&numberNode(target,node);
    }});
    apply(weakSet,cache,[project,facade]);return facade;
}
