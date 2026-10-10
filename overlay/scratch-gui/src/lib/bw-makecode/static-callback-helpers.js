/** Specialize nonescaping, statically bound higher-order helpers into native
 * procedures. Helper/callback bodies keep their control flow and call frames.
 * No closure values, invented captures or wrapper-body pattern matching.
 */
export function lowerStaticCallbackHelpers(program) {
    const unsupported = [];
    const fail = message => { if (!unsupported.includes(message)) unsupported.push(message); };
    const functions = new Map(program.body.filter(node => node.type === 'FunctionDeclaration').map(node => [node.name, node]));
    const templates = new Map([...functions].filter(([,fn]) => fn.params.some(name => /=>/.test(fn.paramTypes?.[name]?.text || ''))));
    if (!templates.size) return {program, unsupported};
    const taken = new Set();
    const scan = node => {
        if (!node || typeof node !== 'object') return;
        if (node.name) taken.add(node.name);
        if (node.params) node.params.forEach(name => taken.add(name));
        Object.values(node).forEach(value => Array.isArray(value) ? value.forEach(scan) : scan(value));
    };
    scan(program);
    let serial = 0;
    const fresh = () => {let name;do {name=`__bwCallback${++serial}`;} while(taken.has(name));taken.add(name);return name;};
    const localsOf = fn => {
        const names = new Set(fn.params || []);
        const collect = node => {
            if (!node || typeof node !== 'object') return;
            if (node.type === 'FunctionDeclaration') {names.add(node.name);return;}
            if (node.type === 'FunctionExpression') return;
            if (node.type === 'Declaration') node.decls.forEach(decl => names.add(decl.name));
            Object.values(node).forEach(value => Array.isArray(value) ? value.forEach(collect) : collect(value));
        };
        fn.body.forEach(collect);return names;
    };
    const lexicalNames = body => body.flatMap(node => node.type === 'Declaration' && node.kind !== 'var' ? node.decls.map(decl=>decl.name) : node.type === 'FunctionDeclaration' ? [node.name] : []);
    const freeNames = fn => {
        const free = new Set();
        const body = (nodes,bound) => {
            const local=new Set([...bound,...lexicalNames(nodes)]);
            nodes.forEach(node=>visit(node,local));
        };
        const visit = (node,bound) => {
            if (!node || typeof node !== 'object') return;
            if (['FunctionDeclaration','FunctionExpression'].includes(node.type)) {
                const vars = new Set(node.params || []);
                const hoist = child => {
                    if (!child || typeof child !== 'object' || ['FunctionDeclaration','FunctionExpression'].includes(child.type)) return;
                    if (child.type === 'Declaration' && child.kind === 'var') child.decls.forEach(decl=>vars.add(decl.name));
                    Object.values(child).forEach(value=>Array.isArray(value)?value.forEach(hoist):hoist(value));
                };
                node.body.forEach(hoist);
                body(node.body,new Set([...bound,...vars]));return;
            }
            if (node.type === 'Block') {body(node.body,bound);return;}
            if (node.type === 'While') {visit(node.test,bound);body(node.body,bound);return;}
            if (node.type === 'If') {visit(node.test,bound);body(node.consequent,bound);body(node.alternate || [],bound);return;}
            if (node.type === 'For') {
                const local=new Set([...bound,...(node.init?.type==='Declaration'?node.init.decls.map(decl=>decl.name):[])]);
                visit(node.init,local);visit(node.test,local);visit(node.update,local);body(node.body,local);return;
            }
            if (node.type === 'Identifier' && !bound.has(node.name)) free.add(node.name);
            Object.values(node).forEach(value=>Array.isArray(value)?value.forEach(child=>visit(child,bound)):visit(value,bound));
        };
        visit(fn,new Set());return free;
    };
    const generated = [], cache = new Map(), lifted = new WeakMap();
    const lift = (node, locals, bindings) => {
        if (node?.type === 'Identifier') {
            const name = bindings.get(node.name) || node.name;
            if (functions.has(name) && !templates.has(name) && !locals.has(node.name)) return name;
            // A forwarded helper parameter is statically bound to a lifted
            // callback, even if the source parameter was a lexical local.
            if (bindings.has(node.name) && functions.has(name)) return name;
        }
        if (node?.type === 'FunctionExpression') {
            const captures = [...freeNames(node)].filter(name => locals.has(name) || bindings.has(name));
            if (captures.length) {fail(`callback captures caller-local bindings: ${captures.join(', ')}; closure cells are required`);return null;}
            if (lifted.has(node)) return lifted.get(node);
            if ((node.params || []).some(name=>/=>/.test(node.paramTypes?.[name]?.text || ''))) {
                fail('callback accepting another callable value requires nested callable specialization support');return null;
            }
            const name = fresh(), fn = {...node,type:'FunctionDeclaration',name};
            lifted.set(node,name);
            functions.set(name,fn);
            const rewritten = rewrite(fn,new Set(),new Map());generated.push(rewritten);
            return name;
        }
        fail('callback helper requires a statically known inline or named function; stored callable values require closure support');
        return null;
    };
    const specialize = (fn, args, locals, bindings) => {
        const callbacks = new Map();
        for (const [index,name] of fn.params.entries()) if (/=>/.test(fn.paramTypes?.[name]?.text || '')) {
            const callback = lift(args[index],locals,bindings);
            if (!callback) return null;
            callbacks.set(name,callback);
        }
        const key=JSON.stringify([fn.name,[...callbacks]]);
        let name=cache.get(key);
        if (!name) {
            name=fresh();cache.set(key,name);
            const clone={...fn,name,params:fn.params.filter(param=>!callbacks.has(param)),
                paramTypes:Object.fromEntries(Object.entries(fn.paramTypes || {}).filter(([param])=>!callbacks.has(param)))};
            functions.set(name,clone);
            const scope=localsOf(clone);
            clone.body=fn.body.map(node=>rewrite(node,scope,callbacks)).filter(Boolean);
            generated.push(clone);
        }
        return {name,args:args.filter((_,index)=>!callbacks.has(fn.params[index]))};
    };
    const rewriteBody = (nodes,locals,bindings) => {
        const names=lexicalNames(nodes),scope=new Set([...locals,...names]);
        const active=new Map([...bindings].filter(([name])=>!names.includes(name)));
        return nodes.map(node=>rewrite(node,scope,active)).filter(Boolean);
    };
    function rewrite(node, locals, bindings, context = null) {
        if (!node || typeof node !== 'object') return node;
        if (Array.isArray(node)) return node.map(child=>rewrite(child,locals,bindings)).filter(Boolean);
        if (node.type === 'FunctionDeclaration' && templates.has(node.name)) return null;
        if (['FunctionDeclaration','FunctionExpression'].includes(node.type)) {
            const own=localsOf(node),scope=new Set([...locals,...own]);
            const inherited=new Map([...bindings].filter(([name])=>!own.has(name)));
            return {...node,body:rewrite(node.body,scope,inherited)};
        }
        if (node.type === 'Block') return {...node,body:rewriteBody(node.body,locals,bindings)};
        if (node.type === 'While') return {...node,test:rewrite(node.test,locals,bindings),body:rewriteBody(node.body,locals,bindings)};
        if (node.type === 'If') return {...node,test:rewrite(node.test,locals,bindings),
            consequent:rewriteBody(node.consequent,locals,bindings),alternate:rewriteBody(node.alternate || [],locals,bindings)};
        if (node.type === 'For') {
            const names=node.init?.type==='Declaration'?node.init.decls.map(decl=>decl.name):[];
            const scope=new Set([...locals,...names]),active=new Map([...bindings].filter(([name])=>!names.includes(name)));
            return {...node,init:rewrite(node.init,scope,active),test:rewrite(node.test,scope,active),
                update:rewrite(node.update,scope,active),body:rewriteBody(node.body,scope,active)};
        }
        if (node.type === 'Call') {
            const called=node.callee?.type==='Identifier' && (bindings.get(node.callee.name) || node.callee.name);
            const shadowed=node.callee?.type==='Identifier' && locals.has(node.callee.name) && !bindings.has(node.callee.name);
            if (shadowed && templates.has(called)) fail(`callback helper ${called} is shadowed by a local callable; dynamic invocation requires closure support`);
            const fn=!shadowed && templates.get(called);
            if (fn) {
                const specialized=specialize(fn,node.args || [],locals,bindings);
                if (specialized) return {...node,callee:{type:'Identifier',name:specialized.name},args:rewrite(specialized.args,locals,bindings)};
            }
            return {...node,callee:rewrite(node.callee,locals,bindings,'callee'),args:rewrite(node.args,locals,bindings)};
        }
        if (node.type === 'Identifier' && bindings.has(node.name)) {
            if (context !== 'callee') fail(`callback parameter ${node.name} escapes direct invocation or helper forwarding; closure support is required`);
            return {...node,name:bindings.get(node.name)};
        }
        if (node.type === 'Identifier' && functions.has(node.name) && context !== 'callee' && !locals.has(node.name)) {
            fail(`procedure ${node.name} used as a stored callable value requires closure support`);
        }
        return Object.fromEntries(Object.entries(node).map(([key,value])=>[key,rewrite(value,locals,bindings,key)]));
    }
    const body=program.body.map(node=>rewrite(node,new Set(),new Map())).filter(Boolean);
    return {program:{...program,body:[...body,...generated],loweredStaticCallbacks:generated.length>0},unsupported};
}
