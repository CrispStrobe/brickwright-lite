import test from 'node:test';
import fs from 'node:fs';
import {STATIC} from '../scripts/lib/pxt-node.mjs';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {loadExtensionClass,stubRuntime} from './helpers/bw-extensions.mjs';
import {SIGN_NUMBER_SOURCE} from './fixtures/arcade-sign-number.mjs';
const referenceSource=JSON.parse(fs.readFileSync(`${STATIC}/arcade/target.json`,'utf8')).bundledpkgs.base['pxt-helpers.ts'];
const originalSign=new Function('x',referenceSource.match(/export function sign\(x: number\): number \{([\s\S]*?)\n    \}/)[1]);
const source=`let calls=0
function next(){calls+=1;return -3.75}
let positive=Math.sign(3.75)
let negative=Math.sign(next())
let negativeZero=Math.sign(-1/Infinity)
let negativeReciprocal=1/negativeZero
let positiveZero=Math.sign(1/Infinity)
let positiveReciprocal=1/positiveZero
let invalid=Math.sign(NaN)
let notANumber=invalid!=invalid
let positiveInfinity=Math.sign(Infinity)
let negativeInfinity=Math.sign(-Infinity)
let large=Math.sign(4294967296.75)
let ready=true`;
const names=['calls','positive','negative','negativeZero','negativeReciprocal','positiveZero','positiveReciprocal','notANumber','positiveInfinity','negativeInfinity','large'];
const variables=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^(?:Game_)+/,''),v.value]));
test('native numeric sign follows original PXT for zero and nonfinite numbers and a visible authoring reporter',()=>{
 const Arcade=loadExtensionClass('arcade'),ext=new Arcade(stubRuntime());
 const block=ext.getInfo().blocks.find(b=>b.opcode==='signNumber');assert.equal(block.blockType,'reporter');assert.ok(block.arguments.NUM);
 for(const value of [3.75,-3.75,-0.5,0.5,-0,0,NaN,Infinity,-Infinity,4294967296.75])assert.ok(Object.is(ext.signNumber({NUM:value}),originalSign(value)),String(value));
});
test('original PXT numbers and one-time arguments survive Code, Blocks, export, reimport and SB3 restart',async()=>{
 const expected=await runPxtArcade(source);assert.equal(expected.calls,1);assert.equal(expected.negative,-1);assert.equal(expected.large,1);assert.equal(expected.negativeReciprocal,Infinity);assert.equal(expected.positiveReciprocal,Infinity);assert.equal(expected.notANumber,false);
 const exercise=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);const values=variables(run);for(const name of names)assert.ok(Object.is(values[name],expected[name]),`${name}: ${values[name]} != ${expected[name]}`);assert.equal(values.invalid,-1);};
 const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:8,storage:true});exercise(run);return run;};
 const imported=arcadeToPseudocode(source),run=await execute(imported);assert.match(imported.code,/arcade sign of/);
 await execute({...imported,code:run.creator.decompile()});
 const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/Math\.sign\(/);
 const original=await runPxtArcade(exported.files);for(const name of names)assert.ok(Object.is(original[name],expected[name]),name);
 await execute(arcadeToPseudocode(exported.ts));
 await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,8);exercise(run);
});
test('an authored button uses the sign of sprite coordinates and evaluates its argument once',async()=>{
 const imported=arcadeToPseudocode(SIGN_NUMBER_SOURCE);assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:8,uploads:imported.costumes,storage:true});assert.equal(variables(run).calls,1);
 run.vm.postIOData('keyboard',{key:' ',isDown:true});await stepFrames(run.vm,8);run.vm.postIOData('keyboard',{key:' ',isDown:false});
 const hero=Object.values(run.vm.runtime.bwArcadeDeviceState.sprites)[0];assert.equal(hero.x,76);assert.equal(hero.y,60);assert.equal(variables(run).calls,2);assert.equal(variables(run).sample,-1);assert.deepEqual(run.errors,[]);
});
test('wrong arity and shadowed Math remain explicit refusals',()=>{
 for(const source of ['let result=Math.sign()','let result=Math.sign(1,2)','let Math=7;let result=Math.sign(1)'])assert.ok(arcadeToPseudocode(source).unsupported.length>0,source);
});
