// SPDX-License-Identifier: BSD-3-Clause
/**
 * Sim Lab S1, end to end (docs/SIM-LAB-PLAN.md §0): the reference driving base
 * built from real LDraw parts (test/fixtures/bw-sim/driving-base.json) is
 * compiled with the hand-authored part metadata, run in Jolt, and driven by
 * the UNCHANGED virtual SPIKE hub through bw-sim/hub-bridge.js — the same
 * hub state Scratch blocks and SPIKE 3 Python talk to.
 *
 * Proven here:
 *   - the compiler finds exactly the mechanism the model is: one chassis,
 *     two wheel assemblies on motorised hinges bound to ports A and B, a
 *     free castor ball, the ground; no error diagnostics;
 *   - the SPIKE driving-base convention holds physically: left motor A
 *     negative and right motor B positive drives forward, straight;
 *     both positive turns in place to the LEFT, which the IMU reports as
 *     negative yaw (clockwise positive);
 *   - encoders are physical: positions read back the hinge rotation, and
 *     run_for_degrees completes on the real angle;
 *   - a run is reproducible: the same commands give identical results.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {SimHubBridge, STEP_MS} from '../overlay/scratch-gui/src/lib/bw-sim/hub-bridge.js';
import VirtualSpikeHubState from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';
import {sitsInside, solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const CATALOG = new Map(json('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json').parts.map(p => [p.part, p]));
const MODEL = json('test/fixtures/bw-sim/driving-base.json');

/** SPIKE wheel: 56 mm. */
const WHEEL_D_M = 0.056;
/** The medium motor's full speed (deg/s), LEGO's SPIKE 3 limit. */
const HALF_SPEED = 555;

const compiled = () => compile(MODEL, CATALOG);
/** The body of a part (for a motor: the first of its two bodies, so only used for non-motors). */
const bodyOf = (mech, partId) => mech.bodies.find(b => b.parts.includes(partId));

const run = async ({left, right, seconds, setup}) => {
    const J = await loadJolt();
    const mech = compiled();
    const core = createPhysicsCore(J, mech, {stepHz: 1000 / STEP_MS});
    const hubState = new VirtualSpikeHubState();
    const hubBody = bodyOf(mech, 'hub').id;
    const bridge = new SimHubBridge({hubState, core, mechanism: mech, hubBody});
    const start = core.bodyPose(hubBody).position;
    if (setup) await setup(hubState, bridge);
    else {
        hubState.motors.runAtSpeed('A', left);
        hubState.motors.runAtSpeed('B', right);
    }
    for (let t = 0; t < seconds * 1000; t += 50) bridge.tick(50);
    const end = core.bodyPose(hubBody).position;
    const result = {
        mech, start, end,
        moved: Math.hypot(end[0] - start[0], end[2] - start[2]),
        dz: end[2] - start[2],
        dx: end[0] - start[0],
        yaw: hubState.data.imu.yaw,
        posA: hubState.data.motors[0].position,
        posB: hubState.data.motors[1].position,
        snapshot: Buffer.from(core.snapshot().bodies.buffer).toString('hex')
    };
    bridge.dispose();
    core.destroy();
    return result;
};

test('the driving base compiles to chassis + two motorised wheels + castor ball', () => {
    const mech = compiled();
    assert.deepEqual(mech.diagnostics.filter(d => d.severity === 'error'), []);
    const dynamic = mech.bodies.filter(b => b.motion === 'dynamic');
    assert.equal(dynamic.length, 4, `bodies: ${JSON.stringify(dynamic.map(b => b.parts))}`);
    const chassis = bodyOf(mech, 'hub');
    // A motor is in two bodies: its housing here, its output with the wheel.
    for (const p of ['motorL', 'motorR', 'pinL', 'pinR', 'frontBeam', 'frontPin1', 'frontPin2', 'castor']) {
        assert.ok(chassis.parts.includes(p), `${p} is rigid with the hub`);
    }
    for (const side of ['L', 'R']) {
        const wheel = bodyOf(mech, `wheel${side}`);
        assert.equal(wheel.friction, 1, `wheel${side}: the tyre grips`);
        assert.equal(bodyOf(mech, `axle${side}`), wheel, `axle${side} turns with wheel${side}`);
        assert.notEqual(wheel, chassis);
    }
    const hinges = mech.joints.filter(j => j.type === 'hinge');
    assert.deepEqual(hinges.map(j => j.motor?.port).sort(), ['A', 'B']);
    for (const h of hinges) {
        assert.equal(h.body1, chassis.id, 'the motor housing (chassis) is body1');
        // Wheel axles are along world x.
        assert.ok(Math.abs(Math.abs(h.axis[0]) - 1) < 1e-9, `hinge axis ${h.axis}`);
    }
    const balls = mech.joints.filter(j => j.type === 'ball');
    assert.equal(balls.length, 1);
    assert.equal(balls[0].body2, bodyOf(mech, 'ball').id);
    assert.equal(mech.gears.length, 0);
    assert.ok(mech.bodies.some(b => b.motion === 'static'), 'a ground');
});

test('A negative, B positive drives straight forward; encoders read the wheels', async t => {
    const r = await run({left: -HALF_SPEED, right: HALF_SPEED, seconds: 2});
    t.diagnostic(`2 s at ${HALF_SPEED} °/s: ${r.dz.toFixed(3)} m along z, ${r.dx.toFixed(4)} m sideways, yaw ${r.yaw}°, ` +
        `encoders ${r.posA.toFixed(1)}° / ${r.posB.toFixed(1)}°`);
    // Forward is away from the castor: LDraw +z, world -z.
    assert.ok(r.dz < -0.3, `moved ${r.dz.toFixed(3)} m along z (expected forward, -z)`);
    assert.ok(Math.abs(r.dx) < 0.05 * Math.abs(r.dz), `drifted ${r.dx.toFixed(3)} m sideways`);
    assert.ok(Math.abs(r.yaw) < 5, `yaw ${r.yaw}`);
    // Distance from the encoders (no slip) vs the chassis displacement: within 10 %.
    const fromEncoders = (Math.abs(r.posA) + Math.abs(r.posB)) / 2 / 360 * Math.PI * WHEEL_D_M;
    assert.ok(Math.abs(fromEncoders - Math.abs(r.dz)) < 0.1 * Math.abs(r.dz),
        `encoders say ${fromEncoders.toFixed(3)} m, chassis moved ${Math.abs(r.dz).toFixed(3)} m`);
    assert.ok(r.posA < 0 && r.posB > 0, 'A turned negative, B positive');
});

test('both motors positive turns in place to the left: negative yaw', async t => {
    const r = await run({left: HALF_SPEED / 2, right: HALF_SPEED / 2, seconds: 1.5});
    t.diagnostic(`yaw ${r.yaw}°, the centre moved ${r.moved.toFixed(4)} m`);
    assert.ok(r.yaw < -30, `yaw ${r.yaw}`);
    assert.ok(r.moved < 0.06, `the centre moved ${r.moved.toFixed(3)} m`);
});

test('run_for_degrees completes on the physical angle', async t => {
    let outcome;
    const r = await run({seconds: 2, setup: hub => {
        hub.motors.runForDegrees('B', 360, 500).then(v => { outcome = v; });
    }});
    await new Promise(resolve => setImmediate(resolve));
    t.diagnostic(`B ended at ${r.posB.toFixed(2)}°`);
    assert.equal(outcome, 'completed');
    assert.ok(Math.abs(r.posB - 360) < 3, `B ended at ${r.posB}°`);
});

test('the same commands give the same run', async () => {
    const a = await run({left: -HALF_SPEED, right: HALF_SPEED / 2, seconds: 1});
    const b = await run({left: -HALF_SPEED, right: HALF_SPEED / 2, seconds: 1});
    assert.equal(a.snapshot, b.snapshot);
    assert.equal(a.posA, b.posA);
});

test('no two solid parts of the driving base overlap; only pins and axles sit inside holes', () => {
    // A castor once 'hung' from the hub's bottom holes while its frame cut 8 mm into the hub: the
    // compiler accepted it (the parts were pinned together), the picture showed it. Connected or not,
    // solid parts must not share volume; shafts (pins, axles) and the castor ball (inside its socket)
    // are the parts that legitimately sit inside another part.
    // The rule is the build editor's (editor/overlap.js `solidOverlaps`, which refuses such moves);
    // these are the parts it lets sit inside another one.
    // (3749 axle pin, 32002 pin 3/4, 2736 towball: an axle in a hole and a ball in a socket.)
    // 3708/3737 axles 12/10 and 87083 axle 4 with stop are the newly catalogued shafts
    // (oc-parts.md): like 3705 they are single axle connectors, so they too sit inside holes.
    const inside = ['2780.dat', '3673.dat', '6558.dat', '43093.dat', '3705.dat', '4519.dat', '32073.dat', '3706.dat', '3707.dat', '32062.dat', '52629.dat',
        '3749.dat', '32002.dat', '2736.dat',
        '3708.dat', '3737.dat', '87083.dat',
        // Derived from LDraw (scripts/derive-part-meta.mjs): axles 2-16 and with stops, pins, axle pins,
        // towball pins, half pins with a stud.
        '11214.dat', '15462.dat', '18651.dat', '23948.dat', '24316.dat', '32209.dat', '32556a.dat', '32556b.dat', '3704.dat',
        '39888.dat', '4274.dat', '42924.dat', '44294.dat', '4459.dat', '50451.dat', '55013.dat', '59426.dat', '60485.dat',
        '61332.dat', '65249.dat', '6628.dat', '77765.dat', '89678.dat', '99008.dat'];
    assert.deepEqual([...CATALOG.values()].filter(sitsInside).map(m => m.part).sort(), inside.slice().sort());
    // Partly shaft, partly solid: only their tagged shaft regions may sit inside another part
    // (32054's stop bush stays outside the hole; 87082's centre, with its pin hole, between two beams;
    // 48496, the smooth toggle joint of R4: its two pins in a beam, its eyes and bar outside).
    // Derived: pins and axles on blocks, cross blocks with pins, the pin with a stop bush type 2.
    const partly = [...CATALOG.values()].filter(m => !sitsInside(m) && m.colliders.some(c => c.region && c.region !== 'stud')).map(m => m.part).sort();
    // 71427, the RCX's 9 V mini-motor: its output axle stub is an axle region (a wheel's hole takes it).
    // 19474-f1, the pneumatic valve: its lever's handle stub is an axle (region), its box is solid (kinds/pneumatic.js).
    assert.deepEqual(partly, ['15100.dat', '19474-f1.dat', '22961.dat', '27940.dat', '32054.dat', '32138.dat', '44874.dat', '48496.dat', '48989.dat',
        '5713.dat', '65304.dat', '65487.dat', '6553.dat', '71427.dat', '87082.dat',
        // The linear actuator's spindle: its input stub is an axle (region), its threaded rod is solid (kinds/screw.js).
        '92695.dat']);
    // The other region is a System part's stud layer (kinds/stud.js): it sits in the hollow underside of the part on top.
    for (const m of CATALOG.values()) {
        if (m.colliders.some(c => c.region === 'stud')) assert.ok(m.connectors.some(c => c.type === 'stud'), `${m.part}: a stud region without studs`);
    }
    const found = [];
    for (const p of MODEL.parts) {
        for (const o of solidOverlaps(MODEL, CATALOG, p)) found.push(`${p.id} ↔ ${o.part}`);
    }
    assert.deepEqual(found, []);
});
