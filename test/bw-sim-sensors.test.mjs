// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Sensor models (overlay/scratch-gui/src/lib/bw-sim/sensors.js): proves
// distance, colour and force readings from first principles, and that the
// SimHubBridge publishes them to the hub.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {readSensors} from '../overlay/scratch-gui/src/lib/bw-sim/sensors.js';
import VirtualSpikeHubState from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';
import {SimHubBridge} from '../overlay/scratch-gui/src/lib/bw-sim/hub-bridge.js';

const J = await loadJolt();

const DIST_TOL_MM = 2;
const REF_TOL = 2;

test('distance: 0.3 m from a static wall reads 300 ± 2 mm', () => {
    const mech = {
        version: 1, gravity: [0, -9.81, 0],
        bodies: [
            {id: 'ground', motion: 'static', position: [0, -0.01, 0], rotation: [0, 0, 0, 1], massKg: 0, colliders: [{shape: 'box', halfExtents: [5, 0.01, 5]}], parts: [], friction: 0.8, color: 10},
            {id: 'wall', motion: 'static', position: [0.35, 0.05, 0], rotation: [0, 0, 0, 1], massKg: 0, colliders: [{shape: 'box', halfExtents: [0.05, 0.05, 0.05]}], parts: []},
            {id: 'robot', motion: 'dynamic', position: [0, 0.05, 0], rotation: [0, 0, 0, 1], massKg: 1, colliders: [{shape: 'box', halfExtents: [0.04, 0.02, 0.04]}], parts: []},
        ],
        joints: [], gears: [], diagnostics: [],
        sensors: [{port: 'C', kind: 'distance', body: 'robot', origin: [0, 0.05, 0], direction: [1, 0, 0]}],
    };
    const core = createPhysicsCore(J, mech);
    const out = readSensors(core, mech, ['robot']);
    assert.equal(out.C.kind, 'distance');
    assert.ok(Math.abs(out.C.distance - 300) <= DIST_TOL_MM, `distance ${out.C.distance} vs 300`);
    core.destroy();
});

test('distance: facing open space reads -1', () => {
    const mech = {
        version: 1, gravity: [0, 0, 0],
        bodies: [
            {id: 'ground', motion: 'static', position: [0, -0.01, 0], rotation: [0, 0, 0, 1], massKg: 0, colliders: [{shape: 'box', halfExtents: [5, 0.01, 5]}], parts: [], color: 10},
            {id: 'robot', motion: 'dynamic', position: [0, 0.05, 0], rotation: [0, 0, 0, 1], massKg: 1, colliders: [{shape: 'box', halfExtents: [0.02, 0.02, 0.02]}], parts: []},
        ],
        joints: [], gears: [], diagnostics: [],
        sensors: [{port: 'C', kind: 'distance', body: 'robot', origin: [0, 0.05, 0], direction: [0, 1, 0]}],
    };
    const core = createPhysicsCore(J, mech);
    const out = readSensors(core, mech, ['robot']);
    assert.equal(out.C.distance, -1);
    core.destroy();
});

test('color: 10 mm above white ground reads colour 10 with reflection ~69', () => {
    const mech = {
        version: 1, gravity: [0, -9.81, 0],
        bodies: [
            {id: 'ground', motion: 'static', position: [0, -0.01, 0], rotation: [0, 0, 0, 1], massKg: 0, colliders: [{shape: 'box', halfExtents: [5, 0.01, 5]}], parts: [], friction: 0.8, color: 10},
            {id: 'robot', motion: 'dynamic', position: [0, 0.05, 0], rotation: [0, 0, 0, 1], massKg: 1, colliders: [{shape: 'box', halfExtents: [0.04, 0.02, 0.04]}], parts: []},
        ],
        joints: [], gears: [], diagnostics: [],
        sensors: [{port: 'D', kind: 'color', body: 'robot', origin: [0, 0.01, 0], direction: [0, -1, 0]}],
    };
    const core = createPhysicsCore(J, mech);
    const out = readSensors(core, mech, ['robot']);
    assert.equal(out.D.kind, 'color');
    assert.equal(out.D.color, 10);
    assert.ok(Math.abs(out.D.reflection - 69) <= REF_TOL, `reflection ${out.D.reflection} vs 69`);
    core.destroy();
});

test('force: driven into a wall becomes pressed', () => {
    const mech = {
        version: 1, gravity: [0, 0, 0],
        bodies: [
            {id: 'wall', motion: 'static', position: [0.06, 0.05, 0], rotation: [0, 0, 0, 1], massKg: 0, colliders: [{shape: 'box', halfExtents: [0.05, 0.05, 0.05]}], parts: []},
            {id: 'robot', motion: 'dynamic', position: [0, 0.05, 0], rotation: [0, 0, 0, 1], massKg: 1, colliders: [{shape: 'box', halfExtents: [0.02, 0.02, 0.02]}], parts: []},
        ],
        joints: [], gears: [], diagnostics: [],
        sensors: [{port: 'E', kind: 'force', body: 'robot', origin: [0, 0.05, 0], direction: [1, 0, 0]}],
    };
    const core = createPhysicsCore(J, mech);
    // Wall front at x=0.01, sensor at x=0, distance 0.01 -> capped at 0.002 range? Actually 0.01 >0.002 so force 0
    // Move sensor closer: wall front 0.01 is 10mm away -> force 0, not pressed. Need within 2mm.
    // Place wall at 0.051 with front at 0.001 (1mm) as per earlier plan; simpler use wall at 0.011 front 0.001? Use front 0.001
    // Let's instead place sensor at 0.009 -> distance 0.001
    const mechClose = {
        version: 1, gravity: [0, 0, 0],
        bodies: [
            {id: 'wall', motion: 'static', position: [0.051, 0.05, 0], rotation: [0, 0, 0, 1], massKg: 0, colliders: [{shape: 'box', halfExtents: [0.05, 0.05, 0.05]}], parts: []},
            {id: 'robot', motion: 'dynamic', position: [0, 0.05, 0], rotation: [0, 0, 0, 1], massKg: 1, colliders: [{shape: 'box', halfExtents: [0.02, 0.02, 0.02]}], parts: []},
        ],
        joints: [], gears: [], diagnostics: [],
        sensors: [{port: 'E', kind: 'force', body: 'robot', origin: [0, 0.05, 0], direction: [1, 0, 0]}],
    };
    const core2 = createPhysicsCore(J, mechClose);
    const out2 = readSensors(core2, mechClose, ['robot']);
    assert.equal(out2.E.kind, 'force');
    assert.ok(out2.E.pressed, `force ${out2.E.force} should be pressed`);
    assert.ok(out2.E.force > 10 && out2.E.force <= 100, `force ${out2.E.force}`);
    core.destroy();
    core2.destroy();
});

test('force: a wall met askew presses the button on its edge (the face counts, not only the centre)', () => {
    // The wall's face turned 10° about y: 1.9 mm in front of the button's centre (force 5 there, not
    // pressed), 1.2 mm in front of a point 4 mm to its side. The NXT bumper bot met the Wall like this
    // and drove into it forever (CI run 39327216331).
    const theta = 10 * Math.PI / 180;
    const n = [Math.cos(theta), 0, -Math.sin(theta)];
    const h = 0.05;
    const mech = {
        version: 1, gravity: [0, 0, 0],
        bodies: [
            {id: 'wall', motion: 'static', position: [0.0019 + h * n[0], 0.05, h * n[2]], rotation: [0, Math.sin(theta / 2), 0, Math.cos(theta / 2)],
                massKg: 0, colliders: [{shape: 'box', halfExtents: [h, h, h]}], parts: []},
            {id: 'robot', motion: 'dynamic', position: [-0.03, 0.05, 0], rotation: [0, 0, 0, 1], massKg: 1, colliders: [{shape: 'box', halfExtents: [0.02, 0.02, 0.02]}], parts: []}
        ],
        joints: [], gears: [], diagnostics: [],
        sensors: [{port: 'E', kind: 'force', body: 'robot', origin: [0, 0.05, 0], direction: [1, 0, 0]}]
    };
    const core = createPhysicsCore(J, mech);
    const centre = core.castRay([0, 0.05, 0], [1, 0, 0], 0.01, {ignoreBodies: ['robot']});
    assert.ok(centre && Math.abs(centre.distance - 0.0019) < 0.0002, `the centre's ray meets the wall ${centre && centre.distance} m ahead`);
    const out = readSensors(core, mech, ['robot']);
    assert.ok(out.E.pressed, `force ${out.E.force} on the button's edge should be pressed`);
    assert.ok(out.E.force >= 30 && out.E.force <= 50, `force ${out.E.force} (1.2 mm: about 40)`);
    core.destroy();
});

test('hub sees all three through hubState.data.sensors[port] after bridge.tick()', () => {
    const mech = {
        version: 1, gravity: [0, -9.81, 0],
        bodies: [
            {id: 'ground', motion: 'static', position: [0, -0.01, 0], rotation: [0, 0, 0, 1], massKg: 0, colliders: [{shape: 'box', halfExtents: [5, 0.01, 5]}], parts: [], friction: 0.8, color: 10},
            {id: 'wallDist', motion: 'static', position: [0.35, 0.05, 0], rotation: [0, 0, 0, 1], massKg: 0, colliders: [{shape: 'box', halfExtents: [0.05, 0.05, 0.05]}], parts: []},
            {id: 'wallForce', motion: 'static', position: [0.051, 0.05, 0], rotation: [0, 0, 0, 1], massKg: 0, colliders: [{shape: 'box', halfExtents: [0.05, 1, 0.05]}], parts: []},
            {id: 'chassis', motion: 'dynamic', position: [0, 0.05, 0], rotation: [0, 0, 0, 1], massKg: 1, colliders: [{shape: 'box', halfExtents: [0.04, 0.02, 0.04]}], parts: []},
        ],
        joints: [], gears: [], diagnostics: [],
        sensors: [
            {port: 'C', kind: 'distance', body: 'chassis', origin: [0, 0.05, 0], direction: [1, 0, 0]},
            {port: 'D', kind: 'color', body: 'chassis', origin: [0, 0.01, 0], direction: [0, -1, 0]},
            {port: 'E', kind: 'force', body: 'chassis', origin: [0, 0.05, 0], direction: [1, 0, 0]},
        ],
    };
    const core = createPhysicsCore(J, mech, {stepHz: 200});
    const hubState = new VirtualSpikeHubState();
    // Use chassis as hub body so heading logic has a body to track (even if not needed for this test)
    const bridge = new SimHubBridge({hubState, core, mechanism: mech, hubBody: 'chassis', stepMs: 5});
    bridge.tick(5);
    // After tick, hubState.data.sensors should have entries for C, D, E with deviceIds 62,61,63
    // Note: distance and force share same origin/direction, both hit wallDist front at 0.3 vs wallForce at 0.001?
    // Our wallForce is at x=0.051 with half 0.05 -> front 0.001, wallDist at x=0.35 front 0.3. The ray from [0,0.05,0] along +X hits the nearer wallForce at 0.001 first, not wallDist at 0.3. So distance would read 1mm -> clamped to -1 (outside 50..2000). We need distinct directions to avoid clash.
    // Put distance facing +X, force facing +Z to separate walls.
    // Rebuild with force facing +Z
    bridge.dispose();
    core.destroy();
    // Rebuild with separated directions
    const mech2 = {
        version: 1, gravity: [0, -9.81, 0],
        bodies: [
            {id: 'ground', motion: 'static', position: [0, -0.01, 0], rotation: [0, 0, 0, 1], massKg: 0, colliders: [{shape: 'box', halfExtents: [5, 0.01, 5]}], parts: [], friction: 0.8, color: 10},
            {id: 'wallDist', motion: 'static', position: [0.35, 0.05, 0], rotation: [0, 0, 0, 1], massKg: 0, colliders: [{shape: 'box', halfExtents: [0.05, 0.05, 0.05]}], parts: []},
            {id: 'wallForce', motion: 'static', position: [0, 0.05, 0.096], rotation: [0, 0, 0, 1], massKg: 0, colliders: [{shape: 'box', halfExtents: [0.05, 0.05, 0.05]}], parts: []},
            {id: 'chassis', motion: 'dynamic', position: [0, 0.05, 0], rotation: [0, 0, 0, 1], massKg: 1, colliders: [{shape: 'box', halfExtents: [0.04, 0.02, 0.04]}], parts: []},
        ],
        joints: [], gears: [], diagnostics: [],
        sensors: [
            {port: 'C', kind: 'distance', body: 'chassis', origin: [0, 0.05, 0], direction: [1, 0, 0]},
            {port: 'D', kind: 'color', body: 'chassis', origin: [0, 0.01, 0], direction: [0, -1, 0]},
            {port: 'E', kind: 'force', body: 'chassis', origin: [0, 0.05, 0.045], direction: [0, 0, 1]},
        ],
    };
    const core2 = createPhysicsCore(J, mech2, {stepHz: 200});
    const hubState2 = new VirtualSpikeHubState();
    const bridge2 = new SimHubBridge({hubState: hubState2, core: core2, mechanism: mech2, hubBody: 'chassis', stepMs: 5});
    bridge2.tick(5);
    const sC = hubState2.data.sensors[2];
    const sD = hubState2.data.sensors[3];
    const sE = hubState2.data.sensors[4];
    assert.ok(sC && sC.kind === 'distance' && sC.deviceId === 62, `C ${JSON.stringify(sC)}`);
    assert.ok(Math.abs(sC.distance - 300) <= DIST_TOL_MM, `C distance ${sC.distance}`);
    assert.ok(sD && sD.kind === 'color' && sD.deviceId === 61, `D ${JSON.stringify(sD)}`);
    assert.equal(sD.color, 10);
    assert.ok(Math.abs(sD.reflection - 69) <= REF_TOL, `D reflection ${sD.reflection}`);
    assert.ok(sE && sE.kind === 'force' && sE.deviceId === 63, `E ${JSON.stringify(sE)}`);
    assert.equal(sE.pressed, true);
    assert.ok(sE.force > 10);
    bridge2.dispose();
    core2.destroy();
});
