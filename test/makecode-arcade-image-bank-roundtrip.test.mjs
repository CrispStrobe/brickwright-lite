import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade,projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runPxtCore} from './helpers/pxt-core-runtime.mjs';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {compile} from '../scripts/lib/pxt-node.mjs';

// Preserve the complete original Image/identity/Array program. Only its image
// producer becomes an actual two-pixel costume, exercising generated banks.
const original=readFileSync(new URL('./makecode-arcade-image-values.test.mjs',import.meta.url),'utf8').match(/const source=`([\s\S]*?)`;/)?.[1];
assert.ok(original&&!original.includes('${')&&!original.includes('\\'));
const source=original.replace('image.create(2,1)','img`5 5`');
const names=['joined','text','sum','product','difference','divided','remainder','numeric','negated','same','different','loose','objectText','textCollision','ordered','mixed','index','wrong','changed','untouched'];
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(value=>[value.name.replace(/^Game_/,''),value.value]));

test('costume Image banks match original values through both export routes, second import and fresh SB3 reopen',async()=>{
    const expected=await runPxtCore(source,{images:true});
    const check=run=>{
        const actual=values(run);
        for(const name of names)assert.deepEqual(actual[name],expected[name],name);
        assert.equal(actual.first,actual.alias);assert.notEqual(actual.first,actual.copy);
        assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
    };
    for(const mode of ['direct','json']){
        let current=source;
        for(let generation=0;generation<3;generation++){
            const imported=arcadeToPseudocode(current);assert.deepEqual(imported.unsupported,[]);
            const run=await runProgram(imported.code,{frames:80,uploads:imported.costumes,storage:true});
            try{
                check(run);
                if(generation<2){
                    const options={costumeSvg:(target,costume)=>run.creator.assets.get(costume.assetId)?.data};
                    const out=mode==='direct'?projectToArcade(run.creator.project,options):projectJsonToArcade(JSON.stringify(run.creator.project),options);
                    assert.deepEqual(out.unsupported,[],mode+' generation '+generation);
                    assert.doesNotMatch(out.ts,/\.join\(/,'Image values keep ordinary addition');
                    assert.match(out.ts,/img`\s*5\s+5\s*`/,'retain the original literal pixels');
                    const built=await compile('arcade',out.files);
                    assert.equal(built.success,true,JSON.stringify({diagnostics:built.diagnostics,ts:out.ts}));
                    current=out.ts;
                }else{
                    const archive=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
                    await run.vm.loadProject(archive);run.vm.greenFlag();await stepFrames(run.vm,80);check(run);
                }
            }finally{run.vm.stopAll();run.vm.quit();clearStrayTimers();}
        }
    }
});
