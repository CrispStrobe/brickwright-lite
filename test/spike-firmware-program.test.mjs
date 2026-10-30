// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {compileFirmwareProgram} from '../overlay/scratch-gui/src/lib/spike-arena/firmware-program.js';
const {OPERATIONS} = createRequire(import.meta.url)('../overlay/scratch-vm/src/extension-support/capability-broker.js');
const validate = OPERATIONS['renode.spike.arena.program.load'].validate;
function loaded(source) {
    const creator = new SB3Creator(); creator.parse(source);
    assert.deepEqual(creator.warnings, []);
    // The VM deserializes literal tuples to shadow blocks and fields to objects.
    const targets = creator.project.targets.map(t => {
        const blocks = structuredClone(t.blocks); let serial = 0;
        for (const block of Object.values(blocks)) {
            block.fields = Object.fromEntries(Object.entries(block.fields).map(([k,v]) => [k,{value:v[0]}]));
            block.inputs = Object.fromEntries(Object.entries(block.inputs).map(([k,v]) => {
                if (typeof v[1] === 'string') return [k,{block:v[1]}];
                const shadow = `literal-${serial++}`;
                blocks[shadow] = {opcode:'text',shadow:true,fields:{TEXT:{value:v[1][1]}}};
                return [k,{block:shadow}];
            }));
        }
        return {isOriginal:true, blocks:{_blocks:blocks,getScripts:()=>Object.keys(blocks).filter(id=>blocks[id].topLevel)}};
    });
    return {runtime:{targets}};
}
const program = body => loaded(`DEVICE SPIKE\nWHEN flag clicked:\n${body}`);
const six = {topology:'six-motors'};
test('six topology compiles C–F speeds and single relative position without widening defaults', () => {
    const vm=program('  set motor speed C 20\n  set motor speed F -50\n  start motor C forward\n  start motor F backward\n  run motor D backward 90 degrees\n  stop motor C\n');
    assert.throws(()=>compileFirmwareProgram(vm),/A and B only/);
    assert.deepEqual(compileFirmwareProgram(vm,six).instructions,
        [[1,2,222,0],[1,5,555,0],[6,3,-90,833],[1,2,0,0],[0,0,0,0]]);
    assert.throws(()=>compileFirmwareProgram(vm,{topology:'arbitrary'}),/topology/);
});
test('six multiport timed commands share one wait, retain independent speeds and reject ambiguous ports', () => {
    const vm=program('  set motor speed C 20\n  set motor speed F 50\n  run motor C forward 0.2 seconds\n');
    const blocks=vm.runtime.targets[0].blocks._blocks;
    const run=Object.values(blocks).find(b=>b.opcode==='spikeprime_motorRunFor');
    run.fields.PORT.value='FC';
    assert.deepEqual(compileFirmwareProgram(vm,six).instructions,
        [[1,2,222,0],[1,5,555,0],[2,200,0,0],[1,2,0,0],[1,5,0,0],[0,0,0,0]]);
    for(const port of ['', 'CC', 'C F', 'C,F', 'G', 'ABCDEFABCDEF']) {
        run.fields.PORT.value=port;assert.throws(()=>compileFirmwareProgram(vm,six),/distinct literal/);
    }
    run.fields.PORT.value='CF';run.fields.UNIT.value='degrees';
    assert.throws(()=>compileFirmwareProgram(vm,six),/one motor/);
    run.fields.UNIT.value='seconds';run.fields.PORT.value='ABCDEF';
    const repeat=program('  repeat 25:\n    run motor C forward 0.2 seconds\n');
    const body=Object.values(repeat.runtime.targets[0].blocks._blocks).find(b=>b.opcode==='spikeprime_motorRunFor');
    body.fields.PORT.value='ABCDEF';
    assert.throws(()=>compileFirmwareProgram(repeat,six),/256 instructions/);
});
test('sensor templates and changed rover movement pairs are rejected in six topology', () => {
    assert.throws(()=>compileFirmwareProgram(program('  wait until spike distance D in mm < 250\n'),six),/no arena sensors/);
    const vm=program('  start tank 20 20\n');
    const block=Object.values(vm.runtime.targets[0].blocks._blocks).find(b=>b.opcode==='spikeprime_startTank');
    block.opcode='spikeprime_setMovementMotors';block.fields={PORT_A:{value:'C'},PORT_B:{value:'B'}};assert.throws(()=>compileFirmwareProgram(vm,six),/A and B/);
});
test('actual native reader emits timed concurrent motors with explicit END', () => {
    const code = compileFirmwareProgram(program('  set motor speed B 50\n  start motor B forward\n  wait 1 seconds\n  stop motor B\n'));
    assert.deepEqual(code.instructions,[[1,1,555,0],[2,1000,0,0],[1,1,0,0],[0,0,0,0]]);
});
test('actual native movement, repeats and sensor wait compile', () => {
    const code = compileFirmwareProgram(program('  start tank 25 25\n  wait until spike distance D in mm < 250\n  stop movement\n'));
    assert.deepEqual(code.instructions,[[1,0,-278,0],[1,1,278,0],[3,1,250,0],[1,0,0,0],[1,1,0,0],[0,0,0,0]]);
});
test('position move compiles to guest-controlled completion', () => {
    assert.deepEqual(compileFirmwareProgram(program('  set motor speed B 50\n  run motor B backward 90 degrees\n')).instructions,[[6,1,-90,555],[0,0,0,0]]);
});
test('unsupported APIs, hardware ports, multiple scripts and dynamic expressions refuse', () => {
    for (const source of ['  start motor F forward\n', '  say "hello"\n', '  wait spike distance D seconds\n']) {
        assert.throws(()=>compileFirmwareProgram(program(source)));
    }
    const vm=program('  wait 1 seconds\n'); vm.runtime.targets.push(vm.runtime.targets[0]);
    assert.throws(()=>compileFirmwareProgram(vm),/exactly one/);
});
test('oversized repeat fails and graph cycles fail', () => {
    assert.throws(()=>compileFirmwareProgram(program('  repeat 255:\n    wait 1 seconds\n    wait 1 seconds\n')),/256 instructions/);
    const vm=program('  wait 1 seconds\n');const b=vm.runtime.targets[0].blocks._blocks;const hat=Object.values(b).find(x=>x.topLevel);b[hat.next].next=hat.next;
    assert.throws(()=>compileFirmwareProgram(vm),/cyclic/);
});
test('256 instructions including END are accepted', () => {
    const boundary=compileFirmwareProgram(program('  repeat 255:\n    wait 0.001 seconds\n'));
    assert.equal(boundary.instructions.length,256);
    assert.equal(validate(boundary),true);
});
test('nested non-emitting settings loops stay within a compilation work budget', () => {
    assert.throws(()=>compileFirmwareProgram(program('  repeat 255:\n    repeat 255:\n      set motor speed B 50\n')),/expansion budget/);
    const vm=program('  repeat 255:\n    repeat 255:\n      set motor speed B 50\n');
    const blocks=vm.runtime.targets[0].blocks._blocks;
    const inner=Object.values(blocks).find(block=>block.opcode==='control_repeat' &&
        blocks[block.inputs.SUBSTACK.block].opcode==='spikeprime_motorSetSpeed');
    delete inner.inputs.SUBSTACK;
    assert.throws(()=>compileFirmwareProgram(vm),/expansion budget/);
});
test('declared capability accepts compiled programs and closed instruction boundaries', () => {
    assert.equal(validate(compileFirmwareProgram(program('  start tank 25 25\n  wait 0.5 seconds\n  stop movement\n'))), true);
    assert.equal(validate({version:1,instructions:[[1,0,-1110,0],[2,120000,0,0],[3,1,65535,0],[5,3,1,6],[6,1,-36000,1110],[4,0,0,0],[0,0,0,0]]}), true);
    assert.equal(validate({version:1,instructions:Array.from({length:256},()=>[0,0,0,0])}), true);
});
test('capability refuses malformed programs before an executor can receive them', () => {
    for (const instructions of [[],[[0,0,0,true]],[[1,2,100,0],[0,0,0,0]],[[6,0,1,0],[0,0,0,0]],
        [[4,9,0,0],[0,0,0,0]],[[3,3,2,0],[0,0,0,0]],[[1,0,0,0]],[[0,0,0]],[[0,0,0,0.5]],
        [Array(4)],Array(1),Array.from({length:257},()=>[0,0,0,0])]) {
        assert.equal(validate({version:1,instructions}), false);
    }
    assert.equal(validate({version:1,instructions:[[0,0,0,0]],address:0x20000000}), false);
    assert.equal(validate({version:true,instructions:[[0,0,0,0]]}), false);
});
// Firmware instruction ABI v2 (brickwright-spike-prime-fw#56): op 7 arms a move without
// waiting, op 8 waits for a port mask. Only `abi: 2` emits them, and only then is the result v2.
const v2 = {abi:2};
test('two motors by an amount stay refused under the default ABI', () => {
    for (const source of ['  move forward 360 degrees\n', '  move forward 10 cm\n']) {
        assert.throws(()=>compileFirmwareProgram(program(source)), error => error.code === 'two-motor-position');
    }
    const vm=program('  run motor A forward 90 degrees\n');
    Object.values(vm.runtime.targets[0].blocks._blocks).find(b=>b.opcode==='spikeprime_motorRunFor').fields.PORT.value='AB';
    assert.throws(()=>compileFirmwareProgram(vm), error => error.code === 'two-motor-position');
    assert.throws(()=>compileFirmwareProgram(program('  wait 1 seconds\n'),{abi:3}),/instruction ABI/);
});
test('ABI v2 moves both movement motors together and waits for both', () => {
    const forward = compileFirmwareProgram(program('  set movement speed 27\n  move forward 360 degrees\n'),v2);
    assert.deepEqual(forward,{version:2,instructions:[[7,0,-360,300],[7,1,360,300],[8,3,0,0],[0,0,0,0]]});
    assert.equal(validate(forward),true);
    assert.deepEqual(compileFirmwareProgram(program('  set movement speed 50\n  move backward 10 cm\n'),v2).instructions,
        [[7,0,205,555],[7,1,-205,555],[8,3,0,0],[0,0,0,0]]);
    assert.deepEqual(compileFirmwareProgram(program('  set movement speed -50\n  move forward 2 rotations\n'),v2).instructions,
        [[7,0,720,555],[7,1,-720,555],[8,3,0,0],[0,0,0,0]]);
    const inches=program('  set movement speed 50\n  move forward 1 cm\n');
    const move=Object.values(inches.runtime.targets[0].blocks._blocks).find(b=>b.opcode==='spikeprime_moveForward');
    (move.fields.UNIT || inches.runtime.targets[0].blocks._blocks[move.inputs.UNIT.block].fields.TEXT).value='in';
    assert.deepEqual(compileFirmwareProgram(inches,v2).instructions,[[7,0,-52,555],[7,1,52,555],[8,3,0,0],[0,0,0,0]]);
    assert.throws(()=>compileFirmwareProgram(program('  set movement speed 0\n  move forward 90 degrees\n'),v2),error => error.code === 'zero-speed');
    assert.throws(()=>compileFirmwareProgram(program('  move forward 36001 degrees\n'),v2),error => error.code === 'range');
    (move.fields.UNIT || inches.runtime.targets[0].blocks._blocks[move.inputs.UNIT.block].fields.TEXT).value='parsecs';
    assert.throws(()=>compileFirmwareProgram(inches,v2),error => error.code === 'unit');
});
test('ABI v2 runs multi-port motor moves together with their own speeds', () => {
    const vm=program('  set motor speed A 20\n  set motor speed B -50\n  run motor A forward 90 degrees\n');
    const run=Object.values(vm.runtime.targets[0].blocks._blocks).find(b=>b.opcode==='spikeprime_motorRunFor');
    run.fields.PORT.value='AB';
    assert.deepEqual(compileFirmwareProgram(vm,v2).instructions,[[7,0,90,222],[7,1,-90,555],[8,3,0,0],[0,0,0,0]]);
    const sixVm=program('  set motor speed C 20\n  set motor speed F 50\n  run motor C forward 1 rotations\n');
    Object.values(sixVm.runtime.targets[0].blocks._blocks).find(b=>b.opcode==='spikeprime_motorRunFor').fields.PORT.value='FC';
    assert.deepEqual(compileFirmwareProgram(sixVm,{...six,...v2}),
        {version:2,instructions:[[7,2,360,222],[7,5,360,555],[8,36,0,0],[0,0,0,0]]});
});
test('ABI v2 leaves programs without a group move byte-identical v1', () => {
    for (const source of ['  set motor speed B 50\n  run motor B backward 90 degrees\n',
        '  set movement speed 27\n  move forward 2 seconds\n', '  start tank 25 25\n  wait 0.5 seconds\n  stop movement\n']) {
        assert.deepEqual(compileFirmwareProgram(program(source),v2),compileFirmwareProgram(program(source)));
        assert.equal(compileFirmwareProgram(program(source),v2).version,1);
    }
});
test('capability accepts v2 motor-group rows only in v2 programs, inside closed bounds', () => {
    const pair=[[7,0,-360,300],[7,1,360,300],[8,3,0,0],[0,0,0,0]];
    assert.equal(validate({version:2,instructions:pair}),true);
    assert.equal(validate({version:1,instructions:pair}),false);
    assert.equal(validate({version:2,instructions:[[7,1,-36000,1],[6,0,36000,1110],[8,1,0,0],[8,2,0,0],[0,0,0,0]]}),true);
    for (const row of [[7,2,90,300],[7,-1,90,300],[7,0,36001,300],[7,0,90,0],[7,0,90,1111],
        [8,0,0,0],[8,4,0,0],[8,-1,0,0],[8,3,1,0],[8,3,0,1],[9,0,0,0]]) {
        assert.equal(validate({version:2,instructions:[row,[0,0,0,0]]}),false,JSON.stringify(row));
    }
    for (const version of [0,3,'2',2.5]) assert.equal(validate({version,instructions:[[0,0,0,0]]}),false);
});
