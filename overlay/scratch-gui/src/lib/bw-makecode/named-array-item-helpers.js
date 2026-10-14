import {tsText} from './translate-base.js';
import {parseMakeCodeTs} from './ts-import.js';
import {LEGACY_JSON_SOURCE,LEGACY_PARSE_SOURCE,ARRAY_ACCESS_SOURCE} from './legacy-array-values.js';

// The aggregate branch is intentionally distinct from scalar results. Native
// references need separate graph authority; typeof alone cannot identify them.
export const NAMED_ARRAY_GET_SOURCE = `function __bwNamedArrayGet(array: any[], index: any): any {
    if (!array) return ""
    let value = array[+index]
    if (value !== null && typeof value === "object") return __bwNamedJsonValue(value)
    return value
}`;

const parsed = source => parseMakeCodeTs(source, {parameterDefaults:true,retainParentheses:true}).body[0];
const templates = {get:parsed(NAMED_ARRAY_GET_SOURCE),json:parsed(LEGACY_JSON_SOURCE)};
const mutatorSources = {
    push:'function __bwNamedArrayPush(array:any[],value:any):void {if(array)array.push(__bwNamedParseValue(value))}',
    set:'function __bwNamedArraySet(array:any[],index:any,value:any):void {if(array)array[+index]=__bwNamedParseValue(value)}',
    insert:`function __bwNamedArrayInsert(array:any[],index:any,value:any):void {
        if(array){let position=+index
        if(position!==position)position=0
        position=position<0?Math.max(0,array.length+Math.ceil(position)):Math.min(array.length,Math.floor(position))
        array.insertAt(position,__bwNamedParseValue(value))}
    }`
};
const mutatorTemplates=new Map(Object.entries(mutatorSources).map(([kind,source])=>[kind,parsed(source)]));
const parseTemplate=parsed(LEGACY_PARSE_SOURCE);
const passiveSources={
    pop:'function __bwNamedArrayPop(array:any[]):any {if(array){if(array.length)return array.pop()}return ""}',
    indexOf:'function __bwNamedArrayIndexOf(array:any[],value:any):number {return array?array.indexOf(__bwNamedParseValue(value)):-1}',
    contains:`function __bwNamedArrayContains(array:any[],value:any):boolean {
        if(array){let parsed=__bwNamedParseValue(value)
        for(let i=0;i<array.length;i++){let item=array[i]
        if(item===parsed || (item!==item && parsed!==parsed))return true}}
        return false
    }`,
    remove:`function __bwNamedArrayRemove(array:any[],index:any):void {
        if(array){let position=+index
        if(position!==position)position=0
        position=position<0?Math.max(0,array.length+Math.ceil(position)):Math.min(array.length,Math.floor(position))
        if(position<array.length)array.removeAt(position)}
    }`
};
const passiveTemplates=Object.values(passiveSources).map(parsed);
const normalize = (node, names) => Array.isArray(node) ? node.map(value=>normalize(value,names)) :
    node && typeof node==='object' ? Object.fromEntries(Object.entries(node).map(([key,value])=>
        [key,key==='name' && names.has(value) ? names.get(value) : normalize(value,names)])) : node;
const exact = (actual, expected, names) => JSON.stringify(normalize(actual,names))===JSON.stringify(expected);
const bindings = body => new Set(body.flatMap(node=>node.type==='Declaration' ? node.decls.map(decl=>decl.name) :
    ['FunctionDeclaration','Class'].includes(node.type) ? [node.name] : []));
// Conservatively refuse a receiver matching any local declaration in its
// function, including declarations carried in If/loop statement arrays. This
// also handles function-scoped var without mistaking it for a root binding.
const functionBindings=body=>{
    const names=new Set();
    const collect=node=>{
        if(!node || typeof node!=='object')return;
        if(Array.isArray(node)){node.forEach(collect);return;}
        if(node.type==='Declaration')node.decls.forEach(decl=>names.add(decl.name));
        if(node.type==='ForOf')names.add(node.name);
        if(['FunctionDeclaration','Class'].includes(node.type)){names.add(node.name);return;}
        if(Array.isArray(node.params))return;
        for(const value of Object.values(node))collect(value);
    };
    collect(body);return names;
};
const loopBindings=node=>['For','ForOf','ForIn'].includes(node.type)?
    new Set([...bindings(node.init?[node.init]:[]),...(node.variable?[typeof node.variable==='string'?node.variable:node.variable.name]:[]),...(node.type==='ForOf'?[node.name]:[])].filter(Boolean)):new Set();
const literal = node => {
    if (['String','Number','Boolean'].includes(node?.type)) return {ok:true,value:node.type==='Number'?Number(node.value):node.type==='String'?tsText(node.value):node.value};
    if (node?.type==='Null') return {ok:true,value:null};
    if (node?.type==='Unary' && ['+','-'].includes(node.op) && node.argument?.type==='Number')
        return {ok:true,value:(node.op==='-'?-1:1)*Number(node.argument.value)};
    if (node?.type==='Array') {
        const values=node.items.map(literal);
        if (values.every(value=>value.ok)) return {ok:true,value:values.map(value=>value.value)};
    }
    return {ok:false};
};

/** Reconstruct only exact getter helpers and actual owned registry bindings. */
export function lowerNamedArrayItemHelpers(program) {
    const functions=program.body.filter(node=>node.type==='FunctionDeclaration');
    const jsonHelpers=functions.filter(fn=>exact(fn,templates.json,new Map([[fn.name,templates.json.name]])));
    const parseHelpers=functions.filter(fn=>exact(fn,parseTemplate,new Map([[fn.name,parseTemplate.name]])));
    const getters=new Map();
    for (const fn of functions) for (const json of jsonHelpers) {
        if (fn===json) continue;
        if (exact(fn,templates.get,new Map([[fn.name,templates.get.name],[json.name,templates.json.name]])))
            getters.set(fn.name,fn);
    }
    if (!getters.size) return {program,unsupported:[]};
    const symbolCounts=new Map();
    for(const node of program.body)for(const name of node.type==='Declaration'?node.decls.map(decl=>decl.name):['FunctionDeclaration','Class'].includes(node.type)?[node.name]:[])symbolCounts.set(name,(symbolCounts.get(name)||0)+1);
    if([...getters.keys(),...jsonHelpers.map(fn=>fn.name),...parseHelpers.map(fn=>fn.name)].some(name=>symbolCounts.get(name)!==1))
        return {program,unsupported:['Named Array helper requires an unambiguous actual lexical binding']};
    const mutators=new Map();
    for(const fn of functions)for(const parse of parseHelpers)for(const [kind,template]of mutatorTemplates)
        if(exact(fn,template,new Map([[fn.name,template.name],[parse.name,parseTemplate.name]])))mutators.set(fn.name,{fn,kind});
    if([...mutators.keys()].some(name=>symbolCounts.get(name)!==1))
        return {program,unsupported:['Named Array mutator requires an unambiguous actual lexical binding']};
    const passive=new Set(jsonHelpers.map(fn=>fn.name));
    const arrayAccessTemplate=parsed(ARRAY_ACCESS_SOURCE);
    for(const fn of functions)if(symbolCounts.get(fn.name)===1 &&
        exact(fn,arrayAccessTemplate,new Map([[fn.name,arrayAccessTemplate.name]])))passive.add(fn.name);
    for(const fn of functions)for(const parse of parseHelpers)for(const template of passiveTemplates)
        if(symbolCounts.get(fn.name)===1 && exact(fn,template,new Map([[fn.name,template.name],[parse.name,parseTemplate.name]])))passive.add(fn.name);
    const globals=new Map(program.body.filter(node=>node.type==='Declaration').flatMap(node=>node.decls.map(decl=>[decl.name,decl])));
    const calls=[],writes=new Map(),unsupported=[],possibleMutators=[],members=[],foreignCalls=[],indexWrites=[],nestedRootDeclarations=[],escapedMutators=new Set(),scopes=new WeakMap();
    const visit=(node,shadow=new Set(),parent=null,key=null,depth=0)=>{
        if (!node || typeof node!=='object') return;
        if (Array.isArray(node)) {
            if(parent?.type!=='Program' && ['body','consequent','alternate'].includes(key))shadow=new Set([...shadow,...bindings(node)]);
            node.forEach(child=>visit(child,shadow,parent,key,depth));return;
        }
        if (node.type==='FunctionDeclaration' && getters.has(node.name)) return;
        if(node.type==='Declaration' && depth===0 && parent?.type!=='Program')nestedRootDeclarations.push(node);
        if(node.type==='ForOf' && depth===0)nestedRootDeclarations.push({decls:[{name:node.name}]});
        if (node.type==='Block') shadow=new Set([...shadow,...bindings(node.body || [])]);
        shadow=new Set([...shadow,...loopBindings(node)]);
        if (Array.isArray(node.params)) {
            depth++;
            shadow=new Set([...shadow,...node.params,...functionBindings(node.body || [])]);
        }
        scopes.set(node,shadow);
        if (node.type==='Identifier' && getters.has(node.name) && !shadow.has(node.name) &&
            !(parent?.type==='Call' && key==='callee')) unsupported.push('Named Array getter helper escapes its validated direct call');
        if(node.type==='Identifier' && mutators.has(node.name) && !shadow.has(node.name) &&
            !(parent?.type==='Call' && key==='callee'))escapedMutators.add(node.name);
        if (node.type==='Call' && node.callee?.type==='Identifier' && getters.has(node.callee.name) && !shadow.has(node.callee.name)) {
            const receiver=node.args[0];
            if (node.args.length!==2 || receiver?.type!=='Identifier' || shadow.has(receiver.name) || !globals.has(receiver.name))
                unsupported.push('Named Array getter requires its actual owned global registry binding');
            else calls.push({node,name:receiver.name});
        }
        if(node.type==='Call' && node.callee?.type==='Identifier' && mutators.has(node.callee.name) && !shadow.has(node.callee.name))
            possibleMutators.push({node,shadow,spec:mutators.get(node.callee.name)});
        if(node.type==='Call' && node.callee?.type==='Member' && ['push','unshift','insertAt','set'].includes(node.callee.name))members.push({node,shadow});
        if(node.type==='Call' && node.callee?.type==='Identifier' && !getters.has(node.callee.name) && !mutators.has(node.callee.name) && (!passive.has(node.callee.name) || shadow.has(node.callee.name)))foreignCalls.push({node,shadow});
        if(node.type==='Assignment' && node.left?.type==='Identifier' && (passive.has(node.left.name) || mutators.has(node.left.name)) && !shadow.has(node.left.name))unsupported.push('Named Array passive or mutator helper requires its unchanged actual lexical binding');
        if(node.type==='Assignment' && node.left?.type==='Index')indexWrites.push({node,shadow});
        if (node.type==='Assignment' && node.left?.type==='Identifier' && globals.has(node.left.name) && !shadow.has(node.left.name)) {
            const list=writes.get(node.left.name) || [];list.push(node);writes.set(node.left.name,list);
        }
        if (node.type==='Update' && node.argument?.type==='Identifier' && globals.has(node.argument.name) && !shadow.has(node.argument.name)) {
            const list=writes.get(node.argument.name) || [];list.push(node);writes.set(node.argument.name,list);
        }
        for (const [childKey,value] of Object.entries(node)) if (value && typeof value==='object') visit(value,shadow,node,childKey,depth);
    };
    visit(program);
    const registries=new Set(calls.map(call=>call.name));
    if(nestedRootDeclarations.some(node=>node.decls.some(decl=>registries.has(decl.name))))unsupported.push('Named Array getter has an unqualified nested root declaration of its registry binding');
    const origins=(node,seen=new Set())=>{
        if(node?.type==='Null' || literal(node).ok)return {names:new Set(),unknown:false};
        if(node?.type!=='Identifier' || scopes.get(node)?.has(node.name) || !globals.has(node.name))return {names:new Set(),unknown:true};
        if(registries.has(node.name))return {names:new Set([node.name]),unknown:false};
        if(seen.has(node.name))return {names:new Set(),unknown:true};
        seen=new Set([...seen,node.name]);
        const values=[globals.get(node.name).init,...(writes.get(node.name)||[]).map(write=>write.right)];
        const results=values.map(value=>origins(value,seen));
        return {names:new Set(results.flatMap(value=>[...value.names])),unknown:results.some(value=>value.unknown)};
    };
    const primitive=(node,seen=new Set())=>{
        const value=literal(node);
        if(value.ok)return node.type!=='Array';
        if(node?.type==='Undefined')return true;
        if(node?.type==='Unary' && ['+','-','!','~'].includes(node.op))return primitive(node.argument,seen);
        if(node?.type==='Binary')return primitive(node.left,seen)&&primitive(node.right,seen);
        if(node?.type==='Conditional')return primitive(node.test,seen)&&primitive(node.consequent,seen)&&primitive(node.alternate,seen);
        if(node?.type==='Call' && calls.some(call=>call.node===node))return true;
        if(node?.type==='Call' && node.callee?.type==='Identifier' &&
            !scopes.get(node)?.has(node.callee.name) && symbolCounts.get(node.callee.name)===1){
            const fn=functions.find(fn=>fn.name===node.callee.name);
            if(!fn || seen.has(fn) || fn.params.length)return false;
            const returns=[];
            const collect=value=>{
                if(!value || typeof value!=='object')return;
                if(Array.isArray(value)){value.forEach(collect);return;}
                if(['FunctionDeclaration','FunctionExpression','Class'].includes(value.type))return;
                if(value.type==='Return')returns.push(value.value || {type:'Undefined'});
                for(const child of Object.values(value))if(child && typeof child==='object')collect(child);
            };
            collect(fn.body);
            const nested=new Set([...seen,fn]);
            return returns.length>0 && returns.every(value=>primitive(value,nested));
        }
        if(node?.type!=='Identifier' || scopes.get(node)?.has(node.name) || !globals.has(node.name) || seen.has(node.name))return false;
        seen=new Set([...seen,node.name]);
        return [globals.get(node.name).init,...(writes.get(node.name)||[]).map(write=>write.right)].every(value=>primitive(value,seen));
    };
    const recognizedMutators=new Map();
    for(const {node,shadow,spec}of possibleMutators){
        const receiver=node.args[0],source=origins(receiver);
        if(!source.names.size && !source.unknown)continue;
        if(receiver?.type!=='Identifier' || shadow.has(receiver.name) || !registries.has(receiver.name)){
            unsupported.push('Named Array mutator requires its actual owned registry binding; historical or unknown aliases are not admitted');continue;
        }
        const expected=spec.kind==='push'?2:3,valueIndex=spec.kind==='push'?1:2;
        if(node.args.length!==expected || !primitive(node.args[valueIndex])){
            unsupported.push('Named Array getter cannot reconstruct opaque or reference-valued mutator arguments');continue;
        }
        recognizedMutators.set(node,{registry:receiver.name,kind:spec.kind});
    }
    for(const {node,shadow}of members){
        // Parameter-owned helpers are validated separately at their call site.
        if(node.callee.object?.type==='Identifier' && shadow.has(node.callee.object.name))continue;
        const source=origins(node.callee.object);
        if((source.names.size || source.unknown) && !primitive(node.args[['insertAt','set'].includes(node.callee.name)?1:0]))
            unsupported.push('Named Array getter has an opaque or reference-valued array mutation');
    }
    for(const {node,shadow}of indexWrites){
        if(node.left.object?.type==='Identifier' && shadow.has(node.left.object.name))continue;
        const source=origins(node.left.object);
        if((source.names.size || source.unknown) && !primitive(node.right))
            unsupported.push('Named Array getter has an opaque or reference-valued indexed writer');
    }
    for(const {node,shadow}of foreignCalls)for(const arg of node.args){
        if(arg?.type==='Identifier' && shadow.has(arg.name))continue;
        const source=origins(arg);
        if(source.names.size || source.unknown && !primitive(arg))unsupported.push('Named Array getter registry escapes to an unproved writer');
    }
    for (const name of registries) {
        if(name==='__proto__' || Object.hasOwn(Object.prototype,name))unsupported.push('Named Array getter cannot reconstruct prototype-sensitive registry bindings');
        const init=globals.get(name).init;
        if (init?.type!=='Null' && !(init?.type==='Array' && literal(init).ok))
            unsupported.push(`Named Array registry ${name} has an unproved initializer`);
        for (const write of writes.get(name) || []) if (write.type!=='Assignment' || write.op!=='=' ||
            write.right?.type!=='Null' && !(write.right?.type==='Array' && literal(write.right).ok))
            unsupported.push(`Named Array registry ${name} has an unproved writer`);
    }
    if (unsupported.length) return {program,unsupported:[...new Set(unsupported)]};
    const recognizedCalls=new Map(calls.map(call=>[call.node,call.name]));
    const value=(node,name)=>({type:node.type==='Null'?'NativeNamedArrayDelete':'NativeNamedArrayCreate',
        registry:name,json:node.type==='Array'?JSON.stringify(literal(node).value):null,bwObjectTypes:node.type==='Array'?['array']:['null']});
    const rewrite=(node,shadow=new Set())=>{
        if (!node || typeof node!=='object') return node;
        if (Array.isArray(node)) return node.map(child=>rewrite(child,shadow));
        if (recognizedCalls.has(node)) return {...node,bwNativeNamedArray:{kind:'get',registry:recognizedCalls.get(node)},args:node.args.map(arg=>rewrite(arg,shadow))};
        if(recognizedMutators.has(node))return {...node,bwNativeNamedArray:recognizedMutators.get(node),args:node.args.map(arg=>rewrite(arg,shadow))};
        if (node.type==='Block') shadow=new Set([...shadow,...bindings(node.body || [])]);
        shadow=new Set([...shadow,...loopBindings(node)]);
        if (Array.isArray(node.params)) shadow=new Set([...shadow,...node.params,...functionBindings(node.body || [])]);
        const copy=Object.fromEntries(Object.entries(node).map(([key,child])=>[key,rewrite(child,
            Array.isArray(child) && node.type!=='Program' && ['body','consequent','alternate'].includes(key)?new Set([...shadow,...bindings(child)]):shadow)]));
        if (node.type==='Declaration') copy.decls=copy.decls.map(decl=>registries.has(decl.name) && !shadow.has(decl.name)?{...decl,init:value(decl.init,decl.name)}:decl);
        if (node.type==='Assignment' && node.left?.type==='Identifier' && registries.has(node.left.name) && !shadow.has(node.left.name)) copy.right=value(node.right,node.left.name);
        return copy;
    };
    // Replaced direct calls already use native words. Keep a validated helper
    // body only when a remaining actual use still needs its procedure semantics.
    const removedMutators=new Set([...mutators.keys()].filter(name=>!escapedMutators.has(name) &&
        possibleMutators.filter(use=>use.node.callee.name===name).every(use=>recognizedMutators.has(use.node))));
    return {program:rewrite({...program,body:program.body.filter(node=>!(node.type==='FunctionDeclaration' && (getters.has(node.name) || removedMutators.has(node.name))))}),unsupported:[]};
}
