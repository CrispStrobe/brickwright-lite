// Normal completion is control-flow evidence, never a value-domain producer.
// Facades are bound to the exact AST and cannot be supplied as caller-made sets.
const issued = new WeakMap();
export function sourceNormalCompletionFor(program, facade) {
    const record=issued.get(facade);
    return record?.program===program&&record.snapshot===JSON.stringify(program)?record:null;
}
export function analyseSourceNormalCompletion(program, immutableFunctionAt) {
    const reachable = new WeakSet(), functions = new Map(), active = new Set();
    const flow = (fallthrough = true, returned = false) => ({fallthrough, returned});
    const values = node => Object.values(node).filter(value => value && typeof value === 'object');
    const functionFlow = fn => {
        if (functions.has(fn)) return functions.get(fn);
        // A recursive/unknown invocation cannot prove abrupt termination.
        if (active.has(fn)) return flow(true, true);
        active.add(fn);const result = sequence(fn.body);active.delete(fn);
        functions.set(fn, result);return result;
    };
    const expression = node => {
        if (!node || typeof node !== 'object') return true;
        if (Array.isArray(node)) return node.every(expression);
        if (['FunctionDeclaration','FunctionExpression','Class'].includes(node.type)) return true;
        if (node.type === 'Conditional') return expression(node.test) && (expression(node.consequent) || expression(node.alternate));
        if (node.type === 'Logical' || node.type === 'Binary' && ['&&','||','??'].includes(node.op)) return expression(node.left);
        if (!values(node).every(expression)) return false;
        if (node.type === 'Call' && !node.isNew) {
            const fn = immutableFunctionAt(node);
            if (fn) {const result = functionFlow(fn);return result.fallthrough || result.returned;}
        }
        return true;
    };
    const statement = node => {
        if (!node) return flow();
        if (node.type === 'ThrowStatement') return flow(false);
        if (node.type === 'Return') return flow(false, expression(node.value));
        if (node.type === 'Block') return sequence(node.body);
        if (node.type === 'If') {
            if (!expression(node.test)) return flow(false);
            const yes = sequence(node.consequent), no = sequence(node.alternate);
            return flow(yes.fallthrough || no.fallthrough, yes.returned || no.returned);
        }
        // Structured contexts are not a nonreturning certificate. The Throw
        // consumer separately refuses loops/Switch/Try in its bounded slice.
        if (['For','ForOf','ForIn','While','DoWhile','Switch','Try','TryStatement'].includes(node.type)) return flow();
        if (node.type === 'FunctionDeclaration' || node.type === 'Class') return flow();
        return flow(expression(node));
    };
    function sequence(nodes) {
        let next = true, returned = false;
        for (const node of nodes || []) {if (!next) break;const result = statement(node);returned ||= result.returned;next = result.fallthrough;}
        return flow(next, returned);
    }
    const markExpression = (node, live) => {
        if (!node || typeof node !== 'object') return live;
        if (Array.isArray(node)) {for (const item of node) live = markExpression(item, live);return live;}
        if (live) reachable.add(node);
        if (['FunctionDeclaration','FunctionExpression'].includes(node.type)) {markSequence(node.body, true);return live;}
        if (node.type === 'Class') {for (const field of node.fields || []) markExpression(field.init, live);for (const method of [node.ctor,...(node.methods || [])].filter(Boolean)) markSequence(method.body,true);return live;}
        if (node.type === 'Conditional') {const after = markExpression(node.test,live);markExpression(node.consequent,after);markExpression(node.alternate,after);return live && expression(node);}
        if (node.type === 'Logical' || node.type === 'Binary' && ['&&','||','??'].includes(node.op)) {const after=markExpression(node.left,live);markExpression(node.right,after);return live && expression(node);}
        for (const value of values(node)) live = markExpression(value,live);
        return live && expression(node);
    };
    const markStatement = (node, live) => {
        if (!node) return live;if (live) reachable.add(node);
        if (['FunctionDeclaration','FunctionExpression','Class'].includes(node.type)) {markExpression(node,live);return live;}
        if (node.type === 'Block') {markSequence(node.body,live);return live && statement(node).fallthrough;}
        if (node.type === 'If') {const after=markExpression(node.test,live);markSequence(node.consequent,after);markSequence(node.alternate,after);return live && statement(node).fallthrough;}
        if (node.type === 'Return' || node.type === 'ThrowStatement') {markExpression(node.value || node.argument,live);return false;}
        markExpression(node,live);return live && statement(node).fallthrough;
    };
    function markSequence(nodes, live) {for (const node of nodes || []) live = markStatement(node,live);return live;}
    reachable.add(program);markSequence(program.body,true);
    const facade=Object.freeze({isReachable:node=>reachable.has(node),functionFallsThrough:fn=>functionFlow(fn).fallthrough,functionReturnsNormally:fn=>functionFlow(fn).returned});
    issued.set(facade,Object.freeze({program,snapshot:JSON.stringify(program),...facade}));return facade;
}
