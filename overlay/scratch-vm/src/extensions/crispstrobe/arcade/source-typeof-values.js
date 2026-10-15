// Source typeof uses the current owner of a value, never its token spelling.
// Ambiguous native Sprite carriers require their separate source proof.
const sourceGraphCurrent = (runtime, snapshots, semantic) => {
    const originals = runtime.targets.filter(target => target.isOriginal !== false);
    return snapshots.size === originals.length && originals.every(target => {
        const saved = snapshots.get(target), current = Object.entries(target.blocks._blocks);
        return saved && saved.container === target.blocks && saved.entries.size === current.length && current.every(([id, block]) =>
            saved.entries.get(id)?.block === block && saved.entries.get(id)?.semantic === semantic(block));
    });
};
module.exports = function createSourceTypeOfValues(runtime, values, owners) {
    const fail = reason => {throw new Error('Arcade source typeof: ' + reason);};
    const assertOwner = () => {if (!owners.current()) fail('native owner changed or disposed');};
    const typeOf = value => {
        assertOwner();
        const decoded = values.decode(value);
        if (decoded === null || decoded === undefined || ['number', 'boolean', 'string'].includes(typeof decoded)) {
            return typeof decoded;
        }
        if (!values.isReference(decoded)) fail('unregistered object or function value');
        const kind = decoded.bwReference.kind;
        const id = values.referenceId(runtime, decoded, kind);
        if (id === null) fail('foreign or stale ' + kind + ' reference');
        if (kind === 'callable' && typeof owners.callable === 'function') {
            let classification;
            try {classification = owners.callable(decoded, id);} catch (_) {fail('callable body missing or stale');}
            if (!['function', 'object'].includes(classification)) fail('callable ownership classification missing');
            if (!inputSnapshots.size || !sourceGraphCurrent(runtime, inputSnapshots, semantic))
                fail('callable source graph changed or uninitialized; restart the project');
            return classification;
        }
        if (!['array', 'image', 'buffer', 'object'].includes(kind)) fail('unsupported reference owner ' + kind);
        const validate = owners[kind];
        if (typeof validate !== 'function') fail(kind + ' ownership adapter missing');
        let admitted = false;
        try {admitted = validate(decoded, id) === true;} catch (_) { /* Preserve one named ownership refusal. */ }
        if (!admitted) fail(kind + ' body missing or stale');
        return 'object';
    };
    let inputSnapshots = new Map();
    const semantic = block => JSON.stringify([block.opcode, block.fields, block.inputs, block.next, block.mutation, block.shadow, block.parent, block.topLevel]);
    typeOf.snapshotInputs = () => {
        inputSnapshots = new Map();
        for (const target of runtime.targets || []) if (target.isOriginal !== false) {
            inputSnapshots.set(target, {container:target.blocks, entries:new Map(Object.entries(target.blocks._blocks).map(([id, block]) =>
                [id, {block, semantic:semantic(block)}]))});
        }
    };
    typeOf.invalidateInputs = () => {inputSnapshots = new Map();};
    typeOf.validateInput = (cells, util, value, args) => module.exports.validateInput(runtime, values, cells, util, value, inputSnapshots, semantic, args);
    typeOf.assertOwner = assertOwner;
    return typeOf;
};

// Raw Sprite handles and literal text share a runtime carrier. Prove the
// connected source of a String before accepting it; never search Sprite IDs.
module.exports.validateInput = function validateInput(runtime, values, cells, util, value, snapshots, semantic, args) {
    if (!util) return;
    const target = util.target || util.thread?.target;
    const thread=util.thread;
    if(!runtime.targets.includes(target) || thread?.target!==target || thread.isKilled ||
        !runtime.threads?.includes(thread) || !runtime.isActiveThread?.(thread) ||
        thread.blockContainer!==target.blocks || util.runtime && util.runtime!==runtime) {
        throw new Error('Arcade source typeof: caller or block container is no longer owned by the active runtime');
    }
    const rootId=util.thread?.peekStack?.();
    // Scratch evaluates input reporters in a flat operation list. The thread
    // stack names the enclosing command; bind the reporter by its actual input
    // argument object, rather than its value or a guessed parent/name.
    const operations=target?.blocks?._cache?._executeCached?.[rootId]?._ops;
    const operation=args && operations?.find(op=>op.opcode==='arcade_sourceTypeOf' && op._argValues===args);
    const block = target?.blocks?.getBlock(args ? operation?.id : rootId);
    const fail = () => {throw new Error('Arcade source typeof: String input has opaque or Sprite source ownership');};
    if (!runtime.targets.includes(target) || block?.opcode !== 'arcade_sourceTypeOf') fail();
    const originals=runtime.targets.filter(t=>t.isOriginal!==false);
    if(!snapshots?.has(target) || originals.length!==snapshots.size || originals.some(t=>{
        const snapshot=snapshots.get(t), current=Object.entries(t.blocks._blocks);
        return !snapshot || snapshot.container!==t.blocks || snapshot.entries.size!==current.length || current.some(([id,node])=>
            snapshot.entries.get(id)?.block!==node || snapshot.entries.get(id)?.semantic!==semantic(node));
    })) {
        throw new Error('Arcade source typeof: source input metadata changed; restart the project');
    }
    const operand=target.blocks.getBlock(block.inputs?.VALUE?.block);
    // Scratch numeric shadows use textual field storage. Only the actual
    // connected numeric literal, under the unchanged live graph above, supplies
    // Number authority; text with the same spelling remains String.
    if (operand?.opcode==='math_number') {
        const field=operand.fields?.NUM?.value;
        if (typeof field!=='string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(field) ||
            !Number.isFinite(Number(field)) || String(values.decode(value))!==field) fail();
        return 'number';
    }
    if (typeof values.decode(value) !== 'string') return;
    const all = target.blocks._blocks;
    const read = id => target.blocks.getBlock(id);
    const input = (node, name) => read(node?.inputs?.[name]?.block);
    const literal = (node, name) => node?.fields?.[name]?.value ?? input(node, name)?.fields?.TEXT?.value;
    const owner = new Map();
    const mark = (node, scope, seen = new Set()) => {
        if (!node || seen.has(node)) return;
        seen.add(node);owner.set(node, scope);
        for (const slot of Object.values(node.inputs || {})) mark(read(slot.block), scope, seen);
        mark(read(node.next), scope, seen);
    };
    for (const node of Object.values(all)) if (node.topLevel) {
        const prototype = input(node, 'custom_block');
        mark(read(node.next), node.opcode === 'procedures_definition' ? prototype?.mutation?.proccode : node);
    }
    const seen = new Set();
    const arraySeen = new Set();
    let readsArray=false;
    const nullable = node => node?.opcode === 'arrays_specialValue' && ['null','undefined'].includes(literal(node, 'KIND'));
    const arrayElements = node => {
        if (!node || arraySeen.has(node)) return false;
        arraySeen.add(node);
        try {
            if (node.opcode === 'arrays_createReference') {
                let item = input(node, 'VALUES');
                const visited = new Set();
                while (item?.opcode === 'arrays_referenceValues') {
                    if (visited.has(item)) return false;
                    visited.add(item);
                    const value = input(item, 'VALUE');
                    if (!primitive(value) && !arrayElements(value)) return false;
                    item = input(item, 'REST');
                }
                return item?.opcode === 'text' && item.fields?.TEXT?.value === '[]';
            }
            if (node.opcode === 'data_variable') {
                const id = node.fields?.VARIABLE?.id, variable = target.lookupVariableById(id);
                // Read any current binding to validate generation/schema. The
                // actual writes below establish element provenance, including
                // mixed arrays which have no reference declaration of their own.
                cells.referenceTypeOf(target, id);
                const relevantTargets=runtime.targets.filter(t=>t.isOriginal!==false);
                const assignments = relevantTargets.flatMap(t=>Object.values(t.blocks._blocks).filter(b => b.opcode === 'data_setvariableto' &&
                    t.lookupVariableById(b.fields?.VARIABLE?.id) === variable).map(block=>({target:t,block})));
                if(assignments.some(entry=>entry.target!==target))return false;
                const writes=assignments.map(entry=>input(entry.block,'VALUE'));
                if (!writes.some(arrayElements) || !writes.every(node=>nullable(node) || arrayElements(node))) return false;
                return true;
            }
            if (node.opcode === 'arcade_getLocal' || /^argument_reporter_/.test(node.opcode)) {
                const name = node.opcode === 'arcade_getLocal' ? literal(node, 'NAME') : node.fields?.VALUE?.value, scope = owner.get(node);
                if (!scope) return false;
                const assignments = Object.values(all).filter(b => owner.get(b) === scope && b.opcode === 'arcade_setLocal' && literal(b, 'NAME') === name);
                if (!assignments.every(b => nullable(input(b,'VALUE')) || arrayElements(input(b, 'VALUE')))) return false;
                const index = typeof scope === 'string' ? target.blocks.getProcedureParamNamesIdsAndDefaults(scope)?.[0]?.indexOf(name) ?? -1 : -1;
                if (index < 0) return assignments.length > 0;
                const calls = Object.values(all).filter(b => b.opcode === 'arcade_callFunction' && literal(b, 'NAME') === scope);
                return calls.length > 0 && calls.every(call => {
                    let argument = input(call, 'ARGS');
                    for (let i=0; i<index; i++) argument = input(argument, 'REST');
                    return argument?.opcode === 'arcade_functionArgument' && arrayElements(input(argument, 'VALUE'));
                });
            }
            return false;
        } finally {arraySeen.delete(node);}
    };
    const primitive = node => {
        if (!node || seen.has(node)) return false;
        seen.add(node);
        try {
            const op = node.opcode;
            if (['text', 'bw_stringLiteral', 'math_number', 'bw_numberLiteral', 'arrays_specialValue',
                'operator_add','operator_subtract','operator_multiply','operator_divide','operator_mod','operator_round','operator_random',
                'operator_join', 'operator_letter_of', 'arrays_valueTruthy', 'arrays_valueCompare',
                'operator_equals', 'operator_gt', 'operator_lt', 'operator_not', 'operator_and', 'operator_or',
                'arrays_jsonValue', 'arcade_askForString', 'arcade_sourceTypeOf', 'arcade_spriteToString',
                'arcade_bufferToString', 'arcade_bufferToHex'].includes(op)) return true;
            if (op === 'data_variable') {
                const id = node.fields?.VARIABLE?.id;
                if (cells.referenceTypeOf(target, id)) return false;
                const kind = cells.typeOf(target, id);
                if (!['Number', 'Boolean', 'String', 'Any'].includes(kind)) return false;
                const variable = target.lookupVariableById(id);
                const assignments = runtime.targets.filter(t => t.isOriginal !== false).flatMap(t =>
                    Object.values(t.blocks._blocks).filter(b => b.opcode === 'data_setvariableto' &&
                        t.lookupVariableById(b.fields?.VARIABLE?.id) === variable).map(b => ({target:t, block:b})));
                return assignments.every(entry => entry.target === target && primitive(input(entry.block, 'VALUE')));
            }
            if (op === 'arcade_getLocal' || /^argument_reporter_/.test(op)) {
                const name = op === 'arcade_getLocal' ? literal(node, 'NAME') : node.fields?.VALUE?.value;
                const scope = owner.get(node);
                if (!scope) return false;
                const assignments = Object.values(all).filter(b => owner.get(b) === scope && b.opcode === 'arcade_setLocal' && literal(b, 'NAME') === name);
                if (!assignments.every(b => primitive(input(b, 'VALUE')))) return false;
                const metadata = typeof scope === 'string' && target.blocks.getProcedureParamNamesIdsAndDefaults(scope);
                const index = metadata?.[0]?.indexOf(name) ?? -1;
                if (index < 0) return assignments.length > 0;
                const calls = Object.values(all).filter(b => b.opcode === 'arcade_callFunction' && literal(b, 'NAME') === scope);
                return calls.length > 0 && calls.every(call => {
                    let argument = input(call, 'ARGS');
                    for (let i=0; i<index; i++) argument = input(argument, 'REST');
                    return argument?.opcode === 'arcade_functionArgument' && primitive(input(argument, 'VALUE'));
                });
            }
            if (op === 'arcade_callFunction') {
                const name = literal(node, 'NAME'), definition = read(target.blocks.getProcedureDefinition(name));
                if (!definition) return false;
                const returns = Object.values(all).filter(b => owner.get(b) === name && b.opcode === 'arcade_returnValue');
                return returns.length > 0 && returns.every(b => primitive(input(b, 'VALUE')));
            }
            if (['arrays_referenceItem','arrays_referenceTake','arrays_referenceRandom'].includes(op)) {readsArray=true;return arrayElements(input(node, 'ARRAY'));}
            if (op === 'arrays_valueBinary') return primitive(input(node, 'LEFT')) && primitive(input(node, 'RIGHT'));
            if (op === 'arrays_valueUnary') return primitive(input(node, 'VALUE'));
            return false;
        } finally {seen.delete(node);}
    };
    if (!primitive(input(block, 'VALUE'))) fail();
    const elementSeen = new Set();
    const elementValue = node => {
        if (primitive(node) || arrayElements(node)) return true;
        if (!node || elementSeen.has(node)) return false;
        elementSeen.add(node);
        try {
            if (node.opcode !== 'arcade_getLocal') return false;
            const scope=owner.get(node), name=literal(node,'NAME');
            if (!scope) return false;
            const assignments=Object.values(all).filter(b=>owner.get(b)===scope && b.opcode==='arcade_setLocal' && literal(b,'NAME')===name);
            // Each actual assignment must independently supply a supported
            // primitive or array body; a union cannot grant an opaque writer.
            return assignments.length>0 && assignments.every(b=>elementValue(input(b,'VALUE')));
        } finally {elementSeen.delete(node);}
    };
    if(readsArray){
        // A receiver may have aliased a read body before being rebound. Its
        // current identity cannot erase a prior write. This also applies to
        // local and direct array expressions, not just global array cells.
        const mutations=runtime.targets.filter(t=>t.isOriginal!==false).flatMap(t=>Object.values(t.blocks._blocks)
            .filter(b=>b.opcode==='arrays_mutateReference').map(block=>({target:t,block})));
        if(!mutations.every(entry=>{
            if(entry.target!==target)return false;
            const op=literal(entry.block,'OP');
            if(['removeAt','pop','shift','removeElement','reverse','length'].includes(op))return true;
            return ['push','unshift','set','insertAt'].includes(op) &&
                elementValue(input(entry.block,'VALUE'));
        }))fail();
    }
};
