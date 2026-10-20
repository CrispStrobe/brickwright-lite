// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Materials (contracts.js MATERIALS): what the compiler gives a body from its parts, and what the physics
// core does with it: a bounce with the material's restitution e (a dropped part rebounds to e² of its drop
// height), none below LEGO_MIN_BOUNCE_SPEED_M_S, two materials combined per PAIR (restitutionOf, the Jolt fork's
// MaterialPairs: a brick on a tyre bounces like rubber), and a tyre's rolling resistance (physics/rolling.js: the
// normal load it reads, the drag c_rr·N on a rolling wheel and up to that holding a parked one on a slope). The
// coasting carts are in test/bw-sim-validation-2.test.mjs (section G), the coasting tracked frame in bw-sim-chain.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {MATERIALS, GROUND_RESTITUTION, GROUND_MATERIAL, restitutionOf, upgradeMechanismV1} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {loadJolt, createPhysicsCore, LEGO_MIN_BOUNCE_SPEED_M_S} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';

const J = await loadJolt();
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = new Map(JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8')).parts.map(p => [p.part, p]));
const HZ = 200;
const G = 9.81;
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** One part on the floor, compiled, lifted `heightM` above it. */
const dropped = (part, heightM, rotation = I3) => {
    const mech = compile({version: 1, parts: [{id: 'p', part, position: [0, 0, 0], rotation}]}, CATALOG, {version: 2});
    const body = mech.bodies.find(b => b.parts.includes('p'));
    body.position = [body.position[0], body.position[1] + heightM, body.position[2]];
    return {mech, body};
};
/** Drop it: the height of its lowest point above the floor before, and the top of its first rebound. */
const rebound = (part, heightM, rotation, hz = HZ) => {
    const {mech, body} = dropped(part, heightM, rotation);
    const core = createPhysicsCore(J, mech, {stepHz: hz});
    const y0 = core.bodyPose(body.id).position[1];
    let hit = false;
    let top = -Infinity;
    let rest = Infinity;
    let vPrev = 0;
    let e = 0;
    for (let i = 0; i < 1.5 * hz; i++) {
        core.step(1 / hz);
        const y = core.bodyPose(body.id).position[1];
        const vy = core.bodyLinearVelocity(body.id)[1];
        if (!hit && vy > 0) {
            hit = true;
            e = vy / -vPrev; // the bounce: speed after over speed before
        }
        vPrev = vy;
        if (hit && vy <= 0 && top === -Infinity) top = y;
        rest = Math.min(rest, y);
    }
    core.destroy();
    // `rest` is the lowest the body got (on the floor, give or take Jolt's contact slop).
    return {fall: y0 - rest, up: top === -Infinity ? 0 : top - rest, e};
};

test('a part\'s material sets its body\'s bounce and rolling drag; the floor bounces nothing', () => {
    const brick = dropped('3003.dat', 0).mech;
    assert.equal(brick.bodies.find(b => b.parts.includes('p')).restitution, MATERIALS.abs.restitution);
    assert.equal(brick.bodies.find(b => b.parts.includes('p')).rollingResistance, undefined, 'a brick does not roll');
    assert.equal(brick.bodies.find(b => b.parts.includes('p')).material, 'abs');
    assert.equal(brick.bodies.find(b => b.id === 'ground').restitution, GROUND_RESTITUTION);
    assert.equal(brick.bodies.find(b => b.id === 'ground').material, GROUND_MATERIAL);
    const wheel = dropped('39367p01.dat', 0).mech.bodies.find(b => b.parts.includes('p'));
    assert.equal(wheel.restitution, MATERIALS.rubber.restitution);
    assert.equal(wheel.material, 'rubber');
    assert.equal(wheel.rollingResistance, MATERIALS.rubber.rollingResistance);
    assert.equal(wheel.friction, 1);
});

test('a brick dropped 20 cm rebounds to e² of the height (ABS e 0.4: 16 %), a tyred wheel bounces less (e 0.05); slower than the bounce threshold, not at all', t => {
    // Jolt's restitution reverses the normal speed at the contact times e; from 20 cm (1.98 m/s) the rebound
    // (e·1.98 m/s) is a free flight up to e²·h. The brick falls flat (no spin): the rebound is all vertical.
    const brick = rebound('3003.dat', 0.2);
    // At the app's 200 Hz the contact and the top of the flight fall between steps: the height is measured at 2 kHz.
    const fine = rebound('3003.dat', 0.2, undefined, 2000);
    const e2 = MATERIALS.abs.restitution ** 2;
    // A wheel dropped lying flat (axis vertical) lands on its tyre's side.
    const wheel = rebound('39367p01.dat', 0.2, [1, 0, 0, 0, 0, 1, 0, -1, 0]);
    // From 2.5 cm the brick lands at 0.70 m/s, below LEGO_MIN_BOUNCE_SPEED_M_S: it stays down.
    const low = rebound('3003.dat', 0.025);
    assert.ok(Math.sqrt(2 * G * 0.025) < LEGO_MIN_BOUNCE_SPEED_M_S);
    t.diagnostic(`brick: bounce ${brick.e.toFixed(3)} (e ${MATERIALS.abs.restitution}); fell ${(brick.fall * 1000).toFixed(1)} mm, rebounded ${(brick.up * 1000).toFixed(2)} mm = ${(brick.up / brick.fall * 100).toFixed(2)} % (at 2 kHz ${(fine.up / fine.fall * 100).toFixed(2)} %; e² ${(e2 * 100).toFixed(1)} %); ` +
        `wheel: bounce ${wheel.e.toFixed(3)}, ${(wheel.up / wheel.fall * 100).toFixed(2)} % (e² ${(MATERIALS.rubber.restitution ** 2 * 100).toFixed(1)} %); brick from 2.5 cm: ${(low.up * 1000).toFixed(3)} mm`);
    // The bounce itself is e at the app's 200 Hz (Jolt reverses the approach speed it sees); the height law at
    // 2 kHz, where the contact and the top of the flight are within a step (0.5 ms) of where they are. 10 %.
    assert.ok(Math.abs(brick.e / MATERIALS.abs.restitution - 1) <= 0.05, `brick bounce ${brick.e}`);
    assert.ok(Math.abs(fine.up / fine.fall / e2 - 1) <= 0.1, `brick rebound ratio ${fine.up / fine.fall} vs ${e2} (2 kHz)`);
    assert.ok(Math.abs(wheel.e / MATERIALS.rubber.restitution - 1) <= 0.1, `wheel bounce ${wheel.e}`);
    assert.ok(wheel.up < brick.up, 'the tyre bounces less than the brick');
    assert.ok(low.up < 0.0005, `the slow drop rebounded ${low.up} m`);
});

test('a tyred wheel\'s normal load is what its axle does not carry: its share of the vehicle, nothing in the air', t => {
    // A 100 g block on four 20 g tyred wheels (radius 28 mm) on free hinges, on the floor; and the same lifted
    // 5 cm off it. Static: each wheel carries (100 + 4·20)/4 g.
    const make = lift => {
        const wheels = [[-0.05, -0.04], [0.05, -0.04], [-0.05, 0.04], [0.05, 0.04]];
        const y = 0.028 + lift;
        const bodies = [
            {id: 'ground', motion: 'static', position: [0, -0.01, 0], rotation: [0, 0, 0, 1], massKg: 0, colliders: [{shape: 'box', halfExtents: [1, 0.01, 1]}], parts: [], friction: 0.8, restitution: 0},
            {id: 'chassis', motion: 'dynamic', position: [0, y, 0], rotation: [0, 0, 0, 1], massKg: 0.1, colliders: [{shape: 'box', halfExtents: [0.04, 0.005, 0.05]}], parts: []},
            ...wheels.map(([x, z], i) => ({id: `w${i}`, motion: 'dynamic', position: [x, y, z], rotation: [0, 0, 0, 1], massKg: 0.02,
                colliders: [{shape: 'cylinder', radius: 0.028, halfHeight: 0.007, rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2]}], parts: [], friction: 1,
                rollingResistance: 0.02}))
        ];
        const joints = wheels.map(([x, z], i) => ({id: `j${i}`, type: 'hinge', body1: 'chassis', body2: `w${i}`, point: [x, y, z], axis: [1, 0, 0]}));
        return upgradeMechanismV1({version: 1, gravity: [0, -G, 0], bodies, joints, gears: [], diagnostics: []});
    };
    const loads = lift => {
        const core = createPhysicsCore(J, make(lift), {stepHz: HZ});
        for (let i = 0; i < 0.5 * HZ; i++) core.step(1 / HZ);
        const out = [0, 1, 2, 3].map(i => core.rollingWheel(`w${i}`));
        // A body that does not roll has none.
        assert.equal(core.rollingWheel('chassis'), null);
        core.destroy();
        return out;
    };
    const ground = loads(0);
    const want = 0.18 * G / 4;
    t.diagnostic(`on the floor: ${ground.map(w => w.load.toFixed(4)).join(', ')} N (want ${want.toFixed(4)}), radius ${ground[0].radius} m`);
    // Four wheels under a rigid block share its weight statically indeterminately (the solver's split): the
    // sum is the weight, each about a quarter.
    const sum = ground.reduce((s, w) => s + w.load, 0);
    assert.ok(Math.abs(sum / (4 * want) - 1) <= 0.01, `the wheels carry ${sum} N of ${4 * want}`);
    for (const w of ground) {
        assert.ok(Math.abs(w.load / want - 1) <= 0.1, `load ${w.load} N vs ${want}`);
        assert.ok(Math.abs(w.radius - 0.028) < 1e-9);
    }
    // Lifted 50 cm: in free fall (from the second step: the first has no acceleration to go on) nothing presses on the tyres.
    const core = createPhysicsCore(J, make(0.5), {stepHz: HZ});
    for (let i = 0; i < 5; i++) core.step(1 / HZ);
    const air = [0, 1, 2, 3].map(i => core.rollingWheel(`w${i}`).load);
    core.destroy();
    t.diagnostic(`in the air: ${air.map(x => x.toFixed(5)).join(', ')} N`);
    for (const l of air) assert.ok(l < 0.01 * want, `a wheel in the air carries ${l} N`);
});

test('restitution per material pair: the floor leaves a part its own e; a brick on a tyre bounces like rubber, not like ABS', t => {
    // restitutionOf (contracts.js): each side stores the impact's energy in proportion to its compliance 1/E and
    // gives back e² of it. The rigid floor: a part's own e. ABS on ABS: 0.4. A brick on a tyre (rubber's E is ~400×
    // lower): e ≈ 0.054, where Jolt's max(e1, e2) said 0.4.
    assert.equal(restitutionOf('abs', GROUND_MATERIAL), MATERIALS.abs.restitution);
    assert.equal(restitutionOf('rubber', GROUND_MATERIAL), MATERIALS.rubber.restitution);
    assert.ok(Math.abs(restitutionOf('abs', 'abs') - MATERIALS.abs.restitution) < 1e-12);
    const brickOnTyre = restitutionOf('abs', 'rubber');
    assert.ok(Math.abs(brickOnTyre - restitutionOf('rubber', 'abs')) < 1e-15, 'symmetric');
    assert.ok(brickOnTyre > MATERIALS.rubber.restitution && brickOnTyre < 0.06, `brick on tyre ${brickOnTyre}`);
    // In the core: a 2 × 2 brick dropped 20 cm onto a SPIKE wheel lying flat on the floor (its tyre's side up).
    const mech = compile({version: 1, parts: [
        {id: 'w', part: '39367p01.dat', position: [0, 0, 0], rotation: [1, 0, 0, 0, 0, 1, 0, -1, 0]},
        {id: 'b', part: '3003.dat', position: [0, -60, 0], rotation: I3}
    ]}, CATALOG, {version: 2});
    const brick = mech.bodies.find(b => b.parts.includes('b'));
    const wheel = mech.bodies.find(b => b.parts.includes('w'));
    assert.equal(wheel.material, 'rubber');
    brick.position = [brick.position[0], brick.position[1] + 0.2, brick.position[2]];
    const core = createPhysicsCore(J, mech, {stepHz: HZ});
    let prev = null;
    let e = null;
    for (let i = 0; i < 0.5 * HZ && e === null; i++) {
        core.step(1 / HZ);
        const rel = core.bodyLinearVelocity(brick.id)[1] - core.bodyLinearVelocity(wheel.id)[1];
        if (prev !== null && prev < -1 && rel > 0) e = rel / -prev;
        prev = rel;
    }
    core.destroy();
    t.diagnostic(`brick on tyre: restitutionOf ${brickOnTyre.toFixed(4)}; measured bounce ${e === null ? 'none' : e.toFixed(4)} (Jolt's max rule: ${Math.max(MATERIALS.abs.restitution, MATERIALS.rubber.restitution)})`);
    assert.ok(e !== null && Math.abs(e - brickOnTyre) <= 0.02, `bounce ${e}`);
});

test('a parked cart holds on a slope gentler than c_rr and rolls down a steeper one at g·(sin α − c_rr·cos α)·M/(M + ΣI/r²)', t => {
    // Static rolling resistance (physics/rolling.js): a free wheel's hinge friction is c_rr·N·r, so a parked cart
    // holds wherever tan α ≤ c_rr (0.02: 1.15°). The slope is the gravity turned by α about x (the floor stays level).
    const crr = MATERIALS.rubber.rollingResistance;
    const make = alpha => {
        const wheels = [[-0.05, -0.04], [0.05, -0.04], [-0.05, 0.04], [0.05, 0.04]];
        const y = 0.028;
        const bodies = [
            {id: 'ground', motion: 'static', position: [0, -0.01, 0], rotation: [0, 0, 0, 1], massKg: 0, colliders: [{shape: 'box', halfExtents: [1, 0.01, 1]}], parts: [], friction: 0.8, restitution: 0},
            {id: 'chassis', motion: 'dynamic', position: [0, y, 0], rotation: [0, 0, 0, 1], massKg: 0.1, colliders: [{shape: 'box', halfExtents: [0.04, 0.005, 0.05]}], parts: []},
            ...wheels.map(([x, z], i) => ({id: `w${i}`, motion: 'dynamic', position: [x, y, z], rotation: [0, 0, 0, 1], massKg: 0.02,
                colliders: [{shape: 'cylinder', radius: 0.028, halfHeight: 0.007, rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2]}], parts: [], friction: 1,
                rollingResistance: crr}))
        ];
        const joints = wheels.map(([x, z], i) => ({id: `j${i}`, type: 'hinge', body1: 'chassis', body2: `w${i}`, point: [x, y, z], axis: [1, 0, 0]}));
        return upgradeMechanismV1({version: 1, gravity: [0, -G * Math.cos(alpha), -G * Math.sin(alpha)], bodies, joints, gears: [], diagnostics: []});
    };
    const roll = deg => {
        const alpha = deg * Math.PI / 180;
        const core = createPhysicsCore(J, make(alpha), {stepHz: HZ});
        for (let i = 0; i < 0.2 * HZ; i++) core.step(1 / HZ); // settle
        const z0 = core.bodyPose('chassis').position[2];
        const v0 = core.bodyLinearVelocity('chassis')[2];
        for (let i = 0; i < 1 * HZ; i++) core.step(1 / HZ);
        const out = {deg, moved: core.bodyPose('chassis').position[2] - z0, v0, v1: core.bodyLinearVelocity('chassis')[2]};
        core.destroy();
        return out;
    };
    const gentle = roll(0.5);  // tan 0.0087 < 0.02
    const steep = roll(3);     // tan 0.0524 > 0.02
    const flat = roll(0);
    // Steep: a = g·(sin α − c_rr·cos α)·M/(M + ΣI/r²), M 180 g, the wheels solid cylinders: ΣI/r² = 4·½·20 g = 40 g;
    // less Jolt's default damping 0.05·v. Measured from the speed gained over the second.
    const alpha = 3 * Math.PI / 180;
    const a = -(steep.v1 - steep.v0) / 1;
    const want = G * (Math.sin(alpha) - crr * Math.cos(alpha)) * 0.18 / (0.18 + 0.04) - 0.05 * Math.abs(steep.v0 + steep.v1) / 2;
    t.diagnostic(`0.5°: moved ${(gentle.moved * 1000).toFixed(3)} mm in 1 s; 0°: ${(flat.moved * 1000).toFixed(3)} mm; ` +
        `3°: ${(steep.moved * 1000).toFixed(1)} mm, a ${a.toFixed(4)} m/s² vs ${want.toFixed(4)}`);
    assert.ok(Math.abs(gentle.moved) < 0.0005, `on 0.5° it moved ${gentle.moved} m`);
    assert.ok(Math.abs(flat.moved) < 0.0005, `on the flat it moved ${flat.moved} m`);
    assert.ok(Math.abs(a / want - 1) <= 0.02, `on 3° a ${a} vs ${want}`);
});

