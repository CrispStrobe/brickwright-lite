const matchingWrites = (project, type, name, id) => {
    const writes = [];
    for (const target of project.targets || []) {
        for (const block of Object.values(target.blocks || {})) {
            if (!type.includes(block.opcode)) continue;
            const field = block.fields && block.fields.VARIABLE;
            const fieldName = field && String(field[0]);
            const fieldId = field && field[1] != null ? String(field[1]) : null;
            if (id && fieldId ? id === fieldId : name === fieldName) {
                writes.push({input: block.inputs && block.inputs.VALUE, blocks: target.blocks || {}});
            }
        }
    }
    return writes;
};

const inputDependsOn = (project, input, blocks, wantedOpcode, seen = new Set()) => {
    const inner = Array.isArray(input) ? input[1] : null;
    if (Array.isArray(inner)) {
        if (inner[0] === 13) return wantedOpcode === 'data_itemoflist';
        if (inner[0] !== 12) return false;
        const name = String(inner[1]);
        const id = inner[2] == null ? null : String(inner[2]);
        const token = `variable:${id || name}`;
        if (seen.has(token)) return false;
        const nextSeen = new Set(seen).add(token);
        return matchingWrites(project, ['data_setvariableto', 'data_changevariableby'], name, id)
            .some(write => inputDependsOn(project, write.input, write.blocks, wantedOpcode, nextSeen));
    }
    if (typeof inner !== 'string' || !blocks[inner] || seen.has(inner)) return false;
    const block = blocks[inner];
    if (block.opcode === wantedOpcode) return true;
    const nextSeen = new Set(seen).add(inner);
    return Object.values(block.inputs || {})
        .some(child => inputDependsOn(project, child, blocks, wantedOpcode, nextSeen));
};

export const printDependsOnNumericList = project => {
    for (const target of project.targets || []) {
        const blocks = target.blocks || {};
        for (const block of Object.values(blocks)) {
            if (block.opcode === 'stc12_print' &&
                inputDependsOn(project, block.inputs && block.inputs.VALUE, blocks, 'data_itemoflist')) {
                return true;
            }
        }
    }
    return false;
};

export const printDependsOnRandomControlFlow = project => {
    for (const target of project.targets || []) {
        const blocks = target.blocks || {};
        for (const block of Object.values(blocks)) {
            if (block.opcode !== 'stc12_print') continue;
            const seenParents = new Set();
            let parentId = block.parent;
            while (parentId && blocks[parentId] && !seenParents.has(parentId)) {
                seenParents.add(parentId);
                const parent = blocks[parentId];
                for (const [key, input] of Object.entries(parent.inputs || {})) {
                    if (/^SUBSTACK/.test(key)) continue;
                    if (inputDependsOn(project, input, blocks, 'operator_random')) return true;
                }
                parentId = parent.parent;
            }
        }
    }
    return false;
};
