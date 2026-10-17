// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Sim Lab with its physics in a Web Worker (ROADMAP §4.9, docs/SIM-LAB-PLAN.md
// "§4.9 The physics worker"). Both sides of one batch live here; physics-host.js
// carries the messages and sim-session.js decides when to send them.
//
// WHO OWNS WHAT. The hub state and its motor controller stay on the main thread:
// the VM reads and writes them synchronously, and a run-for-degrees promise has to
// finish there. The physics core runs in the worker. Within one 5 ms step the two
// are a closed loop (the controller's velocity drives the hinge, the hinge's angle
// is the next step's encoder), so a batch of N steps cannot be split across the
// message boundary without adding a step of latency to every encoder reading.
//
// THE PROTOCOL (one batch = the steps one tick() makes due):
//
//   main → worker   {steps, hub: exportMotorState(hubState)}
//   worker          checkpoint the physics; import the controller state into a
//                   MIRROR hub; run the very same SimHubBridge.step() N times —
//                   controller, hinge targets, physics step, encoders, IMU,
//                   sensor rays — recording each step's FRAME
//   worker → main   {frames, poses after the last step}
//   main            if the controller state is still the one sent: replay — the
//                   REAL controller steps once per frame (its waits and promises
//                   finish on their step), and each frame's encoders, heading,
//                   IMU and sensor readings are written exactly as the in-thread
//                   bridge writes them; then one hubState.changed().
//                   If something changed the controller while the batch was in
//                   flight (the VM set a motor, the drive pad, Pause): ask for the
//                   batch AGAIN from the checkpoint with the new state ({redo}).
//                   In-thread, that command would have reached the controller
//                   before this tick, so the redone batch is what in-thread gives.
//
// So the worker computes exactly the in-thread sequence of operations, on the
// same numbers: the results are bit-identical (test/bw-sim-physics-worker-session.test.mjs).
// The cost is one round trip of latency between a tick and its result reaching the
// hub and the view — the clock the hub and the VM see does not advance meanwhile.

import VirtualSpikeHubState from '../../virtual-hub/spike-hub-state.js';
import {SimHubBridge} from '../hub-bridge.js';

/**
 * Everything the hub's motor controller reads when it steps, as plain data
 * (structured-clone safe: the controllers' promise resolvers are left out —
 * they decide nothing about the motion).
 */
export const exportMotorState = hubState => {
    const backend = hubState.backend;
    return {
        clockOwner: hubState.clockOwner,
        simulatedMs: backend.simulatedMs,
        remainder: backend._remainder,
        disposed: backend._disposed,
        controllers: backend._controllers.map(({resolve, ...c}) => structuredClone(c)),
        motors: structuredClone(hubState.data.motors),
        sensors: structuredClone(hubState.data.sensors),
        classicPorts: structuredClone(hubState.data.classicPorts)
    };
};

/** A comparable key for exportMotorState: equal keys step the controller identically. */
export const motorStateKey = state => JSON.stringify(state);

/** Puts an exported controller state into a (mirror) hub, in place. */
export const importMotorState = (hubState, state) => {
    const backend = hubState.backend;
    hubState.clockOwner = state.clockOwner;
    backend.simulatedMs = state.simulatedMs;
    backend._remainder = state.remainder;
    backend._disposed = state.disposed;
    state.controllers.forEach((c, i) => {
        backend._controllers[i] = {...structuredClone(c), resolve: null};
    });
    const data = hubState.data;
    for (let i = 0; i < 6; i++) {
        data.motors[i] = structuredClone(state.motors[i]);
        data.sensors[i] = structuredClone(state.sensors[i]);
        data.classicPorts[i] = structuredClone(state.classicPorts[i]);
    }
};

/**
 * Every body's pose and every joint's state, in the core's snapshot order, at full
 * precision (the core's own snapshot() is Float32; the mirror on the main thread
 * answers bodyPose/jointState with the doubles the in-thread core would return).
 */
export const posesOf = (core, mechanism) => {
    const bodies = new Float64Array(mechanism.bodies.length * 7);
    mechanism.bodies.forEach((b, i) => {
        const {position, rotation} = core.bodyPose(b.id);
        bodies.set(position, i * 7);
        bodies.set(rotation, i * 7 + 3);
    });
    const joints = new Float64Array(mechanism.joints.length * 2);
    mechanism.joints.forEach((j, i) => {
        if (j.type !== 'hinge') return;
        const {angle, velocity} = core.jointState(j.id);
        joints[i * 2] = angle;
        joints[i * 2 + 1] = velocity;
    });
    return {t: core.time, bodies, joints};
};

/**
 * The worker's side: one scene, its bridge to a mirror hub, and batches.
 * @param {object} options
 * @param {object} options.J the Jolt namespace
 * @param {Function} options.createPhysicsCore physics/jolt-core.js's
 * @param {object} options.mechanism a CompiledMechanism
 * @param {string|null} options.hubBody the hub's body, or null for a model without a hub
 * @param {number} options.stepMs the fixed step (hub-bridge.js STEP_MS)
 */
export const createSimRunner = ({J, createPhysicsCore, mechanism, hubBody, stepMs}) => {
    const core = createPhysicsCore(J, mechanism, {stepHz: 1000 / stepMs});
    const mirror = hubBody ? new VirtualSpikeHubState() : null;
    const bridge = hubBody ? new SimHubBridge({hubState: mirror, core, mechanism, hubBody, stepMs}) : null;
    let saved = null;
    return {
        core,
        poses: () => posesOf(core, mechanism),
        /**
         * @param {{steps?: number, ticks?: number[], hub?: object, redo?: boolean}} batch
         *        steps (with a hub) or the ticks' ms (without one: the core steps them as the
         *        in-thread session does); redo: from the last batch's checkpoint again
         */
        run ({steps = 0, ticks = [], hub = null, redo = false}) {
            if (redo) {
                core.rollback();
                if (bridge) bridge.restoreState(saved);
            } else {
                core.checkpoint();
                saved = bridge ? bridge.saveState() : null;
            }
            const frames = [];
            if (bridge) {
                importMotorState(mirror, hub);
                for (let i = 0; i < steps; i++) frames.push(bridge.step());
            } else {
                for (const ms of ticks) core.step(ms / 1000);
            }
            return {frames, ...posesOf(core, mechanism)};
        },
        destroy: () => core.destroy()
    };
};

/**
 * The main thread's view of the worker's core: the poses after the last applied
 * batch, through the same calls the in-thread core answers (the 3D view, the pane,
 * the browser gate's instruments). What only the physics can answer — a ray, a
 * step — is not here: those run in the worker, inside the step they belong to.
 */
export class MirrorCore {
    constructor (mechanism, {t, bodies, joints}) {
        this.bodyIds = mechanism.bodies.map(b => b.id);
        this.jointIds = mechanism.joints.map(j => j.id);
        this.bodyIndex = new Map(this.bodyIds.map((id, i) => [id, i]));
        this.jointIndex = new Map(this.jointIds.map((id, i) => [id, i]));
        this.hinges = new Set(mechanism.joints.filter(j => j.type === 'hinge').map(j => j.id));
        this.update({t, bodies, joints});
    }

    update ({t, bodies, joints}) {
        this.t = t;
        this.bodies = bodies;
        this.joints = joints;
    }

    get time () { return this.t; }

    snapshot () {
        return {t: this.t, bodyIds: [...this.bodyIds], jointIds: [...this.jointIds],
            bodies: Float32Array.from(this.bodies), joints: Float32Array.from(this.joints)};
    }

    bodyPose (bodyId) {
        const i = this.bodyIndex.get(bodyId);
        if (i === undefined) throw new Error(`unknown body ${bodyId}`);
        const b = this.bodies;
        return {position: [b[i * 7], b[i * 7 + 1], b[i * 7 + 2]], rotation: [b[i * 7 + 3], b[i * 7 + 4], b[i * 7 + 5], b[i * 7 + 6]]};
    }

    jointState (jointId) {
        const i = this.jointIndex.get(jointId);
        if (i === undefined) throw new Error(`unknown joint ${jointId}`);
        if (!this.hinges.has(jointId)) throw new Error(`joint ${jointId} is not a hinge`);
        return {angle: this.joints[i * 2], velocity: this.joints[i * 2 + 1]};
    }

    castRay () { throw new Error('the physics runs in the worker: rays are cast there, inside the step they belong to'); }

    step () { throw new Error('the physics runs in the worker: SimSession.tick() steps it'); }

    setMotor () { throw new Error('the physics runs in the worker: motors are commanded through the hub'); }

    destroy () {}
}
