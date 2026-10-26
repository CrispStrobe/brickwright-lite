import {isProjectJsonSnapshot} from './project-json-snapshot.js';
import {sourceValueOperation} from './source-value-operator-helpers.js';

// Private reset nonreachability only. Tokens below never enter producer/type or
// initialization analysis. Existing Array writers still qualify independently.
const get=Object.getOwnPropertyDescriptor,keys=Reflect.ownKeys,proto=Object.getPrototypeOf;
const own=Object.hasOwn,isArray=Array.isArray,frozen=Object.isFrozen,sameValue=Object.is;
const denied=Object.freeze({discount:()=>false,current:()=>true});
const objectNames=new Set(['constructor','__defineGetter__','__defineSetter__','hasOwnProperty','__lookupGetter__','__lookupSetter__','isPrototypeOf','propertyIsEnumerable','toString','valueOf','__proto__','toLocaleString']);
const reserved=new Set(['constructor','__proto__','prototype','toJSON','_blocks']);
const safe=name=>typeof name==='string'&&name.length>0&&!reserved.has(name)&&!own(Object.prototype,name);
const descriptorEqual=(a,b)=>!!a&&!!b&&a.enumerable===b.enumerable&&a.configurable===b.configurable&&
    own(a,'value')===own(b,'value')&&(own(a,'value')?sameValue(a.value,b.value)&&a.writable===b.writable:a.get===b.get&&a.set===b.set);

// Refuse a changed ambient baseline before using prototype-dispatched helpers.
// Instance snapshots below additionally bind the exact proof lifetime.
const ambient=[];
for(const object of [Object.prototype,Array.prototype]){
    const names=keys(object),entries=[];
    for(let i=0;i<names.length;i++)entries[i]=[names[i],get(object,names[i])];
    ambient[ambient.length]={object,parent:proto(object),entries};
}
const ambientCurrent=()=>{
    for(let i=0;i<ambient.length;i++){
        const row=ambient[i],names=keys(row.object);
        if(proto(row.object)!==row.parent||names.length!==row.entries.length)return false;
        for(let j=0;j<names.length;j++)if(names[j]!==row.entries[j][0]||!descriptorEqual(get(row.object,names[j]),row.entries[j][1]))return false;
    }
    return true;
};

export function createArraySourceStartResetEffects(context){
    const {project,targets,scopes,records,calls,owners,invalid,block,child,input,literal,binding,
        globalCell,localCell,closedEffects,closedFrameImageEffect}=context;
    if(!ambientCurrent()||!isProjectJsonSnapshot(project)||proto(Object.prototype)!==null||proto(Array.prototype)!==Object.prototype||keys(Object.prototype).some(k=>!objectNames.has(k)))return denied;
    const prototypes=[Object.prototype,Array.prototype].map(object=>({object,parent:proto(object),entries:keys(object).map(key=>[key,get(object,key)])}));
    const objects=[],owned=new WeakSet(),pending=[project];
    while(pending.length){
        const value=pending.pop();if(owned.has(value))continue;
        if(objects.length>=100000||!frozen(value)||proto(value)!==(isArray(value)?Array.prototype:Object.prototype))return denied;
        owned.add(value);objects.push(value);
        for(const key of keys(value)){
            const d=get(value,key);if(typeof key!=='string'||!own(d,'value')||key==='toJSON'||key==='_blocks')return denied;
            if(typeof d.value==='function'||typeof d.value==='symbol')return denied;
            if(d.value&&typeof d.value==='object')pending.push(d.value);
        }
    }
    let used=false,expired=false;
    const current=()=>{
        if(!used)return true;if(expired)return false;
        try{
            for(let i=0;i<prototypes.length;i++){
                const row=prototypes[i],actualKeys=keys(row.object);
                if(proto(row.object)!==row.parent||actualKeys.length!==row.entries.length){expired=true;break;}
                for(let j=0;j<actualKeys.length;j++)if(actualKeys[j]!==row.entries[j][0]||!descriptorEqual(get(row.object,actualKeys[j]),row.entries[j][1])){expired=true;break;}
            }
            for(let i=0;!expired&&i<objects.length;i++)if(proto(objects[i])!==(isArray(objects[i])?Array.prototype:Object.prototype))expired=true;
        }catch(error){expired=true;throw error;}
        return !expired;
    };
    const shape=(n,s,inputs=[],fields=[])=>!!n&&owned.has(n)&&owners.get(n)===s&&!invalid.has(n)&&!s.invalid&&!s.unknownEntry&&
        n.mutation==null&&own(n,'inputs')&&own(n,'fields')&&keys(n.inputs).length===inputs.length&&inputs.every(k=>own(n.inputs,k))&&
        keys(n.fields).length===fields.length&&fields.every(k=>own(n.fields,k)&&isArray(n.fields[k])&&n.fields[k].length===2&&
            (k==='VARIABLE'?safe(n.fields[k][0])&&safe(n.fields[k][1]):n.fields[k][1]===null));
    const normal=s=>{
        if(!s?.proc||!safe(s.proc)||s.invalid||s.unknownEntry||s.params.length||s.ids.length)return false;
        const n=s.root,p=child(n,'custom_block',s.target),all=Object.values(s.target.blocks);
        if(!p||n.opcode!=='procedures_definition'||s.target.blocks[s.id]!==n||n.topLevel!==true||n.shadow!==false||n.mutation!=null||
            keys(n.inputs).join('|')!=='custom_block'||n.inputs.custom_block.length!==2||n.inputs.custom_block[0]!==1||keys(n.fields).length||
            p.opcode!=='procedures_prototype'||p.parent!==s.id||p.shadow!==true||p.topLevel!==false||p.next||keys(p.inputs).length||keys(p.fields).length||
            p.mutation?.proccode!==s.proc||p.mutation.warp!=='false'||keys(p.mutation).some(k=>!['tagName','children','proccode','argumentids','argumentnames','argumentdefaults','warp'].includes(k)))return false;
        try{if(['argumentids','argumentnames','argumentdefaults'].some(k=>JSON.stringify(JSON.parse(p.mutation[k]))!=='[]'))return false;}catch{return false;}
        return all.filter(n=>n.opcode==='procedures_definition'&&child(n,'custom_block',s.target)?.mutation?.proccode===s.proc).length===1&&
            all.filter(n=>n.opcode==='procedures_prototype'&&n.mutation?.proccode===s.proc).length===1;
    };
    // A separate, closed effect rule. An identity body can transport its actual
    // argument but cannot allocate an Array or publish the caller's frame.
    const identity=s=>{
        if(!s?.proc||!safe(s.proc)||s.invalid||s.unknownEntry||s.params.length!==1||s.ids.length!==1||
            !safe(s.params[0])||!safe(s.ids[0])||(s.proc.match(/%[sbn]/g)||[]).length!==1||s.proc.includes('%b'))return null;
        const n=s.root,p=child(n,'custom_block',s.target),all=Object.values(s.target.blocks),id=s.ids[0],name=s.params[0];
        if(!p||n.opcode!=='procedures_definition'||s.target.blocks[s.id]!==n||n.topLevel!==true||n.shadow!==false||n.mutation!=null||
            keys(n.inputs).join('|')!=='custom_block'||n.inputs.custom_block.length!==2||n.inputs.custom_block[0]!==1||keys(n.fields).length||
            p.opcode!=='procedures_prototype'||p.parent!==s.id||p.shadow!==true||p.topLevel!==false||p.next||
            keys(p.inputs).length!==1||!own(p.inputs,id)||keys(p.fields).length||p.mutation?.proccode!==s.proc||p.mutation.warp!=='false'||
            keys(p.mutation).some(k=>!['tagName','children','proccode','argumentids','argumentnames','argumentdefaults','warp'].includes(k)))return null;
        try{if(p.mutation.argumentids!==JSON.stringify([id])||p.mutation.argumentnames!==JSON.stringify([name])||
            p.mutation.argumentdefaults!==JSON.stringify(['']))return null;}catch{return null;}
        const edge=p.inputs[id],reporter=block(s.target,edge?.[1]),prototypeId=Object.keys(s.target.blocks).find(id=>s.target.blocks[id]===p);
        if(!isArray(edge)||edge.length!==2||edge[0]!==1||!reporter||!owned.has(reporter)||invalid.has(reporter)||
            reporter.opcode!=='argument_reporter_string_number'||reporter.parent!==prototypeId||reporter.shadow!==true||reporter.topLevel!==false||
            reporter.next||reporter.mutation!=null||keys(reporter.inputs).length||keys(reporter.fields).join('|')!=='VALUE'||
            !isArray(reporter.fields.VALUE)||reporter.fields.VALUE.length!==2||reporter.fields.VALUE[0]!==name||reporter.fields.VALUE[1]!==null)return null;
        if(all.filter(n=>n.opcode==='procedures_definition'&&child(n,'custom_block',s.target)?.mutation?.proccode===s.proc).length!==1||
            all.filter(n=>n.opcode==='procedures_prototype'&&n.mutation?.proccode===s.proc).length!==1)return null;
        let returned=block(s.target,n.next);
        if(returned?.opcode==='arcade_declareParameterConstraint'){
            if(!shape(returned,s,[],['PROCEDURE','PARAMETER','TYPE'])||literal(returned,'PROCEDURE',s.target)!==s.proc||
                literal(returned,'PARAMETER',s.target)!==name||literal(returned,'TYPE',s.target)!=='Any')return null;
            returned=block(s.target,returned.next);
        }
        if(!returned||returned.opcode!=='arcade_returnValue'||returned.next||!shape(returned,s,['VALUE']))return null;
        const result=child(returned,'VALUE',s.target);
        if(!result||result.opcode!=='arcade_getLocal'||result.next||!shape(result,s,['NAME'])||literal(result,'NAME',s.target)!==name||
            binding(s.target,result)!==localCell(s,name))return null;
        return {reporter};
    };
    const ordinaryGlobal=c=>{
        for(const [t,map]of globalCell.maps)for(const [id,value]of map)if(globalCell(t,id)===c){const row=t.variables?.[id];return isArray(row)&&row.length===2&&safe(id)&&safe(row[0]);}
        return false;
    };
    const discount=(candidate,writer)=>{
        if(!current()||candidate.formal||!closedEffects()||!writer.value?.node||writer.value.node.opcode!=='arrays_specialValue'||
            !shape(writer.value.node,writer.scope,[],['KIND'])||!['null','undefined'].includes(literal(writer.value.node,'KIND',writer.target)))return false;
        if(candidate.global&&!ordinaryGlobal(candidate))return false;
        const sourceScopes=scopes.filter(s=>s.root.opcode==='arcade_whenSourceStarts');
        const entries=sourceScopes.filter(s=>s.root.next&&block(s.target,s.root.next)?.opcode!=='looks_hide'||
            s.root.next&&block(s.target,s.root.next)?.next);
        if(entries.length!==1)return false;
        const entry=entries[0];if(!shape(entry.root,entry))return false;
        const identities=new Map();
        for(const s of scopes){
            if(s===entry)continue;
            if(s.proc){if(!normal(s)){const proof=identity(s);if(!proof)return false;identities.set(s,proof);}continue;}
            if(s.root.opcode!=='arcade_whenSourceStarts'||!shape(s.root,s))return false;
            if(s.root.next){const hide=block(s.target,s.root.next);if(hide?.opcode!=='looks_hide'||hide.next||!shape(hide,s))return false;}
        }
        const declarations=new Set(scopes.filter(s=>s.proc).map(s=>child(s.root,'custom_block',s.target)));
        for(const proof of identities.values())declarations.add(proof.reporter);
        if(targets.some(t=>Object.values(t.blocks).some(n=>invalid.has(n)||!owners.has(n)&&!declarations.has(n)))||project.monitors?.some(m=>m.visible))return false;
        const commands=calls.filter(c=>c.node.opcode==='procedures_call');
        if(commands.length!==1||commands[0].scope!==entry||!normal(commands[0].fn)||commands[0].fn.callers.length!==1)return false;
        const startup=commands[0].fn;
        if(writer.scope!==(candidate.global?entry:startup))return false;
        // Capture/reflection/opaque operations are rejected by the complete
        // evaluator; all ordinary scopes and real calls must be visited below.
        const number=Symbol('number'),text=Symbol('string'),boolean=Symbol('boolean'),nil=Symbol('null'),undef=Symbol('undefined'),primitive=Symbol('stored primitive or Image'),imageResult=Symbol('Image or empty text');
        const scalar=v=>[number,text,boolean,undef,nil,primitive].includes(v);
        const coercible=v=>scalar(v)||v===imageResult;
        const binaryResult=(op,values)=>op==='+'?
            values.some(v=>v===text||v===imageResult)?text:values.includes(primitive)?primitive:number:number;
        const state=new Map(),visited=new Set(),called=new Set(),active=new Set(),allocations=new Set();
        let resetSeen=false,killed=false,steps=0;
        const fail=()=>{throw refusal;},refusal=Object.freeze({});
        const read=c=>{
            if(!c||c===candidate&&resetSeen&&!killed)fail();
            if(!state.has(c))fail();return state.get(c);
        };
        const global=n=>{
            const f=n.fields?.VARIABLE;if(!isArray(f)||f.length!==2)return null;
            const c=globalCell(owners.get(n).target,f[1]);
            const declaration=targets.find(t=>own(t.variables||{},f[1]))?.variables[f[1]];
            return ordinaryGlobal(c)&&declaration?.[0]===f[0]?c:null;
        };
        const callAt=n=>{
            const found=calls.filter(c=>c.node===n);if(found.length!==1)fail();const c=found[0];
            if(!normal(c.fn)||c.target!==c.fn.target||c.scope!==owners.get(n)||!c.args||c.args.length)fail();
            if(n.opcode==='procedures_call'){
                if(n!==commands[0].node||n.mutation?.proccode!==c.fn.proc||n.mutation?.warp!=='false'||n.mutation?.argumentids!=='[]'||keys(n.inputs).length||keys(n.fields).length||
                    keys(n.mutation).some(k=>!['tagName','children','proccode','argumentids','warp'].includes(k)))fail();
            }else if(!shape(n,c.scope,['NAME','ARGS'])||literal(n,'NAME',c.target)!==c.fn.proc||literal(n,'ARGS',c.target)!=='[]')fail();
            called.add(c);return c;
        };
        const identityAt=(n,s,depth)=>{
            const found=calls.filter(c=>c.node===n);if(found.length!==1)fail();const c=found[0];
            if(!identities.has(c.fn)||c.target!==s.target||c.target!==c.fn.target||c.scope!==s||owners.get(n)!==s||
                !c.args||c.args.length!==1||!shape(n,s,['NAME','ARGS'])||literal(n,'NAME',s.target)!==c.fn.proc)fail();
            const argument=child(n,'ARGS',s.target);
            if(!argument||argument.opcode!=='arcade_functionArgument'||argument.next||!shape(argument,s,['VALUE','REST'])||
                literal(argument,'REST',s.target)!=='[]')fail();
            // Evaluate the real socket before invoking the closed callee. No
            // borrowed argument summary or formal annotation enters state.
            const result=value(input(argument,'VALUE',s.target),s,depth+1);
            called.add(c);visited.add(c.fn);return result;
        };
        const value=(v,s,depth=0)=>{
            if(++steps>20000||depth>64||!v)fail();
            if(v.cell){if(s!==entry&&s!==startup&&v.cell===candidate)fail();return read(v.cell);}
            if(v.raw){const r=v.raw;if(!isArray(r)||r.length!==2)fail();if([4,5,6,7,8].includes(r[0])&&['string','number'].includes(typeof r[1]))return number;if(r[0]===10&&typeof r[1]==='string')return text;fail();}
            const n=v.node;if(!n||owners.get(n)!==s||invalid.has(n))fail();
            const at=name=>value(input(n,name,s.target),s,depth+1),op=n.opcode;
            if(op==='data_variable'){if(!shape(n,s,[],['VARIABLE']))fail();const c=binding(s.target,n);if(!ordinaryGlobal(c)||s!==entry&&s!==startup&&c===candidate)fail();return read(c);}
            if(op==='arcade_getLocal'){if(!shape(n,s,['NAME'])||!safe(literal(n,'NAME',s.target)))fail();return read(localCell(s,literal(n,'NAME',s.target)));}
            if(op==='arrays_specialValue'){if(!shape(n,s,[],['KIND']))fail();const kind=literal(n,'KIND',s.target);if(kind==='null')return nil;if(kind==='undefined')return undef;fail();}
            if(op==='arrays_createReference'){if(s!==startup||!shape(n,s,['VALUES'])||literal(n,'VALUES',s.target)!=='[]')fail();const token={node:n};allocations.add(token);return token;}
            if(op==='arcade_callFunction'){
                const c=calls.find(c=>c.node===n);
                if(identities.has(c?.fn))return identityAt(n,s,depth);
                return run(callAt(n).fn,true,depth+1);
            }
            if(op==='arcade_createImage'){
                if(!shape(n,s,['WIDTH','HEIGHT'])||at('WIDTH')!==number||at('HEIGHT')!==number)fail();return imageResult;
            }
            if(op==='arcade_frameImage'){
                // Consume the owning authority's exact literal-input builtin
                // effect rule. This is still only Image-or-empty-text transport,
                // never an artwork, Array, or initialized-input certificate.
                if(typeof closedFrameImageEffect!=='function'||!closedFrameImageEffect(s.target,n,s))fail();
                return imageResult;
            }
            if(op==='arcade_cloneImage'){
                if(!shape(n,s,['IMAGE'])||at('IMAGE')!==imageResult)fail();return imageResult;
            }
            if(op==='arcade_imagePixel'){
                if(!shape(n,s,['IMAGE','X','Y'])||at('IMAGE')!==imageResult||at('X')!==number||at('Y')!==number)fail();return number;
            }
            if(op==='operator_add'||op==='operator_subtract'||op==='operator_multiply'||op==='operator_divide'){
                if(!shape(n,s,['NUM1','NUM2']))fail();if(at('NUM1')!==number||at('NUM2')!==number)fail();return number;
            }
            if(op==='arrays_valueBinary'){
                if(!shape(n,s,['LEFT','RIGHT'],['OP'])||!['+','-','*','/','%','**','&','|','^','<<','>>','>>>'].includes(literal(n,'OP',s.target)))fail();
                const a=at('LEFT'),b=at('RIGHT');if(!coercible(a)||!coercible(b))fail();
                return binaryResult(literal(n,'OP',s.target),[a,b]);
            }
            const operation=sourceValueOperation(n);
            if(operation){
                if(!shape(n,s,operation.inputs,['OP']))fail();
                const values=operation.inputs.map(at);if(!values.every(coercible))fail();
                return binaryResult(operation.op,values);
            }
            if(op==='arrays_valueUnary'){
                if(!shape(n,s,['VALUE'],['OP']))fail();const operator=literal(n,'OP',s.target),v=at('VALUE');
                if(!coercible(v))fail();
                if(['+','-','~'].includes(operator))return number;
                if(operator==='!')return boolean;if(operator==='typeof')return text;if(operator==='void')return undef;fail();
            }
            if(op==='arrays_valueCompare'){
                // Comparison only consumes already established primitive domains.
                // Preserve both real operand effects in left-to-right order;
                // an opaque/reference value never borrows Boolean from spelling.
                if(!shape(n,s,['LEFT','RIGHT'],['OP'])||!['==','!=','===','!==','<','<=','>','>='].includes(literal(n,'OP',s.target)))fail();
                const a=at('LEFT'),b=at('RIGHT'),strict=['===','!=='].includes(literal(n,'OP',s.target));
                if(allocations.has(a)||allocations.has(b)){
                    // Only the measured Image/list identity comparison is an
                    // added effect case. Ordinary Array/primitive comparisons
                    // remain outside the original primitive prefix contract.
                    if(!strict||!(a===imageResult&&allocations.has(b)||b===imageResult&&allocations.has(a)))fail();
                }else if(!coercible(a)||!coercible(b))fail();
                return boolean;
            }
            if(op==='arcade_mathBinary'){
                if(!shape(n,s,['A','B'],['OP'])||!['min','max','randomRange','atan2'].includes(literal(n,'OP',s.target))||at('A')!==number||at('B')!==number)fail();return number;
            }
            if(op==='arrays_referenceItem'){
                if(s!==startup||!shape(n,s,['ARRAY','INDEX'])||!allocations.has(at('ARRAY'))||at('INDEX')!==number)fail();return primitive;
            }
            if(op==='arrays_referenceIndexOf'){
                if(s!==startup||!shape(n,s,['ARRAY','VALUE','INDEX'])||!allocations.has(at('ARRAY'))||
                    !coercible(at('VALUE'))||at('INDEX')!==number)fail();return number;
            }
            fail();
        };
        const run=(s,returning,depth=0)=>{
            if(depth>32||active.has(s)||s!==entry&&!normal(s))fail();active.add(s);visited.add(s);
            const localKeys=[];for(const [scope,map]of localCell.maps)if(scope===s)for(const name of map.keys()){const c=localCell(s,name);localKeys.push([c,state.has(c),state.get(c)]);}
            for(const [c]of localKeys)state.delete(c);
            const sequence=new Set();let id=s.root.next,returned=false,result;
            while(id){
                if(++steps>20000||sequence.has(id))fail();sequence.add(id);
                const n=block(s.target,id);if(!n||owners.get(n)!==s||invalid.has(n))fail();const op=n.opcode;
                if(op==='looks_hide'){if(returning||!shape(n,s))fail();}
                else if(op==='arcade_declareSourceScalar'){
                    if(s!==entry||!shape(n,s,['VARIABLE'],['TYPE']))fail();const r=n.inputs.VARIABLE[1];
                    if(!isArray(r)||r.length!==3||r[0]!==12||!['Number','String','Boolean','Any'].includes(literal(n,'TYPE',s.target))||
                        !ordinaryGlobal(globalCell(s.target,r[2]))||targets.find(t=>own(t.variables||{},r[2]))?.variables[r[2]]?.[0]!==r[1])fail();
                }else if(op==='arcade_declareSourceReference'){
                    // Like the scalar prelude, this binds the actual variable
                    // object rather than consuming its displayed value. Its
                    // declared type contributes NO producer or readiness fact.
                    if(s!==entry||!shape(n,s,['VARIABLE'],['TYPE'])||
                        !['Sprite','Image','number[]','boolean[]','string[]','Sprite[]','Image[]'].includes(literal(n,'TYPE',s.target)))fail();
                    const r=n.inputs.VARIABLE[1];
                    if(!isArray(r)||r.length!==3||r[0]!==12||!ordinaryGlobal(globalCell(s.target,r[2])))fail();
                    const declaration=targets.find(t=>own(t.variables||{},r[2]))?.variables[r[2]];
                    if(declaration?.[0]!==r[1])fail();
                }else if(op==='procedures_call'){if(returning||s!==entry)fail();const c=callAt(n);run(c.fn,false,depth+1);}
                else if(op==='arcade_returnValue'){
                    if(!returning||n.next||!shape(n,s,['VALUE']))fail();result=value(input(n,'VALUE',s.target),s);if(!coercible(result))fail();returned=true;break;
                }else if(op==='data_setvariableto'||op==='arcade_setLocal'){
                    if(!shape(n,s,op==='data_setvariableto'?['VALUE']:['NAME','VALUE'],op==='data_setvariableto'?['VARIABLE']:[]))fail();
                    const c=op==='data_setvariableto'?global(n):safe(literal(n,'NAME',s.target))&&localCell(s,literal(n,'NAME',s.target));
                    if(!c||returning&&c===candidate)fail();
                    const v=value(input(n,'VALUE',s.target),s);
                    if(returning&&!coercible(v))fail();
                    if(n===writer.node){if(resetSeen||c!==candidate||v!==nil&&v!==undef)fail();resetSeen=true;}
                    else if(c===candidate&&resetSeen&&!killed){
                        if(!allocations.has(v)||!candidate.global&&input(n,'VALUE',s.target).node?.opcode!=='arrays_createReference')fail();killed=true;
                    }else if(c===candidate&&resetSeen&&killed&&(v===nil||v===undef))fail();
                    state.set(c,v);
                }else if(op==='arrays_mutateReference'){
                    if(returning||s!==startup||!shape(n,s,['ARRAY','OP','INDEX','VALUE'])||literal(n,'OP',s.target)!=='push')fail();
                    if(!allocations.has(value(input(n,'ARRAY',s.target),s))||value(input(n,'INDEX',s.target),s)!==number||!coercible(value(input(n,'VALUE',s.target),s)))fail();
                }else if(op==='arcade_mutateImage'){
                    if(!shape(n,s,['IMAGE','COLOR','TO'],['OP'])||literal(n,'OP',s.target)!=='fill'||
                        value(input(n,'IMAGE',s.target),s)!==imageResult||value(input(n,'COLOR',s.target),s)!==number||
                        value(input(n,'TO',s.target),s)!==number)fail();
                }else if(op==='arcade_setImagePixel'){
                    if(!shape(n,s,['IMAGE','X','Y','COLOR'])||value(input(n,'IMAGE',s.target),s)!==imageResult||
                        ['X','Y','COLOR'].some(name=>value(input(n,name,s.target),s)!==number))fail();
                }else fail();
                id=n.next;
            }
            if(returning&&!returned)fail();active.delete(s);
            for(const [c,had,v]of localKeys){if(had)state.set(c,v);else state.delete(c);}
            return result;
        };
        try{
            run(entry,false);
            if(!resetSeen||!killed||calls.some(c=>!called.has(c))||scopes.some(s=>s.proc&&!visited.has(s)))return false;
            used=true;return current();
        }catch(error){if(error!==refusal)throw error;return false;}
    };
    return Object.freeze({discount,current});
}
