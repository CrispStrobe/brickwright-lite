import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {physicalUpdateSourceSnapshot} from '../overlay/scratch-gui/src/lib/bw-makecode/physical-update-source-snapshot.js';
import {preparePhysicalUpdateThrowSource,physicalUpdateSourceFor} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
import {prepareThrowSource,prepareThrowEmission,reproveThrowEmission,hasThrowEmission} from '../overlay/scratch-gui/src/lib/bw-makecode/throw-source-gate.js';
import {lowerObjectClasses,validatePhysicalUpdateLowering} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-object-classes.js';
import {lowerStaticCallbackHelpers} from '../overlay/scratch-gui/src/lib/bw-makecode/static-callback-helpers.js';
import {lowerLazyValues} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-lazy-values.js';
import {sdkSpriteExportClasses} from '../overlay/scratch-gui/src/lib/bw-makecode/sdk-sprite-class-descriptors.js';
const guest=`let ticks=0
let entered=0
let child=0
let after=0
let detached=0
function fail(){child=1;throw "physical-update"}
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){detached+=1})
class Actor extends sprites.ExtendableSprite {
 constructor(){super(img\`1\`,SpriteKind.Player)}
 update(dt:number){ticks+=1;if(entered===0){entered=1;fail();after=1}}
}
let actor=new Actor()`;
const parse=source=>parseMakeCodeTs(source,{retainCallableMetadata:true,retainClassHeritage:true,retainParentheses:true,parameterDefaults:true});
const proof=source=>prepareThrowSource(parse(source));
let observations=0;
const retain=(label,value)=>{if(!process.env.BW_THROW_PHYSICAL_SOURCE_EVIDENCE_DIR)return;const out=process.env.BW_THROW_PHYSICAL_SOURCE_EVIDENCE_DIR;fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,String(++observations).padStart(4,'0')+'-'+label+'.json'),JSON.stringify(value,null,2)+'\n',{flag:'wx'});};
const bridge=source=>{const program=parse(source),sourceProof=prepareThrowSource(program);assert.deepEqual(sourceProof.unsupported,[]);const lowered=lowerObjectClasses(program,{physicalUpdateSource:sourceProof.physicalUpdateSource});assert.deepEqual(lowered.unsupported,[]);return {program,sourceProof,lowered};};
const finalProgram=lowered=>lowerLazyValues(lowerStaticCallbackHelpers(lowered.program).program);

test('complete original physical Throw guest stays byte exact and reaches the opt-in converter',()=>{
 const native=fs.readFileSync(new URL('./makecode-arcade-physical-update-owner-native.test.mjs',import.meta.url),'utf8');
 assert.ok(native.includes('const source=`'+guest.replaceAll('`','\\`')+'`;'),'exact complete original guest, not a surrogate');
 const result=arcadeToPseudocode(guest,{throwPrototype:true});retain('original-public-converter',{source:guest,result});
 assert.deepEqual(result.unsupported,[]);assert.match(result.code,/arcade throw \("physical-update"\)/);assert.match(result.code,/arcade declare subclass/);assert.match(result.code,/WHEN (?:arcade button handler|space key pressed)/);
});
test('physical source does not enable Throw without its explicit canonical option',()=>{
 const result=arcadeToPseudocode(guest);retain('prototype-required',result);assert.ok(result.unsupported.some(row=>/canonical protocol/.test(row)));assert.doesNotMatch(result.code,/^\s*arcade throw /m);
});
test('actual method has its pre-construction globals and leaves its source signature immutable',()=>{
 const program=parse(guest),method=program.body.find(node=>node.type==='Class').methods.find(node=>node.name==='update'),before=physicalUpdateSourceSnapshot(program),returnType=method.returnType;
 const receipt=preparePhysicalUpdateThrowSource(program),entry=physicalUpdateSourceFor(program,receipt);assert.deepEqual(receipt.unsupported,[]);assert.ok(entry.hasMethod(method));
 assert.deepEqual(entry.methods()[0].globals.filter(decl=>['ticks','entered','child','after','detached'].includes(decl.name)).map(decl=>decl.name),['ticks','entered','child','after','detached']);
 const lowered=lowerObjectClasses(program,{physicalUpdateSource:receipt});assert.deepEqual(lowered.unsupported,[]);assert.equal(method.returnType,returnType);assert.ok(before.current());
});
test('source initialization uses the earliest allocation rather than completed construction',()=>{
 for(const source of [guest.replace('let entered=0\n','')+'\nlet entered=0',guest.replace('let actor=new Actor()','let actor=new Actor()\nlet later=1').replace('entered===0','later===0')]){
  const result=proof(source);retain('early-construction',result);assert.ok(result.unsupported.some(row=>/dominating initialization/.test(row)));
 }
});
test('all actual construction sites intersect their own current initialization entries',()=>{
 assert.deepEqual(proof(guest+'\nlet another=new Actor()').unsupported,[]);
 const early=guest.replace('let entered=0\n','let first=new Actor()\nlet entered=0\n');assert.ok(proof(early).unsupported.length);
});
test('deferred recursive and conditional allocations do not borrow the root entry',()=>{
 for(const tail of ['function later(){let actor=new Actor()}later()','function later(){later();let actor=new Actor()}later()','if(true){let actor=new Actor()}'])assert.ok(proof(guest.replace('let actor=new Actor()',tail)).unsupported.length,tail);
});
test('actual SDK ancestry refuses shadowing replacement and unrelated class spellings',()=>{
 for(const source of ['let sprites:any=0\n'+guest,guest.replace('sprites.ExtendableSprite','Other'),'class Other {}\n'+guest.replace('sprites.ExtendableSprite','Other'),guest+'\nActor=Other'])assert.ok(proof(source).unsupported.length,source);
});
test('receiver escape extracted and direct update calls cannot gain a physical entry',()=>{
 for(const tail of ['actor.update(20)','let action=actor.update','consume(actor)','let box=[actor]'])assert.ok(proof(guest+'\n'+tail).unsupported.length,tail);
});
test('method signature and actual operand producer constraints remain enforced',()=>{
 for(const source of [guest.replace('dt:number','dt:string'),guest.replace('update(dt:number)','private update(dt:number)'),guest.replace('throw "physical-update"','throw image.create(1,1)'),guest.replace('update(dt:number)','update(dt:number=20)')])assert.ok(proof(source).unsupported.length,source);
});
test('ordinary constructor and unqualified game callback Throw contexts remain refused',()=>{
 for(const source of ['class Actor{constructor(){throw 1}}let actor=new Actor()','game.onUpdate(function(){throw 1})'])assert.ok(proof(source).unsupported.length);
});
test('private source receipt cannot be copied attached or transplanted onto a clone',()=>{
 const program=parse(guest),receipt=preparePhysicalUpdateThrowSource(program);assert.ok(physicalUpdateSourceFor(program,receipt));
 assert.equal(physicalUpdateSourceFor(program,{...receipt}),null);assert.equal(physicalUpdateSourceFor(structuredClone(program),receipt),null);
 assert.ok(lowerObjectClasses(program,{physicalUpdateSource:{...receipt}}).unsupported.length);
});
test('late actual source changes expire original source and lowered proof',()=>{
 const {program,sourceProof,lowered}=bridge(guest);program.body[0].decls[0].init.value='7';
 assert.equal(physicalUpdateSourceFor(program,sourceProof.physicalUpdateSource),null);assert.ok(validatePhysicalUpdateLowering(lowered.program,lowered.physicalUpdateLowering).length);
});
test('single actual lowering reproof survives unchanged callback and lazy normalization',()=>{
 const {sourceProof,lowered}=bridge(guest),final=finalProgram(lowered);assert.deepEqual(validatePhysicalUpdateLowering(final,lowered.physicalUpdateLowering),[]);
 assert.deepEqual(prepareThrowEmission(final,sourceProof,lowered.physicalUpdateLowering),[]);assert.ok(hasThrowEmission(final));
});
test('generated method body mutation refuses instead of borrowing its former source facts',()=>{
 const {sourceProof,lowered}=bridge(guest),final=finalProgram(lowered),method=final.body.find(node=>node.type==='FunctionDeclaration'&&node.name==='__bwClass_Actor_update');
 method.body.push({type:'ThrowStatement',argument:{type:'Identifier',name:'unknown'}});
 assert.ok(prepareThrowEmission(final,sourceProof,lowered.physicalUpdateLowering).length);assert.equal(hasThrowEmission(final),false);
});
test('actual registration replacement and reordered roots fail current correspondence',()=>{
 for(const mutation of [program=>{const node=program.body.find(node=>node.expr?.callee?.name==='declareSubclass'&&node.expr.args[0].value==='Actor');node.expr.args.at(-1).value='[]';},program=>program.body.reverse()]){
  const {sourceProof,lowered}=bridge(guest),final=finalProgram(lowered);mutation(final);assert.ok(prepareThrowEmission(final,sourceProof,lowered.physicalUpdateLowering).length);
 }
});
test('copied lowering and public flags cannot issue final physical Throw emission',()=>{
 const {sourceProof,lowered}=bridge(guest),final=finalProgram(lowered);final.bwProvedThrowProgram=true;assert.equal(hasThrowEmission(final),false);
 assert.ok(prepareThrowEmission(final,sourceProof,{...lowered.physicalUpdateLowering}).length);assert.equal(hasThrowEmission(final),false);
});
test('final private emission expires on later method or root data changes',()=>{
 const {sourceProof,lowered}=bridge(guest),final=finalProgram(lowered);assert.deepEqual(prepareThrowEmission(final,sourceProof,lowered.physicalUpdateLowering),[]);
 final.body[0]={type:'ExpressionStatement',expr:{type:'Number',value:'7'}};assert.equal(hasThrowEmission(final),false);
});
test('snapshot distinguishes nonfinite signs signed zero and actual prototype roles',()=>{
 for(const [before,after]of [[Infinity,-Infinity],[-0,0],[NaN,Infinity]]){const node={value:before},snapshot=physicalUpdateSourceSnapshot(node);node.value=after;assert.equal(snapshot.current(),false);}
 const node={value:1},snapshot=physicalUpdateSourceSnapshot(node);Object.setPrototypeOf(node,null);assert.equal(snapshot.current(),false);
});
test('snapshot refuses accessors and cycles without invoking them and preserves shared metadata identity',()=>{
 let calls=0;const node={};Object.defineProperty(node,'body',{get(){calls++;return []}});assert.equal(physicalUpdateSourceSnapshot(node),null);assert.equal(calls,0);
 const cyclic={};cyclic.body=cyclic;assert.equal(physicalUpdateSourceSnapshot(cyclic),null);
 const metadata={text:'number'},shared={a:metadata,b:metadata},snapshot=physicalUpdateSourceSnapshot(shared);assert.ok(snapshot.current());shared.b={text:'number'};assert.equal(snapshot.current(),false);
});
test('shared executable subtrees refuse before recursive structural or graph admission',()=>{
 const program=parse(guest),method=program.body.find(node=>node.type==='Class').methods.find(node=>node.name==='update');method.body.push(method.body[0]);
 const receipt=preparePhysicalUpdateThrowSource(program);assert.ok(receipt.unsupported.some(row=>/shared or cyclic/.test(row)));assert.equal(physicalUpdateSourceFor(program,receipt),null);
});

test('direct primitive Throw is admitted only in the actual selected update owner',()=>{
 const source=guest.replace('fail();after=1','throw 20;after=1'),result=arcadeToPseudocode(source,{throwPrototype:true});retain('direct-method-primitive',{source,result});
 assert.deepEqual(result.unsupported,[]);assert.match(result.code,/arcade throw \(\(0 \+ \(20\)\)\)/);
});
test('final emission also expires when its actual source changes after lowering',()=>{
 const {program,sourceProof,lowered}=bridge(guest),final=finalProgram(lowered);assert.deepEqual(prepareThrowEmission(final,sourceProof,lowered.physicalUpdateLowering),[]);
 program.body[0].decls[0].init.value='8';assert.equal(hasThrowEmission(final),false);
});


const constructionRoles=program=>{
 const registrations=program.body.filter(node=>node.expr?.callee?.object?.name==='__bwObjects'&&node.expr.callee.name==='declareSubclass'&&node.expr.args[0].value==='Actor');assert.equal(registrations.length,1);
 const declaration=registrations[0].expr,signature=fn=>fn.name+fn.params.map(()=> ' %s').join(''),procedures=program.body.filter(node=>node.type==='FunctionDeclaration');
 const find=declared=>{const found=procedures.filter(fn=>signature(fn)===declared);assert.equal(found.length,1,declared);return found[0];};
 const initializer=find(declaration.args[3].value),constructor=find(declaration.args[4].value);
 const supers=procedures.filter(fn=>{const calls=fn.body.map(node=>node.expr).filter(node=>node?.callee?.object?.name==='__bwObjects'&&node.callee.name==='procedure');return calls.length===2&&calls[0].args[0].value===signature(initializer)&&calls[1].args[0].value===signature(constructor);});assert.equal(supers.length,1);
 const builtin=sdkSpriteExportClasses().find(row=>row.name===declaration.args[1].value);assert.ok(builtin?.intrinsic);assert.equal(builtin.name,'__bwSDK_ExtendableSprite');assert.equal(procedures.some(fn=>signature(fn)===builtin.constructor),false,'selected SDK constructor is a runtime intrinsic, not an invented emitted body');
 return {initializer,constructor,superConstructor:supers[0]};
};
test('generated constructor field initializer and super bodies remain bound to the real lowering',()=>{
 for(const role of ['constructor','initializer','superConstructor']){
  const {sourceProof,lowered}=bridge(guest),final=finalProgram(lowered),procedure=constructionRoles(final)[role];
  procedure.body.push({type:'ExpressionStatement',expr:{type:'Assignment',op:'=',left:{type:'Identifier',name:'entered'},right:{type:'Number',value:'7'}}});
  assert.ok(prepareThrowEmission(final,sourceProof,lowered.physicalUpdateLowering).length,role);assert.equal(hasThrowEmission(final),false);
 }
});
test('new or reordered generated procedures cannot borrow the protected root registrations',()=>{
 for(const mutate of [program=>program.body.push({type:'FunctionDeclaration',name:'injected',params:[],body:[]}),program=>{const indexes=program.body.map((node,index)=>node.type==='FunctionDeclaration'?index:-1).filter(index=>index>=0);[program.body[indexes[0]],program.body[indexes[1]]]=[program.body[indexes[1]],program.body[indexes[0]]];}]){
  const {sourceProof,lowered}=bridge(guest),final=finalProgram(lowered);mutate(final);assert.ok(prepareThrowEmission(final,sourceProof,lowered.physicalUpdateLowering).length);
 }
});

test('shared structural extraction preserves ordinary class defaults and original method bodies',()=>{
 const source='class Plain{value:number;constructor(value:number=7){this.value=value}read(step:number=2):number{return this.value+step}}let plain=new Plain()',program=parse(source),snapshot=physicalUpdateSourceSnapshot(program),result=lowerObjectClasses(program);
 retain('ordinary-default-lowering',{source,program:result.program,unsupported:result.unsupported});assert.deepEqual(result.unsupported,[]);assert.ok(snapshot.current());
 const declaration=result.program.body.find(node=>node.expr?.callee?.name==='declare'&&node.expr.args[0].value==='Plain').expr;
 assert.equal(JSON.parse(declaration.args[4].value)[0].default,7);assert.equal(JSON.parse(declaration.args[5].value).find(row=>row.name==='read').parameters[0].default,2);
 assert.ok(result.program.body.find(node=>node.name==='__bwClass_Plain_constructor').params.includes('value'));
});


test('actual unchanged emitter Program projection gets fresh proof without copying its brand',()=>{
 const {sourceProof,lowered}=bridge(guest),previous=finalProgram(lowered);assert.deepEqual(prepareThrowEmission(previous,sourceProof,lowered.physicalUpdateLowering),[]);
 const projected={...previous,body:previous.body.flatMap(node=>[node])};assert.equal(hasThrowEmission(projected),false);
 assert.deepEqual(reproveThrowEmission(projected,previous),[]);assert.equal(hasThrowEmission(projected),true);
 assert.ok(reproveThrowEmission({...projected},{}).length);
});
test('emitter projection cannot hide a changed generated constructor behind its private predecessor',()=>{
 const {sourceProof,lowered}=bridge(guest),previous=finalProgram(lowered);assert.deepEqual(prepareThrowEmission(previous,sourceProof,lowered.physicalUpdateLowering),[]);
 const projected=structuredClone(previous),ctor=projected.body.find(node=>node.name==='__bwClass_Actor_constructor');ctor.body.push({type:'ThrowStatement',argument:{type:'Number',value:'7'}});
 assert.ok(reproveThrowEmission(projected,previous).length);assert.equal(hasThrowEmission(projected),false);assert.equal(hasThrowEmission(previous),true);
});


test('outer publication expires after a projected-only body change without changing predecessor data',()=>{
 const {sourceProof,lowered}=bridge(guest),previous=finalProgram(lowered);assert.deepEqual(prepareThrowEmission(previous,sourceProof,lowered.physicalUpdateLowering),[]);
 const predecessor=physicalUpdateSourceSnapshot(previous),projected={...previous,body:previous.body.flatMap(node=>[node])};assert.deepEqual(reproveThrowEmission(projected,previous),[]);
 projected.body.push({type:'ExpressionStatement',expr:{type:'Number',value:'7'}});
 assert.ok(predecessor.current(),'actual predecessor objects and values unchanged');assert.equal(hasThrowEmission(projected),false);assert.equal(hasThrowEmission(previous),false,'publication includes actual consumed projection currentness');
 assert.ok(prepareThrowEmission(previous,sourceProof,lowered.physicalUpdateLowering).length);assert.equal(hasThrowEmission(previous),false,'remint cannot discard prior actual projection dependency');
});


test('projection lineage refuses A to B to A without creating recursive currentness',()=>{
 const {sourceProof,lowered}=bridge(guest),a=finalProgram(lowered);assert.deepEqual(prepareThrowEmission(a,sourceProof,lowered.physicalUpdateLowering),[]);
 const b={...a,body:[...a.body]};assert.deepEqual(reproveThrowEmission(b,a),[]);
 assert.ok(reproveThrowEmission(a,b).some(row=>/never-branded/.test(row)));assert.equal(hasThrowEmission(a),true);assert.equal(hasThrowEmission(b),true);
 assert.ok(reproveThrowEmission(b,a).length);assert.equal(hasThrowEmission(a),true);
});


test('actual callback normalization changes only the selected empty If alternative representation',()=>{
 const {lowered}=bridge(guest),before=lowered.program.body.find(node=>node.name==='__bwClass_Actor_update'),expected=structuredClone(before);
 assert.equal(expected.body[1].alternate,null);expected.body[1].alternate=[];
 const callbacks=lowerStaticCallbackHelpers(lowered.program),actual=callbacks.program.body.find(node=>node.name===before.name);retain('actual-normalization-delta',{before,after:actual});
 assert.deepEqual(callbacks.unsupported,[]);assert.deepEqual(actual,expected,'all other method operations, order and metadata remain exact');
 assert.deepEqual(validatePhysicalUpdateLowering(callbacks.program,lowered.physicalUpdateLowering),[]);
});
test('empty alternative correspondence refuses nonempty removed or descriptor-changed edges',()=>{
 for(const mutate of [branch=>branch.alternate.push({type:'ExpressionStatement',expr:{type:'Number',value:'7'}}),branch=>{delete branch.alternate;},branch=>Object.defineProperty(branch,'alternate',{value:[],enumerable:false,writable:true,configurable:true})]){
  const {sourceProof,lowered}=bridge(guest),final=finalProgram(lowered),branch=final.body.find(node=>node.name==='__bwClass_Actor_update').body[1];mutate(branch);
  assert.ok(prepareThrowEmission(final,sourceProof,lowered.physicalUpdateLowering).length);assert.equal(hasThrowEmission(final),false);
 }
});
test('empty alternative output correspondence does not excuse raw original-source drift',()=>{
 const {program,sourceProof,lowered}=bridge(guest),method=program.body.find(node=>node.type==='Class').methods.find(node=>node.name==='update');assert.equal(method.body[1].alternate,null);
 method.body[1].alternate=[];assert.equal(physicalUpdateSourceFor(program,sourceProof.physicalUpdateSource),null);assert.ok(validatePhysicalUpdateLowering(finalProgram(lowered),lowered.physicalUpdateLowering).length);
});


test('generated parameter default-metadata and body Array prototype edits are never normalized away',()=>{
 for(const key of ['params','parameterDefaults','body']){
  const {sourceProof,lowered}=bridge(guest),final=finalProgram(lowered),procedure=final.body.find(node=>node.name==='fail');assert.ok(Array.isArray(procedure[key]),key);
  Object.setPrototypeOf(procedure[key],null);assert.ok(prepareThrowEmission(final,sourceProof,lowered.physicalUpdateLowering).length,key);assert.equal(hasThrowEmission(final),false);
 }
});

test('output correspondence never invokes caller-supplied Array traversal methods',()=>{
 for(const key of ['forEach',Symbol.iterator]){
  const {sourceProof,lowered}=bridge(guest),final=finalProgram(lowered),procedure=final.body.find(node=>node.name==='fail');let calls=0;
  Object.defineProperty(procedure.body,key,{value(){calls++;throw new Error('caller method must remain unexecuted');},enumerable:true,writable:true,configurable:true});
  assert.ok(prepareThrowEmission(final,sourceProof,lowered.physicalUpdateLowering).length);assert.equal(calls,0);assert.equal(hasThrowEmission(final),false);
 }
});
