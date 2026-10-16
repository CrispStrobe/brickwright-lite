import {analyseConsoleCaptures} from './console-capture-provenance.js';

// Producer facts are deliberately separate from the exporter's annotation graph.
// Merely being plugged into an ARRAY input never creates an Array fact.
export function createArrayReferenceExportAuthority(project) {
    const bad=Symbol('unproved value'),targets=project.targets||[],nodes=new Map(),records=[],owners=new WeakMap(),invalid=new WeakSet(),snapshots=[];
    const cells=new Map(),values=new WeakMap(),tokens=new WeakMap(),scopes=[],procedures=new Map(),calls=[],mutations=[];
    let invalidGlobalBinding=false;
    const block=(target,id)=>typeof id==='string'?target.blocks?.[id]:null;
    const child=(node,name,target)=>block(target,node?.inputs?.[name]?.[1]);
    const literal=(node,name,target)=>{
        if(node?.fields?.[name])return typeof node.fields[name][0]==='string'?node.fields[name][0]:null;
        const value=node?.inputs?.[name]?.[1];if(Array.isArray(value)&&value[0]===10)return String(value[1]);
        const leaf=block(target,value);return leaf?.shadow&&leaf.opcode==='text'?leaf.fields?.TEXT?.[0]:null;
    };
    const captures=analyseConsoleCaptures({targets,blocks:target=>target.blocks||{},input:(node,name,target)=>child(node,name,target),literal});
    const snapshot=()=>JSON.stringify(targets.map(target=>[target.variables,target.blocks]));
    const original=snapshot();
    for(const target of targets){
        const all=target.blocks||{};nodes.set(target,new Map(Object.entries(all)));
        for(const [id,node]of Object.entries(all)){
            const inputRows=Object.entries(node.inputs||{}).map(([name,input])=>[name,input,input?.[1],input?.[2]]);
            snapshots.push({target,id,node,inputs:node.inputs,fields:node.fields,mutation:node.mutation,inputRows});
        }
        const incoming=new Map();
        for(const node of Object.values(all))for(const id of [node.next,...Object.values(node.inputs||{}).flatMap(input=>[input?.[1],input?.[2]])])if(typeof id==='string'){
            if(!all[id]){invalid.add(node);continue;}if(!incoming.has(id))incoming.set(id,[]);incoming.get(id).push(node);
        }
        for(const [id,node]of Object.entries(all))for(const slot of Object.values(node.inputs||{})){
            if(!Array.isArray(slot)||![1,2,3].includes(slot[0])||slot.length!==(slot[0]===3?3:2)){invalid.add(node);continue;}
            const leaf=(value,fallback=false)=>{
                if(Array.isArray(value))return value.length===2&&[4,5,6,7,8,9,10,11].includes(value[0])||!fallback&&value.length===3&&value[0]===12&&typeof value[1]==='string'&&typeof value[2]==='string';
                const child=all[value];if(typeof value!=='string'||!child||child.parent!==id||(incoming.get(value)||[]).length!==1)return false;
                if(fallback||slot[0]===1&&node.opcode!=='procedures_definition')return child.shadow===true&&!child.next&&!Object.keys(child.inputs||{}).length;
                return node.opcode==='procedures_definition'&&child.opcode==='procedures_prototype'||child.shadow!==true;
            };
            if(!leaf(slot[1])||slot[0]===3&&!leaf(slot[2],true))invalid.add(node);
        }
        for(const [id,node]of Object.entries(all))if(node.topLevel){
            const proto=node.opcode==='procedures_definition'?child(node,'custom_block',target):null;
            let names=[],ids=[],defaults=[],proc=null;
            if(proto)try{names=JSON.parse(proto.mutation.argumentnames);ids=JSON.parse(proto.mutation.argumentids);defaults=JSON.parse(proto.mutation.argumentdefaults);proc=proto.mutation.proccode;}catch{invalid.add(node);}
            const scope={target,root:node,id,proc,params:names,ids,invalid:invalid.has(node),before:new WeakMap(),returns:[],callers:[]};scopes.push(scope);
            if(proto){if(!Array.isArray(names)||!Array.isArray(ids)||!Array.isArray(defaults)){scope.invalid=true;names=[];ids=[];defaults=[];scope.params=names;scope.ids=ids;}
                if(proto.parent!==id||proto.next||Object.keys(proto.inputs||{}).sort().join('|')!==[...ids].sort().join('|')||ids.some((arg,index)=>{const edge=proto.inputs[arg],reporter=all[edge?.[1]];return !reporter||reporter.parent!==Object.keys(all).find(key=>all[key]===proto)||reporter.shadow!==true||reporter.next||Object.keys(reporter.inputs||{}).length||Object.keys(reporter.fields||{}).join('|')!=='VALUE'||reporter.fields.VALUE?.[0]!==names[index];}))scope.invalid=true;
                if(!Array.isArray(names)||!Array.isArray(ids)||!Array.isArray(defaults)||names.length!==ids.length||names.length!==defaults.length||new Set(names).size!==names.length||new Set(ids).size!==ids.length||typeof proc!=='string')scope.invalid=true;
                const key=target;let map=procedures.get(key);if(!map)procedures.set(key,map=new Map());if(map.has(proc)){scope.invalid=true;map.get(proc).invalid=true;}else map.set(proc,scope);}
            const visit=(value,path=new Set())=>{
                if(!value)return;if(path.has(value)){scope.invalid=true;invalid.add(value);return;}if(owners.has(value)){scope.invalid=true;owners.get(value).invalid=true;return;}
                owners.set(value,scope);records.push({target,node:value,scope});const next=new Set([...path,value]);
                const actualId=Object.keys(all).find(key=>all[key]===value),edges=incoming.get(actualId)||[];
                if(value!==node&&(edges.length!==1||all[value.parent]!==edges[0]))invalid.add(value);
                for(const input of Object.values(value.inputs||{}))if(typeof input?.[1]==='string')visit(all[input[1]],next);
                if(typeof value.next==='string')visit(all[value.next],next);
            };
            // Prototype argument reporters are declarations, not executable reads.
            owners.set(node,scope);records.push({target,node,scope});if(node.next)visit(all[node.next],new Set([node]));
        }
    }
    const cell=key=>{if(!cells.has(key))cells.set(key,{key,writers:[],types:new Set(),formal:null});return cells.get(key);};
    const globalCell=(target,id)=>{
        const own=targets.filter(t=>Object.hasOwn(t.variables||{},id));if(own.length!==1)return null;
        const actual=own[0];if(actual!==target&&!actual.isStage)return null;
        const name=actual.variables[id]?.[0];if(typeof name!=='string'||Object.values(actual.variables).filter(row=>row?.[0]===name).length!==1||actual!==target&&Object.values(target.variables||{}).some(row=>row?.[0]===name))return null;
        if(!nodes.has(actual))return null;let map=globalCell.maps.get(actual);if(!map)globalCell.maps.set(actual,map=new Map());if(!map.has(id))map.set(id,{});const value=cell(map.get(id));value.global=true;return value;
    };globalCell.maps=new Map();
    const localCell=(scope,name)=>{if(!scope||scope.invalid||typeof name!=='string'||name==='__proto__')return null;let map=localCell.maps.get(scope);if(!map)localCell.maps.set(scope,map=new Map());if(!map.has(name))map.set(name,{});return cell(map.get(name));};localCell.maps=new Map();
    const capturedCell=(scope,name)=>{const origin=captures.captured(captures.scopeOf(scope.root.next?block(scope.target,scope.root.next):scope.root),name);const value=origin?localCell(scopes.find(s=>s.root===origin.scope.root),name):null;if(value&&!captures.proof(origin))value.types.add(bad);return value;};
    const binding=(target,node)=>{
        const scope=owners.get(node);if(node.opcode==='data_variable'){const id=node.fields?.VARIABLE?.[1],declaration=targets.find(t=>Object.hasOwn(t.variables||{},id))?.variables[id];return declaration?.[0]===node.fields?.VARIABLE?.[0]?globalCell(target,id):null;}
        if(node.opcode==='arcade_getLocal'){const name=literal(node,'NAME',target),value=localCell(scope,name),origin=captures.local(captures.scopeOf(node),name);if(value&&origin&&!captures.proof(origin))value.types.add(bad);return value;}
        if(node.opcode==='arcade_getCaptured')return capturedCell(scope,literal(node,'NAME',target));
        if(node.opcode.startsWith('argument_reporter_'))return localCell(scope,node.fields?.VALUE?.[0]);return null;
    };
    const input=(node,name,target)=>{const raw=node?.inputs?.[name]?.[1];if(typeof raw==='string')return {target,node:block(target,raw)};if(Array.isArray(raw)&&raw[0]===12){const value=globalCell(target,raw[2]);const declaration=targets.find(t=>Object.hasOwn(t.variables||{},raw[2]))?.variables[raw[2]];return declaration?.[0]===raw[1]?{target,cell:value,at:node}:{target,raw:null,at:node};}return {target,raw,at:node};};
    const exactKeys=(node,inputs,fields=[])=>Object.keys(node.inputs||{}).sort().join('|')===[...inputs].sort().join('|')&&Object.keys(node.fields||{}).every(name=>fields.includes(name));
    const schemas={arrays_referenceTruthy:['ARRAY','INDEX'],arrays_referenceItem:['ARRAY','INDEX'],arrays_referenceRemove:['ARRAY','VALUE'],arrays_referenceRandom:['ARRAY'],arrays_referenceLength:['ARRAY'],arrays_referenceSlice:['ARRAY','START','END'],arrays_referenceConcat:['ARRAY','OTHER'],arrays_referenceIndexOf:['ARRAY','VALUE','INDEX'],arrays_referenceTake:['ARRAY','OP','INDEX'],arrays_mutateReference:['ARRAY','OP','INDEX','VALUE']};
    const operationShape=node=>{const expected=schemas[node.opcode];if(!expected)return false;const fieldOp=Object.hasOwn(node.fields||{},'OP'),inputs=fieldOp?expected.filter(name=>name!=='OP'):expected;return exactKeys(node,inputs,fieldOp?['OP']:[]);};
    const argumentList=(target,node)=>{
        const args=[],seen=new Set();let edge=node.inputs?.ARGS?.[1];
        while(typeof edge==='string'){
            const value=block(target,edge);if(!value||seen.has(value)||invalid.has(value))return null;seen.add(value);
            if(value.opcode==='text'&&value.shadow&&value.fields?.TEXT?.[0]==='[]')return args;
            if(value.opcode!=='arcade_functionArgument'||!exactKeys(value,['VALUE','REST']))return null;
            args.push(input(value,'VALUE',target));edge=value.inputs.REST?.[1];
        }
        return Array.isArray(edge)&&edge[0]===10&&edge[1]==='[]'?args:null;
    };
    // VM variable sockets use IDs; this exporter resolves the current name.
    // Both must identify the same unique visible declaration. A mismatch must
    // not lend facts to either the VM destination or the emitted destination.
    const agrees=(target,name,id)=>{
        const c=globalCell(target,id),owner=targets.find(t=>Object.hasOwn(t.variables||{},id));
        return !!c&&typeof name==='string'&&owner.variables[id][0]===name;
    };
    for(const target of targets)for(const node of Object.values(target.blocks||{})){
        if(['data_setvariableto','data_changevariableby','data_variable'].includes(node.opcode)){
            const field=node.fields?.VARIABLE;
            if(!Array.isArray(field)||field.length!==2||!agrees(target,field[0],field[1]))invalidGlobalBinding=true;
            if(!exactKeys(node,node.opcode==='data_variable'?[]:['VALUE'],['VARIABLE'])||node.mutation!=null)invalidGlobalBinding=true;
        }
        for(const slot of Object.values(node.inputs||{}))for(const value of [slot?.[1],slot?.[2]])if(Array.isArray(value)&&value[0]===12&&
            (value.length!==3||!agrees(target,value[1],value[2])))invalidGlobalBinding=true;
    }
    for(const scope of scopes)for(const name of scope.params||[]){const value=localCell(scope,name);if(value)value.formal=scope;}
    for(const {target,node,scope}of records){
        let destination=null;
        if(node.opcode==='data_setvariableto'||node.opcode==='data_changevariableby')destination=globalCell(target,node.fields?.VARIABLE?.[1]);
        else if(node.opcode==='arcade_setLocal')destination=localCell(scope,literal(node,'NAME',target));
        else if(node.opcode==='arcade_setCaptured')destination=capturedCell(scope,literal(node,'NAME',target));
        if(destination&&['arcade_setLocal','arcade_setCaptured'].includes(node.opcode)&&(!exactKeys(node,['NAME','VALUE'])||node.mutation!=null))destination.types.add(bad);
        if(destination)destination.writers.push({target,node,scope,value:node.opcode==='data_changevariableby'?null:input(node,'VALUE',target)});
        if(node.opcode==='arcade_returnValue')scope.returns.push(input(node,'VALUE',target));
        if(['arcade_callFunction','procedures_call'].includes(node.opcode)){
            const name=node.opcode==='arcade_callFunction'?literal(node,'NAME',target):node.mutation?.proccode,fn=procedures.get(target)?.get(name);
            let args=node.opcode==='arcade_callFunction'?argumentList(target,node):null;
            if(node.opcode==='procedures_call'&&fn){let ids;try{ids=JSON.parse(node.mutation.argumentids);}catch{}if(JSON.stringify(ids)===JSON.stringify(fn.ids)&&Object.keys(node.inputs||{}).sort().join('|')===[...fn.ids].sort().join('|'))args=fn.ids.map(id=>input(node,id,target));}
            const call={target,node,scope,fn,args};calls.push(call);if(fn){fn.callers.push(call);if(!args||args.length!==fn.params.length)fn.invalid=true;else fn.params.forEach((name,index)=>localCell(fn,name)?.writers.push({target,node,scope,value:args[index],argument:true}));}
        }
        if(['arrays_mutateReference','arrays_referenceTake','arrays_referenceRemove'].includes(node.opcode))mutations.push({target,node,value:input(node,'VALUE',target)});
    }
    // An unproved dynamic or value-based entry cannot disappear from a
    // procedure's complete caller obligations. Declaration metadata is used
    // only to refuse such escapes, never to issue an Array fact.
    for(const {target,node}of records){
        const functions=procedures.get(target);if(!functions)continue;
        if(node.opcode==='arcade_callFunction'&&literal(node,'NAME',target)===null)for(const fn of functions.values())fn.unknownEntry=true;
        if(node.opcode==='arcade_createCallable'){
            const fn=functions.get(literal(node,'NAME',target));if(fn)fn.unknownEntry=true;
        }
        if(node.opcode==='arcade_declareCallable'){
            let owners;try{owners=JSON.parse(literal(node,'METADATA',target)).plan.owners;}catch{}
            if(!Array.isArray(owners))for(const fn of functions.values())fn.unknownEntry=true;
            else for(const owner of owners){const fn=functions.get(owner?.procedure);if(fn)fn.unknownEntry=true;}
        }
    }
    // A local's explicit null reset may be dead before its first read. This is
    // proved from the current linear body, never a declaration/type exemption.
    const deadReset=(destination,writer)=>{
        if(writer.node.opcode!=='arcade_setLocal'||writer.value?.node?.opcode!=='arrays_specialValue'||!['null','undefined'].includes(literal(writer.value.node,'KIND',writer.target)))return false;
        // Plain-object frames can acquire an inherited setter/nonwritable
        // property through a prototype write. The old adjacent-reset proof
        // has no pointwise prototype-state model, so retain its reset when
        // such a writer could affect this frame.
        if(records.some(r=>literal(r.node,'NAME',r.target)==='__proto__'&&
            (r.scope===writer.scope&&r.node.opcode==='arcade_setLocal'||r.target===writer.target&&r.node.opcode==='arcade_setCaptured')))return false;
        const pure=new Set(['arcade_getLocal','data_variable','math_number','text','arrays_specialValue','arrays_referenceValues','arrays_createReference']);
        const safe=(node,path=new Set())=>{if(!node)return true;if(path.has(node)||!pure.has(node.opcode)||binding(writer.target,node)===destination)return false;const next=new Set([...path,node]);return Object.values(node.inputs||{}).every(slot=>typeof slot[1]!=='string'||safe(block(writer.target,slot[1]),next));};
        let id=writer.node.next;const seen=new Set();
        while(id&&!seen.has(id)){seen.add(id);const node=block(writer.target,id);if(!node||node.opcode!=='arcade_setLocal'||!safe(child(node,'VALUE',writer.target)))return false;
            if(localCell(writer.scope,literal(node,'NAME',writer.target))===destination)return true;id=node.next;}
        return false;
    };
    // This is a closed-project effect proof, not another value/type producer.
    // The bundled procedure primitive creates a fresh params object even for
    // zero arguments. A prefix with no call/registration/capture cannot have
    // published that object into a handler's {values,key} capture storage.
    // In that prefix palette redraw publishes device state, never params;
    // requestRedraw only sets a flag. The builtin device-pane listener only
    // updates its revision. Privileged external JS inspecting runtime threads
    // is outside this closed project boundary (see the compatibility notes).
    // Arrays resolves through the builtin route to the adopted implementation;
    // a saved gallery URL is checked only for consistency, never as authority.
    const effectMetadata=()=>JSON.stringify([project.extensions,project.extensionURLs]);
    const originalEffects=effectMetadata();let extendedResetUsed=false;
    const closedEffects=()=>{
        if(!Array.isArray(project.extensions)||new Set(project.extensions).size!==project.extensions.length||
            !project.extensions.includes('arcade')||!project.extensions.includes('arrays')||
            project.extensions.some(id=>!['arcade','arrays'].includes(id)))return false;
        const urls=project.extensionURLs;
        if(urls!=null&&(typeof urls!=='object'||Array.isArray(urls)||Object.entries(urls).some(([id,url])=>
            id!=='arrays'||url!=='https://crispstrobe.github.io/extensions/CrispStrobe/arrays.js')))return false;
        // These routes can carry an independently supplied owner/entry. They
        // are not in the first-order builtin frame boundary proved here.
        return !records.some(({node,scope})=>scope.invalid||invalid.has(node)||
            /^(arcade_(?:.*Callable|.*Captured|.*Object|.*Class|startParallel|pushScene|popScene)|procedures_callreturn)/.test(node.opcode));
    };
    const overwrittenPrivateReset=(destination,writer)=>{
        const {target,node,scope}=writer,reset=writer.value?.node;
        const shape=(n,inputs,fields=[])=>!!n&&!invalid.has(n)&&owners.get(n)===scope&&n.mutation==null&&
            exactKeys(n,inputs,fields)&&Object.keys(n.fields||{}).length===fields.length;
        const special=n=>shape(n,[],['KIND'])&&Array.isArray(n.fields.KIND)&&n.fields.KIND.length===2&&
            n.fields.KIND[1]===null&&['null','undefined'].includes(n.fields.KIND[0]);
        if(!scope.proc||scope.invalid||scope.unknownEntry||scope.params.length||destination.formal||
            node.opcode!=='arcade_setLocal'||!special(reset)||!shape(node,['NAME','VALUE'])||
            !closedEffects()||!scope.callers.length)return false;
        const name=literal(node,'NAME',target),origin=captures.local(captures.scopeOf(node),name);
        // Native params are plain objects, not Maps: this inherited setter
        // changes the prototype instead of establishing an own lexical cell.
        if(name==='__proto__')return false;
        if(!origin||!captures.proof(origin)||localCell(scope,name)!==destination)return false;
        // Admit only direct ordinary zero-argument entries from source-start.
        // Other callers, nested entries and dynamic calls remain refusals.
        for(const call of scope.callers){
            if(call.target!==target||call.scope.invalid||call.scope.root.opcode!=='arcade_whenSourceStarts'||
                call.node.opcode!=='procedures_call'||!call.args||call.args.length||call.node.mutation?.warp!=='false')return false;
            let at=call.scope.root.next;const visited=new Set();
            while(at&&block(target,at)!==call.node){
                if(visited.has(at))return false;visited.add(at);
                const prior=block(target,at);
                // Only establish that this is a direct entry, not a branch
                // or loop's nested invocation. Earlier caller effects precede
                // allocation of this invocation's fresh params object and
                // therefore cannot have retained that object.
                if(!prior||invalid.has(prior)||owners.get(prior)!==call.scope)return false;
                at=prior.next;
            }
            if(!at)return false;
        }
        const locals=new Map(),published=new Set(),unproved=Symbol('unknown');
        // Identity tokens denote this invocation's actual independent fresh
        // empty heap bodies. Global publication permanently removes mutation
        // credit even if the current name later points somewhere else.
        const scalar=(value,path=new Set())=>{
            if(!value)return unproved;
            if(value.raw){const r=value.raw;if(r.length!==2)return unproved;
                if(r[0]===10&&typeof r[1]==='string')return {kind:'scalar',value:r[1]};
                if([4,5,6,7,8].includes(r[0])&&typeof r[1]==='string'&&Number.isFinite(Number(r[1])))return {kind:'number',value:Number(r[1])};
                return unproved;}
            if(value.cell)return value.cell===destination?unproved:{kind:'stored'};
            const n=value.node;if(!n||path.has(n)||invalid.has(n)||owners.get(n)!==scope)return unproved;
            const next=new Set([...path,n]),operand=k=>scalar(input(n,k,target),next);
            if(n.opcode==='arcade_getLocal'&&shape(n,['NAME'])){
                const key=literal(n,'NAME',target),c=localCell(scope,key);return key==='__proto__'||c===destination?unproved:locals.get(c)||unproved;
            }
            if(n.opcode==='data_variable'&&shape(n,[],['VARIABLE']))return binding(target,n)===destination?unproved:{kind:'stored'};
            if(special(n))return {kind:'scalar'};
            if(n.opcode==='arrays_createReference'&&shape(n,['VALUES'])&&literal(n,'VALUES',target)==='[]')return {kind:'array',site:n};
            if(n.opcode==='operator_add'&&shape(n,['NUM1','NUM2'])||n.opcode==='arrays_valueBinary'&&shape(n,['LEFT','RIGHT'],['OP'])&&['+','%'].includes(literal(n,'OP',target))){
                const a=operand(n.opcode==='operator_add'?'NUM1':'LEFT'),b=operand(n.opcode==='operator_add'?'NUM2':'RIGHT');
                if(a===unproved||b===unproved||a.kind!=='number'||b.kind!=='number')return unproved;
                const v=literal(n,'OP',target)==='%'?a.value%b.value:a.value+b.value;return Number.isFinite(v)?{kind:'number',value:v}:unproved;
            }
            if(n.opcode==='operator_round'&&shape(n,['NUM'])){const v=operand('NUM');return v!==unproved&&v.kind==='number'?{kind:'number',value:Math.round(v.value)}:unproved;}
            // No String/Number coercion of an arbitrary receiver or index. The
            // adopted heap lookup/read and private image clone do not invoke
            // managed callbacks; malformed receivers can fault but cannot
            // expose this private frame. No Array/Image fact escapes here.
            if(n.opcode==='arrays_referenceItem'&&shape(n,['ARRAY','INDEX'])){
                const a=operand('ARRAY'),i=operand('INDEX');return a!==unproved&&i!==unproved&&i.kind==='number'?{kind:'stored'}:unproved;
            }
            if(n.opcode==='arcade_cloneImage'&&shape(n,['IMAGE']))return operand('IMAGE')!==unproved?{kind:'stored'}:unproved;
            return unproved;
        };
        let at=scope.root.next,seenReset=false;const seen=new Set();
        while(at&&!seen.has(at)){
            seen.add(at);const current=block(target,at);
            if(!current||invalid.has(current)||owners.get(current)!==scope)return false;
            if(current.opcode==='arcade_setLocal'&&shape(current,['NAME','VALUE'])){
                const key=literal(current,'NAME',target),c=localCell(scope,key);if(key==='__proto__'||!c||c.formal)return false;
                if(current===node){seenReset=true;locals.set(c,{kind:'scalar'});}
                else {const v=scalar(input(current,'VALUE',target));if(v===unproved)return false;
                    if(c===destination){if(seenReset&&v.kind==='array'){extendedResetUsed=true;return true;}return false;}
                    locals.set(c,v);}
            }else if(current.opcode==='arcade_setPalette'&&shape(current,['DATA'])&&/^[0-9a-fA-F]{96}$/.test(literal(current,'DATA',target)||'')){
                // Qualified render/state event effects preserved; prefix has
                // not retained params in ANY callback owner (not just this key).
            }else if(current.opcode==='data_setvariableto'&&shape(current,['VALUE'],['VARIABLE'])){
                const field=current.fields.VARIABLE,owner=targets.find(t=>Object.hasOwn(t.variables||{},field?.[1])),row=owner?.variables?.[field?.[1]];
                if(!Array.isArray(row)||row.length!==2||row[0]!==field?.[0]||!globalCell(target,field?.[1]))return false;
                const v=scalar(input(current,'VALUE',target));if(v===unproved)return false;if(v.kind==='array')published.add(v);
            }else if(current.opcode==='arrays_mutateReference'&&shape(current,['ARRAY','OP','INDEX','VALUE'])&&literal(current,'OP',target)==='push'){
                const receiver=scalar(input(current,'ARRAY',target)),index=scalar(input(current,'INDEX',target)),value=scalar(input(current,'VALUE',target));
                if(receiver===unproved||receiver.kind!=='array'||published.has(receiver)||index===unproved||index.kind!=='number'||index.value!==0||value===unproved)return false;
                // A value may not publish another independent body whose later
                // mutation could be observed through this Array's aliases.
                if(value.kind==='array')published.add(value);
            }else return false;
            at=current.next;
        }
        return false;
    };
    for(const destination of cells.values())destination.writers=destination.writers.filter(writer=>
        !deadReset(destination,writer)&&!overwrittenPrivateReset(destination,writer));
    // Orphan writes and dynamic local names cannot disappear from all-writer proof.
    for(const target of targets)for(const node of Object.values(target.blocks||{})){
        if(!owners.has(node)&&['data_setvariableto','data_changevariableby'].includes(node.opcode)){const c=globalCell(target,node.fields?.VARIABLE?.[1]);if(c)c.types.add(bad);}
        if(['arcade_setLocal','arcade_setCaptured'].includes(node.opcode)&&literal(node,'NAME',target)===null){const owner=owners.get(node);for(const c of cells.values())if(localCell.maps.get(owner)&&[...localCell.maps.get(owner).values()].includes(c.key))c.types.add(bad);}
    }
    const singleArray=types=>types.size>0&&[...types].every(type=>type&&typeof type==='object'&&type.array===true);
    const token=(node,target,items,minLength=items.length)=>{if(!tokens.has(node))tokens.set(node,{array:true,node,target,items,minLength,elements:new Set(),sources:new Set(items)});return tokens.get(node);};
    const jsonArray=(array,node,target,origin=null)=>{
        const allocation=token(node,target,array.map(value=>Array.isArray(value)?{jsonArray:value,identity:{}}:{raw:[typeof value==='string'?10:4,String(value)]}),array.length);
        if(origin)allocation.origin=origin;
        for(const value of allocation.items)if(value.jsonArray)value.origin=allocation;
        return allocation;
    };
    const readInput=value=>{
        if(!value)return new Set([bad]);if(value.cell)return new Set(value.cell.types);if(value.jsonArray)return new Set([jsonArray(value.jsonArray,value.identity,null,value.origin)]);if(value.node)return readNode(value.target,value.node);return new Set([bad]);
    };
    const literalNumber=(target,node,name)=>{const v=input(node,name,target);if(v.raw&&[4,5,6,7,8].includes(v.raw[0]))return Number(v.raw[1]);if(v.node?.shadow&&v.node.opcode==='math_number')return Number(v.node.fields?.NUM?.[0]);return null;};
    // A reset can be ignored for KIND facts only when a synchronous source-start
    // segment overwrites it before any observer can read that particular cell.
    // The general Array cell writer set remains unchanged.
    const fixedUndefined=node=>node?.opcode==='arrays_specialValue'&&exactKeys(node,[],['KIND'])&&Object.keys(node.fields||{}).length===1&&Array.isArray(node.fields.KIND)&&node.fields.KIND.length===2&&node.fields.KIND[0]==='undefined'&&node.fields.KIND[1]===null;
    const deadKindReset=(destination,writer)=>{
        const {target,node,scope}=writer;
        if(scope.root.opcode!=='arcade_whenSourceStarts'||node.opcode!=='data_setvariableto'||!exactKeys(node,['VALUE'],['VARIABLE'])||invalid.has(node)||
            !fixedUndefined(writer.value?.node))return false;
        const knownNumbers=new Set(),seen=new Set();
        const scalar=value=>{
            if(value?.raw)return [4,5,6,7,8].includes(value.raw[0])&&!Number.isNaN(Number(value.raw[1]))?'number':null;
            const n=value?.node;if(!n||invalid.has(n))return null;
            if(n.shadow&&n.opcode==='math_number'&&!Object.keys(n.inputs||{}).length)return !Number.isNaN(Number(n.fields?.NUM?.[0]))?'number':null;
            if(n.opcode==='arcade_createSpriteKind'&&exactKeys(n,[]))return 'number';
            if(fixedUndefined(n))return 'undefined';
            return null;
        };
        let id=node.next;
        while(id&&!seen.has(id)){
            seen.add(id);const next=block(target,id);if(!next||invalid.has(next)||owners.get(next)!==scope)return false;
            if(next.opcode==='data_setvariableto'&&exactKeys(next,['VALUE'],['VARIABLE'])){
                const name=next.fields?.VARIABLE,id=name?.[1],declaration=targets.find(owner=>Object.hasOwn(owner.variables||{},id))?.variables[id],c=globalCell(target,id),kind=scalar(input(next,'VALUE',target));
                if(!c||declaration?.[0]!==name?.[0]||!kind)return false;
                if(c===destination)return kind==='number';
                if(kind==='number')knownNumbers.add(c);else knownNumbers.delete(c);
            }else if(next.opcode==='arcade_bindSpriteKind'&&exactKeys(next,['NAME','KIND'])&&typeof literal(next,'NAME',target)==='string'){
                const value=input(next,'KIND',target),c=value.cell||(value.node&&binding(target,value.node));
                if(!c||c===destination||!knownNumbers.has(c))return false;
            }else return false;
            id=next.next;
        }
        return false;
    };
    // Existing allOfKind completes with a fresh Array; its elements are not
    // issued SDK Sprite facts here. KIND still needs actual numeric producers.
    const numericKind=(value,path=new Set())=>{
        if(!value)return false;if(value.raw)return [4,5,6,7,8].includes(value.raw[0])&&!Number.isNaN(Number(value.raw[1]));
        const node=value.node,c=value.cell||(node&&binding(value.target,node));if(c){if(path.has(c)||!c.writers.length)return false;const next=new Set([...path,c]);return c.writers.every(w=>!invalid.has(w.node)&&!w.scope.invalid&&(deadKindReset(c,w)||w.value&&numericKind(w.value,next)));}
        if(!node||invalid.has(node)||path.has(node))return false;const next=new Set([...path,node]);
        if(node.shadow&&node.opcode==='math_number')return !Number.isNaN(Number(node.fields?.NUM?.[0]));
        if(node.opcode==='arcade_createSpriteKind')return exactKeys(node,[]);
        if(node.opcode==='arcade_spriteKindValue')return exactKeys(node,['NAME'])&&typeof literal(node,'NAME',value.target)==='string';
        if(node.opcode==='arrays_valueBinary')return ['+','-','*','/','%','**','&','|','^','<<','>>','>>>'].includes(literal(node,'OP',value.target))&&numericKind(input(node,'LEFT',value.target),next)&&numericKind(input(node,'RIGHT',value.target),next);
        return false;
    };
    const namedBinding=(target,node)=>{
        if(node.opcode!=='arrays_namedReference'||!exactKeys(node,['NAME']))return null;
        const name=literal(node,'NAME',target),scope=owners.get(node),before=scope?.executedBefore.get(node);
        if(typeof name!=='string'||Object.hasOwn(Object.prototype,name)||!before)return new Set([bad]);
        const writes=records.filter(r=>['arrays_createEmpty','arrays_create1D','arrays_create2D','arrays_createZeros','arrays_range','arrays_delete'].includes(r.node.opcode));
        // A dynamic or independently executing registry writer cannot lend a
        // stable binding to this read. Copies already issued remain body aliases.
        if(writes.some(r=>literal(r.node,'NAME',r.target)===null||literal(r.node,'NAME',r.target)===name&&r.scope!==scope))return new Set([bad]);
        const ordered=[...before].filter(n=>writes.some(w=>w.node===n&&literal(n,'NAME',target)===name));const writer=ordered.at(-1);
        if(!writer||invalid.has(writer))return new Set([bad]);
        let value=[];
        if(writer.opcode!=='arrays_createEmpty'){
            if(!['arrays_create1D','arrays_create2D'].includes(writer.opcode)||!exactKeys(writer,['NAME','JSON']))return new Set([bad]);
            const json=literal(writer,'JSON',target);if(typeof json!=='string')return new Set([bad]);try{value=JSON.parse(json);}catch{value=writer.opcode==='arrays_create2D'?[[]]:[];}if(!Array.isArray(value))return new Set([bad]);
        }else if(!exactKeys(writer,['NAME']))return new Set([bad]);
        const allocation=jsonArray(value,writer,target);
        if(records.some(r=>r.node.opcode.startsWith('arrays_')&&r.node.inputs?.NAME&&literal(r.node,'NAME',r.target)===name&&!['arrays_namedReference','arrays_createEmpty','arrays_create1D','arrays_create2D','arrays_length','arrays_get'].includes(r.node.opcode)))allocation.elements.add(bad);
        return new Set([allocation]);
    };
    const factories=(target,node)=>{
        if(node.opcode!=='arrays_createReference')return null;if(!exactKeys(node,['VALUES']))return new Set([bad]);
        const items=[],seen=new Set();let edge=node.inputs.VALUES?.[1];
        while(typeof edge==='string'){
            const item=block(target,edge);if(!item||invalid.has(item)||seen.has(item))return new Set([bad]);seen.add(item);
            if(item.opcode==='text'&&item.shadow){edge=[10,item.fields?.TEXT?.[0]];break;}
            if(item.opcode!=='arrays_referenceValues'||!exactKeys(item,['VALUE','REST']))return new Set([bad]);items.push(input(item,'VALUE',target));edge=item.inputs.REST?.[1];
        }
        if(!Array.isArray(edge)||edge[0]!==10)return new Set([bad]);let tail;try{tail=JSON.parse(edge[1]);}catch{return new Set([bad]);}if(!Array.isArray(tail)||items.length&&tail.length)return new Set([bad]);
        return new Set([items.length?token(node,target,items):jsonArray(tail,node,target)]);
    };
    const returnsAlways=(target,id,path=new Set())=>{
        if(!id||path.has(id))return false;const n=block(target,id);if(!n)return false;const next=new Set([...path,id]);if(n.opcode==='arcade_returnValue')return true;
        if(n.opcode==='control_if_else'&&returnsAlways(target,n.inputs?.SUBSTACK?.[1],next)&&returnsAlways(target,n.inputs?.SUBSTACK2?.[1],next))return true;
        return returnsAlways(target,n.next,next);
    };
    const reading=new Set();
    function readNode(target,node){
        if(reading.has(node))return new Set([bad]);
        reading.add(node);try{return computeNode(target,node);}finally{reading.delete(node);}
    }
    function computeNode(target,node){
        if(!node||invalid.has(node)||owners.get(node)?.invalid)return new Set([bad]);
        const c=binding(target,node);if(c)return new Set(c.types);
        const allocated=factories(target,node);if(allocated)return allocated;const named=namedBinding(target,node);if(named)return named;
        if(node.opcode==='arcade_spritesOfKind')return exactKeys(node,['KIND'])&&numericKind(input(node,'KIND',target))?new Set([token(node,target,[{raw:[10,'SDK Sprite element not an Array']}],0)]):new Set([bad]);
        if(['arrays_referenceSlice','arrays_referenceConcat'].includes(node.opcode)){
            const left=readInput(input(node,'ARRAY',target)),right=node.opcode==='arrays_referenceConcat'?readInput(input(node,'OTHER',target)):new Set();
            if(!operationShape(node))return new Set([bad]);if(!left.size||node.opcode==='arrays_referenceConcat'&&!right.size)return new Set();
            if(!singleArray(left)||node.opcode==='arrays_referenceConcat'&&!singleArray(right))return new Set([bad]);
            const t=token(node,target,[],0);for(const a of [...left,...right]){for(const v of a.elements)t.elements.add(v);for(const source of a.sources)t.sources.add(source);}return new Set([t]);
        }
        if(['arrays_referenceItem','arrays_referenceTake','arrays_referenceRandom'].includes(node.opcode)||node.opcode==='arrays_mutateReference'&&['pop','shift','removeAt'].includes(literal(node,'OP',target))){
            const receiver=readInput(input(node,'ARRAY',target));if(!operationShape(node))return new Set([bad]);if(!receiver.size)return new Set();if(!singleArray(receiver))return new Set([bad]);const result=new Set();
            for(const a of receiver){
                if(!presentAt(a,target,node)){
                    // Empty MAY facts are pending, not a proved absent body.
                    // Do not poison a cell irreversibly before formal/alias
                    // argument facts reach a dominating mutation receiver.
                    if(pendingPresence(a,node))return new Set();
                    result.add(bad);
                }
                for(const item of a.elements)result.add(item);
            }return result;
        }
        if(node.opcode==='arcade_callFunction'){
            const call=calls.find(call=>call.node===node);if(!call?.fn||call.fn.invalid||!call.args||!returnsAlways(target,call.fn.root.next))return new Set([bad]);
            const out=new Set();for(const value of call.fn.returns)for(const type of readInput(value))out.add(type);return out;
        }
        return new Set([bad]);
    }
    // Availability is an occurrence property, not a cell's eventual type union.
    for(const scope of scopes){
        scope.executedBefore=new WeakMap();
        const walk=(id,known,path=new Set(),executed=new Set())=>{
            if(!id||path.has(id))return known;const node=block(scope.target,id);if(!node)return known;const next=new Set([...path,id]);
            const expressionPath=new Set();const expressions=value=>{if(!value||expressionPath.has(value))return;expressionPath.add(value);scope.before.set(value,new Set(known));scope.executedBefore.set(value,new Set(executed));for(const [name,slot]of Object.entries(value.inputs||{}))if(!name.startsWith('SUBSTACK'))expressions(block(scope.target,slot[1]));};expressions(node);
            if(node.opcode==='data_setvariableto'){const c=globalCell(scope.target,node.fields?.VARIABLE?.[1]);if(c)known.add(c);}
            if(node.opcode==='arcade_setLocal'){const c=localCell(scope,literal(node,'NAME',scope.target));if(c)known.add(c);}
            for(const name of ['SUBSTACK','SUBSTACK2'])if(node.inputs?.[name])walk(node.inputs[name][1],new Set(known),next,new Set(executed));
            executed.add(node);return walk(node.next,known,next,executed);
        };walk(scope.root.next,new Set((scope.params||[]).map(name=>localCell(scope,name)).filter(Boolean)));
    }
    // Type tokens describe allocation sites and MAY writers, not body identity.
    // Mutation-derived presence needs an independent proof that this actual
    // allocation occurrence executes at most once in the current startup.
    // In particular neither a factory return site nor a loop callsite is a body.
    // Managed heap/label entry is not a static calls[] edge. This catalogue
    // only removes once authority: metadata can never create a producer fact.
    // Object dispatch uses the invocation target, so names poison matching
    // procedures across targets, not merely the declaration's target.
    const implicitEntries=new WeakSet();
    const managedName=name=>{
        if(typeof name!=='string'){for(const scope of scopes)if(scope.proc)implicitEntries.add(scope);return;}
        if(name)for(const scope of scopes)if(scope.proc===name)implicitEntries.add(scope);
    };
    for(const target of targets)for(const node of Object.values(target.blocks||{})){
        if(['arcade_declareClass','arcade_declareSubclass'].includes(node.opcode)){
            try{
                managedName(literal(node,'INITIALIZER',target));managedName(literal(node,'CONSTRUCTOR',target));
                const fields=JSON.parse(literal(node,'FIELDS',target)),methods=JSON.parse(literal(node,'METHODS',target));
                if(!Array.isArray(fields)||!Array.isArray(methods))throw Error('opaque managed entry');
                for(const field of fields){if(!field||typeof field!=='object')throw Error('opaque accessor');
                    if(Object.hasOwn(field,'getter')){if(typeof field.getter!=='string')throw Error('opaque getter');managedName(field.getter);}
                    if(Object.hasOwn(field,'setter')){if(!field.setter||typeof field.setter.procedure!=='string')throw Error('opaque setter');managedName(field.setter.procedure);}}
                for(const method of methods){if(!method||typeof method.procedure!=='string')throw Error('opaque method');managedName(method.procedure);}
            }catch{managedName(null);}
        }
        if(['arcade_declareCallable','arcade_createCallable','arcade_whenCallableDispatched'].includes(node.opcode))managedName(literal(node,'NAME',target));
    }
    const onceScopes=new WeakMap();
    // Closed evaluation contexts only. Repeat header reporters are reevaluated
    // by execute._ops on later entries; even TIMES/list inputs are not once.
    // Unknown headers and extra effect sockets cannot lend execution bounds.
    const onceParent=(parent,name)=>{
        if(['control_if','control_if_else'].includes(parent.opcode))return exactKeys(parent,parent.opcode==='control_if'?['CONDITION','SUBSTACK']:['CONDITION','SUBSTACK','SUBSTACK2']);
        if(parent.opcode==='data_setvariableto')return name==='VALUE'&&exactKeys(parent,['VALUE'],['VARIABLE']);
        if(['arcade_setLocal','arcade_setCaptured'].includes(parent.opcode))return name==='VALUE'&&exactKeys(parent,['NAME','VALUE']);
        if(parent.opcode==='arcade_returnValue')return name==='VALUE'&&exactKeys(parent,['VALUE']);
        if(parent.opcode==='arrays_createReference')return name==='VALUES'&&exactKeys(parent,['VALUES']);
        if(['arrays_referenceValues','arcade_functionArgument'].includes(parent.opcode))return exactKeys(parent,['VALUE','REST']);
        if(parent.opcode==='arcade_callFunction')return name==='ARGS'&&exactKeys(parent,['NAME','ARGS'])&&typeof literal(parent,'NAME',owners.get(parent).target)==='string';
        if(parent.opcode==='procedures_call'){const call=calls.find(call=>call.node===parent);return !!call?.fn&&!call.fn.invalid&&!!call.args&&Object.keys(parent.fields||{}).length===0;}
        if(schemas[parent.opcode])return operationShape(parent);
        const scalarInputs={arrays_valueBinary:['LEFT','RIGHT'],arrays_valueUnary:['VALUE'],operator_add:['NUM1','NUM2'],operator_subtract:['NUM1','NUM2'],operator_multiply:['NUM1','NUM2'],operator_divide:['NUM1','NUM2'],operator_mod:['NUM1','NUM2'],operator_lt:['OPERAND1','OPERAND2'],operator_gt:['OPERAND1','OPERAND2'],operator_equals:['OPERAND1','OPERAND2'],operator_and:['OPERAND1','OPERAND2'],operator_or:['OPERAND1','OPERAND2'],operator_not:['OPERAND'],operator_join:['STRING1','STRING2'],operator_length:['STRING'],operator_letter_of:['LETTER','STRING'],operator_contains:['STRING1','STRING2'],operator_round:['NUM']};
        const inputs=scalarInputs[parent.opcode];if(!inputs)return false;
        if(parent.opcode.startsWith('arrays_value'))return exactKeys(parent,Object.hasOwn(parent.fields||{},'OP')?inputs:[...inputs,'OP'],['OP'])&&inputs.includes(name);
        return exactKeys(parent,inputs);
    };
    const onceNode=(node,path=new Set())=>{
        const scope=owners.get(node);if(!scope||scope.invalid||invalid.has(node))return false;
        let current=node;const seen=new Set();
        while(current!==scope.root){
            if(seen.has(current))return false;seen.add(current);
            const parent=block(scope.target,current.parent);if(!parent||invalid.has(parent)||owners.get(parent)!==scope)return false;
            const id=Object.keys(scope.target.blocks).find(id=>scope.target.blocks[id]===current);
            if(parent.next!==id){
                const inputs=Object.entries(parent.inputs||{}).filter(([,slot])=>slot[1]===id);
                if(inputs.length!==1||!onceParent(parent,inputs[0][0]))return false;
            }
            current=parent;
        }
        return onceScope(scope,path);
    };
    const onceScope=(scope,path)=>{
        if(onceScopes.has(scope))return onceScopes.get(scope);
        if(scope.invalid||scope.unknownEntry||implicitEntries.has(scope)||path.has(scope))return false;
        const next=new Set([...path,scope]);
        const result=scope.proc?scope.callers.length===1&&!!scope.callers[0].args&&onceNode(scope.callers[0].node,next):scope.root.opcode==='arcade_whenSourceStarts';
        onceScopes.set(scope,result);return result;
    };
    const uniqueAllocation=(allocation,path=new Set())=>{
        if(!allocation||path.has(allocation))return false;
        const next=new Set([...path,allocation]);
        return allocation.origin?uniqueAllocation(allocation.origin,next):!!allocation.target&&onceNode(allocation.node);
    };
    const minimumAt=(allocation,at,qualifies=()=>true)=>{
        if([...allocation.shrinks||[]].some(node=>node!==at))return 0;
        const scope=owners.get(at),before=scope?.executedBefore.get(at)||new Set();let length=allocation.minLength;
        // A possible target receives element-type obligations below, but only
        // a unique actual target receives guaranteed-presence credit.
        for(const {target,node}of mutations){const receiver=readInput(input(node,'ARRAY',target));if(before.has(node)&&['push','unshift'].includes(literal(node,'OP',target))&&receiver.size===1&&receiver.has(allocation)&&uniqueAllocation(allocation)&&qualifies(target,node))length++;}
        return length;
    };
    const pendingPresence=(allocation,at)=>{
        if(!uniqueAllocation(allocation))return false;
        const before=owners.get(at)?.executedBefore.get(at)||new Set();
        return mutations.some(({target,node})=>before.has(node)&&['push','unshift'].includes(literal(node,'OP',target))&&readInput(input(node,'ARRAY',target)).size===0);
    };
    const presentAt=(allocation,target,node,qualifies)=>{
        const length=minimumAt(allocation,node,qualifies),index=literalNumber(target,node,'INDEX');
        return node.opcode==='arrays_referenceRandom'||node.opcode==='arrays_referenceTake'&&['pop','shift'].includes(literal(node,'OP',target))?length>0:index!==null&&Number.isInteger(index)&&index>=0&&index<length;
    };
    // Monotone producer flow handles genuine alias SCCs with an allocation;
    // cycles in the physical block graph were independently refused above.
    let changed;
    const populate=(t,seen=new Set())=>{if(!t||typeof t!=='object'||!t.array||seen.has(t))return;seen.add(t);for(const item of t.items)for(const type of readInput(item))if(!t.elements.has(type)){t.elements.add(type);changed=true;}for(const type of t.elements)populate(type,seen);};
    do{
        changed=false;
        for(const c of cells.values())for(const w of c.writers){const types=w.value&&!invalid.has(w.node)&&!w.scope.invalid?readInput(w.value):new Set([bad]);for(const type of types)if(!c.types.has(type)){c.types.add(type);changed=true;}}
        for(const {target,node}of records){const types=readNode(target,node);values.set(node,types);for(const t of types)populate(t);}
        for(const {target,node,value}of mutations){const receiver=readInput(input(node,'ARRAY',target)),op=literal(node,'OP',target)||literal(node,'MODE',target);for(const t of receiver)if(t&&typeof t==='object'&&t.array){t.shrinks ||= new Set();if((['pop','shift','removeAt','length','removeElement'].includes(op)||node.opcode==='arrays_referenceRemove')&&!t.shrinks.has(node)){t.shrinks.add(node);changed=true;}if(['push','unshift','insertAt','set'].includes(op)){t.sources.add(value);for(const type of readInput(value))if(!t.elements.has(type)){t.elements.add(type);changed=true;}}}}
    }while(changed);
    for(const c of cells.values())if(!c.types.size)c.types.add(bad);
    const initializingCells=new Set();
    const availability=(c,scope,node,path=new Set())=>{
        if(!c||!scope||scope.invalid||scope.unknownEntry)return 0;
        if(path.has(scope))return c.global&&singleArray(c.types)?1:0;if(c.formal===scope){if(initializingCells.has(c))return 0;initializingCells.add(c);try{return scope.callers.length>0&&c.writers.every(writer=>!writer.argument||initialized(writer.value))?2:0;}finally{initializingCells.delete(c);}}
        if(scope.before.get(node)?.has(c))return 2;
        const next=new Set([...path,scope]);let entries=scope.callers;
        if(!entries.length){
            const registrationPairs={arcade_whenRegisteredMultiplayerConnection:'arcade_registerMultiplayerConnection',arcade_whenRegisteredControlEvent:'arcade_registerControlEvent',arcade_whenParallelHandler:'arcade_startParallelHandler',arcade_whenRegisteredLegacyWall:'arcade_registerLegacyWallHandler',arcade_whenRegisteredMultiplayerButton:'arcade_registerMultiplayerButtonHandler',arcade_whenRegisteredCreated:'arcade_registerSpriteCreated',arcade_whenRegisteredWall:'arcade_registerWallHandler',arcade_whenRegisteredTile:'arcade_registerTileHandler',arcade_whenRegisteredUpdate:'arcade_registerUpdateHandler',arcade_whenRegisteredInterval:'arcade_registerIntervalHandler',arcade_whenRegisteredButton:'arcade_registerButtonHandler',arcade_whenRegisteredPaint:'arcade_registerPaintHandler',arcade_whenRegisteredShade:'arcade_registerShadeHandler',arcade_whenRegisteredInstanceDestroyed:'arcade_registerInstanceDestroyedHandler',arcade_whenRegisteredKindDestroyed:'arcade_registerDestroyedHandler',arcade_whenRegisteredOverlap:'arcade_registerOverlapHandler',arcade_whenRegisteredScenePush:'arcade_registerScenePushHandler',arcade_whenRegisteredScenePop:'arcade_registerScenePopHandler',arcade_whenRegisteredForever:'arcade_registerForeverHandler',arcade_whenRegisteredLifeZero:'arcade_registerLifeZeroHandler',arcade_whenRegisteredCountdown:'arcade_registerCountdownHandler'};
            const expected=registrationPairs[scope.root.opcode],token=literal(scope.root,'TOKEN',scope.target);
            if(expected&&typeof token==='string'&&scope.root.inputs?.TOKEN){
                const hats=scopes.filter(s=>s.root.opcode===scope.root.opcode&&literal(s.root,'TOKEN',s.target)===token);
                const found=records.filter(r=>r.node.opcode===expected&&(literal(r.node,'TOKEN',r.target)===token||literal(r.node,'TOKEN',r.target)===null));
                if(hats.length===1&&found.length===1&&found[0].target===scope.target&&found[0].node.inputs?.TOKEN&&!invalid.has(found[0].node))entries=found;
            }
        }
        const proofs=entries.map(entry=>availability(c,entry.scope,entry.node,next));
        return proofs.length&&proofs.every(Boolean)?proofs.some(proof=>proof===2)?2:1:0;
    };
    // 1 is a provisional global recursion edge; only an independently
    // initialized external entry or dominating write can finalize it as 2.
    const available=(c,scope,node)=>availability(c,scope,node)===2;
    const numericKindInitialized=(value,path=new Set())=>{
        if(!numericKind(value))return false;
        const node=value?.node,c=value?.cell||(node&&binding(value.target,node));
        if(!c)return true;
        const at=value.at||node;if(path.has(c)||!available(c,owners.get(at),at))return false;
        const next=new Set([...path,c]);
        return c.writers.length>0&&c.writers.every(writer=>deadKindReset(c,writer)||numericKindInitialized(writer.value,next));
    };
    const checkingWriterInitialization=new Set();
    const initialized=(value,path=new Set())=>{
        if(!value)return false;if(value.jsonArray)return true;
        const initializedCell=(c,scope,at)=>{if(!available(c,scope,at))return false;if(checkingWriterInitialization.has(c))return true;checkingWriterInitialization.add(c);try{return c.writers.length>0&&c.writers.every(w=>w.value&&initialized(w.value));}finally{checkingWriterInitialization.delete(c);}};
        if(value.cell)return initializedCell(value.cell,owners.get(value.at),value.at);
        if(!value.node)return false;const {target,node}=value;if(path.has(node))return false;const next=new Set([...path,node]),c=binding(target,node);
        if(c)return initializedCell(c,owners.get(node),node);
        if(node.opcode==='arrays_createReference')return true;
        if(node.opcode==='arrays_namedReference')return singleArray(namedBinding(target,node)||new Set());
        if(node.opcode==='arcade_callFunction'){
            const call=calls.find(c=>c.node===node);return !!call?.fn&&!call.fn.invalid&&!!call.args&&call.args.every(arg=>singleArray(readInput(arg))?initialized(arg,next):true)&&call.fn.returns.every(result=>initialized(result,next));
        }
        if(['arrays_referenceSlice','arrays_referenceConcat','arrays_referenceItem','arrays_referenceTake','arrays_referenceRandom','arrays_mutateReference'].includes(node.opcode)){
            if(!initialized(input(node,'ARRAY',target),next)||node.opcode==='arrays_referenceConcat'&&!initialized(input(node,'OTHER',target),next))return false;
            if(['arrays_referenceItem','arrays_referenceTake','arrays_referenceRandom','arrays_mutateReference'].includes(node.opcode)){
                const receiver=readInput(input(node,'ARRAY',target));if(!singleArray(receiver))return false;
                for(const allocation of receiver){
                    if(!presentAt(allocation,target,node,(t,mutation)=>initialized(input(mutation,'ARRAY',t),next)))return false;
                    for(const source of allocation.sources||[])if(!initialized(source,next))return false;
                }
            }
            return true;
        }
        if(node.opcode==='arcade_spritesOfKind'&&exactKeys(node,['KIND']))return numericKindInitialized(input(node,'KIND',target));
        return false;
    };
    const live=()=>project.targets===targets&&snapshot()===original&&(!extendedResetUsed||effectMetadata()===originalEffects)&&snapshots.every(s=>s.target.blocks?.[s.id]===s.node&&s.node.inputs===s.inputs&&s.node.fields===s.fields&&s.node.mutation===s.mutation&&s.inputRows.every(([name,row,a,b])=>s.node.inputs?.[name]===row&&row?.[1]===a&&row?.[2]===b));
    return Object.freeze({validateInput(target,node,name='ARRAY'){
        if(invalidGlobalBinding)return {ok:false,reason:'current variable name, ID, owner or writer schema does not agree'};
        if(!live()||!nodes.get(target)||!owners.has(node)||invalid.has(node)||nodes.get(target).get(Object.keys(target.blocks||{}).find(id=>target.blocks[id]===node))!==node)return {ok:false,reason:'current target, input or connected graph changed'};
        if(!operationShape(node))return {ok:false,reason:'requires the exact supported current operation input schema'};
        const value=input(node,name,target),types=readInput(value);return singleArray(types)&&initialized(value)?{ok:true}:{ok:false,reason:'requires an actual initialized Array producer and compatible all writers'};
    }});
}
