import {analyseSourceValueProducers} from './source-value-producers.js';

// Structural ABI transport only. Optional SDK type spellings produce no values.
// Resolve each original call before any rewrite; an omitted slot is a fact of
// that invocation, never a fact about every caller of the formal.
export function prepareOrdinaryCallOmissions(program) {
    const ordinary = new Set((program.body || []).filter(node => node.type === 'FunctionDeclaration'));
    const shape = fn => fn.params?.length && new Set(fn.params).size === fn.params.length &&
        fn.optionalParams?.length && new Set(fn.optionalParams).size === fn.optionalParams.length &&
        fn.optionalParams.every(name => fn.params.includes(name)) &&
        fn.params.slice(fn.params.findIndex(name => fn.optionalParams.includes(name)))
            .every(name => fn.optionalParams.includes(name)) &&
        !fn.parameterDefaults?.length && !Object.keys(fn.defaultParams || {}).length &&
        !fn.restParam && !fn.typeParameters?.length && !fn.bwCallableDefinition && !fn.bwClassCallableMethod;
    const candidates = new Set([...ordinary].filter(shape));
    if (!candidates.size) return {program, unsupported:[], omissions:[]};
    const graph = analyseSourceValueProducers(program, {arrayValues:true, parenthesized:true,
        unboundIsOpaque:true, opaqueDeclarationValues:true, uninitializedLocalsAreOpaque:true, declaredLocalUndefined:true});
    const selected = new Set([...candidates].filter(fn => graph.unchangedFunctionAt(fn) === fn));
    const calls = [], uses = [], nodes = [];
    const visit = (node, parent = null, key = null) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(child => visit(child, parent, key)); return; }
        nodes.push(node);
        if (node.type === 'Call') calls.push(node);
        if (node.type === 'Identifier') uses.push({node,parent,key});
        for (const [name, value] of Object.entries(node)) if (value && typeof value === 'object') visit(value,node,name);
    };
    visit(program);
    if (!calls.some(call => candidates.has(graph.unchangedFunctionAt(call)) &&
        call.args.length < graph.unchangedFunctionAt(call).params.length))
        return {program, unsupported:[], omissions:[]};
    const safeIndex = node => {
        if (!graph.arrayAllocationsAt(node.object).length || !graph.arrayMapReceiverSafeAt(node.object) ||
            graph.arrayConstraintErrorsAt(node.object).length ||
            node.object?.type === 'Identifier' && !graph.isInitializedAt(node.object)) return false;
        const types = graph.typesAt(node.index);
        if (types.size !== 1 || !types.has('Number')) return false;
        const initialized = value => {
            if (!value || typeof value !== 'object') return true;
            if (Array.isArray(value)) return value.every(initialized);
            if (value.type === 'Identifier' && !graph.isInitializedAt(value)) return false;
            return Object.values(value).every(initialized);
        };
        return initialized(node.index);
    };
    // A directed callee graph cannot inspect runtime source strings or aliased
    // host objects. Refuse that source domain, even in unused neighboring bodies.
    // Computed access has only the existing actual numeric Array proof exception;
    // constructor strings are neither folded nor interpreted.
    const dynamic = nodes.filter(node => node.type === 'Unknown' ||
        node.type === 'Identifier' && ['globalThis','window','self','this','eval','Function','Reflect','arguments'].includes(node.name) ||
        node.type === 'Member' && node.name === 'constructor' ||
        node.type === 'Index' && !safeIndex(node));
    if (dynamic.length) return {program, omissions:[], unsupported:[
        'Ordinary call omission: configured Unknown, ambient, dynamic code or unresolved computed access cannot establish an unchanged callee'
    ]};
    const plain = call => call?.type === 'Call' && call.callee?.type === 'Identifier' &&
        !call.isNew && !call.constructorCall && !call.typeArguments?.length &&
        !call.args?.some(arg => arg?.type === 'Spread');
    for (const {node,parent,key} of uses) {
        const fn = graph.unchangedFunctionAt(node);
        if (selected.has(fn) && !(key === 'callee' && plain(parent))) selected.delete(fn);
    }
    const replacements = new WeakMap(), omissions = [], unsupported = [];
    for (const call of calls) {
        const fn = graph.unchangedFunctionAt(call);
        if (!candidates.has(fn) || !plain(call)) continue;
        if (!selected.has(fn)) {
            if (call.args.length < fn.params.length)
                unsupported.push(`Ordinary call omission: ${fn.name} requires its unique unchanged unescaped declaration`);
            continue;
        }
        if (call.args.length > fn.params.length ||
            fn.params.slice(call.args.length).some(name => !fn.optionalParams.includes(name))) {
            unsupported.push(`Ordinary call omission: ${fn.name} missing required or excess actual arguments`);
            continue;
        }
        if (call.args.length === fn.params.length) continue;
        const slots = fn.params.slice(call.args.length).map((name, offset) =>
            Object.freeze({declaration:fn, call, name, index:call.args.length + offset}));
        replacements.set(call, [...call.args, ...slots.map(() => ({type:'Undefined'}))]);
        omissions.push(...slots);
    }
    const rewrite = node => {
        if (!node || typeof node !== 'object') return node;
        if (Array.isArray(node)) {
            const result = node.map(rewrite);
            return result.every((value,index) => value === node[index]) ? node : result;
        }
        if (Object.getPrototypeOf(node) !== Object.prototype) return node;
        let changed = false;
        const result = {};
        for (const [name,value] of Object.entries(node)) {
            const next = rewrite(name === 'args' && replacements.has(node) ? replacements.get(node) : value);
            result[name] = next; if (next !== value) changed = true;
        }
        return changed ? result : node;
    };
    return {program:rewrite(program), unsupported:[...new Set(unsupported)], omissions:Object.freeze(omissions)};
}
