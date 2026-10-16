import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {importProjectFiles} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {VM_SRC} from './helpers/bw-extensions.mjs';
const require=createRequire(import.meta.url),BW=require(VM_SRC+'/util/bw-values.js');
const imported=source=>{
    const result=importProjectFiles({'main.ts':source},{target:'arcade'});
    assert.deepEqual(result.unsupported,[]);assert.deepEqual(result.warnings,[]);return result;
};
const finish=run=>{run.vm.stopAll();run.vm.quit();clearStrayTimers();};
const observed=(t,run)=>{
    const values=Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(value=>[value.name,BW.decode(value.value)]));
    const facts={values,errors:[...run.errors],creatorWarnings:[...run.creator.warnings]};
    t.diagnostic(JSON.stringify(facts));return facts;
};
const source='let entered=0;let seen=0;let after=0;function receive(value:number){entered+=1;seen=value;}info.player2.setScore(35);receive(info.player2.score());after+=1;';

test('all four actual fixed-player Number results retain isolation and same-VM saved reload',async t=>{
    let body='let entered=0;let seen1=0;let seen2=0;let seen3=0;let seen4=0;';
    for(let player=1;player<=4;player++)body+=`function receive${player}(value:number){entered+=1;seen${player}=value;}info.player${player}.setScore(${player*11});`;
    for(let player=1;player<=4;player++)body+=`receive${player}(info.player${player}.score());`;
    const input=imported(body);let run;
    try{
        run=await runProgram(input.code,{frames:10,storage:true});
        const check=()=>{const facts=observed(t,run);assert.deepEqual(facts.errors,[]);assert.deepEqual(facts.creatorWarnings,[]);assert.equal(facts.values.entered,4);for(let p=1;p<=4;p++)assert.equal(facts.values['seen'+p],p*11);};
        check();const bytes=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
        run.vm.stopAll();await run.vm.loadProject(bytes);run.vm.greenFlag();await stepFrames(run.vm,10);check();
    }finally{if(run)finish(run);}
});

test('editing the actual connected score writer preserves a default score Number through current export and reimport',async t=>{
    const input=imported('let seen=0;function receive(value:number){seen=value;}info.player1.setScore(11);receive(info.score());');let first,second;
    try{
        first=await runProgram(input.code,{frames:10,storage:true});assert.equal(observed(t,first).values.seen,11);
        first.vm.stopAll();const current=JSON.parse(first.vm.toJSON());
        const target=current.targets.find(owner=>Object.values(owner.blocks).some(block=>block.opcode==='arcade_setPlayerScore'));
        const writers=Object.values(target.blocks).filter(block=>block.opcode==='arcade_setPlayerScore');assert.equal(writers.length,1);
        const slot=writers[0].inputs.PLAYER;assert.ok(slot);
        if(typeof slot[1]==='string'){
            const shadow=target.blocks[slot[1]];assert.equal(shadow.opcode,'math_number');assert.equal(String(shadow.fields.NUM[0]),'1');shadow.fields.NUM[0]='2';
        }else{assert.equal(slot[1][0],4);assert.equal(String(slot[1][1]),'1');slot[1][1]='2';}
        const out=projectToArcade(current);assert.deepEqual(out.unsupported,[]);assert.deepEqual(out.warnings,[]);
        assert.match(out.ts,/info\.player2\.setScore\(11\)/);assert.match(out.ts,/info\.score\(\)/);
        const returned=imported(out.ts);second=await runProgram(returned.code,{frames:10,storage:true});
        const facts=observed(t,second);assert.deepEqual(facts.errors,[]);assert.equal(facts.values.seen,0);
        assert.equal(second.vm.runtime.bwArcadeDeviceState.players[1].score,11);
    }finally{if(second)finish(second);if(first)finish(first);}
});

for(const fault of ['different supported player','unsupported player','reference tag','coercible object','getter argument','getter shadow value','foreign shadow parent'])
    test('fixed player result refuses '+fault+' before ordinary body effects',async t=>{
        const input=imported(source);let run;
        try{
            run=await runProgram(input.code,{frames:10});const baseline=observed(t,run);
            assert.deepEqual(baseline.errors,[]);assert.equal(baseline.values.seen,35);assert.equal(baseline.values.entered,1);assert.equal(baseline.values.after,1);
            run.vm.stopAll();run.vm.greenFlag();const runtime=run.vm.runtime;
            const target=runtime.targets.find(owner=>Object.values(owner.blocks._blocks).some(block=>block.opcode==='arcade_getPlayerScore'));
            const block=Object.values(target.blocks._blocks).find(value=>value.opcode==='arcade_getPlayerScore');
            const operations=Object.values(target.blocks._cache._executeCached).flatMap(value=>value._ops||[]);
            const scores=[...new Set(operations.filter(op=>op.id===block.id))];assert.equal(scores.length,1);
            const operation=scores[0],shadow=target.blocks._cache._executeCached[block.inputs.PLAYER.block];assert.ok(shadow);
            if(fault==='getter argument'){
                let actual=2;Object.defineProperty(operation._argValues,'PLAYER',{configurable:true,get(){return actual;},set(value){actual=value;}});
            }else if(fault==='getter shadow value')Object.defineProperty(shadow,'_shadowValue',{configurable:true,get(){return 2;},set(){}});
            else if(fault==='foreign shadow parent')shadow._parentValues={PLAYER:2};
            else{
                const value=fault==='different supported player'?3:fault==='unsupported player'?5:
                    fault==='reference tag'?{bwNumber:2}:{toString(){return '2';}};
                operation._argValues.PLAYER=value;shadow._shadowValue=value;
            }
            await stepFrames(run.vm,10);const facts=observed(t,run);
            assert.equal(facts.values.entered,0);assert.equal(facts.values.seen,0);assert.equal(facts.values.after,0);
            assert.equal(facts.errors.length,1);assert.match(facts.errors[0],/inspection|constraint/i);
        }finally{if(run)finish(run);}
    });
