// Data/identity observation only. No getter, user serializer or function runs.
// Opaque function/symbol values compare by exact identity; they grant no fact.
export function physicalUpdateSourceSnapshot(root) {
    const objects=[],opaque=[],seen=new Map(),active=new Set();let valid=true;
    const encode=value=>{
        if(value===null||['string','boolean','undefined'].includes(typeof value))return [typeof value,value];
        if(typeof value==='number')return ['number',!Number.isFinite(value)?String(value):Object.is(value,-0)?'-0':value];
        if(typeof value!=='object'){let i=opaque.indexOf(value);if(i<0){i=opaque.length;opaque.push(value);}return [typeof value,i];}
        if(seen.has(value)){if(active.has(value))valid=false;return ['ref',seen.get(value)];}
        const prototype=Object.getPrototypeOf(value);if(![Object.prototype,Array.prototype,null].includes(prototype)){valid=false;return null;}
        const i=objects.length;seen.set(value,i);objects.push(value);active.add(value);
        const fields=[];for(const key of Reflect.ownKeys(value)){
            const d=Object.getOwnPropertyDescriptor(value,key);
            if(typeof key!=='string'||!d||!Object.hasOwn(d,'value')){valid=false;continue;}
            fields.push([key,d.enumerable,d.configurable,d.writable,encode(d.value)]);
        }
        active.delete(value);return [Array.isArray(value)?'array':'object',prototype===null?'null':prototype===Array.prototype?'array-prototype':'object-prototype',i,fields];
    };
    const shape=JSON.stringify(encode(root));if(!valid)return null;
    const equal=(candidate,identity)=>{
        const other=physicalUpdateSourceSnapshot(candidate);if(!other||other.shape!==shape||other.opaque.length!==opaque.length||other.opaque.some((value,i)=>value!==opaque[i]))return false;
        return !identity||other.objects.length===objects.length&&other.objects.every((value,i)=>value===objects[i]);
    };
    return Object.freeze({shape,objects:Object.freeze(objects),opaque:Object.freeze(opaque),current:()=>equal(root,true),matches:candidate=>equal(candidate,false)});
}
