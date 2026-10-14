import {validateCallableLexicalPlan} from './callable-lexical-plan.js';

// Validation of current editable SB3 blocks, independent of retained source
// bodies. This helper is not connected to the admitted exporter yet.
const fail = message => { throw new Error('Callable export graph: ' + message); };
const array = (text, label) => {
    try { const value = JSON.parse(text); if (Array.isArray(value)) return value; } catch (_) { /* named refusal below */ }
    fail('malformed ' + label);
};
export function callableDeclarationEnvelope(plan, site) {
    validateCallableLexicalPlan(plan);
    if (!plan.sites.some(row => row.id === site)) fail('unknown declaration site');
    return {schema: 'bw-callable-declaration', version: 1, site, plan};
}
export function validateCallableDeclarationEnvelope(envelope) {
    if (!envelope || Object.keys(envelope).some(key => !['schema','version','site','plan'].includes(key)) ||
        envelope.schema !== 'bw-callable-declaration' || envelope.version !== 1) fail('unknown declaration envelope');
    return callableDeclarationEnvelope(envelope.plan, envelope.site);
}
export function inspectCallableExportGraph(target, plan, literalInput) {
    validateCallableLexicalPlan(plan);
    if (!target || typeof target.blocks !== 'object' || !target.blocks || typeof literalInput !== 'function')
        fail('missing actual target block graph');
    const blocks = target.blocks, owners = new Map(plan.owners.map(owner => [owner.id, owner]));
    const procedures = new Map(), roots = new Map(), declarations = new Map(), creates = new Map(), services = new Map(), globalBindings = new Map();
    for (const [id, block] of Object.entries(blocks)) {
        if (!block || typeof block !== 'object') fail('malformed block');
        if (block.opcode !== 'procedures_definition') continue;
        const protoId = block.inputs?.custom_block?.[1], proto = blocks[protoId];
        if (!proto || proto.opcode !== 'procedures_prototype' || proto.parent !== id || typeof proto.mutation?.proccode !== 'string')
            fail('malformed procedure prototype');
        const matching = plan.owners.filter(owner => owner.procedure === proto.mutation.proccode);
        if (!matching.length) continue;
        const owner = matching[0];
        if (procedures.has(owner.id)) fail('duplicate owned procedure');
        const names = array(proto.mutation.argumentnames, 'procedure parameters');
        if (JSON.stringify(names) !== JSON.stringify(owner.parameters.map(id=>plan.bindings.find(binding=>binding.id===id).nativeName)))
            fail('edited procedure parameter ownership mismatch');
        const slots = proto.mutation.proccode.match(/%[sbn]/g) || [];
        if (slots.length !== names.length || slots.some(slot => slot !== '%s')) fail('edited procedure slots mismatch');
        procedures.set(owner.id, {id, prototype: protoId, body: block.next || null}); roots.set(id, owner.id);
    }
    for (const owner of owners.values()) if (owner.kind !== 'module' && !procedures.has(owner.id)) fail('missing current owned procedure');
    const rootOf = id => {
        const seen = new Set(); let current = id;
        while (current) {
            if (seen.has(current) || !blocks[current]) fail('cyclic or foreign parent graph');
            seen.add(current);
            const parent = blocks[current].parent;
            if (!parent) return current;
            current = parent;
        }
        fail('missing block root');
    };
    const reached = new Map();
    const visit = (id, root, parent=null, path=new Set()) => {
        if (!id) return;
        const block=blocks[id];
        if (!block || path.has(id) || block.parent !== parent) fail('missing, cyclic or inconsistent executable edges');
        if (reached.has(id)) fail('shared executable block across owners');
        reached.set(id,root);
        const nextPath=new Set(path);nextPath.add(id);
        for(const input of Object.values(block.inputs || {})) {
            if (!Array.isArray(input)) fail('malformed input edge');
            for(const child of input.slice(1)) if(typeof child==='string') visit(child,root,id,nextPath);
        }
        if(block.next)visit(block.next,root,id,nextPath);
    };
    for(const [id,block] of Object.entries(blocks))if(!block.parent)visit(id,id);
    const siteNames = new Map(plan.sites.map(site => [owners.get(site.owner).procedure.replace(/(?: %s)+$/, ''), site]));
    for (const [id, block] of Object.entries(blocks)) {
        if(block.opcode==='arcade_declareSourceCallable') {
            let envelope;try{envelope=JSON.parse(literalInput(block,'SIGNATURE'));}catch(_){fail('source callable variable requires fixed signature metadata');}
            if(!envelope || envelope.schema!=='bw-callable-variable' || envelope.version!==1 || Object.keys(envelope).some(key=>!['schema','version','binding','signature','variableName','variableId'].includes(key)))fail('unknown source callable variable envelope');
            const expected=callableVariableEnvelope(plan,envelope.binding);
            const {variableId,...unsealed}=envelope;
            if(JSON.stringify(unsealed)!==JSON.stringify(expected) || globalBindings.has(envelope.binding))fail('foreign or duplicate source callable variable binding');
            const slot=block.inputs?.VARIABLE?.[1],reporter=typeof slot==='string'?blocks[slot]:null, field=Array.isArray(slot)&&slot[0]===12?[slot[1],slot[2]]:reporter?.fields?.VARIABLE;
            if((!Array.isArray(slot)||slot[0]!==12)&&reporter?.opcode!=='data_variable' || !Array.isArray(field) || typeof field[1]!=='string')fail('source callable variable needs its actual connected ID');
            if(typeof variableId!=='string'||variableId!==field[1])fail('source callable lexical variable ID seal differs from connected binding');
            if(roots.has(rootOf(id)))fail('source variable declaration is not module-owned');
            if([...globalBindings.values()].some(row=>row.variableId===field[1]))fail('duplicate actual source variable ID');
            globalBindings.set(envelope.binding,{block:id,variableId:field[1]});
        } else if (block.opcode === 'arcade_declareCallable') {
            const name = literalInput(block, 'NAME'), text = literalInput(block, 'METADATA');
            let envelope; try { envelope = JSON.parse(text); } catch (_) { fail('declaration requires fixed metadata JSON'); }
            validateCallableDeclarationEnvelope(envelope);
            if (JSON.stringify(envelope.plan) !== JSON.stringify(plan)) fail('inconsistent declaration plans');
            const site = siteNames.get(name);
            if (!site || site.id !== envelope.site || declarations.has(site.id)) fail('duplicate or foreign declaration');
            if (roots.has(rootOf(id))) fail('declaration is not module-owned');
            declarations.set(site.id, id);
        } else if (block.opcode === 'arcade_createCallable') {
            const site = siteNames.get(literalInput(block, 'NAME'));
            if (!site || creates.has(site.id)) fail('duplicate or unknown creation site');
            const actualRoot=reached.get(id);
            if(!actualRoot)fail('unreachable current creation');
            const actualOwner = roots.get(actualRoot) || plan.module;
            if (actualOwner !== site.createdIn) fail('creation moved out of lexical owner');
            creates.set(site.id, id);
        } else if (block.opcode === 'arcade_whenCallableDispatched') {
            const site = siteNames.get(literalInput(block, 'NAME'));
            if (!site || services.has(site.id) || block.parent) fail('duplicate or foreign service hat');
            const command = blocks[block.next];
            if (!command || command.parent !== id || command.opcode !== 'arcade_runCallableDispatch' || command.next ||
                Object.keys(command.inputs || {}).length) fail('edited service body is not the qualified bridge');
            services.set(site.id, id);
        } else if (block.opcode === 'arcade_runCallableDispatch') {
            if (blocks[block.parent]?.opcode !== 'arcade_whenCallableDispatched') fail('loose dispatch command');
        }
    }
    // Native frames create local cells only when their assignment executes.
    // Do not invent an earlier cell by hoisting an exported let initializer.
    for(const owner of plan.owners.filter(owner=>owner.kind!=='module')) {
        const initialized=new Set(owner.parameters.map(id=>plan.bindings.find(row=>row.id===id).nativeName));
        let statement=blocks[procedures.get(owner.id).body];
        while(statement) {
            const inspectInputs=(block,underControl=false)=>{
                if(block.opcode==='arcade_getLocal') {
                    const name=literalInput(block,'NAME'),binding=plan.bindings.find(row=>row.owner===owner.id&&row.nativeName===name);
                    if(binding?.kind==='local'&&!initialized.has(name))fail('current local read precedes numeric initialization');
                }
                if(block.opcode==='arcade_createCallable') {
                    const site=siteNames.get(literalInput(block,'NAME'));
                    if(underControl)fail('lexical creation under control needs qualified current dominance');
                    for(const capture of site.captures) {
                        const binding=plan.bindings.find(row=>row.id===capture.binding);
                        if(binding.owner===owner.id && binding.kind==='local' && !initialized.has(binding.nativeName))
                            fail('current creation precedes its native local cell initialization');
                    }
                }
                for(const [name,input]of Object.entries(block.inputs || {}))for(const id of input.slice(1))if(typeof id==='string')
                    inspectInputs(blocks[id],underControl || name.startsWith('SUBSTACK'));
                if(underControl && block.next)inspectInputs(blocks[block.next],true);
            };
            inspectInputs(statement);
            if(statement.opcode==='arcade_setLocal') {
                const name=literalInput(statement,'NAME'),binding=plan.bindings.find(row=>row.owner===owner.id&&row.nativeName===name);
                if(binding?.kind==='parameter' && !binding.written && plan.sites.some(site=>site.captures.some(capture=>capture.binding===binding.id&&capture.mode==='value')))
                    fail('edited snapshot parameter writes need qualified capture-mode update');
                const value=blocks[statement.inputs?.VALUE?.[1]];
                if(value?.opcode!=='arrays_valueUndefined'&&!(value?.opcode==='arrays_specialValue'&&value.fields?.KIND?.[0]==='undefined'))initialized.add(name);
            }
            statement=blocks[statement.next];
        }
    }
    for (const site of plan.sites) if (!declarations.has(site.id) || !creates.has(site.id) || !services.has(site.id))
        fail('incomplete current site/declaration/service graph');
    for(const binding of plan.bindings)if(binding.kind==='global' && binding.type.kind==='callable' && !globalBindings.has(binding.id))
        fail('missing actual connected source callable variable declaration');
    return {plan, target, procedures, declarations, creates, services,globalBindings};
}
export function renderCallableSignature(signature) {
    if (signature.kind === 'named') return signature.name;
    return '(' + signature.parameters.map(parameter => parameter.name + (parameter.optional ? '?' : '') + ': ' +
        renderCallableSignature(parameter.type)).join(', ') + ') => ' + renderCallableSignature(signature.result);
}

// The caller compiles the current procedure blocks using these binding/site
// lookups. No original AST body is consulted or supplied to the callback.
export function createCallableLexicalEmitter(graph, compileCurrentBody) {
    if (typeof compileCurrentBody !== 'function') fail('missing current-body compiler');
    const {plan} = graph, owners = new Map(plan.owners.map(owner=>[owner.id,owner]));
    const bindings = new Map(plan.bindings.map(binding=>[binding.id,binding]));
    const active = new Set();
    const lookup = (owner, nativeName, capture) => {
        const candidates = capture ? plan.sites.find(site=>site.owner===owner.id)?.captures.map(row=>bindings.get(row.binding)) || [] :
            plan.bindings.filter(binding=>binding.owner===owner.id);
        const binding = candidates.find(binding=>binding.nativeName===nativeName);
        if (!binding) fail('edited body refers to an unowned ' + (capture?'capture':'local'));
        return binding;
    };
    const emit = owner => {
        if (!owner || owner.kind==='module' || active.has(owner.id)) fail('recursive lexical creation graph');
        active.add(owner.id);
        try {
            const context = {
                owner,
                local: nativeName=>lookup(owner,nativeName,false).sourceName,
                capture: (nativeName,write=false)=>{
                    const binding=lookup(owner,nativeName,true);
                    if(write && !binding.written) fail('edited body writes a snapshot capture');
                    return binding.sourceName;
                },
                create: blockId=>{
                    const site=plan.sites.find(site=>graph.creates.get(site.id)===blockId);
                    if(!site || site.createdIn!==owner.id) fail('edited creation is not owned here');
                    return emit(owners.get(site.owner));
                }
            };
            const body=compileCurrentBody(graph.procedures.get(owner.id).body,context);
            if(!Array.isArray(body) || body.some(line=>typeof line!=='string')) fail('current-body compiler returned malformed lines');
            const locals=plan.bindings.filter(binding=>binding.owner===owner.id && binding.kind==='local');
            if(locals.some(binding=>binding.declarationKind!=='let')) fail('unqualified edited local declaration syntax');
            const params=owner.signature.parameters.map(parameter=>{
                const fallback=owner.defaults.find(row=>row.name===parameter.name);
                return parameter.name + (parameter.optional && !fallback?'?':'') + ': ' + renderCallableSignature(parameter.type) +
                    (fallback?' = '+JSON.stringify(fallback.value):'');
            }).join(', ');
            const lines=[...locals.map(binding=>'    let '+binding.sourceName+': '+renderCallableSignature(binding.type)+' = undefined'),...body];
            const result=renderCallableSignature(owner.signature.result);
            if(owner.kind==='declaration') return 'function '+owner.sourceName+'('+params+'): '+result+' {\n'+lines.join('\n')+'\n}';
            return (owner.kind==='arrow'?'('+params+') =>':'function ('+params+'): '+result) +
                ' {\n'+lines.join('\n')+'\n}';
        } finally { active.delete(owner.id); }
    };
    return {
        declarations:()=>plan.owners.filter(owner=>owner.kind==='declaration' && owner.parent===plan.module).map(emit),
        moduleCreate:blockId=>{
            const site=plan.sites.find(site=>graph.creates.get(site.id)===blockId);
            if(!site || site.createdIn!==plan.module) fail('creation is not module-owned');
            return emit(owners.get(site.owner));
        }
    };
}
export function callableVariableEnvelope(plan, bindingId) {
    validateCallableLexicalPlan(plan);
    const binding=plan.bindings.find(row=>row.id===bindingId);
    if(!binding || binding.owner!==plan.module || binding.kind!=='global' || binding.type.kind!=='callable')
        fail('source variable requires its actual module callable binding');
    return {schema:'bw-callable-variable',version:1,binding:binding.id,variableName:binding.nativeName,signature:binding.type};
}

// First concrete exporter surface: current straight-line scalar closure bodies.
// Unknown edited reporters fail explicitly; inert signatures never authorize a
// replacement body or invent an opaque reporter's type.
export function validateCallableCurrentBodyTypes(graph,literalInput) {
    const {plan,target,procedures}=graph,blocks=target.blocks;
    const named=name=>({kind:'named',name}),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
    const typeOf=(slot,owner,seen=new Set())=>{
        if(Array.isArray(slot)) {
            if([4,5,6,7,8].includes(slot[0]))return named('number');
            if(slot[0]===10)return named('string');
            if(slot[0]===12) {
                const row=[...graph.globalBindings.values()].find(row=>row.variableId===slot[2]);
                return row&&plan.bindings.find(binding=>binding.id===row.binding)?.type;
            }
        }
        const block=blocks[slot];if(!block||seen.has(slot))return null;
        seen=new Set(seen);seen.add(slot);
        const input=name=>typeOf(block.inputs?.[name]?.[1],owner,seen);
        const binding=name=>plan.bindings.find(binding=>binding.nativeName===name&&
            (binding.owner===owner.id || plan.sites.find(site=>site.owner===owner.id)?.captures.some(capture=>capture.binding===binding.id)));
        if(block.opcode==='arcade_createCallable') {
            const site=plan.sites.find(site=>graph.creates.get(site.id)===slot);
            return site&&plan.owners.find(owner=>owner.id===site.owner).signature;
        }
        if(block.opcode==='arcade_getCaptured'||block.opcode==='arcade_getLocal')return binding(block.fields?.NAME?.[0] ?? literalInput(block,'NAME'))?.type;
        if(block.opcode==='argument_reporter_string_number')return binding(block.fields?.VALUE?.[0])?.type;
        if(block.opcode==='math_number')return named('number');
        if(block.opcode==='text')return named('string');
        if(block.opcode==='arrays_valueUndefined')return named('undefined');
        if(block.opcode==='arrays_specialValue'&&['undefined','null'].includes(block.fields?.KIND?.[0]))return named(block.fields.KIND[0]);
        if(block.opcode==='arrays_valueNull')return named('null');
        if(block.opcode==='operator_add')return named('number');
        if(block.opcode==='arrays_valueBinary') {
            const left=input('LEFT'),right=input('RIGHT'),op=block.fields?.OP?.[0];
            if(op==='+'&&left&&right) {
                if(left.name==='string'||right.name==='string')return named('string');
                if(left.name==='number'&&right.name==='number')return named('number');
            }
            if(['-','*','/','%','**','&','|','^','<<','>>','>>>'].includes(op)&&left?.name==='number'&&right?.name==='number')return named('number');
            if(['===','!==','<','>','<=','>='].includes(op)&&left&&right)return named('boolean');
        }
        return null;
    };
    for(const owner of plan.owners.filter(owner=>owner.kind!=='module')) {
        const assigned=new Set();
        let id=procedures.get(owner.id).body;
        while(id) {
            const block=blocks[id];
            if(Object.keys(block.inputs || {}).some(name=>name.startsWith('SUBSTACK')))fail('edited control body types are not qualified');
            if(['arcade_setCaptured','arcade_setLocal'].includes(block.opcode)) {
                const name=block.fields?.NAME?.[0] ?? literalInput(block,'NAME'),site=plan.sites.find(site=>site.owner===owner.id);
                const binding=plan.bindings.find(binding=>binding.nativeName===name&&
                    (binding.owner===owner.id||site?.captures.some(capture=>capture.binding===binding.id)));
                const actual=typeOf(block.inputs?.VALUE?.[1],owner);
                const initialUndefined=block.opcode==='arcade_setLocal'&&binding?.kind==='local'&&binding.owner===owner.id&&
                    binding.type.kind==='named'&&binding.type.name==='number'&&actual?.kind==='named'&&actual.name==='undefined'&&!assigned.has(binding.id);
                if(!binding||!actual||(!same(binding.type,actual)&&!initialUndefined))fail('edited current assignment differs from its concrete lexical signature');
                assigned.add(binding.id);
            }
            if(block.opcode==='arcade_returnValue') {
                const actual=typeOf(block.inputs?.VALUE?.[1],owner);
                if(!actual||!same(owner.signature.result,actual))fail('edited current return differs from its concrete lexical signature');
            }
            id=block.next;
        }
    }
}
