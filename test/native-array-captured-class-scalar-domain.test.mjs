import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {nativeArrayAddHelperSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
import {inspectNativeArrayBinaryDomains} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js';
import {nativeClassScalarView} from '../overlay/scratch-gui/src/lib/bw-makecode/native-class-scalar-view.js';
import {INHERITANCE_CAPTURED_SOURCE} from './fixtures/arcade-inheritance-captured-source.mjs';

const profile=GENERATED_HELPER_PROFILES.ordinary,helper=nativeArrayAddHelperSource('__bwBinaryAdd',true,true);
const clean=value=>{for(const key of ['unsupported','warnings','errors','unparsed'])if(Object.hasOwn(value,key))assert.deepEqual(value[key],[],key);};
function parseImported(files){const imported=arcadeToPseudocode(files);clean(imported);assert.doesNotMatch(imported.code,/^\s*# unsupported:/m);const creator=new Creator();creator.parse(imported.code);clean(creator);return creator;}
let failureSerial=0;
function exportCreator(creator){const before=JSON.stringify(creator.project),exported=projectToArcade(creator.project);
 if(exported.unsupported?.length&&process.env.BW_NATIVE_FRAME_FAILURE_DIR){
  try{writeFileSync(`${process.env.BW_NATIVE_FRAME_FAILURE_DIR}/class-export-failure-${failureSerial++}.json`,JSON.stringify({project:JSON.parse(before),result:exported},null,2),{flag:'wx',mode:0o600});}
  catch(_){console.warn('Class captured export failure capture unavailable');}
 }
 clean(exported);assert.equal(JSON.stringify(creator.project),before,'direct export preserves the actual parsed project');assert.equal(typeof exported.ts,'string');assert.equal(exported.files['main.ts'],exported.ts);return exported;}
function feedback(creator){const code=creator.decompile();assert.match(code,/DEVICE ARCADE/);assert.doesNotMatch(code,/^\s*# unsupported:/m);const next=new Creator();next.parse(code);clean(next);return next;}
const core='function append(s:any){trace=__bwBinaryAdd(trace,s)}class Base {}class Child extends Base {constructor(){super();append("b")}write(v:any){trace=__bwBinaryAdd(trace,v)}}';
const tail='let trace:any;trace="";let instance=new Child();instance.write("x");append("s");';
const inspect=text=>{const program=parseMakeCodeTs(helper+';'+text,profile);return {program,proof:inspectNativeArrayBinaryDomains(program,profile)};};
function good(text){const out=inspect(text);assert.equal(out.proof.reason,null,text);assert.equal(out.proof.helpers.size,1,text);assert.equal(out.proof.current(),true);return out;}
function bad(text){const out=inspect(text);assert.equal(out.proof.helpers.size,0,text);return out;}
function nodesOf(node,out=[]){if(!node||typeof node!=='object')return out;if(Array.isArray(node)){for(const value of node)nodesOf(value,out);return out;}out.push(node);for(const [key,value]of Object.entries(node))if(!['originalBody','parameterDefaults','paramTypes','returnType','assertedType'].includes(key))nodesOf(value,out);return out;}

test('complete original inheritance source retains every field, super, virtual, alias and conditional writer through export and real feedback',()=>{
 const original=readFileSync(new URL('./makecode-arcade-class-inheritance.test.mjs',import.meta.url),'utf8');
 assert.equal(original.split('await qualify(`'+INHERITANCE_CAPTURED_SOURCE+"`,{trace:'xfgsfbVPcVP',result:8,same:true});").length,2,'the entire original public literal is retained');
 const first=parseImported(INHERITANCE_CAPTURED_SOURCE),exported=exportCreator(first);
 assert.match(exported.ts,/class Base/);assert.match(exported.ts,/class Child extends Base/);assert.match(exported.ts,/super\(/);assert.match(exported.ts,/\.virtual\(/);
 for(const value of ['"f"','"g"','"s"','"x"','"U"','"V"','"P"','"Z"'])assert.ok(exported.ts.includes(value),value+' actual source path retained');
 assert.match(exported.ts,/alias/);assert.match(exported.ts,/undefined/);assert.match(exported.ts,/if\s*\(/);
 const reimported=parseImported(exported.files);exportCreator(reimported);
 const codeReturned=feedback(reimported);exportCreator(codeReturned);
});

test('alpha-renamed complete source and closed primitive branch writers acquire no spelling or annotation authority',()=>{
 let renamed=INHERITANCE_CAPTURED_SOURCE;
 for(const [from,to]of [['trace','history'],['mark','note'],['Base','Parent'],['Child','Descendant'],['virtual','visit'],['read','total'],['alias','reference'],['x','instance'],['p','parentValue'],['q','childValue']])renamed=renamed.replace(new RegExp('\\b'+from+'\\b','g'),to);
 const creator=parseImported(renamed),exported=exportCreator(creator);assert.match(exported.ts,/class Descendant extends Parent/);exportCreator(feedback(creator));
 good(core+tail);
 good(core.replace('trace=__bwBinaryAdd(trace,v)','let choice:any=undefined;if(v){choice="a"}else{choice=undefined}trace=__bwBinaryAdd(trace,choice)')+tail);
});

test('complete captured scalar closure refuses late nonprimitive writers, unknown calls and callback exposure',()=>{
 for(const writer of ['{}','[1]','foreign()','img`1`'])bad(core+tail+'trace='+writer+';');
 bad(core.replace('trace=__bwBinaryAdd(trace,s)','trace=__bwBinaryAdd(trace,foreign(s))')+tail);
 bad(core+tail+'append({});');
 bad(core+tail+'foreign(function(value:any){trace=value});');
 bad(core+tail+'game.onUpdate(function(){trace={}});');
 bad(core+tail+'let escaped=append;foreign(escaped);');
 bad(core+tail+'Object.defineProperty(instance,"write",{value:foreign});');
 // These complete derived-class sources require the new captured-cell route;
 // a closed receiver row alone cannot hide scalar writers or ambient effects.
 bad(core+tail+'function overwrite(){trace={}}overwrite();');
 bad(core+tail+'trace=true?"still primitive":{};');
 bad(core+tail+'unknownAmbient;');
 bad(core+tail+'trace=void 0;');
 bad(core+tail+'append();');
 bad(core+tail+'instance.write({});');
 bad('function detached(){return __bwBinaryAdd(this.value,1)}class Base {}let trace="";detached();');
});

test('declaration readiness remains separate from domains across early construction, static effects and changed parents',()=>{
 bad(core+'let instance=new Child();let trace:any;trace="";instance.write("x");');
 bad(core+'let trace:any=new Child();');
 bad(core.replace('class Child extends Base {','class Child extends Base {static early=append("early");')+tail);
 bad(core.replace('extends Base','extends Foreign')+tail);
 bad(core.replace('class Child extends Base {','Base=foreign;class Child extends Base {')+tail);
 bad(core+'while(false){let trace:any;trace=""}let instance=new Child();');
 bad('class Base {}class Child extends Base {read(){return __bwBinaryAdd(trace,"!")}}let instance=new Child();instance.read();let trace:any;trace="";');
});

test('captured Identifier projection is privately issued and retains original operand identity and source',()=>{
 const source=(core+tail).replaceAll('__bwBinaryAdd(trace,s)','trace+s').replaceAll('__bwBinaryAdd(trace,v)','trace+v');
 const original=parseMakeCodeTs(source,profile),before=structuredClone(original),view=nativeClassScalarView(original,profile);
 assert.deepEqual(original,before,'class view does not change the complete actual source');
 const append=view.program.body.find(node=>node.type==='FunctionDeclaration'&&node.name==='append');assert.ok(append);
 const candidates=nodesOf(append.body).filter(node=>node.type==='Conditional'&&node.test?.type==='Identifier'&&node.test.name==='trace');assert.ok(candidates.length>0,'actual captured read is projected');
 const carrier=candidates[0];assert.equal(view.hasNormalPrimitiveResult(carrier),true);assert.equal(view.hasNormalPrimitiveResult(structuredClone(carrier)),false,'copied carrier is not issued');
 assert.equal(view.hasCapturedPrimitiveRead(carrier),true);assert.equal(view.hasCapturedPrimitiveRead(structuredClone(carrier)),false,'a copied capture cannot borrow its entry proof');
 const other=nativeClassScalarView(parseMakeCodeTs(source,profile),profile);assert.equal(other.hasNormalPrimitiveResult(carrier),false,'another view cannot lend membership');
 assert.equal(other.hasCapturedPrimitiveRead(carrier),false,'another view cannot lend captured binding authority');
 const receivers=nativeClassScalarView(parseMakeCodeTs('class Base {value=1;read(){return this.value}}class Child extends Base {read(){return super.read()}}let object=new Child();object.read();',profile),profile);
 const receiverCarriers=nodesOf(receivers.program).filter(node=>node.type==='Conditional'&&receivers.hasOwnedReceiverResult?.(node));
 assert.equal(receiverCarriers.length,2,'actual owned this and super entries each issue a result-local proof');
 for(const entry of receiverCarriers){assert.equal(receivers.hasOwnedReceiverResult(structuredClone(entry)),false);assert.equal(other.hasOwnedReceiverResult?.(entry),false);}
 const originalRead=original.body.find(node=>node.type==='FunctionDeclaration'&&node.name==='append').body[0].expr.right.left;
 assert.equal(originalRead.type,'Identifier');assert.equal(originalRead.name,'trace');assert.equal(carrier.test,originalRead,'the retained test is the exact original captured read, not its assignment destination');
 const saved=carrier.test;carrier.test={type:'Identifier',name:'trace'};assert.equal(view.hasNormalPrimitiveResult(carrier),false);carrier.test=saved;assert.equal(view.hasNormalPrimitiveResult(carrier),false,'restored identity cannot revive an observed edit');
});

test('used captured-domain source and ambient changes expire permanently without changing old producers',()=>{
 const {program,proof}=good(core+tail),declaration=program.body.find(node=>node.type==='Declaration'&&node.decls.some(decl=>decl.name==='trace'));assert.ok(declaration);
 const actual=declaration.decls.find(decl=>decl.name==='trace'),saved=actual.init;actual.init={type:'Object',props:[]};assert.equal(proof.current(),false);actual.init=saved;assert.equal(proof.current(),false,'source restoration cannot revive a used captured proof');
 assert.equal(inspectNativeArrayBinaryDomains(program,profile).helpers.size,1,'a fresh proof independently rechecks restored source');
 const fresh=good(core+tail),name='__bwCapturedClassScalarPrototypeControl';assert.equal(Object.hasOwn(Object.prototype,name),false);let changed,restored;
 try{Object.defineProperty(Object.prototype,name,{value:1,configurable:true});changed=fresh.proof.current();delete Object.prototype[name];restored=fresh.proof.current();}finally{delete Object.prototype[name];}
 assert.equal(changed,false);assert.equal(restored,false,'observed prototype ABA cannot revive the used new fact');
});
