// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Couples a running physics scene (bw-sim/physics/jolt-core.js) to the hubs
// that drive it, through the port boundary of docs/ROBOT-LAB-ARCHITECTURE.md
// §3 and §5.1: every hub is a VirtualHub (hubs/hub-profile.js), and nothing
// but plain port data crosses — drives one way, readings and the hub body's
// pose the other. This bridge knows no hub family: SPIKE's controller, port
// letters, device ids and IMU axes are in hubs/spike/spike-virtual-hub.js,
// and any other family's adapter plugs in the same way (the registry,
// registry/hubs.js). Every programming route — Scratch blocks, SPIKE 3
// Python, later an RCX bytecode VM or an emulated firmware — ends at its
// hub's ports and drives the model without knowing it is simulated.
//
// ONE CLOCK (docs/SPIKE-ARENA.md, "The hub contract"; §3.3). While a scene
// runs, this bridge is the clock owner: tick(ms) advances in fixed steps, and
// each step k (from t_k to t_k+1 = t_k + 5 ms) is
//
//   1. hub.advanceTo(t_k+1): the route runs its controller for the step and
//      decides what each port drives during it (zero-order hold);
//   2. hub.readDrives(): those drives become the motorised hinges' commands
//      (physics/actuators.js: pwm = a duty into the motor's DC model — its
//      catalogue device, devices/dc-motors.js, and the port's supply voltage
//      from the hub profile — so a blocked wheel really stalls at the motor's
//      torque; servo = an ideal velocity target, kept as a test fixture);
//   3. physics steps;
//   4. readings: each driven hinge's MEASURED rotation as an encoder reading
//      (angle, change over the step, speed), each sensor's probe, and the hub
//      body's pose (continuous heading, orientation, rates, acceleration) —
//      hub.writeReadings() turns them into what that hub reports;
//   5. after the batch, one hub.publish() per hub.
//
// The step returns its FRAME — the drives the hub chose and the readings it
// was given, per hub id, as plain structured-clone-safe data. The physics
// worker sends frames back to the main thread, where HubReplay (below)
// replays the real hub against them (sim-worker-protocol.js).
//
// BINDING (R2): what plugs into which hub's port is CompiledMechanism v2's
// `actuators` and sensor `devices`, each on {hub, port} (a v1 mechanism is
// lifted by upgradeMechanismV1: its ports name no hub). A scene with ONE hub
// binds everything to it, whatever hub the data names (as R1 did); with
// several, each binds what names it, and what names none goes to the first.
// Sensor probes carry sensors.js's v1 readings (the probe/encoder split of
// §5.2 is a later slice).

import {upgradeMechanismV1} from './contracts.js';
import {readSensors, sensorsOf, linearAcceleration} from './sensors.js';
import {applyDrive, attachMotor} from './physics/actuators.js';
import {dcMotorFor} from './devices/dc-motors.js';
import {hubRegistry, DEFAULT_HUB_PROFILE} from './hubs/index.js';

const DEG = 180 / Math.PI;

/** Fixed step, ms: the arena's STEP_MS, so a hub's controller sees the same cadence in both worlds. */
export const STEP_MS = 5;

/**
 * Whether something bound to `hub` (an id, or null: the model's first hub) plugs into
 * the scene's hub number `index` of `count`.
 */
const bindsTo = (hub, h, index, count) => count === 1 || hub === h || (hub === null && index === 0);

/**
 * What the compiled model plugs into one hub's ports: its actuators (motorised hinges, in
 * joint order) and its sensors, with the joint each actuator drives.
 * @param {object} mechanism a CompiledMechanism (v1 or v2)
 * @param {string} [hubId] the hub (omitted: everything, as for a scene's only hub)
 * @param {number} [index] the hub's place among the scene's hubs
 * @param {number} [count] how many hubs the scene has
 */
export const hubBindings = (mechanism, hubId = null, index = 0, count = 1) => {
    const m = upgradeMechanismV1(mechanism);
    const actuators = m.actuators.filter(a => bindsTo(a.hub, hubId, index, count));
    const sensors = sensorsOf(m).filter(s => bindsTo(s.hub, hubId, index, count));
    const devices = m.devices.filter(d => d.sensor && bindsTo(d.hub, hubId, index, count));
    /** PortBinding[]: every actuator, then every sensor. */
    const bindings = [
        // dcMotor: the DC model physics drives, so a hub's controller regulates the same motor.
        ...actuators.map(a => ({port: a.port, class: 'motor', ids: {...a.ids}, hub: a.hub, device: a.device, dcMotor: dcMotorFor(a)})),
        ...devices.map(d => ({port: d.port, class: 'sensor', ids: {}, sensor: d.sensor, hub: d.hub, device: d.device}))
    ];
    return {actuators, sensors, bindings};
};

/**
 * What the compiled model plugs into its hub's ports (PortBinding[]) when the scene has
 * one hub: every motorised hinge, then every sensor, in the mechanism's order.
 * @param {object} mechanism a CompiledMechanism (v1 or v2)
 */
export const portBindings = mechanism => hubBindings(mechanism).bindings;

/** Equal drive lists (the replay's check that the main thread's hub chose what the worker's mirror did). */
export const sameDrives = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The hubs a bridge or replay drives: `hubs` as given ([{hub: VirtualHub, body}]), or —
 * the form every caller used before R1 — one hub state of the default family on `hubBody`.
 */
const resolveHubs = ({hubs, hubState, hubBody, profile, registry, mechanism}) => {
    const list = hubs || [{hub: registry.create(profile, {hubState}), body: hubBody}];
    if (new Set(list.map(({hub}) => hub.id)).size !== list.length) throw new Error('two hubs of a scene have one id');
    for (const {body} of list) {
        if (!mechanism.bodies.some(b => b.id === body)) throw new Error(`unknown hub body '${body}'`);
    }
    return list.map(({hub, body}, index) => ({id: hub.id, hub, body, ...hubBindings(mechanism, hub.id, index, list.length)}));
};

/** Plugs the model into a hub; a refusal (a port the hub does not have) stops the scene. */
const plugInto = (hub, bindings) => {
    const refusals = hub.plug(bindings).filter(d => d.severity === 'error');
    if (refusals.length) throw new Error(refusals.map(d => d.message).join('; '));
};

export class SimHubBridge {
    /**
     * @param {object} options
     * @param {object} options.core a physics core from createPhysicsCore (stepHz must be 1000 / STEP_MS)
     * @param {object} options.mechanism the CompiledMechanism the core runs
     * @param {{hub: object, body: string}[]} [options.hubs] the VirtualHubs and the bodies that carry them
     * @param {object} [options.hubState] instead of `hubs`: one hub state of `profile`'s family
     *        (default SPIKE Prime: a VirtualSpikeHubState), wrapped by that family's adapter
     * @param {string} [options.hubBody] with `hubState`: the body that carries the hub (its pose is the IMU)
     * @param {string} [options.profile] with `hubState`: the hub profile id
     * @param {object} [options.registry] the hub registry (default: the built-in families)
     * @param {number} [options.stepMs]
     */
    constructor ({core, mechanism, hubs = null, hubState = null, hubBody = null, profile = DEFAULT_HUB_PROFILE,
        registry = hubRegistry, stepMs = STEP_MS}) {
        this.core = core;
        this.stepMs = stepMs;
        this.mechanism = mechanism;
        this.robotBodies = mechanism.bodies.filter(b => b.motion === 'dynamic').map(b => b.id);
        this.accumulator = 0;
        /** Simulated time since the hubs were plugged, ms (the end of the last step). */
        this.timeMs = 0;
        this.hubs = resolveHubs({hubs, hubState, hubBody, profile, registry, mechanism});
        /** The (first) hub's body, as before R1. */
        this.hubBody = this.hubs.length ? this.hubs[0].body : null;
        for (const h of this.hubs) {
            /**
             * port -> {joint, motor (its actuator: the torque and speed limits), device (its DC model),
             * supplyVolts (the hub port's), angle (rad, last measured)}
             */
            h.motors = new Map();
            const ports = (h.hub.profile && h.hub.profile.ports) || [];
            for (const a of h.actuators) {
                if (h.motors.has(a.port)) throw new Error(`two motorised hinges on port ${a.port}`);
                const port = ports.find(p => p.id === a.port);
                const device = dcMotorFor(a);
                attachMotor(core, a.joint, device);
                h.motors.set(a.port, {joint: a.joint, motor: a, device, supplyVolts: port ? port.supplyVolts : undefined,
                    angle: core.jointState(a.joint).angle});
            }
            // Heading reference: the hub's forward direction at t = 0, flattened onto the ground.
            h.forward0 = this._forward(h.body);
            h.heading = 0;
            h.prevLinVel = null;
            plugInto(h.hub, h.bindings);
        }
        // The sensors read the scene from the start, not from the first step: a port must not
        // keep a reading from the previous model (a "nothing ahead" -1 would end a program's
        // `wait until distance < 10` before the robot moved).
        for (const h of this.hubs) {
            const probes = this.probeReadings(h);
            if (probes.length) {
                h.hub.writeReadings(probes);
                h.hub.publish();
            }
        }
    }

    /** Every sensor's probe now, as PortReadings (sensors.js measures; the hub labels); `h`: only that hub's. */
    probeReadings (h = this.hubs[0]) {
        const out = [];
        const readings = readSensors(this.core, this.mechanism, this.robotBodies, h ? h.sensors : undefined);
        for (const [port, reading] of Object.entries(readings)) {
            const {kind, ...raw} = reading;
            out.push({port, kind: 'probe', device: kind, raw});
        }
        return out;
    }

    /** Initial readings per hub id (what a worker's scene reports at load). */
    initialReadings () {
        const out = {};
        for (const h of this.hubs) out[h.id] = this.probeReadings(h);
        return out;
    }

    /** A body's local -z axis (LDraw +z, the robot's forward) in world, on the ground plane. */
    _forward (body) {
        const [x, y, z, w] = this.core.bodyPose(body).rotation;
        // Rotate (0, 0, -1) by the quaternion.
        const fx = -(2 * (x * z + w * y));
        const fz = -(1 - 2 * (x * x + y * y));
        const n = Math.hypot(fx, fz) || 1;
        return [fx / n, fz / n];
    }

    /** One fixed step (see the header). Returns the step's frame. */
    step () {
        const t = this.timeMs + this.stepMs;
        const drives = this.hubs.map(h => {
            h.hub.advanceTo(t);
            const chosen = h.hub.readDrives();
            for (const drive of chosen) {
                const m = h.motors.get(drive.port);
                if (m) applyDrive(this.core, m.joint, drive, m.motor, m);
            }
            return chosen;
        });
        this.core.step(this.stepMs / 1000);
        this.timeMs = t;
        const frame = {t, hubs: {}};
        this.hubs.forEach((h, i) => {
            const readings = this._encoders(h).concat(this.probeReadings(h));
            const pose = this._pose(h);
            h.hub.writeReadings(readings, pose);
            frame.hubs[h.id] = {drives: drives[i], readings, pose};
        });
        return frame;
    }

    /** Each driven hinge's measured rotation over the step. */
    _encoders (h) {
        const out = [];
        for (const [port, m] of h.motors) {
            const {angle, velocity} = this.core.jointState(m.joint);
            out.push({port, kind: 'encoder', angleRad: angle, deltaRad: angle - m.angle, radPerSec: velocity});
            m.angle = angle;
        }
        return out;
    }

    /** The hub body's HubPoseReading after the step. */
    _pose (h) {
        // Heading: clockwise positive seen from above (y up), continuous.
        const [fx, fz] = this._forward(h.body);
        const [gx, gz] = h.forward0;
        // Angle from forward0 to forward, counter-clockwise seen from above, is atan2(cross_y, dot)
        // with cross_y = g_z f_x − g_x f_z; clockwise is its negative.
        const ccw = Math.atan2(gz * fx - gx * fz, gx * fx + gz * fz) * DEG;
        const clockwise = -ccw;
        // Unwrap so a robot spinning in place does not jump at ±180.
        let delta = clockwise - (((h.heading % 360) + 540) % 360 - 180);
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        const rate = delta / (this.stepMs / 1000);
        h.heading += delta;
        const pose = {headingDeg: h.heading, rateDegPerSec: rate};
        try {
            const {rotation} = this.core.bodyPose(h.body);
            const angVel = this.core.bodyAngularVelocity(h.body);
            const linVel = this.core.bodyLinearVelocity(h.body);
            const linAcc = linearAcceleration(linVel, h.prevLinVel, this.stepMs / 1000);
            h.prevLinVel = linVel.slice();
            Object.assign(pose, {quat: rotation, angVel, linAcc, gravity: this.mechanism.gravity});
        } catch (_) {}
        return pose;
    }

    /** What step() carries from one step to the next besides the physics and the hubs (for a worker's rollback). */
    saveState () {
        return {timeMs: this.timeMs, hubs: this.hubs.map(h => ({heading: h.heading,
            prevLinVel: h.prevLinVel && h.prevLinVel.slice(), angles: [...h.motors.values()].map(m => m.angle)}))};
    }

    restoreState ({timeMs, hubs}) {
        this.timeMs = timeMs;
        this.hubs.forEach((h, k) => {
            const {heading, prevLinVel, angles} = hubs[k];
            h.heading = heading;
            h.prevLinVel = prevLinVel && prevLinVel.slice();
            let i = 0;
            for (const m of h.motors.values()) m.angle = angles[i++];
        });
    }

    /** Advance by ms of simulated time in fixed steps; publish once. */
    tick (ms) {
        this.accumulator += Math.max(0, Number(ms) || 0);
        let stepped = false;
        while (this.accumulator >= this.stepMs - 1e-9) {
            this.accumulator -= this.stepMs;
            this.step();
            stepped = true;
        }
        if (stepped) for (const h of this.hubs) h.hub.publish();
        return stepped;
    }

    /** Hand the clock back (sensor/motor authority returns to whoever had it). */
    dispose () {
        for (const h of this.hubs) h.hub.dispose();
    }
}

/**
 * The hubs' side of a scene whose physics runs in the worker (sim-session.js, worker
 * mode). The hubs and their controllers stay here, on the main thread, where the VM
 * reads and writes them synchronously; the worker runs the SAME SimHubBridge against
 * mirrors of them and returns one frame per step. replay() then runs each real hub
 * step by step — waits and run-for-degrees promises finish on the step they finish
 * on — and writes each step's readings, checking that the hub chose exactly the
 * drives the worker's mirror did.
 */
export class HubReplay {
    /**
     * @param {object} options as SimHubBridge's (hubs, or hubState + hubBody + profile; mechanism; stepMs),
     *        and readings: the worker bridge's initialReadings() at t = 0, by hub id
     */
    constructor ({mechanism, hubs = null, hubState = null, hubBody = null, profile = DEFAULT_HUB_PROFILE,
        registry = hubRegistry, stepMs = STEP_MS, readings = {}}) {
        this.hubs = resolveHubs({hubs, hubState, hubBody, profile, registry, mechanism});
        this.hubBody = this.hubs.length ? this.hubs[0].body : null;
        this.stepMs = stepMs;
        this.accumulator = 0;
        for (const h of this.hubs) plugInto(h.hub, h.bindings);
        for (const h of this.hubs) {
            const initial = readings[h.id] || [];
            if (initial.length) {
                h.hub.writeReadings(initial);
                h.hub.publish();
            }
        }
    }

    /** As SimHubBridge.tick's loop: how many fixed steps ms more of simulated time makes due. */
    due (ms) {
        this.accumulator += Math.max(0, Number(ms) || 0);
        let steps = 0;
        while (this.accumulator >= this.stepMs - 1e-9) {
            this.accumulator -= this.stepMs;
            steps++;
        }
        return steps;
    }

    /**
     * Applies a batch of frames, one route step each. Returns the number of steps in
     * which some hub chose other drives than the worker's mirror (0 unless they diverged).
     */
    replay (frames) {
        let diverged = 0;
        for (const frame of frames) {
            let differs = false;
            for (const h of this.hubs) {
                const f = frame.hubs[h.id];
                h.hub.advanceTo(frame.t);
                if (!sameDrives(h.hub.readDrives(), f.drives)) differs = true;
                h.hub.writeReadings(f.readings, f.pose);
            }
            if (differs) diverged++;
        }
        if (frames.length) for (const h of this.hubs) h.hub.publish();
        return diverged;
    }

    dispose () {
        for (const h of this.hubs) h.hub.dispose();
    }
}
