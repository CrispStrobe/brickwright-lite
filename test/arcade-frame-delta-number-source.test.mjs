import {createOrdinaryFrameDeltaNumberSource} from '../overlay/scratch-gui/src/lib/bw-makecode/ordinary-frame-delta-number-source.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {analyseSourceValueProducers,validateProcedureConstraintSource} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
const parse=text=>parseMakeCodeTs(text,{parameterDefaults:true,retainParentheses:true});
const nodes=(node,result=[])=>{if(!node||typeof node!=='object')return result;if(Array.isArray(node)){node.forEach(n=>nodes(n,result));return result;}result.push(node);for(const [key,value]of Object.entries(node))if(!['originalBody','parameterDefaults','paramTypes','returnType'].includes(key))nodes(value,result);return result;};
const read=program=>nodes(program).find(n=>n.type==='Member'&&n.name==='deltaTime');
const options={ordinaryPrimitiveSdkNumbers:true,sceneClockNumbers:true};
const source='let seen=0;function receive(n:number){seen=n;}receive(game.eventContext().deltaTime);';
test('frame delta is a selected actual source Number producer in an ordinary constrained caller',()=>{
 const p=parse(source),r=read(p);assert.ok(r);
 assert.equal(analyseSourceValueProducers(p,{unboundIsOpaque:true}).typesAt(r).has('Number'),false);
 assert.deepEqual([...analyseSourceValueProducers(p,{...options,unboundIsOpaque:true}).typesAt(r)],['Number']);
 assert.deepEqual(validateProcedureConstraintSource(p,options),[]);
});
test('a genuine frame callback retains numeric delta in addition and constrained argument positions',()=>{
 const p=parse('let elapsed=0;function receive(n:number){}game.onPaint(function(){elapsed=elapsed+game.eventContext().deltaTime;receive(game.eventContext().deltaTime);});');
 assert.deepEqual(validateProcedureConstraintSource(p,options),[]);
 for(const n of nodes(p).filter(n=>n.type==='Member'&&n.name==='deltaTime'))assert.deepEqual([...analyseSourceValueProducers(p,{...options,unboundIsOpaque:true}).typesAt(n)],['Number']);
});
test('actual frame reporter and Number caller survive Code, two saved JSON generations and SB3 reopen',async()=>{
 const create=input=>{const imported=arcadeToPseudocode(input);assert.deepEqual(imported.unsupported,[]);const c=new Creator();c.parse(imported.code);assert.deepEqual(c.errors,[]);assert.deepEqual(c.warnings,[]);return c;};
 const body=project=>{const blocks=project.targets.flatMap(t=>Object.values(t.blocks));assert.equal(blocks.filter(n=>n.opcode==='arcade_frameDeltaTime').length,1);assert.equal(blocks.filter(n=>n.opcode==='procedures_prototype'&&/receive/.test(n.mutation.proccode)).length,1);};
 let c=create(source);body(c.project);const code=new Creator();code.parse(c.decompile());assert.deepEqual(code.errors,[]);assert.deepEqual(code.warnings,[]);body(code.project);c=code;
 for(let generation=0;generation<2;generation++){const out=projectJsonToArcade(JSON.stringify(c.project));assert.deepEqual(out.unsupported,[],String(generation));assert.match(out.ts,/game\.eventContext\(\)\.deltaTime/);c=create(out.files);body(c.project);}
 const zip=await JSZip.loadAsync(await(await c.generateSB3()).arrayBuffer());const json=await zip.file('project.json').async('string');body(JSON.parse(json));const out=projectJsonToArcade(json);assert.deepEqual(out.unsupported,[]);body(create(out.files).project);
});

test('a Number annotation does not replace the actual mixed formal writer',()=>{
 const p=parse(source.replace('seen=n;','seen=n;n="text";'));
 assert.ok(validateProcedureConstraintSource(p,options).some(message=>/requires Number/.test(message)));
});

test('the actual lexical SDK root is distinct from a same-named local receiver',()=>{
 const p=parse('function local(game:any){return game.eventContext().deltaTime;}let n=game.eventContext().deltaTime;'),rs=nodes(p).filter(n=>n.type==='Member'&&n.name==='deltaTime'),proof=createOrdinaryFrameDeltaNumberSource(p);
 assert.equal(rs.length,2);assert.equal(proof.isNumberRead(rs[0]),false);assert.equal(proof.isNumberRead(rs[1]),true);assert.equal(proof.isNumberRead({...rs[1]}),false);
});
test('namespace aliases, context escapes, mutation and unknown calls do not grant a frame result',()=>{
 for(const neighbor of [
  'let g=game;', 'let f=game.eventContext;', 'let c=game.eventContext();',
  'game.eventContext=()=>({deltaTime:"text"});', 'game.eventContext().deltaTime=1;',
  'game.eventContext().deltaTime++;', 'delete game.eventContext().deltaTime;',
  'game.currentScene();', 'control.eventContext();', 'game.missing();',
  'game.toString();', 'game.constructor();', 'game.__proto__();',
  'let effect=foreign+0;', 'Math=1;', 'screen=0;', 'controller=0;', 'music=0;',
  'export function outsider(value:any){return value+0;}',
  'let saved=receive;', 'new receive(1);', 'receive<number>(1);',
  'namespace game {export let value=1;}', 'enum game {Value}',
  'function local(){if(false){var game:any;}return game.eventContext().deltaTime;}',
  'game.eventContext(1);', 'new game.eventContext();', 'game.eventContext<number>();',
  'game["eventContext"]();', 'globalThis.game.eventContext=()=>({});',
  'let root=this;root.game.eventContext=()=>({});',
  'let f=Function("return game");', 'let f=game.onPaint;',
  'game.onPaint(function(value){})', 'let handler=function(){};game.onPaint(handler);'
 ]){
  const p=parse(source+neighbor),r=read(p),proof=createOrdinaryFrameDeltaNumberSource(p);assert.equal(proof.isNumberRead(r),false,neighbor);
  // Escaped functions use their separate callable protocol; inspect the actual
  // result domain rather than demanding an ordinary-declaration diagnostic.
  assert.equal(analyseSourceValueProducers(p,{...options,unboundIsOpaque:true}).typesAt(r).has('Number'),false,neighbor);
 }
});
test('a supplied source option or borrowed facade cannot create Number producers',()=>{
 const p=parse(source+'let escaped=game.eventContext();'),r=read(p),other=createOrdinaryFrameDeltaNumberSource(parse(source));
 const graph=analyseSourceValueProducers(p,{...options,unboundIsOpaque:true,frameDeltaNumbers:new WeakSet([r]),frameDeltaNumberSource:other});assert.equal(graph.typesAt(r).has('Number'),false);
});
test('equal-shape replacement and namespace edits expire the actual proof and strengthened graph permanently',()=>{
 for(const edit of [p=>{read(p).object.args=[];},p=>{read(p).object.callee.name='other';}]){
  const p=parse(source),r=read(p),proof=createOrdinaryFrameDeltaNumberSource(p),graph=analyseSourceValueProducers(p,{...options,unboundIsOpaque:true});assert.equal(proof.isNumberRead(r),true);assert.deepEqual([...graph.typesAt(r)],['Number']);
  const old=r.object.args,name=r.object.callee.name;edit(p);assert.equal(proof.isNumberRead(r),false);assert.equal(proof.current(),false);assert.equal(graph.typesAt(r).size,0);
  r.object.args=old;r.object.callee.name=name;assert.equal(proof.current(),false);assert.equal(graph.typesAt(r).size,0);
 }
});
test('ambient helper machinery changes invalidate an issued frame source proof',()=>{
 const p=parse(source),r=read(p),proof=createOrdinaryFrameDeltaNumberSource(p),original=Object.getOwnPropertyDescriptor(Map.prototype,'get');assert.equal(proof.isNumberRead(r),true);
 try{Object.defineProperty(Map.prototype,'get',{...original,value:function(){return undefined;}});assert.equal(proof.current(),false);}finally{Object.defineProperty(Map.prototype,'get',original);}
 assert.equal(proof.current(),false);assert.equal(proof.isNumberRead(r),false);
});

test('unknown syntax and generic/spread function calls cannot hide an effectful source entry',()=>{
 for(const edit of [p=>p.body.push({type:'Unknown',raw:'unparsed effect'}),p=>{const call=nodes(p).find(n=>n.type==='Call'&&n.callee?.name==='receive');call.args[0]={type:'Spread',argument:call.args[0]};}]){
  const p=parse(source),r=read(p);edit(p);assert.equal(createOrdinaryFrameDeltaNumberSource(p).isNumberRead(r),false);
 }
});
