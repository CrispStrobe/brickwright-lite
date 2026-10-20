// Private synchronous lowering observation, not a value/type certificate or
// reusable semantic cache. Existing public eager AST APIs do not call it.
// Own-data shape is not a non-Proxy proof: callers are the actual compiler's
// parser/lowering chain. Only its root procedure-prefix envelope is opaque.
const realm=globalThis,keys=Reflect.ownKeys,descriptor=Object.getOwnPropertyDescriptor;
const prototype=Object.getPrototypeOf,own=Object.hasOwn,same=Object.is,apply=Reflect.apply;
const array=Array.isArray,freeze=Object.freeze,extensible=Object.isExtensible;
const NativeSet=Set,setHas=Set.prototype.has,setAdd=Set.prototype.add,setDelete=Set.prototype.delete;
const objectPrototype=Object.prototype,arrayPrototype=Array.prototype;
const fields=['value','writable','get','set','enumerable','configurable'];
const sameDescriptor=(before,now)=>{
 if(!before||!now)return before===now;
 for(let i=0;i<fields.length;i++){const k=fields[i],present=own(before,k);if(present!==own(now,k)||present&&!same(before[k],now[k]))return false;}
 return true;
};
const rowFor=object=>{const names=keys(object),rows=[];for(let i=0;i<names.length;i++)rows[i]=descriptor(object,names[i]);return {object,parent:prototype(object),names,rows,extensible:extensible(object)};};
const rowCurrent=row=>{
 const names=keys(row.object);if(prototype(row.object)!==row.parent||extensible(row.object)!==row.extensible||names.length!==row.names.length)return false;
 for(let i=0;i<names.length;i++)if(names[i]!==row.names[i]||!sameDescriptor(row.rows[i],descriptor(row.object,names[i])))return false;
 return true;
};
// Exactly the realm operations used by the omitted source graph and its
// helpers, including native iteration and Number/text/regex observations.
const objects=[Object,Array,Map,Set,WeakMap,WeakSet,Reflect,Function,JSON,Number,String,
 RegExp,Symbol,Math,Boolean,Uint8Array,ArrayBuffer,DataView,Error,TypeError,RangeError,
 Object.prototype,Array.prototype,Map.prototype,Set.prototype,WeakMap.prototype,
 WeakSet.prototype,Function.prototype,Number.prototype,String.prototype,RegExp.prototype,
 Symbol.prototype,Boolean.prototype,Uint8Array.prototype,prototype(Uint8Array.prototype),
 ArrayBuffer.prototype,DataView.prototype,Error.prototype,TypeError.prototype,RangeError.prototype];
const add=object=>{for(let i=0;i<objects.length;i++)if(objects[i]===object)return;objects[objects.length]=object;};
const iterators=[apply(Array.prototype[Symbol.iterator],[],[]),apply(Map.prototype.entries,new Map(),[]),
 apply(Set.prototype.values,new Set(),[]),apply(String.prototype[Symbol.iterator],'',[])];
for(let i=0;i<iterators.length;i++){let p=prototype(iterators[i]);while(p!==null){add(p);p=prototype(p);}}
const intrinsicRows=[];for(let i=0;i<objects.length;i++)intrinsicRows[i]=rowFor(objects[i]);
const globals=['Object','Array','Map','Set','WeakMap','WeakSet','Reflect','Function','JSON','Number',
 'String','RegExp','Symbol','Math','Boolean','Uint8Array','ArrayBuffer','DataView','Error','TypeError',
 'RangeError','parseInt','parseFloat','isNaN','isFinite','globalThis'];
const globalRows=[];for(let i=0;i<globals.length;i++)globalRows[i]=descriptor(realm,globals[i]);
const realmCurrent=()=>{
 for(let i=0;i<intrinsicRows.length;i++)if(!rowCurrent(intrinsicRows[i]))return false;
 for(let i=0;i<globals.length;i++)if(!sameDescriptor(globalRows[i],descriptor(realm,globals[i])))return false;
 return true;
};

export function observeLoweringInput(program){
 let rows=[],expired=false;
 try{
  if(!realmCurrent()||!program||typeof program!=='object')return null;
  const kind=descriptor(program,'type'),body=descriptor(program,'body');
  if(!kind||!own(kind,'value')||kind.value!=='Program'||!body||!own(body,'value')||!array(body.value))return null;
  const metadataField=descriptor(program,'bwProcedureConstraintSource');let metadata=null,prefix=null;
  if(metadataField){
   if(!own(metadataField,'value')||!metadataField.enumerable)return null;metadata=metadataField.value;
   if(!metadata||typeof metadata!=='object'||prototype(metadata)!==objectPrototype)return null;
   const names=keys(metadata),field=descriptor(metadata,'prefix');
   if(names.length!==1||names[0]!=='prefix'||!field||!own(field,'value')||typeof field.value!=='function'||!field.enumerable)return null;
   // Actual original frozen metadata, or the ordinary clone produced by the
   // complete preceding lowerer. Other shapes keep the original eager route.
   if(!((!field.writable&&!field.configurable&&!extensible(metadata))||
       (field.writable&&field.configurable&&extensible(metadata))))return null;
   prefix=field.value;
  }
  const seen=new NativeSet(),active=new NativeSet(),pending=[{value:program,parent:null,key:null,depth:0,leave:false}];let slots=0;
  while(pending.length){
   const item=pending[pending.length-1];pending.length--;const value=item.value;
   if(value===null||typeof value!=='object'){
    if(typeof value==='function'){if(item.parent!==metadata||item.key!=='prefix'||value!==prefix)return null;}
    else if(typeof value==='symbol'||typeof value==='bigint')return null;
    continue;
   }
   if(item.leave){apply(setDelete,active,[value]);continue;}
   if(metadata&&value===metadata&&(item.parent!==program||item.key!=='bwProcedureConstraintSource'))return null;
   if(apply(setHas,active,[value]))return null;if(apply(setHas,seen,[value]))continue;
   if(item.depth>128||rows.length>=50000)return null;
   const p=prototype(value);if(p!==objectPrototype&&p!==arrayPrototype&&p!==null)return null;
   const row=rowFor(value);if((slots+=row.names.length)>500000)return null;
   apply(setAdd,seen,[value]);apply(setAdd,active,[value]);rows[rows.length]=row;
   pending[pending.length]={...item,leave:true};
   for(let i=row.names.length-1;i>=0;i--){const field=row.rows[i],name=row.names[i];
    if(typeof name!=='string'||!field||!own(field,'value'))return null;
    if(name==='type'&&(typeof field.value!=='string'||field.value==='ThrowStatement'||field.value==='Unknown'||field.value==='Opaque'))return null;
    pending[pending.length]={value:field.value,parent:value,key:name,depth:item.depth+1,leave:false};
   }
  }
  if(!realmCurrent())return null;
 }catch{return null;}
 return freeze({current(){
  if(expired)return false;
  try{if(!realmCurrent()){expired=true;return false;}for(let i=0;i<rows.length;i++)if(!rowCurrent(rows[i])){expired=true;return false;}if(!realmCurrent()){expired=true;return false;}return true;}catch{expired=true;return false;}
 }});
}
