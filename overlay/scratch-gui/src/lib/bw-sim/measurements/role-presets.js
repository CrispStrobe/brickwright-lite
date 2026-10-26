// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Structural measurement packs only. These describe compiled roles, not laws.
import {sha256Text} from './binding-digest.js';

const MAX_PACKS = 256;
const MAX_PACK_DEFINITIONS = 4;
const copy = value => Array.isArray(value) ? value.slice() : [];
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[\u0000-\u001f\u007f]/.test(value);
const validText = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const words = locale => locale === 'de' ? {
    motor: port => `Motor ${port}`,
    motorTitle: port => `Motor ${port}: Messreihe`,
    motorHelp: 'Winkel, Geschwindigkeit, Drehmoment und Leistung des eindeutig zugeordneten Motor-Gelenks.',
    angle: 'Winkel', speed: 'Winkelgeschwindigkeit', torque: 'Motordrehmoment', power: 'Motorleistung',
    slider: parts => `Schieber · ${parts}`, sliderTitle: parts => `Schieber: ${parts}`,
    sliderHelp: 'Weg und verfügbare Antriebs- und Anschlagwerte des eindeutig gebundenen Schieber-Gelenks.',
    travel: 'Schieberweg', motorForce: 'Motor-Schubkraft', limitForce: 'Anschlagkraft', sliderPower: 'Schieberleistung',
    springsTitle: 'Feder-Schieberwege', springsHelp: 'Weg der eindeutig gebundenen Schieber mit Feder.',
    ropeTitle: parts => `Seilzug · ${parts}`, ropeHelp: 'Zugkraft der eindeutig gebundenen Seilkupplung.', tension: 'Seilzugkraft',
    pressureTitle: part => `Netzdruck · ${part}`, pressureHelp: 'Druck des eindeutig zugeordneten Pneumatiknetzes.', pressure: 'Manometerdruck'
} : {
    motor: port => `Motor ${port}`,
    motorTitle: port => `Motor ${port} readings`,
    motorHelp: 'Angle, speed, torque and power from the uniquely bound motor hinge.',
    angle: 'Angle', speed: 'Angular speed', torque: 'Motor torque', power: 'Motor power',
    slider: parts => `Slider · ${parts}`, sliderTitle: parts => `Slider readings: ${parts}`,
    sliderHelp: 'Travel and available drive/limit readings from the uniquely bound slider joint.',
    travel: 'Slider travel', motorForce: 'Slider motor force', limitForce: 'Slider limit force', sliderPower: 'Slider power',
    springsTitle: 'Spring-slider travel', springsHelp: 'Travel of uniquely bound slider joints with a spring.',
    ropeTitle: parts => `Rope tension · ${parts}`, ropeHelp: 'Tension from the uniquely bound rope coupling.', tension: 'Rope tension',
    pressureTitle: part => `Network pressure · ${part}`, pressureHelp: 'Pressure from the uniquely identified pneumatic network.', pressure: 'Gauge pressure'
};

const sortedUnique = values => [...new Set(values)].sort((a, b) => a.localeCompare(b));
const membership = (mechanism, modelPartIds, partBodyCounts, joint) => {
    if (!joint || !validId(joint.id) || !validId(joint.body1) || !validId(joint.body2) || joint.body1 === joint.body2) return null;
    const bodies = mechanism.bodies.filter(body => body.id === joint.body1 || body.id === joint.body2);
    if (bodies.length !== 2 || new Set(bodies.map(body => body.id)).size !== 2) return null;
    const members = bodies.map(body => sortedUnique(copy(body.parts).filter(id => modelPartIds.has(id))));
    if (members.some(parts => !parts.length || parts.some(id => partBodyCounts.get(id)?.size !== 1))) return null;
    return {members, parts: sortedUnique(members.flat())};
};
const packId = (prefix, identity) => `${prefix}-${sha256Text(identity).slice(0, 24)}`;
// Same canonical identities as readings.js, kept local to avoid loading the
// simulation reader/compiler dependency graph when enumerating preset choices.
const jointBinding = (mechanism, joint) => {
    const legacy = JSON.stringify([joint.type, ...[joint.body1, joint.body2].map(id =>
        mechanism.bodies.find(body => body.id === id)?.parts?.slice().sort() || [id])]);
    return `sha256:${sha256Text(legacy)}`;
};
const ropeBinding = rope => `sha256:${sha256Text(JSON.stringify(rope.parts || []))}`;
const definition = (id, kind, label, joint, binding) => ({id, kind, label, visible: true, joint: joint.id, binding});
const makePack = (id, title, help, definitions) => validText(id, 128) && validText(title, 160) && validText(help, 240) &&
    definitions.length > 0 && definitions.length <= MAX_PACK_DEFINITIONS &&
    definitions.every(d => validText(d.id, 128) && validText(d.label, 80)) ?
    {id, title, help, definitions} : null;

/**
 * Build explicit-choice packs from unambiguous compiled structure. No model
 * load, target fallback, generated-id guess, or mechanical interpretation occurs.
 */
export const roleMeasurementPacks = (session, locale = 'en') => {
    const model = session?.runModel || session?.model;
    const mechanism = session?.mechanism;
    if (!model || !Array.isArray(model.parts) || !mechanism || !Array.isArray(mechanism.bodies) ||
        !Array.isArray(mechanism.joints)) return [];
    const T = words(locale), modelPartIds = new Set(model.parts.map(part => part?.id).filter(validId));
    if (modelPartIds.size !== model.parts.length) return [];
    const partBodyCounts = new Map();
    for (const body of mechanism.bodies) {
        if (!validId(body?.id)) continue;
        for (const partId of sortedUnique(copy(body.parts).filter(id => modelPartIds.has(id)))) {
            const bodies = partBodyCounts.get(partId) || new Set();
            bodies.add(body.id);
            partBodyCounts.set(partId, bodies);
        }
    }
    const packs = [];
    const add = pack => { if (pack) packs.push(pack); };
    const jointsByBinding = new Map(), jointIdCounts = new Map();
    for (const joint of mechanism.joints) {
        if (joint && (joint.type === 'hinge' || joint.type === 'slider') && validId(joint.id)) {
            const key = `${joint.type}\u0000${joint.id}`;
            jointIdCounts.set(key, (jointIdCounts.get(key) || 0) + 1);
        }
    }
    for (const joint of mechanism.joints) {
        if (joint?.type !== 'hinge' && joint?.type !== 'slider') continue;
        if (!validId(joint.id) || jointIdCounts.get(`${joint.type}\u0000${joint.id}`) !== 1) continue;
        const bound = membership(mechanism, modelPartIds, partBodyCounts, joint);
        if (!bound) continue;
        const binding = jointBinding(mechanism, joint);
        const group = jointsByBinding.get(binding) || [];
        group.push({joint, binding, ...bound});
        jointsByBinding.set(binding, group);
    }
    const uniqueJoints = [...jointsByBinding.values()].filter(group => group.length === 1).map(group => group[0])
        .sort((a, b) => a.binding.localeCompare(b.binding));

    // A port identifies one motor role only when exactly one compiled hinge owns it.
    const ports = new Map();
    const portOccurrences = new Map();
    for (const joint of mechanism.joints) {
        const port = joint?.type === 'hinge' ? joint.motor?.port : null;
        if (!validId(port)) continue;
        portOccurrences.set(port, (portOccurrences.get(port) || 0) + 1);
    }
    for (const entry of uniqueJoints) {
        const port = entry.joint.type === 'hinge' ? entry.joint.motor?.port : null;
        if (!validId(port)) continue;
        const group = ports.get(port) || [];
        group.push(entry);
        ports.set(port, group);
    }
    for (const port of [...ports.keys()].sort((a, b) => a.localeCompare(b))) {
        const group = ports.get(port);
        if (group.length !== 1 || portOccurrences.get(port) !== 1) continue;
        const {joint, binding} = group[0], prefix = packId(`role-motor-${sha256Text(port).slice(0, 8)}`, binding);
        add(makePack(prefix, T.motorTitle(port), T.motorHelp, [
            definition(`${prefix}-angle`, 'jointAngle', `${T.motor(port)} · ${T.angle}`, joint, binding),
            definition(`${prefix}-speed`, 'jointSpeed', `${T.motor(port)} · ${T.speed}`, joint, binding),
            definition(`${prefix}-torque`, 'motorTorque', `${T.motor(port)} · ${T.torque}`, joint, binding),
            definition(`${prefix}-power`, 'motorPower', `${T.motor(port)} · ${T.power}`, joint, binding)
        ]));
    }

    const sliders = uniqueJoints.filter(entry => entry.joint.type === 'slider');
    const springSliders = sliders.filter(entry => Boolean(entry.joint.spring));
    for (const {joint, binding, parts} of sliders) {
        const partLabel = parts.join(' / '), prefix = `role-slider-${sha256Text(binding).slice(0, 24)}`;
        const defs = [definition(`${prefix}-travel`, 'travel', `${T.slider(partLabel)} · ${T.travel}`, joint, binding)];
        if (joint.motor) {
            defs.push(definition(`${prefix}-motor-force`, 'motorForce', `${T.slider(partLabel)} · ${T.motorForce}`, joint, binding));
            defs.push(definition(`${prefix}-power`, 'sliderPower', `${T.slider(partLabel)} · ${T.sliderPower}`, joint, binding));
        }
        defs.push(definition(`${prefix}-limit-force`, 'limitForce', `${T.slider(partLabel)} · ${T.limitForce}`, joint, binding));
        add(makePack(prefix, T.sliderTitle(partLabel), T.sliderHelp, defs));
    }
    springSliders.sort((a, b) => a.binding.localeCompare(b.binding));
    if (springSliders.length > 0 && springSliders.length <= MAX_PACK_DEFINITIONS) {
        const definitions = springSliders.map(({joint, binding, parts}) =>
            definition(`role-spring-travel-${sha256Text(binding).slice(0, 24)}`, 'travel', `${T.slider(parts.join(' / '))} · ${T.travel}`, joint, binding));
        add(makePack('role-spring-slider-travel', T.springsTitle, T.springsHelp, definitions));
    }

    const couplings = Array.isArray(mechanism.couplings) ? mechanism.couplings : [];
    const ropeGroups = new Map(), ropeIds = new Map(), ropeMemberships = new Map();
    for (const rope of couplings.filter(item => item?.kind === 'rope' && validId(item.id))) {
        ropeIds.set(rope.id, (ropeIds.get(rope.id) || 0) + 1);
    }
    for (const rope of couplings.filter(item => item?.kind === 'rope')) {
        const parts = sortedUnique(copy(rope.parts));
        if (!validId(rope.id) || parts.length < 2 || parts.length !== rope.parts.length ||
            parts.some(id => !modelPartIds.has(id) || partBodyCounts.get(id)?.size !== 1)) continue;
        const binding = ropeBinding(rope), group = ropeGroups.get(binding) || [];
        group.push({rope, binding, parts});
        ropeGroups.set(binding, group);
        const membershipKey = JSON.stringify(parts);
        const membershipGroup = ropeMemberships.get(membershipKey) || [];
        membershipGroup.push(binding);
        ropeMemberships.set(membershipKey, membershipGroup);
    }
    for (const group of ropeGroups.values()) {
        if (group.length !== 1 || ropeIds.get(group[0].rope.id) !== 1 ||
            ropeMemberships.get(JSON.stringify(group[0].parts))?.length !== 1) continue;
        const {rope, binding, parts} = group[0], prefix = `role-rope-${sha256Text(binding).slice(0, 24)}`;
        add(makePack(prefix, T.ropeTitle(parts.join(' / ')), T.ropeHelp, [
            {id: `${prefix}-tension`, kind: 'tension', label: T.tension, visible: true, rope: rope.id, binding}
        ]));
    }

    // Pressure readings address a part. Expose every unambiguous part/network
    // pairing as its own choice; never pick the first member from a network.
    const pressureByNetwork = new Map();
    for (const coupling of couplings.filter(item => (item?.kind === 'pneumatic' || item?.kind === 'pump') && validId(item.network?.id))) {
        const group = pressureByNetwork.get(coupling.network.id) || [];
        group.push(coupling);
        pressureByNetwork.set(coupling.network.id, group);
    }
    for (const networkId of [...pressureByNetwork.keys()].sort((a, b) => a.localeCompare(b))) {
        const group = pressureByNetwork.get(networkId);
        const couplingIds = group.map(coupling => coupling.id);
        if (couplingIds.some(id => !validId(id)) || new Set(couplingIds).size !== couplingIds.length) continue;
        const candidates = sortedUnique(group.flatMap(coupling => copy(coupling.parts).filter(id => modelPartIds.has(id))));
        for (const target of candidates) {
            if (partBodyCounts.get(target)?.size !== 1) continue;
            const networks = new Set(couplings.filter(item => (item?.kind === 'pneumatic' || item?.kind === 'pump') &&
                item.parts?.includes(target) && validId(item.network?.id)).map(item => item.network.id));
            if (networks.size !== 1 || !networks.has(networkId)) continue;
            const prefix = `role-pressure-${sha256Text(`${networkId}\u0000${target}`).slice(0, 24)}`;
            add(makePack(prefix, T.pressureTitle(target), T.pressureHelp, [
                {id: `${prefix}-pressure`, kind: 'pressure', label: T.pressure, visible: true, targets: [target]}
            ]));
        }
    }

    if (packs.length > MAX_PACKS) return [];
    return packs.sort((a, b) => a.id.localeCompare(b.id));
};
