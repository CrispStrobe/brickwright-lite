/** Build-data proof only. Never evaluate emitted JavaScript. Unsupported shapes refuse. */
import {parse, tokenizer} from 'acorn';

const id = n => n?.type === 'Identifier';
const member = (n, name) => n?.type === 'MemberExpression' && !n.computed &&
    id(n.property) && n.property.name === name;
const integer = n => n?.type === 'Literal' && Number.isSafeInteger(n.value) && n.value >= 0;
const fn = n => ['FunctionExpression', 'ArrowFunctionExpression', 'FunctionDeclaration'].includes(n?.type);
const synchronous = n => fn(n) && !n.async && !n.generator;
const values = n => Object.entries(n).flatMap(([k, v]) => k === 'start' || k === 'end' ? [] :
    Array.isArray(v) ? v.filter(x => x?.type) : v?.type ? [v] : []);
function walk(node, action) { action(node); for (const child of values(node)) walk(child, action); }
function insist(ok, reason) { if (!ok) throw Error(reason); }
const numberKey = p => {
    if (p.type !== 'Property' || p.computed || p.method || p.kind !== 'init') return null;
    if (integer(p.key)) return p.key.value;
    const text = p.key.type === 'Literal' ? p.key.value : null;
    return typeof text === 'string' && /^(0|[1-9]\d*)$/.test(text) && Number.isSafeInteger(Number(text)) ? Number(text) : null;
};

// Lexical identity, including declarations which appear later, catches shadowed
// Promise/self/loader names. Complex patterns still declare their actual names.
function lexical(ast) {
    const at = new WeakMap(), declarations = new WeakMap(), nodes = [];
    const root = {parent: null, bindings: new Map(), functionScope: true};
    const declare = (scope, pattern, node) => {
        if (!pattern) return;
        if (id(pattern)) {
            const old = scope.bindings.get(pattern.name);
            const binding = old || {name: pattern.name, node, pattern, scope, duplicate: false};
            if (old) binding.duplicate = true;
            scope.bindings.set(pattern.name, binding); declarations.set(pattern, binding); return;
        }
        if (pattern.type === 'AssignmentPattern') return declare(scope, pattern.left, node);
        if (pattern.type === 'RestElement') return declare(scope, pattern.argument, node);
        if (pattern.type === 'ArrayPattern') for (const p of pattern.elements) declare(scope, p, node);
        if (pattern.type === 'ObjectPattern') for (const p of pattern.properties)
            declare(scope, p.type === 'RestElement' ? p.argument : p.value, node);
    };
    function visit(n, scope) {
        if (n.type === 'FunctionDeclaration' && n.id) declare(scope, n.id, n);
        if (n.type === 'ClassDeclaration' && n.id) declare(scope, n.id, n);
        if (fn(n)) {
            const inner = {parent: scope, bindings: new Map(), functionScope: true};
            at.set(n, inner); nodes.push(n);
            if (n.type === 'FunctionExpression' && n.id) declare(inner, n.id, n);
            for (const p of n.params) declare(inner, p, n);
            for (const p of n.params) visit(p, inner);
            visit(n.body, inner); return;
        }
        if (['BlockStatement', 'CatchClause', 'ForStatement', 'ForOfStatement', 'ForInStatement', 'SwitchStatement'].includes(n.type)) {
            scope = {parent: scope, bindings: new Map(), functionScope: false};
            if (n.type === 'CatchClause') declare(scope, n.param, n);
        }
        at.set(n, scope); nodes.push(n);
        if (n.type === 'VariableDeclaration') for (const d of n.declarations) {
            let owner = scope;
            if (n.kind === 'var') while (!owner.functionScope) owner = owner.parent;
            declare(owner, d.id, d);
        }
        for (const child of values(n)) visit(child, scope);
    }
    visit(ast, root);
    const binding = n => {
        if (!id(n)) return null;
        for (let s = at.get(n); s; s = s.parent) if (s.bindings.has(n.name)) return s.bindings.get(n.name);
        return null;
    };
    return {nodes, at, binding, declarations};
}
function reassigned(binding, model) {
    return model.nodes.some(n => n.type === 'AssignmentExpression' && id(n.left) && model.binding(n.left) === binding ||
        n.type === 'UpdateExpression' && id(n.argument) && model.binding(n.argument) === binding);
}
function intactLoader(row) {
    if (!row.require || row.require.duplicate || reassigned(row.require, row.model)) return false;
    let changed = false;
    walk(row.body.body, n => {
        const lhs = n.type === 'AssignmentExpression' ? n.left : n.type === 'UpdateExpression' ? n.argument : null;
        if (lhs?.type === 'MemberExpression' && row.model.binding(lhs.object) === row.require) changed = true;
    });
    return !changed;
}
const namespace = (n, model) => n?.type === 'MemberExpression' && !n.computed &&
    id(n.object) && n.object.name === 'self' && !model.binding(n.object) && id(n.property) &&
    /^webpackChunk\w+$/.test(n.property.name) ? n.property.name : null;
function registration(n, model) {
    if (n.type !== 'CallExpression' || !member(n.callee, 'push') || n.arguments.length !== 1) return null;
    const a = n.callee.object;
    if (a.type !== 'AssignmentExpression' || a.operator !== '=') return null;
    const ns = namespace(a.left, model), right = a.right;
    if (!ns || right.type !== 'LogicalExpression' || right.operator !== '||' ||
        namespace(right.left, model) !== ns || right.right.type !== 'ArrayExpression' || right.right.elements.length) return null;
    const packet = n.arguments[0];
    if (packet.type !== 'ArrayExpression' || packet.elements.length !== 2) return null;
    const [ids, modules] = packet.elements;
    if (ids?.type !== 'ArrayExpression' || !ids.elements.length || !ids.elements.every(integer) || modules?.type !== 'ObjectExpression') return null;
    return {namespace: ns, ids: ids.elements.map(x => x.value), modules};
}
function moduleRows(object, model, file, ns) {
    insist(object.properties.length > 0, 'EMPTY_MODULE_DICTIONARY');
    const rows = [], seen = new Set();
    for (const p of object.properties) {
        const key = numberKey(p);
        insist(key !== null && key !== false && !seen.has(key) && synchronous(p.value) &&
            p.value.params.length <= 3 && p.value.params.every(id), 'MODULE_DICTIONARY_SHAPE');
        seen.add(key);
        rows.push({id: key, body: p.value, require: model.declarations.get(p.value.params[2]), file, namespace: ns, model});
    }
    return rows;
}
function parseFile(file) {
    const ast = parse(file.source, {ecmaVersion: 'latest', sourceType: 'script'}), model = lexical(ast);
    const parent = new WeakMap();
    walk(ast, n => { for (const child of values(n)) parent.set(child, n); });
    return {...file, ast, model, parent};
}
function registered(file) {
    const registrations = file.model.nodes.map(n => registration(n, file.model)).filter(Boolean);
    insist(registrations.length === 1, 'UNIQUE_CHUNK_REGISTRATION');
    const r = registrations[0];
    insist(file.ast.body.every(n => n.type === 'ExpressionStatement' &&
        (n.directive === 'use strict' || n.expression === file.model.nodes.find(x => registration(x, file.model)))), 'CHUNK_TOP_LEVEL');
    return {...r, file, rows: moduleRows(r.modules, file.model, file, r.namespace)};
}

// Cheap tokenizer preselection only, never authority: chosen candidates are
// completely parsed and their sole executable registration is checked above.
function headerIDs(source) {
    try {
        const t = tokenizer(source, {ecmaVersion: 'latest'}), tokens = [];
        for (let i = 0; i < 60; i++) { const x = t.getToken(); tokens.push(x); if (x.type.label === 'eof') break; }
        for (let i = 0; i < tokens.length - 5; i++) if (tokens[i].type.label === 'name' && tokens[i].value === 'push' &&
            tokens[i + 1].type.label === '(' && tokens[i + 2].type.label === '[' && tokens[i + 3].type.label === '[') {
            const ids = []; let j = i + 4;
            while (tokens[j]?.type.label === 'num') {
                ids.push(tokens[j++].value);
                if (tokens[j]?.type.label !== ',') break;
                j++;
            }
            if (tokens[j]?.type.label === ']') return ids;
        }
    } catch { /* Not an admitted header. */ }
    return [];
}
function normalizer(row) {
    const {model, require: loader} = row; let result = null;
    const exports = model.declarations.get(row.body.params[1]);
    if (!intactLoader(row) || !exports || exports.duplicate || reassigned(exports, model)) return null;
    walk(row.body.body, n => {
        if (n.type !== 'CallExpression' || !member(n.callee, 'd') || model.binding(n.callee.object) !== loader || n.arguments.length !== 2 ||
            model.binding(n.arguments[0]) !== exports) return;
        const defs = n.arguments[1];
        if (defs.type !== 'ObjectExpression') return;
        for (const p of defs.properties) if (!p.computed && (p.key.name || p.key.value) === 'normalizeProjectMenuArgs') {
            insist(!result && synchronous(p.value) && p.value.params.length === 0 && id(p.value.body), 'NORMALIZER_EXPORT');
            const b = model.binding(p.value.body);
            insist(b && !b.duplicate && !reassigned(b, model) && (synchronous(b.node) || synchronous(b.node.init)), 'NORMALIZER_BINDING'); result = b;
        }
    });
    return result;
}
function normalizerImports(row, exported) {
    const model = row.model, ownerScope = model.at.get(row.body);
    const owned = binding => { for (let scope = binding.scope; scope; scope = scope.parent) if (scope === ownerScope) return true; return false; };
    const imports = new Map(), edges = new Map(), pending = [exported];
    while (pending.length) {
        const binding = pending.pop(); if (edges.has(binding)) continue;
        const declaration = binding.node, refs = new Set(); edges.set(binding, refs);
        // Parameter binding.node is its owning function, not a declaration of
        // that parameter. Never recurse from a parameter into its entire owner.
        // Real local declarator aliases retain their own initializer edges.
        if (declaration.type === 'VariableDeclarator') {
            const init = declaration.init;
            if (init?.type === 'CallExpression' && id(init.callee) && model.binding(init.callee) === row.require &&
                init.arguments.length === 1 && integer(init.arguments[0])) { imports.set(binding, init.arguments[0].value); continue; }
        } else if (!(declaration.type === 'FunctionDeclaration' && declaration.id === binding.pattern)) continue;
        walk(declaration.type === 'VariableDeclarator' ? declaration.init || declaration : declaration.body, n => {
            if (!id(n) || model.declarations.has(n)) return;
            const parent = row.file.parent.get(n);
            if (parent?.type === 'MemberExpression' && parent.property === n && !parent.computed ||
                parent?.type === 'Property' && parent.key === n && !parent.computed && parent.value !== n) return;
            const dep = model.binding(n);
            if (!dep || dep === row.require || !owned(dep) ||
                fn(dep.node) && dep.node.id !== dep.pattern) return;
            refs.add(dep); if (!edges.has(dep)) pending.push(dep);
        });
    }
    // Only a path ending at an actual require initializer supplies table
    // ownership. A normalizer's counter or a helper's local parameter mutation
    // is not such a path; it neither lends nor destroys an import identity.
    const relevant = new Set(imports.keys()); let changed = true;
    while (changed) {
        changed = false;
        for (const [binding, refs] of edges) if (!relevant.has(binding) && [...refs].some(x => relevant.has(x))) {
            relevant.add(binding); changed = true;
        }
    }
    const selected = new Set();
    for (const binding of relevant) {
        insist(!binding.duplicate && !reassigned(binding, model), 'AMBIGUOUS_NORMALIZER_DEPENDENCY');
        if (imports.has(binding)) selected.add(imports.get(binding));
    }
    return selected;
}
function requires(row) {
    const out = new Set();
    if (!row.require) return out;
    insist(intactLoader(row), 'DEPENDENCY_LOADER_MUTATED');
    walk(row.body.body, n => {
        if (n.type === 'CallExpression' && id(n.callee) && row.model.binding(n.callee) === row.require &&
            n.arguments.length === 1 && integer(n.arguments[0])) out.add(n.arguments[0].value);
    });
    return out;
}
function requestGroups(row) {
    const out = [], {model, require: loader} = row;
    if (!loader || loader.duplicate) return out;
    let mutated = false;
    walk(row.body.body, n => {
        const lhs = n.type === 'AssignmentExpression' ? n.left : n.type === 'UpdateExpression' ? n.argument : null;
        if (lhs && (model.binding(lhs) === loader || lhs.type === 'MemberExpression' && model.binding(lhs.object) === loader)) mutated = true;
    });
    if (mutated) return out;
    walk(row.body.body, n => {
        if (n.type !== 'CallExpression' || !member(n.callee, 'then') || n.arguments.length !== 1) return;
        const all = n.callee.object, bind = n.arguments[0];
        if (all.type !== 'CallExpression' || !member(all.callee, 'all') || !id(all.callee.object) ||
            all.callee.object.name !== 'Promise' || model.binding(all.callee.object) || all.arguments.length !== 1 ||
            all.arguments[0].type !== 'ArrayExpression') return;
        if (bind.type !== 'CallExpression' || !member(bind.callee, 'bind') ||
            model.binding(bind.callee.object) !== loader || bind.arguments.length !== 2 ||
            model.binding(bind.arguments[0]) !== loader || !integer(bind.arguments[1])) return;
        // The bound module is actually consumed as the normalizer namespace.
        const thenMember = row.file.parent.get(n), continuation = row.file.parent.get(thenMember);
        if (!member(thenMember, 'then') || thenMember.object !== n || continuation?.type !== 'CallExpression' ||
            continuation.callee !== thenMember || !continuation.arguments.length) return;
        const callback = continuation.arguments[0];
        if (!fn(callback) || callback.params.length !== 1 || !id(callback.params[0])) return;
        let invoke = callback.body;
        if (invoke.type === 'BlockStatement' && invoke.body.length === 1 && invoke.body[0].type === 'ReturnStatement') invoke = invoke.body[0].argument;
        if (invoke?.type !== 'CallExpression' || !member(invoke.callee, 'normalizeProjectMenuArgs') ||
            model.binding(invoke.callee.object) !== model.declarations.get(callback.params[0])) return;
        const ids = [];
        for (const call of all.arguments[0].elements) {
            if (call?.type !== 'CallExpression' || !member(call.callee, 'e') ||
                model.binding(call.callee.object) !== loader || call.arguments.length !== 1 || !integer(call.arguments[0])) return;
            ids.push(call.arguments[0].value);
        }
        if (ids.length && new Set(ids).size === ids.length) out.push({ids, target: bind.arguments[1].value});
    });
    return out;
}
// A tiny pure interpreter for webpack's filename expression, not JavaScript
// execution. Validate EVERY branch before resolving only literal requested IDs.
function runtimeResolver(file, loader) {
    const {model} = file;
    const property = n => n?.type === 'MemberExpression' && model.binding(n.object) === loader &&
        (!n.computed && id(n.property) && n.property.name === 'u' || n.computed && n.property.type === 'Literal' && n.property.value === 'u');
    const writes = model.nodes.filter(n => n.type === 'AssignmentExpression' && property(n.left) ||
        n.type === 'UpdateExpression' && property(n.argument) || n.type === 'UnaryExpression' && n.operator === 'delete' && property(n.argument));
    if (!writes.length) return null;
    insist(writes.length === 1 && writes[0].type === 'AssignmentExpression' && writes[0].operator === '=', 'MUTATED_RUNTIME_RESOLVER');
    const fn = writes[0].right;
    insist(synchronous(fn) && fn.params.length === 1 && id(fn.params[0]), 'RUNTIME_RESOLVER_FUNCTION');
    const parameter = model.declarations.get(fn.params[0]);
    insist(parameter && !parameter.duplicate && !reassigned(parameter, model), 'RUNTIME_RESOLVER_PARAMETER');
    let body = fn.body;
    if (body.type === 'BlockStatement' && body.body.length === 1 && body.body[0].type === 'ReturnStatement') body = body.body[0].argument;
    let count = 0;
    function validate(n, depth = 0) {
        insist(n && ++count <= 20000 && depth <= 256, 'RUNTIME_RESOLVER_BOUND');
        if (n.type === 'Literal') { insist(typeof n.value === 'string' || integer(n), 'RUNTIME_RESOLVER_LITERAL'); return; }
        if (id(n)) { insist(model.binding(n) === parameter, 'RUNTIME_RESOLVER_FREE_BINDING'); return; }
        if (n.type === 'ConditionalExpression') { validate(n.test, depth + 1); validate(n.consequent, depth + 1); validate(n.alternate, depth + 1); return; }
        if (n.type === 'BinaryExpression' && ['+', '==='].includes(n.operator) || n.type === 'LogicalExpression' && n.operator === '||') {
            validate(n.left, depth + 1); validate(n.right, depth + 1); return;
        }
        if (n.type === 'MemberExpression' && n.computed && n.object.type === 'ObjectExpression') {
            const keys = new Set();
            for (const p of n.object.properties) {
                const key = numberKey(p);
                insist(key !== null && key !== false && !keys.has(key) && p.value.type === 'Literal' && typeof p.value.value === 'string', 'RUNTIME_RESOLVER_OWN_MAP');
                keys.add(key);
            }
            insist(keys.size <= 4096, 'RUNTIME_RESOLVER_MAP_BOUND'); validate(n.property, depth + 1); return;
        }
        throw Error('RUNTIME_RESOLVER_EXPRESSION');
    }
    validate(body);
    function value(n, cid) {
        if (n.type === 'Literal') return n.value;
        if (id(n)) return cid;
        if (n.type === 'ConditionalExpression') return value(n.test, cid) ? value(n.consequent, cid) : value(n.alternate, cid);
        if (n.type === 'LogicalExpression') return value(n.left, cid) || value(n.right, cid);
        if (n.type === 'BinaryExpression') {
            const left = value(n.left, cid), right = value(n.right, cid);
            return n.operator === '===' ? left === right : left + right;
        }
        const key = value(n.property, cid);
        insist(Number.isSafeInteger(key) && key >= 0, 'RUNTIME_RESOLVER_MAP_KEY');
        const entry = n.object.properties.find(p => numberKey(p) === key);
        return entry ? entry.value.value : undefined;
    }
    return cid => {
        const name = value(body, cid);
        insist(typeof name === 'string' && /^chunks\/[A-Za-z0-9_.-]+\.js$/.test(name) && !name.includes('..'), 'RUNTIME_RESOLVER_FILENAME');
        return name;
    };
}
function bootRows(file, ns) {
    const {model} = file, rows = [], runtimes = [];
    const namespaces = new Set(model.nodes.filter(n => n.type === 'AssignmentExpression' && n.operator === '=')
        .map(n => namespace(n.left, model)).filter(Boolean));
    insist(namespaces.size === 1 && namespaces.has(ns), 'RUNTIME_NAMESPACE');
    for (const n of model.nodes) if (n.type === 'AssignmentExpression' && n.operator === '=' && member(n.left, 'm') && id(n.left.object) && id(n.right)) {
        const require = model.binding(n.left.object), dict = model.binding(n.right);
        if (!require || require.duplicate || reassigned(require, model) || !synchronous(require.node) ||
            !dict || dict.duplicate || reassigned(dict, model) || dict.node.init?.type !== 'ObjectExpression') continue;
        // The actual runtime dispatches this dictionary with its own require
        // function as factory argument3. A numeric-looking unrelated object is
        // not an executable module inventory.
        let dispatch = false;
        walk(require.node.body, call => {
            if (call.type === 'CallExpression' && member(call.callee, 'call') &&
                call.callee.object.type === 'MemberExpression' && call.callee.object.computed &&
                model.binding(call.callee.object.object) === dict && call.arguments.length === 4 &&
                model.binding(call.arguments[3]) === require) dispatch = true;
        });
        if (dispatch) {
            rows.push(...moduleRows(dict.node.init, model, file, ns));
            runtimes.push({loader: require, resolve: runtimeResolver(file, require)});
        }
    }
    insist(rows.length > 0 && runtimes.length === 1, 'RUNTIME_MODULE_DICTIONARY'); return {rows, runtime: runtimes[0]};
}

/** Inputs are emitted JS strings, not executable functions. Refusal is data. */
export function proveMenuLazyCompanion({entryName, eagerSources, lazySources, html = '', marker = '+MULTIPLE_PORT'}) {
    try {
        insist(typeof marker === 'string' && marker.length > 0, 'MARKER');
        insist(typeof html === 'string', 'HTML');
        const all = [...eagerSources, ...lazySources], names = all.map(x => x.name);
        insist(all.length <= 4096 && all.every(x => typeof x.source === 'string' && x.source.length <= 16 * 1024 * 1024) &&
            all.reduce((n, x) => n + x.source.length, 0) <= 64 * 1024 * 1024, 'INPUT_BOUND');
        insist(new Set(names).size === names.length && all.every(x => typeof x.name === 'string' && typeof x.source === 'string'), 'FILE_INVENTORY');
        const entry = lazySources.filter(x => x.name === entryName); insist(entry.length === 1, 'NAMED_ENTRY');
        const named = registered(parseFile(entry[0])), ns = named.namespace;
        const targets = named.rows.filter(normalizer); insist(targets.length === 1, 'UNIQUE_NORMALIZER');
        const target = targets[0], selectedImports = normalizerImports(target, normalizer(target));
        insist(selectedImports.size > 0, 'NO_NORMALIZER_TABLE_DEPENDENCY');
        const eager = eagerSources.map(parseFile), groups = [], runtimes = [], eagerIDs = new Set();
        for (const file of eager) {
            let rows;
            if (file.model.nodes.some(n => registration(n, file.model))) {
                const r = registered(file); insist(r.namespace === ns, 'EAGER_CHUNK_NAMESPACE'); rows = r.rows;
                for (const cid of r.ids) eagerIDs.add(cid);
            } else if (file.model.nodes.some(n => n.type === 'AssignmentExpression' && namespace(n.left, file.model))) {
                const boot = bootRows(file, ns); rows = boot.rows; runtimes.push(boot.runtime);
            }
            else continue; // workers/service workers have no webpack menu runtime.
            for (const row of rows) for (const group of requestGroups(row))
                if (group.target === target.id) groups.push(group);
        }
        insist(groups.length > 0, 'NO_OWNED_REQUEST_GROUP');
        const signature = ids => [...ids].sort((a, b) => a - b).join(',');
        insist(groups.every(g => named.ids.every(id => g.ids.includes(id))) &&
            new Set(groups.map(g => signature(g.ids))).size === 1, 'AMBIGUOUS_REQUEST_GROUP');
        const requested = groups[0].ids, chunks = [named];
        insist(!requested.some(cid => eagerIDs.has(cid)), 'REQUESTED_CHUNK_ALREADY_EAGER');
        insist(runtimes.length <= 1, 'AMBIGUOUS_RUNTIME_RESOLVER');
        const resolve = runtimes[0]?.resolve;
        insist(new Set(named.ids).size === named.ids.length, 'DUPLICATE_ENTRY_CHUNK_ID');
        for (const cid of named.ids) {
            if (resolve) insist(resolve(cid) === entryName, 'RUNTIME_ENTRY_FILENAME');
            else {
                const owners = lazySources.filter(f => headerIDs(f.source).includes(cid));
                insist(owners.length === 1 && owners[0].name === entryName, 'UNIQUE_NAMED_CHUNK_ID');
            }
        }
        for (const cid of requested.filter(x => !named.ids.includes(x))) {
            const candidates = resolve ? lazySources.filter(f => f.name === resolve(cid)) : lazySources.filter(f => headerIDs(f.source).includes(cid));
            insist(candidates.length === 1 && candidates[0].name !== entryName, 'UNIQUE_COMPANION_FILE');
            const chunk = registered(parseFile(candidates[0]));
            insist(chunk.namespace === ns && chunk.ids.includes(cid) && chunk.ids.every(x => requested.includes(x)), 'COMPANION_NAMESPACE_OR_IDS');
            chunks.push(chunk);
        }
        const chunkIDs = new Set();
        for (const chunk of chunks) for (const cid of chunk.ids) {
            insist(!chunkIDs.has(cid), 'DUPLICATE_CHUNK_ID'); chunkIDs.add(cid);
        }
        const moduleMap = new Map();
        for (const chunk of chunks) for (const row of chunk.rows) {
            insist(!moduleMap.has(row.id), 'DUPLICATE_MODULE'); moduleMap.set(row.id, row);
        }
        const reached = new Set(), queue = [target.id];
        while (queue.length) {
            const mid = queue.pop(); if (reached.has(mid)) continue; reached.add(mid);
            const row = moduleMap.get(mid); if (row) for (const dep of mid === target.id ? selectedImports : requires(row)) if (moduleMap.has(dep)) queue.push(dep);
        }
        const carriers = [];
        for (const chunk of chunks) {
            const hits = chunk.rows.filter(r => {
                let found = false;
                walk(r.body.body, n => { if (n.type === 'Literal' && n.value === marker) found = true; });
                return found;
            });
            if (hits.length) {
                insist(hits.every(r => reached.has(r.id)), 'UNREACHED_MARKER_MODULE'); carriers.push(chunk.file.name);
            }
        }
        insist(carriers.length > 0, 'NO_REACHED_TABLE_MARKER');
        // A stray marker elsewhere cannot supply evidence or hide an eager copy.
        insist(!eagerSources.some(f => f.source.includes(marker)), 'EAGER_TABLE_MARKER');
        insist(chunks.every(c => !html.includes(c.file.name) && !html.includes(c.file.name.split('/').pop())), 'HTML_REQUEST_GROUP_REFERENCE');
        return Object.freeze({ok: true, namespace: ns, entryModule: target.id,
            filenameAuthority: resolve ? 'same-bootstrap-static-resolver' : 'unique-registration',
            requestedChunkIDs: Object.freeze([...requested]), files: Object.freeze(chunks.map(c => c.file.name)),
            markerFiles: Object.freeze(carriers)});
    } catch (error) { return Object.freeze({ok: false, reason: error.message}); }
}
