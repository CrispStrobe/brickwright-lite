import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {loadExtensionClass,stubRuntime} from './helpers/bw-extensions.mjs';
import {TRUNCATE_NUMBER_SOURCE} from './fixtures/arcade-truncate-number.mjs';
const source=`let calls=0
function next(){calls+=1;return -3.75}
let positive=Math.trunc(3.75)
let negative=Math.trunc(next())
let negativeZero=Math.trunc(-0.5)
let negativeReciprocal=1/negativeZero
let positiveZero=Math.trunc(0.5)
let positiveReciprocal=1/positiveZero
let invalid=Math.trunc(NaN)
let notANumber=invalid!=invalid
let positiveInfinity=Math.trunc(Infinity)
let negativeInfinity=Math.trunc(-Infinity)
let large=Math.trunc(4294967296.75)
let ready=true`;
const names=['calls','positive','negative','negativeZero','negativeReciprocal','positiveZero','positiveReciprocal','notANumber','positiveInfinity','negativeInfinity','large'];
const variables=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^(?:Game_)+/,''),v.value]));
test('native truncation retains IEEE numbers and a visible authoring reporter',()=>{
 const Arcade=loadExtensionClass('arcade'),ext=new Arcade(stubRuntime());
 const block=ext.getInfo().blocks.find(b=>b.opcode==='truncateNumber');assert.equal(block.blockType,'reporter');assert.ok(block.arguments.NUM);
 for(const value of [3.75,-3.75,-0.5,0.5,-0,0,NaN,Infinity,-Infinity,4294967296.75])assert.ok(Object.is(ext.truncateNumber({NUM:value}),Math.trunc(value)),String(value));
});
test('original PXT numbers and one-time arguments survive Code, Blocks, export, reimport and SB3 restart',async()=>{
 const expected=await runPxtArcade(source);assert.equal(expected.calls,1);assert.equal(expected.negative,-3);assert.equal(expected.large,4294967296);assert.equal(expected.negativeReciprocal,-Infinity);assert.equal(expected.positiveReciprocal,Infinity);assert.equal(expected.notANumber,true);
 const exercise=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);const values=variables(run);for(const name of names)assert.ok(Object.is(values[name],expected[name]),`${name}: ${values[name]} != ${expected[name]}`);assert.ok(Number.isNaN(values.invalid));};
 const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:8,storage:true});exercise(run);return run;};
 const imported=arcadeToPseudocode(source),run=await execute(imported);assert.match(imported.code,/arcade truncate/);
 await execute({...imported,code:run.creator.decompile()});
 const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/Math\.trunc\(/);
 const original=await runPxtArcade(exported.files);for(const name of names)assert.ok(Object.is(original[name],expected[name]),name);
 await execute(arcadeToPseudocode(exported.ts));
 await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,8);exercise(run);
});
test('an authored button truncates sprite coordinates and evaluates its argument once',async()=>{
 const imported=arcadeToPseudocode(TRUNCATE_NUMBER_SOURCE);assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:8,uploads:imported.costumes,storage:true});assert.equal(variables(run).calls,1);
 run.vm.postIOData('keyboard',{key:' ',isDown:true});await stepFrames(run.vm,8);run.vm.postIOData('keyboard',{key:' ',isDown:false});
 const hero=Object.values(run.vm.runtime.bwArcadeDeviceState.sprites)[0];assert.equal(hero.x,35);assert.equal(hero.y,40);assert.equal(variables(run).calls,2);assert.equal(variables(run).sample,-3);assert.deepEqual(run.errors,[]);
});
test('wrong arity and shadowed Math remain explicit refusals',()=>{
 for(const source of ['let result=Math.trunc()','let result=Math.trunc(1,2)','let Math=7;let result=Math.trunc(1)'])assert.ok(arcadeToPseudocode(source).unsupported.length>0,source);
});
