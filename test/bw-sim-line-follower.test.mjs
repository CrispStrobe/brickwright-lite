// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Line follower: the S1 driving base plus a colour sensor on port C at the
// front looking down ~8 mm above the floor, pinned to the hub. Drives the
// line-oval mat with the classic two-state follower against the hub API only.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import VirtualSpikeHubState from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';
import {SimHubBridge} from '../overlay/scratch-gui/src/lib/bw-sim/hub-bridge.js';
import {createMat, distanceToOvalCentre} from '../overlay/scratch-gui/src/lib/bw-sim/world/mats.js';

const parts = JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', import.meta.url))).parts;
const CATALOG = new Map(parts.map(p => [p.part, p]));
const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/bw-sim/line-follower.json', import.meta.url)));

test('line-follower fixture compiles without sensor errors and sensor is on hub', () => {
    const mech = compile(FIXTURE.model, CATALOG, {mat: FIXTURE.mat});
    assert.deepEqual(mech.diagnostics.filter(d => d.code === 'sensor-without-port'), []);
    assert.ok(!mech.diagnostics.some(d => d.severity === 'error'), `errors ${JSON.stringify(mech.diagnostics)}`);
    assert.ok(Array.isArray(mech.sensors) && mech.sensors.length === 1, 'one sensor');
    const s = mech.sensors[0];
    assert.equal(s.port, 'C');
    assert.equal(s.kind, 'color');
    const ground = mech.bodies.find(b => b.id === 'ground');
    const height = s.origin[1] - (ground.position[1] + 0.01);
    assert.ok(height > 0.007 && height < 0.013, `sensor height ${(height*1000).toFixed(1)}mm expected 8-12`);
    assert.ok(Math.abs(s.direction[1] + 1) < 1e-6, `direction ${s.direction} should be down`);
    const hubBody = mech.bodies.find(b => b.parts.includes('hub'));
    assert.equal(s.body, hubBody.id);
});

test('line follower completes one lap within 90 s, stays within 3 cm of line, deterministic', async () => {
    const J = await loadJolt();
    const mat = createMat(FIXTURE.mat);
    const mech0 = compile(FIXTURE.model, CATALOG, {mat: FIXTURE.mat});
    const start = mat.startPose;
    // Place the mechanism at the mat's documented start pose:
    // start.x, start.z in world metres, start.heading degrees from +x toward +z.
    // LDraw→world is (x, -y, -z)*LDU_M, and at identity the robot's forward is -z (north, heading 270).
    // To face +x (heading 0), rotate +90° about y from identity (since -z -> +x is +90°).
    const yawDeg = start.heading - 270;
    const yawRad = yawDeg * Math.PI / 180;
    const qYaw = [0, Math.sin(yawRad/2), 0, Math.cos(yawRad/2)];
    const quatMul = (a,b)=>{const[ax,ay,az,aw]=a,[bx,by,bz,bw]=b;return[aw*bx+ax*bw+ay*bz-az*by,aw*by-ax*bz+ay*bw+az*bx,aw*bz+ax*by-ay*bx+az*bw,aw*bw-ax*bx-ay*by-az*bz];};
    const quatConj = q=>[-q[0],-q[1],-q[2],q[3]];
    const quatRotateVec = (q,v)=>{const qv=[v[0],v[1],v[2],0],qc=quatConj(q);const t=quatMul(q,qv),r=quatMul(t,qc);return[r[0],r[1],r[2]];};
    // Translate dynamic bodies to start pose, keeping ground fixed
    const mech = JSON.parse(JSON.stringify(mech0));
    const hub0 = mech0.bodies.find(b=>b.parts.includes('hub'));
    for (const b of mech.bodies) if (b.motion==='dynamic') {
        const local = [b.position[0]-hub0.position[0], b.position[1]-hub0.position[1], b.position[2]-hub0.position[2]];
        const rotLocal = quatRotateVec(qYaw, local);
        b.position = [start.x + rotLocal[0], b.position[1], start.z + rotLocal[2]];
        b.rotation = quatMul(qYaw, b.rotation);
    }
    const centreLength = mat.centreLineLengthM;
    const runOnce = async ()=>{
        const core = createPhysicsCore(J, mech, {stepHz: 200});
        const hubState = new VirtualSpikeHubState();
        const hubBody = mech.bodies.find(b=>b.parts.includes('hub')).id;
        const bridge = new SimHubBridge({hubState, core, mechanism: mech, hubBody, stepMs: 20});
        const startPos = [...core.bodyPose(hubBody).position];
        let travelled=0, maxDist=0, prevPos=[...startPos], timeMs=0;
        for (let step=0; step<4500; step++) {
            const s = hubState.data.sensors[2];
            const refl = s ? s.reflection : 100;
            if (refl < 50) {
                hubState.motors.runAtSpeed('A', -15 * 1110/100);
                hubState.motors.runAtSpeed('B', 30 * 1110/100);
            } else {
                hubState.motors.runAtSpeed('A', -30 * 1110/100);
                hubState.motors.runAtSpeed('B', 15 * 1110/100);
            }
            bridge.tick(20);
            timeMs += 20;
            if (step % 5 === 0) {
                const p = core.bodyPose(hubBody).position;
                travelled += Math.hypot(p[0]-prevPos[0], p[2]-prevPos[2]);
                prevPos=[...p];
                const d = distanceToOvalCentre(p[0], p[2]);
                if (d>maxDist) maxDist=d;
                if (travelled >= centreLength*0.9 && Math.hypot(p[0]-startPos[0], p[2]-startPos[2])<0.05) {
                    bridge.dispose(); core.destroy();
                    return {timeMs, travelled, maxDist, completed:true};
                }
            }
        }
        bridge.dispose(); core.destroy();
        return {timeMs, travelled, maxDist, completed:false};
    };
    const r1 = await runOnce();
    assert.ok(r1.completed, `did not complete lap in 90s, travelled ${r1.travelled.toFixed(2)} maxDist ${(r1.maxDist*100).toFixed(1)}cm`);
    assert.ok(r1.maxDist <= 0.03 + 1e-6, `strayed ${(r1.maxDist*100).toFixed(1)}cm from line, limit 3cm`);
    assert.ok(r1.travelled >= centreLength*0.9, `travelled ${r1.travelled.toFixed(2)} < ${(centreLength*0.9).toFixed(2)}`);
    const r2 = await runOnce();
    assert.equal(r1.timeMs, r2.timeMs, 'deterministic lap time');
});
