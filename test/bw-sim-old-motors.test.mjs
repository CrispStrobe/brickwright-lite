// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The old motors as working parts (parts.json, devices/catalog.js), headless on the real Jolt physics:
 *
 *   - a TRAIN MOTOR (9 V 2894c01, 12 V 501bc01) is a bogie with its wheels built in: its driven
 *     wheelset is the device's internal hinge, the others free internal hinges (contracts.js
 *     partFreeJoints, kinds/wheelset.js). Alone on the floor, driven from the Robot Lab API through
 *     the lab-direct hub, it ROLLS: it travels as far as its driven wheels' turn says (rolling, not
 *     sliding) and its free wheelsets turn with it;
 *   - the 9 V Technic motor (2838c01 and its LDraw numbers 74569p01/74569), the geared 47154c01, the
 *     4.5 V 6216m and the mini-motor's alias 71427c01 each turn their output while the housing stays;
 *   - the PF servo (99498, and 99498c01: the same motor with its cable) turns to an ANGLE: driven at
 *     any speed its output stops at its 90° end stop (kinds/servo-stops.js), half power holds it at
 *     45°, and no signal brings it back to the centre (hubs/lab-direct).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SimSession, catalogFrom} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {createRobotLabApi} from '../overlay/scratch-gui/src/lib/bw-sim/api/robot-lab-api.js';
import {deviceModels} from '../overlay/scratch-gui/src/lib/bw-sim/devices/catalog.js';
import {LDU_M} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import VirtualSpikeHubState from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PARTS = JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8')).parts;
const CATALOG = catalogFrom({parts: PARTS});
const DEG = 180 / Math.PI;

/** A foreign file (no `0 Author: Brickwright`) placing one part at the origin: its motor is plugged in for us. */
const alone = part => `0 ${part} alone\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 ${part}\n`;

const open = async text => {
    const {session, issues} = await SimSession.fromText(text, {hubState: new VirtualSpikeHubState(), catalog: CATALOG});
    const api = createRobotLabApi({getSession: () => session, getStatus: () => 'running', locale: () => 'en'});
    return {session, issues, api};
};

const run = async (session, ms) => {
    const start = session.time;
    while (session.time - start < ms) {
        session.tick(16);
        await session.idle();
        await null;
    }
};

/** The joint angle (degrees) of every hinge of the mechanism. */
const hingeAngles = session => session.mechanism.joints.filter(j => j.type === 'hinge').map(j => session.core.jointState(j.id).angle * DEG);

for (const {part, radiusLdu} of [{part: '2894c01.dat', radiusLdu: 29}, {part: '501bc01.dat', radiusLdu: 28}]) {
    test(`a train motor (${part}) alone on the floor rolls as far as its driven wheels turn`, async () => {
        const meta = PARTS.find(p => p.part === part);
        assert.equal(meta.internalJoints.filter(j => j.actuatedBy === 'device').length, 1, 'one driven wheelset');
        assert.ok(meta.internalJoints.some(j => j.actuatedBy === 'none'), 'free wheelsets');
        const {session, issues, api} = await open(alone(part));
        assert.deepEqual(issues.filter(i => i.severity === 'error' || i.code === 'loose-part'), []);
        assert.deepEqual(api.motors().map(m => [m.port, m.hub, m.direct]), [['A', 'lab-direct', true]]);
        await run(session, 300);
        const body = session.mechanism.bodies.find(b => b.parts.includes('p1') && b.colliders.length > 2);
        const p0 = session.core.bodyPose(body.id).position;
        const a0 = api.encoder('A').angleDeg;
        const free0 = hingeAngles(session);
        // A low power: the core caps a body's spin at Jolt's default 47 rad/s (0.25·π·60), below a train
        // motor's free axle speed (2000 rpm and more); faster wheels would skid on the floor.
        assert.equal(api.setMotor('A', {power: 15}).ok, true);
        await run(session, 2000);
        const p1 = session.core.bodyPose(body.id).position;
        const turned = api.encoder('A').angleDeg - a0;
        const travelled = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
        const rolled = Math.abs(turned) / DEG * radiusLdu * LDU_M;
        assert.ok(travelled > 0.15, `${part}: travelled ${travelled.toFixed(3)} m`);
        // Rolling, not spinning on the spot: the distance is the driven wheels' arc, give or take a quarter.
        assert.ok(Math.abs(travelled / rolled - 1) < 0.25, `${part}: travelled ${travelled.toFixed(3)} m, wheels rolled ${rolled.toFixed(3)} m`);
        // Every wheelset turned, the free ones too (they roll on the floor).
        const free1 = hingeAngles(session);
        for (let i = 0; i < free1.length; i++) assert.ok(Math.abs(free1[i] - free0[i]) > 180, `${part}: hinge ${i} turned ${(free1[i] - free0[i]).toFixed(0)}°`);
        // It stays on its wheels.
        assert.ok(Math.abs(p1[1] - p0[1]) < 0.01, `${part}: height changed by ${(p1[1] - p0[1]).toFixed(3)} m`);
        session.dispose();
    });
}

for (const part of ['2838c01.dat', '74569p01.dat', '74569.dat', '47154c01.dat', '6216m.dat', '71427c01.dat']) {
    test(`the Technic motor ${part} turns its output while its housing stays`, async () => {
        const meta = PARTS.find(p => p.part === part);
        assert.ok(deviceModels.get(meta.device).parts.includes(part), `${meta.device} names ${part}`);
        const {session, issues, api} = await open(alone(part));
        assert.deepEqual(issues.filter(i => i.severity === 'error' || i.code === 'loose-part'), []);
        await run(session, 300);
        const housing = session.mechanism.bodies.find(b => b.parts.includes('p1') && b.motion === 'dynamic' &&
            !session.mechanism.joints.some(j => j.motor && j.body2 === b.id));
        const h0 = session.core.bodyPose(housing.id).position;
        const a0 = api.encoder('A').angleDeg;
        // Power, as their own controllers (a battery box, the RCX, a speed regulator) drive them: these
        // motors have no encoder.
        assert.equal(api.setMotor('A', {power: 50}).ok, true);
        await run(session, 1000);
        const turned = api.encoder('A').angleDeg - a0;
        assert.ok(Math.abs(turned) > 180, `${part}: turned ${turned.toFixed(0)}°`);
        const h1 = session.core.bodyPose(housing.id).position;
        assert.ok(Math.hypot(...h1.map((v, i) => v - h0[i])) < 0.02, `${part}: the housing moved`);
        session.dispose();
    });
}

test('the PF servo turns to an angle: its 90° end stop, half power 45°, no signal the centre', async () => {
    for (const part of ['99498.dat', '99498c01.dat']) {
        const {session, issues, api} = await open(alone(part));
        assert.deepEqual(issues.filter(i => i.severity === 'error' || i.code === 'unknown-part'), [], part);
        const joint = session.mechanism.joints.find(j => j.motor);
        assert.ok(joint.limits && Math.abs(joint.limits[1] * DEG - 90) < 1e-6 && Math.abs(joint.limits[0] * DEG + 90) < 1e-6,
            `${part}: end stops ${joint.limits}`);
        await run(session, 200);
        assert.equal(api.setMotor('A', {power: 100}).ok, true);
        await run(session, 800);
        const full = api.encoder('A').angleDeg;
        assert.ok(Math.abs(full - 90) < 3, `${part}: full power → ${full.toFixed(1)}°`);
        assert.equal(api.setMotor('A', {power: -50}).ok, true);
        await run(session, 800);
        const half = api.encoder('A').angleDeg;
        assert.ok(Math.abs(half + 45) < 3, `${part}: half power back → ${half.toFixed(1)}°`);
        assert.equal(api.stopMotor ? api.stopMotor('A').ok : api.setMotor('A', {stop: 'brake'}).ok, true);
        await run(session, 800);
        const centre = api.encoder('A').angleDeg;
        assert.ok(Math.abs(centre) < 3, `${part}: no signal → ${centre.toFixed(1)}°`);
        // A move past the end is held at the end.
        api.setMotor('A', {position: 170, speedDps: 500});
        await run(session, 800);
        assert.ok(api.encoder('A').angleDeg <= 91, `${part}: ${api.encoder('A').angleDeg.toFixed(1)}° past its end`);
        session.dispose();
    }
});
