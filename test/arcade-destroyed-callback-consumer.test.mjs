import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
const parse=text=>parseMakeCodeTs(text,{parameterDefaults:true,retainParentheses:true,retainCallableMetadata:true});
const walk=(value,out=[])=>{if(!value||typeof value!=='object')return out;if(Array.isArray(value)){for(const n of value)walk(n,out);return out;}out.push(value);for(const [key,n]of Object.entries(value))if(!['originalBody','parameterDefaults','paramTypes','typeParameters','returnType','optionalParams'].includes(key))walk(n,out);return out;};
const source='let positions=0;let xs=[1];sprites.onDestroyed(SpriteKind.Enemy,function(sprite){positions+=sprite.x});';
const options={arrayValues:true,parenthesized:true,unboundIsOpaque:true,initializationEntries:true,ordinaryPrimitiveSdkNumbers:true};
test('destroyed callback supplies only its actual property result to the primitive consumer',()=>{
 const p=parse(source),read=walk(p).find(n=>n.type==='Member'&&n.name==='x'),fn=walk(p).find(n=>n.type==='FunctionExpression');
 const graph=analyseSourceValueProducers(p,options);assert.deepEqual([...graph.typesAt(read)],['Number']);
 assert.equal(graph.functionParameterTypes(fn,0).has('Sprite'),false);assert.equal(graph.functionParameterTypes(fn,0).has('Array'),false);
 const off=analyseSourceValueProducers(p,{...options,ordinaryPrimitiveSdkNumbers:false});assert.equal(off.typesAt(read).has('Number'),false);
 const captured=graph.typesAt(read);p.extra='changed';assert.deepEqual([...graph.typesAt(read)],[]);assert.equal(graph.lexicalDeclarationReadinessCurrent(),false);assert.deepEqual([...captured],['Number']);delete p.extra;assert.deepEqual([...graph.typesAt(read)],[]);
});
test('later fixed-point dependency mutation cannot authorize the callback property',()=>{
 const p=parse(source+'Fx.add=foreign;'),read=walk(p).find(n=>n.type==='Member'&&n.name==='x');
 assert.equal(analyseSourceValueProducers(p,options).typesAt(read).has('Number'),false);
});

test('actual primitive Array and destruction callback export uses the proved result without the ordinary fallback',async()=>{
 const {default:Creator}=await import('../overlay/scratch-gui/src/lib/sb3-creator-register-art.js');
 const {arcadeToPseudocode}=await import('../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js');
 const {projectToArcade}=await import('../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js');
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 const creator=new Creator();creator.parse(imported.code);assert.deepEqual(creator.errors,[]);assert.deepEqual(creator.unparsed,[]);assert.deepEqual(creator.warnings,[]);
 const exported=projectToArcade(creator.project);assert.deepEqual(exported.unsupported,[]);
 assert.match(exported.ts,/onDestroyed/);assert.match(exported.ts,/positions/);
});

test('original PXT/native: a real destruction callback preserves its coordinate through editable and saved routes',async()=>{
 const {runPxtArcade}=await import('./helpers/pxt-arcade-runtime.mjs');
 const {runTimedArcadeProgram,restartTimedArcadeRun}=await import('./helpers/arcade-timed-native.mjs');
 const {clearStrayTimers}=await import('./helpers/bw-vm.mjs');
 const {default:BW}=await import('../overlay/scratch-vm/src/util/bw-values.js');
 const {arcadeToPseudocode}=await import('../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js');
 const {projectToArcade}=await import('../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js');
 const text='let positions=0;let values=[1];let callbacks=0;'+
  'sprites.onDestroyed(SpriteKind.Enemy,function(sprite){positions+=sprite.x;callbacks+=1});'+
  'let first=sprites.create(img`1`,SpriteKind.Enemy);first.setPosition(10,20);first.destroy();pause(20);let ready=0;ready+=1;';
 const wanted={positions:10,callbacks:1,ready:1};
 const checkOriginal=result=>{for(const [name,value]of Object.entries(wanted)){
  const found=Object.entries(result).filter(([key])=>[name,'Game_'+name].includes(key));assert.equal(found.length,1,name);assert.equal(found[0][1],value,name);
 }};
 checkOriginal(await runPxtArcade(text,{fakeClock:true}));const runs=[];
 const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);const values=run.vm.runtime.targets.flatMap(t=>Object.values(t.variables));
  for(const [name,value]of Object.entries(wanted)){const found=values.filter(v=>[name,'Game_'+name].includes(v.name));assert.equal(found.length,1,name);assert.equal(BW.decode(found[0].value),value,name);}
 };
 const execute=async input=>{assert.deepEqual(input.unsupported,[]);const run=await runTimedArcadeProgram(input.code,{milliseconds:200,uploads:input.costumes,storage:true});runs.push(run);check(run);return run;};
 try{
  const imported=arcadeToPseudocode(text),run=await execute(imported);await execute({...imported,code:run.creator.decompile()});
  const out=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(out.unsupported,[]);
  checkOriginal(await runPxtArcade(out.files,{fakeClock:true}));await execute(arcadeToPseudocode(out.files));
  const bytes=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());await run.vm.loadProject(bytes);await restartTimedArcadeRun(run,200);check(run);
  const fresh=await runTimedArcadeProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{milliseconds:0,storage:true});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(bytes);await restartTimedArcadeRun(fresh,200);check(fresh);
 }finally{for(const run of runs)run.vm.quit();clearStrayTimers();}
});
