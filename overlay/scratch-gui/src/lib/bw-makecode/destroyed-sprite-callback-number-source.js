import {analyseSourceValueProducers} from './source-value-producers.js';
import {localArrayDeclarationResetSource} from './local-array-declaration-reset-source.js';
import {analyseCallableBindings} from './callable-bindings.js';
import {physicalUpdateSourceSnapshot} from './physical-update-source-snapshot.js';
import {SDK_SPRITE_CLASS_NODES} from './sdk-sprite-class-descriptors.js';
import {parseExactImgLiteral} from './arcade-assets.js';

// Selected original getter: Fx.toFloat(Fx.add(this._x,
// Fx.div(this._width,Fx.twoFx8))). See ARCADE-CLASS-LINEAGE.md and the
// original/VM SDK ABI controls. This is a NORMAL-result contract, never a
// cached coordinate, callback invocation, initialized variable or Sprite fact.
export const DESTROYED_SPRITE_X_SOURCE_SHA256='c452013b5ddea08284a6d9e6ee34e86fdc59df2dead6f34cf12d01a2dda2d4da';
const descriptor=Object.getOwnPropertyDescriptor,keys=Reflect.ownKeys,proto=Object.getPrototypeOf,same=Object.is;
const realm=globalThis,globalNames=['Object','Array','Map','Set','WeakMap','WeakSet','Reflect','JSON','Number','String','Function','Math'];
const globalRows=globalNames.map(name=>[name,descriptor(realm,name)]);
const ambient=[Object,Object.prototype,Array,Array.prototype,Map,Map.prototype,Set,Set.prototype,WeakMap,WeakMap.prototype,WeakSet,WeakSet.prototype,Reflect,JSON,Number,Number.prototype,String,String.prototype,Function,Function.prototype,Math,proto([][Symbol.iterator]()),proto(new Set()[Symbol.iterator]()),proto(new Map()[Symbol.iterator]())].map(object=>({object,parent:proto(object),fields:keys(object).map(key=>[key,descriptor(object,key)])}));
const owns=Object.hasOwn;
const descriptorFields=['enumerable','configurable','writable','value','get','set'];
const equalDescriptor=(a,b)=>{
 if(!a||!b)return false;
 for(let i=0;i<descriptorFields.length;i++){
  const key=descriptorFields[i],left=owns(a,key),right=owns(b,key);
  if(left!==right||left&&!same(a[key],b[key]))return false;
 }
 return true;
};
// Check the captured realm without calling the very Array methods being
// checked. Descriptor comparison never reads absent inherited fields.
const realmCurrent=()=>{
 for(let i=0;i<globalRows.length;i++)if(!equalDescriptor(descriptor(realm,globalRows[i][0]),globalRows[i][1]))return false;
 for(let i=0;i<ambient.length;i++){
  const row=ambient[i],names=keys(row.object);
  if(proto(row.object)!==row.parent||names.length!==row.fields.length)return false;
  for(let j=0;j<names.length;j++)if(names[j]!==row.fields[j][0]||!equalDescriptor(descriptor(row.object,names[j]),row.fields[j][1]))return false;
 }
 return true;
};
const sdkSnapshot=physicalUpdateSourceSnapshot(SDK_SPRITE_CLASS_NODES);
const metadata=new Set(['originalBody','parameterDefaults','paramTypes','typeParameters','returnType','assertedType','optionalParams','parameterProperties','calls']);
const syntax=new Set(['Program','Namespace','Declaration','ExpressionStatement','FunctionExpression','FunctionDeclaration','Return','Number','String','Boolean','Null','Undefined','Identifier','Template','Binary','Unary','Assignment','Update','Call','Member','Index','Parenthesized','Array','While']);
const roots=new Set(['sprites','SpriteKind','img','pause']);
const denied=reason=>Object.freeze({has:()=>false,current:()=>true,reason});

export function createDestroyedSpriteCallbackNumberSource(program){
 try{
  if(!realmCurrent()||!sdkSnapshot?.current())return denied('analysis or SDK descriptor changed');
  const snapshot=physicalUpdateSourceSnapshot(program);
  if(!snapshot||snapshot.opaque.some(value=>typeof value!=='symbol'))return denied('non-data source');
  const nodes=[],parents=new WeakMap(),seen=new Set();let invalid=false;
  const visit=(value,parent=null)=>{
   if(!value||typeof value!=='object')return;if(seen.has(value)){invalid=true;return;}seen.add(value);parents.set(value,parent);
   if(Array.isArray(value)){for(let i=0;i<value.length;i++){if(!Object.hasOwn(value,i)){invalid=true;continue;}visit(value[i],value);}return;}
   nodes.push(value);for(const key of keys(value))if(!metadata.has(key))visit(descriptor(value,key).value,value);
  };visit(program);
  if(invalid||program.type!=='Program'||nodes.some(n=>n.type&&!syntax.has(n.type)||n.optional||n.computed||n.callee?.optional||n.isNew||n.constructorCall||n.typeArguments?.length||n.kind==='var'||n.unsupported?.length))return denied('unclosed syntax');
  for(const n of nodes){if(keys(n).some(key=>typeof descriptor(n,key).value==='symbol'&&key!=='nativeArrayDomainCall'))return denied('symbol structural field');if(n.type==='Binary'&&!['+','-','*','/','%','<','>','<=','>=','===','!==','==','!='].includes(n.op)||n.type==='Unary'&&!['+','-','!','~'].includes(n.op)||n.type==='Assignment'&&!['=','+=','-=','*=','/=','%='].includes(n.op)||n.type==='Update'&&!['++','--'].includes(n.op))return denied('unknown operator');if(n.type==='Number'&&(!['number','string'].includes(typeof n.value)||String(n.value).trim()===''||Number.isNaN(Number(n.value)))||n.type==='String'&&typeof n.value!=='string'||n.type==='Boolean'&&typeof n.value!=='boolean')return denied('literal shape');}
  const bindings=analyseCallableBindings(program),ref=n=>bindings.references.get(n);
  const scopeAt=n=>{for(let p=n;p;p=parents.get(p)){const s=bindings.scopes.get(p);if(s)return s;}return bindings.global;};
  const lookup=(n,name)=>{for(let s=scopeAt(n);s;s=s.parent)if(s.names.has(name))return s.names.get(name);return null;};
  const namespaces=nodes.filter(n=>n.type==='Namespace');
  const custom=new Set(),flatSlots=new Map();
  const forbiddenKinds=new Set(['Player','Projectile','Food','Enemy','create','nextKind','_nextKind','constructor','prototype','__proto__']);
  for(const ns of namespaces){
   if(ns.name!=='SpriteKind'||!program.body.includes(ns))return denied('foreign namespace');
   for(const st of ns.body||[]){if(st.type!=='Declaration'||!['const','let'].includes(st.kind)||!st.exported)return denied('noncanonical kind declaration');
    for(const d of st.decls){
     if(custom.has(d.name)||flatSlots.has(d.name)||forbiddenKinds.has(d.name))return denied('reserved or duplicate kind slot');
     if(st.kind==='let'){if(st.decls.length!==1||d.init!=null)return denied('kind slot initializer');flatSlots.set(d.name,d);continue;}
     const c=d.init;if(c?.type!=='Call'||c.callee?.object?.name!=='SpriteKind'||c.callee.name!=='create'||c.args.length)return denied('noncanonical kind factory');custom.add(d.name);
    }
   }
  }
  if(namespaces.length>1||flatSlots.size>1)return denied('ambiguous kind namespace');
  const namespaceBinding=bindings.global.names.get('SpriteKind');
  const canonical=(node,name)=>node?.type==='Identifier'&&node.name===name&&(!lookup(node,name)||name==='SpriteKind'&&lookup(node,name)===namespaceBinding&&namespaces.length===1);
  const sdkCall=(n,name)=>n?.type==='Call'&&n.callee?.type==='Member'&&n.callee.name===name&&canonical(n.callee.object,'sprites');
  const rootRank=node=>{for(let n=node;n;n=parents.get(n))if(parents.get(n)===program.body)return program.body.indexOf(n);return -1;};
  const kindInput=node=>{
   const args=parents.get(node),call=Array.isArray(args)?parents.get(args):null;if(call?.type!=='Call'||call.args!==args)return false;
   return sdkCall(call,'create')&&call.args[1]===node||['onDestroyed','allOfKind','destroyAllSpritesOfKind'].some(name=>sdkCall(call,name)&&call.args[0]===node);
  };
  const flatAliases=new Map(),flatSlotStores=new WeakSet(),flatCreates=new WeakSet(),flatAllowed=new WeakSet();
  for(const [slot,decl]of flatSlots){
   const matches=[];
   for(let i=0;i+2<program.body.length;i++){
    const a=program.body[i]?.expr,b=program.body[i+1]?.expr,c=program.body[i+2]?.expr;
    if([i,i+1,i+2].some(at=>program.body[at]?.type!=='ExpressionStatement')||a?.type!=='Assignment'||a.op!=='='||a.left?.type!=='Identifier'||a.right?.type!=='Undefined'||
       b?.type!=='Assignment'||b.op!=='='||b.left?.type!=='Identifier'||ref(a.left)!==ref(b.left)||
       b.right?.type!=='Call'||b.right.callee?.type!=='Member'||!canonical(b.right.callee.object,'SpriteKind')||b.right.callee.name!=='create'||b.right.args.length||
       c?.type!=='Assignment'||c.op!=='='||c.left?.type!=='Member'||!canonical(c.left.object,'SpriteKind')||c.left.name!==slot||c.right?.type!=='Identifier'||ref(c.right)!==ref(a.left))continue;
    const binding=ref(a.left),declarations=nodes.filter(n=>n.type==='Declaration').flatMap(st=>(st.decls||[]).filter(d=>lookup(st,d.name)===binding).map(d=>({st,d})));
    if(!binding||binding.scope!==bindings.global||declarations.length!==1||!program.body.includes(declarations[0].st)||declarations[0].st.kind!=='let'||declarations[0].st.decls.length!==1||declarations[0].d!==binding.node||declarations[0].d.init!=null||rootRank(declarations[0].st)>=i||rootRank(decl)>=i)continue;
    matches.push({binding,a,b,c,end:i+2});
   }
   if(matches.length!==1)return denied('flattened kind triad');
   const receipt=matches[0];flatAliases.set(receipt.binding,receipt);flatSlotStores.add(receipt.c);flatCreates.add(receipt.b.right);
   flatAllowed.add(receipt.a.left);flatAllowed.add(receipt.b.left);flatAllowed.add(receipt.c.right);
   for(const n of nodes){
    if(n.type==='Assignment'&&n.left?.type==='Identifier'&&ref(n.left)===receipt.binding&&n!==receipt.a&&n!==receipt.b||n.type==='Update'&&n.argument?.type==='Identifier'&&ref(n.argument)===receipt.binding)return denied('extra kind alias writer');
    if(n.type==='Member'&&canonical(n.object,'SpriteKind')&&n.name===slot){const parent=parents.get(n);if(parent?.type==='Assignment'&&parent.left===n&&parent!==receipt.c||parent?.type==='Update')return denied('extra kind slot writer');}
   }
  }
  const flatReadReady=(node,receipt)=>{
   if(rootRank(node)<=receipt.end||!kindInput(node))return false;
   for(let owner=parents.get(node);owner;owner=parents.get(owner)){
    if(owner.type==='FunctionDeclaration')return false;
    if(owner.type==='FunctionExpression'){const args=parents.get(owner),call=Array.isArray(args)?parents.get(args):null;if(!sdkCall(call,'onDestroyed')||call.args!==args||call.args[1]!==owner)return false;}
   }
   return true;
  };
  for(const node of nodes){
   if(node.type==='Identifier'&&flatAliases.has(ref(node))){const r=flatAliases.get(ref(node));if(!flatAllowed.has(node)&&!flatReadReady(node,r))return denied('kind alias read outside input frontier');}
   if(node.type==='Member'&&canonical(node.object,'SpriteKind')&&flatSlots.has(node.name)){
    const parent=parents.get(node),r=[...flatAliases.values()][0];if(!(parent?.type==='Assignment'&&parent.left===node&&flatSlotStores.has(parent))&&!flatReadReady(node,r))return denied('kind slot read outside input frontier');
   }
  }
  // This predicate is only an SDK kind INPUT receipt. It never joins the
  // scalar primitive producer, supplies a numeric value, or initializes a cell.
  const kind=n=>n?.type==='Identifier'&&flatAliases.has(ref(n))&&flatReadReady(n,flatAliases.get(ref(n)))||
   n?.type==='Member'&&canonical(n.object,'SpriteKind')&&(['Player','Projectile','Food','Enemy'].includes(n.name)||custom.has(n.name)||flatSlots.has(n.name)&&flatReadReady(n,[...flatAliases.values()][0]));
  const shape=fn=>fn.exported!==true&&Array.isArray(fn.body)&&Array.isArray(fn.params)&&fn.params.every(name=>typeof name==='string')&&fn.params.length===1&&new Set(fn.params).size===1&&[fn,fn.params].every(value=>!Object.hasOwn(value,'restParam')&&!['async','isAsync','generator','isGenerator'].some(k=>value[k])&&['parameterDefaults','optionalParams','typeParameters','genericParams','parameterProperties'].every(k=>value[k]===undefined||Array.isArray(value[k])&&!value[k].length)&&!Object.keys(value.paramDefaults||{}).length);
  const closedShape=(fn,count)=>fn.exported!==true&&Array.isArray(fn.body)&&Array.isArray(fn.params)&&fn.params.length===count&&fn.params.every(name=>typeof name==='string')&&new Set(fn.params).size===count&&[fn,fn.params].every(value=>!Object.hasOwn(value,'restParam')&&!['async','isAsync','generator','isGenerator'].some(k=>value[k])&&['parameterDefaults','optionalParams','typeParameters','genericParams','parameterProperties'].every(k=>value[k]===undefined||Array.isArray(value[k])&&!value[k].length)&&!Object.keys(value.paramDefaults||{}).length);
  const ordinary=new Map(),ordinaryCalls=new Set(),edges=new Map(),comparisons=new Map(),comparisonExpressions=new WeakSet(),unaries=new Map(),unaryExpressions=new WeakSet();
  for(const fn of nodes.filter(n=>n.type==='FunctionDeclaration')){
   const b=bindings.global.names.get(fn.name);if(!program.body.includes(fn)||!b||b.node!==fn||b.written)return denied('ordinary declaration identity');
   if(!closedShape(fn,0)){
    const expr=fn.body?.[0]?.value,scope=bindings.scopes.get(fn);
    if(fn.body?.length!==1||fn.body[0].type!=='Return')return denied('ordinary pure body shape');
    const negativeOne=n=>n?.type==='Number'&&(n.value===-1||n.value==='-1')||n?.type==='Unary'&&n.op==='-'&&n.argument?.type==='Number'&&(n.argument.value===1||n.argument.value==='1');
    const directUnary=expr?.type==='Unary'&&['+','-'].includes(expr.op)&&expr.argument?.type==='Identifier'&&ref(expr.argument)===scope?.names.get(fn.params[0]);
    const multipliedMinus=expr?.type==='Binary'&&expr.op==='*'&&negativeOne(expr.left)&&expr.right?.type==='Identifier'&&ref(expr.right)===scope?.names.get(fn.params[0]);
    if(closedShape(fn,1)&&(directUnary||multipliedMinus)){
     // Only primitive actual arguments enter this profile. For those inputs,
     // canonical -1 * formal has the same NORMAL conversion/sign result as
     // unary minus; its literal left operand has no source effect. BigInt and
     // object coercion are excluded by the unchanged complete caller census.
     unaries.set(b,{fn,expr,equivalentUnaryOp:multipliedMinus?'-':expr.op});unaryExpressions.add(expr);
    }else{
     if(!closedShape(fn,2)||expr?.type!=='Binary'||!['===','!==','<','<=','>','>='].includes(expr.op)||
        expr.left?.type!=='Identifier'||expr.right?.type!=='Identifier'||ref(expr.left)!==scope?.names.get(fn.params[0])||ref(expr.right)!==scope?.names.get(fn.params[1]))return denied('ordinary comparison shape');
     comparisons.set(b,{fn,expr,relational:!['===','!=='].includes(expr.op)});comparisonExpressions.add(expr);
    }
   }
   ordinary.set(b,fn);edges.set(fn,new Set());
  }
  const functionOwner=node=>{for(let p=parents.get(node);p;p=parents.get(p))if(['FunctionDeclaration','FunctionExpression'].includes(p.type))return p;return null;};
  for(const n of nodes)if(n.type==='Identifier'&&ordinary.has(ref(n))){
   const call=parents.get(n),owner=functionOwner(n),comparison=comparisons.get(ref(n)),unary=unaries.get(ref(n));
   if(call?.type!=='Call'||call.callee!==n||call.args?.length!==(comparison?2:unary?1:0)||owner?.type==='FunctionExpression'&&!comparison&&!unary)return denied('ordinary callable escape');
   ordinaryCalls.add(call);if(owner?.type==='FunctionDeclaration')edges.get(owner)?.add(ordinary.get(ref(n)));
  }
  for(const fn of ordinary.values())if(![...ordinaryCalls].some(c=>ref(c.callee)===bindings.global.names.get(fn.name)))return denied('uncalled ordinary body');
  const cycle=(fn,active=new Set())=>active.has(fn)||[...edges.get(fn)||[]].some(next=>cycle(next,new Set([...active,fn])));
  if([...ordinary.values()].some(fn=>cycle(fn)))return denied('ordinary recursion');
  const resets=localArrayDeclarationResetSource(program);
  const registrations=nodes.filter(n=>sdkCall(n,'onDestroyed')),entries=new Map(),selected=new WeakSet();
  if(!registrations.length)return denied('no destroyed callback');
  for(const call of registrations){const fn=call.args[1];if(call.args.length!==2||!kind(call.args[0])||fn?.type!=='FunctionExpression'||!shape(fn))return denied('callback entry shape');
   const binding=bindings.scopes.get(fn)?.names.get(fn.params[0]);if(!binding||entries.has(binding))return denied('callback binding');entries.set(binding,fn);
  }
  const aliases=new Map(),bridges=new WeakSet();
  for(const [formal,fn]of entries){
   // Retain every leading declaration's real effect. Only one-local literal
   // null declarations may precede the first executable bridge statement.
   const prefix=[];let bridgeIndex=0;
   while(bridgeIndex<fn.body.length){const st=fn.body[bridgeIndex];if(st?.type!=='Declaration'||st.kind!=='let'||st.decls?.length!==1||st.decls[0].init?.type!=='Null')break;prefix.push(st);bridgeIndex++;}
   const statement=fn.body[bridgeIndex],a=statement?.expr;
   if(!prefix.length||statement?.type!=='ExpressionStatement'||a?.type!=='Assignment'||a.op!=='='||a.left?.type!=='Identifier'||a.right?.type!=='Identifier'||ref(a.right)!==formal)continue;
   const b=ref(a.left),declarations=prefix.filter(st=>st.decls[0]===b?.node);
   if(!b||declarations.length!==1||b.scope!==bindings.scopes.get(fn))return denied('alias declaration identity');
   aliases.set(b,{fn,formal,bridge:a,bridgeIndex,declaration:declarations[0]});bridges.add(a);
  }
  const implicitUndefined=Object.freeze({type:'Undefined'});
  const writers=new Map(),addWriter=(b,v)=>{if(!b){invalid=true;return;}if(!writers.has(b))writers.set(b,[]);writers.get(b).push(v);};
  for(const n of nodes){
   if(n.type==='Declaration')for(const d of n.decls){if(!['let','const'].includes(n.kind)||!Array.isArray(n.decls)||typeof d.name!=='string'||!/^[$A-Z_a-z][$\w]*$/.test(d.name)||Object.keys(d).some(k=>!['name','init','isArray','typeName','whenUsed'].includes(k))||d.isArray!==undefined&&typeof d.isArray!=='boolean'||d.typeName!==undefined&&typeof d.typeName!=='string')return denied('declaration shape');let inKind=false;for(let p=n;p;p=parents.get(p))if(p.type==='Namespace'){inKind=true;break;}if(inKind)continue;const b=scopeAt(n).names.get(d.name);if(roots.has(d.name)||['Fx','Fx8','Sprite','Image','Object','Array','Math','Reflect','eval','Function','globalThis','arguments'].includes(d.name))return denied('protected binding');if(!d.init)addWriter(b,implicitUndefined);else if(!resets.discount(d))addWriter(b,d.init);}
   if(n.type==='Assignment'&&n.left?.type==='Identifier')addWriter(ref(n.left),['=','+=','-=','*=','/=','%='].includes(n.op)?n.right:null);
   if(n.type==='Update'&&n.argument?.type==='Identifier')addWriter(ref(n.argument),null);
  }
  let independentGraph=null,graphUsed=false,graphViewSnapshot=null;
  const graphNodes=new WeakMap();
  const graph=()=>{
   if(independentGraph)return independentGraph;
   // This view retains the ORIGINAL unary operation at each proven direct
   // call. It neither substitutes a constant nor lends a shared formal's
   // joined domain to a different call. The original complete effect census
   // below still requires every actual argument to be primitive.
   const omitted=new Set();for(const profile of unaries.values())omitted.add(profile.fn);
   const clone=value=>{
    if(!value||typeof value!=='object')return value;
    if(graphNodes.has(value))return graphNodes.get(value);
    const parent=proto(value);if(parent!==Object.prototype&&parent!==Array.prototype&&parent!==null)throw new Error('opaque graph source');
    const call=value.type==='Call'&&ordinaryCalls.has(value)&&unaries.get(ref(value.callee));
    if(call){
     // The consumed callee/argument envelope must contain no hidden data or
     // expression that would disappear when the exact direct call is inlined.
     for(const key of keys(value.callee))if(!['type','name'].includes(key))throw new Error('unary callee envelope');
     for(const key of keys(value.args))if(key!=='0'&&key!=='length')throw new Error('unary argument envelope');
     if(Object.hasOwn(value,'op')||Object.hasOwn(value,'argument'))throw new Error('unary operation collision');
    }
    const out=Array.isArray(value)?[]:Object.create(parent);graphNodes.set(value,out);
    let index=0;
    for(const key of keys(value)){
     const d=descriptor(value,key);if(typeof key!=='string'||!d||!Object.hasOwn(d,'value'))throw new Error('non-data graph source');
     if(Array.isArray(value)&&key==='length')continue;
     if(value===program.body&&/^(0|[1-9][0-9]*)$/.test(key)){
      if(omitted.has(d.value))continue;
      Object.defineProperty(out,String(index++),{...d,value:clone(d.value)});continue;
     }
     if(call&&(key==='callee'||key==='args'))continue;
     Object.defineProperty(out,key,{...d,value:call&&key==='type'?'Unary':clone(d.value)});
    }
    if(Array.isArray(value)){const d=descriptor(value,'length');Object.defineProperty(out,'length',{...d,value:value===program.body?index:d.value});}
    if(call){Object.defineProperty(out,'op',{value:call.equivalentUnaryOp,writable:true,enumerable:true,configurable:true});Object.defineProperty(out,'argument',{value:clone(value.args[0]),writable:true,enumerable:true,configurable:true});}
    return out;
   };
   const view=clone(program);graphViewSnapshot=physicalUpdateSourceSnapshot(view);if(!graphViewSnapshot)throw new Error('invalid operation graph');
   independentGraph=analyseSourceValueProducers(view,{ordinaryPrimitiveSdkNumbers:false,arrayValues:true,parenthesized:true,unboundIsOpaque:true,declaredLocalUndefined:true,initializationEntries:true});
   return independentGraph;
  };
  const graphTypes=node=>{const analysis=graph(),privateNode=graphNodes.get(node);return privateNode?analysis.typesAt(privateNode):new Set();};
  const graphPrimitive=n=>{
   if(n?.type!=='Identifier'||flatAliases.has(ref(n)))return false;
   const types=graphTypes(n);if(!types.size||[...types].some(type=>!['Number','String','Boolean','Null','Undefined'].includes(type)))return false;graphUsed=true;return true;
  };
  const numericIndex=n=>{const types=graphTypes(n);if(types.size!==1||!types.has('Number'))return false;graphUsed=true;return true;};
  const primitive=(n,active=new Set())=>{
   if(!n)return false;if(selected.has(n))return true;if(['Number','String','Boolean','Null','Undefined'].includes(n.type))return true;
   if(n.type==='Parenthesized')return primitive(n.expression,active);
   if(n.type==='Unary'&&['+','-','!','~'].includes(n.op))return primitive(n.argument,active);
   if(n.type==='Binary'&&['+','-','*','/','%','<','>','<=','>=','===','!==','==','!='].includes(n.op))return primitive(n.left,active)&&primitive(n.right,active);
   if(n.type==='Member'&&n.name==='length'&&snapshotArray(n.object))return true;
   if(n.type==='Call'&&n.callee?.type==='Identifier'&&unaries.has(ref(n.callee)))return n.args.length===1&&primitive(n.args[0],active);
   if(n.type==='Call'&&n.callee?.type==='Identifier'&&comparisons.has(ref(n.callee))){const profile=comparisons.get(ref(n.callee));return !profile.relational||n.args.length===2&&n.args.every(arg=>primitive(arg,active));}
   if(n.type==='Identifier'){if(graphPrimitive(n))return true;const b=ref(n),values=writers.get(b);return !!b&&!!values?.length&&(active.has(b)?values.some(v=>coordinateInput(v)):values.every(v=>primitive(v,new Set([...active,b]))));}
   return false;
  };
  const coordinateInput=n=>{if(!n||typeof n!=='object')return false;if(['Number','String','Boolean','Null','Undefined'].includes(n.type))return true;if(n.type==='Parenthesized')return coordinateInput(n.expression);if(n.type==='Unary'&&['+','-','!','~'].includes(n.op))return coordinateInput(n.argument);if(n.type==='Binary'&&['+','-','*','/','%','<','>','<=','>=','===','!=='].includes(n.op))return coordinateInput(n.left)&&coordinateInput(n.right);return false;};
  // Effect-only Array domain. Explicit nullish writers are retained unless
  // the existing reset service discounts them. A nullish push receiver throws
  // before registration; this grants no Array/init/presence certificate.
  const arrayDomain=(n,active=new Set())=>{
   if(!n)return null;if(['Null','Undefined'].includes(n.type))return {literal:false};
   if(n.type==='Array')return Array.isArray(n.items)&&n.items.every(coordinateInput)?{literal:true}:null;
   if(n.type!=='Identifier')return null;const b=ref(n),values=writers.get(b);if(!b||active.has(b)||!values?.length)return null;
   const domains=values.map(v=>arrayDomain(v,new Set([...active,b])));return domains.every(Boolean)?{literal:domains.some(d=>d.literal)}:null;
  };
  const primitiveArray=n=>arrayDomain(n)?.literal===true;
  const image=n=>n?.type==='Template'&&n.tag==='img'&&!lookup(n,'img')&&!!parseExactImgLiteral('img`'+n.value+'`');
  const factory=n=>sdkCall(n,'create')&&n.args.length===2&&image(n.args[0])&&kind(n.args[1]);
  // Receiver EFFECT closure only: nullish branches may throw before a
  // method returns. Retain those writers; require a genuine factory as well.
  // This never issues Sprite identity, readiness or an initialized variable.
  const sprite=n=>{if(n?.type!=='Identifier')return false;const b=ref(n),values=writers.get(b);return entries.has(b)||aliases.has(b)||!!values?.length&&values.some(factory)&&values.every(v=>factory(v)||['Null','Undefined'].includes(v?.type));};
  const snapshotCall=n=>sdkCall(n,'allOfKind')&&n.args.length===1&&kind(n.args[0]);
  const snapshotArray=n=>{if(snapshotCall(n))return true;if(n?.type!=='Identifier')return false;const values=writers.get(ref(n));return !!values?.length&&values.some(snapshotCall)&&values.every(v=>snapshotCall(v)||['Null','Undefined'].includes(v?.type));};
  const snapshotElement=n=>n?.type==='Index'&&snapshotArray(n.object)&&numericIndex(n.index);
  const indexedDestroyReceiver=n=>snapshotElement(n)||n?.type==='Identifier'&&!!writers.get(ref(n))?.length&&writers.get(ref(n)).some(snapshotElement)&&writers.get(ref(n)).every(v=>snapshotElement(v)||['Null','Undefined'].includes(v?.type));
  // The only ingress alias is in the callback's leading let-null list,
  // immediately followed by its exact formal assignment. Every other formal
  // or alias occurrence must be an x read after that bridge, in this entry.
  for(const n of nodes)if(n.type==='Identifier'&&(entries.has(ref(n))||aliases.has(ref(n)))){
   const b=ref(n),alias=aliases.get(b),fn=alias?.fn||entries.get(b),parent=parents.get(n);
   if(!alias&&parent?.type==='Assignment'&&bridges.has(parent)&&parent.right===n)continue;
   if(alias&&parent===alias.bridge&&parent.left===n)continue;
   if(functionOwner(n)!==fn)return denied('captured callback receiver');
   let statement=n;while(parents.get(statement)&&parents.get(statement)!==fn.body)statement=parents.get(statement);
   if(alias&&fn.body.indexOf(statement)<=alias.bridgeIndex)return denied('early alias read');
   if(parent?.type!=='Member'||parent.object!==n||parent.name!=='x')return denied('callback receiver escape');
   const use=parents.get(parent);if(use?.type==='Assignment'&&use.left===parent||use?.type==='Update'||use?.type==='Call'&&use.callee===parent)return denied('callback coordinate writer');selected.add(parent);
  }
  for(const [binding,alias]of aliases){const values=writers.get(binding);if(values?.length!==2||values[0]!==alias.declaration.decls[0].init||values[1]!==alias.bridge.right)return denied('alias writer census');}
  for(const n of nodes){
   if(n.type==='FunctionExpression'&&!registrations.some(c=>c.args[1]===n))return denied('foreign callback');
   // Ordinary declarations are admitted only through the closed direct-call census above.
   if(n.type==='Identifier'&&['this','globalThis','global','window','self','eval','Function','Object','Array','Reflect','Fx','Fx8','Sprite','Image','Math','arguments'].includes(n.name))return denied('reflection or SDK dependency escape');
   if(n.type==='Identifier'&&!ref(n)&&!roots.has(n.name))return denied('unknown identifier');
   if(n.type==='Identifier'&&roots.has(n.name)){const p=parents.get(n);if(n.name==='pause'?(p?.type!=='Call'||p.callee!==n):(p?.type!=='Member'||p.object!==n))return denied('SDK namespace escape');}
   if(n.type==='While'&&(!Array.isArray(n.body)||!primitive(n.test)))return denied('opaque while condition');
   if(n.type==='Binary'&&!comparisonExpressions.has(n)&&!unaryExpressions.has(n)&&!['===','!=='].includes(n.op)&&(!primitive(n.left)||!primitive(n.right)))return denied('opaque operand coercion');
   if(n.type==='Unary'&&!unaryExpressions.has(n)&&!primitive(n.argument))return denied('opaque unary coercion');
   if(n.type==='Template'&&!image(n))return denied('image factory input');
   if(n.type==='Array'&&(!Array.isArray(n.items)||!n.items.every(coordinateInput)))return denied('nonprimitive Array construction');
   if(n.type==='Assignment'&&n.left?.type!=='Identifier'&&!flatSlotStores.has(n)){
    if(n.left?.type!=='Member'||!['x','y','vx','vy','ax','ay','fx','fy','width','height'].includes(n.left.name)||!sprite(n.left.object)||(entries.has(ref(n.left.object))||aliases.has(ref(n.left.object)))||n.op!=='='||!coordinateInput(n.right))return denied('coordinate writer');
   }
   if(n.type==='Update'&&n.argument?.type!=='Identifier')return denied('coordinate update');
   if(n.type==='Member'){
    const p=parents.get(n);
    if(parents.get(n)?.type==='Assignment'&&parents.get(n).left===n&&flatSlotStores.has(parents.get(n)))continue;
    if(kind(n)||selected.has(n)||n.name==='x'&&sprite(n.object)||n.name==='length'&&(snapshotArray(n.object)||primitiveArray(n.object)))continue;
    if(p?.type==='Call'&&p.callee===n)continue;
    return denied('unproved member read');
   }
   if(n.type==='Index'&&!snapshotElement(n))return denied('unproved indexed effect');
   if(n.type!=='Call')continue;
   if(ordinaryCalls.has(n)){const comparison=comparisons.get(ref(n.callee));if(comparison?.relational&&!n.args.every(arg=>primitive(arg)))return denied('opaque comparison operand');if(unaries.has(ref(n.callee))&&!primitive(n.args[0]))return denied('opaque unary argument');continue;}
   if(registrations.includes(n)||factory(n)||flatCreates.has(n))continue;
   if(n.callee?.type==='Member'&&n.callee.name==='destroy'&&indexedDestroyReceiver(n.callee.object)&&n.args.length===0)continue;
   if(n.callee?.type==='Member'&&n.callee.name==='push'&&n.callee.object?.type==='Identifier'&&primitiveArray(n.callee.object)&&n.args.length===1&&coordinateInput(n.args[0]))continue;
   if(n.callee?.object?.name==='SpriteKind'&&n.callee.name==='create'&&namespaces.some(ns=>{for(let p=n;p;p=parents.get(p))if(p===ns)return true;return false;}))continue;
   if(sdkCall(n,'allOfKind')||sdkCall(n,'destroyAllSpritesOfKind')){if(n.args.length!==1||!kind(n.args[0]))return denied('kind operation');continue;}
   if(n.callee?.type==='Identifier'&&canonical(n.callee,'pause')&&n.args.length===1&&primitive(n.args[0]))continue;
   if(n.callee?.type==='Member'&&sprite(n.callee.object)&&!entries.has(ref(n.callee.object))&&!aliases.has(ref(n.callee.object))){
    const arities={setPosition:2,setVelocity:2,setAcceleration:2,destroy:0};
    if(Object.hasOwn(arities,n.callee.name)&&n.args.length===arities[n.callee.name]&&n.args.every(a=>coordinateInput(a)))continue;
   }
   return denied('unknown invocation');
  }
  if(invalid)return denied('unbound writer');
  let live=true;const current=()=>{
   if(!live)return false;
   try{if(!realmCurrent()||!sdkSnapshot.current()||!snapshot.current()||!resets.current()||
     graphUsed&&(!graphViewSnapshot?.current()||!independentGraph.lexicalDeclarationReadinessCurrent()))live=false;}
   catch{live=false;}
   return live;
  };
  return Object.freeze({current,has:node=>current()&&selected.has(node),reason:null});
 }catch{return denied('unclosed source');}
}
