import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade,projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';

const returned='function returned():Sprite{return null}function unusedReturn(){return returned().flags & SpriteFlag.StayInScreen}let ready=1';
const local='function unusedLocal(){let actor:Sprite=null;return actor.flags & SpriteFlag.StayInScreen}let ready=1';
const resultSprite=/function\s+\w*returned\s*\([^)]*\):\s*Sprite\b/;
const localSprite=/let actor:\s*Sprite\s*=\s*null/;
const create=source=>{
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    const creator=new Creator();creator.parse(imported.code);
    assert.deepEqual(creator.errors,[]);assert.deepEqual(creator.warnings,[]);return creator;
};
const both=project=>{
    const direct=projectToArcade(project),json=projectJsonToArcade(JSON.stringify(project));
    assert.deepEqual(direct.unsupported,json.unsupported);assert.deepEqual(direct.files,json.files);
    return [direct,json];
};
const definition=(project,name)=>{
    const rows=project.targets.flatMap(target=>Object.entries(target.blocks).filter(([,node])=>
        node.opcode==='procedures_definition').map(([id,node])=>({target,id,node,
            proto:target.blocks[node.inputs.custom_block[1]]}))).filter(row=>row.proto.mutation.proccode===name);
    assert.equal(rows.length,1,name);return rows[0];
};
const clean=(project,pattern)=>{
    const outputs=both(project);for(const out of outputs){assert.deepEqual(out.unsupported,[]);assert.match(out.ts,pattern);}
    return outputs[0];
};
const localWriter=project=>{
    const record=definition(project,'unusedLocal');
    const writes=Object.entries(record.target.blocks).filter(([,node])=>node.opcode==='arcade_setLocal'&&node.inputs.NAME[1][1]==='actor');
    assert.equal(writes.length,1);return {...record,writerId:writes[0][0],writer:writes[0][1]};
};
const numberInsteadOfNull=(target,node)=>{
    const id=node.inputs.VALUE[1];assert.equal(target.blocks[id]?.opcode,'arrays_specialValue');
    delete target.blocks[id];node.inputs.VALUE=[1,[4,'7']];
};

test('dormant Sprite result and local declarations survive both routes and three exported-file reimports',()=>{
    for(const [source,pattern]of [[returned,resultSprite],[local,localSprite]]){
        let creator=create(source);
        for(let i=0;i<3;i++)creator=create(clean(creator.project,pattern).files);
        clean(creator.project,pattern);
    }
});

test('Code rebuild and actual SB3 archive reopen retain dormant declarations and null assignments',async()=>{
    for(const [source,pattern]of [[returned,resultSprite],[local,localSprite]]){
        const original=create(source),code=new Creator();code.parse(original.decompile());
        assert.deepEqual(code.errors,[]);assert.deepEqual(code.warnings,[]);clean(code.project,pattern);
        const zip=await JSZip.loadAsync(await(await code.generateSB3()).arrayBuffer());
        const saved=await zip.file('project.json').async('string');
        const output=clean(JSON.parse(saved),pattern);clean(create(output.files).project,pattern);
        assert.match(output.ts,source===local?/actor\s*=\s*null/:/return null/);
    }
});

test('a live caller cannot borrow a dormant result or local declaration',()=>{
    for(const [source,callee,pattern]of [[returned,'returned',resultSprite],[local,'unusedLocal',localSprite]]){
        const project=create(source+`;${callee}()`).project;
        for(const out of both(project))assert.doesNotMatch(out.ts,pattern);
    }
});

test('a non-null local writer or result is preserved without a Sprite declaration',()=>{
    for(const source of [local,returned]){
        const project=create(source).project;
        if(source===local){const row=localWriter(project);numberInsteadOfNull(row.target,row.writer);}
        else {
            const row=definition(project,'returned'),node=row.target.blocks[row.node.next];
            assert.equal(node.opcode,'arcade_returnValue');numberInsteadOfNull(row.target,node);
        }
        for(const out of both(project)){
            assert.doesNotMatch(out.ts,source===local?localSprite:resultSprite);
            assert.match(out.ts,source===local?/actor\s*=\s*7/:/return 7/);
        }
    }
});

test('an extra non-flags consumer prevents contextual result or local narrowing',()=>{
    const cases=[
        [returned+';function escape(){return returned()}',resultSprite],
        [local.replace('return actor.flags','console.log(actor);return actor.flags'),localSprite]
    ];
    for(const [source,pattern]of cases)for(const out of both(create(source).project))assert.doesNotMatch(out.ts,pattern);
});

test('a flags read before the actual null assignment does not use the generated zero initializer as proof',()=>{
    const project=create(local).project,row=localWriter(project),next=row.target.blocks[row.writer.next];
    assert.equal(next.opcode,'arcade_returnValue');
    // Move the real assignment after the read, retaining the physical chain.
    const returnId=row.writer.next;row.node.next=returnId;next.parent=row.id;
    row.writer.next=next.next;next.next=row.writerId;row.writer.parent=returnId;
    for(const out of both(project))assert.doesNotMatch(out.ts,localSprite);
});

test('all branches must initialize the physical local before a flags read',()=>{
    for(const complete of [true,false]){
        const source=`function unusedLocal(){let actor:Sprite=null;if(true){actor=null}else{${complete?'actor=null':'let untouched=1'}}return actor.flags & SpriteFlag.StayInScreen}let ready=1`;
        const project=create(source).project,row=definition(project,'unusedLocal'),firstId=row.node.next,first=row.target.blocks[firstId];
        assert.equal(first.opcode,'arcade_setLocal');
        const next=row.target.blocks[first.next];assert.equal(next.opcode,'control_if_else');
        row.node.next=first.next;next.parent=row.id;
        delete row.target.blocks[first.inputs.VALUE[1]];delete row.target.blocks[firstId];
        for(const out of both(project)){
            if(complete){assert.deepEqual(out.unsupported,[]);assert.match(out.ts,localSprite);}
            else assert.doesNotMatch(out.ts,localSprite);
        }
    }
});

test('an actual bitwise-helper name capture cannot masquerade as a safe local binding',()=>{
    const source=local.replaceAll('actor','__bwBinaryBitAnd');
    for(const out of both(create(source).project)){
        assert.doesNotMatch(out.ts,/let __bwBinaryBitAnd:\s*Sprite\b/);
        assert.match(out.ts,/return __bwBinaryBitAnd\(__bwBinaryBitAnd\.flags/);
    }
});

test('later callers and incompatible writers revoke a previously successful declaration plan',()=>{
    const original=create(returned).project;clean(original,resultSprite);
    original.targets=create(returned+';returned()').project.targets;
    for(const out of both(original))assert.doesNotMatch(out.ts,resultSprite);
    const project=create(local).project;clean(project,localSprite);
    const row=localWriter(project);numberInsteadOfNull(row.target,row.writer);
    for(const out of both(project))assert.doesNotMatch(out.ts,localSprite);
});

test('multiple dormant flags consumers preserve every call and side effect',()=>{
    const source=returned.replace('return returned().flags','console.log(returned().flags);return returned().flags');
    const output=clean(create(source).project,resultSprite);
    assert.match(output.ts,/console\.log\(\w*returned\(\)\.flags\)/);
    assert.equal([...output.ts.matchAll(/\w*returned\(\)/g)].length,2);
    clean(create(output.files).project,resultSprite);
});

test('a generated repeat-loop binding cannot capture the physical local flags reader',()=>{
    const project=create(local.replaceAll('actor','i1')).project,row=definition(project,'unusedLocal');
    const writer=row.target.blocks[row.node.next],returnId=writer.next,returned=row.target.blocks[returnId];
    assert.equal(writer.opcode,'arcade_setLocal');assert.equal(returned.opcode,'arcade_returnValue');
    const loopId='dormant_local_capture_loop';assert.equal(row.target.blocks[loopId],undefined);
    row.target.blocks[loopId]={opcode:'control_repeat',parent:row.node.next,next:null,
        topLevel:false,shadow:false,fields:{},inputs:{TIMES:[1,[4,'1']],SUBSTACK:[2,returnId]}};
    writer.next=loopId;returned.parent=loopId;
    for(const out of both(project)){
        assert.doesNotMatch(out.ts,/let i1:\s*Sprite\b/);
        assert.match(out.ts,/for\s*\(let i1\s*=/);
    }
});

// Deliberately part of the default test run. The bounded source-only probe
// selects other test names; missing browser/VM inputs must fail qualification.
test('original PXT/native: dormant declarations compile and preserve startup through Code, export and fresh SB3',async()=>{
    const {runPxtArcade}=await import('./helpers/pxt-arcade-runtime.mjs');
    const {runProgram,stepFrames,clearStrayTimers}=await import('./helpers/bw-vm.mjs');
    const runs=[];
    const check=run=>{
        const variables=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables))
            .filter(variable=>['ready','Game_ready'].includes(variable.name));
        assert.equal(variables.length,1);assert.equal(variables[0].value,1);
        assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
    };
    try{
        for(const [source,pattern]of [[returned,resultSprite],[local,localSprite]]){
            const expected=await runPxtArcade(source,{fakeClock:true});assert.equal(expected.ready,1);
            const creator=create(source),output=clean(creator.project,pattern);
            const compiled=await runPxtArcade(output.files,{fakeClock:true});assert.equal(compiled.ready,expected.ready);
            let first;
            for(const code of [creator.decompile(),create(output.files).decompile()]){
                const run=await runProgram(code,{frames:8,storage:true});runs.push(run);check(run);first ||= run;
            }
            const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});
            runs.push(fresh);fresh.vm.stopAll();
            await fresh.vm.loadProject(Buffer.from(await(await first.vm.saveProjectSb3()).arrayBuffer()));
            fresh.vm.greenFlag();await stepFrames(fresh.vm,8);check(fresh);
            const reopened=fresh.vm.toJSON();
            const exported=projectJsonToArcade(typeof reopened==='string'?reopened:JSON.stringify(reopened));
            assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,pattern);
            const compiledReopened=await runPxtArcade(exported.files,{fakeClock:true});
            assert.equal(compiledReopened.ready,expected.ready);
        }
    }finally{for(const run of runs)run.vm.quit();clearStrayTimers();}
});
