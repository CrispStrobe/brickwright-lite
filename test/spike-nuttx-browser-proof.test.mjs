// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import test from 'node:test';
import assert from 'node:assert/strict';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {compileFirmwareProgram} from '../overlay/scratch-gui/src/lib/spike-arena/firmware-program.js';
import {encodePython, encodeInstructions} from '../overlay/scratch-gui/src/lib/spike-nuttx/upload-protocol.js';
import {proofModes, proofOperations, sixMotorSource, replacementSource, sixMotorPython,
    sixPositions, requireSixMoved, requireSharedMotors, dualUltrasonicSource, dualUltrasonicPython, requireDualSharedObservation} from '../scripts/lib/spike-nuttx-browser-proof.mjs';

function compile (source, topology = 'six-motors') {
    const creator = new SB3Creator(); creator.parse(source);
    assert.deepEqual(creator.warnings, []);
    const targets = creator.project.targets.map(target => {
        const blocks = structuredClone(target.blocks); let serial = 0;
        for (const block of Object.values(blocks)) {
            block.fields = Object.fromEntries(Object.entries(block.fields).map(([key, value]) => [key, {value: value[0]}]));
            block.inputs = Object.fromEntries(Object.entries(block.inputs).map(([key, value]) => {
                if (typeof value[1] === 'string') return [key, {block: value[1]}];
                const shadow = `literal-${serial++}`;
                blocks[shadow] = {opcode: 'text', shadow: true, fields: {TEXT: {value: value[1][1]}}};
                return [key, {block: shadow}];
            }));
        }
        return {isOriginal: true, blocks: {_blocks: blocks, getScripts: () => Object.keys(blocks).filter(id => blocks[id].topLevel)}};
    });
    return compileFirmwareProgram({runtime: {targets}}, {topology});
}
test('browser inputs pass the real reader and firmware compiler for every A–F port', () => {
    const program = compile(sixMotorSource);
    assert.deepEqual(program.instructions.filter(row => row[0] === 1).map(row => row[1]), [0, 1, 2, 3, 4, 5]);
    assert.ok(program.instructions.some(row => row[0] === 2 && row[1] === 300));
    assert.ok(encodeInstructions(program, {topology: 'six-motors'}).length > 32);
    const replacement = compile(replacementSource);
    assert.deepEqual(replacement.instructions, [[2, 20, 0, 0], [0, 0, 0, 0]]);
    assert.notEqual(replacement.instructions.length, program.instructions.length);
    assert.ok(encodePython(sixMotorPython).length > 0);
});
const frame = () => ({target: {firmware: 'brickwright-nuttx', capabilities: ['nuttx-six-motors/v1']},
    ports: [...'ABCDEF'].map(id => ({id, attached: true, kind: 'motor'})),
    motors: [...'ABCDEF'].map(port => ({port, position: 0}))});
test('observation checks reject missing/wrong/duplicate ports and an unmoved F motor', () => {
    const before = frame(), after = frame(); after.motors.forEach(motor => {motor.position = 10;});
    requireSixMoved(before, after);
    after.motors[5].position = 0;
    assert.throws(() => requireSixMoved(before, after), /All six/);
    for (const mutate of [f => {f.ports[5].attached = false;}, f => {f.ports[5].kind = 'distance';},
        f => {f.motors[5].port = 'A';}, f => {f.motors[5].position = NaN;},
        f => {f.target.firmware = 'brickwright-arena-demo';}]) {
        const invalid = frame(); mutate(invalid); assert.throws(() => sixPositions(invalid));
    }
});
test('proof modes preserve guest and expose only closed semantic operations', () => {
    assert.deepEqual(proofModes, ['guest', 'nuttx-source', 'nuttx-python', 'nuttx-dual-source', 'nuttx-dual-python']);
    assert.ok(proofOperations.includes('program.packet'));
    assert.ok(proofOperations.includes('program.storage.submit'));
    assert.ok(!proofOperations.some(operation => /memory|monitor|register|breakpoint|exec/.test(operation)));
});

test('shared hub checks detect stale C–F telemetry or rounded legacy encoder mismatch', () => {
    const observed = frame(); observed.motors.forEach(motor => {motor.position = 1.2;motor.speedDps = 200;});
    const result = {frame: observed, motors: observed.motors.map(motor => ({position: motor.position, degPerSec: motor.speedDps})),
        classicPorts: observed.motors.map(() => [48, [20, 1, 0, 20]])};
    requireSharedMotors(result);
    result.motors[5].position = 0;
    assert.throws(() => requireSharedMotors(result), /shared virtual hub/);
    result.motors[5].position = 1.2;result.classicPorts[2][1][1] = 2;
    assert.throws(() => requireSharedMotors(result), /shared virtual hub/);
});

test('dual browser source passes the actual reader/compiler and keeps E/F addressed directions',()=>{
    const program=compile(dualUltrasonicSource,'dual-ultrasonic');
    assert.deepEqual(program.instructions.filter(row=>row[0]===3),[[3,0x122,0,0],[3,0x12a,0,0]]);
    assert.ok(encodeInstructions(program,{topology:'dual-ultrasonic'}).length>32);
    assert.throws(()=>compile(dualUltrasonicSource,'default'),/ports are E and F|sensor is D/);
    const source=dualUltrasonicPython(70,1410);assert.ok(encodePython(source).length<4096);
    assert.match(source,/b\.sensor\(1,b\.E\)/);assert.match(source,/b\.sensor\(2,b\.F\)/);
    for(const values of [[-1,20],[20,20],[2001,20],[1.5,20]]) assert.throws(()=>dualUltrasonicPython(...values));
});
test('dual proof observations reject swapped/missing sensors and stale or duplicate A/B encoders',()=>{
    const kinds={A:'motor',B:'motor',C:'color',D:null,E:'distance',F:'distance'};
    const observed=()=>({frame:{target:{firmware:'brickwright-nuttx',transport:'none',capabilities:['nuttx-addressed-distance/v1']},
        ports:Object.entries(kinds).map(([id,kind])=>({id,kind,attached:kind!==null})),
        motors:[{port:'A',position:-10,speedDps:0},{port:'B',position:10,speedDps:0}]},
        motors:[{position:-10,degPerSec:0},{position:10,degPerSec:0}],classicPorts:[[48,[0,-10]],[48,[0,10]]]});
    requireDualSharedObservation(observed());
    for(const mutate of [o=>{o.frame.target.capabilities=[];},o=>{o.frame.ports[4].kind='force';},
        o=>{o.frame.ports[5].attached=false;},o=>{o.frame.motors[1].port='A';},
        o=>{o.motors[1].position=0;},o=>{o.classicPorts[1][1][1]=0;}]) {
        const o=observed();mutate(o);assert.throws(()=>requireDualSharedObservation(o));
    }
});
