// console.inspect's primitive branch from the selected MIT PXT console
// contract. Domain admission is separate from conversion: never call a
// reference, getter, custom toString or Object.keys inspection path here.
const primitiveOwner = require('../../../util/bw-primitive-owner');
const reporterOwner = require('./font-selector-owner');
const kinds = new Set(['Number','Boolean','String','Any']);
const semantic = block => JSON.stringify([block.opcode,block.fields,block.inputs,block.next,
    block.mutation,block.shadow,block.parent,block.topLevel]);

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

function create(runtime, cells) {
    let snapshots = new Map(), disposed = false, active = false;
    const bound = !!runtime && typeof runtime.on === 'function' && Array.isArray(runtime.targets);
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
        for (const target of runtime.targets) if (target.isOriginal !== false)
            snapshots.set(target,{container:target.blocks,variables:new Map(Object.entries(target.variables||{}).map(([id,variable])=>[id,{variable,signature:JSON.stringify([variable.id,variable.name,variable.type])}])),blocks:new Map(Object.entries(target.blocks._blocks).map(([id,block]) =>
                [id,{block,semantic:semantic(block)}]))});
    };
    const prove = (target, block) => {
        const all = target.blocks._blocks, read = id => target.blocks.getBlock(id);
        const input = (node,name) => read(node?.inputs?.[name]?.block);
        const text = node => node?.opcode === 'text' ? node.fields?.TEXT?.value : null;
        const literal = (node,name) => node?.fields?.[name]?.value ?? text(input(node,name));
        const owners = new Map(), seen = new Set();
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
        const safe = node => {
            if (!node) return false;
            if (seen.has(node)) return true; // A flow backedge cannot introduce an opaque producer; every outgoing writer is still checked.
            seen.add(node);
            try {
                const op=node.opcode;
                if (['text','bw_stringLiteral','math_number','bw_numberLiteral','arrays_specialValue',
                    'operator_join','operator_letter_of','operator_length','operator_add','operator_subtract',
                    'operator_multiply','operator_divide','operator_mod','operator_round','operator_random',
                    'operator_equals','operator_gt','operator_lt','operator_not','operator_and','operator_or',
                    'arrays_valueTruthy','arrays_valueCompare','arcade_sourceTypeOf','arcade_askForString',
                    'arcade_spriteToString','arcade_bufferToString','arcade_bufferToHex'].includes(op)) return true;
                if (op === 'arcade_inspectValue') return safe(input(node,'VALUE')) && safe(input(node,'LIMIT'));
                if (op === 'data_variable') {
                    const id=node.fields?.VARIABLE?.id, variable=target.lookupVariableById(id);
                    if (!variable || cells.referenceTypeOf(target,id) || cells.typeOf(target,id) && !kinds.has(cells.typeOf(target,id))) return false;
                    const writers=runtime.targets.filter(t=>t.isOriginal!==false).flatMap(t=>Object.values(t.blocks._blocks)
                        .filter(b=>['data_setvariableto','data_changevariableby'].includes(b.opcode) && t.lookupVariableById(b.fields?.VARIABLE?.id)===variable)
                        .map(writer=>({target:t,writer})));
                    return writers.every(entry=>entry.target===target && safe(input(entry.writer,'VALUE')));
                }
                if (op === 'arcade_getLocal' || /^argument_reporter_/.test(op)) {
                    const name=op==='arcade_getLocal'?literal(node,'NAME'):node.fields?.VALUE?.value, owner=owners.get(node);
                    if (!owner) return false;
                    const writes=Object.values(all).filter(b=>owners.get(b)===owner && b.opcode==='arcade_setLocal' && literal(b,'NAME')===name);
                    if (!writes.every(writer=>safe(input(writer,'VALUE')))) return false;
                    const params=typeof owner==='string' && target.blocks.getProcedureParamNamesIdsAndDefaults(owner);
                    const index=params?.[0]?.indexOf(name) ?? -1;
                    if (index<0) return writes.length>0;
                    const calls=Object.values(all).filter(b=>b.opcode==='arcade_callFunction' && literal(b,'NAME')===owner);
                    // An unresolved dynamic callee can target this procedure.
                    if (Object.values(all).some(b=>b.opcode==='arcade_callFunction' && typeof literal(b,'NAME')!=='string')) return false;
                    return calls.length>0 && calls.every(call=>{const arg=argumentsFor(call,index);return arg===null || arg!==false && safe(arg);});
                }
                if (op === 'arcade_callFunction') {
                    const name=literal(node,'NAME'), definition=read(target.blocks.getProcedureDefinition(name));
                    if (!definition) return false;
                    const returns=Object.values(all).filter(b=>owners.get(b)===name && b.opcode==='arcade_returnValue');
                    return returns.length>0 && returns.every(ret=>safe(input(ret,'VALUE')));
                }
                if (op==='arrays_valueBinary') return safe(input(node,'LEFT'))&&safe(input(node,'RIGHT'));
                if (op==='arrays_valueUnary') return safe(input(node,'VALUE'));
                return false;
            } finally {seen.delete(node);}
        };
        if (!safe(input(block,'VALUE')) || !safe(input(block,'LIMIT'))) fail('connected input lacks primitive producer authority');
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
            const source=prove(target,block);
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
    return Object.freeze({inspect,snapshot,invalidate:()=>{snapshots=new Map();},dispose:()=>{disposed=true;snapshots=new Map();}});
}
module.exports=Object.assign(create,{primitive});
