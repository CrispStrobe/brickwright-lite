import {isProjectJsonSnapshot} from './project-json-snapshot.js';

// A reset-reachability theorem, not an Array/type/element producer. All abstract
// values below are private effect tokens; none are returned to value analysis.
const get=Object.getOwnPropertyDescriptor,keys=Reflect.ownKeys,proto=Object.getPrototypeOf;
const own=Object.hasOwn,isArray=Array.isArray,isFrozen=Object.isFrozen,is=Object.is;
const ordinary=new Set(['constructor','__defineGetter__','__defineSetter__','hasOwnProperty',
    '__lookupGetter__','__lookupSetter__','isPrototypeOf','propertyIsEnumerable','toString','valueOf','__proto__','toLocaleString']);
const same=(a,b)=>!!a&&!!b&&a.enumerable===b.enumerable&&a.configurable===b.configurable&&
    own(a,'value')===own(b,'value')&&(own(a,'value')?is(a.value,b.value)&&a.writable===b.writable:a.get===b.get&&a.set===b.set);
const safeName=name=>typeof name==='string'&&name.length>0&&!ordinary.has(name);
const denied=Object.freeze({discount:()=>false,current:()=>true});

export function createArrayNativeFrameReset(context){
    const {project,targets,scopes,records,calls,owners,invalid,block,child,input,literal,binding,
        globalCell,localCell,captures,closedEffects}=context;
    if(!isProjectJsonSnapshot(project))return denied;
    if(proto(Object.prototype)!==null||proto(Array.prototype)!==Object.prototype||
        keys(Object.prototype).some(key=>!ordinary.has(key)))return denied;
    const prototypes=[Object.prototype,Array.prototype].map(object=>({object,parent:proto(object),
        entries:keys(object).map(key=>[key,get(object,key)])}));
    const objects=[],owned=new WeakSet(),pending=[project];
    while(pending.length){
        const value=pending.pop();if(owned.has(value))continue;
        if(objects.length>=100000||!isFrozen(value)||proto(value)!==(isArray(value)?Array.prototype:Object.prototype))return denied;
        owned.add(value);objects.push(value);
        for(const key of keys(value)){
            const d=get(value,key);if(typeof key!=='string'||!own(d,'value')||key==='toJSON'||key==='_blocks')return denied;
            if(d.value&&typeof d.value==='object')pending.push(d.value);
        }
    }
    let used=false,expired=false;
    const current=()=>{
        if(!used)return true;if(expired)return false;
        try{
            // No prototype-dispatched collection method may verify the very
            // prototype being observed (e.g. a forged Array#every).
            for(let i=0;i<prototypes.length;i++){
                const row=prototypes[i];
                if(proto(row.object)!==row.parent||keys(row.object).length!==row.entries.length){expired=true;break;}
                for(let j=0;j<row.entries.length;j++){
                    const pair=row.entries[j];if(!same(get(row.object,pair[0]),pair[1])){expired=true;break;}
                }
                if(expired)break;
            }
            if(!expired)for(let i=0;i<objects.length;i++){
                const value=objects[i];if(proto(value)!==(isArray(value)?Array.prototype:Object.prototype)){expired=true;break;}
            }
        }catch(error){expired=true;throw error;}
        return !expired;
    };
    const shape=(node,scope,inputs=[],fields=[])=>!!node&&owned.has(node)&&owners.get(node)===scope&&
        !invalid.has(node)&&!scope.invalid&&!scope.unknownEntry&&node.mutation==null&&
        own(node,'inputs')&&own(node,'fields')&&keys(node.inputs).length===inputs.length&&inputs.every(k=>own(node.inputs,k))&&
        keys(node.fields).length===fields.length&&fields.every(k=>own(node.fields,k)&&isArray(node.fields[k])&&
            node.fields[k].length===2&&(k==='VARIABLE'?typeof node.fields[k][0]==='string'&&typeof node.fields[k][1]==='string':node.fields[k][1]===null));
    const sequence=(scope,head)=>{
        const result=[],seen=new Set();let id=head;
        while(id){const n=block(scope.target,id);if(!n||seen.has(n)||!owned.has(n)||invalid.has(n)||owners.get(n)!==scope)return null;
            seen.add(n);result.push(n);id=n.next;}
        return result;
    };
    const source=scope=>scope?.root.opcode==='arcade_whenSourceStarts'&&shape(scope.root,scope);
    const normal=scope=>{
        if(!scope?.proc||!safeName(scope.proc)||scope.invalid||scope.unknownEntry||scope.params.length||scope.ids.length)return false;
        const n=scope.root,p=child(n,'custom_block',scope.target),all=Object.values(scope.target.blocks);
        if(!p||n.opcode!=='procedures_definition'||scope.target.blocks[scope.id]!==n||n.topLevel!==true||n.shadow!==false||
            n.mutation!=null||keys(n.inputs).join('|')!=='custom_block'||n.inputs.custom_block.length!==2||
            n.inputs.custom_block[0]!==1||keys(n.fields).length||p.opcode!=='procedures_prototype'||
            p.parent!==scope.id||p.shadow!==true||p.topLevel!==false||p.next||keys(p.inputs).length||
            keys(p.fields).length||p.mutation?.proccode!==scope.proc||p.mutation.warp!=='false')return false;
        try{if(['argumentids','argumentnames','argumentdefaults'].some(k=>JSON.stringify(JSON.parse(p.mutation[k]))!=='[]'))return false;}
        catch(_){return false;}
        return all.filter(n=>n.opcode==='procedures_definition'&&child(n,'custom_block',scope.target)?.mutation?.proccode===scope.proc).length===1&&
            all.filter(n=>n.opcode==='procedures_prototype'&&n.mutation?.proccode===scope.proc).length===1;
    };
    const discount=(cell,writer)=>{
        if(!current()||cell.global||cell.formal||!closedEffects())return false;
        const {scope,target,node}=writer,name=literal(node,'NAME',target),reset=writer.value?.node;
        if(!normal(scope)||scope.callers.length!==1||!safeName(name)||localCell(scope,name)!==cell||
            scope.root.next!==Object.keys(target.blocks).find(id=>target.blocks[id]===node)||
            node.opcode!=='arcade_setLocal'||!shape(node,scope,['NAME','VALUE'])||
            !reset||reset.opcode!=='arrays_specialValue'||!shape(reset,scope,[],['KIND'])||
            !['null','undefined'].includes(literal(reset,'KIND',target)))return false;
        const origin=captures.local(captures.scopeOf(node),name);
        if(!origin||!captures.proof(origin))return false;
        const call=scope.callers[0],caller=call.scope;
        // First slice: one physical ordinary entry, directly from source-start.
        // No unrelated invocation, same-name prototype or user-supplied frame.
        if(!source(caller)||call.target!==target||call.fn!==scope||call.node.opcode!=='procedures_call'||
            call.node.mutation?.proccode!==scope.proc||call.node.mutation?.warp!=='false'||!call.args||call.args.length||
            calls.length!==1||call.node.mutation?.argumentids!=='[]'||keys(call.node.inputs).length||keys(call.node.fields).length)return false;
        const body=sequence(scope,scope.root.next),outer=sequence(caller,caller.root.next);
        if(!body||!outer||!outer.includes(call.node))return false;
        const overwrite=body.findIndex((n,i)=>i>0&&n.opcode==='arcade_setLocal'&&localCell(scope,literal(n,'NAME',target))===cell);
        if(overwrite<1)return false;
        const last=body[overwrite],fresh=child(last,'VALUE',target);
        if(!shape(last,scope,['NAME','VALUE'])||!fresh||fresh.opcode!=='arrays_createReference'||
            !shape(fresh,scope,['VALUES'])||literal(fresh,'VALUES',target)!=='[]')return false;
        // The lifecycle below is closed before the overwrite, even across loop
        // yields: other source-start scripts can only hide their own target.
        // A registered-button hat is dormant until its unique later registration.
        // Sprite-created/terrain/direct input hats and arbitrary callbacks refuse.
        const later=new Set(body.slice(overwrite+1)),registrations=new Map();
        for(const r of records){
            const n=r.node;
            if(n.opcode==='arcade_registerButtonHandler'){
                if(r.scope!==scope||!later.has(n)||!shape(n,scope,['BUTTON','EVENT','TOKEN','CAPTURES']))return false;
                const token=literal(n,'TOKEN',target),capturesText=literal(n,'CAPTURES',target);
                if(typeof token!=='string'||typeof capturesText!=='string'||registrations.has(token))return false;
                registrations.set(token,0);
            }
            // A prototype-affecting local/variable identifier cannot be lent by
            // a later body or another target. Foreign effects also fail closed.
            if(n.opcode==='arcade_setLocal'||n.opcode==='arcade_getLocal'){
                if(!safeName(literal(n,'NAME',r.target)))return false;
            }
        }
        for(const s of scopes){
            if(s===scope||s===caller)continue;
            if(source(s)){
                const line=sequence(s,s.root.next);if(!line||line.some(n=>n.opcode!=='looks_hide'||!shape(n,s)))return false;
            }else if(s.root.opcode==='arcade_whenRegisteredButton'){
                if(s.target!==target||!shape(s.root,s,['TOKEN']))return false;
                const token=literal(s.root,'TOKEN',s.target);if(!registrations.has(token))return false;
                registrations.set(token,registrations.get(token)+1);
            }else return false;
        }
        // The authority's owners index deliberately excludes declaration
        // prototypes. Admit only this physically linked, fully checked zero-
        // argument declaration; a prototype opcode or role flag is insufficient.
        const declaration=child(scope.root,'custom_block',target);
        if([...registrations.values()].some(count=>count!==1)||
            targets.some(t=>Object.values(t.blocks).some(n=>(!owners.has(n)&&n!==declaration)||invalid.has(n)))||
            project.monitors?.some(m=>m.visible))return false;
        for(const t of targets)for(const [id,row] of Object.entries(t.variables||{}))
            if(!safeName(id)||!isArray(row)||!safeName(row[0]))return false;
        const unknown=Symbol('unknown'),number=Symbol('number'),text=Symbol('string'),boolean=Symbol('boolean'),nil=Symbol('null');
        const state=new Map();
        const global=(n,s)=>{
            const f=n.fields.VARIABLE;if(!isArray(f)||f.length!==2||!safeName(f[0])||!safeName(f[1]))return null;
            const declarations=targets.filter(t=>own(t.variables||{},f[1]));
            return declarations.length===1&&declarations[0].variables[f[1]][0]===f[0]?globalCell(s.target,f[1]):null;
        };
        const value=(v,s,env,path=new Set())=>{
            if(!v)return unknown;if(v.cell)return env.get(v.cell)||unknown;
            if(v.raw){const r=v.raw;
                if(isArray(r)&&r.length===2&&[4,5,6,7,8].includes(r[0])&&typeof r[1]==='string'&&Number.isFinite(Number(r[1])))return number;
                if(isArray(r)&&r.length===2&&r[0]===10&&typeof r[1]==='string')return text;
                return unknown;
            }
            const n=v.node;if(!n||path.has(n)||invalid.has(n)||owners.get(n)!==s)return unknown;
            const next=new Set([...path,n]),read=k=>value(input(n,k,s.target),s,env,next),numeric=names=>names.every(k=>read(k)===number);
            if(n.opcode==='data_variable')return shape(n,s,[],['VARIABLE'])?env.get(global(n,s))||unknown:unknown;
            if(n.opcode==='arcade_getLocal')return shape(n,s,['NAME'])&&binding(s.target,n)!==cell?env.get(binding(s.target,n))||unknown:unknown;
            if(n.opcode==='arrays_specialValue')return shape(n,s,[],['KIND'])&&['null','undefined'].includes(literal(n,'KIND',s.target))?nil:unknown;
            if(n.opcode==='operator_add')return shape(n,s,['NUM1','NUM2'])&&numeric(['NUM1','NUM2'])?number:unknown;
            if(n.opcode==='arrays_valueBinary')return shape(n,s,['LEFT','RIGHT'],['OP'])&&['+','-','*','/','%','**'].includes(literal(n,'OP',s.target))&&numeric(['LEFT','RIGHT'])?number:unknown;
            if(n.opcode==='arrays_valueCompare')return shape(n,s,['LEFT','RIGHT'],['OP'])&&['<','<=','>','>=','===','!==','==','!='].includes(literal(n,'OP',s.target))&&numeric(['LEFT','RIGHT'])?boolean:unknown;
            if(n.opcode==='arcade_mathBinary')return shape(n,s,['A','B'],['OP'])&&['min','max','randomRange'].includes(literal(n,'OP',s.target))&&numeric(['A','B'])?number:unknown;
            if(n.opcode==='arcade_randomNumber')return shape(n,s)?number:unknown;
            if(n.opcode==='arcade_percentChance')return shape(n,s,['PERCENTAGE'])&&numeric(['PERCENTAGE'])?boolean:unknown;
            if(n.opcode==='arcade_spriteKindValue')return shape(n,s,['NAME'])&&literal(n,'NAME',s.target)==='Player'?number:unknown;
            if(n.opcode==='arcade_createSprite'){
                if(!shape(n,s,['TEMPLATE','KIND','WIDTH','HEIGHT'])||typeof literal(n,'TEMPLATE',s.target)!=='string'||
                    !numeric(['KIND','WIDTH','HEIGHT']))return unknown;
                return n; // fresh native handle, only for effects; never Array authority
            }
            return unknown;
        };
        const execute=(n,s,env,depth=0)=>{
            if(depth>64||!n||invalid.has(n)||owners.get(n)!==s)return false;
            const read=k=>value(input(n,k,s.target),s,env),op=n.opcode;
            if(op==='looks_hide')return shape(n,s);
            if(op==='arcade_declareSourceScalar'||op==='arcade_declareSourceReference'){
                if(!source(s)||!shape(n,s,['VARIABLE'],['TYPE']))return false;
                const raw=n.inputs.VARIABLE[1];return isArray(raw)&&raw.length===3&&raw[0]===12&&
                    safeName(raw[1])&&safeName(raw[2])&&!!globalCell(s.target,raw[2]);
            }
            if(op==='data_setvariableto'||op==='arcade_setLocal'){
                if(!shape(n,s,op==='data_setvariableto'?['VALUE']:['NAME','VALUE'],op==='data_setvariableto'?['VARIABLE']:[]))return false;
                const c=op==='data_setvariableto'?global(n,s):localCell(s,literal(n,'NAME',s.target));
                if(!c||c===cell)return false;const v=read('VALUE');if(v===unknown)return false;env.set(c,v);return true;
            }
            if(op==='arcade_setBackgroundColor')return shape(n,s,['COLOR'])&&read('COLOR')===number;
            if(op==='arcade_setSpritePosition'){
                const handle=read('ID');return shape(n,s,['ID','X','Y'])&&owned.has(handle)&&handle.opcode==='arcade_createSprite'&&
                    read('X')===number&&read('Y')===number;
            }
            if(op==='arcade_sourceWhile'){
                if(!shape(n,s,['CONDITION','SUBSTACK'])||read('CONDITION')!==boolean)return false;
                const line=sequence(s,n.inputs.SUBSTACK[1]);if(!line)return false;
                // Fixed point on primitive kinds, not values or a bounded loop
                // unroll. Zero iterations participates in every join. No body
                // write may establish a new or different post-loop fact.
                const iter=new Map(env);
                for(const part of line)if(!execute(part,s,iter,depth+1))return false;
                if(value(input(n,'CONDITION',s.target),s,iter)!==boolean)return false;
                return [...iter].every(([c,v])=>env.has(c)&&env.get(c)===v);
            }
            return false;
        };
        for(const n of outer){if(n===call.node)break;if(!execute(n,caller,state))return false;}
        // At entry only the reset itself can write this candidate cell. Process
        // the whole prefix and all loop paths; an opaque operation refuses.
        for(const n of body.slice(1,overwrite))if(!execute(n,scope,state))return false;
        used=true;return current();
    };
    return Object.freeze({discount,current});
}
