// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Rules that keep real models from elsewhere stable in Jolt (docs/ROBOT-LAB-REAL-MODELS.md): a closed loop of hinges
// is broken with a ball joint (mech/loops.js); a pin hanging on one hinge, holding nothing, is welded to its part
// (mech/free-pins.js `dangling`).

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {breakHingeLoops} from '../overlay/scratch-gui/src/lib/bw-sim/mech/loops.js';
import {validateCompiledMechanism} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';

const CATALOG = new Map(JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', import.meta.url))).parts.map(p => [p.part, p]));
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const AX = [0, 1, 0, 1, 0, 0, 0, 0, -1]; // axle/pin local X -> LDraw Y

test('a closed loop of hinges gets one ball joint, at its lightest link; motors, limits and coupled joints stay hinges', () => {
    const hinge = (id, body1, body2, extra = {}) => ({id, type: 'hinge', body1, body2, point: [0, 0, 0], axis: [0, 1, 0], ...extra});
    // frame - crank (motor) - rod - rocker - frame: a four-bar; the rod is the lightest link.
    const joints = [hinge('jm', 'frame', 'crank', {motor: {port: 'A'}}), hinge('j1', 'crank', 'rod'), hinge('j2', 'rod', 'rocker'), hinge('j3', 'rocker', 'frame')];
    const mass = {frame: 0.5, crank: 0.02, rod: 0.002, rocker: 0.01};
    const {joints: out, balls} = breakHingeLoops(joints, {keep: new Set(['jm']), massOf: id => mass[id]});
    assert.equal(balls.length, 1, 'one ball for one loop');
    assert.ok(['j1', 'j2'].includes(balls[0]), `the ball is at the rod: ${balls[0]}`);
    const ball = out.find(j => j.id === balls[0]);
    assert.equal(ball.type, 'ball');
    assert.deepEqual(Object.keys(ball).sort(), ['body1', 'body2', 'id', 'point', 'type']);
    assert.equal(out.find(j => j.id === 'jm').type, 'hinge', 'the motor stays a hinge');
    // A chain without a loop (and a second joint between the same two bodies) is left alone.
    const chain = [hinge('a', 'frame', 'arm'), hinge('b', 'arm', 'hand'), hinge('b2', 'arm', 'hand')];
    assert.deepEqual(breakHingeLoops(chain, {keep: new Set(), massOf: () => 0.01}).balls, []);
});

test('a frictionless pin hanging in one hole, holding nothing, is welded to its beam in a model from elsewhere', () => {
    const model = {version: 1, parts: [
        {id: 'beam', part: '32524.dat', position: [0, 0, 0], rotation: I3},
        {id: 'pin', part: '3673.dat', position: [0, 10, 0], rotation: AX},
    ]};
    const own = compile(model, CATALOG, {ground: false, version: 2});
    const foreign = compile(model, CATALOG, {ground: false, version: 2, rescueLoose: true});
    assert.equal(validateCompiledMechanism(foreign).length, 0);
    assert.equal(own.bodies.length, 2, 'our own file: the pin turns in its hole');
    assert.equal(foreign.bodies.length, 1, 'from elsewhere: welded (a 0.25 g body on one hinge spins up in the solver)');
});


test('derivation finds a towball socket: an 8 LDU bore (the ball\'s radius) inside a wider rim; a 6 LDU pin hole is none', async () => {
    const {flattenPart} = await import('../overlay/scratch-gui/src/lib/bw-sim/ldraw/ldraw-geometry.js');
    const {deriveConnectors} = await import('../overlay/scratch-gui/src/lib/bw-sim/part-meta/derive.js');
    const LDRAW = new URL('../overlay/scratch-gui/static/ldraw/', import.meta.url);
    // A steering link's end, drawn as 2739as01 draws it: the bore (radius 8, 12 deep, centre at the origin) and its rim.
    const end = [
        '0 BFC INVERTNEXT', '1 16 0 6 0 8 0 0 0 -12 0 0 0 8 4-4cyli.dat',
        '1 16 0 -6 0 10 0 0 0 12 0 0 0 10 4-4cyli.dat'
    ].join('\n');
    const files = {
        'parts/zz-link.dat': `0 ZZ Link\n${end}\n1 16 0 0 100 1 0 0 0 1 0 0 0 1 s/zz-end.dat`,
        'parts/s/zz-end.dat': `0 ~ZZ Link End\n${end}`,
        'parts/zz-bore.dat': '0 ZZ Bore\n0 BFC INVERTNEXT\n1 16 0 6 0 6 0 0 0 -12 0 0 0 6 4-4cyli.dat\n1 16 0 -6 0 10 0 0 0 12 0 0 0 10 4-4cyli.dat'
    };
    const read = p => files[p] ?? (() => { try { return readFileSync(new URL(p, LDRAW), 'utf8'); } catch { return undefined; } })();
    const sockets = name => deriveConnectors(flattenPart(name, read), {read}).connectors.filter(c => c.type === 'ballsocket');
    const link = sockets('zz-link.dat');
    assert.equal(link.length, 2, JSON.stringify(link));
    assert.deepEqual(link.map(c => c.position.map(v => Math.round(v))).sort((a, b) => a[2] - b[2]), [[0, 0, 0], [0, 0, 100]]);
    assert.equal(sockets('zz-bore.dat').length, 0, 'a 6 LDU bore is a pin hole, not a socket');
});

test('a towball 1 LDU off its socket is a ball joint in a model from elsewhere (near-miss), not in our own files', () => {
    const meta = id => CATALOG.get(id);
    const socket = meta('39370.dat').connectors.find(c => c.type === 'ballsocket').position;
    const ball = meta('6628.dat').connectors.find(c => c.type === 'ball').position;
    const at = socket.map((v, i) => v - ball[i] + (i === 0 ? 1 : 0));
    const model = {version: 1, parts: [
        {id: 'h', part: '39370.dat', position: [0, 0, 0], rotation: I3},
        {id: 'tb', part: '6628.dat', position: at, rotation: I3},
    ]};
    const balls = m => m.joints.filter(j => j.type === 'ball').length;
    assert.equal(balls(compile(model, CATALOG, {ground: false, version: 2})), 0, 'our own file: 1 LDU is not seated (0.5 LDU rule)');
    const foreign = compile(model, CATALOG, {ground: false, version: 2, rescueLoose: true});
    assert.equal(validateCompiledMechanism(foreign).length, 0);
    assert.equal(balls(foreign), 1, 'from elsewhere: joined where it almost fits');
});
