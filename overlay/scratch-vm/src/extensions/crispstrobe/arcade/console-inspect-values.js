// console.inspect's primitive branch from the selected MIT PXT console
// contract. Domain admission is separate from conversion: never call a
// reference, getter, custom toString or Object.keys inspection path here.
const primitiveOwner = require('../../../util/bw-primitive-owner');
const reporterOwner = require('./font-selector-owner');
const analyseCaptures = require('./console-capture-provenance');
const kinds = new Set(['Number','Boolean','String','Any']);
const semantic = block => JSON.stringify([block.opcode,block.fields,block.inputs,block.next,
    block.mutation,block.shadow,block.parent,block.topLevel]);
const scoreRegistrations = new WeakMap();
const scoreInfoOwner = Symbol('actual Arcade score declaration owner');
const scoreAdapters = new WeakMap();
const scoreSourceRows = new WeakMap();
const scoreIssue = Symbol('actual Arcade score metadata issuance');
const scoreIssues = new WeakMap();
let scoreIssueSerial = 0;
// Only the actual finite player literals can select this existing score role.
// Do not execute a tag, getter, toString or valueOf to establish that identity.
const fixedScorePlayer = value => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 4 ? value :
    typeof value === 'string' && /^[1-4]$/.test(value) ? value.charCodeAt(0) - 48 : null;
function scoreInfo(info,owner) {
    const entries=info?.id==='arcade'&&info.blocks?.filter(block=>block.opcode==='getPlayerScore');
    if(entries?.length!==1||!owner)throw Error('Arcade score declaration owner is missing');
    Object.defineProperty(entries[0],scoreInfoOwner,{value:owner,enumerable:true});
    scoreSourceRows.set(entries[0],owner);
    return info;
}
function scoreAdapterCurrent(owner,record) {
    return !!record&&record.valid&&owner.isCurrent()&&owner.isInstance(record.instance)&&
        Object.getOwnPropertyDescriptor(record.adapter,'_inst')?.value===record.instance&&
        Object.getOwnPropertyDescriptor(record.adapter,'getPlayerScore')?.value===record.delegate&&
        Object.getPrototypeOf(record.adapter)===record.prototype&&!Object.prototype.hasOwnProperty.call(record.adapter,'getInfo')&&
        Object.getOwnPropertyDescriptor(record.prototype,'getInfo')?.value===record.getInfo;
}
function bindScoreAdapterInfo(info,adapter,instance) {
    const entry=info?.id==='arcade'&&info.blocks?.find(block=>block.opcode==='getPlayerScore');
    const owner=entry&&Object.getOwnPropertyDescriptor(entry,scoreInfoOwner)?.value;
    if(scoreSourceRows.get(entry)!==owner||!owner?.isInstance(instance)||!owner.isCurrent())throw Error('Arcade score adapter source owner differs');
    const delegate=Object.getOwnPropertyDescriptor(adapter,'getPlayerScore')?.value;
    if(Object.getOwnPropertyDescriptor(adapter,'_inst')?.value!==instance||typeof delegate!=='function')throw Error('Arcade score adapter delegate is missing');
    const existing=scoreAdapters.get(owner);
    if(existing){if(existing.adapter!==adapter||existing.instance!==instance||existing.delegate!==delegate)existing.valid=false;}
    else {
        const prototype=Object.getPrototypeOf(adapter),getInfo=Object.getOwnPropertyDescriptor(prototype,'getInfo')?.value;
        if(typeof getInfo!=='function'||Object.prototype.hasOwnProperty.call(adapter,'getInfo'))throw Error('Arcade score adapter getInfo owner differs');
        scoreAdapters.set(owner,{adapter,instance,delegate,prototype,getInfo,valid:true});
    }
    // Only genuine source getInfo rows may issue metadata. The ExtensionManager
    // shallow preparation preserves this token and the actual argument schema.
    if(!scoreAdapterCurrent(owner,scoreAdapters.get(owner)))throw Error('Arcade score adapter issuance owner differs');
    if(Object.prototype.hasOwnProperty.call(entry,scoreIssue))throw Error('Arcade score metadata row was already issued');
    const token=Object.freeze({});
    scoreIssues.set(token,{owner,adapter:scoreAdapters.get(owner),arguments:entry.arguments,serial:++scoreIssueSerial,consumed:false});
    Object.defineProperty(entry,scoreIssue,{value:token,enumerable:true});
}
// Initial registration and ordinary refresh consume genuine, single-use source
// metadata issuances. Reading the current primitive alone never grants renewal.
function scoreRegistration(runtime,owner) {
    if (!runtime || typeof runtime.on!=='function' || !owner) return null;
    const existing=scoreRegistrations.get(runtime);
    if(existing)return existing.owner===owner ? existing : null;
    const getter=runtime.getOpcodeFunction;
    const record={owner,category:null,entry:null,func:null,valid:true,reason:null,disposed:false,targets:new Set(),getter,serial:0};
    const refuseRegistration=reason=>{record.valid=false;record.reason=reason;};
    const capture=(category,refresh=false)=>{
        if(category?.id!=='arcade')return;
        if(!record.valid)return;
        if(refresh ? !record.category||category!==record.category : !!record.category){refuseRegistration(refresh?'refresh category identity differs':'registration was republished');return;}
        const entries=(category.blocks||[]).filter(value=>value.json?.type==='arcade_getPlayerScore');
        const entry=entries.length===1&&entries[0],func=entry?.info?.func;
        const adapter=scoreAdapters.get(owner);
        const issue=scoreIssues.get(entry?.info?.[scoreIssue]);
        if(!issue||issue.consumed||issue.serial<=record.serial||issue.owner!==owner||issue.adapter!==adapter||issue.arguments!==entry?.info?.arguments){refuseRegistration('metadata issuance is missing, stale or foreign');return;}
        // _prepareBlockInfo's Object.assign preserves the private row Symbol;
        // runtime retains that exact prepared row as convertedBlock.info.
        if(entry?.info?.[scoreInfoOwner]!==owner){refuseRegistration('original declaration owner differs');return;}
        if(!scoreAdapterCurrent(owner,adapter)){refuseRegistration('original implementation or adapter differs');return;}
        if(!runtime._blockInfo?.includes(category)){refuseRegistration('original category is not installed');return;}
        if(typeof func!=='function'){refuseRegistration('original score primitive is missing');return;}
        if(typeof getter!=='function'){refuseRegistration('original primitive lookup is missing');return;}
        if(runtime.getOpcodeFunction!==getter){refuseRegistration('original primitive lookup changed');return;}
        if(getter.call(runtime,'arcade_getPlayerScore')!==func){refuseRegistration('original score primitive differs');return;}
        issue.consumed=true;record.serial=issue.serial;
        record.category=category;record.entry=entry;record.func=func;record.adapter=adapter;
    };
    scoreRegistrations.set(runtime,record);
    const categories=(runtime._blockInfo||[]).filter(value=>value.id==='arcade');
    // This constructor precedes its genuine builtin registration. Never turn
    // an arbitrary preexisting same-opcode category into a producer certificate.
    if(categories.length)refuseRegistration('registration existed before this implementation');
    runtime.on('EXTENSION_ADDED',capture);
    runtime.on('BLOCKSINFO_UPDATE',category=>capture(category,true));
    runtime.on('RUNTIME_DISPOSED',()=>{record.disposed=true;});
    runtime.on('PROJECT_LOADED',()=>{
        // VM.loadProject disposes the previous target graph, retaining builtins.
        // Resume only for new targets under the identical captured registration;
        // the old local inspector stays disposed and cannot borrow this renewal.
        if(record.disposed&&runtime.targets?.length&&runtime.targets.every(target=>!record.targets.has(target))&&
            record.valid&&scoreAdapterCurrent(owner,record.adapter)&&runtime.getOpcodeFunction===getter&&
            getter.call(runtime,'arcade_getPlayerScore')===record.func){record.disposed=false;record.targets=new Set(runtime.targets);}
    });
    return record;
}

function primitive(value) {
    if (value === null || ['undefined','string','number','boolean'].includes(typeof value)) return value;
    if (!value || typeof value !== 'object') throw new Error('opaque inspection value');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Object.keys(descriptors).filter(key => descriptors[key].enumerable);
    if (keys.length !== 1) throw new Error('reference or opaque inspection value');
    const field = descriptors[keys[0]];
    if (!Object.prototype.hasOwnProperty.call(field,'value')) throw new Error('inspection accessor');
    if (keys[0] === 'bwUndefined' && field.value === true) return undefined;
    if (keys[0] === 'bwNumber' && ['NaN','Infinity','-Infinity','-0'].includes(field.value))
        return field.value === 'NaN' ? NaN : field.value === '-0' ? -0 : Number(field.value);
    throw new Error('reference or opaque inspection value');
}

function create(runtime, cells, scoreOwner=null, sceneClock=null) {
    let snapshots = new Map(), disposed = false, active = false;
    const bound = !!runtime && typeof runtime.on === 'function' && Array.isArray(runtime.targets);
    const score=scoreRegistration(runtime,scoreOwner);
    const fail = reason => {throw new Error('Arcade inspection: ' + reason);};
    const current = () => {
        if (!bound || disposed || !snapshots.size) fail('inactive native owner; start the current project');
        const originals = runtime.targets.filter(target => target.isOriginal !== false);
        if (originals.length !== snapshots.size || originals.some(target => {
            const saved = snapshots.get(target), blocks = Object.entries(target.blocks?._blocks || {}), variables=Object.entries(target.variables||{});
            return !saved || saved.container !== target.blocks || blocks.length !== saved.blocks.size ||
                variables.length!==saved.variables.size || variables.some(([id,variable])=>saved.variables.get(id)?.variable!==variable || saved.variables.get(id)?.signature!==JSON.stringify([variable.id,variable.name,variable.type])) ||
                blocks.some(([id,block]) => saved.blocks.get(id)?.block !== block || saved.blocks.get(id)?.semantic !== semantic(block));
        })) fail('source graph changed; restart the project');
    };
    const snapshot = () => {
        snapshots = new Map();
        if (!bound || disposed) return;
        if(score&&!score.disposed)score.targets=new Set(runtime.targets);
        for (const target of runtime.targets) if (target.isOriginal !== false)
            snapshots.set(target,{container:target.blocks,variables:new Map(Object.entries(target.variables||{}).map(([id,variable])=>[id,{variable,signature:JSON.stringify([variable.id,variable.name,variable.type])}])),blocks:new Map(Object.entries(target.blocks._blocks).map(([id,block]) =>
                [id,{block,semantic:semantic(block)}]))});
    };
    const prove = (target, block, requested=null, possible=null, util=null, args=null) => {
        let structural=false;
        const all = target.blocks._blocks, read = id => target.blocks.getBlock(id);
        const input = (node,name) => read(node?.inputs?.[name]?.block);
        const text = node => node?.opcode === 'text' ? node.fields?.TEXT?.value : null;
        const literal = (node,name) => node?.fields?.[name]?.value ?? text(input(node,name));
        let scoreRefusal=null;
        const refuseScore=reason=>{scoreRefusal=reason;return false;};
        const scoreDetail=()=>scoreRefusal?' (score producer: '+scoreRefusal+')':'';
        const scoreNumber=node=>{
            if(!score?.valid)return refuseScore(score?'original registration invalid: '+score.reason:'original registration unavailable');
            if(score.disposed)return refuseScore('registration suspended');
            if(!score.category)return refuseScore('original registration missing');
            if(!scoreOwner.isCurrent())return refuseScore('implementation changed');
            if(!scoreAdapterCurrent(scoreOwner,score.adapter))return refuseScore('adapter changed');
            if(runtime.getOpcodeFunction!==score.getter)return refuseScore('primitive lookup changed');
            if(score.getter.call(runtime,'arcade_getPlayerScore')!==score.func)return refuseScore('score primitive changed');
            if(!runtime._blockInfo?.includes(score.category))return refuseScore('registered category changed');
            if(score.category.id!=='arcade')return refuseScore('registered category identity changed');
            if(score.category.blocks?.filter(entry=>entry.json?.type==='arcade_getPlayerScore').length!==1)return refuseScore('registered score declaration is missing or ambiguous');
            if(!score.category.blocks?.includes(score.entry))return refuseScore('registered score declaration changed');
            if(score.entry.json?.type!=='arcade_getPlayerScore')return refuseScore('registered score opcode changed');
            if(score.entry.info?.[scoreInfoOwner]!==scoreOwner)return refuseScore('registered source owner changed');
            if(score.entry.info?.func!==score.func)return refuseScore('registered score function changed');
            if(node.shadow!==false||node.topLevel!==false||node.next!=null||node.mutation!=null||Object.keys(node.fields||{}).length||
                Object.keys(node.inputs||{}).join(',')!=='PLAYER')return refuseScore('score reporter schema differs');
            const player=input(node,'PLAYER');
            if(!player||player.parent!==node.id||player.opcode!=='math_number'||player.shadow!==true||player.topLevel!==false||player.next!=null||player.mutation!=null||
                Object.keys(player.inputs||{}).length||Object.keys(player.fields||{}).join(',')!=='NUM')return refuseScore('fixed player shadow schema differs');
            const numberField=Object.getOwnPropertyDescriptor(player.fields,'NUM')?.value;
            const selectedPlayer=fixedScorePlayer(numberField&&Object.getOwnPropertyDescriptor(numberField,'value')?.value);
            if(selectedPlayer===null)return refuseScore('fixed player literal differs');
            const parent=read(node.parent);
            if(!parent||Object.values(parent.inputs||{}).filter(slot=>slot.block===node.id).length!==1)return refuseScore('score parent ownership differs');
            const root=util?.thread?.peekStack?.(),operations=target.blocks._cache?._executeCached?.[root]?._ops||[];
            const reachable=new Set();
            const visit=id=>{if(reachable.has(id))return;reachable.add(id);for(const slot of Object.values(read(id)?.inputs||{}))if(slot.block)visit(slot.block);};visit(root);
            if(reachable.has(node.id)){
                const actual=operations.filter(operation=>operation.id===node.id);
                if(actual.length!==1)return refuseScore('active score cache is missing or ambiguous');
                const operation=actual[0];
                try{if(reporterOwner(runtime,util,operation._argValues,'arcade_getPlayerScore',[])!==node)return refuseScore('active score primitive ownership differs');}catch{return refuseScore('active score primitive ownership refused');}
                const shadow=target.blocks._cache?._executeCached?.[player.id];
                if(operation._blockFunction!==score.func)return refuseScore('active score function differs');
                if(Object.keys(operation._argValues||{}).sort().join(',')!=='PLAYER,mutation')return refuseScore('active score argument schema differs');
                if(operation._argValues.mutation!==operation.mutation||operation.mutation!==node.mutation)return refuseScore('active score mutation differs');
                const cachedPlayer=Object.getOwnPropertyDescriptor(operation._argValues,'PLAYER')?.value;
                if(fixedScorePlayer(cachedPlayer)!==selectedPlayer)return refuseScore('active player argument differs');
                if(shadow?.id!==player.id||shadow.opcode!=='math_number'||shadow.fields!==player.fields||
                    shadow.inputs!==target.blocks.getInputs(player))return refuseScore('active player shadow cache differs');
                if(shadow._isShadowBlock!==true||Object.getOwnPropertyDescriptor(shadow,'_shadowValue')?.value!==cachedPlayer||
                    shadow._parentValues!==operation._argValues||shadow._parentKey!=='PLAYER')return refuseScore('active player shadow value or ownership differs');
                if(!operation._parentValues||typeof operation._parentValues[operation._parentKey]!=='number')return refuseScore('active score result is not native Number');
            }
            return true;
        };
        const captureProof=analyseCaptures({targets:runtime.targets.filter(value=>value.isOriginal!==false),blocks:value=>value.blocks._blocks,
            input:(node,name,owner)=>owner.blocks.getBlock(node?.inputs?.[name]?.block),
            literal:(node,name,owner)=>node?.fields?.[name]?.value??(owner.blocks.getBlock(node?.inputs?.[name]?.block)?.opcode==='text'?owner.blocks.getBlock(node.inputs[name].block).fields?.TEXT?.value:null)});
        const owners = new Map(), seen = new Map([[false,new Set()],[true,new Set()]]);
        const mark = (node,owner,path=new Set()) => {
            if (!node || path.has(node)) return;
            path.add(node);
            if (owners.has(node) && owners.get(node) !== owner) fail('ambiguous procedure ownership');
            owners.set(node,owner);
            for (const slot of Object.values(node.inputs || {})) mark(read(slot.block),owner,path);
            mark(read(node.next),owner,path);
        };
        for (const node of Object.values(all)) if (node.topLevel)
            mark(read(node.next),node.opcode === 'procedures_definition' ? input(node,'custom_block')?.mutation?.proccode : node);
        const argumentsFor = (call,index) => {
            let argument = input(call,'ARGS');const visited = new Set();
            for (let i=0;i<=index;i++) {
                if (text(argument) === '[]') return null; // Actual omitted argument is Undefined.
                if (!argument || visited.has(argument) || argument.opcode !== 'arcade_functionArgument') return false;
                visited.add(argument);
                if (i === index) return input(argument,'VALUE') || false;
                argument=input(argument,'REST');
            }
            return false;
        };
        const terminalDomain=(node,domains)=>{
            if(!domains)return;
            const op=node.opcode;
            if(['text','bw_stringLiteral','operator_join','operator_letter_of'].includes(op))domains.add('string');
            else if(['math_number','bw_numberLiteral','operator_length','operator_add','operator_subtract','operator_multiply','operator_divide','operator_mod','operator_round','operator_random'].includes(op))domains.add('number');
            else if(['operator_equals','operator_gt','operator_lt','operator_not','operator_and','operator_or','arrays_valueTruthy','arrays_valueCompare'].includes(op))domains.add('boolean');
            else if(op==='arrays_specialValue'){const kind=literal(node,'KIND');domains.add(['null','undefined'].includes(kind)?kind:['NaN','Infinity','-Infinity','-0'].includes(kind)?'number':'unknown');}
            else domains.add('unknown'); // The primitive inspector's legacy surface is unchanged.
        };
        // For domain queries, only reachable normal completions contribute.
        // Throw contributes no Undefined or implicit normal-result evidence.
        const normalReturns=definition=>{
            const results=new Set(),visited=new Set();
            const sequence=node=>{
                while(node){
                    if(visited.has(node))return true;visited.add(node);
                    if(node.opcode==='arcade_throwValue')return false;
                    if(node.opcode==='arcade_returnValue'){results.add(node);return false;}
                    if(node.opcode==='control_if_else'){
                        const left=sequence(input(node,'SUBSTACK')),right=sequence(input(node,'SUBSTACK2'));
                        if(!left&&!right)return false;
                    }else for(const name of Object.keys(node.inputs||{}))if(name.startsWith('SUBSTACK'))sequence(input(node,name));
                    if(node.opcode==='control_forever')return false;
                    node=read(node.next);
                }
                return true;
            };
            const fallthrough=sequence(read(definition.next));return {results:[...results],fallthrough};
        };
        // A declaration reset (local := undefined/null) cannot reach a read when
        // every path from it to the read's statement on the same chain passes a
        // definite overwrite (a direct set, or an if/else assigning in both
        // branches before any exit) whose value does not read the cell.
        const fixedReset=node=>node?.opcode==='arrays_specialValue'&&!Object.keys(node.inputs||{}).length&&['undefined','null'].includes(node.fields?.KIND?.value);
        const localCellOf=node=>['arcade_setLocal','arcade_getLocal'].includes(node?.opcode)?captureProof.local(captureProof.scopeOf(node),literal(node,'NAME')):null;
        const readsCell=(node,cell,path=new Set())=>{
            if(!node||path.has(node))return false;path.add(node);
            if(node.opcode==='arcade_getCaptured'||node.opcode==='arcade_getLocal'&&localCellOf(node)===cell)return true;
            return Object.entries(node.inputs||{}).some(([name,slot])=>!name.startsWith('SUBSTACK')&&readsCell(read(slot.block),cell,path));
        };
        const exits=node=>/return|stop|break|continue|throw/i.test(node?.opcode||'');
        const assigns=(node,cell)=>{
            if(node?.opcode==='arcade_setLocal'&&localCellOf(node)===cell){const value=input(node,'VALUE');return !!value&&!fixedReset(value)&&!readsCell(value,cell);}
            if(node?.opcode==='control_if_else')return chainAssigns(node.inputs?.SUBSTACK?.block,cell)&&chainAssigns(node.inputs?.SUBSTACK2?.block,cell);
            return false;
        };
        const chainAssigns=(id,cell)=>{const path=new Set();for(let node=read(id);node&&!path.has(node);node=read(node.next)){path.add(node);if(assigns(node,cell))return true;if(exits(node))return false;}return false;};
        const deadReset=(writer,cell,at)=>{
            if(!at||!fixedReset(input(writer,'VALUE')))return false;
            const chain=[],path=new Set();for(let node=read(writer.next);node&&!path.has(node);node=read(node.next)){path.add(node);chain.push(node);}
            const climbed=new Set();
            for(let node=at;node&&!climbed.has(node);node=read(node.parent)){climbed.add(node);const index=chain.indexOf(node);if(index>=0)return chain.slice(0,index).some(statement=>assigns(statement,cell));}
            return false;
        };
        const safeCell = (cell,player=false,origins=null,domains=null,at=null) => {
            const proof=captureProof.proof(cell);
            if(!proof||cell.scope.target!==target)return false;
            const evidence=new Set();
            if(!proof.writers.filter(({node:writer})=>!deadReset(writer,cell,at)).every(({node:writer})=>safe(input(writer,'VALUE'),player,evidence,domains)))return false;
            let valid=proof.writers.length>0;
            if(proof.index>=0){
                const procedure=cell.scope.procedure;if(typeof procedure!=='string')return false;
                const calls=Object.values(all).filter(value=>value.opcode==='arcade_callFunction'&&literal(value,'NAME')===procedure||value.opcode==='procedures_call'&&value.mutation?.proccode===procedure);
                if(Object.values(all).some(value=>value.opcode==='arcade_callFunction'&&typeof literal(value,'NAME')!=='string'))return false;
                valid=calls.length>0&&calls.every(call=>{
                    if(call.opcode==='procedures_call'){let ids;try{ids=JSON.parse(call.mutation?.argumentids||'[]');}catch{return false;}if(!Array.isArray(ids)||ids.length!==cell.scope.params.length||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)return false;if(domains){let expected;try{expected=JSON.parse(input(cell.scope.root,'custom_block')?.mutation?.argumentids||'[]');}catch{return false;}if(JSON.stringify(ids)!==JSON.stringify(expected))return false;}return safe(input(call,ids[proof.index]),player,evidence,domains);}
                    const arg=argumentsFor(call,proof.index);if(arg===null&&!player){evidence.add(call);domains?.add('undefined');return true;}return arg!==false&&safe(arg,player,evidence,domains);});
            }
            if(!valid||proof.escaped&&!evidence.size)return false;
            for(const origin of evidence)origins?.add(origin);return true;
        };
        const safe = (node,player=false,origins=null,domains=null) => {
            if (!node) return false;
            const visited=seen.get(player);
            if (visited.has(node)) return !player; // A flow backedge cannot introduce an opaque producer; every outgoing writer is still checked.
            visited.add(node);
            try {
                const op=node.opcode;
                if(!player&&op==='arcade_sceneMillis'){
                    // A dormant call is only a structural obligation of another
                    // ordinary caller. It is never a completed supplied value.
                    if(!(structural?sceneClock?.eligible(target,node):sceneClock?.prove(target,node,args,util)))return false;
                    origins?.add(node);domains?.add('number');return true;
                }
                if(!player&&op==='arcade_getPlayerScore'){
                    if(!scoreNumber(node))return false;
                    origins?.add(node);domains?.add('number');return true;
                }
                if(player&&op==='arcade_eventPlayer'){
                    const owner=owners.get(node),token=literal(owner,'TOKEN');
                    if(owner?.opcode!=='arcade_whenRegisteredMultiplayerConnection'||typeof token!=='string'||!token)return false;
                    const hats=Object.values(all).filter(value=>value.opcode===owner.opcode&&literal(value,'TOKEN')===token);
                    const registrations=Object.values(all).filter(value=>value.opcode==='arcade_registerMultiplayerConnection'&&literal(value,'TOKEN')===token);
                    const event=registrations.length===1&&input(registrations[0],'EVENT');
                    const valid=hats.length===1&&hats[0]===owner&&event?.opcode==='math_number'&&[1,2].includes(Number(event.fields?.NUM?.value));if(valid)origins.add(node);return valid;
                }
                if(player&&op==='arrays_specialValue')return ['null','undefined'].includes(literal(node,'KIND'));
                if(player&&!['data_variable','arcade_getLocal','arcade_getCaptured','arcade_callFunction'].includes(op)&&!/^argument_reporter_/.test(op))return false;
                if(!player&&op==='arcade_playerProperty'){
                    const property=input(node,'PROPERTY');
                    const evidence=new Set(),valid=literal(node,'READ')==='safe'&&property?.opcode==='math_number'&&Number(property.fields?.NUM?.value)===2&&safe(input(node,'PLAYER'),true,evidence)&&evidence.size>0;if(valid){origins?.add(node);domains?.add('number');}return valid;
                }
                if (['text','bw_stringLiteral','math_number','bw_numberLiteral','arrays_specialValue',
                    'operator_join','operator_letter_of','operator_length','operator_add','operator_subtract',
                    'operator_multiply','operator_divide','operator_mod','operator_round','operator_random',
                    'operator_equals','operator_gt','operator_lt','operator_not','operator_and','operator_or',
                    'arrays_valueTruthy','arrays_valueCompare','arcade_sourceTypeOf','arcade_askForString',
                    'arcade_spriteToString','arcade_bufferToString','arcade_bufferToHex'].includes(op)) {origins?.add(node);terminalDomain(node,domains);return true;}
                if (op === 'arcade_inspectValue') {
                    if(!domains)return safe(input(node,'VALUE'))&&safe(input(node,'LIMIT'));
                    const limit=new Set();if(!safe(input(node,'VALUE'))||!safe(input(node,'LIMIT'),false,null,limit))return false;
                    domains.add(limit.size&&[...limit].every(type=>['number','undefined'].includes(type))?'string':'unknown');return true;
                }
                if (op === 'data_variable') {
                    const id=node.fields?.VARIABLE?.id, variable=target.lookupVariableById(id);
                    if (!variable || cells.referenceTypeOf(target,id) || (player?!!cells.typeOf(target,id):cells.typeOf(target,id) && !kinds.has(cells.typeOf(target,id)))) return false;
                    const writers=runtime.targets.filter(t=>t.isOriginal!==false).flatMap(t=>Object.values(t.blocks._blocks)
                        .filter(b=>['data_setvariableto','data_changevariableby'].includes(b.opcode) && t.lookupVariableById(b.fields?.VARIABLE?.id)===variable)
                        .map(writer=>({target:t,writer})));
                    if(!writers.length&&!player){try{const value=primitive(variable.value);domains?.add(value===null?'null':typeof value);origins?.add(variable);}catch{return false;}}
                    return (!player||writers.length>0)&&writers.every(entry=>{if(entry.target!==target)return false;if(domains&&entry.writer.opcode==='data_changevariableby'){domains.add('number');return safe(input(entry.writer,'VALUE'),player,origins);}return safe(input(entry.writer,'VALUE'),player,origins,domains);});
                }
                if (op === 'arcade_getLocal' || op === 'arcade_getCaptured' || /^argument_reporter_/.test(op)) {
                    const name=/^argument_reporter_/.test(op)?node.fields?.VALUE?.value:literal(node,'NAME');
                    const scope=captureProof.scopeOf(node),cell=op==='arcade_getCaptured'?captureProof.captured(scope,name):captureProof.local(scope,name);
                    return safeCell(cell,player,origins,domains,op==='arcade_getLocal'?node:null);
                }
                if (op === 'arcade_callFunction') {
                    const name=literal(node,'NAME'),definitions=Object.values(all).filter(value=>value.opcode==='procedures_definition'&&input(value,'custom_block')?.mutation?.proccode===name);
                    if(definitions.length!==1)return false;const definition=definitions[0];
                    if(domains&&!player){const completion=normalReturns(definition);if(completion.fallthrough)domains.add('undefined');return (completion.fallthrough||completion.results.length>0)&&completion.results.every(ret=>safe(input(ret,'VALUE'),false,origins,domains));}
                    const returns=Object.values(all).filter(b=>owners.get(b)===name && b.opcode==='arcade_returnValue');
                    if(player){let last=read(definition.next);const chain=new Set();while(last?.next&&!chain.has(last)){chain.add(last);last=read(last.next);}if(last?.opcode!=='arcade_returnValue')return false;}
                    return returns.length>0 && returns.every(ret=>safe(input(ret,'VALUE'),player,origins));
                }
                if (op==='arrays_valueBinary') {
                    if(!domains)return safe(input(node,'LEFT'))&&safe(input(node,'RIGHT'));
                    const left=new Set(),right=new Set();if(!safe(input(node,'LEFT'),false,null,left)||!safe(input(node,'RIGHT'),false,null,right))return false;
                    const operation=literal(node,'OP');
                    if(operation==='+') {if(left.has('string')||right.has('string'))domains.add('string');if([...left].some(type=>type!=='string')&&[...right].some(type=>type!=='string'))domains.add('number');if(!left.size||!right.size||left.has('unknown')||right.has('unknown'))domains.add('unknown');}
                    else domains.add(['-','*','/','%','**','&','|','^','<<','>>','>>>'].includes(operation)?'number':'unknown');
                    return true;
                }
                if (op==='arrays_valueUnary') {
                    if(!safe(input(node,'VALUE')))return false;
                    if(domains){const operation=literal(node,'OP');domains.add(operation==='typeof'?'string':operation==='!'?'boolean':['+','-','~'].includes(operation)?'number':'unknown');}return true;
                }
                return false;
            } finally {visited.delete(node);}
        };
        if(requested){for(const [index,request]of requested.entries()){const domains=new Set();structural=!!request.procedure;if(request.procedure){const scopes=captureProof.scopes.filter(scope=>scope.target===target&&scope.procedure===request.procedure);if(scopes.length!==1||!scopes[0].params.includes(request.formal))fail('actual formal binding differs');request.cell=captureProof.local(scopes[0],request.formal);}if(!(request.cell?safeCell(request.cell,false,null,domains):safe(input(request.node,request.name),false,null,domains))||!domains.size||domains.has('unknown'))fail('connected input lacks complete primitive domain evidence'+scoreDetail());possible.set(index,domains);}return;}
        if (!safe(input(block,'VALUE')) || !safe(input(block,'LIMIT'))) fail('connected input lacks primitive producer authority'+scoreDetail());
        return {value:input(block,'VALUE'),limit:input(block,'LIMIT')};
    };
    const inspect = (args,util,onError) => {
        if (active) fail('reentrant inspection');
        active=true;
        try {
            current();
            const block=primitiveOwner.current(util,args);
            if (!block || block.opcode!=='arcade_inspectValue') fail('actual current primitive ownership is missing');
            reporterOwner(runtime,util,args,'arcade_inspectValue',[]);
            const target=util.thread.target;
            if (!snapshots.has(target)) fail('foreign or cloned target');
            const source=prove(target,block,null,null,util,args);
            const actual = (node,value) => {
                const decoded=primitive(value);
                if (node.opcode!=='math_number') return decoded;
                const field=node.fields?.NUM?.value;
                if (!Number.isFinite(Number(field)) || String(decoded)!==String(field)) fail('numeric shadow input differs');
                return Number(field);
            };
            const value=actual(source.value,args.VALUE),limit=actual(source.limit,args.LIMIT);
            if (limit!==undefined && typeof limit!=='number') fail('LIMIT requires Number or Undefined');
            return ''+value;
        } catch (error) {
            if (typeof onError!=='function') throw error;
            return onError(error);
        } finally {active=false;}
    };
    const inputDomains=(args,util,inputNames)=>{
        if(active)fail('reentrant primitive domain query');
        active=true;
        try{
            current();const block=primitiveOwner.current(util,args);
            if(!block)fail('actual current primitive ownership is missing');
            reporterOwner(runtime,util,args,block.opcode,[]);
            const target=util.thread.target;
            if(!snapshots.has(target)||!Array.isArray(inputNames)||new Set(inputNames.map(value=>JSON.stringify(value))).size!==inputNames.length)fail('actual primitive input slots are missing');
            const requests=inputNames.map(value=>{
                if(value&&typeof value==='object'&&!Array.isArray(value)){
                    if(Object.keys(value).sort().join(',')!=='formal,procedure'||typeof value.procedure!=='string'||typeof value.formal!=='string')fail('actual formal query differs');
                    return {procedure:value.procedure,formal:value.formal};
                }
                const path=typeof value==='string'?[value]:value;
                if(!Array.isArray(path)||!path.length||path.some(name=>typeof name!=='string'))fail('actual primitive input path differs');
                let node=block;
                for(const name of path.slice(0,-1)){
                    const child=target.blocks.getBlock(node.inputs?.[name]?.block);
                    if(!child||child.parent!==node.id)fail('actual primitive input path is not connected');node=child;
                }
                const name=path[path.length-1],child=target.blocks.getBlock(node.inputs?.[name]?.block);if(!child||child.parent!==node.id)fail('actual primitive input slot is missing or disconnected');
                return {node,name};
            });
            const possible=new Map();prove(target,block,requests,possible,util,args);
            return Object.freeze(requests.map((_,index)=>Object.freeze([...possible.get(index)])));
        }finally{active=false;}
    };
    return Object.freeze({inspect,inputDomains,snapshot,invalidate:()=>{snapshots=new Map();},dispose:()=>{disposed=true;snapshots=new Map();}});
}
module.exports=Object.assign(create,{primitive,scoreInfo,bindScoreAdapterInfo});
