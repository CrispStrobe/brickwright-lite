// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Chain drive end to end: editor/chain-path.js lays Technic chain links (3711) round gears, the
// compiler's chain detector (kinds/chain.js) couples the gears, and the Jolt core turns them.
// The bench is test/fixtures/bw-sim/gears/8-24.json (an 8T on the medium motor's output, a beam
// pinned under the housing) with the driven axle moved to the beam's end hole, 60 LDU out, so
// the gears do not mesh: only the chain can drive the second gear.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {STEP_MS} from '../overlay/scratch-gui/src/lib/bw-sim/hub-bridge.js';
import {chainRound, CHAIN_PITCH} from '../overlay/scratch-gui/src/lib/bw-sim/editor/chain-path.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
import {CHAIN_ON_PITCH_LDU} from '../overlay/scratch-gui/src/lib/bw-sim/kinds/chain.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const CATALOG = new Map(json('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json').parts.map(p => [p.part, p]));
const HZ = 1000 / STEP_MS;

/** The bench with the driven gear (`part`, default the 24T) on an axle in the beam's end hole. */
const bench = (part = '3648.dat') => {
    const m = json('test/fixtures/bw-sim/gears/8-24.json');
    m.parts = m.parts.map(p => {
        if (p.id === 'a24') return {...p, position: [60, -10, 0]};
        if (p.id === 'g24') return {...p, part, position: [60, -60, 0]};
        return p;
    });
    return m;
};
const withChain = model => {
    const r = chainRound(model, CATALOG, ['g8', 'g24']);
    assert.ok(!r.error, `chained: ${JSON.stringify(r)}`);
    return {model: {...model, parts: [...model.parts, ...r.links.map((l, i) => ({id: `k${i}`, ...l}))]}, chain: r};
};
const mulVec = (m, v) => [0, 1, 2].map(r => m[r * 3] * v[0] + m[r * 3 + 1] * v[1] + m[r * 3 + 2] * v[2]);
const pivots = l => [l.position, mulVec(l.rotation, [0, 0, CHAIN_PITCH]).map((v, i) => v + l.position[i])];

/** Turns the motor at 300 °/s on the clamped bench; returns how far each coupled hinge turned. */
const run = async mech => {
    const J = await loadJolt();
    const motor = mech.joints.find(j => j.motor);
    mech.bodies.find(b => b.id === motor.body1).motion = 'static';
    const core = createPhysicsCore(J, mech, {stepHz: HZ});
    const chain = mech.couplings.find(c => c.kind === 'chain');
    const ids = [chain.joint1, chain.joint2];
    const start = ids.map(id => core.jointState(id).angle);
    const m0 = core.jointState(motor.id).angle;
    core.setMotor(motor.id, {mode: 'velocity', radPerSec: 300 * Math.PI / 180});
    for (let i = 0; i < 2.5 * HZ; i++) core.step(1 / HZ);
    const out = {motor: core.jointState(motor.id).angle - m0, motorId: motor.id, chain};
    ids.forEach((id, k) => { out[id] = core.jointState(id).angle - start[k]; });
    core.destroy();
    return out;
};

test('a chain round an 8T and a 24T: closed, every pivot on the next link\'s, and on the sprockets\' pitch circles', () => {
    const {chain} = withChain(bench());
    assert.deepEqual(chain.gears, ['g8', 'g24']);
    // An open belt round pitch circles r 10 and 30, 60 LDU apart: 2√(d² − (R−r)²) + π(R + r) + 2(R−r)·asin((R−r)/d).
    const belt = 2 * Math.sqrt(60 ** 2 - 20 ** 2) + Math.PI * 40 + 2 * 20 * Math.asin(20 / 60);
    assert.ok(Math.abs(chain.lengthLdu - belt) < 0.5, `length ${chain.lengthLdu} vs ${belt}`);
    assert.equal(chain.links.length, Math.round(chain.lengthLdu / CHAIN_PITCH));
    assert.ok(Math.abs(chain.slackLdu) < 1, `slack ${chain.slackLdu}`);
    const links = chain.links;
    links.forEach((l, k) => {
        const next = links[(k + 1) % links.length];
        const gap = Math.hypot(...pivots(l)[1].map((v, i) => v - next.position[i]));
        assert.ok(gap < 1, `link ${k}'s narrow end on link ${k + 1}'s wide end: ${gap.toFixed(3)} LDU`);
        assert.ok(Math.abs(Math.abs(l.rotation[0 * 3 + 0] * 0 + l.rotation[1 * 3 + 0]) - 1) < 1e-6, 'the pins along the (vertical) axles');
    });
    // Pivots in the gears' plane (y −60), on a pitch circle or the tangents between them.
    for (const l of links) assert.ok(Math.abs(l.position[1] + 60) < 1e-6);
    const onCircle = (p, c, r) => Math.abs(Math.hypot(p[0] - c[0], p[2] - c[2]) - r) <= CHAIN_ON_PITCH_LDU;
    assert.ok(links.filter(l => onCircle(l.position, [0, 0, 0], 10)).length >= 2, 'pivots on the 8T');
    assert.ok(links.filter(l => onCircle(l.position, [60, 0, 0], 30)).length >= 4, 'pivots on the 24T');
});

test('compiled: one chain coupling, the gears turning the same way at 8:24, its links welded to the frame', () => {
    const {model} = withChain(bench());
    const mech = compile(model, CATALOG, {version: 2});
    assert.deepEqual(mech.diagnostics.filter(d => d.code.startsWith('chain')), []);
    const chains = mech.couplings.filter(c => c.kind === 'chain');
    assert.equal(chains.length, 1);
    assert.equal(mech.couplings.filter(c => c.kind === 'gear').length, 0, 'the gears do not mesh');
    const housing = mech.bodies.find(b => b.parts.includes('m') && b.parts.includes('beam'));
    for (const l of model.parts.filter(p => p.part === '3711.dat')) assert.ok(housing.parts.includes(l.id), `${l.id} rides on the frame`);
    // |ratio| is the teeth's; joint1 is the first gear by id (g24), so 24/8.
    assert.ok(Math.abs(Math.abs(chains[0].ratio) - 3) < 1e-9, `ratio ${chains[0].ratio}`);
});

test('the chain drives: the 24T turns the motor\'s way at 1/3 of its speed, two equal 8Ts at the same speed', async () => {
    for (const [part, expected] of [['3648.dat', 1 / 3], ['3647.dat', 1]]) {
        const m = bench(part);
        if (part === '3647.dat') m.parts = m.parts.map(p => (p.id === 'g24' ? {...p, position: [40, -60, 0]} : p.id === 'a24' ? {...p, position: [40, -10, 0]} : p));
        const {model} = withChain(m);
        const mech = compile(model, CATALOG, {version: 2});
        const r = await run(mech);
        const driven = [r.chain.joint1, r.chain.joint2].find(id => id !== r.motorId);
        assert.ok(r.motor * 180 / Math.PI > 600, `the motor turned ${r.motor * 180 / Math.PI}°`);
        const got = r[driven] / r.motor;
        assert.ok(Math.abs(got - expected) / expected < 0.03, `${part}: driven/motor ${got.toFixed(4)}, want +${expected.toFixed(4)}`);
    }
});

test('no chain: gears not in one plane, too close, one inside the others, fewer than two', () => {
    const m = bench();
    const lifted = {...m, parts: m.parts.map(p => (p.id === 'g24' ? {...p, position: [60, -40, 0]} : p))};
    assert.equal(chainRound(lifted, CATALOG, ['g8', 'g24']).error, 'notOnePlane');
    const close = {...m, parts: m.parts.map(p => (p.id === 'g24' ? {...p, position: [40, -60, 0]} : p))};
    assert.equal(chainRound(close, CATALOG, ['g8', 'g24']).error, 'tooClose');
    assert.equal(chainRound(m, CATALOG, ['g8']).error, 'needTwoGears');
    // A small gear between two big ones, inside the chain round them.
    const I = [1, 0, 0, 0, 0, 1, 0, -1, 0];
    const three = {version: 1, parts: [{id: 'a', part: '3649.dat', position: [0, 0, 0], rotation: I},
        {id: 'b', part: '3649.dat', position: [200, 0, 0], rotation: I}, {id: 'c', part: '3647.dat', position: [100, 0, 0], rotation: I}]};
    assert.deepEqual(chainRound(three, CATALOG, ['a', 'b', 'c']), {error: 'gearInside', parts: ['c']});
});

test('links round fewer than two gears say so; a link on a sprocket\'s teeth is no collision in the editor', () => {
    const {model} = withChain(bench());
    const lone = {...model, parts: [...bench().parts, {...model.parts.find(p => p.id === 'k0'), position: [0, -60, 300]}]};
    const mech = compile(lone, CATALOG, {version: 2});
    assert.ok(mech.diagnostics.some(d => d.code === 'chain-not-round-gears'), JSON.stringify(mech.diagnostics));
    for (const l of model.parts.filter(p => p.part === '3711.dat')) {
        assert.deepEqual(solidOverlaps(model, CATALOG, l), [], `${l.id} shares volume only with its sprockets and neighbours`);
    }
});

test('in Simulate the links run round: a sprocket turned by one link\'s angle puts each link on the next one\'s place', async () => {
    const {Group, Mesh, Quaternion, Vector3} = await import('three');
    const {createChainMotion, orderLoop, placedPivots, twistAbout, slotAt} = await import('../overlay/scratch-gui/src/lib/bw-sim/view/chain-motion.js');
    const {model} = withChain(bench());
    const mech = compile(model, CATALOG, {version: 2});
    const conn = CATALOG.get('3711.dat').connectors[0];
    const links = model.parts.filter(p => p.part === '3711.dat');
    const loop = orderLoop(links.map(l => ({id: l.id, pivots: placedPivots(l, conn)})));
    assert.deepEqual(loop.map(l => l.id), links.map(l => l.id), 'chainRound laid them in running order');
    assert.equal(orderLoop(links.slice(1).map(l => ({id: l.id, pivots: placedPivots(l, conn)}))), null, 'an open chain is no loop');
    assert.ok(Math.abs(twistAbout([0, Math.sin(0.3), 0, Math.cos(0.3)], [0, 1, 0]) - 0.6) < 1e-12);
    assert.deepEqual(slotAt(3, -1.25, 16), {from: 1, to: 2, frac: 0.75});
    // A stand-in for the scene: a group per body at its t=0 pose, a mesh per link in the frame's group.
    const bodyGroups = new Map();
    for (const b of mech.bodies) {
        const g = new Group();
        g.position.set(...b.position);
        g.quaternion.set(...b.rotation);
        bodyGroups.set(b.id, g);
    }
    const partMeshes = new Map();
    const frame = mech.bodies.find(b => b.parts.includes(links[0].id));
    links.forEach((l, k) => {
        const m = new Mesh();
        m.position.set(k, 0, 0); // any distinct base places do: the motion moves between them
        bodyGroups.get(frame.id).add(m);
        partMeshes.set(l.id, m);
    });
    const motion = createChainMotion({model, mechanism: mech, catalog: CATALOG, built: {bodyGroups, partMeshes}});
    assert.equal(motion.loops, 1);
    // Turn the first gear of the coupling (the 24T: g24 sorts first) by one link: a 16 LDU chord of its 30 LDU pitch circle.
    const gearBody = mech.bodies.find(b => b.parts.includes('g24'));
    const g = bodyGroups.get(gearBody.id);
    const axis = new Vector3(0, 1, 0); // the gears' axles are vertical (LDraw y), world y
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
        g.quaternion.copy(new Quaternion().setFromAxisAngle(axis, 2 * Math.asin(8 / 30) * i / steps).multiply(new Quaternion(...gearBody.rotation)));
        motion.update();
    }
    const xs = links.map(l => Math.round(partMeshes.get(l.id).position.x * 1e6) / 1e6);
    const n = links.length;
    const shifted = xs.map(x => ((x % n) + n) % n);
    const delta = shifted.map((x, k) => (((x - k) % n) + n) % n);
    assert.ok(delta.every(d => Math.abs(d - delta[0]) < 1e-6) && [1, n - 1].includes(Math.round(delta[0])) && Math.abs(delta[0] - Math.round(delta[0])) < 1e-6,
        `every link moved one place along: ${delta}`);
});

// A tread (57518) round two sprockets (57519) on 8L axles in a Beam 7's end holes, 120 LDU apart:
// the beam's holes turned to run along x, the sprockets beside it, their axles along x.
const treadBench = () => ({version: 1, parts: [
    {id: 'frame', part: '32524.dat', position: [0, 0, 0], rotation: [0, 1, 0, -1, 0, 0, 0, 0, 1]},
    {id: 'ax1', part: '3707.dat', position: [30, 0, -60], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1]},
    {id: 'ax2', part: '3707.dat', position: [30, 0, 60], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1]},
    {id: 's1', part: '57519.dat', position: [40, 0, -60], rotation: [0, 0, 1, 0, 1, 0, -1, 0, 0]},
    {id: 's2', part: '57519.dat', position: [40, 0, 60], rotation: [0, 0, 1, 0, 1, 0, -1, 0, 0]}]});

test('a tread round two sprockets: its links, the sprockets coupled 1:1, each a wheel of the tread\'s outer radius', () => {
    const m = treadBench();
    const r = chainRound(m, CATALOG, ['s1', 's2']);
    assert.ok(!r.error, JSON.stringify(r));
    const R = 15 / Math.sin(Math.PI / 10);
    assert.ok(Math.abs(r.lengthLdu - (240 + 2 * Math.PI * R)) < 0.5, `length ${r.lengthLdu}`);
    assert.equal(r.links.length, Math.round(r.lengthLdu / 30));
    assert.ok(r.links.every(l => l.part === '57518.dat'));
    // The tread's outer face (part −y) points away from the sprockets: from a link on the bottom run, down (LDraw +y).
    const bottom = r.links.reduce((a, b) => (b.position[1] > a.position[1] ? b : a));
    assert.ok(mulVec(bottom.rotation, [0, -1, 0])[1] > 0.99, `outward on the bottom run: ${mulVec(bottom.rotation, [0, -1, 0])}`);
    const model = {...m, parts: [...m.parts, ...r.links.map((l, i) => ({id: `t${i}`, ...l}))]};
    const mech = compile(model, CATALOG, {version: 2});
    assert.deepEqual(mech.diagnostics.filter(d => d.severity !== 'info' && d.code !== 'loose-part'), [], JSON.stringify(mech.diagnostics));
    const chains = mech.couplings.filter(c => c.kind === 'chain');
    assert.equal(chains.length, 1);
    assert.ok(Math.abs(Math.abs(chains[0].ratio) - 1) < 1e-9);
    for (const s of ['s1', 's2']) {
        const body = mech.bodies.find(b => b.parts.includes(s));
        const wheel = body.colliders.find(c => c.shape === 'cylinder' && Math.abs(c.radius - (R + 14) * 0.0004) < 1e-6);
        assert.ok(wheel, `${s}: a wheel of the tread's outer radius`);
        assert.equal(body.friction, 1, `${s}: the tread's grip`);
    }
    const frame = mech.bodies.find(b => b.parts.includes('frame'));
    assert.ok(model.parts.filter(p => p.part === '57518.dat').every(l => frame.parts.includes(l.id)), 'the tread rides on the frame');
    assert.ok(!mech.bodies.some(b => b.colliders.some(c => /^t\d+$/.test(c.part))), 'the tread\'s links have no colliders in the core');
    // The ground is under the wheels' bottom: the lowest point of the model is now the tread's outer face.
    const ground = mech.bodies.find(b => b.motion === 'static' && b.colliders.length === 1 && b.colliders[0].halfExtents);
    const top = ground.position[1] + ground.colliders[0].halfExtents[1];
    assert.ok(Math.abs(top - (-(R + 14) * 0.0004)) < 0.0005, `ground top ${top} under the wheels' bottom ${-(R + 14) * 0.0004}`);
});

test('a tracked frame drives: a motor on one sprocket moves it along at the tread\'s outer speed', async () => {
    const m = treadBench();
    const r = chainRound(m, CATALOG, ['s1', 's2']);
    const model = {...m, parts: [...m.parts, ...r.links.map((l, i) => ({id: `t${i}`, ...l}))]};
    const mech = compile(model, CATALOG, {version: 2});
    // The medium motor's drive, borrowed from the gear bench, on the hinge of the rear sprocket.
    const bench8 = compile(json('test/fixtures/bw-sim/gears/8-24.json'), CATALOG, {version: 2});
    const s1Body = mech.bodies.find(b => b.parts.includes('s1')).id;
    const hinge = mech.joints.find(j => j.type === 'hinge' && (j.body1 === s1Body || j.body2 === s1Body));
    hinge.motor = {...bench8.joints.find(j => j.motor).motor};
    mech.actuators = [{...bench8.actuators[0], joint: hinge.id}];
    const J = await loadJolt();
    const core = createPhysicsCore(J, mech, {stepHz: HZ});
    const frame = mech.bodies.find(b => b.parts.includes('frame')).id;
    for (let i = 0; i < 0.5 * HZ; i++) core.step(1 / HZ); // settle on the floor
    const p0 = core.bodyPose(frame).position;
    const a0 = core.jointState(hinge.id).angle;
    const omega = 2; // rad/s
    core.setMotor(hinge.id, {mode: 'velocity', radPerSec: omega});
    const seconds = 2;
    for (let i = 0; i < seconds * HZ; i++) core.step(1 / HZ);
    const p1 = core.bodyPose(frame).position;
    const turned = core.jointState(hinge.id).angle - a0;
    core.destroy();
    const R = (15 / Math.sin(Math.PI / 10) + 14) * 0.0004;
    const along = Math.abs(p1[2] - p0[2]);
    const expected = Math.abs(turned) * R;
    assert.ok(Math.abs(turned) > omega * seconds * 0.8, `the sprocket turned ${turned} rad`);
    assert.ok(Math.abs(along - expected) / expected < 0.2, `moved ${along.toFixed(4)} m along, the tread's outer face ran ${expected.toFixed(4)} m`);
    assert.ok(Math.abs(p1[0] - p0[0]) < 0.2 * along, `straight on: ${(p1[0] - p0[0]).toFixed(4)} m sideways`);
});

test('a tread\'s links run round at its sprocket\'s pivot circle: one tooth\'s turn moves each one place', async () => {
    const {Group, Mesh, Quaternion, Vector3} = await import('three');
    const {createChainMotion} = await import('../overlay/scratch-gui/src/lib/bw-sim/view/chain-motion.js');
    const m = treadBench();
    const r = chainRound(m, CATALOG, ['s1', 's2']);
    const model = {...m, parts: [...m.parts, ...r.links.map((l, i) => ({id: `t${i}`, ...l}))]};
    const mech = compile(model, CATALOG, {version: 2});
    const links = model.parts.filter(p => p.part === '57518.dat');
    const bodyGroups = new Map(mech.bodies.map(b => {
        const g = new Group();
        g.position.set(...b.position);
        g.quaternion.set(...b.rotation);
        return [b.id, g];
    }));
    const frame = mech.bodies.find(b => b.parts.includes(links[0].id));
    const partMeshes = new Map(links.map((l, k) => {
        const mesh = new Mesh();
        mesh.position.set(k, 0, 0);
        bodyGroups.get(frame.id).add(mesh);
        return [l.id, mesh];
    }));
    const motion = createChainMotion({model, mechanism: mech, catalog: CATALOG, built: {bodyGroups, partMeshes}});
    const coupling = mech.couplings.find(c => c.kind === 'chain');
    const gearBody = mech.bodies.find(b => b.parts.includes(coupling.parts[0]));
    const g = bodyGroups.get(gearBody.id);
    // One tooth of ten: 36° about the sprocket's axle (LDraw x, world x).
    for (let i = 1; i <= 6; i++) {
        g.quaternion.copy(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), (2 * Math.PI / 10) * i / 6).multiply(new Quaternion(...gearBody.rotation)));
        motion.update();
    }
    const n = links.length;
    const delta = links.map((l, k) => ((((partMeshes.get(l.id).position.x - k) % n) + n) % n));
    // within the closed tread's play: its links sit a fraction of an LDU off the 30 LDU pitch
    assert.ok(delta.every(d => Math.abs(d - delta[0]) < 2e-3) && [1, n - 1].includes(Math.round(delta[0])) && Math.abs(delta[0] - Math.round(delta[0])) < 2e-3,
        `each link moved one place: ${delta.map(d => d.toFixed(3))}`);
});
