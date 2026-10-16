import test from 'node:test';
import assert from 'node:assert/strict';
import {createOrdinaryExportSymbols} from '../overlay/scratch-gui/src/lib/bw-makecode/ordinary-export-symbols.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';

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

const build=source=>{const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);const creator=new Creator();creator.parse(imported.code);for(const upload of imported.costumes||[])creator.applyCustomSVG(upload.sprite,upload.svg);for(const k of ['warnings','errors','unparsed'])assert.deepEqual(creator[k],[]);return{creator,imported};};
const output=creator=>projectToArcade(creator.project,{costumeSvg:(_target,costume)=>creator.assets.get(costume?.assetId)?.data});

test('real public import/Creator/current export keeps a nonzero-argument function name across three trips',()=>{
 let source='function sum(a:number,b:number):number{return a+b}let total=sum(1,2);';
 for(let i=0;i<3;i++){const{creator}=build(source),before=JSON.stringify(creator.project),result=output(creator);assert.deepEqual(result.unsupported,[]);assert.deepEqual(result.warnings,[]);assert.equal(JSON.stringify(creator.project),before);assert.match(result.files['main.ts'],/function sum\s*\(/);assert.match(result.files['main.ts'],/sum\(1, 2\)/);assert.doesNotMatch(result.files['main.ts'],/function (?:Game_)+sum/);source=result.files['main.ts'];}
});

test('recursive and mutual actual function calls retain consistent declaration owners',()=>{
 const {creator}=build('function even(n:number):number{if(n==0)return 1;return odd(n-1)}function odd(n:number):number{if(n==0)return 0;return even(n-1)}let answer=even(4);');const result=output(creator);assert.deepEqual(result.unsupported,[]);for(const name of ['even','odd']){assert.match(result.files['main.ts'],new RegExp('function '+name+'\\s*\\('));assert.match(result.files['main.ts'],new RegExp(name+'\\('));}
});

test('a real artwork callback edit after symbol planning keeps a named currentness refusal',()=>{
 const {creator}=build('function keep(n:number):number{return n}let answer=keep(3);');const t=creator.project.targets.find(t=>!t.isStage),proto=Object.values(t.blocks).find(b=>b.opcode==='procedures_prototype');let calls=0,changed=false;
 const result=projectToArcade(creator.project,{costumeSvg:(_target,costume)=>{if(++calls>creator.project.targets.length&&!changed){proto.mutation.proccode+=' edited';changed=true;}return creator.assets.get(costume?.assetId)?.data;}});
 assert.equal(changed,true,'existing callback must actually mutate after initial palette reads');assert.ok(result.unsupported.some(n=>n.includes('current project or owner inventory changed')));
});


test('real zero-argument procedure name also survives repeated current public conversion',()=>{
 let source='function begin(){console.log(7)}begin();';
 for(let i=0;i<3;i++){const{creator}=build(source),result=output(creator);assert.deepEqual(result.unsupported,[]);assert.match(result.files['main.ts'],/function begin\s*\(/);assert.doesNotMatch(result.files['main.ts'],/function (?:Game_)+begin/);source=result.files['main.ts'];}
});

test('class field initializers keep their genuine ordinary helper call and body',()=>{
 const{creator}=build('class Box{value:number=7}let box=new Box();let answer=box.value;');const before=JSON.stringify(creator.project),result=output(creator);assert.deepEqual(result.unsupported,[]);assert.equal(JSON.stringify(creator.project),before);assert.match(result.files['main.ts'],/class Box/);assert.match(result.files['main.ts'],/value:\s*number\s*=\s*[A-Za-z_$][\w$]*\(\)/);assert.match(result.files['main.ts'],/return 7/);
});


test('managed calls bind actual current argument-chain ownership without padding default arguments',()=>{
 const t=target('Game');procedure(t,'f');const c={opcode:'arcade_callFunction',parent:null,next:null,topLevel:true,shadow:false,fields:{},inputs:{NAME:[1,[10,'f']],ARGS:[1,[10,'[]']]}};t.blocks.call=c;const{symbols}=plan(project(t));assert.equal(symbols.call(t,c),'f');
 const other=target('Game');procedure(other,'f');const a={opcode:'arcade_functionArgument',parent:'call',next:null,topLevel:false,shadow:false,fields:{},inputs:{VALUE:[1,[4,'1']],REST:[1,'arg']}};other.blocks.call={...c,inputs:{...c.inputs,ARGS:[1,'arg']}};other.blocks.arg=a;const bad=plan(project(other));assert.equal(bad.symbols.call(other,other.blocks.call),null);assert.ok(bad.notes.some(n=>n.includes('argument chain')));
});
