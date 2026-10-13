import {ValueTypeGraph} from './value-type-graph.js';

// Class structure is declarative authoring data. Instances are explicit heap
// references; no field state, per-class numeric handles or closure snapshots.
export function lowerObjectClasses(program) {
    const classes = new Map(program.body.filter(node => node.type === 'Class').map(node => [node.name, node]));
    if (!classes.size) return {program, unsupported: []};
    const unsupported = [], admitted = new Map();
    const fail = message => { if (!unsupported.includes(message)) unsupported.push(message); };
    const contains = (node, predicate) => node && typeof node === 'object' && (predicate(node) ||
        Object.values(node).some(value => Array.isArray(value) ? value.some(child => contains(child, predicate)) : contains(value, predicate)));
    for (const [name, cls] of classes) {
        const problems = [...(cls.unsupported || [])];
        if(cls.fields.some(field=>field.typeName && !/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*(?:\[\])*$/.test(field.typeName)))problems.push('union, callable or opaque field type metadata');
        if(cls.fields.some(field=>field.modifiers?.some(modifier=>['private','protected'].includes(modifier))) || cls.methods.some(method=>method.modifiers?.some(modifier=>['private','protected'].includes(modifier))))problems.push('private or protected class members');
        if(cls.fields.some(field=>contains(field.init,node=>node.type==='Identifier' && node.name==='this')))problems.push('selected Arcade SDK instance-field this initializers');
        const originalDefault=value=>['Number','Boolean','Null'].includes(value?.type) || value?.type==='Unary' && ['+','-'].includes(value.op) && value.argument?.type==='Number';
        if([cls.ctor,...cls.methods].filter(Boolean).some(member=>member.parameterDefaults?.some(param=>!originalDefault(param.value))))problems.push('selected Arcade SDK nonliteral default arguments');
        if(contains(cls,node=>node.type==='FunctionDeclaration'))problems.push('nested function declarations');
        if (cls.fields.some(field => field.isStatic)) problems.push('static fields');
        if (cls.methods.some(method => method.isStatic || method.kind !== 'method')) problems.push('static methods or accessors');
        if (contains(cls, node => node.type === 'FunctionExpression')) problems.push('function-valued fields or captured callbacks');
        if (cls.fields.some(field => /=>|\bFunction\b/.test(field.typeName || ''))) problems.push('function field types');
        if (problems.length) { fail(`Class ${name} requires unsupported ${problems.join(', ')}`); continue; }
        admitted.set(name, cls);
    }
    const graph = new ValueTypeGraph(), owners = new WeakMap(), cells = new WeakMap(), entries = [];
    const global = {parent: null, bindings: new Map(), className: null, result: Symbol('global result')};
    const functions = new Map(), memberOwners = new WeakMap();
    const binding = (owner, name, declare = false) => {
        if (declare) { if (!owner.bindings.has(name)) owner.bindings.set(name, Symbol(name)); return owner.bindings.get(name); }
        for (let scope = owner; scope; scope = scope.parent) if (scope.bindings.has(name)) return scope.bindings.get(name);
        return binding(global, name, true);
    };
    const fieldCell = (name, field) => graph.property(binding(global, `class:${name}`), field);
    const typeText = value => (typeof value==='string'?value:value?.text) || 'any';
    const addType = (key, name) => {
        name=typeText(name);
        if (!name) return;
        if (admitted.has(name)) graph.add(key, `class:${name}`);
        else if (/\[\]$/.test(name)) { graph.add(key, 'array'); addType(graph.element(key), name.slice(0, -2)); }
        else if (['number','string','boolean','null','undefined','Image','Sprite','Buffer'].includes(name)) graph.add(key, name);
    };
    const cell = node => {
        if (!node || typeof node !== 'object') return Symbol('missing');
        const owner = owners.get(node) || global;
        if (node.type === 'Identifier') return binding(owner, node.name);
        if (!cells.has(node)) cells.set(node, Symbol(node.type));
        return cells.get(node);
    };
    function visit(node, parent) {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(child => visit(child, parent)); return; }
        if (node.type === 'Class') {
            if (!admitted.has(node.name)) return;
            for (const field of node.fields) {
                addType(fieldCell(node.name, field.name), field.typeName);
                const scope = {parent, bindings: new Map(), className: node.name, result: Symbol('initializer result')};
                graph.add(binding(scope, 'this', true), `class:${node.name}`);
                memberOwners.set(field, scope); visit(field.init, scope);
            }
            for (const method of [...node.methods, ...(node.ctor ? [node.ctor] : [])]) {
                const scope = {parent, bindings: new Map(), className: node.name, result: Symbol('method result')};
                graph.add(binding(scope, 'this', true), `class:${node.name}`);
                for (const param of method.params) { binding(scope, param, true); addType(binding(scope, param), method.paramTypes?.[param]); }
                memberOwners.set(method, scope); visit(method.body, scope);
            }
            return;
        }
        let owner = parent;
        if (['FunctionDeclaration','FunctionExpression'].includes(node.type)) {
            owner = {parent, bindings: new Map(), className: null, result: Symbol('function result')};
            for (const name of node.params || []) { binding(owner, name, true); addType(binding(owner, name), node.paramTypes?.[name]); }
            if (node.type === 'FunctionDeclaration') functions.set(node.name, {node, owner});
        }
        owners.set(node, owner); entries.push(node);
        if (node.type === 'Declaration') for (const decl of node.decls) { binding(owner, decl.name, true); addType(binding(owner, decl.name), decl.typeName); }
        for (const value of Object.values(node)) if (value && typeof value === 'object') visit(value, owner);
    }
    visit(program, global);
    const classNames = node => [...graph.node(cell(node)).types].filter(type => type.startsWith('class:')).map(type => type.slice(6));
    let revision;
    do {
        revision = graph.revision;
        for (const node of entries) {
            const owner = owners.get(node), value = cell(node);
            const primitive = {Number:'number',String:'string',Boolean:'boolean',Null:'null',Undefined:'undefined'}[node.type];
            if (primitive) graph.add(value, primitive);
            addType(value, node.assertedType);
            if (node.type === 'Call' && node.isNew && node.callee?.type === 'Identifier' && admitted.has(node.callee.name)) {
                graph.add(value, `class:${node.callee.name}`);
                const ctor = admitted.get(node.callee.name).ctor;
                if (ctor) node.args.forEach((arg, index) => { if (index < ctor.params.length) graph.merge(cell(arg), binding(memberOwners.get(ctor), ctor.params[index])); });
            }
            if (node.type === 'Declaration') for (const decl of node.decls) if (decl.init) graph.merge(binding(owner, decl.name), cell(decl.init));
            if (node.type === 'Assignment' && node.op === '=') graph.merge(cell(node.left), cell(node.right));
            if (node.type === 'Conditional') { graph.merge(value, cell(node.consequent)); graph.merge(value, cell(node.alternate)); }
            if (node.type === 'Array') { graph.add(value, 'array'); for (const item of node.items) graph.merge(graph.element(value), cell(item)); }
            if (node.type === 'Index') graph.merge(value, graph.element(cell(node.object)));
            if (node.type === 'Member') for (const name of classNames(node.object)) {
                if (admitted.get(name).fields.some(field => field.name === node.name)) graph.merge(value, fieldCell(name, node.name));
            }
            if (node.type === 'Return' && node.value) graph.merge(owner.result, cell(node.value));
            if (node.type === 'Call' && !node.isNew) {
                const targets = node.callee?.type === 'Identifier' && functions.has(node.callee.name) ? [functions.get(node.callee.name)] :
                    node.callee?.type === 'Member' ? classNames(node.callee.object).flatMap(name => admitted.get(name).methods.filter(method => method.name === node.callee.name).map(method => ({node: method, owner: memberOwners.get(method)}))) : [];
                for (const target of targets) {
                    graph.merge(value, target.owner.result);
                    node.args.forEach((arg, index) => { if (index < target.node.params.length) graph.merge(cell(arg), binding(target.owner, target.node.params[index])); });
                }
                if (node.callee?.type === 'Member' && ['push','insertAt','unshift','set'].includes(node.callee.name)) {
                    const args = ['set','insertAt'].includes(node.callee.name) ? node.args.slice(1) : node.args;
                    for (const arg of args) graph.merge(graph.element(cell(node.callee.object)), cell(arg));
                }
            }
        }
        for (const [name, cls] of admitted) for (const field of cls.fields) if (field.init) graph.merge(fieldCell(name, field.name), cell(field.init));
    } while (revision !== graph.revision);
    // Match the original compiler's whenUsed initializer reachability. Merely
    // declaring an unused method/function must not initialize its constants.
    const candidates=new Map(program.body.filter(node=>node.type==='Declaration').flatMap(node=>node.decls.filter(decl=>decl.whenUsed).map(decl=>[decl.name,decl])));
    const used=new Set(),reachedFunctions=new Set(),reachedClasses=new Set(),reachedMethods=new Set();
    function reach(node) {
        if(!node || typeof node!=='object')return;
        if(Array.isArray(node)){node.forEach(reach);return;}
        if(node.type==='FunctionDeclaration' || node.type==='Class')return;
        if(node.type==='Declaration'){for(const decl of node.decls)if(!decl.whenUsed)reach(decl.init);return;}
        if(node.type==='Identifier' && candidates.has(node.name) && binding(owners.get(node)||global,node.name)===binding(global,node.name) && !used.has(node.name)){
            used.add(node.name);reach(candidates.get(node.name).init);
        }
        if(node.type==='Call') {
            const fn=node.callee?.type==='Identifier' && functions.get(node.callee.name);
            if(fn && !reachedFunctions.has(fn)){reachedFunctions.add(fn);reach(fn.node.body);}
            if(node.isNew && node.callee?.type==='Identifier' && admitted.has(node.callee.name) && !reachedClasses.has(node.callee.name)) {
                reachedClasses.add(node.callee.name);const cls=admitted.get(node.callee.name);cls.fields.forEach(field=>reach(field.init));reach(cls.ctor?.body);
            }
            if(node.callee?.type==='Member')for(const name of classNames(node.callee.object)) {
                const method=admitted.get(name).methods.find(method=>method.name===node.callee.name);
                if(method && !reachedMethods.has(method)){reachedMethods.add(method);reach(method.body);}
            }
        }
        for(const value of Object.values(node))if(value && typeof value==='object')reach(value);
    }
    program.body.forEach(reach);
    const id = name => ({type:'Identifier', name}), str = value => ({type:'String', value});
    const call = (name, args, types = []) => ({type:'Call', callee:{type:'Member', object:id('__bwObjects'), name}, args, bwObjectTypes:types});
    const statement = expr => ({type:'ExpressionStatement', expr});
    const signature = (name, params) => [name, ...params.map(() => '%s')].join(' ');
    const types = node => [...graph.node(cell(node)).types].map(type => type.startsWith('class:') ? 'object' : type === 'Image' ? 'image' : type === 'Sprite' ? 'sprite' : type === 'Buffer' ? 'buffer' : type);
    function rewrite(node, context = null) {
        if (!node || typeof node !== 'object') return node;
        if (Array.isArray(node)) return node.map(child => rewrite(child, context));
        if (node.type === 'Class') return node;
        if(node.type==='Identifier' && admitted.has(node.name))fail(`Class constructor ${node.name} used as a runtime value requires function references`);
        if (node.type === 'Identifier' && node.name === 'this' && context) return {...id('__bwSelf'), bwObjectTypes:['object']};
        if (node.type === 'Call' && node.isNew && node.callee?.type === 'Identifier' && admitted.has(node.callee.name))
            return call('create', [str(node.callee.name), {type:'Array', items:node.args.map(arg => rewrite(arg, context))}], ['object']);
        if (node.type === 'Call' && node.callee?.type === 'Member' && classNames(node.callee.object).length) {
            const names = classNames(node.callee.object);
            if (names.every(name => admitted.get(name).methods.some(method => method.name === node.callee.name)))
                return call('call', [rewrite(node.callee.object, context), str(node.callee.name), {type:'Array', items:node.args.map(arg => rewrite(arg, context))}], types(node));
            fail(`Class receiver method ${node.callee.name} is not declared for every possible receiver`);
        }
        if (node.type === 'Assignment' && node.left?.type === 'Member' && classNames(node.left.object).length) {
            const names = classNames(node.left.object);
            const fields = names.map(name => admitted.get(name).fields.find(field => field.name === node.left.name));
            if (fields.some(field => !field)) { fail(`Unknown declared class field ${node.left.name}`); return node; }
            if (fields.some(field => field.modifiers?.includes('readonly')) && !(context?.constructor && node.left.object.type === 'Identifier' && node.left.object.name === 'this'))
                fail(`Readonly class field ${node.left.name} cannot be assigned outside its constructor`);
            if(node.op==='=')return call('set', [rewrite(node.left.object, context), str(node.left.name), rewrite(node.right, context)]);
            if(!['+=','-=','*=','/=','%=','&=','|=','^=','<<=','>>=','>>>='].includes(node.op)){fail('Unsupported class field assignment operator '+node.op);return node;}
            return call('assign',[rewrite(node.left.object,context),str(node.left.name),str(node.op.slice(0,-1)),rewrite(node.right,context),str('new')],types(node.left));
        }
        if(node.type==='Update' && node.argument?.type==='Member' && classNames(node.argument.object).length) {
            const member=node.argument,fields=classNames(member.object).map(name=>admitted.get(name).fields.find(field=>field.name===member.name));
            if(fields.some(field=>!field)){fail('Unknown class field '+member.name);return node;}
            if(fields.some(field=>field.modifiers?.includes('readonly')) && !(context?.constructor && member.object.type==='Identifier' && member.object.name==='this'))fail(`Readonly class field ${member.name} cannot be assigned outside its constructor`);
            return call('assign',[rewrite(member.object,context),str(member.name),str(node.op),{type:'Number',value:1},str(node.prefix?'new':'old')],['number']);
        }
        if (node.type === 'Member' && classNames(node.object).length && classNames(node.object).every(name => admitted.get(name).fields.some(field => field.name === node.name)))
            return call('get', [rewrite(node.object, context), str(node.name)], types(node));
        const out = Object.fromEntries(Object.entries(node).map(([key, value]) => [key, rewrite(value, context)]));
        if (types(node).includes('object')) out.bwObjectTypes = types(node);
        return out;
    }
    const body = [];
    for (const node of program.body) {
        if(node.type==='Declaration'){const decls=node.decls.filter(decl=>!decl.whenUsed || used.has(decl.name));if(decls.length)body.push(rewrite({...node,decls}));continue;}
        if (node.type !== 'Class' || !admitted.has(node.name)) { body.push(rewrite(node)); continue; }
        const name = node.name, initName = `__bwClass_${name}_fields`, ctorName = `__bwClass_${name}_constructor`;
        const ctorParams = ['__bwSelf', ...(node.ctor?.params || [])], methods = [];
        const initBody = node.fields.filter(field => field.init).map(field => statement(call('set', [
            {...id('__bwSelf'),bwObjectTypes:['object']}, str(field.name), rewrite(field.init, {name, constructor:true})
        ])));
        body.push({type:'FunctionDeclaration', name:initName, params:['__bwSelf'], body:initBody});
        body.push({type:'FunctionDeclaration', name:ctorName, params:ctorParams, paramTypes:node.ctor?.paramTypes,
            body:rewrite(node.ctor?.body || [], {name, constructor:true})});
        for (const method of node.methods) {
            const fn = `__bwClass_${name}_${method.name}`, params = ['__bwSelf', ...method.params];
            body.push({type:'FunctionDeclaration', name:fn, params, paramTypes:method.paramTypes,
                body:rewrite(method.body, {name, constructor:false})});
            methods.push({name:method.name, procedure:signature(fn, params), parameters:method.params.map(param => ({name:param,type:typeText(method.paramTypes?.[param]),optional:!!method.optionalParams?.includes(param)})), returnType:typeText(method.returnType)});
        }
        body.push(statement(call('declare', [str(name), str(JSON.stringify(node.fields.map(field => ({name:field.name,type:field.typeName || 'any',readonly:!!field.modifiers?.includes('readonly')})))),
            str(signature(initName, ['__bwSelf'])), str(signature(ctorName, ctorParams)),
            str(JSON.stringify((node.ctor?.params || []).map(param => ({name:param,type:typeText(node.ctor?.paramTypes?.[param]),optional:!!node.ctor?.optionalParams?.includes(param)})))), str(JSON.stringify(methods))])));
    }
    return {program:{...program,body,bwObjectClasses:true}, unsupported};
}
