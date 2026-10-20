// Optional input observation for the private synchronous preparation demand.
// This is not a source/type/normal-completion certificate or a reusable cache.
const realm=globalThis,keys=Reflect.ownKeys,descriptor=Object.getOwnPropertyDescriptor;
const prototype=Object.getPrototypeOf,own=Object.hasOwn,same=Object.is,apply=Reflect.apply;
const array=Array.isArray,freeze=Object.freeze;
const NativeSet=Set,setHas=Set.prototype.has,setAdd=Set.prototype.add,setDelete=Set.prototype.delete;
const objectPrototype=Object.prototype,arrayPrototype=Array.prototype;
const rowFor=object=>{
    const names=keys(object),fields=[];
    for(let i=0;i<names.length;i++)fields[i]=descriptor(object,names[i]);
    return {object,parent:prototype(object),names,fields};
};
const rowCurrent=row=>{
    const names=keys(row.object);
    if(prototype(row.object)!==row.parent||names.length!==row.names.length)return false;
    for(let i=0;i<names.length;i++){
        if(names[i]!==row.names[i])return false;
        const before=row.fields[i],now=descriptor(row.object,names[i]);
        if(!now||now.enumerable!==before.enumerable||now.configurable!==before.configurable||
            own(now,'value')!==own(before,'value'))return false;
        if(own(before,'value')){
            if(now.writable!==before.writable||!same(now.value,before.value))return false;
        }else if(now.get!==before.get||now.set!==before.set)return false;
    }
    return true;
};
const intrinsics=[Object,Array,Map,Set,WeakMap,WeakSet,Reflect,Object.prototype,
    Array.prototype,Map.prototype,Set.prototype,WeakMap.prototype,WeakSet.prototype,
    Function.prototype,String.prototype];
const intrinsicRows=[];
for(let i=0;i<intrinsics.length;i++)intrinsicRows[i]=rowFor(intrinsics[i]);
const globalNames=['Object','Array','Map','Set','WeakMap','WeakSet','Reflect','globalThis'];
const globalFields=[];
for(let i=0;i<globalNames.length;i++)globalFields[i]=descriptor(realm,globalNames[i]);
const intrinsicsCurrent=()=>{
    for(let i=0;i<intrinsicRows.length;i++)if(!rowCurrent(intrinsicRows[i]))return false;
    for(let i=0;i<globalNames.length;i++){
        const before=globalFields[i],now=descriptor(realm,globalNames[i]);
        if(!now||!own(now,'value')||now.value!==before.value||now.enumerable!==before.enumerable||
            now.configurable!==before.configurable||now.writable!==before.writable)return false;
    }
    return true;
};

// Mint only at the actual translator's private preparation entry. Existing
// external low-level AST APIs never perform this optional descriptor walk.
export function declarationIdentityInput(program) {
    let rows=[],expired=false;
    try{
        if(!intrinsicsCurrent())return null;
        if(!program||typeof program!=='object')return null;
        const kind=descriptor(program,'type'),body=descriptor(program,'body');
        if(!kind||!own(kind,'value')||kind.value!=='Program'||!body||!own(body,'value')||!array(body.value))return null;
        const seen=new NativeSet(),active=new NativeSet();
        const pending=[{value:program,depth:0,leave:false}];let slots=0;
        while(pending.length){
            const item=pending[pending.length-1];pending.length--;
            const value=item.value;
            if(value===null||typeof value!=='object'){
                if(typeof value==='function'||typeof value==='symbol'||typeof value==='bigint')return null;
                continue;
            }
            if(item.leave){apply(setDelete,active,[value]);continue;}
            if(apply(setHas,active,[value]))return null;
            if(apply(setHas,seen,[value]))continue;
            if(item.depth>128||rows.length>=50000)return null;
            const parent=prototype(value);
            if(parent!==objectPrototype&&parent!==arrayPrototype&&parent!==null)return null;
            const row=rowFor(value);
            if((slots+=row.names.length)>500000)return null;
            apply(setAdd,seen,[value]);apply(setAdd,active,[value]);rows[rows.length]=row;
            pending[pending.length]={value,depth:item.depth,leave:true};
            for(let i=row.names.length-1;i>=0;i--){
                const field=row.fields[i],name=row.names[i];
                if(typeof name!=='string'||!field||!own(field,'value'))return null;
                // First candidate deliberately retains the complete original
                // exceptional bootstrap and all uncertain/malformed paths.
                if(name==='type'&&(typeof field.value!=='string'||
                    field.value==='ThrowStatement'||field.value==='Unknown'||field.value==='Opaque'))return null;
                pending[pending.length]={value:field.value,depth:item.depth+1,leave:false};
            }
        }
    }catch{return null;}
    return freeze({current(){
        if(expired)return false;
        try{
            if(!intrinsicsCurrent()){expired=true;return false;}
            for(let i=0;i<rows.length;i++)if(!rowCurrent(rows[i])){expired=true;return false;}
            return true;
        }catch{expired=true;return false;}
    }});
}
