import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runTimedArcadeProgram} from './helpers/arcade-timed-native.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {clearStrayTimers} from './helpers/bw-vm.mjs';
import {extendableControls} from './fixtures/arcade-extendable-source-controls.mjs';
function retain(name,value){const root=process.env.BW_EXTENDABLE_EXPORT_EVIDENCE_DIR;if(!root)return;fs.mkdirSync(root,{recursive:true});fs.writeFileSync(path.join(root,name+'.json'),JSON.stringify(value));}
for(const[name,source]of Object.entries(extendableControls))test('new exported ExtendableSprite original '+name,async()=>{
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    const run=await runTimedArcadeProgram(imported.code,{milliseconds:100,uploads:imported.costumes,storage:true});
    try{
        assert.deepEqual(run.errors,[]);
        const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
        retain(name+'-files',exported.files);
        const result=await runPxtArcade(exported.files,{fakeClock:true,onCompilation:record=>retain(name+'-compilation',record)});
        retain(name+'-result',result);
        const value=key=>result[key]??result['Game_'+key];
        if(name==='destroyedUpdate'){
            assert.equal(value('total'),1);assert.equal(value('destroyedCalls'),1);assert.equal(value('remaining'),0);
            assert.equal(value('same'),true);assert.equal(value('kind'),1000);
        }else{
            assert.equal(value('completed'),7);assert.equal(value('before'),2);assert.equal(value('total'),4);
            if(name==='constructorPause')assert.equal(value('deltas'),'0,20,20,20,');
        }
    }finally{run.vm.stopAll();run.vm.quit();clearStrayTimers();}
});
