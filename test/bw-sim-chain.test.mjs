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
