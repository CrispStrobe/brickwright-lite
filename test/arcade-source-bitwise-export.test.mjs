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
    const source='let rows=[5];let out=rows&1;let typeOfResult=typeof out;let seen=0;function receive(value:number){seen=value;}receive(rows&1);receive(~rows);';
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
            const name=block.opcode==='arcade_sourceValueUnary'?'VALUE':'LEFT',input=block.inputs[name][1];
            if(Array.isArray(input)){
                assert.equal(input[0],12);assert.equal(input.length,3);
                assert.equal(typeof input[1],'string');assert.equal(typeof input[2],'string');
                const declarations=project.targets.filter(target=>Object.hasOwn(target.variables||{},input[2]));
                assert.equal(declarations.length,1,'compact operand has one actual variable owner');
                assert.equal(declarations[0].variables[input[2]][0],input[1],'actual variable ID and name agree');
            }else{
                assert.equal(typeof input,'string');
                const target=project.targets.find(target=>Object.values(target.blocks).includes(block));
                const id=Object.keys(target.blocks).find(id=>target.blocks[id]===block),reporter=target.blocks[input];
                assert.ok(reporter,'actual operand reporter remains connected');
                assert.equal(reporter.parent,id,'actual reporter belongs to this operation');
            }
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
    const pair=(project,name='bad')=>{
        const declarations=project.targets.flatMap(target=>Object.entries(target.variables||{}).filter(([,row])=>row[0]===name));
        assert.equal(declarations.length,1,'one actual '+name+' variable declaration');return [name,declarations[0][0]];
    };
    for(const opcode of ['arcade_sourceValueBinary','arcade_sourceValueUnary'])for(const kind of ['Sprite','unknown']){
        const {creator}=build(seed),target=creator.project.targets.find(target=>Object.values(target.blocks).some(block=>block.opcode===opcode));
        const [operationId,operation]=Object.entries(target.blocks).find(([,block])=>block.opcode===opcode);
        const inputName=opcode==='arcade_sourceValueUnary'?'VALUE':'LEFT',slot=operation.inputs[inputName],input=slot[1];
        assert.ok(typeof input==='string'&&target.blocks[input]||Array.isArray(input)&&input[0]===12,'actual connected variable node or compact variable tuple');
        if(kind==='Sprite')slot[1]=[12,...pair(creator.project)];
        else{
            const id='source-bitwise-unknown-negative';assert.equal(Object.hasOwn(target.blocks,id),false);
            target.blocks[id]={opcode:'foreign_future_value',parent:operationId,next:null,fields:{},inputs:{},shadow:false,topLevel:false};slot[1]=id;
        }
        const exported=projectToArcade(creator.project);assert.ok(exported.unsupported.some(value=>value.includes(reason)),JSON.stringify(exported.unsupported));
    }
    const {creator}=build(seed);
    const changed=[],rows=pair(creator.project,'rows');
    for(const target of creator.project.targets)for(const [id,block]of Object.entries(target.blocks)){
        if(block.opcode!=='data_setvariableto'||block.fields.VARIABLE?.[0]!==rows[0]||block.fields.VARIABLE?.[1]!==rows[1])continue;
        const parent=target.blocks[block.parent];
        if(parent?.opcode!=='arcade_whenRegisteredUpdate'||parent.next!==id)continue;
        assert.equal(parent.topLevel,true);assert.equal(parent.parent,null);
        const token=parent.inputs.TOKEN?.[1];assert.ok(Array.isArray(token)&&token[0]===10&&typeof token[1]==='string');
        const registrations=Object.values(target.blocks).filter(node=>node.opcode==='arcade_registerUpdateHandler'&&node.inputs.TOKEN?.[1]?.[1]===token[1]);
        assert.equal(registrations.length,1,'actual later handler has its original registration');
        const literal=slot=>{
            const raw=slot?.[1];
            if(Array.isArray(raw)&&raw.length===2&&[4,5,6,7,8].includes(raw[0]))return raw[1];
            const number=typeof raw==='string'&&target.blocks[raw];
            return number?.opcode==='math_number'&&number.shadow===true?number.fields.NUM?.[0]:null;
        };
        const is=(value,expected)=>value===expected||value===String(expected);
        const slot=block.inputs.VALUE,value=typeof slot?.[1]==='string'&&target.blocks[slot[1]];
        const wrapped=value?.opcode==='operator_add'&&Object.keys(value.fields).length===0&&
            Object.keys(value.inputs).sort().join(',')==='NUM1,NUM2'&&is(literal(value.inputs.NUM1),0)&&is(literal(value.inputs.NUM2),99);
        assert.ok(is(literal(slot),99)||wrapped,'actual closed numeric99 RHS is raw, linked shadow, or exact0+literal');
        // Replace the whole actual RHS with the Creator's normal variable socket.
        // Changing only an inner arithmetic operand would still yield Number.
        block.inputs.VALUE=[3,[12,...pair(creator.project)],[10,'']];changed.push(block);
    }
    assert.equal(changed.length,1,'exactly the actual later writer RHS was edited, not the operator selector');
    const exported=projectToArcade(creator.project);assert.ok(exported.unsupported.some(value=>value.includes(reason)),JSON.stringify(exported.unsupported));
    const malformed=build('let rows=[5];let result=rows&1');
    const constructor=malformed.creator.project.targets.flatMap(target=>Object.values(target.blocks)).find(block=>block.opcode==='arrays_createReference');
    assert.ok(constructor);constructor.inputs.VALUES=[1,[10,'not an argument list']];
    const invalidFactory=projectToArcade(malformed.creator.project);
    assert.ok(invalidFactory.unsupported.some(value=>value.includes('Array reference constructor requires a fixed value chain')),JSON.stringify(invalidFactory.unsupported));
});

test('source bitwise export follows complete Array-or-primitive writers without losing valid aliases',()=>{
    for(const initial of ['0','null','false']){
        const {creator}=build(`let rows:any=${initial};rows=[5];let alias=rows;let answer=alias&1;let complement=~alias;rows=${initial};`);
        const exported=projectToArcade(creator.project);assert.deepEqual(exported.unsupported,[],exported.ts);
        const replay=arcadeToPseudocode(exported.ts);assert.deepEqual(replay.unsupported,[],exported.ts);
        assert.match(replay.code,/arcade source value/);assert.match(replay.code,/arcade source unary/);
    }
});
