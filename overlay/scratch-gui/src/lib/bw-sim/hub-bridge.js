// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Couples a running physics scene (bw-sim/physics/jolt-core.js) to the
// virtual SPIKE hub (lib/virtual-hub/spike-hub-state.js) — plan task A6 in
// its S1 form (docs/SIM-LAB-PLAN.md §0). Like the arena's bridge
// (lib/spike-arena/arena-hub-bridge.js) it goes through the hub state only,
// so every programming route (Scratch blocks, SPIKE 3 Python, the
// independent motor controller's waits and promises) drives the model
// without knowing it is simulated.
//
// ONE CLOCK (docs/SPIKE-ARENA.md, "The hub contract"). While a scene runs,
// this bridge is the clock owner: tick(ms) advances in fixed steps, and each
// step is
//
//   1. read each motor port's position (it may have been reset by a program
//      since the last step: that becomes the new base);
//   2. hubState.stepMotors(step) — the hub's own motor CONTROLLER runs
//      unchanged and decides the commanded velocity (ramps, holds,
//      run-to-position, stop actions) into data.motors[i].degPerSec;
//   3. that velocity becomes the motorised hinge's target (torque limited by
//      the motor's metadata, so a blocked wheel really does not turn);
//   4. physics steps;
//   5. the hinge's MEASURED rotation replaces the controller's kinematic
//      integration: position = base + Δangle. So the encoder reads what the
//      wheel did, and run-to-position finishes on the real angle;
//   6. the hub body's heading becomes the IMU yaw (setHeading), and one
//      hubState.changed() publishes a consistent frame.
//
// Signs. A hinge's angle is body2 relative to body1 about the joint axis
// (contracts.js); the compiler takes a motor's axis from its output
// connector, which the part metadata points INTO the motor from its face —
// so a positive hinge angle is clockwise seen from the motor's face, SPIKE's
// own sign. Degrees = radians · 180/π, nothing else.
//
// Not in S1: sensors other than the IMU yaw (E2), stall detection from the
// physical tracking error (the controller's stall timer still works from its
// own load input), a coasting stop (a stopped motor brakes), multi-hub scenes.

import {readSensors, SENSOR_DEVICE, imuFromBody} from './sensors.js';
const PORTS = 'ABCDEF';
const DEG = 180 / Math.PI;

/** Fixed step, ms: the arena's STEP_MS, so the motor controller sees the same cadence in both worlds. */
export const STEP_MS = 5;

/** LEGO device id the hub reports for a motor port when the part does not say (SPIKE medium angular motor). */
const MEDIUM_MOTOR = 48;

export class SimHubBridge {
    /**
     * @param {object} options
     * @param {object} options.hubState a VirtualSpikeHubState
     * @param {object} options.core a physics core from createPhysicsCore (stepHz must be 1000 / STEP_MS)
     * @param {object} options.mechanism the CompiledMechanism the core runs
     * @param {string} options.hubBody id of the body that carries the hub (its pose is the IMU)
     * @param {number} [options.stepMs]
     */
    constructor ({hubState, core, mechanism, hubBody, stepMs = STEP_MS}) {
        this.hubState = hubState;
        this.core = core;
        this.stepMs = stepMs;
        this.hubBody = hubBody;
        this.mechanism = mechanism;
        this.robotBodies = mechanism.bodies.filter(b => b.motion === 'dynamic').map(b => b.id);
        this._prevLinVel = null;
        this.accumulator = 0;
        /** port index -> {joint, angle (rad, last measured)} */
        this.motors = new Map();
        for (const j of mechanism.joints) {
            if (j.type !== 'hinge' || !j.motor) continue;
            const index = PORTS.indexOf(j.motor.port);
            if (this.motors.has(index)) throw new Error(`two motorised hinges on port ${j.motor.port}`);
            this.motors.set(index, {joint: j.id, angle: core.jointState(j.id).angle});
        }
        if (!mechanism.bodies.some(b => b.id === hubBody)) throw new Error(`unknown hub body '${hubBody}'`);
        // Heading reference: the hub's forward direction at t = 0, flattened onto the ground.
        this.forward0 = this._forward();
        this.heading = 0;
        this.previousOwner = plugMotors(hubState, mechanism);
        // The sensors read the scene from the start, not from the first step: a port must not
        // keep a reading from the previous model (a "nothing ahead" -1 would end a program's
        // `wait until distance < 10` before the robot moved).
        publishSensors(hubState, this.sensorReadings());
    }

    /** Every sensor port's reading now, as [port, kind, values] (what updateSensor takes). */
    sensorReadings () {
        const sensors = [];
        const readings = readSensors(this.core, this.mechanism, this.robotBodies);
        for (const [port, reading] of Object.entries(readings)) {
            const {kind, ...values} = reading;
            sensors.push([port, kind, {deviceId: SENSOR_DEVICE[kind], ...values}]);
        }
        return sensors;
    }

    /** The hub body's local -z axis (LDraw +z, the robot's forward) in world, on the ground plane. */
    _forward () {
        const [x, y, z, w] = this.core.bodyPose(this.hubBody).rotation;
        // Rotate (0, 0, -1) by the quaternion.
        const fx = -(2 * (x * z + w * y));
        const fz = -(1 - 2 * (x * x + y * y));
        const n = Math.hypot(fx, fz) || 1;
        return [fx / n, fz / n];
    }

    /** One fixed step (see the header). Returns the step's frame (what it wrote into the hub). */
    step () {
        const {base, commanded} = this._command();
        this.core.step(this.stepMs / 1000);
        const frame = this._measure(base, commanded);
        applyFrame(this.hubState, frame);
        return frame;
    }

    /** Steps 1-3: the hub's motor controller runs, its velocities become the hinges' targets. */
    _command () {
        const data = this.hubState.data.motors;
        const base = new Map();
        for (const [index] of this.motors) base.set(index, Number(data[index].position) || 0);
        this.hubState.stepMotors(this.stepMs);
        const commanded = new Map();
        for (const [index, m] of this.motors) {
            // Zero commanded velocity holds the shaft (brake); coast is not modelled in S1.
            const degPerSec = Number(data[index].degPerSec) || 0;
            commanded.set(index, degPerSec);
            this.core.setMotor(m.joint, {mode: 'velocity', radPerSec: degPerSec / DEG});
        }
        return {base, commanded};
    }

    /**
     * Steps 5-6 after the physics stepped: everything the hub is told about this step, as a
     * plain, structured-clone-safe FRAME (applyFrame writes it). The physics worker sends
     * these back one per step (physics/sim-worker-protocol.js).
     */
    _measure (base, commanded) {
        const motors = [];
        for (const [index, m] of this.motors) {
            const {angle, velocity} = this.core.jointState(m.joint);
            motors.push([index, base.get(index) + (angle - m.angle) * DEG, velocity * DEG, commanded.get(index)]);
            m.angle = angle;
        }
        // Heading: clockwise positive seen from above (y up), continuous.
        const [fx, fz] = this._forward();
        const [gx, gz] = this.forward0;
        // Angle from forward0 to forward, counter-clockwise seen from above, is atan2(cross_y, dot)
        // with cross_y = g_z f_x − g_x f_z; clockwise is its negative.
        const ccw = Math.atan2(gz * fx - gx * fz, gx * fx + gz * fz) * DEG;
        const clockwise = -ccw;
        // Unwrap so a robot spinning in place does not jump at ±180.
        let delta = clockwise - (((this.heading % 360) + 540) % 360 - 180);
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        const rate = delta / (this.stepMs / 1000);
        this.heading += delta;
        // Full IMU: pitch, roll, angular velocity, acceleration, faceUp from the hub body.
        let imu = null;
        try {
            const pose = this.core.bodyPose(this.hubBody);
            const angVelWorld = this.core.bodyAngularVelocity(this.hubBody);
            const linVelWorld = this.core.bodyLinearVelocity(this.hubBody);
            const dt = this.stepMs / 1000;
            const {pitch, roll, angularVelocity, acceleration, faceUp} =
                imuFromBody(pose, angVelWorld, linVelWorld, this._prevLinVel, dt, this.mechanism.gravity);
            this._prevLinVel = linVelWorld.slice();
            imu = {pitch, roll, angularVelocity, acceleration, faceUp};
        } catch (_) {}
        return {motors, heading: this.heading, rate, imu, sensors: this.sensorReadings()};
    }

    /** What step() carries from one step to the next besides the physics (for a worker's rollback). */
    saveState () {
        return {heading: this.heading, prevLinVel: this._prevLinVel && this._prevLinVel.slice(),
            angles: [...this.motors.values()].map(m => m.angle)};
    }

    restoreState ({heading, prevLinVel, angles}) {
        this.heading = heading;
        this._prevLinVel = prevLinVel && prevLinVel.slice();
        let i = 0;
        for (const m of this.motors.values()) m.angle = angles[i++];
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
        if (stepped) this.hubState.changed();
        return stepped;
    }

    /** Hand the clock back (sensor/motor authority returns to whoever had it). */
    dispose () {
        this.hubState.clockOwner = this.previousOwner;
    }
}

/**
 * Plug the model's motors into the hub, as the arena's bridge does for its driving
 * base: the extension sees a motor on each driven port, at position 0; the hub's motor
 * clock becomes 'native' (stepped by whoever steps the scene). Returns the previous clock owner.
 */
export const plugMotors = (hubState, mechanism) => {
    for (const j of mechanism.joints) {
        if (j.type !== 'hinge' || !j.motor) continue;
        const index = PORTS.indexOf(j.motor.port);
        hubState.data.sensors[index] = {kind: 'motor', deviceId: j.motor.deviceId ?? MEDIUM_MOTOR};
        hubState.motors.resetPosition(j.motor.port, 0);
        hubState.motors.stop(j.motor.port);
    }
    hubState.motorPairDefined = false;
    const previousOwner = hubState.clockOwner;
    hubState.clockOwner = 'native';
    hubState.resetHeading(0);
    return previousOwner;
};

/** Writes sensor readings ([port, kind, values], SimHubBridge.sensorReadings) and publishes them. */
export const publishSensors = (hubState, sensors) => {
    for (const [port, kind, values] of sensors) hubState.updateSensor(port, kind, values);
    if (sensors.length) hubState.changed();
};

/** Writes one step's frame (SimHubBridge._measure) into the hub: encoders, heading, IMU, sensors. */
export const applyFrame = (hubState, frame) => {
    const data = hubState.data.motors;
    for (const [index, position, measuredDegPerSec] of frame.motors) {
        data[index].position = position;
        data[index].measuredDegPerSec = measuredDegPerSec;
    }
    hubState.setHeading(frame.heading, {rate: frame.rate});
    if (frame.imu) {
        const imuData = hubState.data.imu;
        imuData.pitch = frame.imu.pitch;
        imuData.roll = frame.imu.roll;
        imuData.angularVelocity = frame.imu.angularVelocity;
        imuData.acceleration = frame.imu.acceleration;
        imuData.faceUp = frame.imu.faceUp;
    }
    for (const [port, kind, values] of frame.sensors) hubState.updateSensor(port, kind, values);
};

/**
 * The hub's side of a scene whose physics runs in the worker (sim-session.js, worker
 * mode). The hub state and its motor controller stay here, on the main thread, where
 * the VM reads and writes them synchronously; the worker runs the SAME SimHubBridge
 * against a mirror of the controller and returns one frame per step. replay() then
 * runs the real controller step by step — waits and run-for-degrees promises finish
 * on the step they finish on — and writes each step's frame, checking that the
 * controller commanded exactly the velocity the worker's mirror did.
 */
export class HubReplay {
    /** @param {object} options ... sensors: the worker bridge's sensorReadings() at t = 0 */
    constructor ({hubState, mechanism, hubBody, stepMs = STEP_MS, sensors = []}) {
        if (!mechanism.bodies.some(b => b.id === hubBody)) throw new Error(`unknown hub body '${hubBody}'`);
        this.hubState = hubState;
        this.hubBody = hubBody;
        this.stepMs = stepMs;
        this.accumulator = 0;
        this.previousOwner = plugMotors(hubState, mechanism);
        publishSensors(hubState, sensors);
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
     * Applies a batch of frames, one controller step each. Returns the number of steps
     * whose commanded velocity differed from the worker's (0 unless the two diverged).
     */
    replay (frames) {
        const data = this.hubState.data.motors;
        let diverged = 0;
        for (const frame of frames) {
            this.hubState.stepMotors(this.stepMs);
            if (frame.motors.some(([index, , , cmd]) => (Number(data[index].degPerSec) || 0) !== cmd)) diverged++;
            applyFrame(this.hubState, frame);
        }
        if (frames.length) this.hubState.changed();
        return diverged;
    }

    dispose () {
        this.hubState.clockOwner = this.previousOwner;
    }
}
