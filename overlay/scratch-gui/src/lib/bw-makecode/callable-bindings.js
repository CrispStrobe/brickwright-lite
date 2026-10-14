// Resolve captures by lexical binding identity before assigning native cell names.
// PXT function expressions retain the enclosing class receiver, including the
// ordinary function syntax. Global reads do not allocate captured actions.
import {callableDefaultBody} from './callable-defaults.js';
export function analyseCallableBindings(program) {
    const scopes = new WeakMap(), references = new WeakMap(), functions = [], bindings = [];
    let nextScope = 0;
    const scope = (parent, kind, node, className = parent?.className || null) => ({
        id:++nextScope, parent, kind, node, className, names:new Map(),
        functionOwner:null, captures:new Set(), capturedBeforeDeclaration:new Set()
    });
    const global = scope(null,'global',program);
    global.functionOwner = global;
    const declare = (owner, name, kind, node) => {
        const previous=owner.names.get(name);
        if (previous) return previous;
        const binding={id:bindings.length+1,name,kind,node,scope:owner,functionOwner:owner.functionOwner,
            written:false,declared:['parameter','receiver','class','function','global','loop'].includes(kind)};
        owner.names.set(name,binding);bindings.push(binding);return binding;
    };
    const lookup = (owner,name) => {
        for(let current=owner;current;current=current.parent)if(current.names.has(name))return current.names.get(name);
        return null;
    };
    const predeclare = (body,owner) => {
        for(const node of body || []) {
            if(node.type==='Declaration')for(const decl of node.decls)declare(owner,decl.name,owner===global?'global':'local',decl);
            if(node.type==='FunctionDeclaration')declare(owner,node.name,'function',node);
            if(node.type==='Class')declare(owner,node.name,'class',node);
        }
    };
    const note = (node,owner,write=false) => {
        const binding=lookup(owner,node.name);
        references.set(node,binding);
        if(!binding)return;
        if(write)binding.written=true;
        if(binding.functionOwner===global)return;
        for(let current=owner.functionOwner;current && current!==binding.functionOwner;current=current.parent?.functionOwner) {
            current.captures.add(binding);
            if (!binding.declared) current.capturedBeforeDeclaration.add(binding);
            if(current.parent?.functionOwner===current)break;
        }
    };
    const block = (body,parent,node) => {
        const child=scope(parent,'block',node);child.functionOwner=parent.functionOwner;
        scopes.set(node,child);predeclare(body,child);
        for(const statement of body || [])visit(statement,child);
    };
    const functionBody = (node,parent,{className=parent.className,method=false,constructor=false}={}) => {
        const child=scope(parent,method?'method':'function',node,className);
        child.functionOwner=child;child.constructor=constructor;
        scopes.set(node,child);functions.push(child);
        for(const name of node.params || [])declare(child,name,'parameter',node);
        if(method)declare(child,'this','receiver',node);
        const defaults=node.type==='FunctionExpression'?callableDefaultBody(node):{body:node.body,unsupported:[]};
        child.unsupported=defaults.unsupported;
        predeclare(defaults.body,child);
        for(const statement of defaults.body || [])visit(statement,child);
        return child;
    };
    const visit = (node,owner,write=false) => {
        if(!node || typeof node!=='object')return;
        if(Array.isArray(node)){for(const child of node)visit(child,owner);return;}
        if(!node.type)return;
        scopes.set(node,owner);
        switch(node.type) {
        case 'Identifier':note(node,owner,write);return;
        case 'Class':
            for(const field of node.fields || [])visit(field.init,owner);
            if(node.ctor)functionBody(node.ctor,owner,{className:node.name,method:true,constructor:true});
            for(const member of node.methods || [])functionBody(member,owner,{className:node.name,method:true});
            return;
        case 'FunctionDeclaration': case 'FunctionExpression':functionBody(node,owner);return;
        case 'Declaration':
            for(const decl of node.decls){visit(decl.init,owner);const binding=lookup(owner,decl.name);if(binding)binding.declared=true;}
            return;
        case 'Member':visit(node.object,owner);return;
        case 'Assignment':visit(node.left,owner,true);visit(node.right,owner);return;
        case 'Update':visit(node.argument,owner,true);return;
        case 'Block':block(node.body,owner,node);return;
        case 'If':
            visit(node.test,owner);
            block(node.consequent,owner,node.consequent);
            block(node.alternate,owner,node.alternate || []);return;
        case 'For': case 'ForOf': {
            const child=scope(owner,'loop',node);child.functionOwner=owner.functionOwner;scopes.set(node,child);
            if(node.type==='ForOf')declare(child,node.name,'loop',node);
            if(node.init?.type==='Declaration')for(const decl of node.init.decls)declare(child,decl.name,'loop',decl);
            predeclare(node.body,child);visit(node.init,child);visit(node.iterable,child);visit(node.test,child);visit(node.update,child);
            for(const statement of node.body || [])visit(statement,child);return;
        }
        case 'While':visit(node.test,owner);block(node.body,owner,node);return;
        default:
            for(const [key,value]of Object.entries(node)) {
                if(['originalBody','parameterDefaults','paramTypes','typeParameters','returnType','assertedType','calls'].includes(key))continue;
                if(value && typeof value==='object')visit(value,owner);
            }
        }
    };
    predeclare(program.body,global);
    for(const node of program.body)visit(node,global);
    const taken=new Set(bindings.map(binding=>binding.name));
    for(const binding of bindings) {
        if(binding.functionOwner===global){binding.cellName=binding.name;continue;}
        let name='__bwCallableCell_'+binding.id;
        while(taken.has(name))name+='_';
        taken.add(name);binding.cellName=name;
    }
    for(const fn of functions)fn.captureSpecifications=[...fn.captures].map(binding=>({
        name:binding.cellName,sourceName:binding.name,mode:binding.written?'cell':'value',binding
    }));
    return {global,scopes,references,functions,bindings};
}
