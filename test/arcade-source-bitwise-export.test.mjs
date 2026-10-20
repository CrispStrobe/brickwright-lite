import test from 'node:test';
import assert from 'node:assert/strict';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
const build=source=>{const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[],source);const creator=new SB3Creator();creator.parse(imported.code);assert.deepEqual(creator.errors,[]);assert.deepEqual(creator.warnings,[]);return {creator,imported};};

test('all six Array source bitwise operators and unary complement export original syntax and regain their source words',()=>{
    for(const [op,name]of [['&','BitAnd'],['|','BitOr'],['^','BitXor'],['<<','ShiftLeft'],['>>','ShiftRight'],['>>>','UnsignedShiftRight']]){
        const {creator}=build(`let a:any=[5];let alias=a;let left=alias ${op} 2;let right=2 ${op} alias;let complement=~alias`);
        const exported=projectToArcade(creator.project);assert.deepEqual(exported.unsupported,[],exported.ts);
        assert.ok(exported.ts.includes(`function __bwSourceBinary${name}`),exported.ts);
        assert.match(exported.ts,/function __bwSourceUnaryBitNot/);
        assert.ok(exported.ts.includes(`return left ${op} right`));assert.match(exported.ts,/return ~value/);
        assert.doesNotMatch(exported.ts,/\.join\(/,'source opaque bitwise needs no native Array element conversion');
        const replay=arcadeToPseudocode(exported.ts);assert.deepEqual(replay.unsupported,[],exported.ts);
        assert.ok(replay.code.includes(`op "${op}"`));assert.match(replay.code,/arcade source unary "~" of/);
        assert.doesNotMatch(replay.code,/declare arcade procedure .*__bwSource/,'complete helpers are lowered, not interpreted by name');
    }
});

test('physical source selector reporter and unknown fixed choices cannot export a numeric helper grant',()=>{
    for(const selector of ['unknown','~']){
        const {creator}=build('let a:any=[5];let answer=a&1');
        const block=creator.project.targets.flatMap(target=>Object.values(target.blocks)).find(block=>block.opcode==='arcade_sourceValueBinary');
        block.fields.OP=[selector,null];
        const exported=projectToArcade(creator.project);assert.ok(exported.unsupported.some(reason=>reason.includes('unsupported Arcade source value operation')),JSON.stringify(exported.unsupported));
        assert.doesNotMatch(exported.ts,/function __bwSourceBinary/);
    }
    const {creator}=build('let a:any=[];let answer=~a');
    const block=creator.project.targets.flatMap(target=>Object.values(target.blocks)).find(block=>block.opcode==='arcade_sourceValueUnary');
    block.inputs.OP=[1,[10,'~']];
    const exported=projectToArcade(creator.project);assert.ok(exported.unsupported.some(reason=>reason.includes('unsupported Arcade source value operation')),JSON.stringify(exported.unsupported));
    assert.doesNotMatch(exported.ts,/function __bwSourceUnary/);
});

test('native primitive bitwise export remains native while opaque native Array operands retain their refusal',()=>{
    const scalar=build('let a:any=5;let answer=a&3;let complement=~a');
    const normal=projectToArcade(scalar.creator.project);assert.deepEqual(normal.unsupported,[]);
    const replay=arcadeToPseudocode(normal.ts);assert.deepEqual(replay.unsupported,[]);
    assert.doesNotMatch(replay.code,/arcade source (?:value|unary)/);
    for(const source of ['let a:any=[5];let answer=a&3','let a:any=[];let answer=~a']){
        const {creator}=build(source);
        for(const target of creator.project.targets)for(const block of Object.values(target.blocks)){
            if(block.opcode==='arcade_sourceValueBinary')block.opcode='arrays_valueBinary';
            if(block.opcode==='arcade_sourceValueUnary')block.opcode='arrays_valueUnary';
        }
        const exported=projectToArcade(creator.project);
        assert.ok(exported.unsupported.some(reason=>reason.includes('Native bitwise operation requires actual primitive operand producers')),JSON.stringify(exported.unsupported));
    }
});


test('bitwise Number results keep operand execution through typeof and ordinary constrained formals across export',()=>{
    const source='let rows=[5];let out=rows&1;let type=typeof out;let seen=0;function receive(value:number){seen=value;}receive(rows&1);receive(~rows);';
    const {creator,imported}=build(source);
    assert.match(imported.code,/arcade source value/);
    assert.match(imported.code,/arcade source unary "~" of/);
    const inspect=project=>{
        const blocks=project.targets.flatMap(target=>Object.values(target.blocks));
        const binary=blocks.filter(block=>block.opcode==='arcade_sourceValueBinary');
        const unary=blocks.filter(block=>block.opcode==='arcade_sourceValueUnary');
        assert.equal(binary.length,2);assert.equal(unary.length,1);
        assert.equal(blocks.filter(block=>block.opcode==='arcade_sourceTypeOf').length,1);
        for(const block of [...binary,...unary]){
            const name=block.opcode==='arcade_sourceValueUnary'?'VALUE':'LEFT';
            assert.equal(typeof block.inputs[name][1],'string','actual operand reporter remains connected');
        }
    };
    inspect(creator.project);
    const exported=projectToArcade(creator.project);assert.deepEqual(exported.unsupported,[],exported.ts);
    const replay=build(exported.ts);inspect(replay.creator.project);
    assert.match(replay.imported.code,/arcade source unary "~" of/);
});


test('physical source bitwise operand edits refuse Sprite, unknown reporters and incompatible future writers',()=>{
    const seed='let bad=sprites.create(img`1`,SpriteKind.Player);let rows:any=0;rows=[5];let answer=rows&1;let complement=~rows;game.onUpdate(()=>{rows=99});';
    const reason='Arcade source bitwise operation requires actual Array or primitive operand producers';
    const pair=project=>{for(const target of project.targets)for(const [id,row]of Object.entries(target.variables||{}))if(row[0]==='bad')return ['bad',id];assert.fail('actual Sprite variable exists');};
    for(const opcode of ['arcade_sourceValueBinary','arcade_sourceValueUnary'])for(const kind of ['Sprite','unknown']){
        const {creator}=build(seed),target=creator.project.targets.find(target=>Object.values(target.blocks).some(block=>block.opcode===opcode));
        const operation=Object.values(target.blocks).find(block=>block.opcode===opcode),input=operation.inputs[opcode==='arcade_sourceValueUnary'?'VALUE':'LEFT'][1];
        const old=target.blocks[input];assert.ok(old);
        target.blocks[input]=kind==='Sprite'?{...old,opcode:'data_variable',fields:{VARIABLE:pair(creator.project)},inputs:{},shadow:false}:
            {...old,opcode:'foreign_future_value',fields:{},inputs:{},shadow:false};
        const exported=projectToArcade(creator.project);assert.ok(exported.unsupported.some(value=>value.includes(reason)),JSON.stringify(exported.unsupported));
    }
    const {creator}=build(seed);
    const changed=[];
    for(const target of creator.project.targets)for(const block of Object.values(target.blocks)){
        if(!['data_setvariableto','arcade_setLocal','arcade_setCaptured'].includes(block.opcode))continue;
        const value=target.blocks[block.inputs.VALUE?.[1]];
        // arrayElementValue(Number) deliberately emits 0 + token. Discover
        // that exact connected wrapper, not an assumed bare number reporter.
        const token=name=>{
            const slot=value?.inputs?.[name]?.[1];
            if(Array.isArray(slot)&&[4,5,6,7,8].includes(slot[0]))return slot[1];
            const number=typeof slot==='string'&&target.blocks[slot];
            return number?.opcode==='math_number'?number.fields.NUM?.[0]:null;
        };
        if(value?.opcode==='operator_add'&&token('NUM1')==='0'&&token('NUM2')==='99'){
            assert.deepEqual(Object.keys(value.inputs).sort(),['NUM1','NUM2']);
            Object.assign(value,{opcode:'data_variable',fields:{VARIABLE:pair(creator.project)},inputs:{},shadow:false});changed.push(block);
        }
    }
    assert.equal(changed.length,1,'exactly the actual later writer RHS was edited, not the operator selector');
    const exported=projectToArcade(creator.project);assert.ok(exported.unsupported.some(value=>value.includes(reason)),JSON.stringify(exported.unsupported));
});

test('source bitwise export follows complete Array-or-primitive writers without losing valid aliases',()=>{
    for(const initial of ['0','null','false']){
        const {creator}=build(`let rows:any=${initial};rows=[5];let alias=rows;let answer=alias&1;let complement=~alias;rows=${initial};`);
        const exported=projectToArcade(creator.project);assert.deepEqual(exported.unsupported,[],exported.ts);
        const replay=arcadeToPseudocode(exported.ts);assert.deepEqual(replay.unsupported,[],exported.ts);
        assert.match(replay.code,/arcade source value/);assert.match(replay.code,/arcade source unary/);
    }
});
