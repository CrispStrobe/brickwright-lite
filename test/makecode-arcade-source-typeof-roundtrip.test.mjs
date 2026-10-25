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
const dispatch=(await importGuiDependency('scratch-vm/src/dispatch/central-dispatch.js')).default;
const phase=label=>{if(process.env.SOURCE_TYPEOF_PROGRESS)process.stderr.write('SourceTypeOf phase: '+label+'\n');};
const fixture=name=>fs.readFileSync(new URL(`./fixtures/${name}.ts`,import.meta.url),'utf8');
const save=(name,value)=>{
    if(!process.env.SOURCE_TYPEOF_EVIDENCE)return;
    fs.mkdirSync(process.env.SOURCE_TYPEOF_EVIDENCE,{recursive:true});
    fs.writeFileSync(path.join(process.env.SOURCE_TYPEOF_EVIDENCE,name),JSON.stringify(value,null,2));
};
const nativeOwner=run=>{
    const service=run.vm.extensionManager._loadedExtensions.get('arcade'),native=dispatch.services[service]?._inst;
    assert.ok(native);assert.ok(native._runtime===run.vm.runtime,'native instance belongs to this actual runtime');return native;
};
const values=run=>new Map(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(variable=>[variable.name,BW.decode(variable.value)]));
const originalValue=(original,name)=>{
    const entries=Object.entries(original).filter(([key])=>key===name || key===`Game_${name}`);
    assert.equal(entries.length,1,`${name} original binding`);return entries[0][1];
};
const execute=async(code,runs)=>{
    const run=await runProgram(code,{frames:40,storage:true});runs.push(run);
    const native=nativeOwner(run);if(run.errors.length)save('failed-native-project.json',run.creator.project);assert.deepEqual(run.creator.warnings,[]);assert.deepEqual(run.errors,[]);
    return {run,native};
};
async function portable(run,runs,check){
    const sourceOwner=nativeOwner(run);
    phase('portable Code');const code=await execute(run.creator.decompile(),runs);check(code.run,code.native);
    const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
    phase('same VM stop');run.vm.stopAll();phase('same VM load');await run.vm.loadProject(saved);phase('same VM loaded');const sameOwner=sourceOwner;
    run.vm.greenFlag();phase('same VM frames');await stepFrames(run.vm,40);check(run,sameOwner);phase('same VM complete');
    phase('fresh VM reload');const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);
    fresh.vm.stopAll();await fresh.vm.loadProject(saved);const freshOwner=nativeOwner(fresh);
    fresh.vm.greenFlag();await stepFrames(fresh.vm,40);check(fresh,freshOwner);
}
const matrixExpected='number|boolean|string|string|object|undefined|object|object|object|object|object|object|string|string';
test('owned source typeof preserves live owners, String cells and edited operands through every authoring route',async()=>{
    const source=fixture('arcade-source-typeof-owned-values'),runs=[];
    const check=(run,native,expected=matrixExpected)=>{
        assert.ok(native._runtime===run.vm.runtime,'native instance belongs to this actual runtime');assert.deepEqual(run.errors,[]);
        const state=values(run);assert.equal(state.get('typeWitness'),expected);
        assert.equal(state.get('typeCalls'),1);assert.equal(state.get('typeSame'),true);
    };
    try{
        if(!process.env.SOURCE_TYPEOF_NATIVE_ONLY){
            let original;
            if(process.env.SOURCE_TYPEOF_RETAINED_SOURCE){
                const retained=process.env.SOURCE_TYPEOF_RETAINED_SOURCE;
                const packet=JSON.parse(fs.readFileSync(path.join(retained,'owned-source-compilation.json'),'utf8'));
                assert.equal(packet.files['main.ts'],source);assert.equal(packet.built.success,true);
                original=JSON.parse(fs.readFileSync(path.join(retained,'owned-source-observations.json'),'utf8'));
                save('owned-source-reused-authority.json',{sourceMatched:true,compiledSuccess:true,observations:original});
            } else original=await runPxtArcade(source,{fakeClock:true,waitForGlobals:{typeComplete:1},onCompilation:packet=>save('owned-source-compilation.json',packet)});
            save('owned-source-observations.json',original);assert.equal(originalValue(original,'typeWitness'),matrixExpected);
            assert.equal(originalValue(original,'typeCalls'),1);assert.equal(originalValue(original,'typeSame'),true);
        }
        const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
        phase('initial native');const first=await execute(imported.code,runs);check(first.run,first.native);
        await portable(first.run,runs,check);
        phase('edited graph');const edited=new (first.run.creator.constructor)();edited.parse(first.run.creator.decompile());
        const target=edited.project.targets.find(t=>Object.values(t.blocks).some(b=>b.opcode==='arcade_sourceTypeOf' && Array.isArray(b.inputs.VALUE?.[1]) && b.inputs.VALUE[1][1]==='arcade:1'));
        const reporter=Object.values(target.blocks).find(b=>b.opcode==='arcade_sourceTypeOf' && Array.isArray(b.inputs.VALUE?.[1]) && b.inputs.VALUE[1][1]==='arcade:1');
        reporter.inputs.VALUE=[1,[4,'17']];
        const changed=matrixExpected.replace(/string$/,'number');
        const editedOwner=first.native;first.run.vm.stopAll();
        await first.run.vm.loadProject(Buffer.from(await(await edited.generateSB3()).arrayBuffer()));
        first.run.vm.greenFlag();await stepFrames(first.run.vm,40);check(first.run,editedOwner,changed);
        const editedCode=edited.decompile();save('owned-edited-code.json',editedCode);const edit=await execute(editedCode,runs);
        check(edit.run,edit.native,changed);
        phase('export');const exported=projectToArcade(edit.run.creator.project);assert.deepEqual(exported.unsupported,[]);save('owned-edited-export-files.json',exported.files);
        if(!process.env.SOURCE_TYPEOF_NATIVE_ONLY){
            const original=await runPxtArcade(exported.files,{fakeClock:true,waitForGlobals:{typeComplete:1},onCompilation:packet=>save('owned-edited-export-compilation.json',packet)});
            save('owned-edited-export-observations.json',original);assert.equal(originalValue(original,'typeWitness'),changed);assert.equal(originalValue(original,'typeCalls'),1);assert.equal(originalValue(original,'typeSame'),true);
        }
        phase('reimport');const reimport=arcadeToPseudocode(exported.files);assert.deepEqual(reimport.unsupported,[]);
        const again=await execute(reimport.code,runs);check(again.run,again.native,changed);
    }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
test('E15 text versus JSON aggregate helper retains typeof through Code, saved projects and strict original export', {todo:"named-array helper re-import not recognized \u2014 see docs/ARCADE-888-OPEN-FAILURES.md"},async()=>{
    const source=fixture('arcade-source-typeof-array-items'),runs=[];
    const strings=['abc','','0','null','undefined','true','[1,2]','{"value":2}','"quoted"','{"bwUndefined":true}','{"bwReference":{"kind":"callable","id":"one","scope":"fake"}}','é雪😀','line\nnext'];
    const expected={Game_numberValue:3,Game_nullValue:null,Game_booleanValue:true,Game_aggregate:'[1,2]',Game_missing:undefined,Game_identity:true};
    const check=(run,native)=>{
        assert.ok(native._runtime===run.vm.runtime,'native instance belongs to this actual runtime');assert.deepEqual(run.errors,[]);const state=values(run);
        strings.forEach((value,i)=>assert.equal(state.get(`Game_value${i}`),value));
        for(const [name,value] of Object.entries(expected))assert.equal(state.get(name),value,name);
        assert.equal(BW.equal(state.get('Game_alias'),state.get('Game_same')),true);
    };
    try{
        const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
        phase('initial native');const first=await execute(imported.code,runs);check(first.run,first.native);await portable(first.run,runs,check);
        phase('export');const exported=projectToArcade(first.run.creator.project);assert.deepEqual(exported.unsupported,[]);save('e15-export-files.json',exported.files);
        if(!process.env.SOURCE_TYPEOF_NATIVE_ONLY){
            const original=await runPxtArcade(exported.files,{fakeClock:true,onCompilation:packet=>save('e15-export-compilation.json',packet)});
            save('e15-export-observations.json',original);
            strings.forEach((value,i)=>assert.equal(originalValue(original,`Game_value${i}`),value));
            for(const [name,value] of Object.entries(expected))assert.equal(originalValue(original,name),value,name);
        }
        phase('reimport');const reimport=arcadeToPseudocode(exported.files);assert.deepEqual(reimport.unsupported,[]);
        save('e15-reimport-code.json',reimport.code);const again=await execute(reimport.code,runs);check(again.run,again.native);
    }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
