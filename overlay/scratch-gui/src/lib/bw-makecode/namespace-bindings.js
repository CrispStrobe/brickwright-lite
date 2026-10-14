import {ARCADE_NAMESPACE_MEMBERS} from './arcade-namespace-members.js';
import {ARCADE_SCENE_CONSTANTS} from './arcade-scene-constants.js';

/** Lower TypeScript namespace bindings without merging their lexical scopes.
 * Namespace objects are not general JavaScript objects: only statically named
 * members are lowered. Escapes, computed access and unresolved/private members
 * retain an explicit diagnostic instead of acquiring a guessed binding.
 */
export const lowerNamespaceBindings = (program, {spriteKinds = false, textSpriteInitializer = false} = {}) => {
    // Ordinary programs already have their binding behavior in the translator.
    // Do not impose namespace declaration rules on them (including collected
    // block-generated projects that redeclare a top-level sprite variable).
    const hasScopedDeclarations = node => node && typeof node === 'object' &&
        (spriteKinds && node.type==='Call' && node.callee?.type==='Member' && node.callee.object?.type==='Identifier' && node.callee.object.name==='SpriteKind' && node.callee.name==='create' || node.type === 'Enum' || node.type === 'Namespace' && (spriteKinds || node.name !== 'SpriteKind') ||
            Object.values(node).some(value=>Array.isArray(value)?value.some(hasScopedDeclarations):hasScopedDeclarations(value)));
    if (!hasScopedDeclarations(program)) return {program, unsupported: []};
    const occupied = new Set();
    const collectNames = node => {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'Identifier') occupied.add(node.name);
        if (node.name) occupied.add(node.name);
        if (node.params) node.params.forEach(name => occupied.add(name));
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(collectNames);
            else if (value && typeof value === 'object') collectNames(value);
        }
    };
    collectNames(program);
    const fresh = path => {
        let name = `__bwNamespace_${path.join('_')}`;
        while (occupied.has(name)) name += '_';
        occupied.add(name);return name;
    };
    const root = {parent: null, path: [], symbols: new Map()};
    // External members are consulted only in source-augmented namespaces.
    // Keep them separate from source exports: no initialization requirements,
    // lexical scope merging, or permission to invent unknown library members.
    const externalScopes = new Map();
    const externalScope = path => {
        const key = path.join('.');
        if (!Object.prototype.hasOwnProperty.call(ARCADE_NAMESPACE_MEMBERS, key)) return null;
        if (!externalScopes.has(key)) {
            const scope = {path, symbols: new Map()};
            externalScopes.set(key, scope);
            for (const [name, container] of ARCADE_NAMESPACE_MEMBERS[key]) {
                const memberPath = [...path, name];
                scope.symbols.set(name, container ? {kind: 'namespace', exported: true,
                    scope: externalScope(memberPath)} : {kind: 'external', exported: true, path: memberPath, constant: ARCADE_SCENE_CONSTANTS[memberPath.join('.')]});
            }
        }
        return externalScopes.get(key);
    };
    const namespaceScopes = new WeakMap();
    const enumScopes = new WeakMap();
    const errors = [];
    const warnings = [];
    const warn=message=>{if(!warnings.includes(message))warnings.push(message);};
    const classSymbols=[];
    const methodSymbols=new Map();
    let activeClass=null;
    const fail = message => { if (!errors.includes(message)) errors.push(message); };
    const declare = (scope, name, symbol) => {
        const external = (scope.external || scope.shared?.external)?.symbols.get(name);
        if (external && !(external.kind === 'namespace' && symbol.kind === 'namespace')) fail(`namespace binding ${[...scope.path, name].join('.')} conflicts with a built-in export`);
        if (scope.symbols.has(name)) fail(`namespace binding ${[...scope.path, name].join('.')} is declared more than once`);
        else {
            if (symbol.kind === 'value') {symbol.sourcePath = [...scope.path, name].join('.');symbol.spriteKind = spriteKinds && scope.path.join('.')==='SpriteKind' && symbol.exported;}
            scope.symbols.set(name, symbol);
            if (scope.shared) {
                if (symbol.exported) declare(scope.shared, name, symbol);
                else scope.shared.privateNames.add(name);
            }
        }
    };
    const prepare = (body, scope) => {
        for (const st of body) {
            if (!spriteKinds && st.type === 'Namespace' && st.name === 'SpriteKind' && scope === root) continue;
            if (st.type === 'Namespace') {
                let symbol = scope.symbols.get(st.name) || (st.exported && scope.shared?.symbols.get(st.name));
                if (symbol && symbol.kind !== 'namespace') {
                    fail(`namespace binding ${[...scope.path, st.name].join('.')} is declared more than once`);
                    continue;
                }
                if (symbol && symbol.exported !== Boolean(st.exported)) {
                    fail(`namespace ${[...scope.path, st.name].join('.')} mixes exported and private declarations`);
                }
                if (!symbol) {
                    const shared = {parent: scope, path: [...scope.path, st.name], symbols: new Map(), privateNames: new Set(), external: externalScope([...scope.path, st.name])};
                    symbol = {kind: 'namespace', scope: shared, exported: Boolean(st.exported)};
                    declare(scope, st.name, symbol);
                } else if (!scope.symbols.has(st.name)) scope.symbols.set(st.name, symbol);
                // Reopened declarations share exported bindings only. A private
                // name in another declaration is never admitted to this block.
                const child = {parent: scope, path: [...scope.path, st.name], symbols: new Map(), shared: symbol.scope};
                namespaceScopes.set(st, child);
                prepare(st.body, child);
            } else if (st.type === 'Enum') {
                const child = {parent: scope, path: [...scope.path, st.name], symbols: new Map()};
                declare(scope, st.name, {kind: 'enum', scope: child, exported: Boolean(st.exported)});
                enumScopes.set(st, child);
                for (const member of st.members) declare(child, member.name, {kind: 'enumMember', exported: true, value: undefined});
            } else if (st.type === 'Class') {
                const symbol={kind:'value',classNode:st,bindingScope:scope,name:scope===root?st.name:fresh([...scope.path,st.name]),exported:Boolean(st.exported)};
                classSymbols.push(symbol);declare(scope,st.name,symbol);
            } else if (st.type === 'FunctionDeclaration') {
                declare(scope, st.name, {kind: 'value', bindingScope:scope, functionNode:st, procedure: scope !== root, name: scope === root ? st.name : fresh([...scope.path, st.name]), exported: Boolean(st.exported)});
            } else if (st.type === 'Declaration') {
                for (const decl of st.decls) declare(scope, decl.name, {kind: 'value', bindingScope:scope, name: scope === root ? decl.name : fresh([...scope.path, decl.name]), readonly: st.kind==='const', exported: Boolean(st.exported)});
            }
        }
    };
    prepare(program.body, root);
    const checkNested = node => {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'Namespace' && (spriteKinds || node.name !== 'SpriteKind') && !namespaceScopes.has(node)) fail(`nested lexical namespace ${node.name} requires scoped declaration support`);
        if (node.type === 'Enum' && !enumScopes.has(node)) fail(`local enum ${node.name} requires scoped enum support`);
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(checkNested);
            else if (value && typeof value === 'object') checkNested(value);
        }
    };
    checkNested(program);
    const lookup = (scope, name, shadows) => {
        if (shadows?.has(name)) return null;
        let privateOwner;
        for (let current = scope; current; current = current.parent) {
            if (current.symbols.has(name)) return current.symbols.get(name);
            if (current.shared?.symbols.has(name)) return current.shared.symbols.get(name);
            if (current.shared?.privateNames.has(name)) privateOwner = current.path;
            const external = (current.external || current.shared?.external)?.symbols.get(name);
            if (external && !privateOwner) return external;
        }
        if (privateOwner) {
            fail(`namespace binding ${[...privateOwner, name].join('.')} is private to another declaration`);
            return {kind: 'invalid'};
        }
        return null;
    };
    const access = (node, scope, shadows) => {
        if (node?.type === 'Identifier') return lookup(scope, node.name, shadows);
        if (node?.type !== 'Member') return null;
        const owner = access(node.object, scope, shadows);
        if (!owner || !['namespace', 'enum'].includes(owner.kind)) return null;
        const member = owner.scope.symbols.get(node.name) || owner.scope.external?.symbols.get(node.name);
        if (!member) { fail(`namespace member ${[...owner.scope.path, node.name].join('.')} is ${owner.scope.privateNames?.has(node.name) ? 'private' : 'not declared'}`);return {kind: 'invalid'}; }
        if (!member.exported) { fail(`namespace member ${[...owner.scope.path, node.name].join('.')} is private`);return {kind: 'invalid'}; }
        return member;
    };
    // Numeric enum initializers may use earlier members and enclosing constants.
    // General runtime enum objects and reverse mappings remain unsupported.
    const constant = (node, scope, seen = new Set()) => {
        if (node?.type === 'Number') return Number(node.value);
        if (node?.type === 'Unary') {
            const value = constant(node.argument, scope, seen);
            if (value === undefined) return undefined;
            if (node.op === '-') return -value;
            if (node.op === '+') return +value;
            if (node.op === '~') return ~value;
        }
        if (['Identifier', 'Member'].includes(node?.type)) {
            const symbol = access(node, scope);
            if (!symbol && node.type === 'Member') {
                const names = [];let rootNode = node;
                while (rootNode?.type === 'Member') {names.unshift(rootNode.name);rootNode = rootNode.object;}
                // Only an unbound SDK root may use the immutable known table.
                // A source binding (including a later declaration or private
                // namespace name) must never turn into an SDK constant.
                if (rootNode?.type === 'Identifier' && !lookup(scope,rootNode.name)) {
                    const path = [rootNode.name,...names].join('.');
                    if (Object.prototype.hasOwnProperty.call(ARCADE_SCENE_CONSTANTS,path)) return ARCADE_SCENE_CONSTANTS[path];
                }
            }
            if (symbol?.kind === 'enumMember') return symbol.value;
            if (symbol?.constant !== undefined) return symbol.constant;
        }
        if (node?.type === 'Binary') {
            const left = constant(node.left, scope, seen), right = constant(node.right, scope, seen);
            if (left === undefined || right === undefined) return undefined;
            switch (node.op) {
            case '+': return left + right;
            case '-': return left - right;
            case '*': return left * right;
            case '/': return left / right;
            case '%': return left % right;
            case '|': return left | right;
            case '&': return left & right;
            case '^': return left ^ right;
            case '<<': return left << right;
            case '>>': return left >> right;
            case '>>>': return left >>> right;
            }
        }
        return undefined;
    };
    const evaluate = (body, scope) => {
        for (const st of body) {
            if (st.type === 'Namespace' && namespaceScopes.has(st)) evaluate(st.body, namespaceScopes.get(st));
            if (st.type === 'Declaration' && st.kind === 'const') {
                for (const decl of st.decls) {
                    const value = constant(decl.init, scope);
                    if (value !== undefined) scope.symbols.get(decl.name).constant = value;
                    if(decl.init?.type==='Number' || decl.init?.type==='Unary' && ['+','-'].includes(decl.init.op) && decl.init.argument?.type==='Number')scope.symbols.get(decl.name).hoistedLiteral=decl.init;
                }
            }
            if (st.type !== 'Enum') continue;
            const child = enumScopes.get(st);
            let previous = -1;
            for (const member of st.members) {
                const value = member.initializer ? constant(member.initializer, child) : previous + 1;
                if (typeof value !== 'number' || !Number.isFinite(value)) fail(`enum ${[...child.path, member.name].join('.')} requires a finite numeric constant initializer`);
                else child.symbols.get(member.name).value = value;
                previous = value;
            }
        }
    };
    evaluate(program.body, root);
    const lexicalNames = body => {
        const names = [];
        for (const st of body || []) {
            if (st.type === 'Declaration') names.push(...st.decls.map(decl => decl.name));
            if (st.type === 'FunctionDeclaration') names.push(st.name);
        }
        return names;
    };
    const functionVars = body => {
        const names = [];
        const visit = node => {
            if (!node || typeof node !== 'object' || ['FunctionExpression', 'FunctionDeclaration'].includes(node.type)) return;
            if (node.type === 'Declaration' && node.kind === 'var') names.push(...node.decls.map(decl => decl.name));
            for (const value of Object.values(node)) {
                if (Array.isArray(value)) value.forEach(visit);
                else if (value && typeof value === 'object') visit(value);
            }
        };
        body.forEach(visit);return names;
    };
    const childShadows = (shadows, names) => new Set([...(shadows || []), ...names]);
    const rewriteBody = (body, scope, shadows, namespaceBody = false) => {
        const active = namespaceBody ? shadows : childShadows(shadows, lexicalNames(body));
        return body.flatMap(st => {
            if (st.type === 'Namespace' && namespaceScopes.has(st)) return rewriteBody(st.body, namespaceScopes.get(st), shadows, true);
            if (st.type === 'Enum') return [];
            return [rewrite(st, scope, active, namespaceBody)];
        });
    };
    const rewrite = (node, scope, shadows, namespaceBody = false, context = null) => {
        if (!node || typeof node !== 'object') return node;
        if (Array.isArray(node)) return node.map(value => rewrite(value, scope, shadows));
        if (['Identifier', 'Member'].includes(node.type)) {
            const symbol = access(node, scope, shadows);
            if (symbol?.kind === 'external') return symbol.path.reduce((object, name) =>
                object ? {type: 'Member', object, name} : {type: 'Identifier', name}, null);
            if (symbol?.kind === 'invalid') return node;
            if (symbol?.kind === 'value') {
                if (symbol.procedure && context !== 'callee') fail(`namespace procedure ${symbol.name} used as a runtime function value`);
                if(symbol.hoistedLiteral && symbol.bindingScope!==root && context!=='write')return {...symbol.hoistedLiteral};
                return {type: 'Identifier', name: symbol.name, assetPath: symbol.sourcePath};
            }
            if (symbol?.kind === 'enumMember' && symbol.value !== undefined) return {type: 'Number', value: symbol.value};
            if (symbol && ['namespace', 'enum'].includes(symbol.kind)) fail(`${symbol.kind} ${symbol.scope.path.join('.')} used as a runtime object`);
        }
        if(spriteKinds && node.type==='ExpressionStatement' && node.expr?.type==='Call' && node.expr.callee?.type==='Member' && node.expr.callee.object?.name==='SpriteKind' && node.expr.callee.name==='create')return {type:'Declaration',kind:'let',decls:[{name:fresh(['SpriteKind','discard']),typeName:'number',init:rewrite(node.expr,scope,shadows)}]};
        const classType=(type,generics=new Set())=>{
                const text=typeof type==='string'?type:type?.text;if(!text)return type;
                const suffix=/((?:\[\])*)$/.exec(text)[1],name=text.slice(0,text.length-suffix.length);
                if(!/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(name))return type;
                if(generics.has(name))return type;
                const ref=name.split('.').reduce((object,name)=>object?{type:'Member',object,name}:{type:'Identifier',name},null);
                const target=access(ref,scope,shadows),resolved=target?.classNode?target.name+suffix:text;
                return typeof type==='string'?resolved:{...type,text:resolved};
            };
        if(node.type==='Class'){
            const symbol=scope.symbols.get(node.name);
            const member=fn=>fn?{...fn,paramTypes:Object.fromEntries(Object.entries(fn.paramTypes || {}).map(([name,type])=>[name,classType(type)])),returnType:classType(fn.returnType),body:rewriteBody(fn.body,scope,childShadows(shadows,[...(fn.params || []),...functionVars(fn.body)]))}:fn;
            return {...node,...(node.base?{base:classType(node.base)}:{}),name:namespaceBody?symbol?.name || node.name:node.name,fields:node.fields.map(field=>({...field,typeName:classType(field.typeName),init:rewrite(field.init,scope,shadows)})),ctor:member(node.ctor),methods:node.methods.map(member)};
        }
        if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
            const generics = new Set((node.typeParameters || []).map(parameter=>parameter.name));
            const local = childShadows(shadows, [...(node.params || []), ...functionVars(node.body), ...generics]);
            return {...node, paramTypes:Object.fromEntries(Object.entries(node.paramTypes || {}).map(([name,type])=>[name,classType(type,generics)])), returnType:classType(node.returnType,generics), ...(node.type === 'FunctionDeclaration' && namespaceBody ? {name:scope.symbols.get(node.name)?.name || node.name} : {}), body: rewriteBody(node.body, scope, local)};
        }
        if (node.type === 'Block') return {...node, body: rewriteBody(node.body, scope, shadows)};
        if (node.type === 'If') return {...node, test: rewrite(node.test, scope, shadows), consequent:rewriteBody(node.consequent, scope, shadows), alternate:rewriteBody(node.alternate || [], scope, shadows)};
        if (node.type === 'For') {
            const loop = childShadows(shadows, node.init?.type === 'Declaration' ? node.init.decls.map(decl => decl.name) : []);
            return {...node, init: rewrite(node.init, scope, loop), test:rewrite(node.test, scope, loop), update:rewrite(node.update, scope, loop), body:rewriteBody(node.body, scope, loop)};
        }
        if (node.type === 'While') return {...node, test:rewrite(node.test, scope, shadows), body:rewriteBody(node.body, scope, shadows)};
        if (node.type === 'Declaration') return {...node, decls:node.decls.map(decl => {const symbol=namespaceBody && scope.symbols.get(decl.name);return {...decl, typeName:classType(decl.typeName), ...(symbol ? {assetPath:symbol.sourcePath} : {}), ...(symbol?.spriteKind ? {typeName:'number',spriteKindName:decl.name,...(textSpriteInitializer && symbol.sourcePath==='SpriteKind.Text' ? {spriteKindLibrary:{library:'textsprite',version:'v1.3.0'}} : {})} : {}), name:symbol?.name || decl.name, init:rewrite(decl.init, scope, shadows)};})};
        if (node.type === 'Assignment' || node.type === 'Update') {
            const target = node.type === 'Assignment' ? node.left : node.argument;
            const symbol=access(target,scope,shadows);
            if (symbol?.kind === 'enumMember') fail('assignment to an enum member');
            if (symbol?.readonly && symbol.bindingScope!==root) fail(`assignment to readonly namespace binding ${symbol.sourcePath}`);
            if(symbol?.spriteKind && !symbol.readonly)return {...Object.fromEntries(Object.entries(node).map(([key,value])=>[key,rewrite(value,scope,shadows,false,key)])),spriteKindName:symbol.sourcePath.slice('SpriteKind.'.length),spriteKindBinding:symbol.name};
        }
        return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, rewrite(value,scope,shadows,false,node.type==='Assignment' && key==='left' || node.type==='Update' && key==='argument'?'write':key)]));
    };
    // The selected PXT compiler hoists procedures and numeric literal constants.
    // Mutable values and executable initializers retain declaration order.
    // Deferred bodies are checked when their statically known calls execute.
    const initialized = new Set();
    const activeCalls = new Set();
    const traceBody = (body, scope, shadows, lexical = false) => {
        const active = lexical ? childShadows(shadows, lexicalNames(body)) : shadows;
        for (const st of body) {
            if (st.type === 'Namespace' && namespaceScopes.has(st)) {traceBody(st.body, namespaceScopes.get(st), active);continue;}
            if (st.type === 'FunctionDeclaration') {if(!lexical)initialized.add(scope.symbols.get(st.name));continue;}
            if(st.type==='Class'){for(const field of st.fields)if(field.isStatic)trace(field.init,scope,active);if(!lexical)initialized.add(scope.symbols.get(st.name));continue;}
            if (st.type === 'Declaration') {
                for (const decl of st.decls) {
                    trace(decl.init,scope,active);
                    if(!lexical){const symbol=scope.symbols.get(decl.name);if(symbol){symbol.classAlias=access(decl.init,scope,active)?.classNode?access(decl.init,scope,active):access(decl.init,scope,active)?.classAlias || null;symbol.instanceClass=classOf(decl.init,scope,active);if(decl.init?.type==='FunctionExpression'){symbol.functionNode=decl.init;symbol.bindingScope=scope;}symbol.callAlias=methodOf(decl.init,scope,active) || access(decl.init,scope,active)?.callAlias || (access(decl.init,scope,active)?.functionNode ? access(decl.init,scope,active) : null);initialized.add(symbol);}}
                }
                continue;
            }
            trace(st, scope, active);
        }
    };
    const classOf=(node,scope,shadows)=>{
        if(node?.type==='New' || node?.type==='Call' && (node.isNew || node.constructorCall))return access(node.callee,scope,shadows)?.classNode?access(node.callee,scope,shadows):access(node.callee,scope,shadows)?.classAlias || null;
        if(node?.type==='Identifier' && node.name==='this')return activeClass;
        return access(node,scope,shadows)?.instanceClass || null;
    };
    const methodOf=(node,scope,shadows,kind='method')=>{
        if(node?.type!=='Member')return null;
        const receiver=access(node.object,scope,shadows),owner=receiver?.classNode?receiver:classOf(node.object,scope,shadows);
        if(!owner)return null;
        const method=owner.classNode.methods.find(method=>method.name===node.name && method.kind===kind && Boolean(method.isStatic)===Boolean(receiver?.classNode));
        if(!method)return null;
        if(!methodSymbols.has(method))methodSymbols.set(method,{functionNode:method,bindingScope:owner.bindingScope,classOwner:owner});
        return methodSymbols.get(method);
    };
    const invoke=symbol=>{
        if(!symbol?.functionNode || activeCalls.has(symbol))return;
        activeCalls.add(symbol);const previous=activeClass;activeClass=symbol.classOwner || null;
        const fn=symbol.functionNode;
        traceBody(fn.body,symbol.bindingScope,childShadows(new Set(),[...(fn.params || []),...functionVars(fn.body)]),true);
        activeClass=previous;activeCalls.delete(symbol);
    };
    const pendingReads=(node,scope,shadows)=>{
        if(!node || typeof node!=='object')return false;
        if(Array.isArray(node))return node.some(value=>pendingReads(value,scope,shadows));
        if(['FunctionDeclaration','FunctionExpression','Class'].includes(node.type))return false;
        if(['Identifier','Member'].includes(node.type)){const symbol=access(node,scope,shadows);if(symbol?.bindingScope && symbol.bindingScope!==root && !symbol.functionNode && !symbol.hoistedLiteral && !symbol.spriteKind && !initialized.has(symbol))return true;}
        return Object.values(node).some(value=>pendingReads(value,scope,shadows));
    };
    const unprovedMethod=(name)=>{
        for(const owner of classSymbols)for(const method of owner.classNode.methods){
            if(method.name===name && pendingReads(method.body,owner.bindingScope,childShadows(new Set(),[...method.params,...functionVars(method.body)])))warn(`namespace initialization order in deferred class method ${owner.classNode.name}.${name} is unproved for a dynamic receiver; class runtime support remains separately diagnosed`);
        }
    };
    const trace = (node, scope, shadows) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {node.forEach(value=>trace(value,scope,shadows));return;}
        if (['FunctionExpression','FunctionDeclaration','Enum','Class'].includes(node.type)) return;
        if (['Identifier','Member'].includes(node.type)) {
            const symbol=access(node,scope,shadows);
            if (!symbol?.functionNode && !symbol?.hoistedLiteral && !symbol?.spriteKind && symbol?.bindingScope && symbol.bindingScope!==root && !initialized.has(symbol) &&
                (node.type==='Member' || !symbol.functionNode)) fail(`namespace binding ${symbol.name} used before initialization`);
        }
        if(node.type==='Assignment'){
            trace(node.right,scope,shadows);
            const setter=methodOf(node.left,scope,shadows,'set');
            if(setter)invoke(setter);else trace(node.left,scope,shadows);
            const target=access(node.left,scope,shadows);
            if(target?.kind==='value'){target.classAlias=node.op==='=' && access(node.right,scope,shadows)?.classNode?access(node.right,scope,shadows):null;target.instanceClass=node.op==='='?classOf(node.right,scope,shadows):null;target.callAlias=node.op==='='?methodOf(node.right,scope,shadows) || access(node.right,scope,shadows)?.callAlias:null;}
            return;
        }
        if(node.type==='Member'){
            const getter=methodOf(node,scope,shadows,'get');
            if(getter)invoke(getter);
            else if(!methodOf(node,scope,shadows))unprovedMethod(node.name);
        }
        if(node.type==='New' || node.type==='Call' && (node.isNew || node.constructorCall)){
            trace(node.callee,scope,shadows);node.args.forEach(arg=>trace(arg,scope,shadows));
            const owner=classOf(node,scope,shadows);
            if(!owner){
                for(const candidate of classSymbols){
                    const bodies=[...candidate.classNode.fields.map(field=>field.init),candidate.classNode.ctor?.body,...candidate.classNode.methods.map(method=>method.body)];
                    if(bodies.some(body=>pendingReads(body,candidate.bindingScope,new Set())))warn(`namespace initialization order in deferred class ${candidate.classNode.name} is unproved for a dynamic constructor; class runtime support remains separately diagnosed`);
                }
            }
            if(owner && !activeCalls.has(owner)){
                activeCalls.add(owner);const previous=activeClass;activeClass=owner;
                for(const field of owner.classNode.fields)if(!field.isStatic)trace(field.init,owner.bindingScope,shadows);
                if(owner.classNode.ctor)invoke({functionNode:owner.classNode.ctor,bindingScope:owner.bindingScope,classOwner:owner});
                activeClass=previous;activeCalls.delete(owner);
            }
            return;
        }
        if (node.type==='Call') {
            const symbol=access(node.callee,scope,shadows) || methodOf(node.callee,scope,shadows);
            trace(node.callee,scope,shadows);node.args.forEach(arg=>trace(arg,scope,shadows));
            invoke(symbol?.callAlias || symbol);
            if(!symbol?.functionNode && !symbol?.callAlias && node.callee?.type==='Member')unprovedMethod(node.callee.name);
            return;
        }
        if (node.type==='Block') {traceBody(node.body,scope,shadows,true);return;}
        if (node.type==='For') {
            const local=childShadows(shadows,node.init?.type==='Declaration'?node.init.decls.map(decl=>decl.name):[]);
            trace(node.init,scope,local);trace(node.test,scope,local);trace(node.update,scope,local);traceBody(node.body,scope,local,true);return;
        }
        if (node.type==='If') {trace(node.test,scope,shadows);traceBody(node.consequent,scope,shadows,true);traceBody(node.alternate||[],scope,shadows,true);return;}
        if (node.type==='While') {trace(node.test,scope,shadows);traceBody(node.body,scope,shadows,true);return;}
        for (const value of Object.values(node)) trace(value,scope,shadows);
    };
    traceBody(program.body,root,new Set());
    const body = rewriteBody(program.body, root, new Set(), true);
    if(spriteKinds){
        const kindDeclarations=body.filter(st=>st.type==='Declaration').flatMap(st=>st.decls.filter(decl=>decl.spriteKindName));
        body.unshift(...kindDeclarations.map(decl=>({type:'SpriteKindReset',name:decl.name})));
    }
    return errors.length ? {program:null,unsupported:errors,warnings} : {program:{...program,body},unsupported:[],warnings};
};
