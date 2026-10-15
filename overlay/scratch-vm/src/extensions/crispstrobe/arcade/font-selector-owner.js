// Scratch flattens nested reporter execution into the current command cache.
// The stack names that command; the actual argument object identifies the
// reporter operation. This helper reads ownership and never changes the cache.
module.exports = function fontSelectorOwner(runtime, util, args, opcode, selectors) {
    if (!util) return null; // Direct native callers retain their service checks.
    const fail = reason => {throw new Error('Arcade Font fixed fields: ' + reason);};
    const thread = util.thread, target = util.target || thread?.target;
    if (!runtime || !thread || !target || !runtime.targets?.includes(target) ||
        thread.target !== target || thread.isKilled || !runtime.threads?.includes(thread) ||
        !runtime.isActiveThread?.(thread) || runtime.sequencer?.activeThread !== thread ||
        util.runtime && util.runtime !== runtime || thread.blockContainer !== target.blocks) {
        fail('caller or block container is not owned by the active runtime');
    }
    const container = thread.blockContainer, root = thread.peekStack?.();
    const operations = container._cache?._executeCached?.[root]?._ops;
    const matches = operations?.filter(operation => operation.opcode === opcode && operation._argValues === args) || [];
    if (matches.length !== 1) fail('actual cached reporter arguments are missing or ambiguous');
    const operation = matches[0], block = container.getBlock?.(operation.id);
    if (!block || block.id !== operation.id || block.opcode !== opcode) fail('reporter block identity changed');
    if (operation.fields !== block.fields) fail('cached reporter field identity differs');
    // Blocks.getInputs owns a cached map distinct from block.inputs. Its
    // entries retain the actual non-branch input objects.
    if (operation.inputs !== container.getInputs?.(block)) fail('cached reporter input map differs');
    const inputNames = Object.keys(block.inputs || {}).filter(name => !name.startsWith('SUBSTACK'));
    if (inputNames.length !== Object.keys(operation.inputs || {}).length ||
        inputNames.some(name => operation.inputs[name] !== block.inputs[name])) {
        fail('cached reporter inputs differ from the current block');
    }
    if (operation.mutation !== block.mutation) fail('cached reporter mutation identity differs');
    if (typeof operation._blockFunction !== 'function' ||
        operation._blockFunction !== runtime.getOpcodeFunction?.(opcode)) fail('reporter primitive ownership changed');
    const seen = new Set();
    const reachable = id => {
        if (id === operation.id) return true;
        if (seen.has(id)) return false;
        seen.add(id);
        const current = container.getBlock?.(id);
        return !!current && Object.values(current.inputs || {}).some(input => input.block && reachable(input.block));
    };
    if (!reachable(root)) fail('reporter is not connected to the current command');
    for (const name of selectors) {
        if (block.inputs?.[name]) fail(name + ' cannot be a connected reporter');
        const field = block.fields?.[name];
        if (!field || field.value !== args[name]) fail(name + ' does not match its current literal field');
    }
    return block;
};
