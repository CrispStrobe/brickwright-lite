// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Rolling resistance (contracts.js MATERIALS: a LEGO tyre on a mat, c_rr 0.02). A rolling tyre's
// contact patch pushes back a little ahead of the axle: the floor's normal force N acts c_rr·r in front
// of the contact point, a torque c_rr·N·r against the wheel's roll. Jolt has no rolling friction, so it
// is that torque here, applied to the wheel's body before every step (a torque from the floor: nothing
// on the chassis), and the tyre's grip turns it into the drag c_rr·N on the vehicle.
//
// Which bodies: every dynamic body with a `rollingResistance` (mech/islands.js: its grippiest part is
// rubber) that turns on a hinge and has a cylinder coaxial with it (the tyre): r is the largest such
// cylinder's reach from the axis, the axle that hinge's.
//
// N, the load on the tyre, is the rest of the wheel's vertical balance over the last step: the floor
// pushes up whatever its weight and its vertical acceleration need that its axle does not give,
// N = m·(g + a·up) − F·up, with F the force its joints put on it (the previous step's constraint
// impulses, HingeConstraint.GetTotalLambdaPosition: the impulse on body 2, −that on body 1) and a its
// velocity change over that step. A wheel in the air hangs on its axle or falls with it (N = 0); a
// loaded one carries its share of the chassis, load transfer and bumps included.
//
// Near a stop the torque is no more than the wheel's own inertia can absorb in one step
// (I·|ω|/dt), so it brings the wheel to rest and never turns it backwards. Not modelled: rolling
// resistance holding a wheel on a slope at rest (static), and a tread's (its links are drawn only).

/**
 * @param {object} o
 * @param {object} o.J the Jolt namespace
 * @param {object} o.mechanism the v2 mechanism
 * @param {Map} o.bodyMap mechanism body id → {body, bodyID, motionType}
 * @param {Map} o.hingeMap joint id → the core's hinge entry
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
            if (!axle) axle = {j, local: j.body2 === b.id ? h.localAxis2 : h.localAxis1};
        }
        if (!axle) continue;
        const radius = rollingRadius(b, axle.j);
        if (!(radius > 0)) continue;
        const n = Math.hypot(...axle.local);
        wheels.push({id: b.id, e, crr: b.rollingResistance, mass: b.massKg, radius,
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
    return {
        wheels,
        /** The core's checkpoint (state-registry.js): each wheel's last vertical speed and load. */
        registrant: {
            save: () => wheels.map(w => [w.vUp, w.load]),
            restore: saved => wheels.forEach((w, i) => { [w.vUp, w.load] = saved[i]; })
        },
        apply () {
            for (const w of wheels) {
                w.load = loadOf(w);
                if (!(w.load > 0)) continue;
                const r = bodyInterface.GetRotation(w.e.bodyID);
                const q = [r.GetX(), r.GetY(), r.GetZ(), r.GetW()];
                const a = rotate(q, w.localAxis);
                const wv = bodyInterface.GetAngularVelocity(w.e.bodyID);
                const omega = wv.GetX() * a[0] + wv.GetY() * a[1] + wv.GetZ() * a[2];
                if (omega === 0) continue;
                const T = inertiaOf(w.e.body.GetMotionProperties());
                const la = w.localAxis;
                const Ia = la.reduce((s, x, row) => s + x * la.reduce((s2, y, k) => s2 + T[row][k] * y, 0), 0);
                const tau = Math.min(w.crr * w.load * w.radius, Ia * Math.abs(omega) / dt) * -Math.sign(omega);
                torque.Set(a[0] * tau, a[1] * tau, a[2] * tau);
                bodyInterface.AddTorque(w.e.bodyID, torque, J.EActivation_Activate);
            }
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
