import {ARCADE_NAMESPACE_MEMBERS} from './arcade-namespace-members.js';
import {HELPERS} from './arcade-runtime.js';
import {sdkExportClasses,sdkClassPublicName} from './sdk-class-descriptors.js';

const ident=value=>{const name=String(value||'v').replace(/[^A-Za-z0-9_]/g,'_');return /^[0-9]/.test(name)?'_'+name:name;};
const keywords=new Set(('break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with let static yield await implements interface package private protected public namespace type declare abstract readonly as any boolean number string never unknown undefined constructor').split(' '));
const list=value=>{try{const result=JSON.parse(value);return Array.isArray(result)?result:null;}catch(_){return null;}};
const keys=(object,names)=>!!object&&Object.keys(object).length===names.length&&names.every(n=>Object.hasOwn(object,n));
const literal=(target,block,name)=>{
 const field=block.fields?.[name];if(Array.isArray(field)&&typeof field[0]==='string')return field[0];
 const slot=block.inputs?.[name]?.[1];if(Array.isArray(slot)&&slot[0]===10&&typeof slot[1]==='string')return slot[1];
 const value=typeof slot==='string'&&target.blocks[slot];return value?.opcode==='text'&&value.shadow===true&&typeof value.fields?.TEXT?.[0]==='string'?value.fields.TEXT[0]:null;
};
const primitive=slot=>Array.isArray(slot)&&((slot.length===2&&[4,5,6,7,8,9,10].includes(slot[0])&&['string','number'].includes(typeof slot[1]))||(slot.length===3&&[11,12,13].includes(slot[0])&&typeof slot[1]==='string'&&typeof slot[2]==='string'));
function inputSocket(target,slot,parent){
 if(!Array.isArray(slot))return false;
 const node=(id,shadow)=>typeof id==='string'&&Object.hasOwn(target.blocks,id)&&target.blocks[id]?.parent===parent&&target.blocks[id]?.shadow===shadow;
 if(slot[0]===1&&slot.length===2)return primitive(slot[1])||node(slot[1],true);
 if(slot[0]===2&&slot.length===2)return node(slot[1],false);
 if(slot[0]===3&&slot.length===3)return node(slot[1],false)&&(primitive(slot[2])||node(slot[2],true));
 return false;
}
// A plain current project, including object identity, is the authority. This
// snapshot never invokes accessors or stringifies a caller-supplied object.
function snapshot(value){
 const identities=[],active=new Set();let valid=true;
 const walk=v=>{
  if(v===null||['string','boolean'].includes(typeof v))return v;
  if(typeof v==='number')return Number.isFinite(v)?v:['number',String(v)];
  if(v===undefined)return ['undefined'];
  if(typeof v!=='object'||active.has(v)){valid=false;return null;}
  const proto=Object.getPrototypeOf(v);if(proto!==Object.prototype&&proto!==Array.prototype&&proto!==null){valid=false;return null;}
  active.add(v);identities.push(v);const fields=[];
  for(const key of Reflect.ownKeys(v)){const d=Object.getOwnPropertyDescriptor(v,key);if(typeof key!=='string'||!d||!Object.hasOwn(d,'value')||!d.enumerable&&!(Array.isArray(v)&&key==='length')){valid=false;continue;}fields.push([key,walk(d.value)]);}
  active.delete(v);return [Array.isArray(v)?'array':'object',fields];
 };
 const tree=walk(value);return valid?{text:JSON.stringify(tree),identities}:null;
}

/** Names reserve hygiene only; they never establish a procedure/value owner. */
function hygiene(project){
 const reserved=new Set([...keywords,...Object.keys(ARCADE_NAMESPACE_MEMBERS).map(n=>n.split('.')[0]),
  'score','life','pause','forever','String','Number','Boolean','Array','Object','JSON','Math','Infinity','NaN','parseInt','parseFloat','isNaN','isFinite','Sprite','Image','Buffer','Font','SpriteLike','TextSprite','Dart','Corgio','SevenSegDigit','DigitCounter','ArcadePhysicsEngine','animation','textsprite','mp','scroller','characterAnimations','carnival','helpers','bwStringArraySettings','myTiles','myAnimations','mySongs']);
 for(const cls of sdkExportClasses())reserved.add(sdkClassPublicName(cls.name).split('.')[0]);
 // These declarations are actual fixed producer families; suffix closure covers
 // the existing allocator's collision suffixes without rendering any bodies.
 const suffixBases=new Set(['_na','_stopAll','_broadcast','_backdrops','_backdropNames','_bd','_setBackdrop','_backdropHats','__bwStartup','__bwAnimationAssets','__bwAnimationFrames','__bwAnimationFreshFrames','__bwAnimationInterval','__bwSongAssets','__bwNamedParseValue','__bwNamedJsonValue','__bwScratchMin','__bwScratchMax','__bwArrayAccess','__bwControllerAxisStep','__bwLiteralNegativeZero']);
 for(const helper of Object.values(HELPERS))for(const match of helper.ts.matchAll(/(?:^|\n)(?:function|class|let|const)\s+([A-Za-z_$][\w$]*)/g))suffixBases.add(match[1]);
 const stage=project.targets.find(t=>t.isStage),stageNames=new Set(Object.values(stage?.variables||{}).map(v=>v[0]));
 const families=[/^__bwArt_/,/^__bwFrames_/,/^__bwNamedArray_/,/^__bwAnimationFrames[0-9]+_*$/, /^__bw(?:Unary|Binary|Compare)(?:Add|Subtract|Multiply|Divide|Remainder|Power|BitAnd|BitOr|BitXor|ShiftLeft|ShiftRight|UnsignedShiftRight|BitNot|Equal|NotEqual|StrictEqual|StrictNotEqual|Less|Greater|LessEqual|GreaterEqual)_*$/, /^__bwNamedArray(?:Get|Set|Push|Pop|Shift|Unshift|Insert|Remove|Length|IndexOf|Contains|Reverse|Sort|Join|Slice|Concat)_*$/];
 const add=name=>{if(typeof name==='string'&&name){reserved.add(name);reserved.add(ident(name));}};
 const metadata=value=>{if(!value||typeof value!=='object')return;for(const[k,v]of Object.entries(value)){if(['name','sourceName'].includes(k))add(v);else if(typeof v==='object')metadata(v);}};
 for(const target of project.targets){
  const targetName=ident(target.isStage?'stage':target.name);
  for(const v of Object.values(target.variables||{})){add(v[0]);let name=ident(target.isStage||stageNames.has(v[0])?v[0]:target.name+'_'+v[0]);add(name);add(name+'_');}
  for(const l of Object.values(target.lists||{}))add(ident(target.isStage?l[0]:target.name+'_'+l[0])+'List');
  add(ident(target.name)+'Sprite');add(ident(target.name)+'Costumes');add(ident(target.name)+'CostumeNames');
  for(const prefix of ['_kind_','_all_','_clone_','_som_','_sok_'])suffixBases.add(prefix+targetName);
  const escaped=targetName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');families.push(new RegExp('^_(?:key|on|backdrop|cloned|update|interval)_'+escaped+'_[0-9]+_*$'));
  for(const block of Object.values(target.blocks||{})){
   if(['arcade_getLocal','arcade_setLocal','arcade_getCaptured','arcade_setCaptured','arcade_declareClass','arcade_declareSubclass'].includes(block.opcode))add(literal(target,block,'NAME'));
   if(/^argument_reporter_/.test(block.opcode))add(block.fields?.VALUE?.[0]);
   if(block.opcode==='procedures_prototype')for(const name of list(block.mutation?.argumentnames)||[])add(name);
   if(block.opcode==='arcade_declareCallable'){try{metadata(JSON.parse(literal(target,block,'METADATA')));}catch(_){/* No value/owner permission follows from metadata. */}}
   const token=literal(target,block,'TOKEN');if(token)for(const prefix of ['__bwCreatedSprite_','__bwTerrainSprite_','__bwEventSprite_','__bwEventLocation_','__bwOtherSprite_'])suffixBases.add(prefix+ident(token));
   if(block.opcode==='arcade_setTilemap'){try{const data=JSON.parse(literal(target,block,'DATA'));for(const image of data.images||[]){const id=image.tileId;if(typeof id==='string')add(id.split('.')[0]);}}catch(_){/* Original resource validator retains its diagnostics. */}}
  }
 }
 // These are real surrounding lexical declarations in the legacy callback and
 // restart-script emitters, not current graph formal/local reporters.
 add('self');add('_t');add('_g');add('sprite');add('otherSprite');
 return name=>reserved.has(name)||families.some(pattern=>pattern.test(name))||[...suffixBases].some(base=>name===base||name.startsWith(base)&&/^_+$/.test(name.slice(base.length)));
}

export function createOrdinaryExportSymbols(project,note=()=>{}){
 const initial=snapshot(project),byTarget=new Map(),records=[],pins=new Map(),reported=new Set();
 const report=message=>{if(!reported.has(message)){reported.add(message);note('Arcade ordinary symbol: '+message);}};
 const current=()=>{const now=snapshot(project);return !!initial&&!!now&&initial.text===now.text&&initial.identities.length===now.identities.length&&initial.identities.every((v,i)=>v===now.identities[i]);};
 if(!initial||!project||!Object.hasOwn(project,'targets')||!Array.isArray(project.targets)||new Set(project.targets).size!==project.targets.length||project.targets.some(target=>!target||typeof target!=='object'||Array.isArray(target)||!Object.hasOwn(target,'name')||!Object.hasOwn(target,'isStage')||typeof target.name!=='string'||typeof target.isStage!=='boolean'||target.blocks!=null&&(typeof target.blocks!=='object'||Array.isArray(target.blocks)))){report('requires an actual plain current project');return{current:()=>false,name:()=>null,values:()=>[],pin:()=>false,call:()=>null};}
 const blocked=new Set();
 for(const[targetIndex,target]of project.targets.entries()){
  const table=new Map();byTarget.set(target,table);const blocks=target.blocks||{},definitions=new Map();
  for(const[id,definition]of Object.entries(blocks))if(definition?.opcode==='procedures_definition'){
   const protoId=definition.inputs?.custom_block?.[1],prototype=typeof protoId==='string'&&blocks[protoId],code=prototype?.mutation?.proccode;
   if(typeof code!=='string'||!code){report('definition requires a fixed actual procedure code');continue;}
   const socket=(slot,child)=>Array.isArray(slot)&&slot.length===2&&slot[0]===1&&slot[1]===child;
   const ids=list(prototype.mutation.argumentids),names=list(prototype.mutation.argumentnames),defaults=list(prototype.mutation.argumentdefaults),placeholders=[...code.matchAll(/%([sbn])/g)];
   let valid=definition.topLevel===true&&definition.shadow===false&&definition.parent==null&&keys(definition.fields||{},[])&&keys(definition.inputs,['custom_block'])&&socket(definition.inputs.custom_block,protoId)&&Object.hasOwn(blocks,protoId)&&prototype.opcode==='procedures_prototype'&&prototype.shadow===true&&prototype.topLevel===false&&keys(prototype.fields||{},[])&&prototype.parent===id&&prototype.next==null&&ids&&names&&defaults&&ids.length===names.length&&ids.length===defaults.length&&ids.length===placeholders.length&&ids.every(v=>typeof v==='string'&&v)&&names.every(v=>typeof v==='string'&&v)&&new Set(ids).size===ids.length&&new Set(names).size===names.length&&new Set(names.map(ident)).size===names.length&&keys(prototype.inputs||{},ids);
   if(valid)for(let i=0;i<ids.length;i++){const childId=prototype.inputs[ids[i]]?.[1],child=typeof childId==='string'&&blocks[childId];if(!socket(prototype.inputs[ids[i]],childId)||!Object.hasOwn(blocks,childId)||!child||child.shadow!==true||child.topLevel!==false||!keys(child.inputs||{},[])||!keys(child.fields||{},['VALUE'])||child.mutation!=null||child.parent!==protoId||child.next!=null||child.fields?.VALUE?.[0]!==names[i]||child.opcode!==(placeholders[i][1]==='b'?'argument_reporter_boolean':'argument_reporter_string_number'))valid=false;}
   if(Object.hasOwn(Object.prototype,code))valid=false;
   if(Object.values(blocks).filter(b=>b?.opcode==='procedures_prototype'&&b.mutation?.proccode===code).length!==1||definitions.has(code))valid=false;
   if(definitions.has(code)){blocked.add(definitions.get(code));table.delete(code);}
   if(!valid){report('ambiguous or malformed definition/prototype/formals '+code);definitions.set(code,null);continue;}
   const record={target,targetIndex,definition,id,prototype,protoId,code,ids,names,base:ident(code.replace(/%[sbn]/g,'').trim()||'fn'),symbol:null};definitions.set(code,record);table.set(code,record);records.push(record);
  }
 }
 const legacyOwners=new Map();for(const r of records){const key=(r.target.isStage?'':r.target.name)+':'+r.code;if(legacyOwners.has(key)){blocked.add(r);blocked.add(legacyOwners.get(key));report('legacy analysis keys conflate distinct actual procedure owners');}else legacyOwners.set(key,r);}
 const hygieneReserved=hygiene(project),preferred=new Set(records.map(r=>r.base)),used=new Set(),counts=new Map();
 for(const r of records)counts.set(r.base,(counts.get(r.base)||0)+1);
 // Freeze each unique legal candidate first. Collision names cannot steal a
 // different owner's preferred authored name, including already-qualified names.
 for(const r of records)if(!blocked.has(r)&&counts.get(r.base)===1&&!hygieneReserved(r.base)){r.symbol=r.base;used.add(r.symbol);}
 for(const r of [...records].sort((a,b)=>a.targetIndex-b.targetIndex||(a.code<b.code?-1:a.code>b.code?1:0)))if(!blocked.has(r)&&!r.symbol){
  let base=ident((r.target.isStage?'stage':r.target.name)+'_'+r.base);if(hygieneReserved(base))base='bwFunction_'+base;let candidate=base,n=2;
  while(hygieneReserved(candidate)||used.has(candidate)||preferred.has(candidate)){candidate=base+'_'+n++;}
  r.symbol=candidate;used.add(candidate);
 }
 const record=(target,code)=>{if(!current()){report('current project or owner inventory changed during export');return null;}return byTarget.get(target)?.get(code)||null;};
 const name=(target,code)=>{const r=record(target,code);return r&&!blocked.has(r)?pins.get(r)||r.symbol:null;};
 const pin=(target,code,symbol)=>{const r=record(target,code);if(!r||typeof symbol!=='string'||!/^[A-Za-z_$][\w$]*$/.test(symbol)){report('qualified lexical declaration has no current ordinary owner');return false;}if(records.some(other=>other!==r&&(pins.get(other)||other.symbol)===symbol)){report('qualified lexical declaration collides with another actual owner');return false;}pins.set(r,symbol);return true;};
 const call=(target,block)=>{
  if(!current()||!byTarget.has(target)||Object.values(target.blocks||{}).filter(b=>b===block).length!==1){report('call is not an actual current owned block');return null;}
  const code=block?.opcode==='procedures_call'?block.mutation?.proccode:block?.opcode==='arcade_callFunction'?literal(target,block,'NAME'):null,r=typeof code==='string'&&record(target,code);
  if(!r)return null;
  if(block.opcode==='procedures_call'){const ids=list(block.mutation?.argumentids);const callId=Object.keys(target.blocks).find(id=>target.blocks[id]===block);if(!ids||JSON.stringify(ids)!==JSON.stringify(r.ids)||!keys(block.inputs||{},r.ids)||ids.some(id=>!inputSocket(target,block.inputs[id],callId))){report('call ordered formal/input binding differs');return null;}}
  if(block.opcode==='arcade_callFunction'){const seen=new Set();let parent=block,slot=block.inputs?.ARGS?.[1],child=typeof slot==='string'&&target.blocks[slot];while(child?.opcode==='arcade_functionArgument'){if(seen.has(child)||child.parent!==Object.keys(target.blocks).find(id=>target.blocks[id]===parent)||!keys(child.inputs||{},['VALUE','REST'])){report('managed argument chain ownership differs');return null;}seen.add(child);parent=child;slot=child.inputs.REST?.[1];child=typeof slot==='string'&&target.blocks[slot];}if(!(Array.isArray(slot)&&slot[0]===10&&slot[1]==='[]')&&!(child?.opcode==='text'&&child.shadow===true&&child.fields?.TEXT?.[0]==='[]')){report('managed argument chain requires its actual terminator');return null;}}
  return name(target,code);
 };
 return Object.freeze({current,name,pin,call,values:()=>records.filter(r=>!blocked.has(r)).map(r=>pins.get(r)||r.symbol)});
}
