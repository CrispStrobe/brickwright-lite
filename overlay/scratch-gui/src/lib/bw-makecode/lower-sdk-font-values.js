import {staticSdkNamespaceReceivers} from './static-sdk-namespaces.js';
import {SDK_FONT_FIELDS} from './sdk-font-value-descriptors.js';

// Directed actual-producer authority. An annotation, assertion or SDK-looking
// name does not allocate a Font, and no class/member result is guessed.
export function lowerSdkFontValues(program) {
    const sdk=staticSdkNamespaceReceivers(program),fields=new Map(SDK_FONT_FIELDS.map(field=>[field.name,field.type]));
    const owners=new WeakMap(),cells=new WeakMap(),types=new Map(),edges=[],scales=[],functions=new Map(),calls=[],unsupported=[];
    const fail=message=>{if(!unsupported.includes(message))unsupported.push(message);};
    const scope=parent=>({parent,bindings:new Map()});
    const global=scope(null),key=()=>Symbol(),add=(cell,type)=>{if(!types.has(cell))types.set(cell,new Set());const set=types.get(cell),before=set.size;set.add(type);return before!==set.size;};
    const binding=(owner,name)=>{for(let current=owner;current;current=current.parent)if(current.bindings.has(name))return current.bindings.get(name);if(!global.bindings.has(name))global.bindings.set(name,key());return global.bindings.get(name);};
    const declare=(owner,name)=>{if(!owner.bindings.has(name))owner.bindings.set(name,key());return owner.bindings.get(name);};
    const path=node=>node?.type==='Identifier'?node.name:node?.type==='Member'?path(node.object)+'.'+node.name:null;
    const predeclare=(body,owner)=>{for(const node of body||[]){if(node.type==='Declaration')for(const decl of node.decls)declare(owner,decl.name);if(['FunctionDeclaration','Class','Enum'].includes(node.type))declare(owner,node.name);}};
    const vars=(node,owner)=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(value=>vars(value,owner));return;}if(['FunctionDeclaration','FunctionExpression','Class'].includes(node.type))return;if(node.type==='Declaration'&&node.kind==='var')node.decls.forEach(decl=>declare(owner,decl.name));Object.values(node).forEach(value=>{if(value&&typeof value==='object')vars(value,owner);});};
    const cell=node=>node?.type==='Identifier'?binding(owners.get(node)||global,node.name):cells.get(node);
    const edge=(from,to)=>{if(from&&to)edges.push([from,to]);};
    const body=(nodes,outer,fn=null)=>{const owner=scope(outer);predeclare(nodes,owner);if(fn){for(const param of fn.params||[])declare(owner,param);vars(nodes,owner);owner.result=fn.result;}for(const node of nodes||[])visit(node,owner);return owner;};
    const visit=(node,owner)=>{
        if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(value=>visit(value,owner));return;}
        owners.set(node,owner);if(node.type==='Identifier')return;
        cells.set(node,key());const current=cell(node);
        if(node.type==='Program'){predeclare(node.body,owner);vars(node.body,owner);node.body.forEach(value=>visit(value,owner));return;}
        if(node.type==='Block'){body(node.body,owner);return;}
        if(node.type==='FunctionDeclaration'){
            const result=key(),entry={node,result,owner:null},functionBinding=binding(owner,node.name);
            if(functions.has(functionBinding)){functions.set(functionBinding,null);fail('SDK Font procedure flow requires a unique lexical declaration');}else functions.set(functionBinding,entry);
            entry.owner=body(node.body,owner,{params:node.params,result});return;
        }
        if(node.type==='FunctionExpression'){add(current,'Opaque');body(node.body,owner,{params:node.params,result:key()});return;}
        if(node.type==='Class'){
            add(current,'Opaque');for(const field of node.fields||[])visit(field.init,owner);
            for(const method of [node.ctor,...(node.methods||[])].filter(Boolean))body(method.body,owner,{params:method.params,result:key()});return;
        }
        if(node.type==='If'){visit(node.test,owner);body(node.consequent,owner);body(node.alternate,owner);return;}
        if(['For','ForOf','While'].includes(node.type)){
            const loop=scope(owner);if(node.init?.type==='Declaration')predeclare([node.init],loop);if(node.type==='ForOf')declare(loop,node.name);
            for(const value of [node.init,node.test,node.update,node.iterable])visit(value,loop);body(node.body,loop);return;
        }
        if(node.type==='Declaration'){
            for(const decl of node.decls){const target=binding(owner,decl.name);if(decl.init){visit(decl.init,owner);edge(cell(decl.init),target);}if(decl.typeName==='image.Font')owner.fontAnnotations=(owner.fontAnnotations||new Set()).add(target);}return;
        }
        if(node.type==='Return'){visit(node.value,owner);let fn=owner;while(fn&&!fn.result)fn=fn.parent;if(fn)edge(cell(node.value),fn.result);return;}
        for(const value of Object.values(node))if(value&&typeof value==='object')visit(value,owner);
        if(node.type==='Assignment'){if(node.op==='=')edge(cell(node.right),cell(node.left));else add(cell(node.left),'Opaque');edge(cell(node.right),current);return;}
        if(node.type==='Member'&&sdk.has(node)&&['image.font5','image.font8','image.font12'].includes(path(node)))add(current,'Font');
        else if(node.type==='Call'&&!node.isNew&&sdk.has(node.callee)&&path(node.callee)==='image.getFontForText'&&node.args.length===1)add(current,'Font');
        else if(node.type==='Call'&&!node.isNew&&sdk.has(node.callee)&&path(node.callee)==='image.scaledFont'&&node.args.length===2)scales.push({node,receiver:cell(node.args[0]),result:current});
        else if(node.type==='Call'&&!node.isNew&&node.callee?.type==='Identifier')calls.push({node,callee:binding(owner,node.callee.name),result:current});
        else if(['Conditional','Logical'].includes(node.type)){edge(cell(node.consequent||node.left),current);edge(cell(node.alternate||node.right),current);}
        else if(node.type==='Member'&&fields.has(node.name))edges.push([cell(node.object),current,'field',node.name]);
        else if(['Undefined','Null'].includes(node.type))add(current,node.type);
        else add(current,'Opaque');
    };
    visit(program,global);
    for(const call of calls){const fn=functions.get(call.callee);if(!fn){add(call.result,'Opaque');continue;}
        call.node.args.forEach((arg,index)=>edge(cell(arg),fn.owner.bindings.get(fn.node.params[index])));edge(fn.result,call.result);
    }
    const isFont=current=>{const set=types.get(current);return !!set?.has('Font')&&[...set].every(type=>['Font','Null','Undefined'].includes(type));};
    let changed;do{changed=false;
        for(const[from,to,mode,name]of edges){if(mode==='field'){if(isFont(from))changed=add(to,name==='data'?'GlyphBuffer':'Primitive')||changed;else if(types.get(from)?.size)changed=add(to,'Opaque')||changed;}else for(const type of types.get(from)||[])changed=add(to,type)||changed;}
        for(const item of scales)if(isFont(item.receiver))changed=add(item.result,'Font')||changed;
    }while(changed);
    for(const item of scales)if(!isFont(item.receiver))fail('SDK scaledFont requires a proven current Font producer');
    const fontAnnotations=new Set();const collectScope=node=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(collectScope);return;}const owner=owners.get(node);for(let s=owner;s;s=s.parent)for(const value of s.fontAnnotations||[])fontAnnotations.add(value);Object.values(node).forEach(value=>{if(value&&typeof value==='object')collectScope(value);});};collectScope(program);
    const rewrite=(node,target=false)=>{
        if(!node||typeof node!=='object')return node;if(Array.isArray(node))return node.map(value=>rewrite(value,target));
        if(node.type==='Member'&&fields.has(node.name)&&(isFont(cell(node.object))||fontAnnotations.has(cell(node.object)))){
            if(!isFont(cell(node.object))){fail('SDK Font field requires proven actual producer authority');return node;}
            if(target){fail('SDK Font field mutation is not qualified by the read slice');return node;}
            return {type:'SdkFontField',object:rewrite(node.object),name:node.name,bwFontType:fields.get(node.name)};
        }
        if(node.type==='Call'&&node.callee?.type==='Member'&&types.get(cell(node.callee.object))?.has('GlyphBuffer')&&['setNumber','setByte','write','fill','shift','rotate','packAt'].includes(node.callee.name))fail('SDK Font glyph Buffer mutation is not qualified by the read slice');
        if(node.type==='Member'&&sdk.has(node)&&['image.font5','image.font8','image.font12'].includes(path(node)))return {type:'SdkFontValue',name:node.name};
        if(node.type==='Call'&&sdk.has(node.callee)&&['image.getFontForText','image.scaledFont'].includes(path(node.callee))){
            const name=node.callee.name;if(node.isNew||node.args.length!==(name==='scaledFont'?2:1))fail('SDK Font factory requires its exact selected signature');
            return {type:'SdkFontCall',name,args:node.args.map(arg=>rewrite(arg)),bwFontType:'image.Font'};
        }
        if(node.type==='Assignment')return {...node,left:rewrite(node.left,true),right:rewrite(node.right)};
        if(node.type==='Update')return {...node,argument:rewrite(node.argument,true)};
        const result=Object.fromEntries(Object.entries(node).map(([name,value])=>[name,value&&typeof value==='object'?rewrite(value,target):value]));
        if(isFont(cell(node)))result.bwFontValue=true;
        return result;
    };
    return {program:rewrite(program),unsupported};
}
