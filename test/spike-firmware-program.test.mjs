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
    assert.throws(()=>compileFirmwareProgram(program('  repeat 255:\n    wait 1 seconds\n')),/256 instructions/);
    const vm=program('  wait 1 seconds\n');const b=vm.runtime.targets[0].blocks._blocks;const hat=Object.values(b).find(x=>x.topLevel);b[hat.next].next=hat.next;
    assert.throws(()=>compileFirmwareProgram(vm),/cyclic/);
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
