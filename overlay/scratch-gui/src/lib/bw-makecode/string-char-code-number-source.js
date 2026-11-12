import {analyseCallableBindings} from './callable-bindings.js';
import {inspectGeneratedHelperBindings,GENERATED_HELPER_PROFILES} from './generated-helper-recognition.js';
import {physicalUpdateSourceSnapshot} from './physical-update-source-snapshot.js';
import {staticSdkNamespaceReceivers} from './static-sdk-namespaces.js';
const callWeakHas=WeakSet.prototype.has,callWeakAdd=WeakSet.prototype.add,callApply=Reflect.apply;

// The selected base/pxt-core.d.ts declares charCodeAt(index:number):number.
// Genuine primitive String dispatch has a Number normal result; no finite
// value or particular code unit is inferred. This issuer supplies source/method closure only; the
// independent producer fixed point must still prove actual receiver/index
// writers. It supplies no String input, indexed presence or initialization.
// The data-only control binds these selected declaration/simulator bytes;
// original PXT/native execution remains a separate qualification obligation.
export const STRING_CHAR_CODE_DTS_SHA256='cd7089b1c68b1b331717e246b339963a4f14ab1011743bf897b67ca8419a9c58';
export const STRING_CHAR_CODE_SIM_SHA256='4976bc55c36d82d692bbbd0d6fe1d1435e8dd8c7dcff76e5aa28e02bf3baf826';

const freeze=Object.freeze,descriptor=Object.getOwnPropertyDescriptor,keys=Reflect.ownKeys;
const hasOwn=Object.hasOwn,isArray=Array.isArray;
const prototype=Object.getPrototypeOf,same=Object.is;
const realm=globalThis,realmAliases=[],realmRows=[];
const rememberRealm=object=>{
    for(let i=0;i<realmRows.length;i++)if(realmRows[i].object===object)return;
    const names=keys(object),fields=[];
    for(let i=0;i<names.length;i++)fields[i]=descriptor(object,names[i]);
    realmRows[realmRows.length]={object,parent:prototype(object),names,fields};
};
for(const name of ['globalThis','Object','Array','Reflect','Map','Set','WeakMap','WeakSet',
    'Number','String','Boolean','JSON','Symbol','Function','RegExp','Math','Error','TypeError',
    'SyntaxError','RangeError','parseInt','parseFloat','isNaN','isFinite']){
    const row=descriptor(realm,name);realmAliases[realmAliases.length]={name,row};
    if(name==='globalThis')continue;
    rememberRealm(row.value);
    const member=descriptor(row.value,'prototype');
    if(member&&hasOwn(member,'value'))rememberRealm(member.value);
}
for(const iterator of [[][Symbol.iterator](),new Map()[Symbol.iterator](),new Set()[Symbol.iterator](),''[Symbol.iterator]()]){
    for(let parent=prototype(iterator);parent;parent=prototype(parent))rememberRealm(parent);
}
const descriptorFields=['value','writable','get','set','enumerable','configurable'];
const sameDescriptor=(a,b)=>{
    if(!a||!b)return a===b;
    for(let i=0;i<descriptorFields.length;i++){
        const key=descriptorFields[i],present=hasOwn(a,key);
        if(present!==hasOwn(b,key)||present&&!same(a[key],b[key]))return false;
    }
    return true;
};
// Captured meta operations and plain loops only: a replaced every/map/iterator
// cannot certify its own realm. Include aliases, prototypes and iterator chains.
const realmCurrent=()=>{
    for(let i=0;i<realmAliases.length;i++){
        const row=realmAliases[i];if(!sameDescriptor(row.row,descriptor(realm,row.name)))return false;
    }
    for(let i=0;i<realmRows.length;i++){
        const row=realmRows[i],names=keys(row.object);
        if(prototype(row.object)!==row.parent||names.length!==row.names.length)return false;
        for(let j=0;j<names.length;j++)if(names[j]!==row.names[j]||!sameDescriptor(row.fields[j],descriptor(row.object,names[j])))return false;
    }
    return true;
};
const denied=()=>freeze({current:()=>false,isCall:()=>false});
const metadata=['paramTypes','returnType','assertedType','typeAssertions','typeParameters','functionKind',
    'parameterDefaults','optionalParams','ordinaryParameterDefaultNames','parameterDefaultPrologue','originalBody'];
const protectedNames=new Set(['String','Object','Array','Reflect','eval','Function','globalThis','global','window','self','arguments']);

// Deliberately closed source slice: only primitives/Arrays can enter storage,
// functions remain immutable direct declarations, and no authored callback or
// method/prototype replacement can run, including in unused/later bodies.
export function createStringCharCodeNumberSource(program){
 try{
  if(!realmCurrent())return denied();
  const snapshot=physicalUpdateSourceSnapshot(program);
  if(!snapshot||snapshot.opaque.some(value=>typeof value!=='symbol'))return denied();
  const syntax=inspectGeneratedHelperBindings(program,GENERATED_HELPER_PROFILES.ordinary);
  if(!syntax.isCurrent())return denied();
  const lexical=analyseCallableBindings(program),sdk=staticSdkNamespaceReceivers(program),calls=new WeakSet();
  const fail=()=>{throw false;};let budget=20000,live=true;
  const dense=value=>isArray(value)&&value.length<=10000&&keys(value).length===value.length+1&&
   Array.from({length:value.length},(_,i)=>hasOwn(value,String(i))).every(value=>value===true);
  const shape=(node,required,optional=[])=>!!node&&typeof node==='object'&&required.every(key=>descriptor(node,key))&&
   keys(node).every(key=>required.includes(key)||optional.includes(key)||key==='parenthesized'&&typeof node[key]==='boolean')&&
   (!hasOwn(node,'typeAssertions')||isArray(node.typeAssertions)&&node.typeAssertions.every(value=>typeof value==='string'));
  const name=value=>typeof value==='string'&&/^[A-Za-z_$][\w$]*$/.test(value);
  const numericIndex=node=>{
   if(node?.type==='Number'&&typeof node.value==='string'&&Number.isFinite(Number(node.value)))return Number(node.value);
   if(node?.type==='Binary'&&['+','-'].includes(node.op)){
    const a=numericIndex(node.left),b=numericIndex(node.right);if(a===null||b===null)return null;return node.op==='+'?a+b:a-b;
   }
   return null;
  };
  const functionShape=fn=>{
   if(!shape(fn,['type','name','params','body'],metadata)||fn.type!=='FunctionDeclaration'||!name(fn.name)||
    !isArray(fn.params)||fn.params.length>16||new Set(fn.params).size!==fn.params.length||!fn.params.every(name)||!dense(fn.body)||
    Array.from({length:fn.params.length},(_,i)=>hasOwn(fn.params,String(i))).some(value=>!value)||
    keys(fn.params).some(key=>key!=='length'&&!/^(?:0|[1-9][0-9]*)$/.test(key)&&!['parameterDefaults','optionalParams','parameterProperties'].includes(key)))return false;
   for(const row of [fn,fn.params])for(const key of ['parameterDefaults','optionalParams','parameterProperties','ordinaryParameterDefaultNames','typeParameters','originalBody'])
    if(row[key]!==undefined&&(!isArray(row[key])||row[key].length))return false;
   return syntax.root(fn)&&syntax.calls(fn,[fn.params.length],new Set([fn]))!==null;
  };
  const expression=(node,parent=null)=>{
   if(--budget<0||!node||typeof node!=='object')fail();
   if(['Null','Undefined'].includes(node.type)){if(!shape(node,['type'],metadata))fail();return;}
   if(['Number','String','Boolean'].includes(node.type)){
    if(!shape(node,['type','value'],metadata)||
     (node.type==='Number'?typeof node.value!=='string'||!Number.isFinite(Number(node.value)):
      typeof node.value!==(node.type==='String'?'string':'boolean')))fail();return;
   }
   if(node.type==='Identifier'){
    if(!shape(node,['type','name'],metadata)||protectedNames.has(node.name))fail();
    const binding=lexical.references.get(node);
    if(!binding){if(node.name==='undefined'&&!lexical.global.names.has('undefined'))return;fail();}
    if(binding.kind==='function'&&!(parent?.type==='Call'&&parent.callee===node&&functionShape(binding.node)))fail();
    if(!['function','global','local','parameter'].includes(binding.kind))fail();return;
   }
   if(node.type==='Array'){
    if(!shape(node,['type','items'],metadata)||!dense(node.items))fail();node.items.forEach(item=>expression(item,node));return;
   }
   if(node.type==='Unary'){
    if(!shape(node,['type','op','argument'],metadata)||!['!','+','-','~','typeof','void'].includes(node.op))fail();expression(node.argument,node);return;
   }
   if(node.type==='Binary'){
    const marker=hasOwn(node,'nativeArrayDomainCall');
    if(!shape(node,['type','op','left','right'],[...metadata,...(marker?['nativeArrayDomainCall']:[])])||
     marker&&typeof node.nativeArrayDomainCall!=='symbol'||
     !['+','-','*','/','%','**','===','!==','==','!=','<','<=','>','>=','&&','||','??'].includes(node.op))fail();
    expression(node.left,node);expression(node.right,node);return;
   }
   if(node.type==='Conditional'){
    if(!shape(node,['type','test','consequent','alternate'],metadata))fail();
    for(const key of ['test','consequent','alternate'])expression(node[key],node);return;
   }
   if(node.type==='Index'){
    if(!shape(node,['type','object','index'],metadata))fail();expression(node.object,node);expression(node.index,node);return;
   }
   if(node.type==='Member'){
    if(!shape(node,['type','object','name'],metadata)||node.name!=='length')fail();expression(node.object,node);return;
   }
   if(node.type==='Assignment'){
    if(!shape(node,['type','op','left','right'],metadata)||!['=','+='].includes(node.op))fail();
    if(node.left?.type==='Identifier')expression(node.left,node);
    else if(node.op==='='&&node.left?.type==='Index'){
     const index=numericIndex(node.left.index);
     if(index===null||!Number.isSafeInteger(index)||index<0||index>=4096)fail();expression(node.left,node);
    }else fail();
    expression(node.right,node);return;
   }
   if(node.type==='Call'){
    if(!shape(node,['type','callee','args'],metadata)||!dense(node.args))fail();
    const callee=node.callee;
    if(callee?.type==='Identifier'){
     const binding=lexical.references.get(callee);
     if(binding?.kind!=='function'||binding.scope!==lexical.global||!functionShape(binding.node)||node.args.length!==binding.node.params.length)fail();
     expression(callee,node);node.args.forEach(arg=>expression(arg,node));return;
    }
    if(callee?.type!=='Member'||!shape(callee,['type','object','name'],metadata))fail();
    if(callee.object?.type==='Identifier'&&callee.object.name==='game'&&callee.name==='askForString'){
     if(!sdk.has(callee)||node.args.length!==1||node.args[0]?.type!=='String')fail();
     node.args.forEach(arg=>expression(arg,node));return;
    }
    if(!['push','join','charCodeAt'].includes(callee.name)||
     (callee.name==='push'||callee.name==='charCodeAt')&&node.args.length!==1||callee.name==='join'&&node.args.length>1)fail();
    expression(callee.object,callee);node.args.forEach(arg=>expression(arg,node));
    if(callee.name==='charCodeAt')callApply(callWeakAdd,calls,[node]);return;
   }
   fail();
  };
  const statement=node=>{
   if(--budget<0||!node||typeof node!=='object')fail();
   if(node.type==='Declaration'){
    if(!shape(node,['type','kind','decls'],metadata)||!['let','const'].includes(node.kind)||!dense(node.decls))fail();
    for(const decl of node.decls){
     if(!shape(decl,['name','init'],['typeName','isArray'])||!name(decl.name)||
      decl.typeName!=null&&typeof decl.typeName!=='string'||decl.isArray!==undefined&&typeof decl.isArray!=='boolean')fail();
     if(decl.init)expression(decl.init,decl);
    }return;
   }
   if(node.type==='FunctionDeclaration'){
    if(!functionShape(node))fail();node.body.forEach(statement);return;
   }
   if(node.type==='ExpressionStatement'){
    if(!shape(node,['type','expr'],metadata))fail();expression(node.expr,node);return;
   }
   if(node.type==='Return'){
    if(!shape(node,['type','value'],metadata))fail();if(node.value)expression(node.value,node);return;
   }
   if(node.type==='If'){
    if(!shape(node,['type','test','consequent','alternate'],metadata)||!dense(node.consequent)||node.alternate!==null&&!dense(node.alternate))fail();
    expression(node.test,node);node.consequent.forEach(statement);(node.alternate||[]).forEach(statement);return;
   }
   fail();
  };
  if(!shape(program,['type','body'])||program.type!=='Program'||!dense(program.body))return denied();
  program.body.forEach(statement);
  const current=()=>{
   if(!live)return false;
   try{if(!realmCurrent()||!syntax.isCurrent()||!snapshot.current()||!realmCurrent())live=false;}catch{live=false;}
   return live;
  };
  if(!current())return denied();
  return freeze({current,isCall:node=>current()&&callApply(callWeakHas,calls,[node])});
 }catch{return denied();}
}
