import {imageAbiModelQuery} from './object-class-export.js';
import {SDK_DIALOG_CLASS_NODES} from './sdk-class-descriptors.js';

// This proof selects a type context at one actual emitted consumer. Its private
// tokens are not Image, class, value or initialization certificates for callers.
const get=Object.getOwnPropertyDescriptor,keys=Reflect.ownKeys,proto=Object.getPrototypeOf,own=Object.hasOwn;
const isArray=Array.isArray,is=Object.is;
const same=(a,b)=>!!a&&!!b&&a.enumerable===b.enumerable&&a.configurable===b.configurable&&
    own(a,'value')===own(b,'value')&&(own(a,'value')?is(a.value,b.value)&&a.writable===b.writable:a.get===b.get&&a.set===b.set);
const prototypes=[];
for(const object of [Object.prototype,Array.prototype,Map.prototype,WeakMap.prototype,WeakSet.prototype]){
    const names=keys(object),entries=[];for(let i=0;i<names.length;i++)entries[i]=[names[i],get(object,names[i])];
    prototypes[prototypes.length]={object,parent:proto(object),entries};
}
const ambient=()=>{
    for(let i=0;i<prototypes.length;i++){
        const row=prototypes[i],names=keys(row.object);
        if(proto(row.object)!==row.parent||names.length!==row.entries.length)return false;
        for(let j=0;j<names.length;j++)if(names[j]!==row.entries[j][0]||!same(get(row.object,names[j]),row.entries[j][1]))return false;
    }
    return true;
};
const capture=root=>{
    const rows=[],seen=new WeakSet(),active=new WeakSet();let valid=true;
    const visit=value=>{
        if(!value||typeof value!=='object')return;
        if(active.has(value)||rows.length>=100000){valid=false;return;}if(seen.has(value))return;
        const parent=proto(value);if(parent!==(isArray(value)?Array.prototype:Object.prototype)){valid=false;return;}
        const names=keys(value),entries=[];
        for(let i=0;i<names.length;i++){
            const name=names[i],d=get(value,name);
            if(typeof name!=='string'||!d||!own(d,'value')||name==='toJSON'||name==='_blocks'||typeof d.value==='function'||typeof d.value==='symbol'){valid=false;return;}
            entries[i]=[name,d];
        }
        if(isArray(value))for(let i=0;i<value.length;i++)if(!own(value,String(i))){valid=false;return;}
        seen.add(value);active.add(value);rows.push({value,parent,entries});
        for(let i=0;i<entries.length;i++)visit(entries[i][1].value);active.delete(value);
    };
    try{if(!ambient())valid=false;else visit(root);}catch{valid=false;}
    return {valid,has:value=>seen.has(value),unchanged:()=>{
        if(!valid||!ambient())return false;
        for(let i=0;i<rows.length;i++){
            const row=rows[i],names=keys(row.value);
            if(proto(row.value)!==row.parent||names.length!==row.entries.length)return false;
            for(let j=0;j<names.length;j++)if(names[j]!==row.entries[j][0]||!same(get(row.value,names[j]),row.entries[j][1]))return false;
        }
        return true;
    }};
};
// An operation must bind this immutable-at-import descriptor baseline as well
// as its own source. Fresh valid operations may qualify after restoration, but
// a used operation whose current() saw a change never revives.
const descriptors=capture(SDK_DIALOG_CLASS_NODES);
export const currentImageAbiSdkDescriptors=()=>descriptors.unchanged();
const denied=Object.freeze({accepts:()=>false,current:()=>true});
const safe=name=>typeof name==='string'&&name.length>0&&!['__proto__','constructor','prototype','_blocks','toJSON'].includes(name)&&!own(Object.prototype,name);

export function createImageConsumerAbiExport({project,provider}){
    if(!currentImageAbiSdkDescriptors()||!imageAbiModelQuery(provider,project,'current'))return denied;
    const source=capture(project);if(!source.valid)return denied;
    let expired=false;
    const current=()=>{
        if(expired)return false;
        try{if(!source.unchanged()||!currentImageAbiSdkDescriptors()||!imageAbiModelQuery(provider,project,'current'))expired=true;}
        catch(error){expired=true;throw error;}
        return !expired;
    };
    const targets=project.targets,rows=new Map(),owners=new Map(),incoming=new Map(),roots=[];
    if(!isArray(targets))return denied;
    let valid=true;
    for(const target of targets){
        if(!target||!target.blocks||!target.variables)return denied;
        for(const [id,node]of Object.entries(target.blocks)){
            if(!safe(id)||!node||!source.has(node)||rows.has(node)){valid=false;break;}
            rows.set(node,{id,target,node});incoming.set(node,[]);
        }
    }
    const nodeAt=(t,id)=>typeof id==='string'?t.blocks[id]:null;
    for(const [n,r]of rows){
        if(!n.inputs||!n.fields){valid=false;continue;}
        if(n.next!=null){const next=nodeAt(r.target,n.next);if(!next)valid=false;else incoming.get(next)?.push(n);}
        for(const slot of Object.values(n.inputs)){
            if(!isArray(slot)||![1,2,3].includes(slot[0])||slot.length!==(slot[0]===3?3:2)){valid=false;continue;}
            for(let i=1;i<slot.length;i++){
                const value=slot[i];
                if(typeof value==='string'){const child=nodeAt(r.target,value);if(!child)valid=false;else incoming.get(child)?.push(n);}
                else if(!isArray(value)||!([4,5,6,7,8,9,10,11].includes(value[0])&&value.length===2||i===1&&value[0]===12&&value.length===3))valid=false;
            }
        }
    }
    const visit=(n,scope,path=new Set())=>{
        if(!n||path.has(n)||owners.has(n)){valid=false;return;}
        owners.set(n,scope);const r=rows.get(n);if(!r){valid=false;return;}
        if(n!==scope&&(incoming.get(n)?.length!==1||nodeAt(r.target,n.parent)!==incoming.get(n)[0]))valid=false;
        const next=new Set([...path,n]);for(const slot of Object.values(n.inputs))for(let i=1;i<slot.length;i++)if(typeof slot[i]==='string')visit(nodeAt(r.target,slot[i]),scope,next);
        if(n.next)visit(nodeAt(r.target,n.next),scope,next);
    };
    for(const [n]of rows)if(n.topLevel===true){if(n.parent!=null||n.shadow!==false||incoming.get(n)?.length)valid=false;roots.push(n);visit(n,n);}
    if([...rows.keys()].some(n=>!owners.has(n)))valid=false;
    const shape=(n,inputs=[],fields=[])=>!!n&&rows.has(n)&&n.mutation==null&&n.shadow===false&&
        keys(n.inputs).length===inputs.length&&inputs.every(k=>own(n.inputs,k))&&keys(n.fields).length===fields.length&&
        fields.every(k=>isArray(n.fields[k])&&n.fields[k].length===2&&(k==='VARIABLE'?safe(n.fields[k][0])&&safe(n.fields[k][1]):n.fields[k][1]===null));
    const fixed=(n,name)=>{
        const slot=n.inputs?.[name];if(!isArray(slot)||slot.length!==2||slot[0]!==1||!isArray(slot[1])||slot[1].length!==2||slot[1][0]!==10||typeof slot[1][1]!=='string')return null;
        return slot[1][1];
    };
    // Globals use the emitter's reserved-name allocator. Raw procedure/hat
    // locals do not; a local game shadows the emitted constructor namespace.
    // A nominal Image class would also change the emitted type context.
    const namespaceShadow=[...rows.keys()].some(n=>
        ['arcade_setLocal','arcade_getLocal'].includes(n.opcode)&&['game','Image'].includes(fixed(n,'NAME'))||
        ['arcade_declareClass','arcade_declareSubclass'].includes(n.opcode)&&['game','Image'].includes(fixed(n,'NAME')));
    const global=raw=>{
        if(!isArray(raw)||raw.length!==3||raw[0]!==12||!safe(raw[1])||!safe(raw[2]))return null;
        const found=targets.filter(t=>own(t.variables,raw[2]));if(found.length!==1)return null;
        const row=found[0].variables[raw[2]];if(!isArray(row)||row.length!==2||row[0]!==raw[1]||Object.values(found[0].variables).filter(v=>v[0]===raw[1]).length!==1)return null;
        return row;
    };
    const receiverGlobal=(n,t)=>{
        const f=n.fields?.VARIABLE;if(!isArray(f)||f.length!==2)return null;
        const c=global([12,f[0],f[1]]);const owner=targets.find(other=>other.variables[f[1]]===c);
        return owner===t||owner?.isStage?c:null;
    };
    const primitive=(kind,value)=>({kind,value,known:['undefined','null'].includes(kind)||value!==undefined}),absent=primitive('undefined'),nil=primitive('null');
    const scalar=v=>v&&['number','string','boolean','undefined','null'].includes(v.kind);
    const state=new Map(),locals=new Map(),writes=new Map(),decisions=new WeakSet();let steps=0;
    const failure=Object.freeze({}),fail=()=>{throw failure;};
    const local=(scope,name)=>{
        if(!safe(name))fail();if(!locals.has(scope))locals.set(scope,new Map());const names=locals.get(scope);if(!names.has(name))names.set(name,{});return names.get(name);
    };
    const read=c=>{if(!c||!state.has(c))fail();return state.get(c);};
    const numeric=v=>v?.kind==='number'&&Number.isFinite(v.value);
    const freshImage=(n,w,h)=>({kind:'image',node:n,width:w|0,height:h|0});
    const allocatedImage=(n,args)=>{
        if(args.length!==2||!args.every(numeric)||args.some(v=>Math.abs(v.value)>2000))fail();
        const [w,h]=args.map(v=>v.value|0);return w<0||h<0?absent:freshImage(n,w,h);
    };
    const physicalInput=(n,name)=>{
        const slot=n.inputs[name],t=rows.get(n).target,r=slot?.[1];
        if(typeof r==='string')return nodeAt(t,r);
        return r;
    };
    const argValues=n=>{
        const args=[],seen=new Set();let at=physicalInput(n,'ARGS');
        while(at&&!isArray(at)&&at.opcode==='arcade_functionArgument'){
            if(seen.has(at)||!shape(at,['VALUE','REST']))fail();seen.add(at);args.push(value(physicalInput(at,'VALUE'),owners.get(at)));
            at=physicalInput(at,'REST');
        }
        if(!isArray(at)||at.length!==2||at[0]!==10||at[1]!=='[]')fail();return args;
    };
    const value=(n,scope,depth=0)=>{
        if(++steps>20000||depth>64||!n)fail();
        if(isArray(n)){
            if(n[0]===12){const c=global(n);if(!c)fail();const owner=targets.find(t=>t.variables[n[2]]===c);if(owner!==rows.get(scope)?.target&&!owner?.isStage)fail();return read(c);}
            if(n.length!==2)fail();if([4,5,6,7,8].includes(n[0])&&['number','string'].includes(typeof n[1]))return primitive('number',Number(n[1]));
            if(n[0]===10&&typeof n[1]==='string')return primitive('string',n[1]);fail();
        }
        if(!rows.has(n)||owners.get(n)!==scope)fail();
        const at=name=>value(physicalInput(n,name),scope,depth+1),op=n.opcode;
        if(op==='operator_add'){
            if(!shape(n,['NUM1','NUM2']))fail();const a=at('NUM1'),b=at('NUM2');if(!numeric(a)||!numeric(b))fail();return primitive('number',a.value+b.value);
        }
        if(op==='arcade_getLocal'){if(!shape(n,['NAME']))fail();return read(local(scope,fixed(n,'NAME')));}
        if(op==='data_variable'){if(!shape(n,[],['VARIABLE']))fail();return read(receiverGlobal(n,rows.get(n).target));}
        if(op==='arrays_specialValue'){
            if(!shape(n,[],['KIND']))fail();if(n.fields.KIND[0]==='undefined')return absent;if(n.fields.KIND[0]==='null')return nil;fail();
        }
        if(op==='arcade_createObject'){
            if(!shape(n,['CLASS','ARGS']))fail();const cls=imageAbiModelQuery(provider,project,'constructor',rows.get(n).target,n);if(!cls)fail();
            const image=allocatedImage(n,argValues(n));return {kind:'dialog',cls,image,node:n};
        }
        if(op==='arcade_objectField'){
            if(!shape(n,['OBJECT','FIELD']))fail();const object=at('OBJECT'),field=fixed(n,'FIELD');if(object?.kind!=='dialog')fail();
            if(field==='image')return object.image;
            if(['textColor','cursorCount'].includes(field))return primitive('number');fail();
        }
        if(op==='arcade_callObjectMethod'){
            if(!shape(n,['OBJECT','METHOD','ARGS']))fail();const object=at('OBJECT'),method=fixed(n,'METHOD');if(object?.kind!=='dialog')fail();
            const args=argValues(n);
            // Only the exact canonical default-frame implementations, with no
            // subclass override, can use these separately audited effects.
            if(method==='resize'){object.image=allocatedImage(n,args);return absent;}
            if(method==='update'&&!args.length)return absent;
            if((method==='setText'||method==='setSubtext'&&object.cls==='SplashDialog')&&args.length===1&&args[0].kind==='string')return absent;
            fail();
        }
        if(op==='arrays_valueCompare'){
            if(!shape(n,['LEFT','RIGHT'],['OP']))fail();const op=n.fields.OP[0],a=at('LEFT'),b=at('RIGHT');
            if(!['==','===','!=','!=='].includes(op))fail();let equal;
            if(a===b)equal=true;
            else if(scalar(a)&&scalar(b)){if(!a.known||!b.known)fail();equal=op==='=='||op==='!='?a.value==b.value&&((a.kind==='undefined'||a.kind==='null')===(b.kind==='undefined'||b.kind==='null')):a.kind===b.kind&&a.value===b.value;}
            else if(a?.kind==='image'&&b?.kind==='image')equal=false;
            else if((a?.kind==='image'||a?.kind==='dialog')&&(b===absent||b===nil)||(b?.kind==='image'||b?.kind==='dialog')&&(a===absent||a===nil))equal=false;
            else fail();return primitive('boolean',op==='!='||op==='!=='?!equal:equal);
        }
        if(op==='arrays_valueTruthy'){
            if(!shape(n,['VALUE']))fail();const v=at('VALUE');if(v.kind==='boolean')return v;if(v===absent||v===nil)return primitive('boolean',false);fail();
        }
        if(op==='arcade_imageProperty'||op==='arcade_imagePixel'){
            if(op==='arcade_imageProperty'){if(!shape(n,['IMAGE'],['PROPERTY'])||!['width','height'].includes(n.fields.PROPERTY[0]))fail();}
            else if(!shape(n,['IMAGE','X','Y']))fail();
            const image=at('IMAGE');if(image?.kind!=='image')fail();
            if(op==='arcade_imagePixel'&&(!numeric(at('X'))||!numeric(at('Y'))))fail();
            decisions.add(n);return primitive('number',op==='arcade_imageProperty'?image[n.fields.PROPERTY[0]]:undefined);
        }
        fail();
    };
    const sequence=(first,scope,depth=0)=>{
        const seen=new Set();let id=first;
        while(id){
            if(++steps>20000||depth>16||seen.has(id))fail();seen.add(id);const n=nodeAt(rows.get(scope).target,id);
            if(!n||owners.get(n)!==scope)fail();const op=n.opcode;
            if(op==='looks_hide'){if(!shape(n))fail();}
            else if(op==='arcade_declareSourceScalar'){
                if(!shape(n,['VARIABLE'],['TYPE'])||!global(n.inputs.VARIABLE[1])||!['Number','Boolean','String'].includes(n.fields.TYPE[0]))fail();
            }else if(op==='arcade_setLocal'||op==='data_setvariableto'){
                if(!shape(n,op==='arcade_setLocal'?['NAME','VALUE']:['VALUE'],op==='data_setvariableto'?['VARIABLE']:[]))fail();
                const c=op==='arcade_setLocal'?local(scope,fixed(n,'NAME')):receiverGlobal(n,rows.get(n).target);if(!c)fail();
                const v=value(physicalInput(n,'VALUE'),scope);
                if(!writes.has(c))writes.set(c,new Set());writes.get(c).add(v.kind);state.set(c,v);
            }else if(op==='arcade_setObjectField'){
                if(!shape(n,['OBJECT','FIELD','VALUE']))fail();const object=value(physicalInput(n,'OBJECT'),scope),v=value(physicalInput(n,'VALUE'),scope);
                if(object?.kind!=='dialog'||fixed(n,'FIELD')!=='image'||v.kind!=='image'&&v!==absent&&v!==nil)fail();object.image=v;
            }else if(op==='control_if_else'){
                if(!shape(n,['CONDITION','SUBSTACK','SUBSTACK2']))fail();const condition=value(physicalInput(n,'CONDITION'),scope);
                if(condition.kind!=='boolean'||typeof condition.value!=='boolean')fail();sequence(n.inputs[condition.value?'SUBSTACK':'SUBSTACK2'][1],scope,depth+1);
            }else fail();
            id=n.next;
        }
    };
    let evaluated=false,effectsOk=false;
    const evaluate=()=>{
        if(evaluated)return effectsOk;evaluated=true;
        if(!valid||project.monitors?.some(m=>m.visible))return false;
        // This first slice deliberately admits only one synchronous source
        // start. Unknown entries, callbacks/procedures and effects decline it.
        const entries=roots.filter(n=>n.opcode==='arcade_whenSourceStarts'&&n.next);
        if(entries.length!==1||roots.some(n=>n!==entries[0]&&(n.opcode!=='arcade_whenSourceStarts'||n.next)))return false;
        const scope=entries[0];if(!shape(scope))return false;
        try{sequence(scope.next,scope);
            // A later String/object/reset writer cannot inherit Image from a
            // prior constructor/default. All actual alias writers stay closed.
            for(const kinds of writes.values())if((kinds.has('image')||kinds.has('dialog'))&&kinds.size!==1)fail();
            effectsOk=current();}
        catch(error){if(error!==failure)throw error;effectsOk=false;}
        return effectsOk;
    };
    return Object.freeze({current,accepts(target,node){
        if(!valid||namespaceShadow||!current()||rows.get(node)?.target!==target||node.topLevel!==false||node.shadow!==false||node.next!=null||!['arcade_imageProperty','arcade_imagePixel'].includes(node.opcode))return false;
        if(evaluate()&&decisions.has(node)){return current();}
        return false;
    }});
}
