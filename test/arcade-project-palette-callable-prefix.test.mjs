import {test} from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {applyProjectPalette,inspectProjectPalette,DEFAULT_PROJECT_PALETTE} from '../overlay/scratch-gui/src/lib/arcade-project-palette.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
const BW=(await importGuiDependency('scratch-vm/src/util/bw-values.js')).default;
const declarations=new Set(['arcade_declareSourceScalar','arcade_declareSourceReference','arcade_declareSourceCallable']);
test('palette insertion follows the complete scalar reference callable prefix and keeps image aliases and current native bodies',async()=>{
    const source='function advance(initial:number):()=>number{let total=initial;return()=>{total+=1;return total}}let first=advance(2);let alias=first;let output=alias();let surface=image.create(2,2);let surfaceAlias=surface;surfaceAlias.setPixel(0,0,6);info.setScore(output);';
    const imported=arcadeToPseudocode({'main.ts':source},{callableLexicalPrototype:true});
    assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:40});
    try {
        assert.deepEqual(run.errors,[]);
        const target=run.vm.runtime.targets.find(target=>Object.values(target.blocks._blocks).some(block=>block.opcode==='arcade_declareSourceCallable'));
        const hat=Object.values(target.blocks._blocks).find(block=>block.opcode==='arcade_whenSourceStarts');
        const rows=[];let id=hat.next;
        while(declarations.has(target.blocks.getBlock(id)?.opcode)){rows.push(target.blocks.getBlock(id));id=rows.at(-1).next;}
        assert.ok(rows.some(row=>row.opcode==='arcade_declareSourceScalar'));
        assert.ok(rows.some(row=>row.opcode==='arcade_declareSourceReference'));
        assert.ok(rows.some(row=>row.opcode==='arcade_declareSourceCallable'));
        const snapshot=rows.map(row=>({id:row.id,inputs:structuredClone(row.inputs),fields:structuredClone(row.fields)}));
        const before=inspectProjectPalette(run.vm);
        const colors=DEFAULT_PROJECT_PALETTE.slice();colors[1]='#102030';
        const authored=await applyProjectPalette(run.vm,colors,before.signature);
        assert.equal(hat.next,rows[0].id);
        assert.equal(rows.at(-1).next,authored.start.command.id);
        assert.equal(authored.start.command.next,id);
        assert.deepEqual(rows.map(row=>({id:row.id,inputs:row.inputs,fields:row.fields})),snapshot);
        await assert.rejects(applyProjectPalette(run.vm,colors,before.signature),/Project palette changed/);
        run.vm.greenFlag();run.vm.quit();await stepFrames(run.vm,40);
        assert.deepEqual(run.errors,[]);
        const values=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables));
        const read=name=>values.find(value=>value.name===name).value;
        assert.equal(BW.decode(read('output')),3);assert.equal(read('first'),read('alias'));
        assert.equal(read('surface'),read('surfaceAlias'));
        assert.deepEqual(Array.from(run.vm.runtime._arcadeFramePhase.ext._image(read('surface')).pixels),[6,0,0,0]);
        const replay=await runProgram(run.creator.decompile(JSON.parse(run.vm.toJSON())),{frames:40});
        try{assert.deepEqual(replay.errors,[]);assert.equal(replay.vm.runtime._arcadeFramePhase.ext._state().score,3);}finally{replay.vm.quit();clearStrayTimers();}
    }finally{run.vm.quit();clearStrayTimers();}
});
