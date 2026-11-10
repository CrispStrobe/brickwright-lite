// Globals whose saved initial value can never be observed.
//
// A program-start script (green flag or `arcade source starts`) runs once.
// When every reference to a variable anywhere in the project lies inside that
// one script, and the script's first top-level statement that references the
// variable is a plain `set` whose value does not read it, no code can read the
// variable before that assignment: earlier statements, procedures they call,
// yields and other scripts never mention it. Its saved SB3 value is then dead,
// and the export need not declare a `0`/text default that the flow-insensitive
// reimport would see as a second producer.
//
// Everything is conservative: a variable name appearing as any field or
// primitive value outside the script (menus that name variables by text,
// declarations, monitors of other kinds) counts as a reference.

const START_HATS = new Set(['event_whenflagclicked', 'arcade_whenSourceStarts']);

function blockIds(blocks, root) {
    const seen = new Set(), stack = [root];
    while (stack.length) {
        const id = stack.pop();
        if (typeof id !== 'string' || seen.has(id) || !blocks[id]) continue;
        seen.add(id);
        const block = blocks[id];
        if (block.next) stack.push(block.next);
        for (const input of Object.values(block.inputs || {})) for (const value of input.slice(1)) if (typeof value === 'string') stack.push(value);
    }
    return seen;
}

function mentions(block, id, name) {
    for (const field of Object.values(block.fields || {})) if (Array.isArray(field) && (field[1] === id || field[0] === name)) return true;
    for (const input of Object.values(block.inputs || {})) for (const value of input.slice(1))
        if (Array.isArray(value) && (value[2] === id || value[1] === name)) return true;
    // Mutations may name variables inside nested JSON text: match the name
    // only as a whole quoted token (plain or escaped quotes).
    if (typeof block.mutation === 'object' && block.mutation) {
        const text = JSON.stringify(block.mutation), quoted = JSON.stringify(name).slice(1, -1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`(?:\\\\)*"${quoted}(?:\\\\)*"`).test(text)) return true;
    }
    return false;
}

export function startupFirstWriteVariables(project, eligible = () => false) {
    const result = new Set();
    const targets = project?.targets || [];
    const stage = targets.find(target => target.isStage);
    // Clone-local (per-instance) and list variables are outside this slice.
    const candidates = [];
    for (const target of targets) for (const [id, variable] of Object.entries(target.variables || {}))
        if (Array.isArray(variable) && typeof variable[0] === 'string' && eligible(target, id, variable[0])) candidates.push({target, id, name: variable[0]});
    const hats = [];
    for (const target of targets) for (const [id, block] of Object.entries(target.blocks || {}))
        if (block && block.topLevel && START_HATS.has(block.opcode)) hats.push({target, id});
    for (const {target: owner, id, name} of candidates) {
        if (targets.filter(target => Object.values(target.variables || {}).some(variable => variable?.[0] === name)).length !== 1) continue;
        const containing = [];
        for (const target of targets) for (const [blockId, block] of Object.entries(target.blocks || {}))
            if (block && mentions(block, id, name)) containing.push({target, blockId});
        if (!containing.length) continue;
        const scripts = hats.filter(hat => {
            const ids = blockIds(hat.target.blocks, hat.id);
            return containing.every(row => row.target === hat.target && ids.has(row.blockId));
        });
        if (scripts.length !== 1) continue;
        const {target, id: hatId} = scripts[0], blocks = target.blocks;
        if (owner !== stage && owner !== target) continue;
        for (let statement = blocks[hatId].next; statement; statement = blocks[statement]?.next) {
            const ids = blockIds({...blocks, [statement]: {...blocks[statement], next: null}}, statement);
            if (![...ids].some(blockId => mentions(blocks[blockId], id, name))) continue;
            const block = blocks[statement], field = block.fields?.VARIABLE;
            if (block.opcode !== 'data_setvariableto' || !Array.isArray(field) || field[1] !== id) break;
            const valueIds = new Set();
            for (const value of (block.inputs?.VALUE || []).slice(1)) {
                if (Array.isArray(value) && (value[2] === id || value[1] === name)) { valueIds.add(null); break; }
                if (typeof value === 'string') for (const child of blockIds(blocks, value)) valueIds.add(child);
            }
            if (valueIds.has(null) || [...valueIds].some(blockId => blockId && mentions(blocks[blockId], id, name))) break;
            result.add(id);
            break;
        }
    }
    return result;
}
