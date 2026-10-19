import {classCallableCapturedBindings} from './lower-callable-values.js';
import {sdkClassName} from './sdk-class-descriptors.js';
import {SDK_DIALOG_OPAQUE_PARAMETERS} from './sdk-dialog-class-descriptors.js';
import {ValueTypeGraph} from './value-type-graph.js';
import {prepareObjectClassStructure} from './object-class-source-structure.js';
import {physicalUpdateSourceFor,analyseSourceValueProducers} from './source-value-producers.js';
import {physicalUpdateSourceSnapshot} from './physical-update-source-snapshot.js';

const physicalLowerings=new WeakMap();
// The existing callback and PXT statement normalizers represent an absent
// If alternative as an empty statement list. This is an IR edge projection,
// never a runtime Array, a value fact, or permission to omit body/metadata.
function physicalOutputSnapshot(root){
    if(!physicalUpdateSourceSnapshot(root))return null;
    const statementIfs=new WeakSet(),scanned=new WeakSet();let scanValid=true;
    const ownDescriptor=Object.getOwnPropertyDescriptor,isArray=Array.isArray;
    const data=(node,key)=>{if(!node||typeof node!=='object')return undefined;const d=ownDescriptor(node,key);return d&&Object.hasOwn(d,'value')?d.value:undefined;};
    const each=(array,visit)=>{
        if(!isArray(array)){scanValid=false;return;}
        const length=data(array,'length');
        for(let index=0;index<length;index++){
            const d=ownDescriptor(array,String(index));
            if(!d||!Object.hasOwn(d,'value')){scanValid=false;continue;}
            visit(d.value);
        }
    };
    const expressionKeys=['expr','init','test','value','argument','left','right','callee','args','object','index','items','iterable','update'];
    const scan=(node,statement=false)=>{
        if(!node||typeof node!=='object'||scanned.has(node))return;scanned.add(node);
        if(isArray(node)){each(node,value=>scan(value,statement));return;}
        const type=data(node,'type');
        if(type==='If'&&statement)statementIfs.add(node);
        if(['Program','FunctionDeclaration','FunctionExpression','Block','While','For','ForOf','ForIn'].includes(type))scan(data(node,'body'),true);
        if(type==='If'&&statement){scan(data(node,'consequent'),true);scan(data(node,'alternate'),true);}
        if(type==='Declaration')each(data(node,'decls'),decl=>scan(data(decl,'init')));
        if(type==='Switch')each(data(node,'cases'),row=>{scan(data(row,'test'));scan(data(row,'body'),true);});
        for(let index=0;index<expressionKeys.length;index++)scan(data(node,expressionKeys[index]));
        if(type==='Object'&&data(node,'props')!==undefined)each(data(node,'props'),row=>scan(data(row,'value')));
    };try{scan(root,true);}catch{return null;}
    if(!scanValid)return null;
    const seen=new Map();let valid=true;
    const copy=value=>{
        if(!value||typeof value!=='object')return value;
        if(seen.has(value))return seen.get(value);
        const prototype=Object.getPrototypeOf(value),out=Array.isArray(value)?[]:Object.create(prototype);
        if(Array.isArray(value)&&prototype!==Array.prototype)Object.setPrototypeOf(out,prototype);seen.set(value,out);
        const type=Object.getOwnPropertyDescriptor(value,'type');
        const isIf=type&&Object.hasOwn(type,'value')&&type.value==='If'&&statementIfs.has(value);
        if(isIf){
            const test=Object.getOwnPropertyDescriptor(value,'test'),yes=Object.getOwnPropertyDescriptor(value,'consequent'),no=Object.getOwnPropertyDescriptor(value,'alternate');
            if(!test||!yes||!no||![test,yes,no].every(d=>Object.hasOwn(d,'value'))||!test.value||typeof test.value!=='object'||Array.isArray(test.value)||!Array.isArray(yes.value)||no.value!==null&&!Array.isArray(no.value))valid=false;
        }
        for(const key of Reflect.ownKeys(value)){
            const descriptor=Object.getOwnPropertyDescriptor(value,key);
            if(!descriptor||!Object.hasOwn(descriptor,'value')){valid=false;continue;}
            const projected=isIf&&key==='alternate'&&descriptor.value===null?[]:copy(descriptor.value);
            Object.defineProperty(out,key,{...descriptor,value:projected});
        }
        return out;
    };
    const projected=copy(root);return valid?physicalUpdateSourceSnapshot(projected):null;
}
function matchesPhysicalOutput(snapshot,node){
    const current=physicalOutputSnapshot(node);return !!current&&snapshot.matches(current.objects[0]);
}

// Class structure is declarative authoring data. Instances are explicit heap
// references; no field state, per-class numeric handles or closure snapshots.
export function lowerObjectClasses(program,{classCallablePrototype=false,sdkImagePrototype=false,physicalUpdateSource=null}={}) {
    const physicalEntry=physicalUpdateSource?physicalUpdateSourceFor(program,physicalUpdateSource):null;
    if(physicalUpdateSource&&!physicalEntry)return {program,unsupported:['Throw physical update source changed before class lowering']};
    const physicalMethods=new Map(),physicalCreates=new WeakMap();
    const structure=prepareObjectClassStructure(program,{classCallablePrototype,sdkImagePrototype});
    if(structure.skip||structure.unsupported.length)return {program,unsupported:structure.unsupported};
    const {callableModel,liftedCallables,callableClass,callableField,callableMethod,sdkField,sdkParameter,contains,dialogName,sourceClasses,sdkClasses,classes,admitted,lineage}=structure;
    const unsupported=structure.unsupported;
    const fail=message=>{if(!unsupported.includes(message))unsupported.push(message);};
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
            if(classCallablePrototype&&(node.bwCallableDefinition||liftedCallables.has(node.name))){
                const captures=classCallableCapturedBindings(node);
                if(!captures)fail('Class capture lowering requires its actual unchanged lexical binding proof');
                else for(const capture of captures){
                    if((node.params||[]).includes(capture.name)){fail('Class capture conflicts with its actual formal binding');continue;}
                    const key=binding(owner,capture.name,true);
                    if(capture.type?.kind==='named')addType(key,capture.type.name);
                    else if(sdkImagePrototype&&capture.type?.kind==='sdk'&&capture.type.name==='Image')addType(key,'Image');
                }
            }
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
        if(node.type==='Call' && ['named','sdk'].includes(node.bwClassCallableInvocation?.result?.kind))return node.bwClassCallableInvocation.result.name;
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
                if(classCallablePrototype && ['named','sdk'].includes(node.bwClassCallableInvocation?.result?.kind))addType(value,node.bwClassCallableInvocation.result.name);
                for (const target of targets) {
                    if(classCallablePrototype && callableMethod(target.owner.className,target.node.name))continue;
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
            const created=call('create', [str(node.callee.name), {type:'Array', items:node.args.map(arg => rewrite(arg, context))}], ['object']);
            physicalCreates.set(node,created);return created;
        }
        if (node.type === 'Call' && node.callee?.type === 'Member' && classNames(node.callee.object).length) {
            const names = classNames(node.callee.object);
            if (names.every(name => findMethod(name,node.callee.name))) {
                for(const name of names)for(const index of opaqueParameters(name,node.callee.name))if(node.args[index] && !['Null','Undefined'].includes(node.args[index].type))fail('SDK Dialog Font arguments require separate native Font qualification');
                access(node.callee.object,node.callee.name,names.map(name=>findMethod(name,node.callee.name)),context);
                const result=call('call', [rewrite(node.callee.object, context), str(node.callee.name), {type:'Array', items:node.args.map(arg => rewrite(arg, context))}], types(node));
                if(classCallablePrototype && ['named','sdk'].includes(node.bwClassCallableInvocation?.result?.kind))result.bwClassCallableResultType=node.bwClassCallableInvocation.result.name;
                return result;
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
    const body = [],classCallableProcedures=[];
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
        const callableConstructor=callableClass(name)?.constructorSignature;
        if(callableConstructor&&!Number.isInteger(node.ctor?.bwClassCallableScopeId))
            fail('Class callable constructor requires its actual lowered lexical scope');
        // The completed current class signature owns these callable parameters.
        // Preserve its actual body as a class procedure through the following
        // legacy static-callback specialization, exactly as for checked methods.
        if(node.ctor)body.push({type:'FunctionDeclaration',name:ctorName,params:ctorParams,paramTypes:node.ctor.paramTypes,
            body:rewrite(classBody(node.ctor),{name,constructor:true}),
            ...(callableConstructor&&Number.isInteger(node.ctor.bwClassCallableScopeId)?{bwClassCallableMethod:true}:{})});
        else if(!node.base)body.push({type:'FunctionDeclaration',name:ctorName,params:ctorParams,body:[]});
        if(Number.isInteger(node.ctor?.bwClassCallableScopeId))classCallableProcedures.push({scopeId:node.ctor.bwClassCallableScopeId,
            className:name,methodName:null,procedure:signature(ctorName,ctorParams),receiverParameter:selfName,
            ...(callableClass(name)?.constructorSignature?{constructorSignature:callableClass(name).constructorSignature}:{})});
        const superParams=ctorParams;
        body.push({type:'FunctionDeclaration',name:`__bwClass_${name}_superConstructor`,params:superParams,body:[
            statement(procedure(signature(initName,[selfName]),[{...id(selfName),bwObjectTypes:['object']}])),
            statement(procedure(signature(`__bwClass_${actualCtor.name}_constructor`,superParams),superParams.map(param=>({...id(param),bwObjectTypes:param===selfName?['object']:undefined}))))
        ]});
        for (const method of node.methods) {
            const fn = accessorNames.get(method) || `__bwClass_${name}_${method.name}`, params = [selfName, ...method.params];
            const generated={type:'FunctionDeclaration', name:fn, params, paramTypes:method.paramTypes,
                body:rewrite(classBody(method), {name, constructor:false}),...(callableMethod(name,method.name)?{bwClassCallableMethod:true}:{})};
            body.push(generated);
            const original=structure.methodOrigins.get(method);
            if(physicalEntry?.hasMethod(original))physicalMethods.set(original,generated);
            if(Number.isInteger(method.bwClassCallableScopeId))classCallableProcedures.push({scopeId:method.bwClassCallableScopeId,
                className:name,methodName:method.name,procedure:signature(fn,params),receiverParameter:selfName});
            if(method.kind==='method')methods.push({name:method.name, procedure:signature(fn, params), parameters:method.params.map((param,index) => ({name:param,...(callableMethod(name,method.name)?.signature.parameters[index].type.kind==='callable'?{type:'callable',callableSignature:callableMethod(name,method.name).signature.parameters[index].type}:{type:typeText(method.paramTypes?.[param])}),optional:!!method.optionalParams?.includes(param),...(method.parameterDefaults?.some(value=>value.name===param)?{default:defaultValue(method.parameterDefaults.find(value=>value.name===param).value)}:{})})), returnType:callableMethod(name,method.name)?(callableMethod(name,method.name).signature.result.kind==='callable'?'callable':callableMethod(name,method.name).signature.result.name):typeText(method.returnType),visibility:visibility(method),...(callableMethod(name,method.name)?{typeParameters:callableMethod(name,method.name).typeParameters,callableSignature:callableMethod(name,method.name).signature,...(callableMethod(name,method.name).resultFlow?{resultFlow:callableMethod(name,method.name).resultFlow}:{})}:{})});
        }
        body.push(statement(call(node.base?'declareSubclass':'declare', [str(name),...(node.base?[str(node.base)]:[]), str(JSON.stringify(node.fields.map(field => ({name:field.name,type:callableField(name,field.name)?'callable':field.typeName || 'any',...(callableField(name,field.name)?{valueKind:'callable',callableSignature:callableField(name,field.name).type}:{}),...(sdkField(name,field.name)?{valueKind:'sdk',sdkType:sdkField(name,field.name).sdkType}:{}),readonly:!!field.modifiers?.includes('readonly'),visibility:visibility(field),...(field.accessor?.get?{getter:signature(accessorNames.get(field.accessor.get),[selfName])}:{}),...(field.accessor?.set?{setter:{procedure:signature(accessorNames.get(field.accessor.set),[selfName,...field.accessor.set.params]),parameters:field.accessor.set.params.map(param=>({name:param,type:typeText(field.accessor.set.paramTypes?.[param]),optional:false}))}}:{}),...(field.parameterProperty?{parameterProperty:true}:{}),...(ownInitializers.has(field.name)?{initializer:ownInitializers.get(field.name)}:{})})))),
            str(signature(initName, [selfName])), str(signature(`__bwClass_${actualCtor.name}_constructor`,ctorParams)),
            str(JSON.stringify((actualCtor.ctor?.params || []).map((param,index) => ({name:param,
                ...(callableClass(actualCtor.name)?.constructorSignature?.parameters[index].type.kind==='callable'?
                    {type:'callable',callableSignature:callableClass(actualCtor.name).constructorSignature.parameters[index].type}:
                    {type:typeText(actualCtor.ctor?.paramTypes?.[param])}),
                ...(sdkParameter(actualCtor.name,index)?{sdkType:sdkParameter(actualCtor.name,index).sdkType}:{}),optional:!!actualCtor.ctor?.optionalParams?.includes(param),...(actualCtor.ctor?.parameterDefaults?.some(value=>value.name===param)?{default:defaultValue(actualCtor.ctor.parameterDefaults.find(value=>value.name===param).value)}:{})})))), str(JSON.stringify(methods))])));
    }
    const result={program:{...program,body,bwObjectClasses:true,...(classCallableProcedures.length?{bwClassCallableProcedures:classCallableProcedures}:{})},unsupported};
    if(physicalEntry&&!unsupported.length){
        const rows=physicalEntry.methods().map(row=>({...row,generated:physicalMethods.get(row.method),creates:row.sites.map(site=>physicalCreates.get(site))}));
        // Every source/generated procedure (including fields, constructors,
        // super and SDK bodies) and every ordered executable root/registration
        // is recorded in this single pass. Names only index private body rows.
        const procedures=body.filter(node=>node.type==='FunctionDeclaration');
        const roots=physicalOutputSnapshot(body.filter(node=>node.type!=='FunctionDeclaration'));
        const snapshots=procedures.map(node=>({name:node.name,snapshot:physicalOutputSnapshot(node)}));
        const creates=rows.flatMap(row=>row.creates).map(node=>node&&physicalUpdateSourceSnapshot(node));
        if(!physicalEntry.current()||!roots||snapshots.some(row=>!row.snapshot)||rows.some(row=>!row.generated||row.creates.some(node=>!node))||creates.some(value=>!value))
            fail('Throw physical update requires complete current generated methods and construction origins');
        else {const receipt=Object.freeze({});result.physicalUpdateLowering=receipt;
            const rootCalls=[];const scan=node=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(scan);return;}if(node.type==='Call')rootCalls.push(node);for(const [key,value]of Object.entries(node))if(!['originalBody','parameterDefaults','bwProcedureConstraintSource'].includes(key))scan(value);};
            scan(body.filter(node=>node.type!=='FunctionDeclaration'));
            const positions=rows.flatMap(row=>row.creates).map(node=>rootCalls.indexOf(node));
            if(positions.some(index=>index<0))fail('Throw physical update construction lost its actual root position');
            else physicalLowerings.set(receipt,{source:physicalEntry,rows,roots,snapshots,creates,positions});}
    }
    return result;
}

// Query-only: a copied receipt/tag, arbitrary matching method name or caller
// supplied structural rows cannot enter this private issuance map.
export function validatePhysicalUpdateLowering(program,receipt){
    const r=physicalLowerings.get(receipt),unsupported=[];
    const fail=message=>unsupported.push('Throw physical update lowering: '+message);
    if(!r||!r.source.current()){fail('actual private source/lowering receipt is unavailable or expired');return unsupported;}
    if(!physicalUpdateSourceSnapshot(program)){fail('final Program is not current plain data');return unsupported;}
    if(!matchesPhysicalOutput(r.roots,program.body.filter(node=>node.type!=='FunctionDeclaration')))fail('actual root effects, construction or registration changed');
    const procedures=program.body.filter(node=>node.type==='FunctionDeclaration');
    if(procedures.length!==r.snapshots.length||procedures.some((node,index)=>node.name!==r.snapshots[index]?.name))fail('actual ordered generated procedure inventory changed');
    for(const row of r.snapshots){const found=procedures.filter(node=>node.name===row.name);
        if(found.length!==1||!matchesPhysicalOutput(row.snapshot,found[0]))fail('actual generated/source procedure changed: '+row.name);}
    if(unsupported.length)return unsupported;
    const nodes=[];const visit=node=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(visit);return;}nodes.push(node);for(const [key,value]of Object.entries(node))if(!['originalBody','parameterDefaults','bwProcedureConstraintSource'].includes(key))visit(value);};visit(program.body.filter(node=>node.type!=='FunctionDeclaration'));
    const rootCalls=nodes.filter(node=>node.type==='Call');
    const graph=analyseSourceValueProducers(program,{initializationEntries:true,unboundIsOpaque:true,opaqueDeclarationValues:true,uninitializedLocalsAreOpaque:true});
    let index=0;
    for(const row of r.rows)for(const origin of row.creates){
        const snapshot=r.creates[index],found=rootCalls[r.positions[index++]];
        // The full ordered root graph above binds this occurrence, including
        // identical allocations at distinct sites, without a name/hash join.
        if(!found||!snapshot.matches(found)){fail('actual generated construction lost its exact physical origin');continue;}
        for(const decl of row.globals){
            const current=program.body.filter(node=>node.type==='Declaration').flatMap(node=>node.decls).filter(node=>node.name===decl.name);
            if(current.length!==1||graph.declarationCountAt(program,decl.name)!==1||!graph.isBindingInitializedAt(found,graph.bindingOf(program,decl.name)))
                fail('actual binding is not initialized before every generated construction: '+decl.name);
        }
    }
    return unsupported;
}
