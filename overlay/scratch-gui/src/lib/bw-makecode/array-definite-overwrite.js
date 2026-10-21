import {isProjectJsonSnapshot} from './project-json-snapshot.js';
// A reaching-reset proof only. No value, Array, element or body fact is issued.
// The caller supplies its already indexed actual cells/scopes and retains every
// non-discounted writer in the independent producer/all-writer analysis.
export const createArrayDefiniteOverwrite = context => {
    if(!isProjectJsonSnapshot(context.project))return ()=>false;
    const {project,targets,scopes,records,calls,owners,invalid,implicitEntries,
        block,child,input,literal: menuLiteral,binding,globalCell,localCell,exactKeys,resetValue,
        ordinarySummaryGlobal,statementOf,closedEffects,isArrayMenuSelector,isKnownArrayMenuOperation}=context;
    const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
    // A root brand does not brand an inherited property. Audit the actual
    // indexed graph through its own parsed edges before using existing readers.
    const descriptor=Object.getOwnPropertyDescriptor,keys=Reflect.ownKeys;
    const data=(value,key)=>value&&typeof value==='object'?descriptor(value,key)?.value:undefined;
    const owned=new WeakSet(),pending=[project];
    for(let at=0;at<pending.length;at++){
        const value=pending[at];if(!value||typeof value!=='object'||owned.has(value))continue;
        owned.add(value);
        for(const key of keys(value)){const child=data(value,key);if(child&&typeof child==='object')pending.push(child);}
    }
    const record=value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&owned.has(value);
    const dense=value=>{
        if(!Array.isArray(value)||!owned.has(value))return false;
        for(let i=0;i<data(value,'length');i++)if(!own(value,i+''))return false;
        return true;
    };
    // These are input dictionary reserved names, never a block ID, variable ID,
    // socket or field. Other inherited names cannot supply source records.
    const reserved=new Set(['constructor','__defineGetter__','__defineSetter__','hasOwnProperty',
        '__lookupGetter__','__lookupSetter__','isPrototypeOf','propertyIsEnumerable','toString','valueOf','__proto__','toLocaleString']);
    const dictionary=value=>{
        if(!record(value))return false;
        for(const key of keys(value))if(typeof key!=='string'||reserved.has(key))return false;
        let parent=Object.getPrototypeOf(value);
        while(parent){
            for(const key of keys(parent))if(typeof key!=='string'||!reserved.has(key))return false;
            parent=Object.getPrototypeOf(parent);
        }
        return true;
    };
    const optional=(value,name)=>own(value,name)||!(name in value);
    const ownGraph=()=>{
        if(data(project,'targets')!==targets||!dense(targets)||!dense(data(project,'extensions')))return false;
        for(const name of ['monitors','extensionURLs'])if(!optional(project,name))return false;
        if(own(project,'extensionURLs')&&data(project,'extensionURLs')!==null&&!dictionary(data(project,'extensionURLs')))return false;
        if(own(project,'monitors')){
            const monitors=data(project,'monitors');if(!dense(monitors))return false;
            for(let i=0;i<monitors.length;i++){
                const m=data(monitors,i+'');if(!record(m)||typeof data(m,'opcode')!=='string')return false;
                for(const name of ['visible','mode','params','id','spriteName'])if(!optional(m,name))return false;
                if(own(m,'params')&&!dictionary(data(m,'params')))return false;
            }
        }
        for(let i=0;i<targets.length;i++){
            const target=data(targets,i+'');
            if(!record(target)||typeof data(target,'isStage')!=='boolean'||!dictionary(data(target,'blocks'))||!dictionary(data(target,'variables')))return false;
            for(const name of ['lists','broadcasts','comments','name'])if(!optional(target,name))return false;
            for(const value of Object.values(data(target,'variables')))if(!dense(value))return false;
            const blocks=data(target,'blocks');
            for(const node of Object.values(blocks)){
                if(!record(node)||typeof data(node,'opcode')!=='string'||!dictionary(data(node,'inputs'))||!dictionary(data(node,'fields')))return false;
                for(const name of ['next','parent','shadow','topLevel','mutation'])if(!optional(node,name))return false;
                if(own(node,'mutation')&&data(node,'mutation')!==null&&!dictionary(data(node,'mutation')))return false;
                for(const name of ['next','parent']){const id=data(node,name);if(typeof id==='string'&&!own(blocks,id))return false;}
                for(const field of Object.values(data(node,'fields')))if(!dense(field))return false;
                for(const slot of Object.values(data(node,'inputs'))){
                    if(!dense(slot))return false;
                    for(let k=1;k<slot.length;k++){
                        const value=data(slot,k+'');
                        if(typeof value==='string'&&!own(blocks,value))return false;
                        if(Array.isArray(value)&&!dense(value))return false;
                    }
                }
            }
        }
        return true;
    };
    if(!ownGraph())return ()=>false;
    const safeName=name=>typeof name==='string'&&!own(Object.prototype,name);
    const literal=(node,name,target)=>{
        if(isArrayMenuSelector(node,name))return menuLiteral(node,name,target);
        const field=node.fields?.[name];
        if(field!==undefined)return Array.isArray(field)&&field.length===2&&field[1]===null&&typeof field[0]==='string'?field[0]:null;
        const slot=node.inputs?.[name];if(!Array.isArray(slot)||slot.length!==2||slot[0]!==1)return null;
        const raw=slot[1];if(Array.isArray(raw))return raw.length===2&&raw[0]===10&&typeof raw[1]==='string'?raw[1]:null;
        if(typeof raw!=='string'||!own(target.blocks||{},raw))return null;
        const n=block(target,raw),row=n?.fields?.TEXT;
        return n?.opcode==='text'&&n.shadow===true&&n.mutation==null&&!n.next&&
            Object.keys(n.inputs||{}).length===0&&Object.keys(n.fields||{}).join('|')==='TEXT'&&
            Array.isArray(row)&&row.length===2&&row[1]===null&&typeof row[0]==='string'?row[0]:null;
    };
    const nativeProject=()=>{
        if(!Array.isArray(project.extensions)||new Set(project.extensions).size!==project.extensions.length||
            project.extensions.length!==2||!project.extensions.includes('arcade')||!project.extensions.includes('arrays'))return false;
        const core=new Set(['argument','colour','control','data','event','looks','math','motion','operator','procedures','sensing','sound']),inferred=new Set();
        const allowed=opcode=>{
            if(typeof opcode!=='string')return false;
            const at=opcode.indexOf('_');if(at<0)return opcode==='text';
            const prefix=opcode.slice(0,at).replace(/[^\w-]/g,'-');
            if(core.has(prefix))return true;
            if(prefix!=='arcade'&&prefix!=='arrays')return false;inferred.add(prefix);return true;
        };
        for(const target of targets){
            if(own(target.variables||{},'__proto__'))return false;
            for(const [id,node] of Object.entries(target.blocks||{}))if(!safeName(id)||!allowed(node?.opcode))return false;
        }
        if(own(project,'monitors')&&(!Array.isArray(project.monitors)||project.monitors.some(m=>
            !m||typeof m!=='object'||Array.isArray(m)||!allowed(m.opcode))))return false;
        if(inferred.size!==2)return false;
        const urls=project.extensionURLs;
        return urls==null||typeof urls==='object'&&!Array.isArray(urls)&&Object.entries(urls).every(([id,url])=>
            id==='arrays'&&url==='https://crispstrobe.github.io/extensions/CrispStrobe/arrays.js');
    };
    const nativeNamespace=nativeProject();
    const shape=(node,scope,inputs,fields=[])=>!!node&&owners.get(node)===scope&&!invalid.has(node)&&
        node.mutation==null&&exactKeys(node,inputs,fields)&&Object.keys(node.fields||{}).length===fields.length;
    const line=(scope,stop)=>{
        const result=[],seen=new Set();let id=scope.root.next;
        while(id){if(seen.has(id))return null;seen.add(id);const node=block(scope.target,id);
            if(!node||invalid.has(node)||owners.get(node)!==scope)return null;
            if(node===stop)return result;result.push(node);id=node.next;}
        return null;
    };
    const normalScope=scope=>{
        if(!scope?.proc||scope.invalid||scope.unknownEntry||implicitEntries.has(scope)||!safeName(scope.proc)||
            !scope.params.every(safeName)||!scope.ids.every(safeName))return false;
        const prototype=child(scope.root,'custom_block',scope.target),all=Object.values(scope.target.blocks||{});
        return scope.root.opcode==='procedures_definition'&&scope.root.mutation==null&&
            exactKeys(scope.root,['custom_block'])&&prototype&&!invalid.has(prototype)&&
            prototype.opcode==='procedures_prototype'&&prototype.parent===scope.id&&!prototype.next&&
            all.filter(n=>n.opcode==='procedures_definition'&&child(n,'custom_block',scope.target)?.mutation?.proccode===scope.proc).length===1&&
            all.filter(n=>n.opcode==='procedures_prototype'&&n.mutation?.proccode===scope.proc).length===1;
    };
    const sourceScope=scope=>!!scope&&!scope.invalid&&!scope.unknownEntry&&
        scope.root.opcode==='arcade_whenSourceStarts'&&scope.root.mutation==null&&
        exactKeys(scope.root,[])&&!Object.keys(scope.root.fields||{}).length;
    const exactCall=call=>{
        if(!call?.fn||!normalScope(call.fn)||!call.args||call.args.length!==call.fn.params.length||
            invalid.has(call.node)||owners.get(call.node)!==call.scope||call.target!==call.fn.target)return false;
        const node=call.node;
        if(node.opcode==='procedures_call')return node.mutation?.proccode===call.fn.proc&&
            node.mutation?.warp==='false'&&Object.keys(node.fields||{}).length===0&&
            Object.keys(node.mutation||{}).every(k=>['tagName','children','proccode','argumentids','warp'].includes(k));
        return node.opcode==='arcade_callFunction'&&shape(node,call.scope,['NAME','ARGS'])&&literal(node,'NAME',call.target)===call.fn.proc;
    };
    // One actual direct invocation edge per scope is intentionally required.
    // A second/escaped/conditional/cyclic entry cannot borrow this path.
    const ancestry=scope=>{
        const path=[],seen=new Set();let current=scope;
        while(!sourceScope(current)){
            if(seen.has(current)||!normalScope(current)||current.callers.length!==1)return null;seen.add(current);
            const call=current.callers[0];if(!exactCall(call)||!line(call.scope,call.node))return null;
            path.unshift(call);current=call.scope;
        }
        return {root:current,path};
    };
    const reads=(target,node,cell,seen=new Set())=>{
        if(!node||seen.has(node))return false;seen.add(node);if(binding(target,node)===cell)return true;
        for(const slot of Object.values(node.inputs||{}))for(const raw of [slot?.[1],slot?.[2]]){
            if(Array.isArray(raw)&&raw[0]===12&&globalCell(target,raw[2])===cell)return true;
            if(typeof raw==='string'&&reads(target,block(target,raw),cell,seen))return true;
        }
        return false;
    };
    const destination=(node,scope)=>node.opcode==='arcade_setLocal'?localCell(scope,literal(node,'NAME',scope.target)):
        node.opcode==='data_setvariableto'?globalCell(scope.target,node.fields?.VARIABLE?.[1]):null;
    const primitive=(value,scope,path=new Set())=>{
        if(!value)return false;
        if(value.raw)return Array.isArray(value.raw)&&value.raw.length===2&&
            (value.raw[0]===10&&typeof value.raw[1]==='string'||[4,5,6,7,8].includes(value.raw[0])&&
            ['string','number'].includes(typeof value.raw[1])&&Number.isFinite(Number(value.raw[1])));
        const n=value.node;if(!n||path.has(n)||invalid.has(n)||owners.get(n)!==scope)return false;
        const next=new Set([...path,n]);
        if(['math_number','math_whole_number','math_integer','math_positive_number','text'].includes(n.opcode)){
            const field=n.opcode==='text'?'TEXT':'NUM',row=n.fields?.[field];
            return n.shadow===true&&shape(n,scope,[],[field])&&Array.isArray(row)&&row.length===2&&row[1]===null&&
                (field==='TEXT'?typeof row[0]==='string':['string','number'].includes(typeof row[0])&&Number.isFinite(Number(row[0])));
        }
        const args={operator_add:['NUM1','NUM2'],operator_subtract:['NUM1','NUM2'],operator_multiply:['NUM1','NUM2']}[n.opcode];
        return !!args&&shape(n,scope,args)&&args.every(name=>primitive(input(n,name,scope.target),scope,next));
    };
    const numeric=value=>value?.raw&&[4,5,6,7,8].includes(value.raw[0])&&value.raw.length===2&&
        ['string','number'].includes(typeof value.raw[1])&&Number.isFinite(Number(value.raw[1]));
    const identityCall=call=>{
        if(!exactCall(call))return false;const fn=call.fn,n=block(fn.target,fn.root.next);
        if(!n||n.next||!shape(n,fn,['VALUE'])||n.opcode!=='arcade_returnValue')return false;
        const v=child(n,'VALUE',fn.target);if(!v)return false;
        const name=v.opcode==='arcade_getLocal'&&shape(v,fn,['NAME'])?literal(v,'NAME',fn.target):
            v.opcode.startsWith('argument_reporter_')&&shape(v,fn,[],['VALUE'])?v.fields.VALUE?.[0]:null;
        return fn.params.includes(name);
    };
    // Read-only values and native guarded heap operations cannot publish the
    // current params object. This is NOT a heap/body/value proof: a failing
    // operation never reaches the later overwrite/read in the first place.
    // Unknown calls, coercing inputs, registration, capture and yields refuse.
    const operand=(value,scope,cell,path=new Set())=>{
        if(!value)return false;
        if(value.cell)return value.cell!==cell&&ordinarySummaryGlobal(value.cell);
        if(value.raw)return primitive(value,scope);
        const n=value.node;if(!n||path.has(n)||invalid.has(n)||owners.get(n)!==scope||reads(scope.target,n,cell))return false;
        const next=new Set([...path,n]),at=name=>operand(input(n,name,scope.target),scope,cell,next);
        if(n.opcode==='arcade_getLocal')return shape(n,scope,['NAME'])&&safeName(literal(n,'NAME',scope.target));
        if(n.opcode==='data_variable')return shape(n,scope,[],['VARIABLE'])&&ordinarySummaryGlobal(binding(scope.target,n));
        if(resetValue(n))return true;
        if(primitive(value,scope))return true;
        if(n.opcode==='arrays_createReference')return shape(n,scope,['VALUES'])&&literal(n,'VALUES',scope.target)==='[]';
        if(n.opcode==='arrays_referenceItem')return shape(n,scope,['ARRAY','INDEX'])&&at('ARRAY')&&numeric(input(n,'INDEX',scope.target));
        if(n.opcode==='arrays_referenceLength')return shape(n,scope,['ARRAY'])&&at('ARRAY');
        if(n.opcode==='arcade_callFunction')return identityCall(calls.find(c=>c.node===n))&&
            calls.find(c=>c.node===n).args.every(a=>operand(a,scope,cell,next));
        return false;
    };
    const declaration=(node,scope)=>{
        if(node.opcode!=='arcade_declareSourceReference'||!sourceScope(scope)||!shape(node,scope,['VARIABLE'],['TYPE'])||
            !['Sprite','Image','number[]','boolean[]','string[]','Sprite[]','Image[]'].includes(literal(node,'TYPE',scope.target)))return false;
        const raw=node.inputs.VARIABLE?.[1],prefix=line(scope,node);
        return !!prefix&&prefix.every(n=>n.opcode==='arcade_declareSourceReference')&&
            Array.isArray(raw)&&raw.length===3&&raw[0]===12&&ordinarySummaryGlobal(globalCell(scope.target,raw[2]));
    };
    const effect=(node,scope,cell)=>{
        // Native source declarations bind the actual variable object, never
        // consume or publish its displayed value. No type fact is taken here.
        if(declaration(node,scope))return true;
        if(!node||invalid.has(node)||owners.get(node)!==scope||reads(scope.target,node,cell))return false;
        if(node.opcode==='arcade_setLocal')return shape(node,scope,['NAME','VALUE'])&&safeName(literal(node,'NAME',scope.target))&&
            operand(input(node,'VALUE',scope.target),scope,cell);
        if(node.opcode==='data_setvariableto')return shape(node,scope,['VALUE'],['VARIABLE'])&&
            ordinarySummaryGlobal(destination(node,scope))&&operand(input(node,'VALUE',scope.target),scope,cell);
        if(node.opcode==='looks_hide')return shape(node,scope,[]);
        if(node.opcode==='arrays_mutateReference'){
            if(!shape(node,scope,['ARRAY','OP','INDEX','VALUE'])||!isArrayMenuSelector(node,'OP'))return false;
            const op=literal(node,'OP',scope.target);
            if(!isKnownArrayMenuOperation(node,op)||!operand(input(node,'ARRAY',scope.target),scope,cell)||
                !numeric(input(node,'INDEX',scope.target)))return false;
            return op==='length'?numeric(input(node,'VALUE',scope.target)):
                operand(input(node,'VALUE',scope.target),scope,cell);
        }
        return false;
    };
    // A read in the same statement as the overwrite is still a pre-write read.
    const scan=(scope,nodes,cell,writer,seenReset)=>{
        for(const n of nodes){
            if(n===writer.node){seenReset=true;continue;}
            if(destination(n,scope)===cell){
                if(seenReset&&effect(n,scope,cell))return {overwritten:true,seenReset};
                return null;
            }
            if(!effect(n,scope,cell))return null;
        }
        return {overwritten:false,seenReset};
    };
    const point=(cell,writer,at)=>{
        const scope=owners.get(at),statement=statementOf(at);if(!scope||!statement)return false;
        const entry=ancestry(scope);if(!entry)return false;
        if(!cell.global){
            if(scope!==writer.scope||!normalScope(scope)||scope.params.length||cell.formal)return false;
            const nodes=line(scope,statement);if(!nodes)return false;
            return scan(scope,nodes,cell,writer,false)?.overwritten===true;
        }
        if(!ordinarySummaryGlobal(cell)||!closedEffects()||entry.root!==writer.scope||!sourceScope(writer.scope))return false;
        let current=entry.root,seenReset=false;
        for(const call of entry.path){
            // Arguments run before the callee overwrite; no reset read can hide
            // in a call socket. Only exact zero-argument path calls are admitted.
            if(call.args.length)return false;
            const nodes=line(current,call.node);if(!nodes)return false;
            const result=scan(current,nodes,cell,writer,seenReset);if(!result)return false;
            if(result.overwritten)return true;seenReset=result.seenReset;current=call.fn;
        }
        const nodes=line(current,statement);if(!nodes)return false;
        return scan(current,nodes,cell,writer,seenReset)?.overwritten===true;
    };
    const allReads=cell=>{
        const result=new Set();
        for(const target of targets)for(const node of Object.values(target.blocks||{})){
            if(binding(target,node)===cell)result.add(node);
            if(node.fields?.VARIABLE&&globalCell(target,node.fields.VARIABLE[1])===cell&&
                !['data_setvariableto','data_variable'].includes(node.opcode))result.add(node);
            for(const [name,slot] of Object.entries(node.inputs||{}))for(const raw of [slot?.[1],slot?.[2]])
                if(Array.isArray(raw)&&raw[0]===12&&globalCell(target,raw[2])===cell&&
                    !(name==='VARIABLE'&&declaration(node,owners.get(node))))result.add(node);
        }
        return [...result];
    };
    return (cell,writer)=>{
        if(!nativeNamespace||cell.directBad||cell.formal||!writer.value?.node||!resetValue(writer.value.node)||
            invalid.has(writer.node)||writer.scope.invalid||writer.argument||!destination(writer.node,writer.scope)||
            destination(writer.node,writer.scope)!==cell)return false;
        if(Array.isArray(project.monitors)&&project.monitors.some(m=>m?.visible&&['slider','list'].includes(m.mode)))return false;
        // No inherited frame setter or dynamic local name is admitted. Existing
        // captured-cell provenance remains an independent refusal in the caller.
        if(records.some(({node})=>['arcade_setLocal','arcade_setCaptured'].includes(node.opcode)&&!safeName(literal(node,'NAME',owners.get(node)?.target))))return false;
        const occurrences=allReads(cell);
        return occurrences.length>0&&occurrences.every(at=>point(cell,writer,at));
    };
};
