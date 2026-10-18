// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The physics of a 'screw' coupling (kinds/screw.js has the mechanics): a linear actuator's
// spindle turning on a hinge in the actuator's body drives its piston's slider,
//     x = x0 + ratio · (θ − θ0)        (θ the hinge's RELATIVE angle, x the slider's position)
//
// Why not Jolt's RackAndPinionConstraint (kinds/rack.js uses it): it couples the pinion's and
// the rack's WORLD rates, which is exact only while the frame holding both does not move. An
// excavator's stick actuator is carried by the boom: when the boom swings, the actuator's body
// moves along its own axis, and a world-rate coupling would push the piston along by that
// motion. The actuator's slider is driven here by its own MOTOR, which acts between the
// slider's two bodies (relative), in velocity mode each step:
//     v_target = ratio · ω_hinge + (x* − x) / τ,      x* = x0 + ratio · (θ − θ0)
// (the second term pulls back the drift of the velocity solve, τ = 1/KP), with the motor's force
// limited to the clutch force. That gives the three behaviours of the real part:
//   - self-locking: while the spindle stands still the motor holds the piston where it is
//     against any load up to the clutch force — nothing turns the spindle back;
//   - the slip clutch: a load above the clutch force, or an end stop (the slider's limits, the
//     nut at the end of the thread), stops the piston while the spindle turns on: when x* runs
//     more than SLIP_M ahead of x, the clutch has slipped and x0 follows (the spindle's angle
//     and the piston's position are re-paired);
//   - the load on the input: the force the motor applied in the last step, F, costs the spindle
//     a torque |F| · |ratio| / η against its turning (η the thread's efficiency), applied to the
//     spindle's body (and back on the actuator's body): the motor that drives the spindle,
//     through whatever gears, feels the load (one step late: explicit, as the core's other
//     per-step couplings; the reduction through the thread keeps it small).

const KP_PER_STEP = 0.2;
/** How far the spindle may run ahead of the piston before the clutch counts as slipped (m). */
export const SLIP_M = 0.0002;
/** Below this spindle speed the load torque fades out (rad/s): a held spindle feels none (self-locking). */
const OMEGA_SMOOTH = 0.5;

/**
 * @param {object} args
 * @param {object} args.J the Jolt namespace
 * @param {object[]} args.couplings the mechanism's 'screw' couplings
 * @param {Map} args.hingeMap the core's hinge entries
 * @param {Map} args.sliderMap the core's slider entries
 * @param {Map} args.jointMap joint id → compiled joint
 * @param {object} args.bodyInterface Jolt's body interface
 * @param {(id: string) => object|null} args.bodyIdOf a body id → its Jolt BodyID (null for 'world' or static)
 * @param {number} args.dt the fixed step (s)
 * @returns {{beforeStep(): void, registrant: {save(): any, restore(saved: any): void}, drives: object[]}}
 */
export const createScrewDrives = ({J, couplings, hingeMap, sliderMap, jointMap, bodyInterface, bodyIdOf, dt}) => {
    const drives = couplings.map(c => {
        const h = hingeMap.get(c.hingeJoint);
        const s = sliderMap.get(c.sliderJoint);
        const jh = jointMap.get(c.hingeJoint);
        const js = jointMap.get(c.sliderJoint);
        if (!h || !s || !jh || !js) throw new Error(`screw ${c.id}: its hinge and slider must exist`);
        // The spindle is the hinge's body not shared with the slider; its signed axis (+ on body2).
        const frame = [jh.body1, jh.body2].find(b => b === js.body1 || b === js.body2);
        const spindleIsBody2 = jh.body2 !== frame;
        const ms = s.slider.GetMotorSettings();
        ms.mMinForceLimit = -c.clutchForceN;
        ms.mMaxForceLimit = c.clutchForceN;
        s.maxForce = c.clutchForceN;
        s.mode = 'screw';
        s.slider.SetMotorState(J.EMotorState_Velocity);
        s.slider.SetTargetVelocity(0);
        return {c, h, s, x0: s.position, theta0: h.unwrapped, spindle: bodyIdOf(spindleIsBody2 ? jh.body2 : jh.body1),
            frame: bodyIdOf(spindleIsBody2 ? jh.body1 : jh.body2), sign: spindleIsBody2 ? 1 : -1, slips: 0};
    });
    const torqueVec = new J.Vec3(0, 0, 0);
    const beforeStep = () => {
        for (const d of drives) {
            const {c, h, s} = d;
            let err = d.x0 + c.ratio * (h.unwrapped - d.theta0) - s.position;
            if (Math.abs(err) > SLIP_M) {
                // The clutch slipped (an end stop, or a load above the clutch force): re-pair.
                const excess = err - Math.sign(err) * SLIP_M;
                d.x0 -= excess;
                err -= excess;
                d.slips += 1;
            }
            s.slider.SetTargetVelocity(c.ratio * h.velocity + err * KP_PER_STEP / dt);
            if (s.slider.GetMotorState() !== J.EMotorState_Velocity) s.slider.SetMotorState(J.EMotorState_Velocity);
            // The thread's load on the spindle, from the force the slider's motor applied last step.
            const force = Math.abs(s.slider.GetTotalLambdaMotor()) / dt;
            const fade = Math.max(-1, Math.min(1, h.velocity / OMEGA_SMOOTH));
            const tau = -fade * force * Math.abs(c.ratio) / c.efficiency;
            if (tau === 0) continue;
            // The hinge axis in the world now (as the core measures it), signed for the spindle's side.
            const rot = bodyInterface.GetRotation(d.frame || d.spindle);
            const q = [rot.GetX(), rot.GetY(), rot.GetZ(), rot.GetW()];
            const local = d.frame ? (d.sign > 0 ? h.localAxis1 : h.localAxis2) : (d.sign > 0 ? h.localAxis2 : h.localAxis1);
            const a = rotate(q, local).map(v => v * d.sign);
            if (d.spindle) {
                torqueVec.Set(a[0] * tau, a[1] * tau, a[2] * tau);
                bodyInterface.AddTorque(d.spindle, torqueVec, J.EActivation_Activate);
            }
            if (d.frame) {
                torqueVec.Set(-a[0] * tau, -a[1] * tau, -a[2] * tau);
                bodyInterface.AddTorque(d.frame, torqueVec, J.EActivation_Activate);
            }
        }
    };
    return {
        drives,
        beforeStep,
        registrant: {
            save: () => drives.map(d => [d.x0, d.theta0, d.slips]),
            restore: saved => drives.forEach((d, i) => { [d.x0, d.theta0, d.slips] = saved[i]; })
        },
        destroy: () => J.destroy(torqueVec)
    };
};

/** Rotate v by the unit quaternion [x, y, z, w]. */
const rotate = ([x, y, z, w], v) => {
    const cx = y * v[2] - z * v[1];
    const cy = z * v[0] - x * v[2];
    const cz = x * v[1] - y * v[0];
    const ix = cx + w * v[0];
    const iy = cy + w * v[1];
    const iz = cz + w * v[2];
    return [v[0] + 2 * (y * iz - z * iy), v[1] + 2 * (z * ix - x * iz), v[2] + 2 * (x * iy - y * ix)];
};
