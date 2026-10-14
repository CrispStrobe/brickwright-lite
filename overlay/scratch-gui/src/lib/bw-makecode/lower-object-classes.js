import {SDK_CLASS_NODES,SDK_SPRITE_CLASS_NODES,SDK_DIALOG_CLASS_NODES,sdkClassName} from './sdk-class-descriptors.js';
import {SDK_DIALOG_OPAQUE_PARAMETERS} from './sdk-dialog-class-descriptors.js';
import {ValueTypeGraph} from './value-type-graph.js';

// Class structure is declarative authoring data. Instances are explicit heap
// references; no field state, per-class numeric handles or closure snapshots.
export function lowerObjectClasses(program) {
    const reserved = new Set(SDK_CLASS_NODES.map(node=>node.name).filter(name=>name.startsWith('__bwSDK_')));
    const usesReserved = node => node && typeof node==='object' &&
        (reserved.has(node.type==='Identifier'||node.type==='Class'?node.name:null) || reserved.has(node.type==='Class'?node.base:null) ||
        Object.values(node).some(value=>Array.isArray(value)?value.some(usesReserved):usesReserved(value)));
    if(usesReserved(program))return {program,unsupported:['Internal SDK class descriptor names are not source constructors or bindings']};
    const contains = (node, predicate) => node && typeof node === 'object' && (predicate(node) ||
        Object.values(node).some(value => Array.isArray(value) ? value.some(child => contains(child, predicate)) : contains(value, predicate)));
    const dialogName=node=>node?.type==='Member' && node.object?.type==='Identifier' && node.object.name==='game' && ['BaseDialog','SplashDialog'].includes(node.name) ? sdkClassName('game.'+node.name):null;
    const dialogRequested=contains(program,node=>node.type==='Call' && node.isNew && dialogName(node.callee));
    const sourceClasses = program.body.filter(node => node.type === 'Class').map(node=>{
        const properties=new Map();for(const member of node.methods.filter(method=>['get','set'].includes(method.kind))){
            if(!properties.has(member.name))properties.set(member.name,{name:member.name,accessor:{},modifiers:member.modifiers||[],isStatic:member.isStatic});
            const field=properties.get(member.name);if(field.accessor[member.kind])field.duplicateAccessor=true;field.accessor[member.kind]=member;
        }
        for(const field of properties.values()){const get=field.accessor.get,set=field.accessor.set;field.typeName=(typeof get?.returnType==='string'?get.returnType:get?.returnType?.text)||(typeof set?.paramTypes?.[set.params[0]]==='string'?set.paramTypes[set.params[0]]:set?.paramTypes?.[set.params[0]]?.text)||'any';field.modifiers=[...(get?.modifiers||set?.modifiers||[]),...(get&&!set?['readonly']:[])];}
        return {...node,fields:[...node.fields,...properties.values()],...(node.base?{base:sdkClassName(node.base)}:{})};
    });
    const classes = new Map(sourceClasses.map(node => [node.name, node]));
    const hasWhenUsed=program.body.some(node=>node.type==='Declaration' && node.decls.some(decl=>decl.whenUsed));
    if (!classes.size && !dialogRequested && !hasWhenUsed) return {program, unsupported: []};
    const sdkClasses=[...(sourceClasses.some(node=>['Sprite','__bwSDK_ExtendableSprite'].includes(node.base))?SDK_SPRITE_CLASS_NODES:[]),...(dialogRequested||sourceClasses.some(node=>SDK_DIALOG_CLASS_NODES.some(base=>base.name===node.base))?SDK_DIALOG_CLASS_NODES:[])];
    const originalClasses=new Map(classes);classes.clear();for(const node of sdkClasses)classes.set(node.name,node);for(const [name,node]of originalClasses)classes.set(name,node);
    const unsupported = [], admitted = new Map();
    const fail = message => { if (!unsupported.includes(message)) unsupported.push(message); };
    for (const [name, cls] of [...sdkClasses.filter(node=>classes.get(node.name)===node).map(node=>[node.name,node]),...sourceClasses.map(node=>[node.name,node])]) {
        const problems = [...(cls.unsupported || [])];
        if(cls.fields.some(field=>field.typeName && !/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*(?:\[\])*$/.test(field.typeName)))problems.push('union, callable or opaque field type metadata');
        if(cls.fields.some(field=>contains(field.init,node=>node.type==='Identifier' && node.name==='this')))problems.push('selected Arcade SDK instance-field this initializers');
        const originalDefault=value=>['Number','Boolean','Null'].includes(value?.type) || value?.type==='Unary' && ['+','-'].includes(value.op) && value.argument?.type==='Number';
        if([cls.ctor,...cls.methods].filter(Boolean).some(member=>member.parameterDefaults?.some(param=>!originalDefault(param.value))))problems.push('selected Arcade SDK nonliteral default arguments');
        if(contains(cls,node=>node.type==='FunctionDeclaration'))problems.push('nested function declarations');
        if (cls.fields.some(field => field.isStatic)) problems.push('static fields');
        if (cls.methods.some(method => method.isStatic)) problems.push('static methods or accessors');
        if(new Set(cls.fields.map(field=>field.name)).size!==cls.fields.length || cls.fields.some(field=>field.duplicateAccessor))problems.push('duplicate field or accessor declarations');
        if(cls.methods.some(method=>method.kind==='method' && cls.fields.some(field=>field.name===method.name)))problems.push('field or accessor conflicts with a method');
        for(const field of cls.fields.filter(field=>field.accessor?.get&&field.accessor?.set)){const get=field.accessor.get,set=field.accessor.set,param=set.paramTypes?.[set.params[0]],type=typeof param==='string'?param:param?.text;const mode=member=>member.modifiers?.find(value=>['private','protected'].includes(value))||'public';if(field.typeName!=='any'&&type&&type!=='any'&&field.typeName!==type)problems.push('getter and setter type mismatch');if(mode(get)!==mode(set))problems.push('getter and setter visibility mismatch');}
        for(const method of cls.methods.filter(method=>['get','set'].includes(method.kind))){if(method.params.length!==(method.kind==='get'?0:1))problems.push('accessor parameter count');if(method.optionalParams?.length || method.parameterDefaults?.length)problems.push('selected Arcade SDK optional or default accessor parameters');if(method.kind==='get'&&!contains(method.body,node=>node.type==='Return'&&node.value))problems.push('selected Arcade SDK getter must return a value');if(method.kind==='set'&&contains(method.body,node=>node.type==='Return'&&node.value))problems.push('selected Arcade SDK setter cannot return a value');}
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
        if(cls.sdkIntrinsic)continue;
        if(chain.some(base=>admitted.get(base)?.sdkIntrinsic==='SplashDialog'))fail('User SplashDialog subclasses require separate native dispatch qualification');
        if(chain.some(base=>admitted.get(base)?.sdkIntrinsic==='BaseDialog') && cls.methods.some(method=>
            ['resize','drawBorder','clearInterior','drawPartial','fastFill','drawCursorRow','setText','setFont','cursorRowHeight','rowHeight','textAreaWidth','textAreaHeight'].includes(method.name)))
            fail('SDK BaseDialog constructor or layout override requires separate native dispatch qualification');
        const extendable=chain.some(base=>admitted.get(base)?.sdkIntrinsic==='ExtendableSprite');
        // A source method without a returned expression has an inferred void
        // result. Preserve that proven signature in editable class metadata;
        // an unresolved result must not weaken native update validation.
        if(extendable)for(const method of cls.methods.filter(method=>method.name==='update'))
            if(!method.returnType && !contains(method.body,node=>node.type==='Return' && node.value))method.returnType='void';
        if(chain.some(base=>['BaseSprite','Sprite','ExtendableSprite'].includes(admitted.get(base)?.sdkIntrinsic)) && cls.methods.some(method=>
            ['update','draw','drawSprite','__draw','__drawCore','__update','setHitbox','resetHitbox','recalcSize','setDimensions','__visible','__serialize'].includes(method.name) && !(extendable && method.name==='update')))
            fail('SDK Sprite draw/update/hitbox overrides require separate qualification');
        if(cls.base && cls.ctor){
            const body=cls.ctor.originalBody || cls.ctor.body,superCall=node=>node?.type==='ExpressionStatement' && node.expr?.type==='Call' && node.expr.callee?.name==='super';
            if(body.filter(superCall).length!==1)fail('Derived class '+name+' constructor requires one direct super call');
            if((cls.fields.some(field=>field.init)||cls.ctor.parameterProperties?.length) && !superCall(body[0]))fail('Selected Arcade SDK requires super first before initialized fields or parameter properties in '+name);
            const first=body.findIndex(superCall);if(first>0 && body.slice(0,first).some(node=>contains(node,value=>value.type==='Identifier'&&value.name==='this')))fail('Derived class '+name+' uses this before super');
        }
        for(const field of cls.fields)for(const base of chain.slice(1)){const other=admitted.get(base).fields.find(other=>other.name===field.name);if(other){if(!field.accessor||!other.accessor)fail('Redefinition of inherited class field '+field.name);else if(field.typeName!=='any'&&other.typeName!=='any'&&field.typeName!==other.typeName)fail('Class accessor override type differs from its base property '+field.name);}}
        for(const method of cls.methods.filter(method=>method.kind==='method'))if(chain.slice(1).some(base=>admitted.get(base).fields.some(field=>field.name===method.name)))fail('Inherited field or accessor conflicts with class method '+method.name);
        for(const field of cls.fields)if(chain.slice(1).some(base=>admitted.get(base).methods.some(method=>method.kind==='method'&&method.name===field.name)))fail('Class field or accessor conflicts with inherited method '+field.name);
        for(const method of cls.methods){const parent=chain.slice(1).flatMap(base=>admitted.get(base).methods).find(other=>other.name===method.name && other.kind===method.kind);if(parent){const visibility=value=>value.modifiers?.find(mode=>['private','protected'].includes(mode)) || 'public',baseMode=visibility(parent),mode=visibility(method);if(baseMode==='private' || baseMode==='public'&&mode!=='public' || baseMode==='protected'&&mode==='private')fail('Class override visibility differs from its accessible base method '+method.name);if(method.params.length!==parent.params.length || method.params.some((param,index)=>JSON.stringify(typeof method.paramTypes?.[param]==='string'?method.paramTypes[param]:method.paramTypes?.[param]?.text)!==JSON.stringify(typeof parent.paramTypes?.[parent.params[index]]==='string'?parent.paramTypes[parent.params[index]]:parent.paramTypes?.[parent.params[index]]?.text)))fail('Class override parameter signature differs from its base method '+method.name);}}
    }
    if(unsupported.length)return {program,unsupported};
    const fieldOwners=new WeakMap(),methodClasses=new WeakMap();
    for(const [name,cls]of admitted){cls.fields.forEach(field=>fieldOwners.set(field,name));cls.methods.forEach(method=>methodClasses.set(method,name));}
    const findField=(name,field)=>lineage(name).flatMap(base=>admitted.get(base).fields).find(value=>value.name===field);
    const findMethod=(name,method)=>lineage(name).flatMap(base=>admitted.get(base).methods).find(value=>value.name===method && value.kind==='method');
    const findAccessor=(name,field,kind)=>lineage(name).map(base=>admitted.get(base).fields.find(value=>value.name===field)?.accessor?.[kind]).find(Boolean);
    const effectiveCtor=name=>{
        const chain=lineage(name);
        return chain.map(base=>({name:base,ctor:admitted.get(base).ctor})).find(value=>value.ctor) ||
            {name:chain.at(-1),ctor:null};
    };
    const graph = new ValueTypeGraph(), owners = new WeakMap(), cells = new WeakMap(), entries = [];
    const global = {parent: null, bindings: new Map(), className: null, result: Symbol('global result')};
    const functions = new Map(), memberOwners = new WeakMap(), anyBindings = new Set(), declaredClasses = new Map(), declaredTypes = new Map();
    const binding = (owner, name, declare = false) => {
        if (declare) { if (!owner.bindings.has(name)) owner.bindings.set(name, Symbol(name)); return owner.bindings.get(name); }
        for (let scope = owner; scope; scope = scope.parent) if (scope.bindings.has(name)) return scope.bindings.get(name);
        return binding(global, name, true);
    };
    const fieldCell = (name, field) => graph.property(binding(global, `class:${fieldOwners.get(findField(name,field)) || name}`), field);
    const typeText = value => {const text=(typeof value==='string'?value:value?.text) || 'any';return text.endsWith('[]')?sdkClassName(text.slice(0,-2))+'[]':sdkClassName(text);};
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
                visit(field.pxtStagingPrefix, scope); visit(field.pxtStagedInit, scope);
            }
            for (const method of [...node.methods, ...(node.ctor ? [node.ctor] : [])]) {
                const scope = {parent, bindings: new Map(), className: node.name, result: Symbol('method result')};
                graph.add(binding(scope, 'this', true), `class:${node.name}`);
                if(node.base)graph.add(binding(scope,'super',true),`class:${node.base}`);
                for (const param of method.params) { binding(scope, param, true); addType(binding(scope, param), method.paramTypes?.[param]); }
                if(node.sdkIntrinsic || method.kind==='get')addType(scope.result,method.returnType);
                if(method.kind==='get')graph.merge(fieldCell(node.name,method.name),scope.result);
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
    for(const node of sdkClasses)visit(node,global);
    visit({...program,body:program.body.map(node=>node.type==='Class'?classes.get(node.name):node)}, global);
    // Namespace lowering resolves bare SDK names first. Never treat a lexical
    // variable called game as the SDK namespace, including forward declarations.
    for(const node of entries)if(node.type==='Call' && node.isNew && dialogName(node.callee)){
        let scope=owners.get(node),shadow=false;while(scope){if(scope.bindings.has('game')){shadow=true;break;}scope=scope.parent;}
        if(!shadow){node.callee={type:'Identifier',name:dialogName(node.callee)};owners.set(node.callee,owners.get(node));}
    }
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
            if(node.type==='Call' && node.callee?.type==='Member' && node.callee.object?.name==='sprites'){
                if(['create','createProjectileFromSprite','createProjectileFromSide'].includes(node.callee.name))addType(value,'Sprite');
                if(node.callee.name==='allOfKind')addType(value,'Sprite[]');
                if(['onCreated','onDestroyed','onOverlap'].includes(node.callee.name)){const fn=node.args.at(-1);if(fn?.type==='FunctionExpression')for(const param of fn.params)addType(binding(owners.get(fn),param),'Sprite');}
            }
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
    const groupedPrefixes=new Map();
    for(const node of program.body)if(typeof node.bwPxtWhenUsedGroup==='string'){
        const entries=groupedPrefixes.get(node.bwPxtWhenUsedGroup)||[];entries.push(node);groupedPrefixes.set(node.bwPxtWhenUsedGroup,entries);
    }
    const used=new Set(),usedGroups=new Set(),reachedFunctions=new Set(),reachedClasses=new Set(),reachedMethods=new Set();
    const usedClassTables=new Set(),usedInterfaceMembers=new Set();
    const markClassTable=name=>{for(const base of lineage(name)||[])usedClassTables.add(base);};
    const findSlot=(name,key,kind)=>lineage(name).flatMap(base=>admitted.get(base).methods).find(member=>member.name===key && member.kind===kind);
    const virtualRoot=method=>{
        const owner=methodClasses.get(method);let root=method;
        for(const base of (lineage(owner)||[]).slice(1)){
            const inherited=admitted.get(base).methods.find(member=>member.name===method.name && member.kind===method.kind);
            if(inherited)root=inherited;
        }
        return root;
    };
    const markMethod=method=>{
        if(!method)return;
        markClassTable(methodClasses.get(method));
        if(!reachedMethods.has(method)){reachedMethods.add(method);reach(method.body);}
    };
    function reach(node,activeGroup=null,accessMode='read') {
        if(!node || typeof node!=='object')return;
        if(Array.isArray(node)){node.forEach(child=>reach(child,activeGroup));return;}
        if(node.bwPxtWhenUsedGroup && node.bwPxtWhenUsedGroup!==activeGroup)return;
        if(node.type==='FunctionDeclaration' || node.type==='Class')return;
        if(node.type==='Declaration'){for(const decl of node.decls)if(!decl.whenUsed)reach(decl.init,activeGroup);return;}
        if(node.type==='Identifier' && candidates.has(node.name) && binding(owners.get(node)||global,node.name)===binding(global,node.name) && !used.has(node.name)){
            used.add(node.name);
            const declaration=candidates.get(node.name),group=declaration.bwPxtWhenUsedGroup;
            if(group){usedGroups.add(group);for(const prefix of groupedPrefixes.get(group)||[])reach(prefix,group);}
            reach(declaration.init,group||activeGroup);
        }
        if(node.type==='Assignment' && node.left?.type==='Member'){
            reach(node.left,activeGroup,node.op==='='?'write':'readwrite');reach(node.right,activeGroup);return;
        }
        if(node.type==='Update' && node.argument?.type==='Member'){
            reach(node.argument,activeGroup,'readwrite');return;
        }
        if(node.type==='Member' && (node.object.assertedType==='any' || anyBindings.has(cell(node.object))))usedInterfaceMembers.add(node.name);
        if(node.type==='Member')for(const name of classNames(node.object)){
            if(accessMode!=='write')markMethod(findSlot(name,node.name,'get'));
            if(accessMode!=='read')markMethod(findSlot(name,node.name,'set'));
        }
        if(node.type==='Call') {
            const globallyBound=node.callee?.type==='Identifier' && binding(owners.get(node.callee)||owners.get(node)||global,node.callee.name)===binding(global,node.callee.name);
            const fn=globallyBound && functions.get(node.callee.name);
            if(fn && !reachedFunctions.has(fn)){reachedFunctions.add(fn);reach(fn.node.body);}
            if(node.isNew && globallyBound && admitted.has(node.callee.name) && !reachedClasses.has(node.callee.name)) {
                reachedClasses.add(node.callee.name);markClassTable(node.callee.name);for(const name of lineage(node.callee.name)){const cls=admitted.get(name);cls.fields.forEach(field=>reach(field.init));reach(cls.ctor?.body);}
            }
            if(node.callee?.type==='Member'){
                if(node.callee.object.assertedType==='any' || anyBindings.has(cell(node.callee.object)))usedInterfaceMembers.add(node.callee.name);
                for(const name of classNames(node.callee.object))markMethod(findMethod(name,node.callee.name));
            }
        }
        for(const value of Object.values(node))if(value && typeof value==='object')reach(value,activeGroup);
    }
    // Selected PXT fixpointVTables/markVTableUsed (v13.2.1, MIT): a used
    // override marks its virtual root, and a used root marks matching slots
    // in used class tables. Getter/setter slots stay distinct. Class-table
    // reachability is separate from actually reachable construction below.
    let previousReachSize;
    do{
        previousReachSize=used.size+reachedFunctions.size+reachedClasses.size+reachedMethods.size+usedClassTables.size+usedInterfaceMembers.size;
        program.body.forEach(node=>reach(node));
        for(const fn of reachedFunctions)reach(fn.node.body);
        for(const method of reachedMethods)reach(method.body);
        for(const method of [...reachedMethods]) if(method.name==='update' && admitted.get(methodClasses.get(method))?.sdkIntrinsic==='BaseDialog') {
            for(const slot of ['clearInterior','drawTextCore','drawCursorRow'])markMethod(findMethod(methodClasses.get(method),slot));
        }
        for(const name of usedClassTables){
            const cls=admitted.get(name);
            for(const method of cls.methods){
                const root=virtualRoot(method);
                if(reachedMethods.has(method))markMethod(root);
                if(reachedMethods.has(root) || method.kind==='method' && method.name==='toString' && method.params.length===0 || usedInterfaceMembers.has(method.name))markMethod(method);
            }
            reach(cls.ctor?.body);
        }
    }while(previousReachSize!==used.size+reachedFunctions.size+reachedClasses.size+reachedMethods.size+usedClassTables.size+usedInterfaceMembers.size);
    // Selected PXT emits this constructor restriction only when construction
    // is reachable. Unused classes and uncalled functions retain their type
    // and field metadata without executing or validating an unused factory.
    const constructedClasses=new Set([...reachedClasses].flatMap(name=>lineage(name)||[]));
    for(const name of constructedClasses){
        const cls=admitted.get(name);
        if(!cls.ctor && cls.fields.some(field=>field.init))fail(`Class ${name} initialized fields require an explicit constructor in selected Arcade SDK`);
    }
    const id = name => ({type:'Identifier', name}), str = value => ({type:'String', value});
    const call = (name, args, types = []) => ({type:'Call', callee:{type:'Member', object:id('__bwObjects'), name}, args, bwObjectTypes:types,
        ...(['get','call','procedure'].includes(name)?{bwSourceTypeOfOpaque:true}:{})});
    const statement = expr => ({type:'ExpressionStatement', expr});
    const signature = (name, params) => [name, ...params.map(() => '%s')].join(' ');
    const types = node => [...graph.node(cell(node)).types].map(type => type.startsWith('class:') ? 'object' : type === 'Image' ? 'image' : type === 'Sprite' ? 'sprite' : type === 'Buffer' ? 'buffer' : type);
    const visibility = member => member.modifiers?.find(value => ['private','protected'].includes(value)) || 'public';
    // Staging captures a receiver once. Its temporary keeps the source cast's
    // type authority; it must not turn an any receiver into a typed receiver.
    const temporaryOrigins=new Map();
    for(const node of entries)if(node.type==='Declaration')for(const decl of node.decls)
        if(decl.temporary && decl.init)temporaryOrigins.set(binding(owners.get(node)||global,decl.name),decl.init);
    const anyReceiver = (node,seen=new Set()) => {
        if(node.assertedType==='any')return true;
        if(node.type!=='Identifier')return false;
        const key=binding(owners.get(node)||global,node.name);
        if(anyBindings.has(key))return true;
        if(seen.has(key)||!temporaryOrigins.has(key))return false;
        seen.add(key);return anyReceiver(temporaryOrigins.get(key),seen);
    };
    const access = (receiver,name,members,context) => {
        if(anyReceiver(receiver))return;
        for(const member of members){const owner=fieldOwners.get(member)||methodClasses.get(member),mode=visibility(member);
            if(mode==='protected' && context && context.name!==owner && !['this','super'].includes(receiver.name) && !classNames(receiver).every(name=>lineage(name).includes(context.name)))fail('Protected class member '+name+' requires a receiver of the accessing derived class');
            if(mode==='private' && context?.name!==owner || mode==='protected' && (!context || !lineage(context.name).includes(owner)))fail(`Class ${mode} member ${name} cannot be accessed outside its declaring class`);
        }
    };
    const propertyAccess=(receiver,name,names,context,write=false)=>{
        const fields=names.map(cls=>findField(cls,name));
        access(receiver,name,fields,context);
        for(let i=0;i<fields.length;i++){const field=fields[i];if(!field?.accessor)continue;
            if(receiver.type==='Identifier' && receiver.name==='super')fail('Selected Arcade SDK does not support super accessor reads or writes');
            if(!anyReceiver(receiver) && !field.accessor.get)fail('Selected Arcade SDK setter currently requires a corresponding getter in the declared receiver');
            if(write && (!findAccessor(names[i],name,'set') || !anyReceiver(receiver)&&!field.accessor.set))fail('Readonly class accessor '+name+' has no writable setter in the declared receiver');
        }
    };
    const omittedArgument=(member,index)=>member?.parameterDefaults?.find(value=>value.name===member.params[index])?.value || {type:'Undefined'};
    const opaqueParameters=(name,member)=>{const slots=SDK_DIALOG_OPAQUE_PARAMETERS[name]?.[member];return Array.isArray(slots)?slots:[];};
    const classBody=member=>member.body.slice(member.parameterDefaults?.length || 0);
    const procedure = (name,args,result=[])=>call('procedure',[str(name),{type:'Array',items:args}],result);
    function rewrite(node, context = null) {
        if (!node || typeof node !== 'object') return node;
        if (Array.isArray(node)) return node.map(child => rewrite(child, context));
        if (node.type === 'Class') return node;
        if(node.type==='Unary' && node.op==='typeof' && [...graph.node(cell(node.argument)).types].some(type=>
            type==='Sprite' || type.startsWith('class:') && lineage(type.slice(6))?.some(base=>
                ['BaseSprite','Sprite','ExtendableSprite'].includes(admitted.get(base)?.sdkIntrinsic))))
            fail('Source typeof requires unambiguous owned values; Sprite-backed class carriers are not qualified');
        if(node.type==='Binary' && node.op==='instanceof' && admitted.has(node.right?.name))fail('Ordinary class instanceof is not yet supported');
        if(node.type==='Call' && node.callee?.type==='Identifier' && node.callee.name==='super' && context){
            const base=admitted.get(context.name).base,ctor=effectiveCtor(base).ctor,params=[selfName,...(ctor?.params||[])];
            if(node.args.length>(ctor?.params.length||0)||(ctor?.params||[]).slice(node.args.length).some(name=>!ctor.optionalParams?.includes(name)))fail('Base constructor argument count differs from its declaration');
            return procedure(signature(`__bwClass_${base}_superConstructor`,params),[{...id(selfName),bwObjectTypes:['object']},...(ctor?.params||[]).map((_,index)=>node.args[index]?rewrite(node.args[index],context):omittedArgument(ctor,index))]);
        }
        if(node.type==='Call' && node.callee?.type==='Member' && node.callee.object.name==='super' && context){
            const base=admitted.get(context.name).base,method=findMethod(base,node.callee.name);
            if(!method){fail('Unknown base class method '+node.callee.name);return node;}
            access(node.callee.object,node.callee.name,[method],context);
            if(node.args.length>method.params.length||method.params.slice(node.args.length).some(name=>!method.optionalParams?.includes(name)))fail('Base method argument count differs from its declaration');
            return procedure(signature(`__bwClass_${methodClasses.get(method)}_${method.name}`,[selfName,...method.params]),[{...id(selfName),bwObjectTypes:['object']},...method.params.map((_,index)=>node.args[index]?rewrite(node.args[index],context):omittedArgument(method,index))],types(node));
        }
        if(node.type==='Identifier' && admitted.has(node.name))fail(`Class constructor ${node.name} used as a runtime value requires function references`);
        if (node.type === 'Identifier' && node.name === 'this' && context) return {...id(selfName), bwObjectTypes:['object']};
        if (node.type === 'Call' && node.isNew && node.callee?.type === 'Identifier' && admitted.has(node.callee.name)) {
            for(const index of opaqueParameters(node.callee.name,'constructor'))if(node.args[index] && !['Null','Undefined'].includes(node.args[index].type))fail('SDK Dialog Font arguments require separate native Font qualification');
            return call('create', [str(node.callee.name), {type:'Array', items:node.args.map(arg => rewrite(arg, context))}], ['object']);
        }
        if (node.type === 'Call' && node.callee?.type === 'Member' && classNames(node.callee.object).length) {
            const names = classNames(node.callee.object);
            if (names.every(name => findMethod(name,node.callee.name))) {
                for(const name of names)for(const index of opaqueParameters(name,node.callee.name))if(node.args[index] && !['Null','Undefined'].includes(node.args[index].type))fail('SDK Dialog Font arguments require separate native Font qualification');
                access(node.callee.object,node.callee.name,names.map(name=>findMethod(name,node.callee.name)),context);
                return call('call', [rewrite(node.callee.object, context), str(node.callee.name), {type:'Array', items:node.args.map(arg => rewrite(arg, context))}], types(node));
            }
            fail(`Class receiver method ${node.callee.name} is not declared for every possible receiver`);
        }
        if (node.type === 'Assignment' && node.left?.type === 'Member' && classNames(node.left.object).length) {
            if(['++','--'].includes(node.bwPxtSourceUpdate) && anyReceiver(node.left.object))
                fail('Selected Arcade SDK does not support unary update on any class properties');
            const names = classNames(node.left.object);
            const fields = names.map(name => findField(name,node.left.name));
            if (fields.some(field => !field)) { fail(`Unknown declared class field ${node.left.name}`); return node; }
            propertyAccess(node.left.object,node.left.name,names,context,true);
            if(node.op==='=' && !anyReceiver(node.left.object) && node.right.assertedType!=='any'){const valueType=({Number:'number',Boolean:'boolean',String:'string'})[node.right.type] || staticType(node.right);if(['number','boolean','string'].includes(valueType) && fields.some(field=>field.accessor&&['number','boolean','string'].includes(field.typeName)&&field.typeName!==valueType))fail('Class accessor assignment type differs from its declared setter '+node.left.name);}
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
            propertyAccess(member.object,member.name,classNames(member.object),context,true);
            if(!anyReceiver(member.object) && fields.some(field=>field.modifiers?.includes('readonly')) && !(context?.constructor && fields.every(field=>fieldOwners.get(field)===context.name) && member.object.type==='Identifier' && member.object.name==='this'))fail(`Readonly class field ${member.name} cannot be assigned outside its constructor`);
            return call('assign',[rewrite(member.object,context),str(member.name),str(node.op),{type:'Number',value:1},str(node.prefix?'new':'old')],['number']);
        }
        if (node.type === 'Member' && classNames(node.object).length && classNames(node.object).every(name => findField(name,node.name))) {
            propertyAccess(node.object,node.name,classNames(node.object),context);
            return call('get', [rewrite(node.object, context), str(node.name)], types(node));
        }
        const out = Object.fromEntries(Object.entries(node).map(([key, value]) => [key, rewrite(value, context)]));
        if (types(node).includes('object')) out.bwObjectTypes = types(node);
        return out;
    }
    const defaultValue=node=>node?.type==='Number'?Number(node.value):node?.type==='Null'?null:node?.type==='Boolean'?node.value:node?.type==='Unary'?(node.op==='-'?-1:1)*Number(node.argument.value):undefined;
    const accessorNames=new WeakMap(),takenNames=new Set();
    const collectName=node=>{if(!node || typeof node!=='object')return;if(node.name)takenNames.add(node.name);for(const param of node.params||[])takenNames.add(param);Object.values(node).forEach(value=>Array.isArray(value)?value.forEach(collectName):collectName(value));};collectName(program);
    let selfName='__bwSelf';while(takenNames.has(selfName))selfName+='_';takenNames.add(selfName);
    for(const [name,cls]of admitted){for(const method of cls.methods.filter(method=>method.kind==='method'))takenNames.add('__bwClass_'+name+'_'+method.name);}
    for(const [name,cls]of admitted)for(const method of cls.methods.filter(method=>['get','set'].includes(method.kind))){let fn='__bwAccessor_'+name+'_'+method.kind+'_'+method.name;while(takenNames.has(fn))fn+='_';takenNames.add(fn);accessorNames.set(method,fn);}
    const body = [];
    for (let node of program.body) {
        if(node.bwPxtWhenUsedGroup && !usedGroups.has(node.bwPxtWhenUsedGroup))continue;
        if(node.type==='Declaration'){const decls=node.decls.filter(decl=>!decl.whenUsed || used.has(decl.name));if(decls.length)body.push(rewrite({...node,decls}));continue;}
        if (node.type !== 'Class' || !admitted.has(node.name)) { body.push(rewrite(node)); continue; }
        const name = node.name;node=classes.get(name);const initName = `__bwClass_${name}_fields`, ctorName = `__bwClass_${name}_constructor`;
        const actualCtor=effectiveCtor(name),ctorParams=[selfName,...(actualCtor.ctor?.params||[])],methods=[];
        const ownInitializers=new Map(),initBody=[];
        if(node.base)initBody.push(statement(procedure(signature(`__bwClass_${node.base}_fields`,[selfName]),[{...id(selfName),bwObjectTypes:['object']}] )));
        for(const field of node.fields.filter(field=>field.init)){
            const fn=`__bwClass_${name}_field_${field.name}`;ownInitializers.set(field.name,fn);
            body.push({type:'FunctionDeclaration',name:fn,params:[],body:[...rewrite(field.pxtStagingPrefix || [],{name,constructor:true}),{type:'Return',value:rewrite(field.pxtStagedInit || field.init,{name,constructor:true})}]});
            initBody.push(statement(call('set',[{...id(selfName),bwObjectTypes:['object']},str(field.name),procedure(fn,[],types(field.init))])));
        }
        body.push({type:'FunctionDeclaration',name:initName,params:[selfName],body:initBody});
        if(node.ctor)body.push({type:'FunctionDeclaration',name:ctorName,params:ctorParams,paramTypes:node.ctor.paramTypes,body:rewrite(classBody(node.ctor),{name,constructor:true})});
        else if(!node.base)body.push({type:'FunctionDeclaration',name:ctorName,params:ctorParams,body:[]});
        const superParams=ctorParams;
        body.push({type:'FunctionDeclaration',name:`__bwClass_${name}_superConstructor`,params:superParams,body:[
            statement(procedure(signature(initName,[selfName]),[{...id(selfName),bwObjectTypes:['object']}])),
            statement(procedure(signature(`__bwClass_${actualCtor.name}_constructor`,superParams),superParams.map(param=>({...id(param),bwObjectTypes:param===selfName?['object']:undefined}))))
        ]});
        for (const method of node.methods) {
            const fn = accessorNames.get(method) || `__bwClass_${name}_${method.name}`, params = [selfName, ...method.params];
            body.push({type:'FunctionDeclaration', name:fn, params, paramTypes:method.paramTypes,
                body:rewrite(classBody(method), {name, constructor:false})});
            if(method.kind==='method')methods.push({name:method.name, procedure:signature(fn, params), parameters:method.params.map(param => ({name:param,type:typeText(method.paramTypes?.[param]),optional:!!method.optionalParams?.includes(param),...(method.parameterDefaults?.some(value=>value.name===param)?{default:defaultValue(method.parameterDefaults.find(value=>value.name===param).value)}:{})})), returnType:typeText(method.returnType),visibility:visibility(method)});
        }
        body.push(statement(call(node.base?'declareSubclass':'declare', [str(name),...(node.base?[str(node.base)]:[]), str(JSON.stringify(node.fields.map(field => ({name:field.name,type:field.typeName || 'any',readonly:!!field.modifiers?.includes('readonly'),visibility:visibility(field),...(field.accessor?.get?{getter:signature(accessorNames.get(field.accessor.get),[selfName])}:{}),...(field.accessor?.set?{setter:{procedure:signature(accessorNames.get(field.accessor.set),[selfName,...field.accessor.set.params]),parameters:field.accessor.set.params.map(param=>({name:param,type:typeText(field.accessor.set.paramTypes?.[param]),optional:false}))}}:{}),...(field.parameterProperty?{parameterProperty:true}:{}),...(ownInitializers.has(field.name)?{initializer:ownInitializers.get(field.name)}:{})})))),
            str(signature(initName, [selfName])), str(signature(`__bwClass_${actualCtor.name}_constructor`,ctorParams)),
            str(JSON.stringify((actualCtor.ctor?.params || []).map(param => ({name:param,type:typeText(actualCtor.ctor?.paramTypes?.[param]),optional:!!actualCtor.ctor?.optionalParams?.includes(param),...(actualCtor.ctor?.parameterDefaults?.some(value=>value.name===param)?{default:defaultValue(actualCtor.ctor.parameterDefaults.find(value=>value.name===param).value)}:{})})))), str(JSON.stringify(methods))])));
    }
    return {program:{...program,body,bwObjectClasses:true}, unsupported};
}
