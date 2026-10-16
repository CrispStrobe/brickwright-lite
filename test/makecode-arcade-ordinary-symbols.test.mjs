import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createOrdinaryExportSymbols} from '../overlay/scratch-gui/src/lib/bw-makecode/ordinary-export-symbols.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';

const observationDirectory=process.env.BW_ORDINARY_SYMBOL_OBSERVATIONS;let observationSerial=0;
const retain=(kind,value)=>{if(observationDirectory)fs.writeFileSync(path.join(observationDirectory,String(observationSerial++).padStart(4,'0')+'-'+kind+'.json'),JSON.stringify(value,(_key,v)=>v===undefined?{$undefined:true}:v,2)+'\n',{flag:'wx'});};
const channelState=value=>Object.fromEntries([...new Set(['warnings','errors','unparsed','unsupported','diagnostics',...Object.keys(value||{}).filter(k=>/warn|error|unparsed|unsupported|diagnostic|refus/i.test(k))])].map(k=>[k,{provided:Object.hasOwn(value||{},k),kind:!Object.hasOwn(value||{},k)?'absent':value[k]===undefined?'undefined':value[k]===null?'null':Array.isArray(value[k])?'array':typeof value[k],...(Object.hasOwn(value||{},k)?{value:value[k]}:{})}]));
const exportGraph=(project,opts={})=>{retain('export-input',{project});try{const result=projectToArcade(project,opts);retain('export-return',{result,channels:channelState(result),projectAfter:project});return result;}catch(error){retain('export-exception',{name:error.name,message:error.message,stack:error.stack,channels:channelState(error),projectAfter:project});throw error;}};

const target=(name,isStage=false)=>({name,isStage,variables:{},lists:{},blocks:{},costumes:[],sounds:[],currentCostume:0,x:0,y:0,visible:false});
const project=(...targets)=>({targets:[target('Stage',true),...targets],monitors:[],extensions:['arcade'],meta:{semver:'3.0.0'}});
let serial=0;
function procedure(t,code,names=[],types=names.map(()=> 's')){
 const id='definition'+serial++,protoId='prototype'+serial++,ids=names.map(()=> 'formal'+serial++),b=t.blocks;
 b[id]={opcode:'procedures_definition',topLevel:true,shadow:false,parent:null,next:null,inputs:{custom_block:[1,protoId]},fields:{}};
 b[protoId]={opcode:'procedures_prototype',topLevel:false,shadow:true,parent:id,next:null,inputs:{},fields:{},mutation:{proccode:code,argumentids:JSON.stringify(ids),argumentnames:JSON.stringify(names),argumentdefaults:JSON.stringify(names.map(()=>'')),warp:'false'}};
 for(let i=0;i<ids.length;i++){const child='reporter'+serial++;b[protoId].inputs[ids[i]]=[1,child];b[child]={opcode:types[i]==='b'?'argument_reporter_boolean':'argument_reporter_string_number',topLevel:false,shadow:true,parent:protoId,next:null,inputs:{},fields:{VALUE:[names[i],null]}};}
 return{id,protoId,ids,code,definition:b[id],prototype:b[protoId]};
}
function stock(t,p){const id='call'+serial++,node={opcode:'procedures_call',parent:null,next:null,shadow:false,topLevel:true,fields:{},inputs:Object.fromEntries(p.ids.map(i=>[i,[1,[4,'1']]])),mutation:{proccode:p.code,argumentids:JSON.stringify(p.ids)}};t.blocks[id]=node;return node;}
const plan=p=>{const notes=[];return{symbols:createOrdinaryExportSymbols(p,n=>notes.push(n)),notes};};

test('legal authored and already-qualified ordinary names are preserved without prefix stripping',()=>{
 const t=target('Game');for(const n of ['foo','Game_foo','_authored'])procedure(t,n);const p=project(t),before=JSON.stringify(p),{symbols,notes}=plan(p);
 for(const n of ['foo','Game_foo','_authored'])assert.equal(symbols.name(t,n),n);assert.deepEqual(notes,[]);assert.equal(JSON.stringify(p),before);
 assert.equal(symbols.name({...t},'foo'),null);assert.equal(symbols.name(t,'__bwStartup'),null);
});

test('same names on real distinct targets bind their own declarations and calls',()=>{
 const a=target('A'),b=target('B'),pa=procedure(a,'move %s',['n']),pb=procedure(b,'move %s',['n']),ca=stock(a,pa),cb=stock(b,pb),{symbols,notes}=plan(project(a,b));
 assert.notEqual(symbols.name(a,pa.code),symbols.name(b,pb.code));assert.equal(symbols.call(a,ca),symbols.name(a,pa.code));assert.equal(symbols.call(b,cb),symbols.name(b,pb.code));assert.equal(symbols.call(a,cb),null);assert.ok(notes.some(x=>x.includes('actual current owned block')));
});

test('sanitized collisions cannot steal another owners authored qualified candidate',()=>{
 const a=target('A'),b=target('B'),c=target('C');procedure(a,'a-b');procedure(b,'a_b');procedure(c,'A_a_b');const{symbols}=plan(project(a,b,c));
 assert.equal(symbols.name(c,'A_a_b'),'A_a_b');assert.equal(new Set(symbols.values()).size,3);assert.notEqual(symbols.name(a,'a-b'),'A_a_b');
});

test('literal percent/name tokens survive while validated ordered placeholders are removed once',()=>{
 const t=target('Game');procedure(t,'mix %s and %b then %n',['textValue','flagValue','numberValue'],['s','b','n']);procedure(t,'100% literal');const{symbols,notes}=plan(project(t));
 assert.equal(symbols.name(t,'mix %s and %b then %n'),'mix__and__then');assert.equal(symbols.name(t,'100% literal'),'_100__literal');assert.deepEqual(notes,[]);
});

test('malformed formal counts/types/reporters refuse rather than fabricating a base owner',()=>{
 for(const mutate of [p=>p.prototype.mutation.argumentids='[]',p=>p.prototype.mutation.argumentnames='["x","x"]',p=>p.prototype.mutation.proccode='f %s %b',p=>p.prototype.inputs[p.ids[0]]=[1,'missing']]){
  const t=target('Game'),p=procedure(t,'f %b',['x'],['b']);mutate(p);const{symbols,notes}=plan(project(t));assert.equal(symbols.name(t,p.prototype.mutation.proccode),null);assert.ok(notes.length);
 }
});

test('orphan duplicate prototypes and mismatched definition ownership never win by traversal order',()=>{
 const t=target('Game'),p=procedure(t,'f');t.blocks.orphan={...p.prototype,parent:null};const{symbols,notes}=plan(project(t));assert.equal(symbols.name(t,'f'),null);assert.ok(notes.some(n=>n.includes('malformed')));
});

test('delimiter-colliding legacy analysis keys are explicit refusals rather than alias facts',()=>{
 const a=target('A:B'),b=target('A');procedure(a,'c');procedure(b,'B:c');const{symbols,notes}=plan(project(a,b));assert.equal(symbols.name(a,'c'),null);assert.equal(symbols.name(b,'B:c'),null);assert.ok(notes.some(n=>n.includes('conflate')));
});

test('calls require the exact current block, ordered formal IDs and actual target, including Stage',()=>{
 const t=target('Game'),p=procedure(t,'f %s',['arg']),call=stock(t,p),whole=project(t),{symbols}=plan(whole);assert.ok(symbols.call(t,call));assert.equal(symbols.call(t,structuredClone(call)),null);
 const other=target('Other');whole.targets.push(other);assert.equal(symbols.call(t,call),null);
 const s=project(target('Other'));const ps=procedure(s.targets[0],'onlyStage'),c=stock(s.targets[1],ps);assert.equal(plan(s).symbols.call(s.targets[1],c),null);
 const q=target('Game'),pq=procedure(q,'f %s',['arg']),cq=stock(q,pq);cq.mutation.argumentids='["foreign"]';const bad=plan(project(q));assert.equal(bad.symbols.call(q,cq),null);assert.ok(bad.notes.some(n=>n.includes('ordered formal')));
});

test('semantic or equal-value object replacement expires the complete current symbol inventory',()=>{
 for(const edit of [(p,t,d)=>d.prototype.mutation.proccode='edited',(p,t)=>t.variables.global=['newGlobal',0],(p,t)=>{t.blocks.local={opcode:'arcade_getLocal',inputs:{NAME:[1,[10,'f']]},fields:{}};},(p,t,d)=>{t.blocks[d.id]={...d.definition};}]){
  const t=target('Game'),d=procedure(t,'f'),p=project(t),before=plan(p);edit(p,t,d);assert.equal(before.symbols.current(),false);assert.equal(before.symbols.name(t,'f'),null);assert.ok(before.notes.some(n=>n.includes('changed')));
 }
});

test('caller locals, formals and captures cannot shadow a newly preserved short call name',()=>{
 for(const opcode of ['arcade_getLocal','arcade_setLocal','arcade_getCaptured','arcade_setCaptured']){
  const t=target('Game');procedure(t,'f');t.blocks.read={opcode,inputs:{NAME:[1,[10,'f']]},fields:{}};assert.notEqual(plan(project(t)).symbols.name(t,'f'),'f');
 }
 const t=target('Game');procedure(t,'f');procedure(t,'caller %s',['f']);assert.notEqual(plan(project(t)).symbols.name(t,'f'),'f');
});

test('SDK/language/runtime and late generated families reserve hygiene without becoming owners',()=>{
 const names=['music','tiles','const','Array','_Wait','_listText','__bwLiteralNegativeZero','__bwStartup','__bwStartup___','__bwAnimationFrames3','__bwSongAssets','myTiles','__bwFrames_shared1','__bwNamedArray_x','__bwBinaryAdd','__bwNamedArrayGet'];
 const t=target('Game');for(const n of names)procedure(t,n);const{symbols}=plan(project(t));for(const n of names)assert.notEqual(symbols.name(t,n),n,n);
 assert.equal(symbols.name(t,'__bwBinarySubtract'),null);assert.equal(new Set(symbols.values()).size,names.length);
});

test('ordinary actual ownership, not reserved spelling, controls callable pinning',()=>{
 const t=target('Game');procedure(t,'f');procedure(t,'g');const{symbols,notes}=plan(project(t));assert.equal(symbols.pin(t,'missing','newName'),false);assert.equal(symbols.pin(t,'f',symbols.name(t,'g')),false);assert.ok(notes.length);assert.equal(symbols.pin(t,'f','qualifiedLexicalDeclaration'),true);assert.equal(symbols.name(t,'f'),'qualifiedLexicalDeclaration');
});

test('native inherited procedure-cache keys are refused without banning ordinary local constructor names',()=>{
 const t=target('Game');procedure(t,'constructor');procedure(t,'valid %s',['constructor']);const{symbols,notes}=plan(project(t));assert.equal(symbols.name(t,'constructor'),null);assert.ok(symbols.name(t,'valid %s'));assert.ok(notes.length);
});

const build=source=>{const imported=arcadeToPseudocode(source);retain('public-import',{source,imported,channels:channelState(imported)});assert.deepEqual(imported.unsupported,[]);const creator=new Creator();try{creator.parse(imported.code);for(const upload of imported.costumes||[])creator.applyCustomSVG(upload.sprite,upload.svg);}catch(error){retain('Creator-exception',{name:error.name,message:error.message,stack:error.stack,channels:channelState(error),creatorChannels:channelState(creator),project:creator.project});throw error;}retain('Creator-return',{channels:channelState(creator),project:creator.project});for(const k of ['warnings','errors','unparsed'])assert.deepEqual(creator[k],[]);return{creator,imported};};
const output=creator=>exportGraph(creator.project,{costumeSvg:(_target,costume)=>creator.assets.get(costume?.assetId)?.data});

test('real public import/Creator/current export keeps a nonzero-argument function name across three trips',()=>{
 let source='function sum(a:number,b:number):number{return a+b}let total=sum(1,2);';
 for(let i=0;i<3;i++){const{creator}=build(source),before=JSON.stringify(creator.project),result=output(creator);assert.deepEqual(result.unsupported,[]);assert.deepEqual(result.warnings,[]);assert.equal(JSON.stringify(creator.project),before);assert.match(result.files['main.ts'],/function sum\s*\(/);const calls=[];const visit=node=>{if(!node||typeof node!=='object')return;if(node.type==='Call'&&node.callee?.type==='Identifier'&&node.callee.name==='sum')calls.push(node);for(const value of Object.values(node))if(typeof value==='object')Array.isArray(value)?value.forEach(visit):visit(value);};visit(parseMakeCodeTs(result.files['main.ts']));const number=node=>node?.type==='Number'?node.value:node?.type==='Binary'&&node.op==='+'&&number(node.left)===0?number(node.right):NaN;assert.equal(calls.length,1);assert.deepEqual(calls[0].args.map(number),[1,2]);assert.doesNotMatch(result.files['main.ts'],/function (?:Game_)+sum/);source=result.files['main.ts'];}
});

test('recursive and mutual actual function calls retain consistent declaration owners',()=>{
 const {creator}=build('function even(n:number):number{if(n==0)return 1;return odd(n-1)}function odd(n:number):number{if(n==0)return 0;return even(n-1)}let answer=even(4);');const result=output(creator);assert.deepEqual(result.unsupported,[]);for(const name of ['even','odd']){assert.match(result.files['main.ts'],new RegExp('function '+name+'\\s*\\('));assert.match(result.files['main.ts'],new RegExp(name+'\\('));}
});

test('a real artwork callback edit after symbol planning keeps a named currentness refusal',()=>{
 const {creator}=build('function keep(n:number):number{return n}let answer=keep(3);let hero=sprites.create(img`1`,SpriteKind.Player);');const t=creator.project.targets.find(t=>!t.isStage),proto=Object.values(t.blocks).find(b=>b.opcode==='procedures_prototype');let calls=0,changed=false;
 const result=exportGraph(creator.project,{costumeSvg:(_target,costume)=>{if(++calls>creator.project.targets.length&&!changed){proto.mutation.proccode+=' edited';changed=true;}return creator.assets.get(costume?.assetId)?.data;}});
 assert.equal(changed,true,'existing callback must actually mutate after initial palette reads');assert.ok(result.unsupported.some(n=>n.includes('current project or owner inventory changed')));
});


test('real zero-argument procedure name also survives repeated current public conversion',()=>{
 let source='function begin(){console.log(7)}begin();';
 for(let i=0;i<3;i++){const{creator}=build(source),result=output(creator);assert.deepEqual(result.unsupported,[]);assert.match(result.files['main.ts'],/function begin\s*\(/);assert.doesNotMatch(result.files['main.ts'],/function (?:Game_)+begin/);source=result.files['main.ts'];}
});

test('class field initializers keep their genuine ordinary helper call and body',()=>{
 const{creator}=build('class Box{value:number=7}let box=new Box();let answer=box.value;');const before=JSON.stringify(creator.project),result=output(creator);assert.deepEqual(result.unsupported,[]);assert.equal(JSON.stringify(creator.project),before);assert.match(result.files['main.ts'],/class Box/);assert.match(result.files['main.ts'],/value:\s*number\s*=\s*[A-Za-z_$][\w$]*\(\)/);assert.match(result.files['main.ts'],/return (?:\(0 \+ )?7\)?/);
});


test('managed calls bind actual current argument-chain ownership without padding default arguments',()=>{
 const t=target('Game');procedure(t,'f');const c={opcode:'arcade_callFunction',parent:null,next:null,topLevel:true,shadow:false,fields:{},inputs:{NAME:[1,[10,'f']],ARGS:[1,[10,'[]']]}};t.blocks.call=c;const{symbols}=plan(project(t));assert.equal(symbols.call(t,c),'f');
 const other=target('Game');procedure(other,'f');const a={opcode:'arcade_functionArgument',parent:'call',next:null,topLevel:false,shadow:false,fields:{},inputs:{VALUE:[1,[4,'1']],REST:[1,'arg']}};other.blocks.call={...c,inputs:{...c.inputs,ARGS:[1,'arg']}};other.blocks.arg=a;const bad=plan(project(other));assert.equal(bad.symbols.call(other,other.blocks.call),null);assert.ok(bad.notes.some(n=>n.includes('argument chain')));
});

test('definition/prototype/formal sockets and shadow roles are actual schema, not just slot[1]',()=>{
 const changes=[
  (t,p)=>p.definition.inputs.custom_block[0]=99,
  (t,p)=>p.definition.inputs.custom_block.push('extra'),
  (t,p)=>p.definition.shadow=true,
  (t,p)=>p.prototype.shadow=false,
  (t,p)=>p.prototype.topLevel=true,
  (t,p)=>p.prototype.inputs[p.ids[0]][0]=99,
  (t,p)=>p.prototype.inputs[p.ids[0]].push('extra'),
  (t,p)=>t.blocks[p.prototype.inputs[p.ids[0]][1]].shadow=false,
  (t,p)=>t.blocks[p.prototype.inputs[p.ids[0]][1]].inputs.hidden=[1,[4,'0']],
  (t,p)=>t.blocks[p.prototype.inputs[p.ids[0]][1]].fields.hidden=['x',null]
 ];
 for(const edit of changes){const t=target('Game'),p=procedure(t,'f %s',['value']);edit(t,p);const{symbols,notes}=plan(project(t));assert.equal(symbols.name(t,'f %s'),null);assert.ok(notes.some(n=>n.includes('malformed')));}
 const t=target('Game'),p=procedure(t,'f %s',['value']),c=stock(t,p);c.inputs[p.ids[0]]=[99,[4,'1']];const bad=plan(project(t));assert.equal(bad.symbols.call(t,c),null);assert.ok(bad.notes.some(n=>n.includes('input binding')));
});

test('plain JSON owner snapshots reject hidden and symbol semantic properties without getter calls',()=>{
 for(const edit of [
  (p,t,d,get)=>Object.defineProperty(d.prototype.mutation,'proccode',{get,enumerable:false}),
  (p,t,d,get)=>Object.defineProperty(d.prototype.mutation,'argumentnames',{get,enumerable:false}),
  (p,t,d,get)=>Object.defineProperty(d.prototype,'hidden',{value:'unrepresented',enumerable:false}),
  (p,t,d,get)=>Object.defineProperty(d.prototype,Symbol('hidden'),{value:'unrepresented',enumerable:true})
 ]){const t=target('Game'),d=procedure(t,'f');let getterCalls=0;const p=project(t);edit(p,t,d,()=>{getterCalls++;return'f';});const{symbols,notes}=plan(p);assert.equal(symbols.current(),false);assert.equal(symbols.name(t,'f'),null);assert.equal(getterCalls,0);assert.ok(notes.length);}
});

test('post-plan hidden formal or managed NAME edits expire before any getter is read',()=>{
 for(const kind of ['formal','NAME']){const t=target('Game'),d=procedure(t,'f'),c={opcode:'arcade_callFunction',inputs:{NAME:[1,[10,'f']],ARGS:[1,[10,'[]']]},fields:{},parent:null,topLevel:true,shadow:false,next:null};t.blocks.call=c;const p=project(t),{symbols,notes}=plan(p);let getterCalls=0;
  if(kind==='formal')Object.defineProperty(d.prototype.mutation,'argumentnames',{get(){getterCalls++;return'[]';},enumerable:false});
  else Object.defineProperty(c.inputs,'NAME',{get(){getterCalls++;return[1,[10,'f']];},enumerable:false});
  assert.equal(symbols.current(),false);assert.equal(symbols.call(t,c),null);assert.equal(getterCalls,0);assert.ok(notes.some(n=>n.includes('changed')||n.includes('actual current')));
 }
});

const astNodes=(root,predicate)=>{const result=[];const visit=node=>{if(!node||typeof node!=='object')return;if(predicate(node))result.push(node);for(const value of Object.values(node))if(typeof value==='object')Array.isArray(value)?value.forEach(visit):visit(value);};visit(root);return result;};
function callbackProject(name,opcode){
 const t=target('Game'),d=procedure(t,name),p=project(t);p.targets[0].variables.result=['answer',0];t.blocks.write={opcode:'data_setvariableto',inputs:{VALUE:[1,[4,'7']]},fields:{VARIABLE:['answer','result']},parent:d.id,next:null,topLevel:false,shadow:false};d.definition.next='write';const call=stock(t,d);call.parent='hat';call.topLevel=false;
 t.blocks.hat={opcode,inputs:opcode==='arcade_whenSpritesOverlap'?{A:[1,[10,'0']],B:[1,[10,'1']]}:opcode==='event_whenbroadcastreceived'?{}:{KIND:[1,[10,'0']]},fields:opcode==='event_whenbroadcastreceived'?{BROADCAST_OPTION:['go','broadcast']}:{},parent:null,next:Object.keys(t.blocks).find(id=>t.blocks[id]===call),topLevel:true,shadow:false};return p;
}

test('actual legacy created and overlap callback formals cannot capture ordinary function calls',()=>{
 for(const[name,opcode]of [['sprite','arcade_whenSpriteCreated'],['otherSprite','arcade_whenSpritesOverlap']]){const p=callbackProject(name,opcode),before=JSON.stringify(p),result=exportGraph(p);assert.deepEqual(result.unsupported,[]);assert.equal(JSON.stringify(p),before);const ast=parseMakeCodeTs(result.files['main.ts']),callbacks=astNodes(ast,n=>n.type==='FunctionExpression'&&n.params?.includes(name));assert.equal(callbacks.length,1);const calls=astNodes(callbacks[0].body,n=>n.type==='Call'&&n.callee?.type==='Identifier');assert.equal(calls.length,1);assert.notEqual(calls[0].callee.name,name);assert.ok(ast.body.some(n=>n.type==='FunctionDeclaration'&&n.name===calls[0].callee.name));assert.match(result.files['main.ts'],/answer\s*=\s*7/);}
});

test('actual restartable broadcast script _g local cannot capture an ordinary _g call',()=>{
 const p=callbackProject('_g','event_whenbroadcastreceived'),before=JSON.stringify(p),result=exportGraph(p);assert.deepEqual(result.unsupported,[]);assert.equal(JSON.stringify(p),before);const ast=parseMakeCodeTs(result.files['main.ts']),scripts=astNodes(ast,n=>n.type==='FunctionDeclaration'&&astNodes(n.body,b=>b.type==='Declaration'&&b.decls?.some(d=>d.name==='_g')).length>0);assert.equal(scripts.length,1);const calls=astNodes(scripts[0].body,n=>n.type==='Call'&&n.callee?.type==='Identifier');assert.equal(calls.some(n=>n.callee.name==='_g'),false);assert.ok(calls.some(n=>ast.body.some(d=>d.type==='FunctionDeclaration'&&d.name===n.callee.name&&astNodes(d.body,b=>b.type==='Assignment'&&b.left?.name==='answer').length>0)));assert.match(result.files['main.ts'],/answer\s*=\s*7/);
});


test('managed sockets reject malformed tags, arities, reporter roles and foreign terminators',()=>{
 const fixture=()=>{const t=target('Game');procedure(t,'f %s',['value']);t.blocks.call={opcode:'arcade_callFunction',parent:null,next:null,topLevel:true,shadow:false,fields:{},inputs:{NAME:[1,[10,'f %s']],ARGS:[2,'arg']}};t.blocks.arg={opcode:'arcade_functionArgument',parent:'call',next:null,topLevel:false,shadow:false,fields:{},inputs:{VALUE:[1,[4,'1']],REST:[1,'end']}};t.blocks.end={opcode:'text',parent:'arg',next:null,topLevel:false,shadow:true,fields:{TEXT:['[]',null]},inputs:{}};return t;};
 {const t=fixture(),{symbols,notes}=plan(project(t));assert.equal(symbols.call(t,t.blocks.call),'f');assert.deepEqual(notes,[]);}
 const changes=[
  t=>t.blocks.call.inputs.NAME[0]=99,t=>t.blocks.call.inputs.NAME.push('extra'),
  t=>t.blocks.call.inputs.ARGS[0]=99,t=>t.blocks.call.inputs.ARGS.push('extra'),
  t=>t.blocks.arg.inputs.VALUE[0]=99,t=>t.blocks.arg.inputs.VALUE.push('extra'),
  t=>t.blocks.arg.inputs.REST[0]=99,t=>t.blocks.arg.inputs.REST.push('extra'),
  t=>t.blocks.arg.shadow=true,t=>t.blocks.arg.topLevel=true,t=>t.blocks.arg.next='end',
  t=>t.blocks.end.parent='foreign',t=>t.blocks.end.shadow=false,t=>t.blocks.end.topLevel=true,
  t=>t.blocks.end.next='call',t=>t.blocks.end.inputs.EXTRA=[1,[10,'unused']],
  t=>t.blocks.call.fields.NAME=['f %s',null],t=>t.blocks.alias=t.blocks.end
 ];
 for(const change of changes){const t=fixture();change(t);const{symbols,notes}=plan(project(t));assert.equal(symbols.call(t,t.blocks.call),null);assert.ok(notes.length);}
 // Empty chains still require real shadow syntax, including the NAME socket.
 for(const input of ['NAME','ARGS']){const t=target('Game');procedure(t,'f');t.blocks.call={opcode:'arcade_callFunction',parent:null,next:null,topLevel:true,shadow:false,fields:{},inputs:{NAME:[1,[10,'f']],ARGS:[1,[10,'[]']]}};t.blocks.call.inputs[input][0]=99;assert.equal(plan(project(t)).symbols.call(t,t.blocks.call),null);}
});


test('actual compressed active primitives keep their native input mode without a type grant',()=>{
 const t=target('Game'),p=procedure(t,'f %s',['value']),call=stock(t,p);t.variables.id=['value',7];
 for(const mode of [2,3]){call.inputs[p.ids[0]]=mode===2?[2,[12,'value','id']]:[3,[12,'value','id'],[10,'']];const{symbols}=plan(project(t));assert.equal(symbols.call(t,call),'f');}
 t.blocks.managed={opcode:'arcade_callFunction',parent:null,next:null,topLevel:true,shadow:false,fields:{},inputs:{NAME:[1,[10,'f %s']],ARGS:[3,'arg',[4,'0']]}};
 t.blocks.arg={opcode:'arcade_functionArgument',parent:'managed',next:null,topLevel:false,shadow:false,fields:{},inputs:{VALUE:[3,[12,'value','id'],[10,'']],REST:[1,[10,'[]']]}};
 assert.equal(plan(project(t)).symbols.call(t,t.blocks.managed),'f');
});
