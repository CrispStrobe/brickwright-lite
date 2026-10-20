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
// hub's ports. A model with two hubs is left as it is (which hub a cable goes to is the builder's).
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
    const hubs = model.parts.filter(p => partHubProfile(metaOf(p.part)) || metaOf(p.part)?.category === 'hub');
    if (hubs.length > 1) return {model, plugged: []};
    const profileId = hubs.length ? (partHubProfile(metaOf(hubs[0].part)) || DEFAULT_HUB_PROFILE) : 'lab-direct';
    if (!registry.has(profileId)) return {model, plugged: []};
    // lab-direct takes any port ('*'): the names a model file can give, motors on A–F, sensors on 1–4 first.
    const any = registry.get(profileId).profile.ports.some(s => s.id === '*');
    const ports = any ? [...HUB_PORTS.filter(id => /\d/.test(id)).map(id => ({id, accepts: ['sensor']})),
        ...HUB_PORTS.filter(id => /[A-F]/.test(id)).map(id => ({id, accepts: ['motor', 'sensor']}))]
        : registry.get(profileId).profile.ports;
    const used = new Set(model.parts.map(p => portRefOf(p)?.port).filter(Boolean));
    const plugged = [];
    const parts = model.parts.map(p => {
        const meta = metaOf(p.part);
        if (!meta || portRefOf(p) || !(partMotorJoint(meta) || partSensor(meta))) return p;
        const cls = classOf(meta);
        const spec = ports.find(s => !used.has(s.id) && (s.accepts.includes(cls) ||
            (any && s.accepts.includes(partMotorJoint(meta) ? 'motor' : 'sensor'))));
        if (!spec) return p;
        used.add(spec.id);
        plugged.push({part: p.id, port: spec.id});
        return {...p, port: spec.id};
    });
    return {model: plugged.length ? {...model, parts} : model, plugged};
};
