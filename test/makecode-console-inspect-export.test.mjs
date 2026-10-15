import test from 'node:test';
import assert from 'node:assert/strict';
import {SB3Creator} from './helpers/bw-vm.mjs';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
const make=()=>{const creator=new SB3Creator();creator.parse('DEVICE ARCADE\nSPRITE Game:\nWHEN arcade source starts:\n  set result to (arcade inspect value ("text") limit (20))\n');assert.deepEqual(creator.warnings,[]);return creator;};
test('inspection exports current actual connected primitive inputs once',()=>{
    const creator=make(),target=creator.project.targets.find(t=>!t.isStage),block=Object.values(target.blocks).find(b=>b.opcode==='arcade_inspectValue');
    block.inputs.VALUE=[1,[10,'changed']];block.inputs.LIMIT=[1,[4,'2']];
    const exported=projectToArcade(creator.project);assert.deepEqual(exported.unsupported,[]);
    assert.match(exported.ts,/console\.inspect\("changed", 2\)/);
    assert.equal(exported.ts.match(/console\.inspect\(/g)?.length,1);
    assert.doesNotMatch(exported.ts,/console\.log|\.say\(/);
});
test('inspection refuses a reference producer and an invalid primitive limit edit',()=>{
    for(const which of ['VALUE','LIMIT']){
        const creator=make(),target=creator.project.targets.find(t=>!t.isStage),block=Object.values(target.blocks).find(b=>b.opcode==='arcade_inspectValue');
        if(which==='VALUE'){
            target.blocks.art={opcode:'arcade_createImage',parent:Object.keys(target.blocks).find(id=>target.blocks[id]===block),inputs:{WIDTH:[1,[4,'2']],HEIGHT:[1,[4,'2']]},fields:{}};
            block.inputs.VALUE=[2,'art'];
        }else block.inputs.LIMIT=[1,[10,'not a Number']];
        const exported=projectToArcade(creator.project);assert.ok(exported.unsupported.some(reason=>reason.includes('inspection export')),which);
    }
});

test('current inspection export rejects hidden or foreign variable writers and opaque operator inputs',()=>{
    const code='DEVICE ARCADE\nGLOBAL value\nGLOBAL result\nSPRITE Game:\nWHEN arcade source starts:\n  set value to ("safe")\n  set result to (arcade inspect value (value) limit (20))\n';
    for(const foreign of [false,true]){
        const creator=new SB3Creator();creator.parse(code);const target=creator.project.targets.find(t=>!t.isStage),read=Object.values(target.blocks).find(b=>b.opcode==='data_setvariableto'&&b.fields.VARIABLE[0]==='value'),owner=foreign?creator.project.targets.find(t=>t.isStage):target;
        owner.blocks.hidden={opcode:'data_setvariableto',parent:null,next:null,fields:{VARIABLE:[...read.fields.VARIABLE]},inputs:{VALUE:[2,'opaque']},topLevel:false};
        owner.blocks.opaque={opcode:'arcade_createSprite',parent:'hidden',next:null,fields:{},inputs:{}};
        assert.ok(projectToArcade(creator.project).unsupported.some(reason=>reason.includes('inspection export')),foreign?'foreign':'disconnected');
    }
    const creator=make(),target=creator.project.targets.find(t=>!t.isStage),inspect=Object.values(target.blocks).find(b=>b.opcode==='arcade_inspectValue');
    target.blocks.join={opcode:'operator_join',inputs:{STRING1:[2,'opaque'],STRING2:[1,[10,'x']]},fields:{}};
    target.blocks.opaque={opcode:'arcade_createSprite',inputs:{},fields:{}};inspect.inputs.VALUE=[2,'join'];
    assert.ok(projectToArcade(creator.project).unsupported.some(reason=>reason.includes('inspection export')));
});

test('computed local writer poisons its actual scope without poisoning a sibling procedure',()=>{
    const code='DEVICE ARCADE\nGLOBAL result\nSPRITE Game:\nWHEN arcade source starts:\n  set result to (arcade call function "read" arguments ("[]"))\nDEFINE read:\n  arcade set local cell to ("safe")\n  arcade return value (arcade inspect value (arcade local cell) limit (20))\nDEFINE sibling:\n  arcade set local cell to ("other")\n';
    for(const ownerName of ['read','sibling']){
        const creator=new SB3Creator();creator.parse(code);const target=creator.project.targets.find(t=>!t.isStage),blocks=target.blocks;
        const definition=Object.values(blocks).find(block=>block.opcode==='procedures_definition'&&blocks[block.inputs.custom_block[1]].mutation.proccode===ownerName);
        const writer=blocks[definition.next];writer.inputs.NAME=[2,'computed'];writer.inputs.VALUE=[2,'opaque'];
        blocks.computed={opcode:'operator_join',parent:definition.next,inputs:{STRING1:[1,[10,'ce']],STRING2:[1,[10,'ll']]},fields:{}};
        blocks.opaque={opcode:'arcade_createSprite',parent:definition.next,inputs:{},fields:{}};
        const exported=projectToArcade(creator.project);
        assert.equal(exported.unsupported.some(reason=>reason.includes('inspection export')),ownerName==='read',ownerName);
    }
});
