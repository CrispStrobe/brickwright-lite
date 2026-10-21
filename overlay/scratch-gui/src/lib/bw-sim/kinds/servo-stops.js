// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// A servo motor's end stops (the Power Functions servo 88004, LDraw 99498: its output turns at most
// 90° either way from the centre it is built in at). The part says so on its internal joint
// (PartMeta v2 internalJoints[].limitsDeg: [min, max] degrees from the start pose); this module
// (emits no coupling) hands them to the compiler as the motorised hinge's `limits`, which the core
// turns into the hinge's end stops — a motor driven past them stalls there (as on any limited hinge).
//
// Added, not edited into mech/ (kinds/index.js: kinds are added, never edited).

const DEG = Math.PI / 180;

/** The internal joint a motor-internal edge's moving node is (its suffix after the part id), or null. */
const internalJointOf = (meta, nodeId, partId) => {
    const suffix = nodeId.slice(partId.length);
    const joints = Array.isArray(meta?.internalJoints) ? meta.internalJoints : [];
    if (suffix === '#out') return joints.find(j => j && j.actuatedBy === 'device') || null;
    const m = /^#(?:out|free)-(.+)$/.exec(suffix);
    return m ? joints.find(j => j && j.id === m[1]) || null : null;
};

export const SERVO_STOPS = {
    id: 'servo-stops',
    kind: 'servo-stops',
    detect ({nodes, jointEntries}) {
        const limits = [];
        for (const {joint, members} of jointEntries || []) {
            if (joint.type !== 'hinge') continue;
            const edge = (members || []).map(m => m.edge).find(e => e && e._isMotorInternal);
            if (!edge) continue;
            const node = nodes.get(edge._bNode);
            if (!node) continue;
            const ij = internalJointOf(node.meta, edge._bNode, node.partId);
            const deg = ij && ij.limitsDeg;
            if (!Array.isArray(deg) || deg.length !== 2 || !(deg[0] <= 0 && deg[1] >= 0)) continue;
            limits.push({joint: joint.id, limits: [Math.max(-180, deg[0]) * DEG, Math.min(180, deg[1]) * DEG]});
        }
        return {limits};
    }
};
