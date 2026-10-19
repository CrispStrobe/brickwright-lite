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
// motion. Here everything is relative to the actuator's body. Each step:
//   - the slider's LIMITS are pinned to x* = x0 + ratio · (θ − θ0), ± 1 µm: Jolt solves limits as
//     hard constraints at the velocity and the position level, so the piston stays where the
//     thread puts it (a velocity motor alone let a loaded arm drift and, with the drift pulled back
//     by a gain, oscillate: measured on the excavator, ±2 mm at rest);
//   - the slider's motor runs at the thread's speed, ratio · ω (force-limited to the clutch force),
//     so the limits only have to correct the drift.
// That gives the three behaviours of the real part:
//   - self-locking: while the spindle stands still the piston is held where it is against any
//     load up to the clutch force — nothing turns the spindle back;
//   - the slip clutch: a load that stays above the clutch force (averaged over CLUTCH_TAU_S: one
//     step's impulse is no load) moves the piston, and the thread re-pairs where it went; at an
//     end stop (the joint's limits: the nut at the end of the thread) x* stops there while the
//     spindle turns on;
//   - the load on the input: the force that held the piston in the last step, F, costs the spindle
//     a torque |F| · |ratio| / η against its turning (η the thread's efficiency), applied to the
//     spindle's body (and back on the actuator's body): the motor that drives the spindle,
//     through whatever gears, feels the load (one step late: explicit, as the core's other
//     per-step couplings; the reduction through the thread keeps it small).

/** Below this spindle speed the load torque fades out (rad/s): a held spindle feels none (self-locking). */
const OMEGA_SMOOTH = 0.5;
/** Solver iterations for an island holding an actuator (see createScrewDrives). */
export const SCREW_VELOCITY_STEPS = 60;
export const SCREW_POSITION_STEPS = 10;
/** The least mass the solver sees for an actuator's parts (kg; see floorMass). */
export const SCREW_MIN_MASS_KG = 0.02;
/** Half the window the piston is held in (m): a hard pair of limits this close. */
const HOLD_M = 0.000001;
/** How long a load must last to slip the clutch (s): its average over this time is what counts. */
const CLUTCH_TAU_S = 0.05;

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
export const createScrewDrives = ({J, couplings, hingeMap, sliderMap, jointMap, bodyInterface, bodyIdOf, bodyOf = () => null, dt}) => {
    /**
     * The solver's mass for an actuator's light parts and the light parts hinged to them. The piston (0.4 g) sits between the slider's
     * hard limits and the hinge to a boom of 40–150 g: Jolt's iterative solve gives way at the light
     * body, and the piston's hinge to the boom opened by 3 mm under the Excavator's arm (measured;
     * the arm then did not follow its actuator back). A body lighter than SCREW_MIN_MASS_KG is given
     * that mass (and its inertia scaled with it) with its GRAVITY FACTOR scaled down by the same
     * ratio, so its weight is still its own: a numerical floor like the core's GEAR_MIN_INERTIA,
     * which only makes the light part slower to accelerate on its own (the actuator moves at the
     * thread's speed, which no motor-driven arm notices).
     */
    const floored = new Set();
    const floorMass = id => {
        const body = id && !floored.has(id) ? bodyOf(id) : null;
        if (!body) return;
        floored.add(id);
        const mp = body.GetMotionProperties();
        const inv = mp.GetInverseMass();
        if (!(inv > 0) || 1 / inv >= SCREW_MIN_MASS_KG) return;
        const k = SCREW_MIN_MASS_KG * inv;
        mp.ScaleToMass(SCREW_MIN_MASS_KG);
        mp.SetGravityFactor(mp.GetGravityFactor() / k);
    };
    const drives = couplings.map(c => {
        const h = hingeMap.get(c.hingeJoint);
        const s = sliderMap.get(c.sliderJoint);
        const jh = jointMap.get(c.hingeJoint);
        const js = jointMap.get(c.sliderJoint);
        if (!h || !s || !jh || !js) throw new Error(`screw ${c.id}: its hinge and slider must exist`);
        // The actuator's parts and what they are hinged to (its pivot axle, the pins at its ends).
        const own = [js.body1, js.body2, jh.body1, jh.body2];
        for (const b of own) floorMass(b);
        for (const j of jointMap.values()) if (own.includes(j.body1) || own.includes(j.body2)) { floorMass(j.body1); floorMass(j.body2); }
        // The spindle is the hinge's body not shared with the slider; its signed axis (+ on body2).
        const frame = [jh.body1, jh.body2].find(b => b === js.body1 || b === js.body2);
        const spindleIsBody2 = jh.body2 !== frame;
        const ms = s.slider.GetMotorSettings();
        ms.mMinForceLimit = -c.clutchForceN;
        ms.mMaxForceLimit = c.clutchForceN;
        s.maxForce = c.clutchForceN;
        s.mode = 'screw';
        // The piston is held where the thread puts it by the slider's limits, pinned every step; its
        // motor runs at the thread's speed (beforeStep).
        s.slider.SetMotorState(J.EMotorState_Velocity);
        s.slider.SetLimits(s.position - HOLD_M, s.position + HOLD_M);
        // An actuator works in a closed loop (frame – boom – actuator, through light pins and axles):
        // Jolt's default 10 velocity / 2 position iterations let that loop sag and the transient
        // forces slip the clutch (measured: a 5 g boom at rest slipped it 8.5 mm, to the end of the
        // stroke). Jolt solves an island with the largest override of its constraints.
        s.constraint.SetNumVelocityStepsOverride(SCREW_VELOCITY_STEPS);
        s.constraint.SetNumPositionStepsOverride(SCREW_POSITION_STEPS);
        return {c, h, s, x0: s.position, limits: js.limits || [-Infinity, Infinity], theta0: h.unwrapped, spindle: bodyIdOf(spindleIsBody2 ? jh.body2 : jh.body1),
            frame: bodyIdOf(spindleIsBody2 ? jh.body1 : jh.body2), sign: spindleIsBody2 ? 1 : -1, slips: 0, load: 0};
    });
    const torqueVec = new J.Vec3(0, 0, 0);
    const beforeStep = () => {
        for (const d of drives) {
            const {c, h, s} = d;
            // The force that held the piston in the last step (N): the limits' and the motor's impulse over the step.
            const force = Math.abs(s.slider.GetTotalLambdaPositionLimits() + s.slider.GetTotalLambdaMotor()) / dt;
            let target = d.x0 + c.ratio * (h.unwrapped - d.theta0);
            // The slip clutch: above its force the piston gives way — it stays where the load pushed it
            // and the thread re-pairs there; at an end stop the spindle turns on, the piston stays.
            // A clutch slips under a load it carries, not under one step's impulse (Jolt's first steps
            // under gravity carry spikes of several times the weight): the force averaged over CLUTCH_TAU_S.
            d.load += (force - d.load) * Math.min(1, dt / CLUTCH_TAU_S);
            if (d.load > c.clutchForceN) {
                d.x0 += s.position - target;
                target = s.position;
                d.slips += 1;
            }
            if (target > d.limits[1] || target < d.limits[0]) {
                const end = Math.min(d.limits[1], Math.max(d.limits[0], target));
                d.x0 += end - target;
                target = end;
            }
            s.slider.SetLimits(target - HOLD_M, target + HOLD_M);
            // ...and its motor moves it at the thread's speed (the limits then only correct the drift).
            s.slider.SetTargetVelocity(c.ratio * h.velocity);
            // The thread's load on the spindle, from that force.
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
            save: () => drives.map(d => [d.x0, d.theta0, d.slips, d.load]),
            restore: saved => drives.forEach((d, i) => { [d.x0, d.theta0, d.slips, d.load] = saved[i]; })
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
