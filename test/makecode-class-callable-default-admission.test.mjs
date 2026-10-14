import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,clearStrayTimers,stepFrames} from './helpers/bw-vm.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
import {source} from './fixtures/arcade-class-callable-source.mjs';
const BW=(await importGuiDependency('scratch-vm/src/util/bw-values.js')).default;
const check=(run,n)=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
    const vars=run.vm.runtime.targets.flatMap(t=>Object.values(t.variables));
    assert.deepEqual(['n','text','seen'].map(name=>BW.decode(vars.find(v=>v.name===name).value)),[n,'ok',n]);};
test('default class admission proves current bodies through Code, same/fresh SB3 and edited export/reimport',async()=>{
    const imported=arcadeToPseudocode({'main.ts':source});assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:40});
    const runs=[run];
    try{
        check(run,3);const project=JSON.parse(run.vm.toJSON());
        const exported=projectToArcade(project);assert.deepEqual(exported.unsupported,[]);assert.deepEqual(exported.warnings,[]);
        const again=arcadeToPseudocode(exported.files);assert.deepEqual(again.unsupported,[]);
        const native=await runProgram(again.code,{frames:60});runs.push(native);check(native,3);
        const code=run.creator.decompile(project),reparsed=await runProgram(code,{frames:50});runs.push(reparsed);check(reparsed,3);
        const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
        await run.vm.loadProject(saved);run.vm.greenFlag();await stepFrames(run.vm,50);check(run,3);
        const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0});runs.push(fresh);
        await fresh.vm.loadProject(saved);fresh.vm.greenFlag();await stepFrames(fresh.vm,50);
        const vars=fresh.vm.runtime.targets.flatMap(t=>Object.values(t.variables));assert.deepEqual(['n','text','seen'].map(name=>BW.decode(vars.find(v=>v.name===name).value)),[3,'ok',3]);assert.deepEqual(fresh.errors,[]);
        let edits=0;
        for(const target of project.targets)for(const block of Object.values(target.blocks)){
            const right=target.blocks[block.inputs?.RIGHT?.[1]];
            if(block.opcode==='arrays_valueBinary'&&block.fields.OP?.[0]==='+'&&right?.opcode==='operator_add'&&right.inputs.NUM2?.[1]?.[1]==='2'){right.inputs.NUM2[1][1]='7';edits++;}
        }assert.equal(edits,1);
        const edited=await runProgram(run.creator.decompile(project),{frames:60});runs.push(edited);check(edited,8);
        const current=projectToArcade(JSON.parse(edited.vm.toJSON()));assert.deepEqual(current.unsupported,[]);
        const reimport=arcadeToPseudocode(current.files);assert.deepEqual(reimport.unsupported,[]);
        const result=await runProgram(reimport.code,{frames:60});runs.push(result);check(result,8);
    }finally{runs.forEach(run=>run.vm.quit());clearStrayTimers();}
});
test('default class admission retains neighboring unknown source and current formal-write refusals',async()=>{
    const bad=arcadeToPseudocode({'main.ts':source+'function unproved(x:any){return x.missing()}'});
    assert.ok(bad.unsupported.length);assert.match(bad.unsupported.join(' '),/adjacent callable body/);
    const run=await runProgram(arcadeToPseudocode({'main.ts':source}).code,{frames:40});
    try{
        const project=JSON.parse(run.vm.toJSON());
        const target=project.targets.find(t=>Object.values(t.blocks).some(b=>b.opcode==='procedures_prototype'&&b.mutation.proccode.includes('Holder_apply')));
        const [id,proto]=Object.entries(target.blocks).find(([,b])=>b.opcode==='procedures_prototype'&&b.mutation.proccode.includes('Holder_apply'));
        const def=Object.values(target.blocks).find(b=>b.opcode==='procedures_definition'&&b.inputs.custom_block[1]===id);
        const old=def.next;target.blocks.badFormal={opcode:'arcade_setLocal',parent:Object.entries(target.blocks).find(([,b])=>b===def)[0],next:old,inputs:{NAME:[1,[10,JSON.parse(proto.mutation.argumentnames)[1]]],VALUE:[1,[10,'wrong']]}};
        target.blocks[old].parent='badFormal';def.next='badFormal';
        const result=projectToArcade(project);assert.ok(result.unsupported.length);
    }finally{run.vm.quit();clearStrayTimers();}
});
