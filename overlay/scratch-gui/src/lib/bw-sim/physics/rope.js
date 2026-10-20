// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Ropes in the core (kinds/rope.js, architecture M10's v1 approximation). Each rope is a distance
// constraint from its last point (the last sheave, else the drum's centre on its frame) to the
// hook: never longer than the rope's free length, slack allowed (minimum 0). Before every step:
//
//   free = lengthM − r·(θ − θ0) − Σ the other segments, measured where the bodies are now
//
// θ the drum hinge's angle (signed: + winds the rope in), so a motor turning the drum hoists the
// hook and a boom that luffs pays rope out or in. The rope's tension from the last step,
// T = λ / dt, turns back on the drum as a torque T·r against winding (and the opposite on its
// frame), so the motor feels the load. Pure bookkeeping around Jolt; the view draws the rope from
// the same points (view/rope-layer.js).

/** The shortest the free segment gets (m): a hook wound right up to its sheave stops there. */
const MIN_FREE_M = 0.002;

/**
 * @param {object} args
 * @param {object} args.J Jolt
 * @param {object[]} args.couplings the mechanism's 'rope' couplings
 * @param {Map} args.hingeMap the core's hinges (unwrapped angles, local axes)
 * @param {Map} args.jointMap the mechanism's joints by id
 * @param {object} args.bodyInterface
 * @param {(id: string) => object} args.bodyIdOf a mechanism body id → Jolt BodyID
 * @param {(id: string) => object} args.bodyOf a mechanism body id → Jolt Body
 * @param {object} args.physicsSystem
 * @param {object[]} args.allConstraints the core's list (constraints it destroys)
 * @param {number} args.dt the fixed step (s)
 */
export const createRopes = ({J, couplings, hingeMap, jointMap, bodyInterface, bodyIdOf, bodyOf, physicsSystem, allConstraints, dt}) => {
    const worldOf = (p, out = [0, 0, 0]) => {
        const id = bodyIdOf(p.body);
        const pos = bodyInterface.GetPosition(id);
        const rot = bodyInterface.GetRotation(id);
        const r = rotate([rot.GetX(), rot.GetY(), rot.GetZ(), rot.GetW()], p.local);
        out[0] = pos.GetX() + r[0]; out[1] = pos.GetY() + r[1]; out[2] = pos.GetZ() + r[2];
        return out;
    };
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const ropes = couplings.map(c => {
        const anchor = c.points.at(-1);
        const a = worldOf(anchor);
        const h = worldOf(c.hook);
        const ds = new J.DistanceConstraintSettings();
        ds.mSpace = J.EConstraintSpace_WorldSpace;
        const p1 = new J.RVec3(...a);
        const p2 = new J.RVec3(...h);
        ds.mPoint1 = p1;
        ds.mPoint2 = p2;
        ds.mMinDistance = 0;
        ds.mMaxDistance = Math.max(MIN_FREE_M, dist(a, h));
        const constraint = J.castObject(ds.Create(bodyOf(anchor.body), bodyOf(c.hook.body)), J.DistanceConstraint);
        J.destroy(ds); J.destroy(p1); J.destroy(p2);
        physicsSystem.AddConstraint(constraint);
        allConstraints.push(constraint);
        const hinge = c.drumJoint ? hingeMap.get(c.drumJoint) : null;
        const jh = c.drumJoint ? jointMap.get(c.drumJoint) : null;
        // The drum's body and its frame's: the hinge's two sides (drumSign + : the drum is body2).
        const drumBody = jh ? (c.drumSign > 0 ? jh.body2 : jh.body1) : null;
        const frameBody = jh ? (c.drumSign > 0 ? jh.body1 : jh.body2) : null;
        return {c, constraint, hinge, drumBody, frameBody, theta0: hinge ? hinge.unwrapped : 0, free: ds.mMaxDistance};
    });
    const torqueVec = new J.Vec3(0, 0, 0);
    const scratch = [[0, 0, 0], [0, 0, 0]];
    /** The rope's free length now (m), and its tension's torque on the drum. */
    const beforeStep = () => {
        for (const r of ropes) {
            const {c} = r;
            let fixed = 0;
            for (let i = 1; i < c.points.length; i++) fixed += dist(worldOf(c.points[i - 1], scratch[0]), worldOf(c.points[i], scratch[1]));
            const wound = r.hinge ? c.drumSign * (r.hinge.unwrapped - r.theta0) : 0;
            r.free = Math.max(MIN_FREE_M, c.lengthM - c.radiusM * wound - fixed);
            r.constraint.SetDistance(0, r.free);
            if (!r.hinge) continue;
            // Last step's tension against winding: −a·T·r on the drum, +a·T·r on its frame.
            const tension = Math.abs(r.constraint.GetTotalLambdaPosition()) / dt;
            if (!(tension > 0)) continue;
            const rot = bodyInterface.GetRotation(bodyIdOf(r.frameBody));
            const local = c.drumSign > 0 ? r.hinge.localAxis1 : r.hinge.localAxis2;
            const ax = rotate([rot.GetX(), rot.GetY(), rot.GetZ(), rot.GetW()], local).map(v => v * c.drumSign);
            const tau = tension * c.radiusM;
            torqueVec.Set(-ax[0] * tau, -ax[1] * tau, -ax[2] * tau);
            bodyInterface.AddTorque(bodyIdOf(r.drumBody), torqueVec, J.EActivation_Activate);
            torqueVec.Set(ax[0] * tau, ax[1] * tau, ax[2] * tau);
            bodyInterface.AddTorque(bodyIdOf(r.frameBody), torqueVec, J.EActivation_Activate);
        }
    };
    return {
        ropes,
        beforeStep,
        /** Each rope's free length (m) and tension (N) now: for tests and readings. */
        state: () => ropes.map(r => ({free: r.free, tension: Math.abs(r.constraint.GetTotalLambdaPosition()) / dt})),
        registrant: {
            save: () => ropes.map(r => [r.theta0, r.free]),
            restore: saved => ropes.forEach((r, i) => { [r.theta0, r.free] = saved[i]; r.constraint.SetDistance(0, r.free); })
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
