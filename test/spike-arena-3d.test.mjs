// SPDX-License-Identifier: BSD-3-Clause
/**
 * The SPIKE arena's 3D view (task D3) draws the SAME snapshot as the 2D canvas.
 * three.js builds a scene graph without WebGL, so the scene the browser renders
 * is built here, headless, by the shipped module (lib/spike-arena/arena-scene3d.js),
 * and every transform is compared with the snapshot it was given:
 *
 *   - the mat, every wall and every crate of every shipped mission stand where
 *     the world puts them (bounding boxes against the world's own shapes);
 *   - the rover follows the snapshot pose over a driven path: position, yaw,
 *     the body's four corners against snapshot.footprint (a mirror image or a
 *     dropped yaw moves them), each sensor against snapshot.sensorPoses, the
 *     wheels' spin against snapshot.wheelTravel;
 *   - the top-down camera puts a mat point where the 2D canvas draws it;
 *   - a real mission (the capstone reference, in the real VM) rendered every
 *     few frames: the rover and the pushed crate track the snapshot at every
 *     checkpoint, the scene never writes to the snapshot, and the run ends with
 *     the identical verdict, finishing time and pose as the same run with no
 *     view at all (the one-clock contract).
 *
 * The expected values use the literal 0.01 m per cm and the arena's own
 * geometry, never the module's constants, so a unit or axis mistake in the
 * module cannot move the expectation with it.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {Box3, Vector3} from 'three';
import {REPO} from './helpers/bw-integrated.mjs';

const ARENA_DIR = path.join(REPO, 'overlay', 'scratch-gui', 'static', 'spike-arena');
const LIB = path.join(REPO, 'overlay', 'scratch-gui', 'src', 'lib', 'spike-arena');
const {buildArenaScene, topDownCamera, followPose, orbitStart, perspectiveCamera, WALL_HEIGHT_CM, OBJECT_HEIGHT_CM} = await import(path.join(LIB, 'arena-scene3d.js'));
const {ArenaSim} = await import(path.join(LIB, 'arena-sim.js'));
const {assertValidWorld} = await import(path.join(LIB, 'arena-world.js'));
const {convexPieces} = await import(path.join(LIB, 'geometry.js'));

const S = 0.01; // metres per centimetre, stated here on purpose
const DEG = Math.PI / 180;
const close = (actual, expected, tolerance, message) =>
    assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} is not within ${tolerance} of ${expected}`);

const units = JSON.parse(readFileSync(path.join(ARENA_DIR, 'units.json'), 'utf8')).units;
const missions = units.flatMap(unit => {
    const dir = path.join(ARENA_DIR, unit);
    return JSON.parse(readFileSync(path.join(dir, 'unit.json'), 'utf8')).challenges.map(id => ({
        unit, dir, world: assertValidWorld(JSON.parse(readFileSync(path.join(dir, `${id}.json`), 'utf8')))
    }));
});
const capstone = missions.find(m => m.world.id === 'cp01-supply-run');

/** The bounding box of a world shape, in cm, from the arena's own convex pieces. */
const shapeBounds = shape => {
    const xs = [];
    const ys = [];
    for (const piece of convexPieces(shape)) {
        if (piece.circle) {
            const {x, y, r} = piece.circle;
            xs.push(x - r, x + r);
            ys.push(y - r, y + r);
        } else for (const [x, y] of piece.poly) { xs.push(x); ys.push(y); }
    }
    return {minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys)};
};

const assertBox = (object, bounds, height, what) => {
    object.updateMatrixWorld(true);
    const box = new Box3().setFromObject(object);
    const tol = 1e-6;
    close(box.min.x, bounds.minX * S, tol, `${what} min x`);
    close(box.max.x, bounds.maxX * S, tol, `${what} max x`);
    close(box.min.z, bounds.minY * S, tol, `${what} min z (arena y)`);
    close(box.max.z, bounds.maxY * S, tol, `${what} max z (arena y)`);
    close(box.min.y, 0, tol, `${what} stands on the mat`);
    close(box.max.y, height * S, tol, `${what} height`);
};

/** Every transform the scene holds, checked against one snapshot. */
const assertFollows = (built, snapshot, robot, where) => {
    const {pose} = snapshot;
    built.scene.updateMatrixWorld(true);
    close(built.rover.position.x, pose.x * S, 1e-9, `${where}: rover x`);
    close(built.rover.position.z, pose.y * S, 1e-9, `${where}: rover z (arena y)`);
    close(built.rover.position.y, 0, 1e-12, `${where}: rover on the mat`);
    close(built.rover.rotation.y, -pose.heading * DEG, 1e-9, `${where}: rover yaw`);

    // The body's four bottom corners, in the scene, are the snapshot footprint.
    const {front, back, halfWidth} = robot.body;
    const local = [[front, -halfWidth], [front, halfWidth], [-back, halfWidth], [-back, -halfWidth]];
    local.forEach(([lx, ly], i) => {
        // The body box is centred on its own origin: its corner in rover space.
        const corner = built.rover.localToWorld(new Vector3(lx * S, 0, ly * S));
        const [ex, ey] = snapshot.footprint[i];
        close(corner.x, ex * S, 1e-9, `${where}: footprint corner ${i} x`);
        close(corner.z, ey * S, 1e-9, `${where}: footprint corner ${i} z`);
    });
    const box = new Box3().setFromObject(built.body);
    const xs = snapshot.footprint.map(p => p[0] * S);
    const ys = snapshot.footprint.map(p => p[1] * S);
    close(box.min.x, Math.min(...xs), 1e-6, `${where}: body box min x`);
    close(box.max.x, Math.max(...xs), 1e-6, `${where}: body box max x`);
    close(box.min.z, Math.min(...ys), 1e-6, `${where}: body box min z`);
    close(box.max.z, Math.max(...ys), 1e-6, `${where}: body box max z`);

    for (const sensorPose of snapshot.sensorPoses) {
        const entry = built.sensors.get(sensorPose.port);
        assert.ok(entry, `${where}: a scene object for sensor ${sensorPose.port}`);
        const at = entry.group.getWorldPosition(new Vector3());
        close(at.x, sensorPose.x * S, 1e-9, `${where}: ${sensorPose.kind} sensor x`);
        close(at.z, sensorPose.y * S, 1e-9, `${where}: ${sensorPose.kind} sensor z`);
        // Facing: the sensor's +x in the scene is its snapshot heading on the mat.
        const ahead = entry.group.localToWorld(new Vector3(1, 0, 0)).sub(at);
        close(ahead.x, Math.cos(sensorPose.heading * DEG), 1e-9, `${where}: ${sensorPose.kind} sensor facing x`);
        close(ahead.z, Math.sin(sensorPose.heading * DEG), 1e-9, `${where}: ${sensorPose.kind} sensor facing z`);
        const reading = snapshot.sensors[sensorPose.port];
        if (sensorPose.kind === 'distance') {
            const cm = reading.distance > 0 ? reading.distance / 10 : 0;
            assert.equal(entry.beam.visible, cm > 0, `${where}: the beam shows exactly when there is a reading`);
            if (cm > 0) close(entry.beam.scale.x, cm * S, 1e-9, `${where}: beam length`);
        }
    }
    for (const side of ['left', 'right']) {
        const diameter = robot[side].wheelDiameter ?? robot.wheelDiameter;
        close(built.wheels[side].rotation.z, -snapshot.wheelTravel[side] / (diameter / 2), 1e-9, `${where}: ${side} wheel spin`);
    }
    for (const object of snapshot.objects) {
        const group = built.objects.get(object.id);
        close(group.position.x, object.centre[0] * S, 1e-9, `${where}: object ${object.id} x`);
        close(group.position.z, object.centre[1] * S, 1e-9, `${where}: object ${object.id} z`);
    }
};

test('every shipped mission builds: mat, walls and crates stand where the world puts them', () => {
    assert.ok(missions.length >= 20, `all units' missions (${missions.length})`);
    for (const {world} of missions) {
        const robot = new ArenaSim(world).robot;
        const built = buildArenaScene(world, robot);
        const matBox = new Box3().setFromObject(built.mat);
        close(matBox.min.x, 0, 1e-6, `${world.id} mat left`);
        close(matBox.max.x, world.mat.width * S, 1e-6, `${world.id} mat right`);
        close(matBox.min.z, 0, 1e-6, `${world.id} mat top edge (arena y = 0)`);
        close(matBox.max.z, world.mat.height * S, 1e-6, `${world.id} mat bottom edge`);
        assert.equal(built.walls.length, (world.walls || []).length, `${world.id}: one scene wall per wall`);
        (world.walls || []).forEach((wall, i) => assertBox(built.walls[i], shapeBounds(wall.shape), WALL_HEIGHT_CM, `${world.id} wall ${i}`));
        assert.equal(built.objects.size, (world.objects || []).length, `${world.id}: one scene object per object`);
        for (const object of world.objects || []) {
            assertBox(built.objects.get(object.id), shapeBounds(object.shape), OBJECT_HEIGHT_CM, `${world.id} object ${object.id}`);
        }
        built.dispose();
    }
});

test('the rover follows the snapshot over a driven path: pose, footprint, sensors, wheels', () => {
    const world = capstone.world;
    const sim = new ArenaSim(world);
    const built = buildArenaScene(world, sim.robot);
    // Straight, a left arc, a spin on the spot, a right arc, reverse: every
    // heading quadrant, both wheel directions.
    const legs = [[0.5, 0.5, 60], [0.2, 0.45, 90], [0.4, -0.4, 70], [0.5, 0.25, 90], [-0.3, -0.3, 40], [-0.35, 0.35, 60]];
    let step = 0;
    let turned = 0;
    for (const [dl, dr, count] of legs) {
        for (let i = 0; i < count; i++, step++) {
            sim.advanceWheels(dl, dr, 5);
            if (step % 25 === 0) {
                const snapshot = sim.snapshot();
                built.update(snapshot);
                assertFollows(built, snapshot, sim.robot, `step ${step}`);
                turned = Math.max(turned, Math.abs(snapshot.pose.heading - world.start.heading));
            }
        }
    }
    assert.ok(step >= 400, `a few hundred steps (${step})`);
    assert.ok(turned > 90, `the path turned through more than a right angle (${turned.toFixed(0)} deg), so yaw is exercised`);
});

test('the top-down camera shows the mat as the 2D canvas draws it', () => {
    for (const {world} of missions.slice(0, 6)) {
        const camera = topDownCamera(world);
        const {width, height} = world.mat;
        for (const [x, y] of [[0, 0], [width, 0], [0, height], [width, height], [width * 0.3, height * 0.7], [world.start.x, world.start.y]]) {
            const ndc = new Vector3(x * S, 0, y * S).project(camera);
            // The canvas maps (x, y) cm to (x / width, y / height) of its box, y down.
            close(ndc.x, x / width * 2 - 1, 1e-9, `${world.id} (${x}, ${y}) across`);
            close(ndc.y, 1 - y / height * 2, 1e-9, `${world.id} (${x}, ${y}) down`);
        }
    }
    // The orbit camera starts with the whole mat in view, for every mission.
    for (const {world} of missions) {
        const {width, height} = world.mat;
        const camera = perspectiveCamera(width / height);
        const {position, target} = orbitStart(world);
        camera.position.copy(position);
        camera.lookAt(target);
        camera.updateMatrixWorld();
        for (const [x, y] of [[0, 0], [width, 0], [0, height], [width, height]]) {
            const ndc = new Vector3(x * S, 0, y * S).project(camera);
            assert.ok(Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1 && ndc.z < 1, `${world.id}: mat corner (${x}, ${y}) in the orbit view`);
        }
    }
    // The follow camera sits behind the rover: opposite its heading.
    const pose = {x: 50, y: 40, heading: 30};
    const {position, target} = followPose({pose});
    const back = new Vector3(pose.x * S, 0, pose.y * S).sub(position);
    assert.ok(back.x * Math.cos(30 * DEG) + back.z * Math.sin(30 * DEG) > 0, 'the rover is ahead of the follow camera');
    const ahead = target.clone().sub(new Vector3(pose.x * S, 0, pose.y * S));
    assert.ok(ahead.x * Math.cos(30 * DEG) + ahead.z * Math.sin(30 * DEG) > 0 && ahead.length() < 0.4,
        'looking just ahead of the rover, along its heading');
});

test('the 3D mat texture is the 2D view\'s own mat drawing', async () => {
    const {drawArena, drawMat} = await import(path.join(LIB, 'arena-render.js'));
    // A canvas context that records every call and property write, in order.
    const recorder = () => {
        const ops = [];
        const ctx = new Proxy({}, {
            get: (target, key) => (...args) => { ops.push(`${String(key)}(${JSON.stringify(args)})`); },
            set: (target, key, value) => { ops.push(`${String(key)}=${JSON.stringify(value)}`); return true; }
        });
        return {ops, ctx};
    };
    for (const {world} of missions) {
        const sim = new ArenaSim(world);
        const whole = recorder();
        drawArena(whole.ctx, world, sim.snapshot(), sim.robot, 4);
        const mat = recorder();
        drawMat(mat.ctx, world, 4);
        assert.ok(mat.ops.length > 2, `${world.id}: the mat draws something`);
        assert.deepEqual(whole.ops.slice(1, 1 + mat.ops.length), mat.ops,
            `${world.id}: the 2D view draws exactly drawMat's mat first, so the texture is the same picture`);
    }
});

const {runOnArena} = await import('./helpers/spike-arena-vm.mjs');

test('a real mission rendered every few frames: the scene tracks it, and the run is unchanged', async () => {
    const world = capstone.world;
    const program = readFileSync(path.join(capstone.dir, world.solution), 'utf8');
    const plain = await runOnArena(program, world);
    assert.equal(plain.verdict.status, 'pass', 'the capstone reference passes with no view');

    let built = null;
    let checkpoints = 0;
    let crateMoved = false;
    const crateStart = world.objects.find(o => o.pushable);
    const viewed = await runOnArena(program, world, {
        onFrame (bridge, frame) {
            if (!built) built = buildArenaScene(world, bridge.robot);
            if (frame % 10) return;
            const snapshot = bridge.snapshot();
            const before = JSON.stringify(snapshot);
            built.update(snapshot);
            assert.equal(JSON.stringify(snapshot), before, `frame ${frame}: the scene wrote to the snapshot`);
            assertFollows(built, snapshot, bridge.robot, `frame ${frame}`);
            const crate = snapshot.objects.find(o => o.id === crateStart.id);
            if (Math.hypot(crate.centre[0] - crateStart.shape.x, crate.centre[1] - crateStart.shape.y) > 5) crateMoved = true;
            checkpoints++;
        }
    });
    assert.ok(checkpoints >= 30, `checkpoints over the run (${checkpoints})`);
    assert.ok(crateMoved, 'the crate was pushed while the scene watched, so a moving object was checked');
    assert.deepEqual(viewed.verdict, plain.verdict, 'the same verdict, stages and finishing time with the 3D view open');
    assert.deepEqual(viewed.snapshot.pose, plain.snapshot.pose, 'the same final pose');
    assert.equal(viewed.frames, plain.frames, 'the same number of frames');
    built.dispose();
});

test('the snapshot accessor: wheel travel is what the wheels turned, slip included, and nothing reads it back', () => {
    const world = capstone.world;
    const sim = new ArenaSim(world);
    for (let i = 0; i < 50; i++) sim.advanceWheels(0.3, 0.1, 5);
    const snapshot = sim.snapshot();
    close(snapshot.wheelTravel.left, 15, 1e-9, 'left travel');
    close(snapshot.wheelTravel.right, 5, 1e-9, 'right travel');
    snapshot.wheelTravel.left = 1e6; // a copy: a view cannot write it back
    assert.notEqual(sim.snapshot().wheelTravel.left, 1e6);
    // Driving into the mat border: the rover stops, the wheels keep turning.
    const blocked = new ArenaSim({...world, start: {x: 12, y: 60, heading: 180}, walls: [], objects: []});
    for (let i = 0; i < 200; i++) blocked.advanceWheels(0.5, 0.5, 5);
    const after = blocked.snapshot();
    assert.ok(after.blocked, 'blocked by the border');
    close(after.wheelTravel.left, 100, 1e-9, 'slip still turns the wheel');
    assert.ok(after.pose.x > 0, 'while the rover stands at the border');
    // The pose does not depend on the new field: the same drive with it zeroed each step.
    const a = new ArenaSim(world);
    const b = new ArenaSim(world);
    for (let i = 0; i < 300; i++) {
        a.advanceWheels(0.4, 0.2, 5);
        b.wheelTravel = {left: 0, right: 0};
        b.advanceWheels(0.4, 0.2, 5);
    }
    assert.deepEqual(a.pose, b.pose);
    assert.deepEqual(a.readSensors(), b.readSensors());
});
