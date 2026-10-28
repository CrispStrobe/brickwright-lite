import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade,projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';

const source='function unusedSprite(actor:Sprite){return actor.flags & SpriteFlag.StayInScreen}let ready=1';
const spriteSignature=/function\s+\w*unusedSprite\s*\([^)]*\bactor:\s*Sprite\b/;
const anySignature=/function\s+\w*unusedSprite\s*\([^)]*\bactor:\s*any\b/;
const create=input=>{
    const translated=arcadeToPseudocode(input);
    assert.deepEqual(translated.unsupported||[],[]);
    const creator=new Creator();creator.parse(translated.code);
    assert.deepEqual(creator.errors||[],[]);
    assert.deepEqual(creator.warnings||[],[]);
    return creator;
};
const both=project=>{
    const direct=projectToArcade(project),json=projectJsonToArcade(JSON.stringify(project));
    assert.deepEqual(direct.unsupported,json.unsupported);
    assert.deepEqual(direct.files,json.files);
    return [direct,json];
};
const cleanExport=project=>{
    const outputs=both(project);
    for(const out of outputs){
        assert.deepEqual(out.unsupported,[]);
        assert.match(out.ts,spriteSignature);
        assert.doesNotMatch(out.ts,anySignature);
        assert.match(out.ts,/actor\.flags/);
    }
    return outputs[0];
};
const helper=project=>{
    const found=project.targets.flatMap(target=>Object.entries(target.blocks).filter(([,node])=>
        node.opcode==='procedures_definition').map(([id,definition])=>({target,id,definition,
        proto:target.blocks[definition.inputs.custom_block[1]]}))).filter(row=>
        /unusedSprite/.test(row.proto.mutation.proccode));
    assert.equal(found.length,1);
    return found[0];
};
const flags=project=>{
    const row=helper(project);
    const matches=Object.entries(row.target.blocks).filter(([,node])=>node.opcode==='arcade_spriteProperty'&&node.fields.PROPERTY[0]==='flags');
    assert.equal(matches.length,1);
    return {...row,flagsId:matches[0][0],flags:matches[0][1]};
};
// Insert a real owned statement before the original return, preserving the
// procedure's parent/next chain so a negative cannot pass on broken ownership.
const prepend=(project,statement,children={})=>{
    const {target,id,definition}=helper(project),statementId='typed_bitwise_negative_statement';
    assert.equal(target.blocks[statementId],undefined);
    const next=definition.next;
    target.blocks[statementId]={topLevel:false,shadow:false,parent:id,next,...statement};
    target.blocks[next].parent=statementId;
    definition.next=statementId;
    for(const [childId,child]of Object.entries(children)){
        assert.equal(target.blocks[childId],undefined);
        target.blocks[childId]={topLevel:false,shadow:false,parent:statementId,next:null,...child};
    }
};
const noSpriteFallback=project=>{
    for(const out of both(project))assert.doesNotMatch(out.ts,spriteSignature);
};
const opaqueArgument=(project,name)=>{
    const calls=project.targets.flatMap(target=>Object.entries(target.blocks).filter(([,node])=>
        node.opcode==='arcade_callFunction'&&String(node.inputs?.NAME?.[1]?.[1]).includes(name))
        .map(([,call])=>({target,call})));
    assert.equal(calls.length,1);
    const {target,call}=calls[0],argumentId=call.inputs.ARGS[1],argument=target.blocks[argumentId];
    assert.equal(argument.opcode,'arcade_functionArgument');
    const remove=id=>{
        if(typeof id!=='string'||!target.blocks[id])return;
        const node=target.blocks[id];delete target.blocks[id];
        for(const input of Object.values(node.inputs||{}))for(const child of input.slice(1))remove(child);
        remove(node.next);
    };
    for(const child of argument.inputs.VALUE.slice(1))remove(child);
    const reporterId='typed_bitwise_opaque_argument';assert.equal(target.blocks[reporterId],undefined);
    target.blocks[reporterId]={opcode:'arrays_parseLegacyValue',parent:argumentId,next:null,
        topLevel:false,shadow:false,fields:{},inputs:{VALUE:[1,[10,'{"not":"a sprite"}']]}};
    argument.inputs.VALUE=[2,reporterId];
};

test('unused Sprite flags formal retains its declaration through both export routes and three reimports',()=>{
    let creator=create(source);
    for(let generation=0;generation<3;generation++){
        const out=cleanExport(creator.project);
        // The importer receives the actual exported file collection, including
        // its generated main.ts, rather than the original annotated fixture.
        creator=create(out.files);
        assert.equal(JSON.parse(helper(creator.project).proto.mutation.argumentnames).length,1);
    }
    cleanExport(creator.project);
});

test('unused Sprite flags signature survives actual Code decompile and SB3 project reopen',async()=>{
    const initial=create(source),code=new Creator();
    code.parse(initial.decompile());
    assert.deepEqual(code.errors||[],[]);assert.deepEqual(code.warnings||[],[]);
    cleanExport(code.project);
    const archive=await JSZip.loadAsync(await(await code.generateSB3()).arrayBuffer());
    const entry=archive.file('project.json');assert.ok(entry);
    const saved=await entry.async('string'),project=JSON.parse(saved);
    const out=cleanExport(project);
    const savedOutput=projectJsonToArcade(saved);
    assert.deepEqual(savedOutput.unsupported,[]);
    assert.deepEqual(savedOutput.files,out.files);
    cleanExport(create(savedOutput.files).project);
});

test('reaching a Sprite flags helper with an actual opaque caller retains its operand refusal',()=>{
    for(const [text,callee] of [
        [source+';let actor=sprites.create(image.create(1,1),1);let result=unusedSprite(actor)','unusedSprite'],
        [source+';function relay(actor:Sprite){return unusedSprite(actor)}let actor=sprites.create(image.create(1,1),1);let result=relay(actor)','relay']
    ]){
        const project=create(text).project;opaqueArgument(project,callee);
        for(const out of both(project))assert.ok(out.unsupported.some(reason=>/Native bitwise operation/.test(reason)));
    }
});

test('a second formal read outside the exact flags receiver cannot borrow a Sprite declaration',()=>{
    const project=create(source).project;
    prepend(project,{opcode:'arcade_log',inputs:{TEXT:[2,'typed_bitwise_extra_read']}},{
        typed_bitwise_extra_read:{opcode:'arcade_getLocal',inputs:{NAME:[1,[10,'actor']]},fields:{}}
    });
    noSpriteFallback(project);
    for(const out of both(project))assert.match(out.ts,anySignature);
});

test('writing the selected formal preserves existing scalar inference without a Sprite declaration',()=>{
    for(const [value,type,assignment] of [
        [[4,'0'],'number',/\bactor\s*=\s*0/],
        [[10,'replacement'],'string',/\bactor\s*=\s*"replacement"/]
    ]){
        const project=create(source).project;
        prepend(project,{opcode:'arcade_setLocal',inputs:{NAME:[1,[10,'actor']],VALUE:[1,value]},fields:{}});
        noSpriteFallback(project);
        for(const out of both(project)){
            // The writer already selects its scalar annotation independently;
            // denying the dormant fallback must preserve that existing result.
            assert.match(out.ts,new RegExp('function\\s+\\w*unusedSprite\\s*\\([^)]*\\bactor:\\s*'+type+'\\b'));
            assert.match(out.ts,assignment);
        }
    }
});

test('misleading NAME fields cannot hide the actual formal write input',()=>{
    const project=create(source).project;
    prepend(project,{opcode:'arcade_setLocal',fields:{NAME:['differentLocal',null]},
        inputs:{NAME:[1,[10,'actor']],VALUE:[1,[4,'0']]}});
    noSpriteFallback(project);
    for(const out of both(project)){
        assert.match(out.ts,anySignature);
        assert.match(out.ts,/\bactor\s*=\s*0/);
    }
});

test('malformed flags receiver shapes retain an actual visible bitwise refusal',()=>{
    const edits=[
        row=>{row.flags.fields.PROPERTY[0]='x';},
        row=>{row.flags.mutation={property:'flags'};},
        row=>{row.flags.fields.EXTRA=['flags',null];}
    ];
    for(const edit of edits){
        const project=create(source).project;edit(flags(project));
        for(const out of both(project)){
            // Denying the closed-entry proof restores the existing ordinary
            // type graph, which can infer Sprite. Its operand refusal must stay.
            assert.ok(out.unsupported.some(reason=>/Native bitwise operation/.test(reason)));
            assert.match(out.ts,/_na/);
        }
    }
});

test('ambiguous prototype formals retain refusal without a new Sprite declaration',()=>{
    const edits=[
        row=>{const names=JSON.parse(row.proto.mutation.argumentnames);row.proto.mutation.argumentnames=JSON.stringify([...names,...names]);},
        row=>{row.proto.mutation.argumentids='[]';},
        row=>{row.proto.mutation.argumentnames=JSON.stringify(['differentFormal']);}
    ];
    for(const edit of edits){
        const project=create(source).project;edit(flags(project));noSpriteFallback(project);
        for(const out of both(project))assert.ok(out.unsupported.some(reason=>/ambiguous or malformed definition\/prototype\/formals/.test(reason)));
    }
});

test('a colliding local emitted name cannot masquerade as a distinct formal binding',()=>{
    const project=create(source).project,row=flags(project);
    row.proto.mutation.argumentnames=JSON.stringify(['actor-name']);
    const formalId=JSON.parse(row.proto.mutation.argumentids)[0];
    row.target.blocks[row.proto.inputs[formalId][1]].fields.VALUE=['actor-name',null];
    const reader=row.target.blocks[row.flags.inputs.ID[1]];
    assert.ok(reader);
    if(reader.opcode==='arcade_getLocal')reader.inputs.NAME=[1,[10,'actor-name']];
    else {assert.match(reader.opcode,/^argument_reporter_/);reader.fields.VALUE=['actor-name',null];}
    prepend(project,{opcode:'arcade_setLocal',inputs:{NAME:[1,[10,'actor_name']],VALUE:[1,[4,'0']]},fields:{}});
    for(const out of both(project))assert.doesNotMatch(out.ts,/\bactor_name:\s*Sprite\b/);
});

test('a generated repeat-loop binding cannot capture the formal flags read',()=>{
    const project=create(source).project,{target,definition,proto}=helper(project);
    proto.mutation.argumentnames=JSON.stringify(['i1']);
    for(const node of Object.values(target.blocks)){
        if(/^argument_reporter_/.test(node.opcode)&&node.fields?.VALUE?.[0]==='actor')node.fields.VALUE[0]='i1';
        if(node.opcode==='arcade_getLocal'&&node.inputs?.NAME?.[1]?.[1]==='actor')node.inputs.NAME[1][1]='i1';
    }
    const original=definition.next;
    prepend(project,{opcode:'control_repeat',inputs:{TIMES:[1,[4,'1']],SUBSTACK:[2,original]},fields:{}});
    target.blocks.typed_bitwise_negative_statement.next=null;
    for(const out of both(project)){
        assert.doesNotMatch(out.ts,/\bi1:\s*Sprite\b/);
        assert.match(out.ts,/for\s*\(let i1\s*=/);
    }
});

test('physical global and inline variable identifiers cannot alias the inferred formal',()=>{
    for(const inline of [false,true]){
        const project=create(source).project,stage=project.targets.find(target=>target.isStage);
        stage.variables.typed_bitwise_global_actor=['actor',0];
        if(inline)prepend(project,{opcode:'arcade_log',fields:{},inputs:{TEXT:[1,[12,'actor','typed_bitwise_global_actor']]}});
        else prepend(project,{opcode:'data_setvariableto',fields:{VARIABLE:['actor','typed_bitwise_global_actor']},inputs:{VALUE:[1,[4,'0']]}});
        noSpriteFallback(project);
        for(const out of both(project))assert.match(out.ts,anySignature);
    }
});

test('an allocated named-array spelling cannot alias a formal flags receiver',()=>{
    const project=create(source).project,{target,proto}=helper(project),name='__bwNamedArray_items';
    proto.mutation.argumentnames=JSON.stringify([name]);
    for(const node of Object.values(target.blocks)){
        if(/^argument_reporter_/.test(node.opcode)&&node.fields?.VALUE?.[0]==='actor')node.fields.VALUE[0]=name;
        if(node.opcode==='arcade_getLocal'&&node.inputs?.NAME?.[1]?.[1]==='actor')node.inputs.NAME[1][1]=name;
    }
    prepend(project,{opcode:'arrays_createEmpty',fields:{},inputs:{NAME:[1,[10,'items']]}});
    for(const out of both(project)){
        assert.doesNotMatch(out.ts,/\b__bwNamedArray_items:\s*Sprite\b/);
        assert.match(out.ts,/\b__bwNamedArray_items\s*=\s*\[\]/);
    }
});

test('an actual generated bitwise helper call cannot capture a same-named formal',()=>{
    const project=create(source).project,{target,proto}=helper(project),name='__bwBinaryBitAnd';
    proto.mutation.argumentnames=JSON.stringify([name]);
    for(const node of Object.values(target.blocks)){
        if(/^argument_reporter_/.test(node.opcode)&&node.fields?.VALUE?.[0]==='actor')node.fields.VALUE[0]=name;
        if(node.opcode==='arcade_getLocal'&&node.inputs?.NAME?.[1]?.[1]==='actor')node.inputs.NAME[1][1]=name;
    }
    for(const out of both(project)){
        assert.doesNotMatch(out.ts,/\b__bwBinaryBitAnd:\s*Sprite\b/);
        assert.match(out.ts,/function\s+\w*unusedSprite\s*\([^)]*\b__bwBinaryBitAnd:\s*any\b/);
        // This is an emitted call-site collision, not merely a reserved-looking
        // name: the helper spelling also resolves to the procedure parameter.
        assert.match(out.ts,/return\s+__bwBinaryBitAnd\s*\(\s*__bwBinaryBitAnd\.flags/);
    }
});

test('a dormant declaration never supplies a live opaque flags operand proof',()=>{
    const live='function reached(actor:Sprite){return actor.flags & 2}let actor=sprites.create(image.create(1,1),1);let result=reached(actor)';
    const before=both(create(live).project),after=both(create(source+';'+live).project);
    for(let route=0;route<2;route++){
        assert.ok(before[route].unsupported.some(reason=>/Native bitwise operation/.test(reason)));
        assert.deepEqual(after[route].unsupported,before[route].unsupported);
        assert.match(after[route].ts,spriteSignature);
    }
});
