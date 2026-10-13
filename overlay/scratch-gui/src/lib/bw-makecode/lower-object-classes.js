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
    const lineage = name => {const result=[],seen=new Set();while(name){if(seen.has(name)||!admitted.has(name))return null;seen.add(name);result.push(name);name=admitted.get(name).base;}return result;};
    for(const [name,cls]of admitted){
        const chain=lineage(name);
        if(cls.base && [...classes.keys()].indexOf(cls.base)>=[...classes.keys()].indexOf(name))fail(`Selected Arcade SDK requires parent declaration order before ${name}`);
        if(!chain){fail(`Class ${name} requires unsupported or cyclic parent ${cls.base}`);continue;}
        if(!cls.ctor && cls.fields.some(field=>field.init))fail(`Class ${name} initialized fields require an explicit constructor in selected Arcade SDK`);
        if(cls.base && cls.ctor){
            const body=cls.ctor.originalBody || cls.ctor.body,superCall=node=>node?.type==='ExpressionStatement' && node.expr?.type==='Call' && node.expr.callee?.name==='super';
            if(body.filter(superCall).length!==1)fail('Derived class '+name+' constructor requires one direct super call');
            if((cls.fields.some(field=>field.init)||cls.ctor.parameterProperties?.length) && !superCall(body[0]))fail('Selected Arcade SDK requires super first before initialized fields or parameter properties in '+name);
            const first=body.findIndex(superCall);if(first>0 && body.slice(0,first).some(node=>contains(node,value=>value.type==='Identifier'&&value.name==='this')))fail('Derived class '+name+' uses this before super');
        }
        for(const field of cls.fields)if(chain.slice(1).some(base=>admitted.get(base).fields.some(other=>other.name===field.name)))fail('Redefinition of inherited class field '+field.name);
        for(const method of cls.methods){const parent=chain.slice(1).flatMap(base=>admitted.get(base).methods).find(other=>other.name===method.name);if(parent){const visibility=value=>value.modifiers?.find(mode=>['private','protected'].includes(mode)) || 'public',baseMode=visibility(parent),mode=visibility(method);if(baseMode==='private' || baseMode==='public'&&mode!=='public' || baseMode==='protected'&&mode==='private')fail('Class override visibility differs from its accessible base method '+method.name);if(method.params.length!==parent.params.length || method.params.some((param,index)=>JSON.stringify(method.paramTypes?.[param])!==JSON.stringify(parent.paramTypes?.[parent.params[index]])))fail('Class override parameter signature differs from its base method '+method.name);}}
    }
    if(unsupported.length)return {program,unsupported};
    const fieldOwners=new WeakMap(),methodClasses=new WeakMap();
    for(const [name,cls]of admitted){cls.fields.forEach(field=>fieldOwners.set(field,name));cls.methods.forEach(method=>methodClasses.set(method,name));}
    const findField=(name,field)=>lineage(name).flatMap(base=>admitted.get(base).fields).find(value=>value.name===field);
    const findMethod=(name,method)=>lineage(name).flatMap(base=>admitted.get(base).methods).find(value=>value.name===method);
    const effectiveCtor=name=>lineage(name).map(base=>({name:base,ctor:admitted.get(base).ctor})).find(value=>value.ctor) || {name,ctor:null};
    const graph = new ValueTypeGraph(), owners = new WeakMap(), cells = new WeakMap(), entries = [];
    const global = {parent: null, bindings: new Map(), className: null, result: Symbol('global result')};
    const functions = new Map(), memberOwners = new WeakMap(), anyBindings = new Set(), declaredClasses = new Map(), declaredTypes = new Map();
    const binding = (owner, name, declare = false) => {
        if (declare) { if (!owner.bindings.has(name)) owner.bindings.set(name, Symbol(name)); return owner.bindings.get(name); }
        for (let scope = owner; scope; scope = scope.parent) if (scope.bindings.has(name)) return scope.bindings.get(name);
        return binding(global, name, true);
    };
    const fieldCell = (name, field) => graph.property(binding(global, `class:${fieldOwners.get(findField(name,field)) || name}`), field);
    const typeText = value => (typeof value==='string'?value:value?.text) || 'any';
    const addType = (key, name) => {
        if (!name) return;
        name=typeText(name);
        if (!name) return;
        if(admitted.has(name.replace(/(?:\[\])+$/,'')))declaredTypes.set(key,name);
        if (name === 'any') anyBindings.add(key);
        else if (admitted.has(name)) {declaredClasses.set(key,name);graph.add(key, `class:${name}`);}
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
                if(node.base)graph.add(binding(scope,'super',true),`class:${node.base}`);
                memberOwners.set(field, scope); visit(field.init, scope);
            }
            for (const method of [...node.methods, ...(node.ctor ? [node.ctor] : [])]) {
                const scope = {parent, bindings: new Map(), className: node.name, result: Symbol('method result')};
                graph.add(binding(scope, 'this', true), `class:${node.name}`);
                if(node.base)graph.add(binding(scope,'super',true),`class:${node.base}`);
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
        if (node.type === 'Declaration') for (const decl of node.decls) { binding(owner, decl.name, true); addType(binding(owner, decl.name), decl.typeName || (decl.init?.isNew && decl.init.callee?.type==='Identifier' && admitted.has(decl.init.callee.name)?decl.init.callee.name:null)); }
        for (const value of Object.values(node)) if (value && typeof value === 'object') visit(value, owner);
    }
    visit(program, global);
    const staticType=node=>{
        if(!node)return null;
        if(node.assertedType && node.assertedType!=='any')return typeText(node.assertedType);
        const declared=declaredTypes.get(cell(node));if(declared)return declared;
        if(node.type==='Index'){const array=staticType(node.object);return array?.endsWith('[]')?array.slice(0,-2):null;}
        if(node.type==='Member'){const names=classNames(node.object),fields=names.map(name=>findField(name,node.name));return fields.length&&fields.every(field=>field && field.typeName===fields[0].typeName)?fields[0].typeName:null;}
        if(node.type==='Call' && node.callee?.type==='Member'){const names=classNames(node.callee.object),methods=names.map(name=>findMethod(name,node.callee.name));return methods.length&&methods.every(method=>method && typeText(method.returnType)===typeText(methods[0].returnType))?typeText(methods[0].returnType):null;}
        if(node.type==='Call' && node.callee?.type==='Identifier')return node.isNew?node.callee.name:typeText(functions.get(node.callee.name)?.node.returnType);
        return null;
    };
    const classNames = node => {const key=cell(node),declared=staticType(node)||declaredClasses.get(key);if(admitted.has(declared))return [declared];const names=[...graph.node(key).types].filter(type=>type.startsWith('class:')).map(type=>type.slice(6));return names.filter(name=>!names.some(other=>other!==name && lineage(other).includes(name)));};
    let revision;
    do {
        revision = graph.revision;
        for (const node of entries) {
            const owner = owners.get(node), value = cell(node);
            const primitive = {Number:'number',String:'string',Boolean:'boolean',Null:'null',Undefined:'undefined'}[node.type];
            if (primitive) graph.add(value, primitive);
            if (node.assertedType !== 'any') addType(value, node.assertedType);
            if (node.type === 'Call' && node.isNew && node.callee?.type === 'Identifier' && admitted.has(node.callee.name)) {
                graph.add(value, `class:${node.callee.name}`);
                const ctor = effectiveCtor(node.callee.name).ctor;
                if (ctor) node.args.forEach((arg, index) => { if (index < ctor.params.length) graph.merge(cell(arg), binding(memberOwners.get(ctor), ctor.params[index])); });
            }
            if (node.type === 'Declaration') for (const decl of node.decls) if (decl.init) graph.merge(binding(owner, decl.name), cell(decl.init));
            if (node.type === 'Assignment' && node.op === '=') graph.merge(cell(node.left), cell(node.right));
            if (node.type === 'Conditional') { graph.merge(value, cell(node.consequent)); graph.merge(value, cell(node.alternate)); }
            if (node.type === 'Array') { graph.add(value, 'array'); for (const item of node.items) graph.merge(graph.element(value), cell(item)); }
            if (node.type === 'Index') graph.merge(value, graph.element(cell(node.object)));
            if (node.type === 'Member') for (const name of classNames(node.object)) {
                if (findField(name,node.name)) graph.merge(value, fieldCell(name, node.name));
            }
            if (node.type === 'Return' && node.value) graph.merge(owner.result, cell(node.value));
            if (node.type === 'Call' && !node.isNew) {
                const targets = node.callee?.type === 'Identifier' && functions.has(node.callee.name) ? [functions.get(node.callee.name)] :
                    node.callee?.type === 'Member' ? classNames(node.callee.object).flatMap(name => [findMethod(name,node.callee.name)].filter(Boolean).map(method => ({node: method, owner: memberOwners.get(method)}))) : [];
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
                reachedClasses.add(node.callee.name);for(const name of lineage(node.callee.name)){const cls=admitted.get(name);cls.fields.forEach(field=>reach(field.init));reach(cls.ctor?.body);}
            }
            if(node.callee?.type==='Member')for(const name of classNames(node.callee.object)) {
                const method=findMethod(name,node.callee.name);
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
    const visibility = member => member.modifiers?.find(value => ['private','protected'].includes(value)) || 'public';
    const anyReceiver = node => node.assertedType === 'any' || node.type === 'Identifier' && anyBindings.has(binding(owners.get(node) || global,node.name));
    const access = (receiver,name,members,context) => {
        if(anyReceiver(receiver))return;
        for(const member of members){const owner=fieldOwners.get(member)||methodClasses.get(member),mode=visibility(member);
            if(mode==='protected' && context && context.name!==owner && !['this','super'].includes(receiver.name) && !classNames(receiver).every(name=>lineage(name).includes(context.name)))fail('Protected class member '+name+' requires a receiver of the accessing derived class');
            if(mode==='private' && context?.name!==owner || mode==='protected' && (!context || !lineage(context.name).includes(owner)))fail(`Class ${mode} member ${name} cannot be accessed outside its declaring class`);
        }
    };
    const omittedArgument=(member,index)=>member?.parameterDefaults?.find(value=>value.name===member.params[index])?.value || {type:'Undefined'};
    const classBody=member=>member.body.slice(member.parameterDefaults?.length || 0);
    const procedure = (name,args,result=[])=>call('procedure',[str(name),{type:'Array',items:args}],result);
    function rewrite(node, context = null) {
        if (!node || typeof node !== 'object') return node;
        if (Array.isArray(node)) return node.map(child => rewrite(child, context));
        if (node.type === 'Class') return node;
        if(node.type==='Binary' && node.op==='instanceof' && admitted.has(node.right?.name))fail('Ordinary class instanceof is not yet supported');
        if(node.type==='Call' && node.callee?.type==='Identifier' && node.callee.name==='super' && context){
            const base=admitted.get(context.name).base,ctor=effectiveCtor(base).ctor,params=['__bwSelf',...(ctor?.params||[])];
            if(node.args.length>(ctor?.params.length||0)||(ctor?.params||[]).slice(node.args.length).some(name=>!ctor.optionalParams?.includes(name)))fail('Base constructor argument count differs from its declaration');
            return procedure(signature(`__bwClass_${base}_superConstructor`,params),[{...id('__bwSelf'),bwObjectTypes:['object']},...(ctor?.params||[]).map((_,index)=>node.args[index]?rewrite(node.args[index],context):omittedArgument(ctor,index))]);
        }
        if(node.type==='Call' && node.callee?.type==='Member' && node.callee.object.name==='super' && context){
            const base=admitted.get(context.name).base,method=findMethod(base,node.callee.name);
            if(!method){fail('Unknown base class method '+node.callee.name);return node;}
            access(node.callee.object,node.callee.name,[method],context);
            if(node.args.length>method.params.length||method.params.slice(node.args.length).some(name=>!method.optionalParams?.includes(name)))fail('Base method argument count differs from its declaration');
            return procedure(signature(`__bwClass_${methodClasses.get(method)}_${method.name}`,['__bwSelf',...method.params]),[{...id('__bwSelf'),bwObjectTypes:['object']},...method.params.map((_,index)=>node.args[index]?rewrite(node.args[index],context):omittedArgument(method,index))],types(node));
        }
        if(node.type==='Identifier' && admitted.has(node.name))fail(`Class constructor ${node.name} used as a runtime value requires function references`);
        if (node.type === 'Identifier' && node.name === 'this' && context) return {...id('__bwSelf'), bwObjectTypes:['object']};
        if (node.type === 'Call' && node.isNew && node.callee?.type === 'Identifier' && admitted.has(node.callee.name))
            return call('create', [str(node.callee.name), {type:'Array', items:node.args.map(arg => rewrite(arg, context))}], ['object']);
        if (node.type === 'Call' && node.callee?.type === 'Member' && classNames(node.callee.object).length) {
            const names = classNames(node.callee.object);
            if (names.every(name => findMethod(name,node.callee.name))) {
                access(node.callee.object,node.callee.name,names.map(name=>findMethod(name,node.callee.name)),context);
                return call('call', [rewrite(node.callee.object, context), str(node.callee.name), {type:'Array', items:node.args.map(arg => rewrite(arg, context))}], types(node));
            }
            fail(`Class receiver method ${node.callee.name} is not declared for every possible receiver`);
        }
        if (node.type === 'Assignment' && node.left?.type === 'Member' && classNames(node.left.object).length) {
            const names = classNames(node.left.object);
            const fields = names.map(name => findField(name,node.left.name));
            if (fields.some(field => !field)) { fail(`Unknown declared class field ${node.left.name}`); return node; }
            access(node.left.object,node.left.name,fields,context);
            if (!anyReceiver(node.left.object) && fields.some(field => field.modifiers?.includes('readonly')) && !(context?.constructor && fields.every(field=>fieldOwners.get(field)===context.name) && node.left.object.type === 'Identifier' && node.left.object.name === 'this'))
                fail(`Readonly class field ${node.left.name} cannot be assigned outside its constructor`);
            if(node.op==='=')return call('set', [rewrite(node.left.object, context), str(node.left.name), rewrite(node.right, context)]);
            if(!['+=','-=','*=','/=','%=','&=','|=','^=','<<=','>>=','>>>='].includes(node.op)){fail('Unsupported class field assignment operator '+node.op);return node;}
            return call('assign',[rewrite(node.left.object,context),str(node.left.name),str(node.op.slice(0,-1)),rewrite(node.right,context),str('new')],types(node.left));
        }
        if(node.type==='Update' && node.argument?.type==='Member' && classNames(node.argument.object).length) {
            const member=node.argument;
            if (anyReceiver(member.object)) fail('Selected Arcade SDK does not support unary update on any class properties');
            const fields=classNames(member.object).map(name=>findField(name,member.name));
            if(fields.some(field=>!field)){fail('Unknown class field '+member.name);return node;}
            access(member.object,member.name,fields,context);
            if(!anyReceiver(member.object) && fields.some(field=>field.modifiers?.includes('readonly')) && !(context?.constructor && fields.every(field=>fieldOwners.get(field)===context.name) && member.object.type==='Identifier' && member.object.name==='this'))fail(`Readonly class field ${member.name} cannot be assigned outside its constructor`);
            return call('assign',[rewrite(member.object,context),str(member.name),str(node.op),{type:'Number',value:1},str(node.prefix?'new':'old')],['number']);
        }
        if (node.type === 'Member' && classNames(node.object).length && classNames(node.object).every(name => findField(name,node.name))) {
            access(node.object,node.name,classNames(node.object).map(name=>findField(name,node.name)),context);
            return call('get', [rewrite(node.object, context), str(node.name)], types(node));
        }
        const out = Object.fromEntries(Object.entries(node).map(([key, value]) => [key, rewrite(value, context)]));
        if (types(node).includes('object')) out.bwObjectTypes = types(node);
        return out;
    }
    const defaultValue=node=>node?.type==='Number'?Number(node.value):node?.type==='Null'?null:node?.type==='Boolean'?node.value:node?.type==='Unary'?(node.op==='-'?-1:1)*Number(node.argument.value):undefined;
    const body = [];
    for (const node of program.body) {
        if(node.type==='Declaration'){const decls=node.decls.filter(decl=>!decl.whenUsed || used.has(decl.name));if(decls.length)body.push(rewrite({...node,decls}));continue;}
        if (node.type !== 'Class' || !admitted.has(node.name)) { body.push(rewrite(node)); continue; }
        const name = node.name, initName = `__bwClass_${name}_fields`, ctorName = `__bwClass_${name}_constructor`;
        const actualCtor=effectiveCtor(name),ctorParams=['__bwSelf',...(actualCtor.ctor?.params||[])],methods=[];
        const ownInitializers=new Map(),initBody=[];
        if(node.base)initBody.push(statement(procedure(signature(`__bwClass_${node.base}_fields`,['__bwSelf']),[{...id('__bwSelf'),bwObjectTypes:['object']}] )));
        for(const field of node.fields.filter(field=>field.init)){
            const fn=`__bwClass_${name}_field_${field.name}`;ownInitializers.set(field.name,fn);
            body.push({type:'FunctionDeclaration',name:fn,params:[],body:[{type:'Return',value:rewrite(field.init,{name,constructor:true})}]});
            initBody.push(statement(call('set',[{...id('__bwSelf'),bwObjectTypes:['object']},str(field.name),procedure(fn,[],types(field.init))])));
        }
        body.push({type:'FunctionDeclaration',name:initName,params:['__bwSelf'],body:initBody});
        if(node.ctor)body.push({type:'FunctionDeclaration',name:ctorName,params:ctorParams,paramTypes:node.ctor.paramTypes,body:rewrite(classBody(node.ctor),{name,constructor:true})});
        else if(!node.base)body.push({type:'FunctionDeclaration',name:ctorName,params:ctorParams,body:[]});
        const superParams=ctorParams;
        body.push({type:'FunctionDeclaration',name:`__bwClass_${name}_superConstructor`,params:superParams,body:[
            statement(procedure(signature(initName,['__bwSelf']),[{...id('__bwSelf'),bwObjectTypes:['object']}])),
            statement(procedure(signature(`__bwClass_${actualCtor.name}_constructor`,superParams),superParams.map(param=>({...id(param),bwObjectTypes:param==='__bwSelf'?['object']:undefined}))))
        ]});
        for (const method of node.methods) {
            const fn = `__bwClass_${name}_${method.name}`, params = ['__bwSelf', ...method.params];
            body.push({type:'FunctionDeclaration', name:fn, params, paramTypes:method.paramTypes,
                body:rewrite(classBody(method), {name, constructor:false})});
            methods.push({name:method.name, procedure:signature(fn, params), parameters:method.params.map(param => ({name:param,type:typeText(method.paramTypes?.[param]),optional:!!method.optionalParams?.includes(param),...(method.parameterDefaults?.some(value=>value.name===param)?{default:defaultValue(method.parameterDefaults.find(value=>value.name===param).value)}:{})})), returnType:typeText(method.returnType),visibility:visibility(method)});
        }
        body.push(statement(call(node.base?'declareSubclass':'declare', [str(name),...(node.base?[str(node.base)]:[]), str(JSON.stringify(node.fields.map(field => ({name:field.name,type:field.typeName || 'any',readonly:!!field.modifiers?.includes('readonly'),visibility:visibility(field),...(field.parameterProperty?{parameterProperty:true}:{}),...(ownInitializers.has(field.name)?{initializer:ownInitializers.get(field.name)}:{})})))),
            str(signature(initName, ['__bwSelf'])), str(signature(`__bwClass_${actualCtor.name}_constructor`,ctorParams)),
            str(JSON.stringify((actualCtor.ctor?.params || []).map(param => ({name:param,type:typeText(actualCtor.ctor?.paramTypes?.[param]),optional:!!actualCtor.ctor?.optionalParams?.includes(param),...(actualCtor.ctor?.parameterDefaults?.some(value=>value.name===param)?{default:defaultValue(actualCtor.ctor.parameterDefaults.find(value=>value.name===param).value)}:{})})))), str(JSON.stringify(methods))])));
    }
    return {program:{...program,body,bwObjectClasses:true}, unsupported};
}
