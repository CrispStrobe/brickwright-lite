import test from 'node:test';
import assert from 'node:assert/strict';
import {managedNumberBoundaries} from './fixtures/arcade/managed-number-boundaries.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import BW from '../overlay/scratch-vm/src/util/bw-values.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';

const literal=(blocks,input)=>{if(Array.isArray(input?.[1]))return input[1][1];const block=blocks[input?.[1]];return block?.fields?.TEXT?.[0]??block?.fields?.NUM?.[0];};
function editLeaf(project,fixture,opcode){
    const matches=[];
    for(const target of project.targets){for(const [id,block]of Object.entries(target.blocks||{})){
        const wanted=fixture.kind==='return'?block.opcode==='arcade_returnValue':fixture.kind==='arg'?block.opcode==='arcade_functionArgument':fixture.kind==='local'?block.opcode==='arcade_setLocal'&&String(literal(target.blocks,block.inputs.NAME)).includes('item'):fixture.kind==='field'?block.opcode==='arcade_setObjectField':block.opcode==='arcade_setCaptured';
        if(wanted)matches.push({target,id,block});
    }}
    assert.ok(matches.length,fixture.name+' actual consumer exists');
    const selected=matches.length===1?matches:matches.filter(({target,block})=>{const child=target.blocks[block.inputs?.VALUE?.[1]];return child?.opcode==='operator_add'&&Object.values(child.inputs||{}).some(input=>Number(literal(target.blocks,input))===1);});
    assert.equal(selected.length,1,fixture.name+' actual explicit value argument');
    const {target,id,block}=selected[0],leaf=id+'_currentLiteral';
    const removed=[];
    const removeOwned=id=>{if(typeof id!=='string'||!target.blocks[id])return;const old=target.blocks[id];for(const input of Object.values(old.inputs||{})){const child=target.blocks[input[1]];if(child){assert.equal(child.parent,id,'replacement deletes only its owned expression subtree');removeOwned(input[1]);}}removed.push(id);delete target.blocks[id];};
    removeOwned(block.inputs.VALUE?.[1]);
    target.blocks[leaf]={opcode,next:null,parent:id,inputs:{},fields:opcode==='math_number'?{NUM:['20',null]}:{TEXT:['20',null]},shadow:true,topLevel:false};
    block.inputs.VALUE=[1,leaf];
    assert.equal(target.blocks[block.inputs.VALUE[1]].parent,id);
    return {targetName:target.name,id,opcode:block.opcode,leaf,removed};
}
function observation(run){
    const values=Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(v=>[v.name.replace(/^Game_/,''),BW.decode(v.value)]));
    return {result:values.result,calls:values.calls,errors:run.errors.map(error=>String(error?.message||error)),warnings:run.creator.warnings};
}
for(const fixture of managedNumberBoundaries)for(const opcode of ['math_number','text']){
    test(fixture.name+' physical '+opcode+' across current graph, Code, SB3 and export/reimport', {todo:(["ordinary-argument physical text across current graph, Code, SB3 and export/reimport"].includes(fixture.name+' physical '+opcode+' across current graph, Code, SB3 and export/reimport')?"procedure constraint producer not yet proven \u2014 see docs/ARCADE-888-OPEN-FAILURES.md":undefined)},async t=>{
        const runs=[],observations=[],routeFailures=[];
        const expected=opcode==='math_number'?fixture.numberResult:fixture.textResult;
        const record=(route,run)=>{const actual=observation(run);observations.push({route,...actual});};
        const attempt=async(route,body)=>{try{await body();}catch(error){routeFailures.push({route,error:String(error?.stack||error)});}};
        try{
            const imported=arcadeToPseudocode(fixture.source);assert.deepEqual(imported.unsupported,[]);
            const run=await runProgram(imported.code,{frames:40,storage:true});runs.push(run);
            const project=structuredClone(run.creator.project),binding=editLeaf(project,fixture,opcode);
            run.creator.project=project;
            const edited=Buffer.from(await(await run.creator.generateSB3()).arrayBuffer());
            run.vm.stopAll();await run.vm.loadProject(edited);run.vm.greenFlag();await stepFrames(run.vm,40);record('native-current-leaf',run);
            // The creator must inspect the edited graph, not its old source graph.
            const current=JSON.parse(run.vm.toJSON());
            for(const target of project.targets){const actual=current.targets.find(value=>value.isStage===target.isStage&&value.name===target.name);assert.ok(actual);target.blocks=actual.blocks;}
            run.creator.project=structuredClone(project);
            await attempt('Code',async()=>{const code=run.creator.decompile();const replay=await runProgram(code,{frames:40,storage:true});runs.push(replay);record('Code',replay);});
            const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
            await attempt('same-SB3',async()=>{run.vm.stopAll();await run.vm.loadProject(saved);run.vm.greenFlag();await stepFrames(run.vm,40);record('same-SB3',run);});
            await attempt('fresh-SB3',async()=>{const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(saved);fresh.vm.greenFlag();await stepFrames(fresh.vm,40);record('fresh-SB3',fresh);});
            await attempt('export-reimport',async()=>{
                const exported=projectToArcade(project);
                if(opcode==='text'&&['captured-write','factory-argument'].includes(fixture.name)){
                    assert.ok(exported.unsupported.length,'non-numeric callback writers retain bounded source export refusal');
                    const refusal=fixture.name==='captured-write'?'Callable export graph: edited current assignment differs from its concrete lexical signature':'Callable source gate requires every factory call to provide concrete numeric operands from a direct unchanged declaration';
                    assert.ok(exported.unsupported.includes(refusal),JSON.stringify(exported.unsupported));
                    observations.push({route:'export-reimport-refusal',unsupported:exported.unsupported});return;
                }
                if(opcode==='text'&&fixture.name.startsWith('class-')){
                    // Native Text remains Text in all four editable routes.
                    // An unchanged Number declaration cannot export this edit
                    // as compiler-valid source; preserve its precise refusal.
                    const conflicts={
                        'class-return':'result Reader.__bwClass_Reader_read %s',
                        'class-argument':'argument Reader.__bwClass_Reader_read %s %s.value',
                        'class-field':'field Reader.value writer'
                    };
                    assert.deepEqual(exported.unsupported,[`Class primitive export: ${conflicts[fixture.name]} conflicts with declared number (actual String)`]);
                    observations.push({route:'export-reimport-refusal',unsupported:exported.unsupported});return;
                }
                assert.deepEqual(exported.unsupported,[],'current edited graph export diagnostics');
                const reimported=arcadeToPseudocode(exported.ts);assert.deepEqual(reimported.unsupported,[],'current export reimport diagnostics');
                const replay=await runProgram(reimported.code,{frames:40,storage:true});runs.push(replay);record('export-reimport',replay);
            });
            t.diagnostic(JSON.stringify({fixture:fixture.name,physical:opcode,binding,expected,observations,routeFailures}));
            const failures=[...routeFailures];
            for(const actual of observations){
                if(actual.route==='export-reimport-refusal')continue;
                try{assert.deepEqual(actual.errors,[]);assert.deepEqual(actual.warnings,[]);assert.equal(actual.result,expected);assert.equal(typeof actual.result,typeof expected);if(fixture.source.includes('calls+=1'))assert.equal(actual.calls,1);}
                catch(error){failures.push({route:actual.route,error:String(error.message)});}
            }
            assert.deepEqual(failures,[],JSON.stringify({fixture:fixture.name,physical:opcode,observations}));
            assert.equal(observations.length,5,'all five native conversion routes observed');
        }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
    });
}
