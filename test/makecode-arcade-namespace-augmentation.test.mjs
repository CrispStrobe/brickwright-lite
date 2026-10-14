import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {NAMESPACE_AUGMENTATION_SOURCE} from './fixtures/arcade-namespace-augmentation.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {lowerNamespaceBindings} from '../overlay/scratch-gui/src/lib/bw-makecode/namespace-bindings.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const lower=source=>lowerNamespaceBindings(parseMakeCodeTs(source));
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));

test('namespace member catalog matches the pinned official PXT bundle',()=>{
 execFileSync(process.execPath,['scripts/generate-arcade-namespace-members.mjs','--check']);
});

test('source namespace augmentation retains built-in qualified, unqualified and nested exports through PXT and roundtrips',async()=>{
 const expected=await runPxtArcade(NAMESPACE_AUGMENTATION_SOURCE);
 assert.equal(expected.observed,192);assert.equal(expected.observedScore,7);
 const check=run=>{for(const name of ['observed','observedScore','width'])assert.equal(values(run)[name],expected[name],name);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);};
 const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:150,uploads:imported.costumes,storage:true});check(run);return run;};
 const imported=arcadeToPseudocode(NAMESPACE_AUGMENTATION_SOURCE),run=await execute(imported);
 await execute({...imported,code:run.creator.decompile()});
 const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
 const native=await runPxtArcade(exported.ts);for(const name of ['observed','observedScore','width'])assert.equal(native[name],expected[name],name);
 await execute(arcadeToPseudocode(exported.ts));
 await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,150);check(run);
});

test('unknown exports, collisions, private bindings and lexical namespace shadows remain explicit',()=>{
 for(const [source,reason] of [
  ['namespace sprites { export function f(){} } sprites.notARealApi()',/not declared/],
  ['namespace sprites { export function create(){} }',/conflicts with a built-in/],
  ['namespace sprites { export const create=3 }',/conflicts with a built-in/],
  ['namespace sprites {let secret=3} let n=sprites.secret',/private/],
  ['namespace sprites {let secret=3} namespace sprites {export function read(){return secret}}let n=sprites.read()',/private to another/],
  ['let n=sprites.custom();namespace sprites {export function custom(){return 3}}',/before initialization/],
  ['namespace game {export function f(){return 1}}let fn=game.f',/runtime function value/],
  ['namespace game {export function f(){return 1}}let obj=game',/runtime object/]
 ]) {const result=lower(source);assert.equal(result.program,null,source);assert.ok(result.unsupported.some(x=>reason.test(x)),JSON.stringify(result.unsupported));}
 const result=lower('namespace sprites { export function read(create:number){return create} } function read(sprites:number){return sprites} let n=read(8)+sprites.read(4)');
 assert.deepEqual(result.unsupported,[]);
 const functions=result.program.body.filter(x=>x.type==='FunctionDeclaration');
 assert.equal(functions[0].body[0].value.name,'create');assert.equal(functions[1].body[0].value.name,'sprites');
 // Namespace catalog recognition must not imply support for the operation.
 const missing=arcadeToPseudocode('namespace game {export function f(){return 1}}game.askForNumber("n")');
 assert.ok(missing.unsupported.length>0);assert.ok(!missing.unsupported.some(x=>x.includes('not declared')));
});


test('nested built-in namespaces can be augmented without inheriting JavaScript prototype members',()=>{
 const good=lower('namespace sprites {export namespace food {export function size(){return smallApple.width}}} let n=sprites.food.size()');
 assert.deepEqual(good.unsupported,[]);
 for(const name of ['constructor','toString','__proto__']) {
  const custom=lower(`namespace ${name} {export const value=3} let n=${name}.value`);
  assert.deepEqual(custom.unsupported,[],name);
 }
});
