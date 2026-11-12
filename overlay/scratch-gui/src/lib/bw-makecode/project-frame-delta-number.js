import {isProjectJsonSnapshot} from './project-json-snapshot.js';
import {createProjectMathNormalResults,projectMathEnvironmentFor} from './project-math-normal-results.js';

// Reuse the captured project environment, not its independent math-result
// facts. A saved reporter's schema is not an actual VM completion receipt.
const apply=Reflect.apply,get=WeakMap.prototype.get,put=WeakMap.prototype.set;
const cache=new WeakMap(),denied=Object.freeze({current:()=>true,isNumberResult:()=>false});

// Expression-shape validation also serves the legacy live export path. It does
// not issue a Number fact; that needs the owned immutable document below.
export function currentFrameDeltaReporter(blocks,block){
    if(!block||block.opcode!=='arcade_frameDeltaTime')return false;
    const ids=Object.keys(blocks||{}).filter(id=>blocks[id]===block),id=ids[0],parent=id&&blocks[block.parent],uses=[];
    const empty=value=>!!value&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===0;
    for(const node of Object.values(blocks||{})){
        if(node.next===id)return false;
        for(const slot of Object.values(node.inputs||{}))if(Array.isArray(slot))
            for(let index=1;index<slot.length;index++)if(slot[index]===id)uses.push({node,index,slot});
    }
    if(ids.length!==1||block.shadow!==false||block.topLevel!==false||block.next!=null||block.mutation!=null||
        !empty(block.fields)||!empty(block.inputs)||!parent||uses.length!==1||uses[0].node!==parent||uses[0].index!==1)return false;
    if(Object.keys(blocks).filter(key=>blocks[key]===parent).length!==1)return false;
    const slot=uses[0].slot;
    if(slot[0]===2)return slot.length===2;
    if(slot[0]!==3||slot.length!==3)return false;
    const fallback=slot[2];
    if(Array.isArray(fallback))return fallback.length===2&&Number.isInteger(fallback[0])&&fallback[0]>=4&&fallback[0]<=10&&
        (typeof fallback[1]==='string'||fallback[0]<=8&&typeof fallback[1]==='number'&&Number.isFinite(fallback[1]));
    if(typeof fallback!=='string'||fallback===id)return false;
    const shadow=blocks[fallback];
    if(!shadow||Object.keys(blocks).filter(key=>blocks[key]===shadow).length!==1||shadow.shadow!==true||shadow.topLevel!==false||
        shadow.parent!==block.parent||shadow.next!=null||shadow.mutation!=null||!empty(shadow.inputs))return false;
    const fields={math_number:'NUM',math_positive_number:'NUM',math_whole_number:'NUM',math_integer:'NUM',math_angle:'NUM',colour_picker:'COLOUR',text:'TEXT'};
    const field=Object.hasOwn(fields,shadow.opcode)&&fields[shadow.opcode],value=shadow.fields?.[field];
    if(!field||Object.keys(shadow.fields||{}).length!==1||!Array.isArray(value)||![1,2].includes(value.length)||
        value.length===2&&value[1]!==null||!(typeof value[0]==='string'||field==='NUM'&&typeof value[0]==='number'&&Number.isFinite(value[0])))return false;
    const found=[];for(const node of Object.values(blocks)){
        if(node.next===fallback)return false;
        for(const input of Object.values(node.inputs||{}))if(Array.isArray(input))
            for(let index=1;index<input.length;index++)if(input[index]===fallback)found.push({node,index,input});
    }
    return found.length===1&&found[0].node===parent&&found[0].index===2&&found[0].input===slot;
}

export function createProjectFrameDeltaNumber(project){
    const saved=apply(get,cache,[project]);if(saved)return saved;
    if(!isProjectJsonSnapshot(project))return denied;
    const environment=createProjectMathNormalResults(project);
    if(!projectMathEnvironmentFor(project,environment))return denied;
    const owners=new WeakMap(),incoming=new Map();
    for(const target of project.targets||[]){
        const edges=new Map();incoming.set(target,edges);
        for(const [id,node]of Object.entries(target.blocks||{}))owners.set(node,{target,id});
        for(const [id,node]of Object.entries(target.blocks||{})){
            const edge=(child,shadow,kind)=>{
                if(typeof child!=='string')return;
                if(!edges.has(child))edges.set(child,[]);
                edges.get(child).push({parent:id,shadow,kind});
            };
            edge(node.next,false,'next');
            for(const slot of Object.values(node.inputs||{}))if(Array.isArray(slot)){
                edge(slot[1],slot[0]===1,'input');
                if(slot[0]===3)edge(slot[2],true,'input');
            }
        }
    }
    const empty=value=>!!value&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===0;
    const physical=(target,node)=>{
        const seen=new Set();let value=node;
        while(value){
            const row=owners.get(value);
            if(!row||row.target!==target||seen.has(value))return false;
            seen.add(value);const edges=incoming.get(target).get(row.id)||[];
            if(value.parent==null)return value.topLevel===true&&value.shadow===false&&edges.length===0;
            if(value.topLevel!==false||edges.length!==1||edges[0].parent!==value.parent||
                edges[0].shadow!==value.shadow||value===node&&edges[0].kind!=='input')return false;
            value=target.blocks[value.parent];if(!value)return false;
        }
        return false;
    };
    const current=()=>environment.current();
    const facade=Object.freeze({current,isNumberResult(target,node){
        if(!current())return false;
        const row=owners.get(node);
        return !!row&&row.target===target&&node.opcode==='arcade_frameDeltaTime'&&node.shadow===false&&
            node.next==null&&node.mutation==null&&empty(node.fields)&&empty(node.inputs)&&
            currentFrameDeltaReporter(target.blocks,node)&&physical(target,node);
    }});
    apply(put,cache,[project,facade]);return facade;
}
