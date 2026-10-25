import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

// Optional root-controlled artifacts supplement TAP. They never supply inputs,
// substitute a runtime value or relax assertions when capture is disabled.
const directory=process.env.BW_SCENE_CLOCK_NATIVE_EVIDENCE;
let index=0,retainedBytes=0;
if(directory)fs.mkdirSync(directory);
export function retain(label,value,binary=false) {
    if(!directory)return;
    const bytes=binary?Buffer.from(value):Buffer.from(JSON.stringify(value,(_key,v)=>v===undefined?{$undefined:true}:typeof v==='number'&&!Number.isFinite(v)?{$number:String(v)}:typeof v==='bigint'?{$bigint:String(v)}:v,2)+'\n');
    retainedBytes+=bytes.length;
    if(retainedBytes>64*1024**2)throw Error('Scene clock evidence: controller JSON/ZIP exceeds 64MiB');
    const name=String(index++).padStart(4,'0')+'-'+label.replace(/[^a-z0-9-]/gi,'-')+(binary?'.sb3':'.json');
    fs.writeFileSync(path.join(directory,name),bytes,{flag:'wx'});
}
export function channels(value) {
    const names=new Set(['warnings','errors','unparsed','unsupported','diagnostics','fetchRefusals','refused','netAttempts',...Object.keys(value||{}).filter(key=>/warn|error|unparsed|unsupported|diagnostic|refus|netattempt/i.test(key))]);
    return Object.fromEntries([...names].map(key=>{
        const provided=Object.hasOwn(value||{},key),actual=provided?value[key]:undefined;
        return[key,{provided,kind:!provided?'absent':actual===undefined?'undefined':actual===null?'null':Array.isArray(actual)?'array':typeof actual,...(provided?{value:actual}:{})}];
    }));
}
export function clean(value,required) {
    for(const key of required){assert.equal(Object.hasOwn(value,key),true,key+' is provided');assert.ok(Array.isArray(value[key]),key+' is an actual array');assert.deepEqual(value[key],[]);}
    for(const [key,channel]of Object.entries(channels(value)))if(channel.provided){assert.equal(channel.kind,'array',key+' unknown channel is not empty');assert.deepEqual(channel.value,[]);}
}
export const errorRecord=error=>({name:error?.name,message:error?.message,stack:error?.stack,channels:channels(error)});
export function actualData(value,seen=new Map(),references=new Map()) {
    if(references.has(value))return references.get(value);
    if(value===undefined)return{$undefined:true};
    if(value===null||typeof value==='string'||typeof value==='boolean')return value;
    if(typeof value==='number')return Number.isFinite(value)?value:{$number:String(value)};
    if(typeof value==='function')return{$function:Object.getOwnPropertyDescriptor(value,'name')?.value,length:Object.getOwnPropertyDescriptor(value,'length')?.value};
    if(typeof value==='symbol'||typeof value==='bigint')return{$type:typeof value,value:String(value)};
    if(seen.has(value))return{$ref:seen.get(value)};
    const id=seen.size+1;seen.set(value,id);
    if(ArrayBuffer.isView(value)){const bytes=Buffer.from(value.buffer,value.byteOffset,value.byteLength);return{$id:id,$typedArray:true,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),hex:bytes.toString('hex')};}
    if(value instanceof WeakMap||value instanceof WeakSet)return{$id:id,$opaqueWeakCollection:true,qualified:false};
    if(value instanceof Map)return{$id:id,$map:[...Map.prototype.entries.call(value)].map(([key,item])=>[actualData(key,seen,references),actualData(item,seen,references)])};
    if(value instanceof Set)return{$id:id,$set:[...Set.prototype.values.call(value)].map(item=>actualData(item,seen,references))};
    const properties={};
    for(const key of Reflect.ownKeys(value)){
        const descriptor=Object.getOwnPropertyDescriptor(value,key),name=typeof key==='symbol'?'[symbol '+String(key)+']':key;
        Object.defineProperty(properties,name,{value:Object.hasOwn(descriptor,'value')?actualData(descriptor.value,seen,references):{$accessor:true,notInvoked:true},enumerable:true,configurable:true,writable:true});
    }
    return{$id:id,$array:Array.isArray(value),properties};
}
export function captureCreator(label,creator,error) {
    retain(label+'-Creator',{channels:channels(creator),exception:error?errorRecord(error):null,project:creator.project});
}
