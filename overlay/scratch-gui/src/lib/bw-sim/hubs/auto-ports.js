// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Plugging in what a model left unplugged (docs/SIM-LAB.md "Opening models"). A model from
// elsewhere — the LDraw model library, Studio, LDCad — has its motors and sensors but says
// nothing of the hub's ports (that is `0 !BW PORT`, ours), so nothing could drive them: the motor
// mixer, the blocks and the words would find no motor. Each motor or sensor without a port is
// plugged, in the file's order, into the hub's first free port that takes its device class (the
// hub's own port order: A, B, C … for motors, 1, 2, 3, 4 for an NXT's or EV3's sensors), as a
// child plugging in cables would. A model with no hub part gets the Robot Lab's own lab-direct
// hub's ports; with several hubs, a cable goes to the nearest one that has a port for it.
// The model is not changed: the ports go on the run model, and a note says which went where.

import {partHubProfile, partMotorJoint, partSensor, portRefOf, DEFAULT_HUB_PROFILE, HUB_PORTS} from '../contracts.js';
import {deviceModels} from '../devices/catalog.js';

/** The device class a part plugs in as (hubs/hub-profile.js PortSpec.accepts). */
const classOf = meta => {
    const model = meta.device ? deviceModels.get(meta.device) : null;
    if (model) return model.class;
    return partMotorJoint(meta) ? 'motor' : 'sensor-lpf2';
};

/**
 * @param {{parts: object[]}} model
 * @param {Map|object} catalog
 * @param {{has: Function, get: Function}} registry hubs/index.js hubRegistry
 * @returns {{model: object, plugged: {part: string, port: string}[]}} the model with ports (the same object when none was plugged)
 */
export const autoPorts = (model, catalog, registry) => {
    const metaOf = part => (catalog instanceof Map ? catalog.get(part) : catalog?.[part]) || null;
    const hubParts = model.parts.filter(p => partHubProfile(metaOf(p.part)) || metaOf(p.part)?.category === 'hub');
    // Each hub's port list (lab-direct, for a model without one, takes any port: '*'), and what is already in it.
    const hubs = (hubParts.length ? hubParts.map(h => ({part: h, profileId: partHubProfile(metaOf(h.part)) || DEFAULT_HUB_PROFILE}))
        : [{part: null, profileId: 'lab-direct'}]).filter(h => registry.has(h.profileId)).map(h => {
        const any = registry.get(h.profileId).profile.ports.some(s => s.id === '*');
        const ports = any ? [...HUB_PORTS.filter(id => /\d/.test(id)).map(id => ({id, accepts: ['sensor']})),
            ...HUB_PORTS.filter(id => /[A-F]/.test(id)).map(id => ({id, accepts: ['motor', 'sensor']}))]
            : registry.get(h.profileId).profile.ports;
        // A hub's built-in motors (the BOOST Move hub's A and B: its internal joints) have their ports already.
        const builtIn = (h.part ? metaOf(h.part.part)?.internalJoints || [] : []).filter(j => j.actuatedBy === 'built-in' && j.port).map(j => j.port);
        return {...h, any, ports, used: new Set(builtIn)};
    });
    if (!hubs.length) return {model, plugged: []};
    const several = hubs.length > 1;
    const hubOf = ref => (several ? hubs.find(h => h.part && h.part.id === ref.hub) || null : hubs[0]);
    for (const p of model.parts) {
        const ref = portRefOf(p);
        if (!ref) continue;
        const h = hubOf(ref) || (several && !ref.hub ? hubs[0] : null);
        if (h) h.used.add(ref.port);
    }
    // With several hubs a cable goes to the nearest one that has a port for it.
    const dist = (a, b) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : 0);
    const plugged = [];
    const parts = model.parts.map(p => {
        const meta = metaOf(p.part);
        if (!meta || portRefOf(p) || !(partMotorJoint(meta) || partSensor(meta))) return p;
        const cls = classOf(meta);
        const want = partMotorJoint(meta) ? 'motor' : 'sensor';
        for (const h of hubs.slice().sort((a, b) => dist(a.part?.position, p.position) - dist(b.part?.position, p.position))) {
            const spec = h.ports.find(s => !h.used.has(s.id) && (s.accepts.includes(cls) || (h.any && s.accepts.includes(want))));
            if (!spec) continue;
            h.used.add(spec.id);
            plugged.push({part: p.id, port: spec.id, hub: several ? h.part.id : null});
            return {...p, port: several ? {hub: h.part.id, port: spec.id} : spec.id};
        }
        return p;
    });
    return {model: plugged.length ? {...model, parts} : model, plugged};
};
