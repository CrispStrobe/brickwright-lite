import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const BW=(await importGuiDependency('scratch-vm/src/util/bw-values.js')).default;
const save=(name,value)=>{if(process.env.ARRAY_ALIAS_EVIDENCE){fs.mkdirSync(process.env.ARRAY_ALIAS_EVIDENCE,{recursive:true});fs.writeFileSync(path.join(process.env.ARRAY_ALIAS_EVIDENCE,name),JSON.stringify(value,(_key,v)=>v===undefined?{evidenceUndefined:true}:v,2));}};
const source=fs.readFileSync(new URL('./fixtures/arcade-reference-array-aliases.ts',import.meta.url),'utf8');
const expected={beforeTextMissing:true,beforeArrayMissing:true,same:true,different:true,sameLabels:true,sameNested:true,witness:'7:3:after:2:9:4:6',callbackCount:1,complete:1};
const originalValue=(state,name)=>{const entries=Object.entries(state).filter(([key])=>key===name || key===`Game_${name}`);assert.equal(entries.length,1,name);return entries[0][1];};
let observationSequence=0;
const check=run=>{
    assert.deepEqual(run.errors,[]);const values=new Map(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name,BW.decode(v.value)]));
    for(const [name,value] of Object.entries(expected))assert.equal(values.get(name),value,name);
    assert.equal(values.get('beforeText'),undefined);assert.equal(values.get('beforeArray'),undefined);
    assert.equal(BW.equal(values.get('alias'),values.get('laterArray')),true);
    assert.equal(BW.equal(values.get('returned'),values.get('laterArray')),true);
    assert.equal(BW.equal(values.get('distinct'),values.get('laterArray')),false);
    assert.equal(BW.equal(values.get('nested'),values.get('nestedAlias')),true);
    save('native-observations-'+(++observationSequence)+'.json',Object.fromEntries(values));
};
test('reference Array aliases preserve local/procedure identity, startup defaults and mutation through all authoring routes',async()=>{
    const runs=[];
    const execute=async code=>{const run=await runProgram(code,{frames:40,storage:true});runs.push(run);assert.deepEqual(run.creator.warnings,[]);check(run);return run;};
    try{
        if(!process.env.ARRAY_ALIAS_NATIVE_ONLY){
            const original=await runPxtArcade(source,{fakeClock:true,waitForGlobals:{complete:1},onCompilation:p=>save('source-compilation.json',p)});save('source-observations.json',original);
            for(const [name,value] of Object.entries(expected))assert.equal(originalValue(original,name),value,name);
            assert.equal(originalValue(original,'beforeText'),undefined);assert.equal(originalValue(original,'beforeArray'),undefined);
        }
        const converted=arcadeToPseudocode(source);assert.deepEqual(converted.unsupported,[]);
        const first=await execute(converted.code);await execute(first.creator.decompile());
        const saved=Buffer.from(await(await first.vm.saveProjectSb3()).arrayBuffer());
        first.vm.stopAll();await first.vm.loadProject(saved);first.vm.greenFlag();await stepFrames(first.vm,40);check(first);
        const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(saved);fresh.vm.greenFlag();await stepFrames(fresh.vm,40);check(fresh);
        const exported=projectToArcade(first.creator.project);assert.deepEqual(exported.unsupported,[]);save('export-files.json',exported.files);
        if(!process.env.ARRAY_ALIAS_NATIVE_ONLY){
            const original=await runPxtArcade(exported.files,{fakeClock:true,waitForGlobals:{complete:1},onCompilation:p=>save('export-compilation.json',p)});save('export-observations.json',original);
            for(const [name,value] of Object.entries(expected))assert.equal(originalValue(original,name),value,name);
            assert.equal(originalValue(original,'beforeText'),undefined);assert.equal(originalValue(original,'beforeArray'),undefined);
        }
        const reimport=arcadeToPseudocode(exported.files);assert.deepEqual(reimport.unsupported,[]);await execute(reimport.code);
    }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
