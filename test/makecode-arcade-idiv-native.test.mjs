import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {MATH_IDIV_SOURCE,MATH_IDIV_EXPECTED} from './fixtures/arcade/math-idiv.mjs';
const vars=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
function check(run,edited=false){assert.deepEqual(run.errors,[]);const actual=vars(run);for(const[name,value]of Object.entries(MATH_IDIV_EXPECTED))assert.deepEqual(actual[name],edited&&name==='idivEditable'?0:value,name);}
async function execute(source){const codeOnly=typeof source==='object'&&typeof source.code==='string'&&!Object.hasOwn(source,'main.ts');const imported=codeOnly?source:arcadeToPseudocode(source);if(!codeOnly)assert.deepEqual(imported.unsupported,[],imported.unsupported.join('\n'));const run=await runProgram(imported.code,{frames:150,storage:true});assert.deepEqual(run.creator.warnings,[]);return run;}
async function savedRoutes(run,edited){const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());await run.vm.loadProject(saved);run.vm.greenFlag();await stepFrames(run.vm,150);check(run,edited);const fresh=await runProgram('DEVICE ARCADE\nSPRITE Game:\nWHEN arcade source starts:\n  hide',{frames:0,storage:true});try{await fresh.vm.loadProject(saved);fresh.vm.greenFlag();await stepFrames(fresh.vm,150);check(fresh,edited);}finally{clearStrayTimers(fresh.vm);}}

test('native Math.idiv signed conversion once order lazy loop and reentrant locals survive portable routes',async()=>{
    const run=await execute(MATH_IDIV_SOURCE);try{
        check(run);const code=await execute({code:run.creator.decompile()});try{check(code);}finally{clearStrayTimers(code.vm);}
        await savedRoutes(run,false);
        const exported=projectToArcade(JSON.parse(run.vm.toJSON()));assert.deepEqual(exported.unsupported,[],exported.unsupported.join('\n'));
        const imported=await execute(exported.files);try{check(imported);}finally{clearStrayTimers(imported.vm);}
    }finally{clearStrayTimers(run.vm);}
});

test('native Math.idiv current converted quotient OP edit exports the actual changed expression',async()=>{
    const run=await execute(MATH_IDIV_SOURCE);try{
        check(run);let edited=false;
        for(const target of run.vm.runtime.targets)for(const setter of Object.values(target.blocks._blocks||{}))if(setter.opcode==='data_setvariableto'&&setter.fields.VARIABLE?.value?.endsWith('idivEditable')){
            const expression=target.blocks.getBlock(setter.inputs.VALUE.block);assert.equal(expression.opcode,'arrays_valueBinary');assert.equal(expression.fields.OP.value,'|');
            target.blocks.changeBlock({id:expression.id,element:'field',name:'OP',value:'&'});edited=true;
        }
        assert.equal(edited,true);run.vm.greenFlag();await stepFrames(run.vm,150);check(run,true);await savedRoutes(run,true);
        const exported=projectToArcade(JSON.parse(run.vm.toJSON()));assert.deepEqual(exported.unsupported,[],exported.unsupported.join('\n'));
        const imported=await execute(exported.files);try{check(imported,true);}finally{clearStrayTimers(imported.vm);}
    }finally{clearStrayTimers(run.vm);}
});
