import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {lowerSdkFontValues} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-sdk-font-values.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runArcadeSourceCode} from './helpers/arcade-source-program.mjs';
import {stepFrames} from './helpers/bw-vm.mjs';
import {NUMBER_TEXT_SOURCE,NUMBER_TEXT_EXPECTED} from './fixtures/arcade-number-to-text.mjs';
const markers=node=>!node||typeof node!=='object'?0:(node.bwPrimitiveNumberText?1:0)+Object.values(node).reduce((count,value)=>count+markers(value),0);
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables).map(value=>[value.name,value.value])));
test('Number text source proof follows actual primitive writers arguments and results',()=>{
 for(const source of ['let n=5;let text=n.toString()','let n=-1.25;let alias=n;let text=alias.toString()','function format(value:number){return value.toString()}let text=format(12)','function next(){return 12}let text=next().toString()','function format(String:number){return String.toString()}let text=format(3)']){const result=lowerSdkFontValues(parseMakeCodeTs(source));assert.deepEqual(result.unsupported,[],source);assert.equal(markers(result.program),1,source);}
});
test('Number text proof refuses annotation-only undefined mixed reference unknown and changed writers',()=>{
 for(const source of ['let n:number;let text=n.toString()','let n:number=unknown();let text=n.toString()','let n="5";let text=n.toString()','let n=image.font8;let text=n.toString()','let n=image.create(8,8);let text=n.toString()','let n=5;n=unknown();let text=n.toString()','let n=5;let text=n.toString();n=unknown()','function format(n:number){return n.toString()}let text=format(unknown())','function format(n:number){return n.toString()}let text=format()','function format(n:number){n=unknown();return n.toString()}let text=format(1)','let n=5;function mutate(){n=unknown()}let text=n.toString()','let n:number;let text=n.toString();n=5','function next(){return 1}next=unknown;let text=next().toString()','function next(){return 1}let next=unknown;let text=next().toString()','function next(){return 1}function text(next:any){return next().toString()}let out=text(unknown)','class Value{constructor(){}toString():string{return "custom"}}let n=new Value();let text=n.toString()'])assert.equal(markers(lowerSdkFontValues(parseMakeCodeTs(source)).program),0,source);
 assert.match(lowerSdkFontValues(parseMakeCodeTs('let n=5;let text=n.toString(16)')).unsupported.join('\n'),/zero-argument/);
});
test('actual Code native export and reimport preserve a Number formal and local String shadow exactly once',async()=>{
 const source='let count=0;function format(String:number){count++;return String.toString()}let text=format(-1.25)';
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);assert.match(imported.code,/join/);const runs=[];
 const check=run=>{assert.deepEqual(run.errors,[]);assert.equal(values(run).count,1);assert.equal(values(run).text,'-1.25');};
 try{const execute=async input=>{const run=await runArcadeSourceCode(input.code,{frames:4,uploads:input.costumes});runs.push(run);check(run);return run;};
 const run=await execute(imported);await execute({...imported,code:run.creator.decompile()});const exported=projectToArcade(JSON.parse(run.vm.toJSON()));assert.deepEqual(exported.unsupported,[]);assert.equal(/String\(/.test(exported.files['main.ts']),false);const back=arcadeToPseudocode(exported.files);assert.deepEqual(back.unsupported,[]);await execute(back);
 run.vm.stopAll();await run.vm.loadProject(run.buffer);run.vm.greenFlag();await stepFrames(run.vm,4,20);check(run);
 }finally{for(const run of runs)run.vm.stopAll();}
});
test('actual Number formatting preserves signed fractional and large small decimal text',async()=>{
 const cases=[['0','0'],['-0','0'],['1','1'],['-1','-1'],['1.25','1.25'],['-1.25','-1.25'],['1e21','1e+21'],['1e-7','1e-7'],['9007199254740991','9007199254740991'],['5e-324','5e-324']];
 const source=cases.map(([literal],index)=>`let text${index}=(${literal}).toString()`).join(';');const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);const run=await runArcadeSourceCode(imported.code,{frames:3,uploads:imported.costumes});try{assert.deepEqual(run.errors,[]);for(const [,expected,index]of cases.map(([literal,expected],index)=>[literal,expected,index]))assert.equal(values(run)['text'+index],expected);}finally{run.vm.stopAll();}
});

test('Number source oracle consumes every formatting result through a genuine native update callback',async()=>{const imported=arcadeToPseudocode(NUMBER_TEXT_SOURCE);assert.deepEqual(imported.unsupported,[]);const run=await runArcadeSourceCode(imported.code,{frames:8,uploads:imported.costumes});try{assert.deepEqual(run.errors,[]);assert.equal(values(run).numberTextCalls,1);assert.equal(values(run).numberTextReady,true);assert.equal(values(run).numberTextSnapshot,NUMBER_TEXT_EXPECTED);}finally{run.vm.stopAll();}});
