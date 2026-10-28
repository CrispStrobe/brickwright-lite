import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
import {oracleProject} from './fixtures/arcade-class-callable-conditional-source.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const retain=(name,value)=>{const dir=process.env.CLASS_RESULT_ORIGINAL_RECEIPT_DIR;if(!dir)return;fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,name+'.json'),JSON.stringify(value,null,2)+'\n');};
const check=values=>{
 assert.deepEqual([values.numberResult,values.textResult,values.finalValue,values.displays,values.imageUpdates,values.order,values.alias,values.missing],[3,'ok',4,3,3,'ADISDIVDI',true,true]);
 assert.ok(Object.hasOwn(values,'absentResult'));assert.equal(values.absentResult,undefined);
};
const original=async(name,files)=>{
 const values=await runPxtArcade(files,{fakeClock:true,onCompilation:metadata=>{retain(name+'-compilation',metadata);assert.deepEqual(metadata.files,files);}});
 retain(name+'-observations',values);check(values);
};
test('selected original executes actual Void effects and conditional generic results on ordinary owned classes',async()=>{
 await original('source',oracleProject);
});
test('selected original executes the actual current conditional class export',async()=>{
 const translated=arcadeToPseudocode(oracleProject);assert.deepEqual(translated.unsupported,[]);
 const run=await runProgram(translated.code,{frames:100});
 try{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);const exported=projectToArcade(JSON.parse(run.vm.toJSON()));assert.deepEqual(exported.unsupported,[]);assert.deepEqual(exported.warnings,[]);retain('export',exported);await original('export',exported.files);}
 finally{run.vm.quit();clearStrayTimers();}
});
