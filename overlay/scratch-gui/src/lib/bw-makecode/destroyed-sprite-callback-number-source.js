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
const equalDescriptor=(a,b)=>!!a&&!!b&&a.enumerable===b.enumerable&&a.configurable===b.configurable&&a.writable===b.writable&&same(a.value,b.value)&&same(a.get,b.get)&&same(a.set,b.set);
const realmCurrent=()=>globalRows.every(([name,d])=>equalDescriptor(descriptor(realm,name),d))&&ambient.every(row=>{const names=keys(row.object);return proto(row.object)===row.parent&&names.length===row.fields.length&&names.every((key,i)=>key===row.fields[i][0]&&equalDescriptor(descriptor(row.object,key),row.fields[i][1]));});
const sdkSnapshot=physicalUpdateSourceSnapshot(SDK_SPRITE_CLASS_NODES);
const metadata=new Set(['originalBody','parameterDefaults','paramTypes','typeParameters','returnType','assertedType','optionalParams','parameterProperties','calls']);
const syntax=new Set(['Program','Namespace','Declaration','ExpressionStatement','FunctionExpression','FunctionDeclaration','Return','Number','String','Boolean','Null','Undefined','Identifier','Template','Binary','Unary','Assignment','Update','Call','Member','Index','Parenthesized']);
const roots=new Set(['sprites','SpriteKind','img','pause']);
const denied=reason=>Object.freeze({has:()=>false,current:()=>true,reason});

export function createDestroyedSpriteCallbackNumberSource(program){
 try{
  if(!realmCurrent()||!sdkSnapshot?.current())return denied('analysis or SDK descriptor changed');
  const snapshot=physicalUpdateSourceSnapshot(program);
  if(!snapshot||snapshot.opaque.length)return denied('non-data source');
  const nodes=[],parents=new WeakMap(),seen=new Set();let invalid=false;
  const visit=(value,parent=null)=>{
   if(!value||typeof value!=='object')return;if(seen.has(value)){invalid=true;return;}seen.add(value);parents.set(value,parent);
   if(Array.isArray(value)){for(let i=0;i<value.length;i++){if(!Object.hasOwn(value,i)){invalid=true;continue;}visit(value[i],value);}return;}
   nodes.push(value);for(const [key,child]of Object.entries(value))if(!metadata.has(key))visit(child,value);
  };visit(program);
  if(invalid||program.type!=='Program'||nodes.some(n=>n.type&&!syntax.has(n.type)||n.optional||n.callee?.optional||n.isNew||n.constructorCall||n.typeArguments?.length||n.kind==='var'||n.unsupported?.length))return denied('unclosed syntax');
  for(const n of nodes){if(n.type==='Number'&&(!['number','string'].includes(typeof n.value)||String(n.value).trim()===''||Number.isNaN(Number(n.value)))||n.type==='String'&&typeof n.value!=='string'||n.type==='Boolean'&&typeof n.value!=='boolean')return denied('literal shape');}
  const bindings=analyseCallableBindings(program),ref=n=>bindings.references.get(n);
  const scopeAt=n=>{for(let p=n;p;p=parents.get(p)){const s=bindings.scopes.get(p);if(s)return s;}return bindings.global;};
  const lookup=(n,name)=>{for(let s=scopeAt(n);s;s=s.parent)if(s.names.has(name))return s.names.get(name);return null;};
  const namespaces=nodes.filter(n=>n.type==='Namespace');
  const custom=new Set();
  for(const ns of namespaces){
   if(ns.name!=='SpriteKind'||!program.body.includes(ns))return denied('foreign namespace');
   for(const st of ns.body||[]){if(st.type!=='Declaration'||st.kind!=='const'||!st.exported)return denied('noncanonical kind declaration');
    for(const d of st.decls){const c=d.init;if(custom.has(d.name)||['Player','Projectile','Food','Enemy','create'].includes(d.name)||c?.type!=='Call'||c.callee?.object?.name!=='SpriteKind'||c.callee.name!=='create'||c.args.length)return denied('noncanonical kind factory');custom.add(d.name);}}
  }
  if(namespaces.length>1)return denied('ambiguous kind namespace');
  const namespaceBinding=bindings.global.names.get('SpriteKind');
  const canonical=(node,name)=>node?.type==='Identifier'&&node.name===name&&(!lookup(node,name)||name==='SpriteKind'&&lookup(node,name)===namespaceBinding&&namespaces.length===1);
  const sdkCall=(n,name)=>n?.type==='Call'&&n.callee?.type==='Member'&&n.callee.name===name&&canonical(n.callee.object,'sprites');
  const kind=n=>n?.type==='Member'&&canonical(n.object,'SpriteKind')&&(['Player','Projectile','Food','Enemy'].includes(n.name)||custom.has(n.name));
  const shape=fn=>Array.isArray(fn.params)&&fn.params.length===1&&new Set(fn.params).size===1&&[fn,fn.params].every(value=>!Object.hasOwn(value,'restParam')&&!['async','isAsync','generator','isGenerator'].some(k=>value[k])&&['parameterDefaults','optionalParams','typeParameters','genericParams','parameterProperties'].every(k=>value[k]===undefined||Array.isArray(value[k])&&!value[k].length)&&!Object.keys(value.paramDefaults||{}).length);
  const registrations=nodes.filter(n=>sdkCall(n,'onDestroyed')),entries=new Map(),selected=new WeakSet();
  if(!registrations.length)return denied('no destroyed callback');
  for(const call of registrations){const fn=call.args[1];if(call.args.length!==2||!kind(call.args[0])||fn?.type!=='FunctionExpression'||!shape(fn))return denied('callback entry shape');
   const binding=bindings.scopes.get(fn)?.names.get(fn.params[0]);if(!binding||entries.has(binding))return denied('callback binding');entries.set(binding,fn);
  }
  const writers=new Map(),addWriter=(b,v)=>{if(!b){invalid=true;return;}if(!writers.has(b))writers.set(b,[]);writers.get(b).push(v);};
  for(const n of nodes){
   if(n.type==='Declaration')for(const d of n.decls){if(!['let','const'].includes(n.kind)||!Array.isArray(n.decls)||typeof d.name!=='string'||!/^[$A-Z_a-z][$\w]*$/.test(d.name)||Object.keys(d).some(k=>!['name','init','isArray','typeName','whenUsed'].includes(k))||d.isArray!==undefined&&typeof d.isArray!=='boolean'||d.typeName!==undefined&&typeof d.typeName!=='string')return denied('declaration shape');let inKind=false;for(let p=n;p;p=parents.get(p))if(p.type==='Namespace'){inKind=true;break;}if(inKind)continue;const b=scopeAt(n).names.get(d.name);if(roots.has(d.name)||['Fx','Fx8','Sprite','Image','Object','Array','Math','Reflect','eval','Function','globalThis','arguments'].includes(d.name))return denied('protected binding');if(d.init)addWriter(b,d.init);}
   if(n.type==='Assignment'&&n.left?.type==='Identifier')addWriter(ref(n.left),['=','+=','-=','*=','/=','%='].includes(n.op)?n.right:null);
   if(n.type==='Update'&&n.argument?.type==='Identifier')addWriter(ref(n.argument),null);
  }
  const primitive=(n,active=new Set())=>{
   if(!n)return false;if(selected.has(n))return true;if(['Number','String','Boolean','Null','Undefined'].includes(n.type))return true;
   if(n.type==='Parenthesized')return primitive(n.expression,active);
   if(n.type==='Unary'&&['+','-','!','~'].includes(n.op))return primitive(n.argument,active);
   if(n.type==='Binary'&&['+','-','*','/','%','<','>','<=','>=','===','!==','==','!='].includes(n.op))return primitive(n.left,active)&&primitive(n.right,active);
   if(n.type==='Identifier'){const b=ref(n),values=writers.get(b);return !!b&&!active.has(b)&&!!values?.length&&values.every(v=>primitive(v,new Set([...active,b])));}
   return false;
  };
  const coordinateInput=n=>{if(!n||typeof n!=='object')return false;if(['Number','String','Boolean','Null','Undefined'].includes(n.type))return true;if(n.type==='Parenthesized')return coordinateInput(n.expression);if(n.type==='Unary'&&['+','-','!','~'].includes(n.op))return coordinateInput(n.argument);if(n.type==='Binary'&&['+','-','*','/','%','<','>','<=','>=','===','!=='].includes(n.op))return coordinateInput(n.left)&&coordinateInput(n.right);return false;};
  const image=n=>n?.type==='Template'&&n.tag==='img'&&!lookup(n,'img')&&!!parseExactImgLiteral('img`'+n.value+'`');
  const factory=n=>sdkCall(n,'create')&&n.args.length===2&&image(n.args[0])&&kind(n.args[1]);
  const sprite=n=>{if(n?.type!=='Identifier')return false;const b=ref(n);return entries.has(b)||!!writers.get(b)?.length&&writers.get(b).every(factory);};
  const snapshotCall=n=>sdkCall(n,'allOfKind')&&n.args.length===1&&kind(n.args[0]);
  const snapshotArray=n=>snapshotCall(n)||n?.type==='Identifier'&&!!writers.get(ref(n))?.length&&writers.get(ref(n)).every(snapshotCall);
  // A callback formal may occur only as the receiver of its own direct x
  // read. No aliases, stores, forwarding, method calls or nested captures.
  for(const n of nodes)if(n.type==='Identifier'&&entries.has(ref(n))){
   const parent=parents.get(n),fn=entries.get(ref(n));let owner=n;
   while(owner&&owner!==fn){owner=parents.get(owner);if(owner&&['FunctionExpression','FunctionDeclaration'].includes(owner.type)&&owner!==fn)return denied('captured callback formal');}
   if(owner!==fn||parent?.type!=='Member'||parent.object!==n||parent.name!=='x')return denied('callback formal escape');
   const use=parents.get(parent);if(use?.type==='Assignment'&&use.left===parent||use?.type==='Update'||use?.type==='Call'&&use.callee===parent)return denied('callback coordinate writer');selected.add(parent);
  }
  for(const n of nodes){
   if(n.type==='FunctionExpression'&&!registrations.some(c=>c.args[1]===n))return denied('foreign callback');
   if(n.type==='FunctionDeclaration')return denied('ordinary invocation outside slice');
   if(n.type==='Identifier'&&['this','globalThis','global','window','self','eval','Function','Object','Array','Reflect','Fx','Fx8','Sprite','Image','Math','arguments'].includes(n.name))return denied('reflection or SDK dependency escape');
   if(n.type==='Identifier'&&!ref(n)&&!roots.has(n.name))return denied('unknown identifier');
   if(n.type==='Identifier'&&roots.has(n.name)){const p=parents.get(n);if(n.name==='pause'?(p?.type!=='Call'||p.callee!==n):(p?.type!=='Member'||p.object!==n))return denied('SDK namespace escape');}
   if(n.type==='Binary'&&!['===','!=='].includes(n.op)&&(!primitive(n.left)||!primitive(n.right)))return denied('opaque operand coercion');
   if(n.type==='Unary'&&!primitive(n.argument))return denied('opaque unary coercion');
   if(n.type==='Template'&&!image(n))return denied('image factory input');
   if(n.type==='Assignment'&&n.left?.type!=='Identifier'){
    if(n.left?.type!=='Member'||!['x','y','vx','vy','ax','ay','fx','fy','width','height'].includes(n.left.name)||!sprite(n.left.object)||entries.has(ref(n.left.object))||n.op!=='='||!coordinateInput(n.right))return denied('coordinate writer');
   }
   if(n.type==='Update'&&n.argument?.type!=='Identifier')return denied('coordinate update');
   if(n.type==='Member'){
    const p=parents.get(n);
    if(kind(n)||selected.has(n)||n.name==='x'&&sprite(n.object)||n.name==='length'&&snapshotArray(n.object))continue;
    if(p?.type==='Call'&&p.callee===n)continue;
    return denied('unproved member read');
   }
   if(n.type==='Index'&&(!snapshotArray(n.object)||n.index?.type!=='Number'||!Number.isSafeInteger(Number(n.index.value))||Number(n.index.value)<0))return denied('unproved indexed effect');
   if(n.type!=='Call')continue;
   if(registrations.includes(n)||factory(n))continue;
   if(n.callee?.object?.name==='SpriteKind'&&n.callee.name==='create'&&namespaces.some(ns=>{for(let p=n;p;p=parents.get(p))if(p===ns)return true;return false;}))continue;
   if(sdkCall(n,'allOfKind')||sdkCall(n,'destroyAllSpritesOfKind')){if(n.args.length!==1||!kind(n.args[0]))return denied('kind operation');continue;}
   if(n.callee?.type==='Identifier'&&canonical(n.callee,'pause')&&n.args.length===1&&primitive(n.args[0]))continue;
   if(n.callee?.type==='Member'&&sprite(n.callee.object)&&!entries.has(ref(n.callee.object))){
    const arities={setPosition:2,setVelocity:2,setAcceleration:2,destroy:0};
    if(Object.hasOwn(arities,n.callee.name)&&n.args.length===arities[n.callee.name]&&n.args.every(a=>coordinateInput(a)))continue;
   }
   return denied('unknown invocation');
  }
  if(invalid)return denied('unbound writer');
  let live=true;const current=()=>{if(live&&(!realmCurrent()||!sdkSnapshot.current()||!snapshot.current()))live=false;return live;};
  return Object.freeze({current,has:node=>current()&&selected.has(node),reason:null});
 }catch{return denied('unclosed source');}
}
