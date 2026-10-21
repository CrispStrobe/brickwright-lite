// A fresh immutable JSON data constructor, never caller-object enrollment.
const globalRoot=globalThis,jsonRoot=JSON,parse=JSON.parse,get=Object.getOwnPropertyDescriptor,own=Object.hasOwn,isArray=Array.isArray;
const globalJsonDescriptor=get(globalRoot,'JSON'),parseDescriptor=get(jsonRoot,'parse');
const create=Object.create,freeze=Object.freeze,keys=Reflect.ownKeys,apply=Reflect.apply;
const roots=new WeakSet(),add=WeakSet.prototype.add,has=WeakSet.prototype.has;
const sameDescriptor=(a,b)=>a&&b&&own(a,'value')&&own(b,'value')&&a.value===b.value&&
    a.writable===b.writable&&a.enumerable===b.enumerable&&a.configurable===b.configurable;
const parserCurrent=()=>sameDescriptor(get(globalRoot,'JSON'),globalJsonDescriptor)&&sameDescriptor(get(jsonRoot,'parse'),parseDescriptor);

/** Parse a primitive JSON string and freeze every descendant before publishing its root. */
export function createProjectJsonSnapshot(json){
    if(typeof json!=='string')throw new TypeError('Project JSON snapshot requires a primitive string');
    if(!parserCurrent())throw new Error('Project JSON parser changed');
    const root=parse(json);
    if(!root||typeof root!=='object'||isArray(root))throw new TypeError('Project JSON root must be an object');
    // A null-prototype private work list avoids inherited setters publishing
    // any parsed object before all descendants have been frozen.
    let pending=create(null);pending.value=root;pending.next=null;
    while(pending){
        const value=pending.value;pending=pending.next;
        const names=keys(value);
        for(let i=0;i<names.length;i++){
            const child=get(value,names[i]).value;
            if(child&&typeof child==='object'){
                const entry=create(null);entry.value=child;entry.next=pending;pending=entry;
            }
        }
        freeze(value);
    }
    if(!parserCurrent())throw new Error('Project JSON parser changed');
    apply(add,roots,[root]);
    return root;
}

/** Read-only origin query: caller objects cannot be registered by this API. */
export function isProjectJsonSnapshot(value){return apply(has,roots,[value]);}
