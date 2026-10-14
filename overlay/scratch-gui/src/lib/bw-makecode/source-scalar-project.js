/** Portable source declaration inventory; variable IDs remain the authority. */
export function sourceScalarProject(project) {
    const result = new Map(), registered = new Set();
    const targets = project.targets || [];
    const resolve = (target, block) => {
        const value = block.inputs?.VARIABLE?.[1];
        const reporter = typeof value === 'string' ? target.blocks?.[value] : null;
        const id = reporter?.opcode === 'data_variable' ? reporter.fields?.VARIABLE?.[1] :
            Array.isArray(value) && value[0] === 12 ? value[2] : null;
        const type = block.fields?.TYPE?.[0];
        if (block.inputs?.TYPE) throw Error('Source scalar export type must be a direct field');
        if (!id || !['Number','Boolean','String','Any'].includes(type)) throw Error('Source scalar export needs a variable reporter and fixed type');
        const owner = Object.hasOwn(target.variables || {}, id) ? target : targets.find(candidate => candidate.isStage && Object.hasOwn(candidate.variables || {}, id));
        const variable = owner?.variables?.[id];
        if (!variable) throw Error('Source scalar export variable binding is missing or foreign');
        if (result.has(id)) throw Error('Duplicate source scalar declaration');
        result.set(id, {id, type, name: variable[0], target: owner});
        registered.add(block);
    };
    for (const target of targets) for (const hat of Object.values(target.blocks || {})) {
        if (!hat.topLevel || hat.opcode !== 'arcade_whenSourceStarts') continue;
        let block = target.blocks[hat.next]; const visited = new Set();
        while (['arcade_declareSourceScalar','arcade_declareSourceReference'].includes(block?.opcode)) {
            if (visited.has(block)) throw Error('Cyclic source scalar declaration sequence');
            visited.add(block); if(block.opcode==='arcade_declareSourceScalar')resolve(target, block); block = target.blocks[block.next];
        }
    }
    for (const target of targets) for (const block of Object.values(target.blocks || {})) {
        if (block.opcode === 'arcade_declareSourceScalar' && !registered.has(block)) throw Error('Source scalar declarations must precede source initializers');
    }
    return result;
}
