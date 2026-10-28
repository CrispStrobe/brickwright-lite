import {analyseCallableBindings} from './callable-bindings.js';
import {physicalUpdateSourceSnapshot} from './physical-update-source-snapshot.js';

const metadata=new Set(['originalBody','parameterDefaults','paramTypes','typeParameters','returnType','assertedType']);
const denied=Object.freeze({discount:()=>false,current:()=>true});
const ownKeys=Reflect.ownKeys,descriptor=Object.getOwnPropertyDescriptor,prototype=Object.getPrototypeOf,same=Object.is;
const realm=globalThis,weakHas=WeakSet.prototype.has,apply=Reflect.apply;
const aliases=['Object','Array','Map','Set','WeakMap','WeakSet','Reflect','JSON','String','Number','Function'];
const aliasRows=aliases.map(name=>[name,descriptor(realm,name)]);
const objects=[Object,Array,Map,Set,WeakMap,WeakSet,Reflect,JSON,String,Number,Function,
    Object.prototype,Array.prototype,Map.prototype,Set.prototype,WeakMap.prototype,WeakSet.prototype,
    String.prototype,Number.prototype,Function.prototype,prototype([][Symbol.iterator]()),
    prototype(new Map()[Symbol.iterator]()),prototype(new Set()[Symbol.iterator]())];
const rows=objects.map(object=>({object,parent:prototype(object),fields:ownKeys(object).map(key=>[key,descriptor(object,key)])}));
const sameDescriptor=(a,b)=>!!a&&!!b&&a.enumerable===b.enumerable&&a.configurable===b.configurable&&
    a.writable===b.writable&&same(a.value,b.value)&&same(a.get,b.get)&&same(a.set,b.set);
const ambientCurrent=()=>{
    for(let i=0;i<aliasRows.length;i++)if(!sameDescriptor(descriptor(realm,aliasRows[i][0]),aliasRows[i][1]))return false;
    for(let i=0;i<rows.length;i++){
        const row=rows[i],names=ownKeys(row.object);
        if(prototype(row.object)!==row.parent||names.length!==row.fields.length)return false;
        for(let j=0;j<names.length;j++)if(names[j]!==row.fields[j][0]||!sameDescriptor(descriptor(row.object,names[j]),row.fields[j][1]))return false;
    }
    return true;
};

// A declaration reset followed immediately by a fresh empty Array assignment
// cannot be observed through an uncaptured local. This removes only that reset
// from the all-writer domain; it grants no initialization or indexed-read fact.
export function localArrayDeclarationResetSource(program) {
    try{
        if(!ambientCurrent())return denied;
        const snapshot=physicalUpdateSourceSnapshot(program);
        if(!snapshot||snapshot.opaque.some(value=>typeof value==='function'))return denied;
        const nodes=[],lists=[],seen=new WeakSet(),parents=new WeakMap();let unsafe=false;
        const visit=(value,parent=null)=>{
            if(!value||typeof value!=='object')return;
            if(seen.has(value)){unsafe=true;return;}seen.add(value);parents.set(value,parent);
            if(value.parameterDefaults?.length||value.params?.parameterDefaults?.length)unsafe=true;
            if(Array.isArray(value)){lists.push(value);for(const child of value)visit(child,value);return;}
            nodes.push(value);
            if(value.type==='Unknown'||value.type==='Namespace'||value.kind==='var')unsafe=true;
            for(const [key,child]of Object.entries(value))if(!metadata.has(key))visit(child,value);
        };visit(program);
        if(unsafe)return denied;
        const lexical=analyseCallableBindings(program),discounted=new WeakSet();
        const lookup=(scope,name)=>{for(let s=scope;s;s=s.parent)if(s.names.has(name))return s.names.get(name);return null;};
        const declarations=new Map();
        for(const node of nodes)if(node.type==='Declaration')for(const decl of node.decls||[]){
            const binding=lookup(lexical.scopes.get(node),decl.name);
            declarations.set(binding,(declarations.get(binding)||0)+1);
        }
        for(const list of lists)for(let i=0;i+1<list.length;i++){
            const statement=list[i],next=list[i+1];
            if(statement?.type!=='Declaration'||statement.kind!=='let'||statement.decls?.length!==1)continue;
            const decl=statement.decls[0],binding=lookup(lexical.scopes.get(statement),decl.name);
            if(!['Null','Undefined'].includes(decl.init?.type)||!binding||binding.node!==decl||
                binding.kind!=='local'||declarations.get(binding)!==1||
                binding.functionOwner?.kind!=='function'||binding.functionOwner.className)continue;
            const assignment=next?.type==='ExpressionStatement'&&next.expr;
            if(assignment?.type!=='Assignment'||assignment.op!=='='||assignment.left?.type!=='Identifier'||
                lexical.references.get(assignment.left)!==binding||assignment.right?.type!=='Array'||assignment.right.items?.length!==0)continue;
            if(lexical.functions.some(fn=>fn!==binding.functionOwner&&fn.captures.has(binding)))continue;
            // The parser's defaults are refused above, including non-enumerable
            // params metadata. Every remaining indexed reference must resolve.
            if(nodes.some(node=>{
                if(node.type!=='Identifier'||lexical.references.get(node)!==binding)return false;
                if(lexical.scopes.get(node)?.functionOwner!==binding.functionOwner)return true;
                // Class field initializers inherit the enclosing lexical
                // owner in the callable index but may run on a later `new`.
                for(let owner=parents.get(node);owner;owner=parents.get(owner))if(owner.type==='Class')return true;
                return false;
            }))continue;
            discounted.add(decl);
        }
        if(!ambientCurrent()||!snapshot.current())return denied;
        let live=true;
        const current=()=>{
            if(!live)return false;
            try{if(!ambientCurrent()||!snapshot.current())live=false;}catch{live=false;}
            return live;
        };
        return Object.freeze({discount:decl=>apply(weakHas,discounted,[decl])&&current(),current});
    }catch{return denied;}
}
