/**
 * Arrays held in class fields, and functions held as values (2026-11-01).
 *
 * The dialect has numbers, text, NAMED lists and procedures. A class is
 * lowered to parallel arrays (translate-base.js, records), and every list is
 * a name known when the program is read. Two things a program can do that
 * the names cannot express:
 *
 *   class Chain { blocks: Block[] = [] }     this.blocks.push(b); this.blocks.length
 *   let f = (n: number) => n * 2             call(f, 3); this.handler = f
 *
 * This pass rewrites both into code the rest of the importer already reads,
 * before the walk starts, the way #1599's virtual dispatch does for a
 * method:
 *
 * ARRAY FIELDS. An array held in a field is a HANDLE, a number, like an
 * instance. The elements of every such array live in one pool pair per
 * element kind (text, or number — a record is its handle), `__ao_N` holding
 * the owning handle and `__av_N` the value, in push order; handle 0 is "no
 * array". Each operation is a generated procedure that scans the pool
 * (`__alen_N`, `__aget_Block`, `__apush_Block`, …): O(n) per access and exact
 * in order, aliasing and mutation, which is what makes `let b = this.blocks`
 * and `chain.blocks.slice(1)` mean what they do in MakeCode. A handle
 * variable (initialised from such an array or its slice/map/filter) is read
 * the same way.
 *
 * FUNCTION VALUES. A function expression (or a named function) used as a
 * value is lifted to a procedure `__fv_k` and its value is the number k. A
 * call through a variable, parameter or field of function type is the
 * dispatch procedure `__fcall_<signature>(f, args…)`, which tests k and calls
 * the matching lifted procedure: the dispatch #1599 built for virtual
 * methods, with the function id in the place of the class id. The array
 * callbacks (map, filter, forEach, some, every, find, reduce) are generated
 * procedures over these. A function that captures a LOCAL of its
 * surroundings cannot be lifted and is left as it was (refused by name).
 *
 * @module
 */

const ARRAY_TYPE = /^(?:Array<(.+)>|(.+)\[\])$/;
const BUILTIN_ROOTS = new Set(['Math', 'serial', 'basic', 'input', 'music', 'led', 'radio', 'game', 'images', 'pins', 'control',
    'loops', 'logic', 'text', 'arrays', 'datalogger', 'bluetooth', 'String', 'Number', 'Boolean', 'Array', 'console', 'undefined',
    'null', 'true', 'false', 'NaN', 'Infinity', 'parseInt', 'parseFloat', 'convertToText', 'randint', 'pauseUntil',
    'Buffer', 'NumberFormat', 'Note', 'Button', 'Gesture', 'DigitalPin', 'AnalogPin', 'TouchPin', 'IconNames', 'ArrowNames',
    'EventBusSource', 'EventBusValue', 'Delimiters']);
// Calls whose function arguments are event handlers, not values.
const HANDLER_ROOTS = new Set(['basic', 'input', 'music', 'led', 'radio', 'game', 'images', 'pins', 'control', 'loops', 'serial',
    'datalogger', 'bluetooth']);

const clean = text => String(text || '').replace(/\s+/g, '');
const ident = text => clean(text).replace(/[^A-Za-z0-9]/g, '_') || 'x';
const kindOf = elem => (clean(elem) === 'string' ? 'S' : 'N');
const fam = elem => (clean(elem) === 'string' ? 'S' : clean(elem) === 'boolean' ? 'B' : 'N');
const zeroOf = elem => (clean(elem) === 'string' ? '""' : clean(elem) === 'boolean' ? 'false' : '0');

const num = value => ({type: 'Number', value: String(value)});
const id = name => ({type: 'Identifier', name});
const call = (name, args) => ({type: 'Call', callee: id(name), args});

/** Split `(a:number,b:string)=>number` into {params:[…], ret}; null when it is not a function type. */
function fnType (text) {
    const t = clean(text);
    if (!t.includes('=>')) return null;
    const m = t.match(/^\((.*)\)=>(.+)$/);
    if (!m) return null;
    const params = [];
    let depth = 0;
    let cur = '';
    for (const ch of m[1]) {
        if (ch === ',' && depth === 0) {
            params.push(cur);
            cur = '';
            continue;
        }
        if ('(<[{'.includes(ch)) depth++;
        if (')>]}'.includes(ch)) depth--;
        cur += ch;
    }
    if (cur) params.push(cur);
    return {params: params.map(p => (p.includes(':') ? p.slice(p.indexOf(':') + 1) : 'number')), ret: m[2]};
}

/**
 * @param {object} ast the program (parseMakeCodeTs)
 * @param {function(string): object} parse parseMakeCodeTs, for the generated procedures
 * @returns {{changed: boolean}}
 */
export function lowerHandleValues (ast, parse) {
    const top = ast.body || [];
    const classes = top.filter(st => st.type === 'Class' && st.fields);

    // ── which fields are arrays ───────────────────────────────────────────
    const arrayFields = new Map();        // field name -> element type text
    const other = new Set();
    for (const cls of classes) {
        for (const f of cls.fields) {
            const m = !f.isStatic && f.typeName ? clean(f.typeName).match(ARRAY_TYPE) : null;
            if (!m) {
                other.add(f.name);
                continue;
            }
            const elem = m[1] || m[2];
            if (arrayFields.has(f.name) && arrayFields.get(f.name) !== elem) other.add(f.name);
            else arrayFields.set(f.name, elem);
        }
    }
    for (const name of other) arrayFields.delete(name);

    // ── which names hold functions ────────────────────────────────────────
    const fnFields = new Map();           // field name -> function type
    for (const cls of classes) {
        for (const f of cls.fields) if (!f.isStatic && fnType(f.typeName)) fnFields.set(f.name, fnType(f.typeName));
    }
    const globals = new Set(BUILTIN_ROOTS);
    const declaredFns = new Map();        // named function -> declaration
    for (const st of top) {
        if (st.type === 'FunctionDeclaration') {
            globals.add(st.name);
            declaredFns.set(st.name, st);
        }
        if (st.type === 'Declaration') for (const d of st.decls) globals.add(d.name);
        if (st.type === 'Class' || st.type === 'Enum' || st.type === 'Interface' || st.type === 'Namespace') globals.add(st.name);
    }
    const anyWork = arrayFields.size || fnFields.size || JSON.stringify(ast).includes('"=>') || JSON.stringify(ast).includes('FunctionExpression');
    if (!anyWork) return {changed: false};

    const need = {pools: new Set(), elems: new Map(), sigs: new Map(), anew: false, froms: new Set(), callbacks: new Map()};
    const lifted = [];                    // {id, name, node:FunctionDeclaration, sig}
    const handleVars = new Map();         // variable -> element type
    const fnVars = new Map();             // variable / parameter -> function type
    const reserve = (elem) => {
        const k = kindOf(elem);
        need.pools.add(k);
        need.elems.set(ident(elem), clean(elem));
        return k;
    };

    const literalElem = (e) => {
        if (e && e.type === 'Call' && e.isNew && e.callee.type === 'Identifier' && globals.has(e.callee.name)) return e.callee.name;
        return guessType(e);
    };
    // A function or method declared to return an array returns its handle.
    const arrayReturns = new Map();
    const BUILTIN_METHODS = /^(slice|concat|reverse|filter|map|push|pop|shift|unshift|indexOf|join|forEach|some|every|find|reduce|removeAt|insertAt)$/;
    {
        const drop = new Set();
        const note = (fn) => {
            const m = fn.returnType ? clean(fn.returnType).match(ARRAY_TYPE) : null;
            if (!m || BUILTIN_METHODS.test(fn.name)) return;
            const elem = m[1] || m[2];
            if (arrayReturns.has(fn.name) && arrayReturns.get(fn.name) !== elem) drop.add(fn.name);
            arrayReturns.set(fn.name, elem);
            fn.returnType = 'number';
        };
        for (const cls of classes) for (const m of cls.methods || []) if (!m.isStatic) note(m);
        for (const st of top) if (st.type === 'FunctionDeclaration') note(st);
        for (const name of drop) arrayReturns.delete(name);
    }
    const stringFields = new Set();
    for (const cls of classes) for (const f of cls.fields) if (clean(f.typeName) === 'string') stringFields.add(f.name);
    const guessType = (e) => {
        if (!e) return 'number';
        if (e.type === 'String' || e.type === 'Template') return 'string';
        if (e.type === 'Boolean' || e.type === 'Unary' && e.op === '!' || e.type === 'Binary' && /^(==|!=|===|!==|<|>|<=|>=|&&|\|\|)$/.test(e.op)) return 'boolean';
        if (e.type === 'Member' && stringFields.has(e.name)) return 'string';
        if (e.type === 'Binary' && e.op === '+' && (guessType(e.left) === 'string' || guessType(e.right) === 'string')) return 'string';
        if (e.type === 'Call' && e.callee && e.callee.type === 'Identifier' && e.callee.name === 'convertToText') return 'string';
        return 'number';
    };

    const returnTextOf = fnNode => {
        let ret = clean(fnNode.returnType);
        if (ret) return ret;
        walk(fnNode.body, n => {
            if (!ret && n.type === 'Return' && n.value) ret = guessType(n.value);
        });
        return ret || 'void';
    };

    // Names declared as handles: a declaration initialised from an array field
    // or a producer of arrays. Found by a fixpoint, since one feeds another.
    const elemOfHandle = node => {
        if (!node) return null;
        if (node.type === 'Member' && arrayFields.has(node.name)) return arrayFields.get(node.name);
        if (node.type === 'Identifier' && handleVars.has(node.name)) return handleVars.get(node.name);
        // [1, 2, 3].map(fn): a literal receiving a callback method is held as a handle for the call.
        if (node.type === 'Array' && node.__receiver) return node.items.length ? literalElem(node.items[0]) : 'number';
        if (node.type === 'Call' && node.callee.type === 'Member' &&
            /^(slice|concat|reverse|filter)$/.test(node.callee.name)) return elemOfHandle(node.callee.object);
        if (node.type === 'Call' && node.callee.type === 'Identifier' && node.__handleElem) return node.__handleElem;
        if (node.type === 'Call' && node.callee.type === 'Identifier' && arrayReturns.has(node.callee.name) && !node.isNew) return arrayReturns.get(node.callee.name);
        if (node.type === 'Call' && node.callee.type === 'Member' && arrayReturns.has(node.callee.name) && !node.isNew &&
            elemOfHandle(node.callee.object) === null) return arrayReturns.get(node.callee.name);
        // x.map(fn): an array of what fn returns, when x is one.
        if (node.type === 'Call' && node.callee.type === 'Member' && node.callee.name === 'map' && node.args && node.args[0] &&
            node.args[0].type === 'FunctionExpression' && elemOfHandle(node.callee.object) !== null) {
            return returnTextOf(node.args[0]);
        }
        return null;
    };

    const walk = (node, fn, parent, key) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) walk(node[i], fn, node, i);
            return;
        }
        fn(node, parent, key);
        for (const k of Object.keys(node)) {
            const v = node[k];
            if (v && typeof v === 'object') walk(v, fn, node, k);
        }
    };

    walk(ast, node => {
        if (node.type === 'Call' && node.callee && node.callee.type === 'Member' && node.callee.object.type === 'Array' &&
            /^(map|filter|forEach|some|every|find|reduce)$/.test(node.callee.name) && node.args && node.args[0] &&
            (node.args[0].type === 'FunctionExpression' || node.args[0].type === 'Identifier')) node.callee.object.__receiver = true;
    });
    for (let pass = 0; pass < 4; pass++) {
        walk(ast, node => {
            if (node.type === 'Declaration') {
                for (const d of node.decls || []) {
                    const e = elemOfHandle(d.init);
                    if (e !== null && e !== undefined) handleVars.set(d.name, e); // eslint-disable-line no-undefined
                    const ft = d.typeName ? fnType(d.typeName) : null;
                    if (ft) fnVars.set(d.name, ft);
                }
            }
            if (node.type === 'Assignment' && node.op === '=' && node.left.type === 'Identifier') {
                const e = elemOfHandle(node.right);
                if (e !== null && e !== undefined && handleVars.has(node.left.name)) handleVars.set(node.left.name, e); // eslint-disable-line no-undefined
            }
            if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
                for (const [p, t] of Object.entries(node.paramTypes || {})) {
                    const ft = fnType(t.text);
                    if (ft) fnVars.set(p, ft);
                }
            }
            if (node.type === 'Class') {
                for (const m of node.methods || []) {
                    for (const [p, t] of Object.entries(m.paramTypes || {})) if (fnType(t.text)) fnVars.set(p, fnType(t.text));
                }
                if (node.ctor) for (const [p, t] of Object.entries(node.ctor.paramTypes || {})) if (fnType(t.text)) fnVars.set(p, fnType(t.text));
            }
        });
    }
    // A name declared with a different, non-handle initialiser somewhere is not a handle everywhere.
    walk(ast, node => {
        if (node.type === 'Declaration') {
            for (const d of node.decls || []) {
                if (handleVars.has(d.name) && d.init && elemOfHandle(d.init) === null) handleVars.delete(d.name);
            }
        }
    });

    // ── lifting function values ───────────────────────────────────────────
    const signatureOf = (params, ret) => `(${params.map(clean).join(',')})=>${clean(ret) || 'number'}`;
    const freeNames = (fnNode) => {
        const bound = new Set(fnNode.params || []);
        const free = new Set();
        walk(fnNode.body, n => {
            if (n.type === 'Declaration') for (const d of n.decls || []) bound.add(d.name);
            if (n.type === 'ForOf') bound.add(n.name);
            if (n.type === 'For' && n.init) walk(n.init, m => {
                if (m.type === 'Declaration') for (const d of m.decls || []) bound.add(d.name);
            });
            if (n.type === 'FunctionExpression') for (const p of n.params || []) bound.add(p);
        });
        walk(fnNode.body, (n, parent, key) => {
            if (n.type !== 'Identifier') return;
            if (parent && parent.type === 'Member' && key === 'name') return;
            if (!bound.has(n.name) && !globals.has(n.name)) free.add(n.name);
        });
        return free;
    };
    // Locals (parameters and declarations) of the function being rewritten, with their types.
    const fnStack = [];
    const localTypes = () => {
        const out = new Map();
        const fn = fnStack[fnStack.length - 1];
        if (!fn) return out;
        for (const p of fn.params || []) out.set(p, (fn.paramTypes && fn.paramTypes[p] && fn.paramTypes[p].text) || 'number');
        walk(fn.body, n => {
            if (n.type === 'Declaration') for (const d of n.decls || []) out.set(d.name, clean(d.typeName) || guessType(d.init));
            if (n.type === 'ForOf') out.set(n.name, 'number');
        });
        return out;
    };
    const lift = (fnNode, hint, captures = false) => {
        if (fnNode.__liftedId) return fnNode.__liftedId;
        let caps = [];
        const free = freeNames(fnNode);
        if (free.size) {
            // A callback run by the call it is an argument of may read its surroundings' locals: they are
            // passed to it as extra arguments.
            const known = captures ? localTypes() : new Map();
            if ([...free].some(n => !known.has(n))) return 0;
            caps = [...free].map(n => ({name: n, type: known.get(n)}));
        }
        const index = lifted.length + 1;
        const params = [...(fnNode.params || []), ...caps.map(c => c.name)];
        const nOrig = (fnNode.params || []).length;
        const paramTypes = {...(fnNode.paramTypes || {})};
        for (const c of caps) paramTypes[c.name] = {text: c.type, isArray: false};
        params.forEach((p, i) => {
            const have = paramTypes[p] && paramTypes[p].text;
            const want = hint && hint.params[i];
            if (!have && want) paramTypes[p] = {text: want, isArray: false};
        });
        const types = params.map(p => (paramTypes[p] && paramTypes[p].text) || 'number');
        const ret = returnTextOf(fnNode) || (hint && hint.ret) || 'void';
        const name = `__fv_${index}`;
        lifted.push({id: index, name, sig: signatureOf(types, ret), params, types, ret, nOrig, caps,
            node: {type: 'FunctionDeclaration', name, params, paramTypes, returnType: ret === 'void' ? '' : ret, typeParameters: [],
                optionalParams: fnNode.optionalParams || [], body: fnNode.body}});
        fnNode.__liftedId = index;
        return index;
    };
    const liftNamed = (name) => {
        const decl = declaredFns.get(name);
        if (!decl) return 0;
        const existing = lifted.find(l => l.src === name);
        if (existing) return existing.id;
        const index = lifted.length + 1;
        const types = (decl.params || []).map(p => (decl.paramTypes[p] && decl.paramTypes[p].text) || 'number');
        const ret = clean(decl.returnType) || (returnTextOf(decl));
        lifted.push({id: index, name: decl.name, src: name, sig: signatureOf(types, ret), params: decl.params, types, ret, node: null});
        return index;
    };

    const signatureForCallee = (callee) => {
        if (callee.type === 'Identifier' && fnVars.has(callee.name)) return fnVars.get(callee.name);
        if (callee.type === 'Member' && fnFields.has(callee.name)) return fnFields.get(callee.name);
        return null;
    };

    const dispatch = (ft, calleeNode, args) => {
        const params = ft.params.map(clean);
        const ret = clean(ft.ret) || 'void';
        const sig = signatureOf(params, ret);
        const name = `__fcall_${ident(sig)}`;
        if (!need.sigs.has(name)) need.sigs.set(name, {sig, params, ret});
        return call(name, [calleeNode, ...args]);
    };

    // ── the rewrite ───────────────────────────────────────────────────────
    const methodCall = (node) => {
        const c = node.callee;
        if (!c || c.type !== 'Member') return null;
        const elem = elemOfHandle(c.object);
        if (elem === null || elem === undefined) return null;
        const T = ident(elem);
        reserve(elem);
        const h = c.object.type === 'Array' ? arrayLiteral(c.object, elem) : c.object;
        const a = node.args || [];
        const out = (name, args, extra = {}) => Object.assign(call(name, args), extra);
        switch (c.name) {
        case 'push': return a.length === 1 ? out(`__apush_${fam(elem)}`, [h, a[0]]) : null;
        case 'pop': return out(`__apop_${T}`, [h]);
        case 'shift': return out(`__ashift_${T}`, [h]);
        case 'unshift': return a.length === 1 ? out(`__aunshift_${fam(elem)}`, [h, a[0]]) : null;
        case 'indexOf': return a.length === 1 ? out(`__aindex_${fam(elem)}`, [h, a[0]]) : null;
        case 'removeAt': return out(`__aremove_${T}`, [h, a[0]]);
        case 'insertAt': return out(`__ainsert_${fam(elem)}`, [h, a[0], a[1]]);
        case 'slice': return out(`__aslice_${fam(elem)}`, [h, a[0] || num(0), a[1] || num(2147483647)], {__handleElem: elem});
        case 'concat': return a.length === 1 ? out(`__aconcat_${fam(elem)}`, [h, a[0]], {__handleElem: elem}) : null;
        case 'reverse': return out(`__areverse_${fam(elem)}`, [h], {__handleElem: elem});
        case 'join': return out(`__ajoin_${fam(elem)}`, [h, a[0] || {type: 'String', value: ','}]);
        case 'map': case 'filter': case 'forEach': case 'some': case 'every': case 'find': case 'reduce': {
            if (!a.length) return null;
            const fnArg = a[0];
            let fid = 0;
            if (fnArg.type === 'FunctionExpression') {
                const hint = {params: [elem, 'number'], ret: c.name === 'map' ? 'number' : c.name === 'forEach' ? 'void' : c.name === 'filter' || c.name === 'some' || c.name === 'every' ? 'boolean' : 'number'};
                if (c.name === 'reduce') hint.params = ['number', elem];
                fid = lift(fnArg, hint, true);
            } else if (fnArg.type === 'Identifier' && declaredFns.has(fnArg.name)) {
                fid = liftNamed(fnArg.name);
            }
            const lf = lifted.find(l => l.id === fid);
            if (!lf) return null;
            const key = `${c.name}_${T}_${ident(lf.sig)}${lf.caps && lf.caps.length ? `_c${lf.id}` : ''}`;
            if (!need.callbacks.has(key)) need.callbacks.set(key, {op: c.name, elem, T, lf});
            const retElem = c.name === 'map' ? lf.ret : elem;
            if (c.name === 'map') reserve(retElem);
            const capArgs = (lf.caps || []).map(cap => id(cap.name));
            const args = c.name === 'reduce' ? [h, num(fid), a[1] || num(0), ...capArgs] : [h, num(fid), ...capArgs];
            return out(`__acb_${key}`, args, c.name === 'map' ? {__handleElem: lf.ret} : c.name === 'filter' ? {__handleElem: elem} : {});
        }
        default: return null;
        }
    };

    const rewrite = (node) => {
        if (!node || typeof node !== 'object') return node;
        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) node[i] = rewrite(node[i]);
            // A statement that became several (a for-of over a handle) is spliced in place.
            for (let i = 0; i < node.length; i++) {
                if (node[i] && node[i].type === '__Splice') node.splice(i, 1, ...node[i].body);
            }
            return node;
        }
        const isFn = !!(node.params && node.body && node.type !== 'Class');
        if (isFn) fnStack.push(node);
        // `a[i] = v` is a store: its target is not read first.
        const store = node.type === 'Assignment' && node.left.type === 'Index';
        for (const k of Object.keys(node)) {
            if (k === '__liftedId' || k === '__handleElem') continue;
            const v = node[k];
            if (store && k === 'left') {
                v.object = rewrite(v.object);
                v.index = rewrite(v.index);
                continue;
            }
            if (v && typeof v === 'object') node[k] = rewrite(v);
        }
        if (isFn) fnStack.pop();
        switch (node.type) {
        case 'Class':
            for (const f of node.fields || []) {
                if (f.isStatic || !arrayFields.has(f.name)) continue;
                reserve(arrayFields.get(f.name));
                f.typeName = 'number';
                if (f.init && f.init.type === 'Array') f.init = arrayLiteral(f.init, arrayFields.get(f.name));
            }
            return node;
        case 'Member':
            if (node.name === 'length') {
                const elem = elemOfHandle(node.object);
                if (elem !== null && elem !== undefined) {
                    reserve(elem);
                    return call(`__alen_${kindOf(elem)}`, [node.object]);
                }
            }
            return node;
        case 'Index': {
            const elem = elemOfHandle(node.object);
            if (elem === null || elem === undefined) return node;
            reserve(elem);
            return call(`__aget_${ident(elem)}`, [node.object, node.index]);
        }
        case 'Assignment': {
            if (node.left.type === 'Index') {
                const elem = elemOfHandle(node.left.object);
                if (elem !== null && elem !== undefined) {
                    reserve(elem);
                    const T = ident(elem);
                    const value = node.op === '=' ? node.right :
                        {type: 'Binary', op: node.op.slice(0, -1), left: call(`__aget_${T}`, [node.left.object, node.left.index]), right: node.right};
                    return call(`__aset_${fam(elem)}`, [node.left.object, node.left.index, value]);
                }
            }
            if (node.op === '=' && node.left.type === 'Member' && arrayFields.has(node.left.name) && node.right.type === 'Array') {
                node.right = arrayLiteral(node.right, arrayFields.get(node.left.name));
            }
            return node;
        }
        case 'ExpressionStatement':
            if (dynamicEvents && isCall(node.expr, 'control.raiseEvent') && node.expr.args.length >= 2) {
                return {type: '__Splice', body: [node, {type: 'ExpressionStatement', expr: call('__evfire', [node.expr.args[0], node.expr.args[1]])}]};
            }
            return node;
        case 'Call': {
            if (dynamicEvents && isCall(node, 'control.onEvent') && node.args.length >= 3 && node.args[2].type === 'Identifier') {
                return call('__evreg', [node.args[0], node.args[1], node.args[2]]);
            }
            // Array.isArray(x): known statically for the arrays this pass knows.
            if (node.callee.type === 'Member' && node.callee.object.type === 'Identifier' && node.callee.object.name === 'Array' &&
                node.callee.name === 'isArray' && node.args && node.args.length === 1) {
                const x = node.args[0];
                const isArr = x.type === 'Array' || handleLike(x) || (x.type === 'Identifier' && arrayDecls.has(x.name));
                const notArr = ['Number', 'String', 'Boolean', 'Template'].includes(x.type);
                if (isArr || notArr) return {type: 'Boolean', value: isArr};
            }
            const sig = signatureForCallee(node.callee);
            if (sig && !(node.callee.type === 'Member' && handleLike(node.callee.object))) {
                return dispatch(sig, node.callee, node.args || []);
            }
            return methodCall(node) || node;
        }
        case 'ForOf': {
            const elem = elemOfHandle(node.iterable);
            if (elem === null || elem === undefined) return node;
            reserve(elem);
            const T = ident(elem);
            const counter = `__ai${++counterId}`;
            return {type: '__Splice', body: [
                {type: 'Declaration', kind: 'let', decls: [{name: counter, init: num(0), isArray: false, typeName: ''}]},
                {type: 'While', test: {type: 'Boolean', value: true},
                    body: [
                        exitUnless({type: 'Binary', op: '<', left: id(counter), right: call(`__alen_${kindOf(elem)}`, [node.iterable])}),
                        {type: 'Declaration', kind: node.kind || 'let', decls: [{name: node.name, init: call(`__aget_${T}`, [node.iterable, id(counter)]),
                            isArray: false, typeName: /^(number|string|boolean)$/.test(clean(elem)) ? '' : clean(elem)}]},
                        {type: 'ExpressionStatement', expr: {type: 'Assignment', op: '+=', left: id(counter), right: num(1)}},
                        ...node.body
                    ]}
            ]};
        }
        // A loop's condition is tested on every pass, and a call that returns a value cannot be (the
        // result is read after the call): the test moves into the body, as `if (!test) break`.
        case 'While':
            if (node.test && hasLowered(node.test)) {
                return {...node, test: {type: 'Boolean', value: true}, body: [exitUnless(node.test), ...node.body]};
            }
            return node;
        case 'For':
            if (node.test && hasLowered(node.test) && !JSON.stringify(node.body).includes('"type":"Continue"')) {
                const body = [exitUnless(node.test), ...node.body];
                if (node.update) body.push({type: 'ExpressionStatement', expr: node.update});
                return {type: '__Splice', body: [...(node.init ? [node.init] : []), {type: 'While', test: {type: 'Boolean', value: true}, body}]};
            }
            return node;
        default:
            return node;
        }
    };
    let counterId = 0;
    const hasLowered = test => /"callee":\{"type":"Identifier","name":"__(a|fcall|acb)/.test(JSON.stringify(test));
    const exitUnless = test => ({type: 'If', test: {type: 'Unary', op: '!', argument: test}, consequent: [{type: 'Break'}], alternate: null});
    const arrayDecls = new Set();
    walk(ast, n => {
        if (n.type === 'Declaration') for (const d of n.decls || []) if (d.isArray || (d.init && d.init.type === 'Array') || /(\[\]|^Array<)/.test(clean(d.typeName))) arrayDecls.add(d.name);
    });
    const handleLike = n => elemOfHandle(n) !== null && elemOfHandle(n) !== undefined;
    const arrayLiteral = (lit, elem) => {
        reserve(elem);
        const items = lit.items || [];
        if (!items.length) {
            need.anew = true;
            return call('__anew', []);
        }
        need.froms.add(items.length);
        return call(`__afrom${items.length}_${ident(elem)}`, items);
    };

    // control.onEvent(source, value, handler) with a handler that is a VALUE (a parameter or a variable, as in a
    // library's `onEvent(event, handler)`) is a registration made at run time: the handler's id, with its source
    // and value, goes into a table, and control.raiseEvent(source, value) calls the registered handlers (the newest match, which is the one MakeCode's simulator runs) after raising the event as before. Handlers of the program's own events only:
    // the board's own sources are raised by the hardware, not by a call.
    const isCall = (n, path) => n && n.type === 'Call' && n.callee && n.callee.type === 'Member' && n.callee.object.type === 'Identifier' &&
        `${n.callee.object.name}.${n.callee.name}` === path;
    let dynamicEvents = false;
    walk(ast, n => {
        if (isCall(n, 'control.onEvent') && n.args && n.args.length >= 3 && n.args[2].type === 'Identifier') dynamicEvents = true;
    });
    if (dynamicEvents) {
        need.sigs.set('__fcall____void', {sig: '()=>void', params: [], ret: 'void'});
        need.events = true;
    }

    // Function values: in a declaration / assignment / argument / return / array item, a function expression
    // or a named function becomes its id.
    const valueSites = (node, parent) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
            node.forEach(n => valueSites(n, parent));
            return;
        }
        const lower = (holder, key, hint) => {
            const v = holder[key];
            if (v && v.type === 'FunctionExpression') {
                const idv = lift(v, hint);
                if (idv) holder[key] = num(idv);
            } else if (v && v.type === 'Identifier' && declaredFns.has(v.name) && !fnVarShadow(v.name)) {
                const idv = liftNamed(v.name);
                if (idv) holder[key] = num(idv);
            }
        };
        const fnVarShadow = name => handleVars.has(name);
        switch (node.type) {
        case 'Declaration':
            for (const d of node.decls || []) if (d.init) {
                const ft = d.typeName ? fnType(d.typeName) : null;
                const before = d.init;
                lower(d, 'init', ft);
                if (d.init !== before && d.init.type === 'Number') {
                    const lf = lifted.find(l => l.id === Number(d.init.value));
                    fnVars.set(d.name, ft || {params: lf.types, ret: lf.ret});
                    d.typeName = 'number';
                }
            }
            break;
        case 'Assignment':
            if (node.op === '=') {
                const target = node.left;
                let ft = null;
                if (target.type === 'Identifier') ft = fnVars.get(target.name) || null;
                if (target.type === 'Member') ft = fnFields.get(target.name) || null;
                const before = node.right;
                lower(node, 'right', ft);
                if (node.right !== before && target.type === 'Identifier' && !fnVars.has(target.name)) {
                    const lf = lifted.find(l => l.id === Number(node.right.value));
                    fnVars.set(target.name, {params: lf.types, ret: lf.ret});
                }
            }
            break;
        case 'Call': {
            const path = node.callee;
            const root = path.type === 'Member' && path.object.type === 'Identifier' ? path.object.name : null;
            const isHandlerApi = (root && HANDLER_ROOTS.has(root)) || (path.type === 'Identifier' && !declaredFns.has(path.name));
            if (!isHandlerApi && path.type !== 'Member') {
                const target = declaredFns.get(path.name);
                (node.args || []).forEach((arg, i) => {
                    const pt = target && target.paramTypes[target.params[i]];
                    lower(node.args, i, pt ? fnType(pt.text) : null);
                });
            } else if (!isHandlerApi && path.type === 'Member' && handleLike(path.object) === false && root === null) {
                // a method of an object: the field type says what it takes
            }
            break;
        }
        case 'Return':
            break;
        case 'Array':
            (node.items || []).forEach((item, i) => lower(node.items, i, null));
            break;
        default:
        }
        for (const k of Object.keys(node)) {
            if (k === '__liftedId') continue;
            const v = node[k];
            if (v && typeof v === 'object') valueSites(v, node);
        }
    };
    // Function-typed parameters of named functions are the callee signature of their calls: pass them on.
    valueSites(ast.body, null);
    // Arguments of calls to class methods taking functions (`obj.on(f)`): a method call with a function
    // expression argument and a method that declares a function-typed parameter.
    const methodsTakingFns = new Map();
    for (const cls of classes) {
        for (const m of cls.methods || []) {
            if (Object.values(m.paramTypes || {}).some(t => fnType(t.text))) methodsTakingFns.set(m.name, m);
        }
    }
    const ctors = new Map(classes.filter(c => c.ctor).map(c => [c.name, c.ctor]));
    walk(ast.body, (node) => {
        if (node.type !== 'Call' || !node.callee) return;
        let m = null;
        if (node.isNew && node.callee.type === 'Identifier' && ctors.has(node.callee.name)) m = ctors.get(node.callee.name);
        else if (node.callee.type === 'Member' && methodsTakingFns.has(node.callee.name)) m = methodsTakingFns.get(node.callee.name);
        if (!m) return;
        (node.args || []).forEach((arg, i) => {
            const pt = m.paramTypes[m.params[i]];
            const ft = pt ? fnType(pt.text) : null;
            if (arg && arg.type === 'FunctionExpression' && ft) {
                const idv = lift(arg, ft);
                if (idv) node.args[i] = num(idv);
            } else if (arg && arg.type === 'Identifier' && declaredFns.has(arg.name) && ft) {
                const idv = liftNamed(arg.name);
                if (idv) node.args[i] = num(idv);
            }
        });
    });

    // Parameters of function type become numbers (their ids); calls through them dispatch.
    walk(ast, node => {
        if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
            for (const [p, t] of Object.entries(node.paramTypes || {})) if (fnType(t.text)) node.paramTypes[p] = {text: 'number', isArray: false};
        }
        if (node.type === 'Class') {
            for (const m of node.methods || []) {
                for (const [p, t] of Object.entries(m.paramTypes || {})) if (fnType(t.text)) m.paramTypes[p] = {text: 'number', isArray: false};
            }
            if (node.ctor) for (const [p, t] of Object.entries(node.ctor.paramTypes || {})) if (fnType(t.text)) node.ctor.paramTypes[p] = {text: 'number', isArray: false};
            for (const f of node.fields || []) if (fnType(f.typeName)) f.typeName = 'number';
        }
    });
    // Lifted bodies are rewritten too (they may use arrays and calls).
    for (const l of lifted) if (l.node) l.node.body = rewrite(l.node.body);
    rewrite(ast.body);
    for (let i = 0; i < lifted.length; i++) {      // lifting inside lifted bodies can add more
        const l = lifted[i];
        if (l.node && !l.done) {
            l.done = true;
            valueSites(l.node.body, null);
            l.node.body = rewrite(l.node.body);
        }
    }

    // A method or function that declares no return type but returns a record (`lastBlock() { return this.chain[…] }`)
    // is typed as that record, so a call on its result (`this.lastBlock().next(1)`) is still a record call.
    const recordNames = new Set(classes.map(c => c.name));
    const inferred = new Map();
    const returnRecord = (e, locals) => {
        if (!e) return null;
        if (e.type === 'Call' && e.isNew && e.callee.type === 'Identifier' && recordNames.has(e.callee.name)) return e.callee.name;
        if (e.type === 'Call' && e.callee.type === 'Identifier') {
            const m = e.callee.name.match(/^__a(?:get|pop|shift|remove)_(\w+)$/);
            if (m && recordNames.has(m[1])) return m[1];
        }
        if (e.type === 'Call' && e.callee.type === 'Member' && e.callee.object.type === 'Identifier' && e.callee.object.name === 'this') {
            return inferred.get(e.callee.name) || null;
        }
        if (e.type === 'Identifier') return locals.get(e.name) || null;
        return null;
    };
    const functionsToType = [];
    for (const cls of classes) for (const m of cls.methods || []) if (!m.returnType && !m.isStatic) functionsToType.push(m);
    for (const st of top) if (st.type === 'FunctionDeclaration' && !st.returnType) functionsToType.push(st);
    for (let pass = 0; pass < 4; pass++) {
        for (const fn of functionsToType) {
            if (fn.returnType) continue;
            const locals = new Map();
            const found = new Set();
            let bare = false;
            walk(fn.body, n => {
                if (n.type === 'Declaration') for (const d of n.decls || []) {
                    const t = returnRecord(d.init, locals);
                    if (t) locals.set(d.name, t);
                }
                if (n.type === 'Return') {
                    if (n.value) found.add(returnRecord(n.value, locals));
                    else bare = true;
                }
            });
            if (found.size === 1 && !bare && !found.has(null)) {
                fn.returnType = [...found][0];
                inferred.set(fn.name, fn.returnType);
            }
        }
    }

    // ── the generated procedures ──────────────────────────────────────────
    const src = [];
    const pools = [...need.pools];
    for (const k of pools) {
        const t = k === 'S' ? 'string' : 'number';
        src.push(`let __ao_${k}: number[] = [0]`, `let __av_${k}: ${t}[] = [${k === 'S' ? '""' : '0'}]`);
        src.push(`function __alen_${k}(h: number): number {`, '    let n = 0', `    for (let i = 1; i < __ao_${k}.length; i++) {`,
            `        if (__ao_${k}[i] == h) {`, '            n += 1', '        }', '    }', '    return n', '}');
        src.push(`function __apos_${k}(h: number, idx: number): number {`, '    let n = 0', `    for (let i = 1; i < __ao_${k}.length; i++) {`,
            `        if (__ao_${k}[i] == h) {`, '            if (n == idx) {', '                return i', '            }', '            n += 1', '        }', '    }', '    return 0', '}');
    }
    if (need.anew || need.froms.size || need.elems.size) {
        src.push('let __an = 0', 'function __anew(): number {', '    __an += 1', '    return __an', '}');
    }
    // Per family (S text, N number or record handle, B boolean): the operations that take a value or copy
    // one, working on the raw pool. Per element type: the ones that hand an element back, typed so that
    // a record read from an array is still a record to the importer.
    const families = new Map();
    for (const [, elem] of need.elems) families.set(fam(elem), clean(elem) === 'string' ? 'string' : clean(elem) === 'boolean' ? 'boolean' : 'number');
    for (const [F, vt] of families) {
        const k = F === 'S' ? 'S' : 'N';
        const zero = F === 'S' ? '""' : F === 'B' ? 'false' : '0';
        src.push(
            `function __aset_${F}(h: number, idx: number, v: ${vt}) {`, `    let p = __apos_${k}(h, idx)`, '    if (p > 0) {', `        __av_${k}[p] = v`, '    } else if (idx == __alen_' + k + '(h)) {', `        __ao_${k}.push(h)`, `        __av_${k}.push(v)`, '    }', '}',
            `function __apush_${F}(h: number, v: ${vt}): number {`, `    __ao_${k}.push(h)`, `    __av_${k}.push(v)`, `    return __alen_${k}(h)`, '}',
            `function __ainsert_${F}(h: number, idx: number, v: ${vt}) {`, `    let p = __apos_${k}(h, idx)`, '    if (p == 0) {', `        __ao_${k}.push(h)`, `        __av_${k}.push(v)`, '        return', '    }', `    __ao_${k}.insertAt(p, h)`, `    __av_${k}.insertAt(p, v)`, '}',
            `function __aunshift_${F}(h: number, v: ${vt}): number {`, `    __ainsert_${F}(h, 0, v)`, `    return __alen_${k}(h)`, '}',
            `function __aindex_${F}(h: number, v: ${vt}): number {`, '    let n = 0', `    for (let i = 1; i < __ao_${k}.length; i++) {`, `        if (__ao_${k}[i] == h) {`, `            if (__av_${k}[i] == v) {`, '                return n', '            }', '            n += 1', '        }', '    }', '    return -1', '}',
            `function __aslice_${F}(h: number, a: number, b: number): number {`, '    let nh = __anew()', `    let len = __alen_${k}(h)`, '    if (a < 0) {', '        a = Math.max(len + a, 0)', '    }', '    if (b < 0) {', '        b = len + b', '    }', '    if (b > len) {', '        b = len', '    }', '    for (let i = a; i < b; i++) {', `        __ao_${k}.push(nh)`, `        __av_${k}.push(__av_${k}[__apos_${k}(h, i)])`, '    }', '    return nh', '}',
            `function __aconcat_${F}(h: number, g: number): number {`, '    let nh = __anew()', `    let len = __alen_${k}(h)`, '    for (let i = 0; i < len; i++) {', `        __ao_${k}.push(nh)`, `        __av_${k}.push(__av_${k}[__apos_${k}(h, i)])`, '    }', `    len = __alen_${k}(g)`, '    for (let i = 0; i < len; i++) {', `        __ao_${k}.push(nh)`, `        __av_${k}.push(__av_${k}[__apos_${k}(g, i)])`, '    }', '    return nh', '}',
            `function __areverse_${F}(h: number): number {`, `    let len = __alen_${k}(h)`, '    for (let i = 0; i < Math.idiv(len, 2); i++) {', `        let p = __apos_${k}(h, i)`, `        let q = __apos_${k}(h, len - 1 - i)`, `        let t = __av_${k}[p]`, `        __av_${k}[p] = __av_${k}[q]`, `        __av_${k}[q] = t`, '    }', '    return h', '}',
            `function __ajoin_${F}(h: number, sep: string): string {`, '    let s = ""', `    let len = __alen_${k}(h)`, '    for (let i = 0; i < len; i++) {', '        if (i > 0) {', '            s = s + sep', '        }', `        s = s + ${F === 'S' ? '' : 'convertToText'}(__av_${k}[__apos_${k}(h, i)])`, '    }', '    return s', '}'
        );
        void zero;
    }
    for (const [T, elem] of need.elems) {
        const k = kindOf(elem);
        const zero = zeroOf(elem);
        const ty = clean(elem);
        const vt = ty === 'string' ? 'string' : ty === 'boolean' ? 'boolean' : ty;
        src.push(
            `function __aget_${T}(h: number, idx: number): ${vt} {`, `    let p = __apos_${k}(h, idx)`, '    if (p == 0) {', `        return ${zero}`, '    }', `    return __av_${k}[p]`, '}',
            `function __apop_${T}(h: number): ${vt} {`, `    let p = __apos_${k}(h, __alen_${k}(h) - 1)`, '    if (p == 0) {', `        return ${zero}`, '    }', `    let v = __av_${k}[p]`, `    __ao_${k}.removeAt(p)`, `    __av_${k}.removeAt(p)`, '    return v', '}',
            `function __ashift_${T}(h: number): ${vt} {`, `    let p = __apos_${k}(h, 0)`, '    if (p == 0) {', `        return ${zero}`, '    }', `    let v = __av_${k}[p]`, `    __ao_${k}.removeAt(p)`, `    __av_${k}.removeAt(p)`, '    return v', '}',
            `function __aremove_${T}(h: number, idx: number): ${vt} {`, `    let p = __apos_${k}(h, idx)`, '    if (p == 0) {', `        return ${zero}`, '    }', `    let v = __av_${k}[p]`, `    __ao_${k}.removeAt(p)`, `    __av_${k}.removeAt(p)`, '    return v', '}'
        );
    }
    for (const n of need.froms) {
        for (const [T, elem] of need.elems) {
            const F = fam(elem);
            const vt = F === 'S' ? 'string' : F === 'B' ? 'boolean' : 'number';
            const ps = Array.from({length: n}, (_, i) => `v${i}: ${vt}`);
            src.push(`function __afrom${n}_${T}(${ps.join(', ')}): number {`, '    let nh = __anew()');
            for (let i = 0; i < n; i++) src.push(`    __apush_${F}(nh, v${i})`);
            src.push('    return nh', '}');
        }
    }
    if (need.events) {
        src.push('let __evs: number[] = [0]', 'let __evv: number[] = [0]', 'let __evf: number[] = [0]',
            'function __evreg(s: number, v: number, f: number) {', '    __evs.push(s)', '    __evv.push(v)', '    __evf.push(f)', '}',
            'function __evfire(s: number, v: number) {', '    for (let i = __evs.length - 1; i >= 1; i--) {',
            '        if (__evs[i] == s && (__evv[i] == v || __evv[i] == 0)) {', '            __fcall____void(__evf[i])', '            return', '        }', '    }', '}');
    }
    // Function values: the lifted procedures, and a dispatcher per signature.
    const sigs = new Map(need.sigs);
    for (const [name, s] of sigs) {
        const ps = s.params.map((p, i) => `a${i}: ${p}`);
        const ret = s.ret;
        const lines = [`function ${name}(f: number${ps.length ? ', ' + ps.join(', ') : ''})${ret === 'void' ? '' : `: ${ret}`} {`];
        for (const l of lifted.filter(x => x.sig === s.sig || (x.params.length <= s.params.length && x.ret === s.ret &&
            x.types.every((t, i) => clean(t) === clean(s.params[i]))))) {
            const argl = l.params.map((_, i) => `a${i}`).join(', ');
            lines.push(`    if (f == ${l.id}) {`);
            lines.push(ret === 'void' ? `        ${l.name}(${argl})` : `        return ${l.name}(${argl})`);
            if (ret === 'void') lines.push('        return');
            lines.push('    }');
        }
        if (ret !== 'void') lines.push(`    return ${zeroOf(ret)}`);
        lines.push('}');
        src.push(...lines);
    }
    for (const [key, cb] of need.callbacks) {
        const {op, elem, T, lf} = cb;
        const vt = clean(elem);
        const sigName = `__fcall_${ident(lf.sig)}`;
        if (!sigs.has(sigName)) {
            // the dispatcher for the callback's own signature
            const params = lf.types;
            const lines = [`function ${sigName}(f: number${params.length ? ', ' + params.map((p, i) => `a${i}: ${p}`).join(', ') : ''})${lf.ret === 'void' ? '' : `: ${lf.ret}`} {`];
            for (const l of lifted.filter(x => x.sig === lf.sig)) {
                const argl = l.params.map((_, i) => `a${i}`).join(', ');
                lines.push(`    if (f == ${l.id}) {`, lf.ret === 'void' ? `        ${l.name}(${argl})` : `        return ${l.name}(${argl})`);
                if (lf.ret === 'void') lines.push('        return');
                lines.push('    }');
            }
            if (lf.ret !== 'void') lines.push(`    return ${zeroOf(lf.ret)}`);
            lines.push('}');
            src.push(...lines);
            sigs.set(sigName, true);
        }
        const k = kindOf(elem);
        const call1 = `${sigName}(f, __aget_${T}(h, i), i)`;
        const head = `function __acb_${key}`;
        const loop = body => ['    let len = __alen_' + k + '(h)', '    for (let i = 0; i < len; i++) {', ...body, '    }'];
        const takesIndex = (lf.nOrig === undefined ? lf.params.length : lf.nOrig) > 1;
        const capNames = (lf.caps || []).map((cap, n) => `c${n}`);
        const capDecl = (lf.caps || []).map((cap, n) => `, c${n}: ${cap.type}`).join('');
        const capPass = capNames.map(n => `, ${n}`).join('');
        const callText = (takesIndex ? call1 : `${sigName}(f, __aget_${T}(h, i))`).replace(/\)$/, `${capPass})`);
        if (op === 'map') {
            const rt = ident(lf.ret);
            src.push(`${head}(h: number, f: number${capDecl}): number {`, '    let nh = __anew()', ...loop([`        __apush_${fam(lf.ret)}(nh, ${callText})`]), '    return nh', '}');
        } else if (op === 'filter') {
            src.push(`${head}(h: number, f: number${capDecl}): number {`, '    let nh = __anew()', ...loop([`        if (${callText}) {`, `            __apush_${fam(elem)}(nh, __aget_${T}(h, i))`, '        }']), '    return nh', '}');
        } else if (op === 'forEach') {
            src.push(`${head}(h: number, f: number${capDecl}) {`, ...loop([`        ${callText}`]), '}');
        } else if (op === 'some') {
            src.push(`${head}(h: number, f: number${capDecl}): boolean {`, ...loop([`        if (${callText}) {`, '            return true', '        }']), '    return false', '}');
        } else if (op === 'every') {
            src.push(`${head}(h: number, f: number${capDecl}): boolean {`, ...loop([`        if (!(${callText})) {`, '            return false', '        }']), '    return true', '}');
        } else if (op === 'find') {
            src.push(`${head}(h: number, f: number${capDecl}): ${vt === 'string' ? 'string' : vt} {`, ...loop([`        if (${callText}) {`, `            return __aget_${T}(h, i)`, '        }']), `    return ${zeroOf(elem)}`, '}');
        } else if (op === 'reduce') {
            src.push(`${head}(h: number, f: number, init: number${capDecl}): number {`, '    let acc = init', ...loop([`        acc = ${sigName}(f, acc, __aget_${T}(h, i)${capPass})`]), '    return acc', '}');
        }
    }
    // The dialect's variables are global: a helper's counters must not be the program's `i`, nor another
    // helper's. Every local of a generated procedure gets the procedure's name.
    const chunks = src.join('\n').split(/\n(?=function |let )/).map(chunk => {
        const m = chunk.match(/^function (\w+)/);
        if (!m) return chunk;
        const locals = ['len', 'i', 'n', 'p', 'q', 't', 's', 'nh', 'acc'];
        if (/\blet v\b/.test(chunk)) locals.push('v');
        return locals.reduce((text, name) => text.replace(new RegExp(`\\b${name}\\b`, 'g'), `${name}_${m[1]}`), chunk);
    });
    const generated = parse(chunks.join('\n'));
    // Lifted procedures first, then the helpers, then the program: a call can precede its definition.
    // Only the helpers the program reaches are kept: the micro:bit's heap is small.
    const liftedDecls = lifted.filter(l => l.node).map(l => l.node);
    const programText = () => JSON.stringify([ast.body, liftedDecls]);
    const calledIn = text => new Set([...text.matchAll(/"callee":\{"type":"Identifier","name":"(__[A-Za-z0-9_]+)"/g)].map(m => m[1]));
    const wanted = calledIn(programText());
    const byName = new Map(generated.body.filter(st => st.type === 'FunctionDeclaration').map(st => [st.name, st]));
    const queue = [...wanted];
    while (queue.length) {
        const fn = byName.get(queue.pop());
        if (!fn) continue;
        for (const callee of calledIn(JSON.stringify(fn.body))) {
            if (!wanted.has(callee)) {
                wanted.add(callee);
                queue.push(callee);
            }
        }
    }
    const kept = generated.body.filter(st => st.type !== 'FunctionDeclaration' || wanted.has(st.name));
    ast.body = [...kept, ...liftedDecls, ...ast.body];
    return {changed: true};
}

export default lowerHandleValues;
