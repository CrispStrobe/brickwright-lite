import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {source} from './fixtures/arcade-class-callable-source.mjs';
const evidence=process.env.BW_CLASS_CALLABLE_EVIDENCE_DIR;
const retain=(name,value)=>{if(evidence){fs.mkdirSync(evidence,{recursive:true});fs.writeFileSync(path.join(evidence,name+'.json'),JSON.stringify(value,null,2)+'\n');}};
const observe=name=>metadata=>retain(name+'-compilation',metadata);
test('selected original executes the unchanged owned State and Holder callback source',async()=>{
    const original=await runPxtArcade(source,{fakeClock:true,onCompilation:observe('source')});retain('source-observations',original);
    assert.deepEqual([original.n,original.text,original.seen],[3,'ok',3]);
});
test('selected original executes the actual edited class callback export and its native reimport',async()=>{
    const converted=arcadeToPseudocode({'main.ts':source},{classCallablePrototype:true});assert.deepEqual(converted.unsupported,[]);
    const run=await runProgram(converted.code,{frames:40});
    try{
        assert.deepEqual(run.errors,[]);
        const project=JSON.parse(run.vm.toJSON());
        for(const target of project.targets)for(const block of Object.values(target.blocks)){
            const right=target.blocks[block.inputs?.RIGHT?.[1]];
            if(block.opcode==='arrays_valueBinary'&&block.fields.OP?.[0]==='+'&&right?.opcode==='operator_add'&&right.inputs.NUM2?.[1]?.[1]==='2')right.inputs.NUM2[1][1]='7';
        }
        const edited=await runProgram(run.creator.decompile(project),{frames:60});
        try{
            assert.deepEqual(edited.creator.warnings,[]);assert.deepEqual(edited.errors,[]);
            const exported=projectToArcade(JSON.parse(edited.vm.toJSON()),{classCallablePrototype:true});assert.deepEqual(exported.unsupported,[]);assert.deepEqual(exported.warnings,[]);
            retain('edited-export',exported);
            const original=await runPxtArcade(exported.files,{fakeClock:true,onCompilation:observe('edited-export')});retain('edited-export-observations',original);
            assert.deepEqual([original.n,original.text,original.seen],[8,'ok',8]);
            const imported=arcadeToPseudocode(exported.files,{classCallablePrototype:true});assert.deepEqual(imported.unsupported,[]);
            const final=await runProgram(imported.code,{frames:80});
            try{assert.deepEqual(final.errors,[]);const values=Object.fromEntries(final.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(variable=>[variable.name,variable.value]));assert.deepEqual([values.n,values.text,values.seen],[8,'ok',8]);}finally{final.vm.quit();}
        }finally{edited.vm.quit();}
    }finally{run.vm.quit();clearStrayTimers();}
});
