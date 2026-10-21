// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Rolling resistance (contracts.js MATERIALS: a LEGO tyre on a mat c_rr 0.02, a tread 0.05). A rolling
// tyre's contact patch pushes back a little ahead of the axle: the floor's normal force N acts c_rr·r in
// front of the contact point, a torque c_rr·N·r against the wheel's roll, and the tyre's grip turns it
// into the drag c_rr·N on the vehicle. The same torque, as static friction, holds a parked wheel on a
// slope up to tan α = c_rr. Jolt has no rolling friction; here it is, before every step:
//
//   - a wheel whose hinge's motor is OFF (a free wheel, a coasting motor): the hinge's friction torque
//     (Jolt's mMaxFrictionTorque, a velocity constraint bounded by the torque: Coulomb friction, solved
//     implicitly) is set to its own bearing friction + c_rr·N·r. It slows a rolling wheel by up to that
//     torque and holds a resting one against anything less: it stops, never turns back, and parks on a
//     gentle slope. The torque acts between the wheel and its axle's frame (the chassis): for the
//     vehicle that is the floor's drag all the same (the chassis feels it as a pitch couple, c_rr·N·r);
//   - a wheel its motor drives (velocity, position, torque, brake: Jolt ignores hinge friction then):
//     an external torque c_rr·N·r against its roll, no more than the wheel's own inertia can absorb in
//     a step (I·|ω|/dt), so it never turns it back. The motor carries it.
//
// Which bodies: every dynamic body with a `rollingResistance` (mech/islands.js: its grippiest part is
// rubber; mech/compile.js: a tread's sprockets) that turns on a hinge and has a cylinder coaxial with
// it (the tyre, the tread's outer face): r is the largest such cylinder's reach from the axis.
//
// N, the load on the tyre, is the rest of the wheel's vertical balance over the last step: the floor
// pushes up whatever its weight and its vertical acceleration need that its axle does not give,
// N = m·(g + a·up) − F·up, with F the force its joints put on it (the previous step's constraint
// impulses, HingeConstraint.GetTotalLambdaPosition: the impulse on body 2, −that on body 1) and a its
// velocity change over that step. A wheel in the air hangs on its axle or falls with it (N = 0); a
// loaded one carries its share of the chassis, load transfer and bumps included.

/**
 * @param {object} o
 * @param {object} o.J the Jolt namespace
 * @param {object} o.mechanism the v2 mechanism
 * @param {Map} o.bodyMap mechanism body id → {body, bodyID, motionType}
 * @param {Map} o.hingeMap joint id → the core's hinge entry ({hinge, mode, frictionNm, coastFrictionNm?})
 * @param {object} o.bodyInterface
 * @param {number} o.dt the fixed step (s)
 * @param {(mp: object) => number[][]} o.inertiaOf a body's body-space inertia tensor
 * @returns {{wheels: object[], apply: () => void, registrant: object, destroy: () => void}|null}
 */
export const createRollingResistance = ({J, mechanism, bodyMap, hingeMap, bodyInterface, dt, inertiaOf}) => {
    const g = mechanism.gravity;
    const gLen = Math.hypot(...g);
    if (!(gLen > 0)) return null;
    const up = g.map(v => -v / gLen);
    const wheels = [];
    for (const b of mechanism.bodies) {
        if (!(b.rollingResistance > 0) || b.motion !== 'dynamic') continue;
        const e = bodyMap.get(b.id);
        if (!e) continue;
        const touching = [];
        let axle = null;
        for (const [id, h] of hingeMap) {
            const j = mechanism.joints.find(x => x.id === id);
            if (!j || (j.body1 !== b.id && j.body2 !== b.id)) continue;
            touching.push({h, sign: j.body2 === b.id ? 1 : -1});
            if (!axle && rollingRadius(b, j) > 0) axle = {j, h, local: j.body2 === b.id ? h.localAxis2 : h.localAxis1};
        }
        if (!axle) continue;
        const radius = rollingRadius(b, axle.j);
        const n = Math.hypot(...axle.local);
        wheels.push({id: b.id, e, crr: b.rollingResistance, mass: b.massKg, radius, hinge: axle.h,
            localAxis: axle.local.map(v => v / n), touching, load: 0, vUp: null});
    }
    if (!wheels.length) return null;
    const torque = new J.Vec3(0, 0, 0);
    const loadOf = w => {
        let up2 = 0;
        for (const {h, sign} of w.touching) {
            const l = h.hinge.GetTotalLambdaPosition();
            up2 += sign * (l.GetX() * up[0] + l.GetY() * up[1] + l.GetZ() * up[2]);
        }
        const v = bodyInterface.GetLinearVelocity(w.e.bodyID);
        const vUp = v.GetX() * up[0] + v.GetY() * up[1] + v.GetZ() * up[2];
        const aUp = w.vUp === null ? 0 : (vUp - w.vUp) / dt;
        w.vUp = vUp;
        return Math.max(0, w.mass * (gLen + aUp) - up2 / dt);
    };
    /** The external torque on a driven wheel (see the header). */
    const drivenTorque = (w, tauMax) => {
        const r = bodyInterface.GetRotation(w.e.bodyID);
        const a = rotate([r.GetX(), r.GetY(), r.GetZ(), r.GetW()], w.localAxis);
        const wv = bodyInterface.GetAngularVelocity(w.e.bodyID);
        const omega = wv.GetX() * a[0] + wv.GetY() * a[1] + wv.GetZ() * a[2];
        if (omega === 0) return;
        const T = inertiaOf(w.e.body.GetMotionProperties());
        const la = w.localAxis;
        const Ia = la.reduce((s, x, row) => s + x * la.reduce((s2, y, k) => s2 + T[row][k] * y, 0), 0);
        const tau = Math.min(tauMax, Ia * Math.abs(omega) / dt) * -Math.sign(omega);
        torque.Set(a[0] * tau, a[1] * tau, a[2] * tau);
        bodyInterface.AddTorque(w.e.bodyID, torque, J.EActivation_Activate);
    };
    return {
        wheels,
        apply () {
            for (const w of wheels) {
                w.load = loadOf(w);
                const tauMax = w.crr * w.load * w.radius;
                const h = w.hinge;
                if (h.mode === 'coast') {
                    const base = typeof h.coastFrictionNm === 'number' ? h.coastFrictionNm : h.frictionNm;
                    h.hinge.SetMaxFrictionTorque(base + tauMax);
                } else if (tauMax > 0) drivenTorque(w, tauMax);
            }
        },
        /** The core's checkpoint (state-registry.js): each wheel's last vertical speed and load. */
        registrant: {
            save: () => wheels.map(w => [w.vUp, w.load]),
            restore: saved => wheels.forEach((w, i) => { [w.vUp, w.load] = saved[i]; })
        },
        destroy () { J.destroy(torque); }
    };
};

/** The reach of the body's colliders that are cylinders coaxial with the joint's axis (m): the tyre. */
export const rollingRadius = (b, j) => {
    const n = Math.hypot(...j.axis);
    const axis = j.axis.map(v => v / n);
    let r = 0;
    for (const c of b.colliders) {
        if (c.shape !== 'cylinder') continue;
        const cAxis = rotate(b.rotation, rotate(c.rotation || [0, 0, 0, 1], [0, 1, 0]));
        if (Math.abs(cAxis[0] * axis[0] + cAxis[1] * axis[1] + cAxis[2] * axis[2]) < 0.99) continue;
        const centre = rotate(b.rotation, c.position || [0, 0, 0]).map((v, i) => v + b.position[i] - j.point[i]);
        const along = centre[0] * axis[0] + centre[1] * axis[1] + centre[2] * axis[2];
        const radial = Math.hypot(centre[0] - along * axis[0], centre[1] - along * axis[1], centre[2] - along * axis[2]);
        r = Math.max(r, radial + c.radius);
    }
    return r;
};

const rotate = (q, v) => {
    const [qx, qy, qz, qw] = q;
    const cx = qy * v[2] - qz * v[1];
    const cy = qz * v[0] - qx * v[2];
    const cz = qx * v[1] - qy * v[0];
    const ix = cx + qw * v[0];
    const iy = cy + qw * v[1];
    const iz = cz + qw * v[2];
    return [v[0] + 2 * (qy * iz - qz * iy), v[1] + 2 * (qz * ix - qx * iz), v[2] + 2 * (qx * iy - qy * ix)];
};
